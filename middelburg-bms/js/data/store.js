/* Store: owns the provider, polling, mode resolution and derived status.
 *
 * Modes:
 *   DEMO       demo provider; persistent banner says values are illustrative.
 *   CONNECTED  only after a real gateway health check has succeeded.
 *   OFFLINE    connected mode was requested but the gateway is not configured
 *              or not reachable. Every reading is Unknown — last-known values
 *              are never presented as current. */
import { APP_CONFIG } from '../config/app-config.js';
import { ZONES, EQUIPMENT, equipmentById, zoneById } from '../config/site.js';
import { getMode, getGatewayUrl, getThresholds, localAudit, appendLocalAudit } from '../config/settings-store.js';
import { ROLE_POINTS, ZONE_SOURCES, ZONE_ROLES, rolesForType, alarmRoles } from '../config/points.js';
import { createDemoProvider } from './demo-provider.js';
import { createConnectedProvider } from './connected-provider.js';
import { normalise, evaluate, worst, missing, isGood } from './quality.js';

const listeners = new Set();
let provider = null;
let pollTimer = null, healthTimer = null;
let polling = false;
let generation = 0;
const firstSeen = new Map(); // derived condition id -> first observed ts (connected mode)
const live = new Map();      // `${kind}:${id}:${role}` -> [[ts, value], ...] collected on each poll
const pending = new Map();   // `${unitId}|${role}` -> { unitId, role, value, since } awaiting read-back confirmation

/** Roles recorded for the live graphs. */
const LIVE_ROLES = { zone: ['temperature', 'humidity'], equipment: ['temperature', 'temperatureSetpoint', 'humidity'] };

export const state = {
  configuredMode: getMode(),
  mode: 'starting',
  gateway: { configured: false, status: 'n/a', message: '', checkedAt: null },
  loading: true,
  lastPollAt: null,
  error: null,
  zones: [],
  equipment: [],
  alarms: [],
  audit: [],
  capabilities: {},
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) { try { fn(state); } catch (e) { console.error(e); } } }

export const getProvider = () => provider;

/* ---- derivation ----------------------------------------------------------- */
const val = (r) => (isGood(r) ? r.value : null);

/**
 * Operating state from the unit's own points (rules to be confirmed on site):
 *   running  supply air fan on
 *   stopped  rooftop: enabled and start command on, fan off;  hybrid: fan trip or no-airflow alarm
 *   standby  fan off otherwise
 *   unknown  fan status not readable
 */
function deriveEquipmentState(type, r) {
  const fan = val(r.fanStatus);
  if (fan == null) return 'unknown';
  if (type === 'hybrid' && (val(r.fanTrip) === true || val(r.noAirflow) === true)) return 'stopped';
  if (fan) return 'running';
  if (type === 'rooftop' && val(r.enable) === true && val(r.startCommand) === true) return 'stopped';
  return 'standby';
}

/** Rooftop: single mode point. Hybrid: three mode flags. */
function deriveMode(type, r) {
  if (type === 'rooftop') return isGood(r.operatingMode) ? r.operatingMode.value : 'unknown';
  const flags = [val(r.coolMode), val(r.heatMode), val(r.fanOnlyMode)];
  if (flags.some((f) => f == null)) return 'unknown';
  if (flags[0]) return 'cooling';
  if (flags[1]) return 'heating';
  if (flags[2]) return 'fan only';
  return 'standby';
}

/** Zone readings come from the unit named in ZONE_SOURCES. */
function buildZones(rawEquipment, now) {
  return ZONES.map((z) => {
    const src = ZONE_SOURCES[z.id];
    const readings = {};
    for (const role of ZONE_ROLES) readings[role] = normalise(rawEquipment?.[src]?.[role], now);
    const limits = getThresholds(z.id);
    const status = {
      temperature: evaluate(readings.temperature, limits.temperature),
      humidity: evaluate(readings.humidity, limits.humidity),
    };
    status.overall = worst([status.temperature.status, status.humidity.status]);
    const ts = [readings.temperature.ts, readings.humidity.ts].filter((t) => t != null);
    return { ...z, sourceUnit: src, readings, limits, status, lastUpdate: ts.length ? Math.max(...ts) : null };
  });
}

