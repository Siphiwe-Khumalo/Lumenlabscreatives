/* Store: owns the data source, polling, quality rules, history recording,
 * derived equipment state and commands.
 *
 * DATA HONESTY (see AUDIT.md):
 *   - only LIVE readings carry a value; every other state carries value null
 *   - JACE connection lost -> every reading becomes STALE (last good kept separately)
 *   - history samples are stored with their quality, so outages stay visible
 *   - commands are PENDING until the feedback point confirms, then CONFIRMED or NOT CONFIRMED */
import { APP_CONFIG } from '../config/app-config.js';
import { ZONES, EQUIPMENT, equipmentById, zoneById } from '../config/site.js';
import { getMode, getGatewayUrl, getThresholds, localAudit, appendLocalAudit, getUser, saveUser, getDemoScenario, ROLES } from '../config/settings-store.js';
import { ROLE_POINTS, ZONE_SOURCES, ZONE_ROLES, rolesForType, alarmRoles, slotPath } from '../config/points.js';
import { CONTROL_DEFS } from '../config/controls.js';
import { createDemoProvider } from './demo-provider.js';
import { createConnectedProvider } from './connected-provider.js';
import { normalise, evaluate, worst, isGood, notMapped, QUALITY, QUALITY_LABEL, QUALITY_CODE, QUALITY_FROM_CODE } from './quality.js';
import { readJSON, writeJSON } from '../util/storage.js';

const listeners = new Set();
let provider = null;
let pollTimer = null, healthTimer = null, saveTimer = null;
let polling = false;
let generation = 0;
const firstSeen = new Map();  // derived condition id -> first observed ts
const lastGood = new Map();   // `${unitId}|${role}` -> { value, ts }
const commands = new Map();   // `${unitId}|${controlId}` -> command record
let history = new Map();      // `${unitId}|${role}` -> [[ts, value|null, qualityCode], ...]

/** Roles recorded every poll (history with quality). fault is a derived 0/1 flag. */
const HISTORY_ROLES = ['temperature', 'humidity', 'temperatureSetpoint', 'fanStatus'];
const HISTORY_KEY = 'mbms.history.v2';

export const RANGES = {
  '1h':  { label: '1 h',   ms: 3600e3,        stepMs: 30e3 },
  '24h': { label: '24 h',  ms: 24 * 3600e3,   stepMs: 5 * 60e3 },
  '7d':  { label: '7 d',   ms: 7 * 864e5,     stepMs: 30 * 60e3 },
  '30d': { label: '30 d',  ms: 30 * 864e5,    stepMs: 3 * 3600e3 },
};

export const state = {
  configuredMode: getMode(),
  mode: 'starting',               // 'demo' | 'connected' | 'offline' | 'starting'
  scenario: null,                 // demo scenario
  connection: { status: 'checking', message: 'Connecting…', since: null, lastOkAt: null },
  user: getUser(),
  loading: true,
  lastPollAt: null,
  cycleMs: 0,
  staleMs: 0,
  zones: [],
  equipment: [],
  alarms: [],
  audit: [],
  capabilities: {},
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) { try { fn(state); } catch (e) { console.error(e); } } }
export const getProvider = () => provider;
export const connectionOk = () => state.connection.status === 'ok';

/* ---- user / role --------------------------------------------------------------- */
export function setUser(user) {
  const prev = state.user;
  if (!(user.role in ROLES)) return;
  saveUser(user);
  state.user = getUser();
  if (prev.role !== state.user.role || prev.name !== state.user.name) {
    appendLocalAudit({ type: 'session', source: 'Dashboard', actor: state.user.name, role: state.user.role, description: `User set to ${state.user.name} (${state.user.role})` });
  }
  refreshView();
}
export const canOperate = () => state.user.role === 'operator' || state.user.role === 'admin';
export const isAdmin = () => state.user.role === 'admin';

