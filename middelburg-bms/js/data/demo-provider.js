/* DEMO PROVIDER — used ONLY when the DEMO flag is on.
 * Every value here is SIMULATED in the browser and is not site telemetry.
 * The UI shows a permanent "SIMULATED DATA" banner whenever this provider runs.
 *
 * Scenarios (Settings, or ?scenario= for testing):
 *   normal      RTU-01 space-temperature sensor offline for 50 min in the history,
 *               RTU-04 communication lost 47 min ago (all its points OFFLINE),
 *               HYB-03 switched off at the BMS 35 min ago (fan stopped),
 *               RTU-02 setpoint overridden at priority 5 (commands will not take effect)
 *   all-live    every point live, every unit running
 *   comms-lost  the JACE connection is lost (every read fails)
 *   no-confirm  commands are accepted but the controller never changes (feedback never confirms)
 */
import { ZONES, EQUIPMENT, zoneById, equipmentById } from '../config/site.js';
import { getThresholds } from '../config/settings-store.js';
import { APP_CONFIG } from '../config/app-config.js';
import { ROLE_POINTS, ZONE_SOURCES, rolesForType } from '../config/points.js';
import { QUALITY } from './quality.js';
import { ConnectionLostError } from './connected-provider.js';

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const T0 = Date.now(); // scenario anchored to page load

/* ---- signal model ---------------------------------------------------------- */
const PROFILE = {
  'main-store': { temperature: [20.8, 1.1, 0.0], humidity: [47, 4, 1.3], setpoint: 21 },
  'dispatch':   { temperature: [22.2, 1.3, 0.4], humidity: [56.5, 2.5, 1.0], setpoint: 21 },
  'storage-b':  { temperature: [19.6, 0.9, 0.9], humidity: [45, 3, 2.0], setpoint: 20 },
  'receiving':  { temperature: [23.0, 1.6, 0.2], humidity: [52, 4, 0.6], setpoint: 22 },
};
const EVENTS = [
  { zone: 'dispatch',   metric: 'humidity',    at: T0 - 2.5 * HOUR, rise: 70 * MIN, target: 62.2, hold: true },
  { zone: 'main-store', metric: 'temperature', at: T0 - 41 * HOUR,  width: 50 * MIN, amp: 4.3 },
  { zone: 'storage-b',  metric: 'humidity',    at: T0 - 5 * DAY - 3 * HOUR, width: 70 * MIN, amp: 16 },
  { zone: 'receiving',  metric: 'temperature', at: T0 - 9 * DAY,  width: 60 * MIN, amp: -9.2 },
];
const COMMS_LOST_AT = T0 - 47 * MIN;                         // RTU-04
const SENSOR_OUTAGE = [T0 - 5 * HOUR, T0 - 4 * HOUR - 10 * MIN]; // RTU-01 space temperature
const HYB03_OFF_AT = T0 - 35 * MIN;                          // HYB-03 BMS switch off
const RTU03_STOP = [T0 - 3 * DAY - 5 * HOUR, T0 - 3 * DAY - 3 * HOUR];

const UNIT = {
  'HYB-01': { flow: 4200, duty: 1 }, 'HYB-02': { flow: 3800, duty: 1 }, 'HYB-03': { flow: 2600, duty: 1 },
  'HYB-04': { flow: 3100, duty: 1 }, 'HYB-05': { flow: 4100, duty: 1 }, 'HYB-06': { flow: 2500, duty: 0.55 },
  'RTU-01': { flow: 6200, duty: 1 }, 'RTU-02': { flow: 6100, duty: 1 }, 'RTU-03': { flow: 5400, duty: 1 },
  'RTU-04': { flow: 5200, duty: 1 }, 'RTU-05': { flow: 4800, duty: 0.5 },
};