function buildEquipment(raw, now, zones) {
  return EQUIPMENT.map((e) => {
    const readings = {};
    for (const role of rolesForType(e.type)) readings[role] = normalise(raw?.[e.id]?.[role], now);
    const opState = deriveEquipmentState(e.type, readings);
    const mode = deriveMode(e.type, readings);
    const faults = alarmRoles(e.type).filter((role) => val(readings[role]) === true).map((role) => ({ role, label: ROLE_POINTS[role].label, severity: ROLE_POINTS[role].severity }));
    const zone = zones.find((z) => z.id === e.zoneId);
    const tsList = Object.values(readings).map((r) => r.ts).filter((t) => t != null);
    return { ...e, zoneName: zone?.name, readings, opState, mode, faults, lastUpdate: tsList.length ? Math.max(...tsList) : null };
  });
}

function resolveThreshold(a, zones) {
  if (!a.threshold?.key || !a.zoneId) return a.threshold?.text ? { ...a.threshold } : null;
  const z = zones.find((x) => x.id === a.zoneId);
  const lim = z?.limits?.[a.threshold.role];
  const unit = a.threshold.role === 'humidity' ? '%RH' : '°C';
  return { ...a.threshold, value: lim?.[a.threshold.key], unit, text: `${lim?.[a.threshold.key] ?? '—'} ${unit}` };
}

function currentReadingFor(a, zones, equipment) {
  if (a.role && a.source?.type === 'zone') return zones.find((z) => z.id === a.zoneId)?.readings[a.role] || null;
  if (a.role && a.source?.type === 'equipment') return equipment.find((e) => e.id === a.source.id)?.readings[a.role] || null;
  return null;
}

/** Live conditions derived in the browser when no alarm service exists (connected / offline). */
function derivedConditions(zones, equipment, now) {
  const out = [];
  const add = (id, rec) => {
    if (!firstSeen.has(id)) firstSeen.set(id, now);
    out.push({ id, status: 'active', derived: true, raisedAt: firstSeen.get(id), notifications: [], ...rec });
  };
  if (state.mode === 'offline') {
    add('LIVE-gateway', {
      severity: 'warning', category: 'communication', source: { type: 'system', id: 'gateway', name: 'BMS gateway' }, zoneId: null, role: null,
      description: state.gateway.configured ? 'Communication interruption — gateway not reachable' : 'BMS gateway not configured — no site data',
      threshold: null, details: state.gateway.message,
    });
  }
  for (const z of zones) {
    for (const role of ['temperature', 'humidity']) {
      const s = z.status[role];
      const id = `LIVE-${z.id}-${role}`;
      if (s.status === 'warning' || s.status === 'critical') {
        add(id, {
          severity: s.status, category: 'threshold', source: { type: 'zone', id: z.id, name: z.name }, zoneId: z.id, role,
          description: `${role === 'temperature' ? 'Space temperature' : 'Relative humidity'} ${s.reason.toLowerCase()}`,
          threshold: { label: s.side === 'high' ? 'Upper limit' : 'Lower limit', text: `${s.limit} ${role === 'temperature' ? '°C' : '%RH'}` },
          details: 'Condition evaluated in this browser against the configured limits.',
        });
      } else firstSeen.delete(id);
    }
  }
  // Communication watchdog: a unit whose mapped readings are all stale / bad while the gateway is up.
  if (state.mode === 'connected') {
    for (const e of equipment) {
      const id = `LIVE-${e.id}-comms`;
      const mapped = Object.values(e.readings);
      if (mapped.length && mapped.every((r) => !isGood(r))) {
        add(id, {
          severity: 'warning', category: 'communication', source: { type: 'equipment', id: e.id, name: `${e.id} · ${e.name}` }, zoneId: e.zoneId, role: null,
          description: `Communication interruption — no current readings from ${e.id}`, threshold: { label: 'Stale after', text: `${APP_CONFIG.staleAfterMs / 60000} min without update` },
          details: 'Communication watchdog: every mapped point on this unit is stale, missing or bad.',
        });
      } else firstSeen.delete(id);
    }
  }
  for (const e of equipment) {
    const id = `LIVE-${e.id}-stopped`;
    if (e.opState === 'stopped' && e.type === 'rooftop') {
      add(id, {
        severity: 'critical', category: 'equipment', source: { type: 'equipment', id: e.id, name: `${e.id} · ${e.name}` }, zoneId: e.zoneId, role: 'fanStatus',
        description: 'Supply air fan off while unit enabled and started', threshold: { label: 'Expected', text: 'Fan running when enabled and started' },
        details: 'Condition evaluated in this browser from the enable, start command and supply fan points.',
      });
    } else firstSeen.delete(id);
    // Fault points reported by the unit itself.
    for (const role of alarmRoles(e.type)) {
      const fid = `LIVE-${e.id}-${role}`;
      if (val(e.readings[role]) === true) {
        add(fid, {
          severity: ROLE_POINTS[role].severity, category: 'equipment', source: { type: 'equipment', id: e.id, name: `${e.id} · ${e.name}` }, zoneId: e.zoneId, role,
          description: ROLE_POINTS[role].label, threshold: { label: 'Expected', text: 'Not in alarm' },
          details: 'Reported by the unit\'s alarm point. Shown as an active condition; no acknowledgement service is configured.',
        });
      } else firstSeen.delete(fid);
    }
  }
  return out;
}