/* ---- stale period ----------------------------------------------------------------- */
function pollInterval() { return state.mode === 'demo' ? APP_CONFIG.pollIntervalMs.demo : APP_CONFIG.pollIntervalMs.connected; }
function computeStaleMs() { return APP_CONFIG.stale.factor * (pollInterval() + state.cycleMs); }

/* ---- derivation ------------------------------------------------------------------- */
const val = (r) => (isGood(r) ? r.value : null);

/**
 * Run state from the unit's own points:
 *   running  supply air fan on
 *   fault    hybrid: fan trip or no-airflow alarm with the fan off;
 *            rooftop: unit alarm with the fan off
 *            (TODO(confirm): a started rooftop unit with its fan off may be cycling on its thermostat,
 *             so it is shown as STOPPED, not FAULT, until the site confirms the expected behaviour)
 *   stopped  fan off otherwise
 *   unknown  fan status not LIVE
 */
function deriveRunState(type, r) {
  const fan = val(r.fanStatus);
  if (fan == null) return 'unknown';
  if (fan) return 'running';
  if (type === 'hybrid' && (val(r.fanTrip) === true || val(r.noAirflow) === true)) return 'fault';
  if (type === 'rooftop' && val(r.unitAlarm) === true) return 'fault';
  return 'stopped';
}

function deriveMode(type, r) {
  if (type === 'rooftop') return isGood(r.operatingMode) ? r.operatingMode.value : 'unknown';
  const flags = [val(r.coolMode), val(r.heatMode), val(r.fanOnlyMode)];
  if (flags.some((f) => f == null)) return 'unknown';
  if (flags[0]) return 'cooling';
  if (flags[1]) return 'heating';
  if (flags[2]) return 'fan only';
  return 'standby';
}

/** Turns a raw provider reading into a displayed reading (quality rules + last good). */
function finalise(unitId, role, raw, now) {
  const key = `${unitId}|${role}`;
  let r;
  if (!connectionOk()) {
    r = { value: null, unit: ROLE_POINTS[role]?.unit ?? null, ts: null, quality: QUALITY.STALE,
      error: state.connection.status === 'not-configured' ? 'Not connected to the JACE (gateway not configured)' : 'JACE connection lost' };
  } else {
    r = normalise(raw, role, state.staleMs, now);
  }
  if (r.quality === QUALITY.LIVE) lastGood.set(key, { value: r.value, ts: r.ts });
  else r.lastGood = raw?.lastGood || lastGood.get(key) || null;
  return r;
}

function buildEquipment(raw, now) {
  return EQUIPMENT.map((e) => {
    const readings = {};
    for (const role of rolesForType(e.type)) readings[role] = finalise(e.id, role, raw?.[e.id]?.[role], now);
    const runState = deriveRunState(e.type, readings);
    const mode = deriveMode(e.type, readings);
    const faults = alarmRoles(e.type).filter((role) => val(readings[role]) === true).map((role) => ({ role, label: ROLE_POINTS[role].label, severity: ROLE_POINTS[role].severity }));
    const zone = zoneById(e.zoneId);
    const tsList = Object.values(readings).map((r) => r.ts).filter((t) => t != null);
    const offline = Object.values(readings).filter((r) => r.quality === QUALITY.OFFLINE).length;
    return { ...e, zoneName: zone?.name, readings, runState, opState: runState, mode, faults, offlinePoints: offline, lastUpdate: tsList.length ? Math.max(...tsList) : null };
  });
}