function hash(a, b) {
  let h = 2166136261 ^ a;
  h = Math.imul(h ^ b, 16777619);
  h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function noise(seed, t) {
  const step = 10 * MIN;
  const i = Math.floor(t / step), f = t / step - i;
  const s = f * f * (3 - 2 * f);
  return (hash(seed, i) * (1 - s) + hash(seed, i + 1) * s) * 2 - 1;
}
function seedOf(id, metric) {
  let h = 7;
  for (const c of id + metric) h = Math.imul(h ^ c.charCodeAt(0), 31);
  return h >>> 0;
}
function signal(zoneId, metric, t) {
  const [base, amp, phase] = PROFILE[zoneId][metric];
  const hourOfDay = ((t / HOUR) + 2) % 24;
  const diurnal = Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI + phase);
  let v = base + amp * diurnal * (metric === 'humidity' ? -1 : 1) + noise(seedOf(zoneId, metric), t) * (metric === 'humidity' ? 0.8 : 0.25);
  for (const e of EVENTS) {
    if (e.zone !== zoneId || e.metric !== metric) continue;
    if (e.hold) {
      const x = Math.min(1, Math.max(0, (t - e.at) / e.rise));
      const s = x * x * (3 - 2 * x);
      v = v * (1 - s) + (e.target + noise(seedOf(zoneId, 'hold'), t) * 0.5) * s;
    } else v += e.amp * Math.exp(-(((t - e.at) / e.width) ** 2));
  }
  return v;
}
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const isZoneSource = (id) => Object.values(ZONE_SOURCES).includes(id);

/* ---- scenario state ----------------------------------------------------------- */
let scenario = 'normal';
const written = new Map(); // `${unit}|${role}` -> { value, at }  (applied by the simulated controller)
const wv = (unit, role, t) => { const w = written.get(`${unit}|${role}`); return w && t >= w.at ? w.value : undefined; };

/** Point is offline at time t (comms loss or sensor fault). */
function pointOffline(unitId, role, t) {
  if (scenario === 'all-live') return false;
  if (unitId === 'RTU-04' && t >= COMMS_LOST_AT) return true;
  if (unitId === 'RTU-01' && role === 'temperature' && t >= SENSOR_OUTAGE[0] && t < SENSOR_OUTAGE[1]) return true;
  return false;
}

/** Commanded state of the unit's start/enable at time t. */
function commandedOn(eq, t) {
  const role = eq.type === 'rooftop' ? 'startCommand' : 'enable';
  const w = wv(eq.id, role, t);
  if (w !== undefined) return w;
  if (scenario !== 'all-live' && eq.id === 'HYB-03' && t >= HYB03_OFF_AT) return false;
  return true;
}

/** 'running' | 'stopped' | 'fault' at time t (fan follows the command ~5 s later). */
function runState(eq, t) {
  if (scenario !== 'all-live' && eq.id === 'RTU-03' && t > RTU03_STOP[0] && t < RTU03_STOP[1]) return 'fault';
  if (!commandedOn(eq, t - 5000)) return 'stopped';
  const duty = scenario === 'all-live' ? 1 : UNIT[eq.id].duty;
  if (duty < 1) {
    const cyc = ((t / MIN) + (seedOf(eq.id, 'cyc') % 120)) % 120;
    if (cyc >= duty * 120) return 'stopped';
  }
  return 'running';
}

function setpointAt(eq, t) {
  const w = wv(eq.id, 'temperatureSetpoint', t);
  return w !== undefined ? w : PROFILE[eq.zoneId].setpoint;
}
function modeAt(eq, t) {
  const flags = { cooling: wv(eq.id, 'coolMode', t), heating: wv(eq.id, 'heatMode', t), 'fan only': wv(eq.id, 'fanOnlyMode', t) };
  if (Object.values(flags).some((v) => v !== undefined)) return Object.keys(flags).find((k) => flags[k]) || 'standby';
  const zt = signal(eq.zoneId, 'temperature', t);
  return zt < PROFILE[eq.zoneId].setpoint - 1.5 ? 'heating' : 'cooling';
}