function apply(snapshot, now = Date.now()) {
  const zones = buildZones(snapshot?.equipment, now);
  const equipment = buildEquipment(snapshot?.equipment, now, zones);
  let alarms = (snapshot?.alarms || []).slice();
  if (state.mode !== 'demo') alarms = derivedConditions(zones, equipment, now);
  alarms = alarms.map((a) => ({
    ...a,
    zoneName: a.zoneId ? zoneById(a.zoneId)?.name : null,
    currentReading: currentReadingFor(a, zones, equipment),
    thresholdResolved: resolveThreshold(a, zones),
  }));
  for (const e of equipment) {
    const open = alarms.filter((a) => a.status !== 'cleared' && (a.source?.id === e.id));
    e.alarmStatus = open.length ? worst(open.map((a) => a.severity)) : (e.opState === 'unknown' ? 'unknown' : 'normal');
    e.openAlarms = open.length;
  }
  recordLive(zones, equipment, now);
  checkPending(equipment, now);
  for (const e of equipment) { e.pending = pending.get(`${e.id}|enable`) || null; e.pendingSetpoint = pending.get(`${e.id}|temperatureSetpoint`) || null; }
  const local = localAudit().map((x) => ({ ...x, demo: false }));
  state.zones = zones;
  state.equipment = equipment;
  state.alarms = alarms;
  state.audit = [...(snapshot?.audit || []), ...local].sort((a, b) => b.ts - a.ts);
  state.lastPollAt = now;
  state.loading = false;
}

/* ---- live buffer ---------------------------------------------------------- */
function pushLive(key, r, now) {
  if (!isGood(r) || typeof r.value !== 'number') return;
  const arr = live.get(key) || [];
  if (!arr.length || arr[arr.length - 1][0] < r.ts) arr.push([r.ts, r.value]);
  while (arr.length && arr[0][0] < now - APP_CONFIG.live.keepMs) arr.shift();
  live.set(key, arr);
}
function recordLive(zones, equipment, now) {
  for (const z of zones) for (const role of LIVE_ROLES.zone) pushLive(`zone:${z.id}:${role}`, z.readings[role], now);
  for (const e of equipment) for (const role of LIVE_ROLES.equipment) pushLive(`equipment:${e.id}:${role}`, e.readings[role], now);
}
/** Live series collected in this browser since the page opened (plus demo seed). */
export function getLive(kind, id, role, from = 0) {
  return (live.get(`${kind}:${id}:${role}`) || []).filter((p) => p[0] >= from);
}
export const liveSince = () => {
  let min = null;
  for (const arr of live.values()) if (arr.length && (min == null || arr[0][0] < min)) min = arr[0][0];
  return min;
};
async function seedLiveFromDemo(gen) {
  // Demo only: pre-fill the last hour so the live graph is not empty on load. Labelled illustrative.
  const now = Date.now(), from = now - APP_CONFIG.live.windowMs, step = 30e3;
  for (const metric of LIVE_ROLES.zone) {
    const data = await provider.history({ metric, zoneIds: ZONES.map((z) => z.id), from, to: now, stepMs: step });
    if (gen !== generation) return;
    for (const d of data) live.set(`zone:${d.zoneId}:${metric}`, d.points.filter((p) => p[1] != null));
  }
  for (const e of EQUIPMENT) for (const role of ['temperature', 'temperatureSetpoint']) {
    live.set(`equipment:${e.id}:${role}`, (await provider.unitHistory({ unitId: e.id, role, from, to: now, stepMs: step })).filter((p) => p[1] != null));
  }
}