/** Zone readings are the readings of the unit named in ZONE_SOURCES. */
function buildZones(equipment) {
  return ZONES.map((z) => {
    const src = equipment.find((e) => e.id === ZONE_SOURCES[z.id]);
    const readings = {};
    for (const role of ZONE_ROLES) readings[role] = src?.readings[role] || notMapped();
    const limits = getThresholds(z.id);
    const status = { temperature: evaluate(readings.temperature, limits.temperature), humidity: evaluate(readings.humidity, limits.humidity) };
    status.overall = worst([status.temperature.status, status.humidity.status]);
    const ts = [readings.temperature.ts, readings.humidity.ts].filter((t) => t != null);
    return { ...z, sourceUnit: src?.id, readings, limits, status, lastUpdate: ts.length ? Math.max(...ts) : null };
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

/** Conditions derived in the browser (connected mode has no alarm service). */
function derivedConditions(zones, equipment, now) {
  const out = [];
  const add = (id, rec) => {
    if (!firstSeen.has(id)) firstSeen.set(id, now);
    out.push({ id, status: 'active', derived: true, raisedAt: firstSeen.get(id), notifications: [], ...rec });
  };
  if (!connectionOk()) {
    add('LIVE-gateway', {
      severity: 'critical', category: 'communication', source: { type: 'system', id: 'gateway', name: 'JACE connection' }, zoneId: null, role: null,
      description: state.connection.status === 'not-configured' ? 'Not connected to the JACE — gateway not configured' : 'JACE connection lost — readings are not live',
      threshold: null, details: state.connection.message,
    });
    return out;
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
  for (const e of equipment) {
    const name = `${e.id} · ${e.name}`;
    const commsId = `LIVE-${e.id}-comms`;
    const vals = Object.values(e.readings).filter((r) => r.quality !== QUALITY.NOT_MAPPED);
    if (vals.length && vals.every((r) => r.quality === QUALITY.OFFLINE || r.quality === QUALITY.STALE)) {
      add(commsId, {
        severity: 'warning', category: 'communication', source: { type: 'equipment', id: e.id, name }, zoneId: e.zoneId, role: null,
        description: `Communication interruption — no live readings from ${e.id}`, threshold: { label: 'Stale after', text: `${Math.round(state.staleMs / 1000)} s without update` },
        details: 'Every point on this unit is OFFLINE or STALE.',
      });
    } else firstSeen.delete(commsId);
    const fid = `LIVE-${e.id}-fault`;
    if (e.runState === 'fault') {
      add(fid, {
        severity: 'critical', category: 'equipment', source: { type: 'equipment', id: e.id, name }, zoneId: e.zoneId, role: 'fanStatus',
        description: e.type === 'rooftop' ? 'Unit alarm with supply fan off' : 'Supply fan tripped / no airflow', threshold: { label: 'Expected', text: 'Fan running' },
        details: 'Evaluated in this browser from the unit\'s fan, start command and alarm points.',
      });
    } else firstSeen.delete(fid);
    for (const role of alarmRoles(e.type)) {
      const aid = `LIVE-${e.id}-${role}`;
      if (val(e.readings[role]) === true) {
        add(aid, {
          severity: ROLE_POINTS[role].severity, category: 'equipment', source: { type: 'equipment', id: e.id, name }, zoneId: e.zoneId, role,
          description: ROLE_POINTS[role].label, threshold: { label: 'Expected', text: 'Not in alarm' },
          details: 'Reported by the unit\'s alarm point.',
        });
      } else firstSeen.delete(aid);
    }
  }
  return out;
}

/* ---- history (with quality) ----------------------------------------------------------- */
function record(equipment, now) {
  for (const e of equipment) {
    for (const role of HISTORY_ROLES) {
      const r = e.readings[role];
      if (!r) continue;
      const v = r.quality === QUALITY.LIVE ? (typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value) : null;
      push(`${e.id}|${role}`, [now, v, QUALITY_CODE[r.quality]]);
    }
    // Run state per poll (for the run-state strip).
    push(`${e.id}|runState`, [now, null, e.runState]);
  }
  if (state.mode !== 'demo') scheduleSave();
}
function push(key, sample) {
  const arr = history.get(key) || [];
  arr.push(sample);
  const cutoff = sample[0] - APP_CONFIG.live.keepMs;
  while (arr.length && arr[0][0] < cutoff) arr.shift();
  history.set(key, arr);
}
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; writeJSON(HISTORY_KEY, { savedAt: Date.now(), data: [...history.entries()] }); }, 30e3);
}
function loadSaved() {
  history = new Map();
  if (state.mode === 'demo') return;
  const saved = readJSON(HISTORY_KEY, null);
  if (!saved?.data) return;
  const cutoff = Date.now() - APP_CONFIG.live.keepMs;
  for (const [k, arr] of saved.data) history.set(k, arr.filter((p) => p[0] >= cutoff));
}

/**
 * Inserts explicit breaks where no sample was recorded for longer than the stale
 * period (dashboard closed), so the chart never bridges a gap.
 */
function withBreaks(points, maxGap) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i && points[i][0] - points[i - 1][0] > maxGap) out.push([points[i - 1][0] + 1, null, 'gap']);
    out.push(points[i]);
  }
  return out;
}