/** Numeric/boolean value of a role at time t (no quality applied). */
function valueAt(eq, role, t) {
  const state = runState(eq, t);
  const on = state === 'running';
  const n = noise(seedOf(eq.id, role), t);
  switch (role) {
    case 'temperature': {
      const zt = signal(eq.zoneId, 'temperature', t);
      return round(isZoneSource(eq.id) ? zt : zt + ((seedOf(eq.id, 'off') % 9) - 4) / 10 + n * 0.1);
    }
    case 'humidity': return round(signal(eq.zoneId, 'humidity', t));
    case 'temperatureSetpoint': return setpointAt(eq, t);
    case 'startCommand': case 'enable': return eq.type === 'rooftop' && role === 'enable' ? true : commandedOn(eq, t);
    case 'fanStatus': return on;
    case 'operatingMode': return on ? modeAt(eq, t) : 'standby';
    case 'unitAlarm': return state === 'fault';
    case 'bmsControl': case 'remoteStatus': return true;
    case 'coolMode': return modeAt(eq, t) === 'cooling';
    case 'heatMode': return modeAt(eq, t) === 'heating';
    case 'fanOnlyMode': return modeAt(eq, t) === 'fan only';
    case 'fanSpeed': return on ? Math.round(62 + n * 8) : 0;
    case 'airflow': return on ? Math.round(UNIT[eq.id].flow + n * 120) : 0;
    case 'staticPressure': return on ? Math.round(250 + n * 12) : 0;
    case 'staticPressureSetpoint': return 250;
    case 'staticPressureStatus': return on;
    case 'dirtyFilter': return scenario !== 'all-live' && eq.id === 'HYB-05';
    default: return ROLE_POINTS[role]?.alarm ? false : null;
  }
}