/* ---- controls ------------------------------------------------------------- */
export function controlsAvailable() {
  const c = APP_CONFIG.controls;
  if (!c.enabled) return { ok: false, reason: c.lockedReason };
  if (state.mode === 'offline') return { ok: false, reason: 'No gateway connection' };
  if (!provider?.capabilities.control) return { ok: false, reason: 'Control not supported by the data source' };
  return { ok: true, reason: state.mode === 'demo' ? 'Demonstration — no equipment is affected' : '' };
}

/** Switch a unit on (true) or off (false). Confirmed only when the unit reads back the new state. */
export async function commandUnit(unitId, value, note = '') {
  const avail = controlsAvailable();
  if (!avail.ok) throw new Error(avail.reason);
  await provider.command(unitId, 'enable', value);
  pending.set(`${unitId}|enable`, { unitId, role: 'enable', value, since: Date.now() });
  appendLocalAudit({ type: 'control', source: `${unitId}`, actor: APP_CONFIG.operatorName, description: `Command sent: switch ${value ? 'ON' : 'OFF'}${state.mode === 'demo' ? ' (demo)' : ''}${note ? '. Note: ' + note : ''}` });
  refresh();
}
export async function releaseUnit(unitId) {
  const avail = controlsAvailable();
  if (!avail.ok) throw new Error(avail.reason);
  if (!APP_CONFIG.controls.releaseSupported && state.mode !== 'demo') throw new Error('Return to auto not configured');
  await provider.release(unitId);
  pending.delete(`${unitId}|enable`);
  pending.delete(`${unitId}|temperatureSetpoint`);
  appendLocalAudit({ type: 'control', source: unitId, actor: APP_CONFIG.operatorName, description: `Returned to automatic control${state.mode === 'demo' ? ' (demo)' : ''}` });
  refresh();
}
/** Permitted setpoint range for a unit: its zone's setpoint adjustment limits. */
export function setpointLimits(unitId) {
  const eq = equipmentById(unitId);
  const t = eq && getThresholds(eq.zoneId)?.temperature;
  return { min: t?.setpointMin ?? null, max: t?.setpointMax ?? null, step: APP_CONFIG.controls.setpointStep };
}

/** Change a unit's temperature setpoint. Confirmed only when the unit reads back the new value. */
export async function commandSetpoint(unitId, value, note = '') {
  const avail = controlsAvailable();
  if (!avail.ok) throw new Error(avail.reason);
  const lim = setpointLimits(unitId);
  if (!isFinite(value)) throw new Error('Enter a setpoint');
  if (lim.min == null || lim.max == null) throw new Error('No permitted setpoint range configured for this zone');
  if (value < lim.min || value > lim.max) throw new Error(`Setpoint must be between ${lim.min} and ${lim.max} °C`);
  await provider.command(unitId, 'temperatureSetpoint', value);
  pending.set(`${unitId}|temperatureSetpoint`, { unitId, role: 'temperatureSetpoint', value, since: Date.now() });
  appendLocalAudit({ type: 'control', source: unitId, actor: APP_CONFIG.operatorName, description: `Setpoint change sent: ${value.toFixed(1)} °C${state.mode === 'demo' ? ' (demo)' : ''}${note ? '. Note: ' + note : ''}` });
  refresh();
}

function checkPending(equipment, now) {
  const demo = state.mode === 'demo' ? ' (demo)' : '';
  for (const [key, p] of pending) {
    const e = equipment.find((x) => x.id === p.unitId);
    const isSp = p.role === 'temperatureSetpoint';
    const r = isSp ? e?.readings.temperatureSetpoint : e?.readings.fanStatus;
    const matches = isGood(r) && r.ts >= p.since && (isSp ? Math.abs(r.value - p.value) < 0.05 : r.value === p.value);
    const what = isSp ? `setpoint ${p.value.toFixed(1)} °C` : `unit ${p.value ? 'running' : 'off'}`;
    if (matches) {
      pending.delete(key);
      appendLocalAudit({ type: 'control', source: p.unitId, actor: 'System', description: `Confirmed by read-back: ${what}${demo}` });
    } else if (now - p.since > APP_CONFIG.controls.confirmTimeoutMs) {
      pending.delete(key);
      appendLocalAudit({ type: 'control', source: p.unitId, actor: 'System', description: `NOT confirmed: unit did not report ${what} within ${APP_CONFIG.controls.confirmTimeoutMs / 1000} s` });
    }
  }
}