export class NotConfigured extends Error { constructor(m) { super(m); this.notConfigured = true; } }

/**
 * Trend data for a unit role: { points: [[ts, value|null, quality]], from, to, source }.
 * quality is one of the QUALITY values, or 'gap' (nothing recorded).
 */
export async function getUnitSeries(unitId, role, rangeKey) {
  const r = RANGES[rangeKey];
  const to = Date.now(), from = to - r.ms;
  if (state.mode === 'demo') {
    const pts = await provider.series({ unitId, role, from, to, stepMs: r.stepMs });
    return { points: pts, from, to, source: 'demo' };
  }
  if (rangeKey === '1h' || !provider?.capabilities.history) {
    if (rangeKey !== '1h') throw new NotConfigured('Historian not configured — longer ranges need the gateway history endpoint');
    const raw = (history.get(`${unitId}|${role}`) || []).filter((p) => p[0] >= from).map(([t, v, q]) => [t, v, QUALITY_FROM_CODE[q] || q]);
    return { points: withBreaks(raw, Math.max(state.staleMs, 60e3)), from, to, source: 'browser' };
  }
  return { points: await provider.series({ unitId, role, from, to, stepMs: r.stepMs }), from, to, source: 'historian' };
}
export const getZoneSeries = (zoneId, role, rangeKey) => getUnitSeries(ZONE_SOURCES[zoneId], role, rangeKey);

/** Run-state segments [{ from, to, state }] for the strip under trends. */
export async function getRunSegments(unitId, rangeKey) {
  const r = RANGES[rangeKey];
  const to = Date.now(), from = to - r.ms;
  if (state.mode === 'demo') return { segments: await provider.runSegments({ unitId, from, to }), from, to };
  const raw = (history.get(`${unitId}|runState`) || []).filter((p) => p[0] >= from);
  const segs = [];
  const maxGap = Math.max(state.staleMs, 60e3);
  let cursor = from;
  for (let i = 0; i < raw.length; i++) {
    const [t, , st] = raw[i];
    const end = i + 1 < raw.length && raw[i + 1][0] - t <= maxGap ? raw[i + 1][0] : Math.min(t + pollInterval(), to);
    if (t > cursor) segs.push({ from: cursor, to: t, state: 'unknown' });
    const last = segs[segs.length - 1];
    if (last && last.state === st && last.to >= t) last.to = end;
    else segs.push({ from: t, to: end, state: st });
    cursor = end;
  }
  if (cursor < to) segs.push({ from: cursor, to, state: 'unknown' });
  return { segments: segs, from, to };
}

/* ---- commands ------------------------------------------------------------------------ */
export const controlDefs = (type) => CONTROL_DEFS[type] || [];
const cmdKey = (unitId, controlId) => `${unitId}|${controlId}`;
export const getCommand = (unitId, controlId) => commands.get(cmdKey(unitId, controlId)) || null;