/* ---- alarm / audit scenario ----------------------------------------------------- */
const demoNotice = (channel, recipient, status, at) => ({ channel, recipient, status, at, demo: true });
function buildAlarms() {
  const z = (id) => ({ type: 'zone', id, name: zoneById(id).name });
  const e = (id) => ({ type: 'equipment', id, name: `${id} · ${equipmentById(id).name}` });
  const dispatchCross = (() => {
    const lim = getThresholds('dispatch').humidity.alertHigh;
    for (let t = T0 - 3 * HOUR; t <= T0; t += MIN) if (signal('dispatch', 'humidity', t) > lim) return t;
    return T0 - HOUR;
  })();
  const list = [
    {
      id: 'DEMO-1049', severity: 'warning', status: 'active', category: 'equipment',
      source: e('HYB-05'), zoneId: 'main-store', role: 'dirtyFilter',
      description: 'Dirty filter',
      raisedAt: T0 - 5 * HOUR - 12 * MIN, valueAtRaise: { value: 'Alarm', unit: null },
      threshold: { label: 'Expected', text: 'No dirty-filter alarm' },
      details: 'The dirty-filter alarm on HYB-05 is active. Schedule a filter change.',
      notifications: [demoNotice('Email', 'Maintenance (demo contact)', 'Sent', T0 - 5 * HOUR - 11 * MIN)],
    },
    {
      id: 'DEMO-1048', severity: 'warning', status: 'active', category: 'threshold',
      source: z('dispatch'), zoneId: 'dispatch', role: 'humidity',
      description: 'Relative humidity above alert limit',
      raisedAt: dispatchCross, valueAtRaise: { value: 60.1, unit: '%RH' },
      threshold: { label: 'Alert high', key: 'alertHigh', role: 'humidity' },
      details: 'Humidity in the dispatch bay has risen above the alert limit. Humidity is monitored only on this site; no automatic humidity control is mapped.',
      notifications: [demoNotice('WhatsApp', 'Facility supervisor (demo contact)', 'Delivered', dispatchCross + 40e3), demoNotice('Email', 'Site operations (demo contact)', 'Sent', dispatchCross + 55e3)],
    },
    {
      id: 'DEMO-1047', severity: 'warning', status: 'acknowledged', category: 'communication',
      source: e('RTU-04'), zoneId: 'receiving', role: null,
      description: 'Communication interruption — no updates from RTU-04 (Receiving sensor)',
      raisedAt: COMMS_LOST_AT + 10 * MIN, valueAtRaise: null,
      threshold: { label: 'Stale after', text: `${APP_CONFIG.staleAfterMs / MIN} min without update` },
      ackAt: COMMS_LOST_AT + 18 * MIN, ackBy: 'Demo Operator', ackNote: 'Technician informed (demonstration record).',
      details: 'Readings from RTU-04, which provides the Receiving zone temperature and humidity, have not updated. Values are shown as Unknown until communication is restored.',
      notifications: [demoNotice('WhatsApp', 'Duty technician (demo contact)', 'Delivered', COMMS_LOST_AT + 11 * MIN)],
    },
    {
      id: 'DEMO-1044', severity: 'warning', status: 'cleared', category: 'communication',
      source: e('RTU-01'), zoneId: 'main-store', role: 'temperature',
      description: 'Sensor offline — RTU-01 space temperature',
      raisedAt: SENSOR_OUTAGE[0], clearedAt: SENSOR_OUTAGE[1], valueAtRaise: null,
      threshold: { label: 'Expected', text: 'Live reading' },
      ackAt: SENSOR_OUTAGE[0] + 9 * MIN, ackBy: 'Demo Operator', ackNote: 'Sensor cable reseated (demonstration record).',
      details: 'The space temperature sensor on RTU-01 reported a fault. Trend shows the gap; no values were invented.',
      notifications: [],
    },
    {
      id: 'DEMO-1041', severity: 'warning', status: 'cleared', category: 'threshold',
      source: z('main-store'), zoneId: 'main-store', role: 'temperature',
      description: 'Space temperature above alert limit',
      raisedAt: T0 - 41 * HOUR - 25 * MIN, clearedAt: T0 - 40 * HOUR - 20 * MIN, valueAtRaise: { value: 25.2, unit: '°C' },
      threshold: { label: 'Alert high', key: 'alertHigh', role: 'temperature' },
      ackAt: T0 - 41 * HOUR - 12 * MIN, ackBy: 'Demo Operator', ackNote: 'Loading door left open during delivery (demonstration record).',
      details: 'Short temperature excursion during a delivery. Returned within range without intervention.',
      notifications: [demoNotice('WhatsApp', 'Facility supervisor (demo contact)', 'Delivered', T0 - 41 * HOUR - 24 * MIN), demoNotice('Email', 'Site operations (demo contact)', 'Failed — mailbox unavailable', T0 - 41 * HOUR - 24 * MIN)],
    },
    {
      id: 'DEMO-1036', severity: 'critical', status: 'cleared', category: 'equipment',
      source: e('RTU-03'), zoneId: 'dispatch', role: 'fanStatus',
      description: 'Supply air fan off while unit enabled and started',
      raisedAt: RTU03_STOP[0] + 2 * MIN, clearedAt: RTU03_STOP[1], valueAtRaise: { value: 'Stopped', unit: null },
      threshold: { label: 'Expected', text: 'Fan running when enabled and started' },
      ackAt: RTU03_STOP[0] + 22 * MIN, ackBy: 'Demo Operator', ackNote: 'Reset by technician on site (demonstration record).',
      details: 'RTU-03 stopped for approximately two hours.',
      notifications: [demoNotice('WhatsApp', 'Duty technician (demo contact)', 'Delivered', RTU03_STOP[0] + 3 * MIN), demoNotice('WhatsApp', 'Site manager (demo contact) — escalation level 3', 'Delivered', RTU03_STOP[0] + 32 * MIN)],
    },
    {
      id: 'DEMO-1029', severity: 'critical', status: 'cleared', category: 'threshold',
      source: z('storage-b'), zoneId: 'storage-b', role: 'humidity',
      description: 'Relative humidity above action limit',
      raisedAt: T0 - 5 * DAY - 3 * HOUR - 20 * MIN, clearedAt: T0 - 5 * DAY - 2 * HOUR - 10 * MIN, valueAtRaise: { value: 65.4, unit: '%RH' },
      threshold: { label: 'Action high', key: 'actionHigh', role: 'humidity' },
      ackAt: T0 - 5 * DAY - 3 * HOUR - 5 * MIN, ackBy: 'Demo Operator', ackNote: 'Roof leak after storm (demonstration record).',
      details: 'Humidity spike after heavy rain.',
      notifications: [],
    },
    {
      id: 'DEMO-1022', severity: 'warning', status: 'cleared', category: 'threshold',
      source: z('receiving'), zoneId: 'receiving', role: 'temperature',
      description: 'Space temperature below alert limit',
      raisedAt: T0 - 9 * DAY - 25 * MIN, clearedAt: T0 - 9 * DAY + 40 * MIN, valueAtRaise: { value: 14.6, unit: '°C' },
      threshold: { label: 'Alert low', key: 'alertLow', role: 'temperature' },
      ackAt: T0 - 9 * DAY - 10 * MIN, ackBy: 'Demo Operator', ackNote: 'Receiving doors open in cold weather (demonstration record).',
      details: 'Cold-weather excursion during receiving.',
      notifications: [],
    },
    {
      id: 'DEMO-1015', severity: 'warning', status: 'cleared', category: 'communication',
      source: { type: 'system', id: 'gateway', name: 'BMS gateway' }, zoneId: null, role: null,
      description: 'Communication interruption — gateway did not respond',
      raisedAt: T0 - 14 * DAY - 2 * HOUR, clearedAt: T0 - 14 * DAY - 1 * HOUR - 35 * MIN, valueAtRaise: null,
      threshold: { label: 'Stale after', text: `${APP_CONFIG.staleAfterMs / MIN} min without update` },
      ackAt: T0 - 14 * DAY - 1 * HOUR - 50 * MIN, ackBy: 'Demo Operator', ackNote: 'Network switch restarted (demonstration record).',
      details: 'All points reported Unknown for 25 minutes.',
      notifications: [],
    },
    {
      id: 'DEMO-1009', severity: 'critical', status: 'cleared', category: 'threshold',
      source: z('dispatch'), zoneId: 'dispatch', role: 'temperature',
      description: 'Space temperature above action limit',
      raisedAt: T0 - 22 * DAY - 6 * HOUR, clearedAt: T0 - 22 * DAY - 4 * HOUR, valueAtRaise: { value: 27.4, unit: '°C' },
      threshold: { label: 'Action high', key: 'actionHigh', role: 'temperature' },
      ackAt: T0 - 22 * DAY - 5 * HOUR - 45 * MIN, ackBy: 'Demo Operator', ackNote: 'Heatwave; additional cooling requested (demonstration record).',
      details: 'High ambient temperature during heatwave.',
      notifications: [],
    },
  ];
  return list.map((a) => ({ ...a, demo: true }));
}

