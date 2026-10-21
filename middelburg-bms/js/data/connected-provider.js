/* CONNECTED PROVIDER — talks to a same-origin BMS gateway (Niagara N4 / JACE
 * behind it). The gateway holds all credentials server-side; this file must
 * never contain credentials or tokens.
 *
 * Gateway contract — PROPOSED, NOT IMPLEMENTED (see README):
 *   GET  {gateway}/health                         -> 200 { "status": "ok", ... }
 *   GET  {gateway}/query/readPoint/<slot path>    -> 200 { "value": <number|bool|string>, "timestamp"?: <ISO|ms>, "status"?: "ok"|"fault"|"stale"|"down" }
 *   PUT  {gateway}/query/writePoint/<slot path>?value=&priority=   (unit enable only, and only when
 *                                                                   APP_CONFIG.controls.enabled is true)
 *   GET  {gateway}/query/history/<slot path>?from=&to=             -> 200 { "points": [[ts, value], ...] }
 *                                                                   (only when APP_CONFIG.services.history is true)
 *
 * Rules carried over from ARC:
 *   - one FIFO queue, one request in flight, per-request timeout
 *   - a failed read NEVER falls back to mock data: it becomes a 'bad' or
 *     'missing' reading and the UI shows Unknown. */
import { APP_CONFIG } from '../config/app-config.js';
import { ZONES, EQUIPMENT } from '../config/site.js';
import { ROLE_POINTS, ZONE_UNITS, EQUIPMENT_UNITS, slotPath, rolesFor } from '../config/points.js';
import { RequestQueue } from './request-queue.js';
import { missing } from './quality.js';

export class NotConfiguredError extends Error {
  constructor(what) { super(`${what} not configured`); this.notConfigured = true; }
}

/** Keeps '/' separators, encodes everything else; ARC-style '$2e' escapes pass through unchanged. */
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

function parseTimestamp(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return isFinite(n) ? n : null;
}

function coerce(role, raw) {
  const def = ROLE_POINTS[role];
  if (raw == null) return null;
  if (def.kind === 'number') {
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    return isFinite(n) ? n : null;
  }
  if (def.kind === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    if (['true', 'on', 'active', '1', 'running', 'enabled', 'occupied'].includes(s)) return true;
    if (['false', 'off', 'inactive', '0', 'stopped', 'disabled', 'unoccupied'].includes(s)) return false;
    return null;
  }
  if (def.kind === 'text') return String(raw);
  if (def.kind === 'enum') {
    if (def.enumMap && raw in def.enumMap) return def.enumMap[raw];
    const s = String(raw).toLowerCase();
    if (s.includes('heat')) return 'heating';
    if (s.includes('cool')) return 'cooling';
    if (s.includes('standby') || s.includes('idle') || s.includes('off')) return 'standby';
    return null;
  }
  return raw;
}

