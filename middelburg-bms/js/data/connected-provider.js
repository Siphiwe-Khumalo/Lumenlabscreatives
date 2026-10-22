/* CONNECTED PROVIDER — talks to a same-origin BMS gateway (Niagara N4 / JACE
 * behind it). The gateway holds all credentials server-side; this file must
 * never contain credentials or tokens.
 *
 * Gateway contract (proposed; see README):
 *   GET  {gateway}/health                       -> 200 { "status": "ok" }
 *   GET  {gateway}/query/readPoint/<slot path>  -> 200 {
 *          "value": <number|bool|string>,
 *          "status"?: Niagara status, e.g. "{ok}", "{fault}", "{down}", "{disabled}", "{stale}", "{overridden}",
 *          "timestamp"?: <ISO|ms>  (source time; otherwise the read time is used),
 *          "activeLevel"?: <1..17> (priority currently driving a writable point),
 *          "overrideSource"?: <text> (who is driving it, if known) }
 *        404 -> point not found (NOT MAPPED)
 *   PUT  {gateway}/query/writePoint/<slot path>?value=&priority=
 *   GET  {gateway}/query/history/<slot path>?from=&to=   -> 200 { "points": [[ts, value, status], ...] }
 *        (only when APP_CONFIG.services.history is true; status per sample keeps outages visible)
 *
 * Rules:
 *   - one FIFO queue, one request in flight, per-request timeout (the JACE cannot take concurrent requests)
 *   - a failed read NEVER falls back to other data: it becomes OFFLINE / NOT MAPPED and is not displayed
 *   - if every read in a cycle fails at network level, the cycle throws ConnectionLostError */
import { APP_CONFIG } from '../config/app-config.js';
import { EQUIPMENT } from '../config/site.js';
import { ROLE_POINTS, slotPath, rolesForType } from '../config/points.js';
import { RequestQueue } from './request-queue.js';
import { notMapped, QUALITY } from './quality.js';

export class ConnectionLostError extends Error {
  constructor(msg) { super(msg); this.connectionLost = true; }
}
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
    if (s.includes('fan')) return 'fan only';
    return `Mode ${String(raw)}`; // unmapped state: shown as reported until enumMap is filled in
  }
  return raw;
}