function buildAudit(alarms) {
  const out = [];
  const push = (ts, type, source, actor, description) => out.push({ id: `DA-${out.length + 1}`, ts, type, source, actor, description, demo: true });
  for (const a of alarms) {
    if (a.ackAt) push(a.ackAt, 'acknowledgement', `${a.id} · ${a.source.name}`, a.ackBy, `Alarm acknowledged: ${a.description}. Note: ${a.ackNote}`);
    for (const n of a.notifications || []) push(n.at, 'notification', `${a.id} · ${n.channel}`, 'Notification service (demo)', `${n.channel} to ${n.recipient}: ${n.status}`);
    if (a.category === 'communication') {
      push(a.raisedAt, 'communication', a.source.name, 'System', 'Communication interruption detected');
      if (a.clearedAt) push(a.clearedAt, 'communication', a.source.name, 'System', 'Communication restored');
    }
  }
  push(T0 - 14 * DAY - 1 * HOUR - 30 * MIN, 'service', 'Monitoring service', 'System', 'Monitoring service restarted after network interruption');
  push(T0 - 6 * DAY - 2 * HOUR, 'configuration', 'Thresholds · Storage Zone B', 'Demo Engineer', 'Humidity alert limit reviewed — unchanged (60 %RH)');
  push(T0 - 12 * DAY, 'configuration', 'Notification recipients', 'Demo Engineer', 'Duty technician added to WhatsApp escalation list');
  push(T0 - 18 * DAY, 'maintenance', 'HYB-01 · Hybrid unit 1', 'Demo Technician', 'Filters replaced');
  push(T0 - 20 * DAY, 'service', 'Monitoring service', 'System', 'Monitoring service started');
  push(T0 - 27 * DAY, 'configuration', 'Zones', 'Demo Engineer', 'Zone names imported from placeholder list');
  return out;
}