function offlineSnapshot(reason) {
  const equipment = {};
  for (const e of EQUIPMENT) { equipment[e.id] = {}; for (const r of rolesForType(e.type)) equipment[e.id][r] = missing(reason); }
  return { equipment, alarms: [], audit: [] };
}

/* ---- lifecycle ------------------------------------------------------------ */
async function poll(gen) {
  if (polling || gen !== generation) return;
  polling = true;
  try {
    if (state.mode === 'offline') {
      apply(offlineSnapshot(state.gateway.configured ? 'Gateway not reachable' : 'Gateway not configured'));
    } else {
      const snap = await provider.snapshot();
      if (gen !== generation) return;
      apply(snap);
    }
    state.error = null;
  } catch (err) {
    state.error = err.message;
    apply(offlineSnapshot(`Read cycle failed: ${err.message}`));
  } finally {
    polling = false;
    if (gen === generation) {
      emit();
      const interval = state.mode === 'demo' ? APP_CONFIG.pollIntervalMs.demo : APP_CONFIG.pollIntervalMs.connected;
      pollTimer = setTimeout(() => poll(gen), interval);
    }
  }
}

async function checkHealth(gen) {
  if (!provider || provider.id !== 'connected') return;
  state.gateway.status = state.gateway.status === 'n/a' ? 'checking' : state.gateway.status;
  const h = await provider.health();
  if (gen !== generation) return;
  const prev = state.mode;
  state.gateway = { configured: true, status: h.ok ? 'healthy' : 'unreachable', message: h.message, checkedAt: h.checkedAt };
  state.mode = h.ok ? 'connected' : 'offline';
  if (prev === 'connected' && state.mode === 'offline') appendLocalAudit({ type: 'communication', source: 'BMS gateway', actor: 'This browser', description: `Communication interruption detected: ${h.message}` });
  if (prev === 'offline' && state.mode === 'connected') appendLocalAudit({ type: 'communication', source: 'BMS gateway', actor: 'This browser', description: 'Communication restored (gateway health check succeeded)' });
  emit();
  healthTimer = setTimeout(() => checkHealth(gen), APP_CONFIG.healthIntervalMs);
}

export async function start() {
  stop();
  const gen = ++generation;
  state.configuredMode = getMode();
  state.loading = true;
  firstSeen.clear();
  live.clear();
  pending.clear();
  if (state.configuredMode === 'demo') {
    provider = createDemoProvider();
    state.mode = 'demo';
    state.gateway = { configured: false, status: 'n/a', message: 'Demonstration mode — no gateway used', checkedAt: null };
    await seedLiveFromDemo(gen);
  } else {
    const url = getGatewayUrl();
    if (!url) {
      provider = null;
      state.mode = 'offline';
      state.gateway = { configured: false, status: 'not-configured', message: 'No gateway URL is configured (Settings → Data source).', checkedAt: Date.now() };
    } else {
      provider = createConnectedProvider(url);
      state.mode = 'offline'; // until the health check succeeds
      state.gateway = { configured: true, status: 'checking', message: 'Checking gateway health…', checkedAt: null };
      emit();
      await checkHealth(gen);
    }
  }
  state.capabilities = provider?.capabilities || { acknowledge: false, history: false, hvacHistory: false, audit: false, notifications: false };
  emit();
  poll(gen);
}

export function stop() {
  generation++;
  clearTimeout(pollTimer); clearTimeout(healthTimer);
  provider?.dispose?.();
  polling = false;
}

/** Re-evaluate statuses after a threshold change without waiting for the next poll. */
export function refresh() { clearTimeout(pollTimer); polling = false; poll(generation); }

export async function acknowledge(alarmId, note) {
  if (state.mode !== 'demo' || !provider?.capabilities.acknowledge) throw new Error('Acknowledgement service not configured');
  await provider.acknowledge(alarmId, { actor: APP_CONFIG.operatorName, note });
  refresh();
}

export const activeAlarms = () => state.alarms.filter((a) => a.status !== 'cleared');
export { equipmentById };