export function createConnectedProvider(gatewayUrl) {
  const queue = new RequestQueue({ timeoutMs: APP_CONFIG.requestTimeoutMs });
  const base = gatewayUrl.replace(/\/+$/, '');
  const paths = APP_CONFIG.gatewayPaths;

  const offline = (error, comms = false) => ({ value: null, unit: null, ts: null, quality: QUALITY.OFFLINE, error, comms });

  /** Maps a Niagara status string to a quality. */
  function qualityOf(status) {
    const s = String(status ?? 'ok').toLowerCase();
    if (/fault|down|disabled|null|unackedalarm.*fault/.test(s)) return QUALITY.OFFLINE;
    if (/stale/.test(s)) return QUALITY.STALE;
    return QUALITY.LIVE; // ok, overridden, alarm (value is still valid)
  }

  async function readPoint(role, path) {
    let res;
    try {
      res = await queue.fetch(base + paths.readPoint + encodePath(path), { method: 'GET', headers: { Accept: 'application/json' } });
    } catch (err) {
      return offline(`Read failed: ${err.message}`, true);
    }
    if (res.status === 404) return notMapped('Point not found on the JACE');
    if (!res.ok) return offline(`Gateway returned HTTP ${res.status}`, res.status >= 502);
    let body;
    try { body = await res.json(); } catch { return offline('Unreadable response from gateway'); }
    const raw = body && typeof body === 'object' ? (body.value ?? body.out?.value ?? null) : body;
    const status = body && typeof body === 'object' ? body.status : undefined;
    const quality = qualityOf(status);
    if (quality !== QUALITY.LIVE) return { value: null, unit: ROLE_POINTS[role].unit, ts: null, quality, error: `JACE reports status ${status}` };
    const value = coerce(role, raw);
    if (value == null) return offline('No usable value in response');
    // Read time unless the gateway supplies the source timestamp.
    const ts = parseTimestamp(body?.timestamp) ?? Date.now();
    // Override: the point is driven by another source or a higher priority than ours.
    let override = null;
    const lvl = Number(body?.activeLevel);
    const ours = ROLE_POINTS[role]?.writePriority ?? APP_CONFIG.controls.writePriority;
    if (/overrid/.test(String(status).toLowerCase())) override = { source: body?.overrideSource || 'operator override on the JACE' };
    else if (ROLE_POINTS[role]?.controllable && isFinite(lvl) && ours != null && lvl < ours) override = { source: body?.overrideSource || `priority ${lvl}` };
    return { value, unit: ROLE_POINTS[role].unit, ts, quality: QUALITY.LIVE, override };
  }

  const unitPath = (unitId, role) => slotPath(unitId, role);

  async function readHistory(path, from, to) {
    if (!APP_CONFIG.services.history) throw new NotConfiguredError('Historian');
    if (!path) return [];
    const res = await queue.fetch(`${base}${paths.history}${encodePath(path)}?from=${from}&to=${to}`, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`History request returned HTTP ${res.status}`);
    const body = await res.json();
    // Each sample keeps its status, so past outages are shown, never bridged.
    return (body.points || []).map(([t, v, st]) => {
      const ts = parseTimestamp(t);
      const q = qualityOf(st);
      const n = typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : parseFloat(v);
      return [ts, q === QUALITY.LIVE && isFinite(n) ? n : null, q === QUALITY.LIVE && !isFinite(n) ? QUALITY.OFFLINE : q];
    }).filter(([t]) => t != null);
  }

  return {
    id: 'connected',
    capabilities: {
      acknowledge: false, history: !!APP_CONFIG.services.history, audit: false, notifications: false, control: true,
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
        if (!path) return Promise.resolve(notMapped('No point for this reading'));
        if (!cache.has(path)) cache.set(path, readPoint(role, path));
        return cache.get(path);
      };
      // Zone readings are derived by the store from the units in ZONE_SOURCES.
      const equipment = {};
      for (const e of EQUIPMENT) {
        equipment[e.id] = {};
        for (const role of rolesForType(e.type)) equipment[e.id][role] = await read(role, slotPath(e.id, role));
      }
      const all = [...cache.values()];
      const results = await Promise.all(all);
      if (results.length && results.every((r) => r.comms)) throw new ConnectionLostError('No response from the gateway for any point');
      return { ts: Date.now(), equipment, alarms: [], audit: [] };
    },

    /** History for one unit role: [[ts, value|null, quality], ...] */
    async series({ unitId, role, from, to }) { return readHistory(unitPath(unitId, role), from, to); },
    async acknowledge() { throw new NotConfiguredError('Acknowledgement service'); },

    /** Unit command. Refused unless controls are enabled AND the role is controllable for this unit type. */
    async command(unitId, role, value) {
      const c = APP_CONFIG.controls;
      const def = ROLE_POINTS[role];
      const type = EQUIPMENT.find((e) => e.id === unitId)?.type;
      if (!c.enabled || !def?.controllable || (def.controlTypes && !def.controlTypes.includes(type))) throw new NotConfiguredError('Unit control');
      const path = unitPath(unitId, role);
      if (!path) throw new Error('Control point not mapped');
      const priority = def.writePriority ?? c.writePriority;
      if (priority == null) throw new Error('Write priority not configured');
      const res = await queue.fetch(`${base}${paths.writePoint}${encodePath(path)}?value=${encodeURIComponent(value)}&priority=${priority}`, { method: 'PUT' });
      if (!res.ok) throw new Error(`Gateway refused the command (HTTP ${res.status})`);
      return { accepted: true };
    },
    async release() { throw new NotConfiguredError('Return to auto'); },
    dispose() { queue.clear('Provider disposed'); },
  };
}