/* ---- provider -------------------------------------------------------------------- */
export function createDemoProvider(initialScenario = 'normal') {
  scenario = initialScenario;
  written.clear();
  const alarms = buildAlarms().filter((a) => scenario !== 'all-live' || a.status === 'cleared');
  const audit = buildAudit(alarms);

  function reading(eq, role, now) {
    if (pointOffline(eq.id, role, now)) {
      // Last good value is the value just before the outage started.
      const since = eq.id === 'RTU-04' ? COMMS_LOST_AT : SENSOR_OUTAGE[0];
      const lg = valueAt(eq, role, since - 1000);
      return { value: null, unit: ROLE_POINTS[role].unit, ts: null, quality: QUALITY.OFFLINE,
        error: eq.id === 'RTU-04' ? 'No response from controller' : 'Sensor fault reported by the JACE',
        lastGood: lg == null ? null : { value: lg, ts: since - 1000 } };
    }
    const r = { value: valueAt(eq, role, now), unit: ROLE_POINTS[role].unit, ts: now, quality: QUALITY.LIVE };
    if (scenario === 'normal' && eq.id === 'RTU-02' && role === 'temperatureSetpoint') r.override = { source: 'priority 5 (local schedule on the JACE)' };
    return r;
  }

  return {
    id: 'demo',
    capabilities: { acknowledge: true, history: true, audit: true, notifications: true, control: true },
    get scenario() { return scenario; },

    async health() {
      if (scenario === 'comms-lost') return { ok: false, message: 'JACE not responding (simulated)', checkedAt: Date.now() };
      return { ok: true, message: 'Simulated data generated in this browser', checkedAt: Date.now() };
    },

    async snapshot() {
      if (scenario === 'comms-lost') throw new ConnectionLostError('JACE not responding (simulated)');
      const now = Date.now();
      const equipment = {};
      for (const e of EQUIPMENT) {
        equipment[e.id] = {};
        for (const role of rolesForType(e.type)) equipment[e.id][role] = reading(e, role, now);
      }
      return { ts: now, equipment, alarms: alarms.map((a) => ({ ...a })), audit: audit.slice() };
    },

    /** History for one unit role: [[ts, value|null, quality], ...] — outages stay as gaps. */
    async series({ unitId, role, from, to, stepMs }) {
      await new Promise((r) => setTimeout(r, 120));
      if (scenario === 'comms-lost') throw new ConnectionLostError('JACE not responding (simulated)');
      const eq = equipmentById(unitId);
      const end = Math.min(to, Date.now());
      const out = [];
      for (let t = Math.ceil(from / stepMs) * stepMs; t <= end; t += stepMs) {
        if (pointOffline(unitId, role, t)) { out.push([t, null, QUALITY.OFFLINE]); continue; }
        const v = valueAt(eq, role, t);
        out.push([t, typeof v === 'boolean' ? (v ? 1 : 0) : v, QUALITY.LIVE]);
      }
      return out;
    },

    /** Run-state segments [{ from, to, state }] with state running | stopped | fault | unknown. */
    async runSegments({ unitId, from, to }) {
      if (scenario === 'comms-lost') throw new ConnectionLostError('JACE not responding (simulated)');
      const eq = equipmentById(unitId);
      const step = Math.max(MIN, Math.round((to - from) / 600));
      const segs = [];
      for (let t = from; t < to; t += step) {
        const st = pointOffline(unitId, 'fanStatus', t) ? 'unknown' : runState(eq, t);
        const last = segs[segs.length - 1];
        if (last && last.state === st) last.to = Math.min(t + step, to);
        else segs.push({ from: t, to: Math.min(t + step, to), state: st });
      }
      return segs;
    },

    async acknowledge(alarmId, { actor, note }) {
      const a = alarms.find((x) => x.id === alarmId);
      if (!a) throw new Error('Alarm not found');
      if (a.status !== 'active') throw new Error('Alarm is not awaiting acknowledgement');
      Object.assign(a, { status: 'acknowledged', ackAt: Date.now(), ackBy: actor, ackNote: note || '' });
      audit.push({ id: `DA-${audit.length + 1}`, ts: a.ackAt, type: 'acknowledgement', source: `${a.id} · ${a.source.name}`, actor, description: `Alarm acknowledged (simulated): ${a.description}${note ? '. Note: ' + note : ''}`, demo: true });
      return { ...a };
    },

    /** Simulated controller: applies a write ~3 s later, unless overridden, offline or in 'no-confirm'. */
    async command(unitId, role, value) {
      if (scenario === 'comms-lost') throw new ConnectionLostError('JACE not responding (simulated)');
      if (pointOffline(unitId, role, Date.now())) throw new Error('Controller not responding');
      if (scenario === 'no-confirm') return { accepted: true };
      if (scenario === 'normal' && unitId === 'RTU-02' && role === 'temperatureSetpoint') return { accepted: true }; // overridden: no effect
      written.set(`${unitId}|${role}`, { value, at: Date.now() + 3000 });
      return { accepted: true };
    },
    dispose() {},
  };
}