/** Value shown as COMMANDED: the command point's live value (what the controller has been told). */
export function commandedValue(e, def) {
  if (def.kind === 'mode') return e.mode;
  const r = e.readings[def.commandRole];
  return isGood(r) ? r.value : null;
}

/** Whether a control can be operated now, with the reason when not. */
export function controlAvailability(e, def) {
  if (def.kind === 'status') return { ok: false, reason: def.note || 'Read-only' };
  if (!def.commandRole && def.kind !== 'mode') return { ok: false, reason: `NOT MAPPED — ${def.todo || 'no point configured'}`, notMapped: true };
  if (!APP_CONFIG.controls.enabled) return { ok: false, reason: 'Controls are disabled in the configuration' };
  if (!canOperate()) return { ok: false, reason: 'Viewer role — controls are read-only' };
  if (!connectionOk()) return { ok: false, reason: state.connection.status === 'not-configured' ? 'Not connected to the JACE' : 'JACE connection lost' };
  const roles = def.kind === 'mode' ? def.options.map((o) => o.role) : [def.commandRole];
  for (const role of roles) {
    const r = e.readings[role];
    if (!r || r.quality === QUALITY.NOT_MAPPED) return { ok: false, reason: `NOT MAPPED — ${ROLE_POINTS[role]?.label || role} has no point`, notMapped: true };
    if (r.quality !== QUALITY.LIVE) return { ok: false, reason: `${ROLE_POINTS[role].label} is ${QUALITY_LABEL[r.quality]}` };
  }
  if (getCommand(e.id, def.id)?.status === 'pending') return { ok: false, reason: 'Waiting for the controller to confirm the last command' };
  return { ok: true, reason: '' };
}

/** Permitted setpoint range for a unit: its zone's setpoint adjustment limits. */
export function setpointLimits(unitId) {
  const eq = equipmentById(unitId);
  const t = eq && getThresholds(eq.zoneId)?.temperature;
  return { min: t?.setpointMin ?? null, max: t?.setpointMax ?? null, step: APP_CONFIG.controls.setpointStep };
}

const fmt = (def, v) => (v == null ? '—' : def.kind === 'setpoint' ? `${Number(v).toFixed(1)} °C` : def.kind === 'mode' ? String(v) : v === true ? (def.onLabel || 'ON').toUpperCase() : v === false ? (def.offLabel || 'OFF').toUpperCase() : String(v));

function auditCommand(rec, result, extra = '') {
  const demo = state.mode === 'demo' ? ' (simulated)' : '';
  appendLocalAudit({
    type: 'control', source: rec.unitId, actor: rec.by, role: rec.byRole,
    control: rec.label, point: rec.points.join(', '), old: fmt(rec.def, rec.old), new: fmt(rec.def, rec.value), result,
    description: `${rec.label}: ${fmt(rec.def, rec.old)} → ${fmt(rec.def, rec.value)} — ${result}${extra}${demo}${rec.note ? `. Note: ${rec.note}` : ''}`,
  });
}

/**
 * Sends a command. value: boolean (toggle), number (setpoint) or mode string.
 * Validates role, connection, mapping and limits; the record stays PENDING until confirmed.
 */