export function createConnectedProvider(gatewayUrl) {
  const queue = new RequestQueue({ timeoutMs: APP_CONFIG.requestTimeoutMs });
  const base = gatewayUrl.replace(/\/+$/, '');
  const paths = APP_CONFIG.gatewayPaths;

  async function readPoint(role, path) {
    let res;
    try {
      res = await queue.fetch(base + paths.readPoint + encodePath(path), { method: 'GET', headers: { Accept: 'application/json' } });
    } catch (err) {
      return { value: null, unit: null, ts: null, quality: 'bad', error: `Read failed: ${err.message}` };
    }
    if (res.status === 404) return missing('Point not found at gateway');
    if (!res.ok) return { value: null, unit: null, ts: null, quality: 'bad', error: `Gateway returned HTTP ${res.status}` };
    let body;
    try { body = await res.json(); } catch { return { value: null, unit: null, ts: null, quality: 'bad', error: 'Unreadable response' }; }
    const raw = body && typeof body === 'object' ? (body.value ?? body.out?.value ?? null) : body;
    const value = coerce(role, raw);
    if (value == null) return missing('No usable value in response');
    const status = String(body?.status ?? 'ok').toLowerCase();
    const quality = ['ok', 'good', '{ok}'].includes(status) ? 'good' : status.includes('stale') ? 'stale' : 'bad';
    // Without a source timestamp the receive time is used; staleness then reflects gateway freshness only.
    const ts = parseTimestamp(body?.timestamp) ?? Date.now();
    return { value, unit: ROLE_POINTS[role].unit, ts, quality, error: quality === 'good' ? undefined : `Point status: ${status}` };
  }

  const unitPath = (unitId, role) => slotPath(EQUIPMENT_UNITS[unitId], role);

  async function readHistory(path, from, to) {
    if (!APP_CONFIG.services.history) throw new NotConfiguredError('Historian');
    if (!path) return [];
    const res = await queue.fetch(`${base}${paths.history}${encodePath(path)}?from=${from}&to=${to}`, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`History request returned HTTP ${res.status}`);
    const body = await res.json();
    return (body.points || []).map(([t, v]) => [parseTimestamp(t), typeof v === 'number' ? v : parseFloat(v)]).filter(([t]) => t != null);
  }

  return {
    id: 'connected',
    capabilities: {
      acknowledge: false, history: !!APP_CONFIG.services.history, hvacHistory: false, unitHistory: !!APP_CONFIG.services.history,
      audit: false, notifications: false, control: true,
    },

    async health() {
      const checkedAt = Date.now();
      try {
        const res = await queue.fetch(base + paths.health, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) return { ok: false, message: `Gateway health check returned HTTP ${res.status}`, checkedAt };
        const body = await res.json().catch(() => null);
        const ok = body && String(body.status).toLowerCase() === 'ok';
        return { ok, message: ok ? 'Gateway health check succeeded' : 'Gateway health check did not report status "ok"', checkedAt };
      } catch (err) {
        return { ok: false, message: `Gateway unreachable: ${err.message}`, checkedAt };
      }
    },

    async snapshot() {
      // De-duplicate: zone and equipment may share a point (e.g. space temperature).
      const cache = new Map();
      const read = (role, path) => {
        if (!path) return Promise.resolve(missing('Role not mapped'));
        if (!cache.has(path)) cache.set(path, readPoint(role, path));
        return cache.get(path);
      };
      const zones = {}, equipment = {};
      for (const z of ZONES) {
        zones[z.id] = {};
        for (const role of rolesFor('zone')) zones[z.id][role] = await read(role, slotPath(ZONE_UNITS[z.id], role));
      }
      for (const e of EQUIPMENT) {
        equipment[e.id] = {};
        for (const role of rolesFor('equipment', e.type)) equipment[e.id][role] = await read(role, slotPath(EQUIPMENT_UNITS[e.id], role));
      }
      return { ts: Date.now(), zones, equipment, alarms: [], audit: [] };
    },

    async history({ metric, zoneIds, from, to }) {
      const out = [];
      for (const zoneId of zoneIds) out.push({ zoneId, points: await readHistory(slotPath(ZONE_UNITS[zoneId], metric), from, to) });
      return out;
    },
    async unitHistory({ unitId, role, from, to }) { return readHistory(unitPath(unitId, role), from, to); },
    async hvacHistory() { throw new NotConfiguredError('Historian'); },
    async acknowledge() { throw new NotConfiguredError('Acknowledgement service'); },

    /** Unit command (enable on/off). Refused unless controls are enabled AND the role is marked writable. */
    async command(unitId, role, value) {
      const c = APP_CONFIG.controls;
      if (!c.enabled || !ROLE_POINTS[role]?.writable) throw new NotConfiguredError('Unit control');
      const path = unitPath(unitId, role);
      if (!path) throw new Error('Control point not mapped');
      const priority = ROLE_POINTS[role].writePriority ?? c.writePriority;
      if (priority == null) throw new Error('Write priority not configured');
      const res = await queue.fetch(`${base}${paths.writePoint}${encodePath(path)}?value=${encodeURIComponent(value)}&priority=${priority}`, { method: 'PUT' });
      if (!res.ok) throw new Error(`Gateway refused the command (HTTP ${res.status})`);
      return { accepted: true };
    },
    async release() { throw new NotConfiguredError('Return to auto'); },
    dispose() { queue.clear('Provider disposed'); },
  };
}