export async function sendCommand(unitId, controlId, value, note = '') {
  const e = state.equipment.find((x) => x.id === unitId);
  const def = controlDefs(e?.type).find((d) => d.id === controlId);
  if (!e || !def) throw new Error('Unknown control');
  const avail = controlAvailability(e, def);
  if (!avail.ok) throw new Error(avail.reason);
  if (def.kind === 'setpoint') {
    const lim = setpointLimits(unitId);
    if (!isFinite(value)) throw new Error('Choose a setpoint');
    if (lim.min == null || lim.max == null) throw new Error('No permitted setpoint range configured for this zone');
    if (value < lim.min || value > lim.max) throw new Error(`Rejected: setpoint must be between ${lim.min} and ${lim.max} °C`);
  }
  const writes = def.kind === 'mode' ? def.options.map((o) => [o.role, o.value === value]) : [[def.commandRole, value]];
  const rec = {
    unitId, controlId, def, label: `${unitId} ${def.label}`, value, old: commandedValue(e, def), note,
    writes, points: writes.map(([role]) => slotPath(unitId, role)), sentAt: Date.now(), status: 'pending',
    by: state.user.name, byRole: state.user.role, override: def.kind !== 'mode' ? e.readings[def.commandRole]?.override || null : null,
  };
  try {
    for (const [role, v] of writes) await provider.command(unitId, role, v);
  } catch (err) {
    rec.status = 'failed'; rec.error = err.message; rec.resolvedAt = Date.now();
    commands.set(cmdKey(unitId, controlId), rec);
    auditCommand(rec, 'FAILED', ` (${err.message})`);
    refreshView();
    throw err;
  }
  commands.set(cmdKey(unitId, controlId), rec);
  auditCommand(rec, 'SENT');
  refreshView(); // show PENDING immediately
  refresh();     // then read back as soon as possible
  return rec;
}

/** Feedback check: every written point must read back the written value, LIVE, after the command. */
function checkCommands(equipment, now) {
  for (const rec of commands.values()) {
    if (rec.status !== 'pending') continue;
    const e = equipment.find((x) => x.id === rec.unitId);
    const fbRoles = rec.def.kind === 'mode' ? rec.writes : [[rec.def.feedbackRole, rec.value]];
    const ok = fbRoles.every(([role, v]) => {
      const r = e?.readings[role];
      if (!isGood(r) || r.ts < rec.sentAt) return false;
      return typeof v === 'number' ? Math.abs(r.value - v) < 0.05 : r.value === v;
    });
    if (ok) {
      rec.status = 'confirmed'; rec.resolvedAt = now;
      auditCommand(rec, 'CONFIRMED by feedback');
    } else if (now - rec.sentAt > APP_CONFIG.controls.confirmTimeoutMs) {
      rec.status = 'not-confirmed'; rec.resolvedAt = now;
      rec.actual = e ? commandedValue(e, rec.def) : null;
      auditCommand(rec, 'NOT CONFIRMED', ` (actual: ${fmt(rec.def, rec.actual)}${rec.override ? `, overridden by ${rec.override.source}` : ''})`);
    }
  }
}

/* ---- apply a poll -------------------------------------------------------------------- */
function apply(snapshot, { recordHistory = true } = {}) {
  const now = Date.now();
  state.staleMs = computeStaleMs();
  const equipment = buildEquipment(snapshot?.equipment, now);
  const zones = buildZones(equipment);
  let alarms = state.mode === 'demo' && connectionOk() ? (snapshot?.alarms || []).slice() : derivedConditions(zones, equipment, now);
  alarms = alarms.map((a) => ({ ...a, zoneName: a.zoneId ? zoneById(a.zoneId)?.name : null, currentReading: currentReadingFor(a, zones, equipment), thresholdResolved: resolveThreshold(a, zones) }));
  for (const e of equipment) {
    const open = alarms.filter((a) => a.status !== 'cleared' && a.source?.id === e.id);
    e.alarmStatus = open.length ? worst(open.map((a) => a.severity)) : (e.runState === 'unknown' ? 'unknown' : 'normal');
    e.openAlarms = open.length;
  }
  if (recordHistory) record(equipment, now);
  checkCommands(equipment, now);
  state.zones = zones;
  state.equipment = equipment;
  state.alarms = alarms;
  state.audit = [...(snapshot?.audit || []), ...localAudit().map((x) => ({ ...x, demo: false }))].sort((a, b) => b.ts - a.ts);
  state.lastPollAt = now;
  state.loading = false;
  lastSnapshot = snapshot;
}
let lastSnapshot = null;
/** Re-render from the last snapshot (role change, threshold change) without a new read. */
function refreshView() { apply(lastSnapshot, { recordHistory: false }); emit(); }

function setConnection(status, message) {
  const prev = state.connection.status;
  if (prev !== status) {
    state.connection = { status, message, since: Date.now(), lastOkAt: status === 'ok' ? Date.now() : state.connection.lastOkAt };
    if (prev === 'ok' && status === 'lost') appendLocalAudit({ type: 'communication', source: 'JACE', actor: 'System', description: `JACE connection lost: ${message}` });
    if (prev === 'lost' && status === 'ok') appendLocalAudit({ type: 'communication', source: 'JACE', actor: 'System', description: 'JACE connection restored' });
  } else {
    state.connection.message = message;
    if (status === 'ok') state.connection.lastOkAt = Date.now();
  }
  if (state.mode !== 'demo') state.mode = status === 'ok' ? 'connected' : 'offline';
}

/* ---- lifecycle ------------------------------------------------------------------------ */
async function poll(gen) {
  if (polling || gen !== generation) return;
  polling = true;
  const t0 = Date.now();
  try {
    if (!provider) {
      apply(null);
    } else {
      const snap = await provider.snapshot();
      if (gen !== generation) return;
      state.cycleMs = Date.now() - t0;
      setConnection('ok', state.mode === 'demo' ? 'Simulated data' : 'Reading points from the JACE');
      apply(snap);
    }
  } catch (err) {
    if (gen !== generation) return;
    setConnection('lost', err.message);
    apply(null);
  } finally {
    polling = false;
    if (gen === generation) {
      emit();
      pollTimer = setTimeout(() => poll(gen), pollInterval());
    }
  }
}

async function checkHealth(gen) {
  if (!provider) return;
  const h = await provider.health();
  if (gen !== generation) return;
  if (!h.ok) { setConnection('lost', h.message); apply(null); emit(); }
  healthTimer = setTimeout(() => checkHealth(gen), APP_CONFIG.healthIntervalMs);
}

export async function start() {
  stop();
  const gen = ++generation;
  state.configuredMode = getMode();
  state.loading = true;
  firstSeen.clear(); lastGood.clear(); commands.clear();
  state.cycleMs = 0;
  if (state.configuredMode === 'demo') {
    state.scenario = getDemoScenario();
    provider = createDemoProvider(state.scenario);
    state.mode = 'demo';
    state.connection = { status: 'checking', message: 'Starting simulated data', since: Date.now(), lastOkAt: null };
  } else {
    state.scenario = null;
    const url = getGatewayUrl();
    state.mode = 'offline';
    if (!url) {
      provider = null;
      state.connection = { status: 'not-configured', message: 'No gateway URL is configured (Settings → Data source).', since: Date.now(), lastOkAt: null };
    } else {
      provider = createConnectedProvider(url);
      state.connection = { status: 'checking', message: 'Connecting to the JACE…', since: Date.now(), lastOkAt: null };
    }
  }
  loadSaved();
  state.capabilities = provider?.capabilities || { acknowledge: false, history: false, audit: false, notifications: false, control: false };
  emit();
  await poll(gen);
  if (provider) healthTimer = setTimeout(() => checkHealth(gen), APP_CONFIG.healthIntervalMs);
}

export function stop() {
  generation++;
  clearTimeout(pollTimer); clearTimeout(healthTimer);
  provider?.dispose?.();
  polling = false;
}

/** Poll now (after a command or threshold change). */
export function refresh() { clearTimeout(pollTimer); polling = false; poll(generation); }

export async function acknowledge(alarmId, note) {
  if (state.mode !== 'demo' || !provider?.capabilities.acknowledge) throw new Error('Acknowledgement service not configured');
  await provider.acknowledge(alarmId, { actor: state.user.name, note });
  refresh();
}

export const activeAlarms = () => state.alarms.filter((a) => a.status !== 'cleared');
export { equipmentById, QUALITY };
