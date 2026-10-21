/* DEMO PROVIDER — the ONLY place demonstration data exists.
 * Every value produced here is an illustrative placeholder generated in the
 * browser. Nothing here is site telemetry.
 *
 * Signals are a deterministic function of time, so current values, 1-hour
 * deltas, history, live graphs and alarm records stay consistent. */
import { ZONES, EQUIPMENT, zoneById, equipmentById } from '../config/site.js';
import { getThresholds } from '../config/settings-store.js';
import { APP_CONFIG } from '../config/app-config.js';

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const T0 = Date.now(); // demo scenario is anchored to page load

/* ---- signal model --------------------------------------------------------- */
const PROFILE = {
  'main-store': { temperature: [20.8, 1.1, 0.0], humidity: [47, 4, 1.3], setpoint: 21 },
  'dispatch':   { temperature: [22.2, 1.3, 0.4], humidity: [56.5, 2.5, 1.0], setpoint: 21 },
  'storage-b':  { temperature: [19.6, 0.9, 0.9], humidity: [45, 3, 2.0], setpoint: 20 },
  'receiving':  { temperature: [23.0, 1.6, 0.2], humidity: [52, 4, 0.6], setpoint: 22 },
};

// Scenario events (relative to page load) — all illustrative.
const EVENTS = [
  { zone: 'dispatch',   metric: 'humidity',    at: T0 - 2.5 * HOUR, rise: 70 * MIN, target: 62.2, hold: true },
  { zone: 'main-store', metric: 'temperature', at: T0 - 41 * HOUR,  width: 50 * MIN, amp: 4.3 },
  { zone: 'storage-b',  metric: 'humidity',    at: T0 - 5 * DAY - 3 * HOUR, width: 70 * MIN, amp: 16 },
  { zone: 'receiving',  metric: 'temperature', at: T0 - 9 * DAY,  width: 60 * MIN, amp: -9.2 },
];

// RTU-04 (the Receiving zone's sensor) stops reporting 47 minutes before load.
const COMMS_LOST_AT = T0 - 47 * MIN;
const COMMS_LOST = new Set(['receiving', 'RTU-04']);
const RTU03_STOP = [T0 - 3 * DAY - 5 * HOUR, T0 - 3 * DAY - 3 * HOUR];

// Per-unit illustrative characteristics.
const UNIT = {
  'HYB-01': { flow: 4200, hours: 18240, duty: 0.92 }, 'HYB-02': { flow: 3800, hours: 17110, duty: 0.95 },
  'HYB-03': { flow: 2600, hours: 9620,  duty: 0.45 }, 'HYB-04': { flow: 3100, hours: 16380, duty: 0.9 },
  'HYB-05': { flow: 4100, hours: 18900, duty: 0.94 }, 'HYB-06': { flow: 2500, hours: 8110,  duty: 0.4 },
  'RTU-01': { flow: 6200, hours: 21450, duty: 0.97 }, 'RTU-02': { flow: 6100, hours: 22980, duty: 0.97 },
  'RTU-03': { flow: 5400, hours: 14020, duty: 0.85 }, 'RTU-04': { flow: 5200, hours: 15560, duty: 0.88 },
  'RTU-05': { flow: 4800, hours: 7240,  duty: 0.5 },
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
  const hourOfDay = ((t / HOUR) + 2) % 24; // SAST
  const diurnal = Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI + phase);
  const sign = metric === 'humidity' ? -1 : 1; // RH falls as temperature rises
  let v = base + amp * diurnal * sign + noise(seedOf(zoneId, metric), t) * (metric === 'humidity' ? 0.8 : 0.25);
  for (const e of EVENTS) {
    if (e.zone !== zoneId || e.metric !== metric) continue;
    if (e.hold) {
      // Ramp towards a held level (keeps the active demo alarm consistent at any time of day).
      const x = Math.min(1, Math.max(0, (t - e.at) / e.rise));
      const s = x * x * (3 - 2 * x);
      v = v * (1 - s) + (e.target + noise(seedOf(zoneId, 'hold'), t) * 0.5) * s;
    } else {
      v += e.amp * Math.exp(-(((t - e.at) / e.width) ** 2));
    }
  }
  return v;
}

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const lastSample = (key, now) => (COMMS_LOST.has(key) && now > COMMS_LOST_AT ? COMMS_LOST_AT : Math.floor(now / 30e3) * 30e3);
const good = (value, unit, ts) => ({ value, unit, ts, quality: 'good' });

/* ---- equipment model ------------------------------------------------------ */
const overrides = new Map(); // unitId -> enable value written in demo (only when controls are enabled)
const spOverrides = new Map(); // unitId -> { value, at } setpoint written in demo

function equipmentState(eq, t) {
  if (overrides.has(eq.id) && t >= overrides.get(eq.id).at) return overrides.get(eq.id).value ? 'running' : 'standby';
  if (eq.id === 'RTU-04' && t > COMMS_LOST_AT) return 'unknown';
  if (eq.id === 'RTU-03' && t > RTU03_STOP[0] && t < RTU03_STOP[1]) return 'stopped';
  const duty = UNIT[eq.id].duty;
  if (duty < 0.9) {
    // Duty-cycled units: on for `duty` share of each 2-hour block, offset per unit.
    const off = (seedOf(eq.id, 'cyc') % 120);
    const cyc = ((t / MIN) + off) % 120;
    return cyc < duty * 120 ? 'running' : 'standby';
  }
  return 'running';
}

function modeFor(eq, zoneTemp) {
  const sp = PROFILE[eq.zoneId].setpoint;
  return zoneTemp < sp - 1.5 ? 'heating' : 'cooling';
}

/** Unit-level numeric signals. A unit's space temperature follows its zone with a small per-unit offset. */
function unitSignal(eq, role, t) {
  const off = ((seedOf(eq.id, 'off') % 9) - 4) / 10; // -0.4 .. +0.4 °C
  if (role === 'temperature') return signal(eq.zoneId, 'temperature', t) + off + noise(seedOf(eq.id, 'tn'), t) * 0.1;
  if (role === 'humidity') return signal(eq.zoneId, 'humidity', t);
  if (role === 'temperatureSetpoint') return PROFILE[eq.zoneId].setpoint;
  return null;
}
/** Zone source units read the zone signal exactly, so zone readings and alarms agree. */
const ZONE_SOURCE_UNITS = new Set(['RTU-01', 'RTU-03', 'RTU-05', 'RTU-04']);

/* ---- alarm / audit scenario ----------------------------------------------- */
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

/* ---- provider ------------------------------------------------------------- */
export function createDemoProvider() {
  const alarms = buildAlarms();
  const audit = buildAudit(alarms);

  function equipmentReadings(eq, now) {
    const ts = lastSample(eq.id, now);
    const state = equipmentState(eq, ts);
    const running = state === 'running';
    const enabled = overrides.has(eq.id) ? overrides.get(eq.id).value : true;
    const temp = round(ZONE_SOURCE_UNITS.has(eq.id) ? signal(eq.zoneId, 'temperature', ts) : unitSignal(eq, 'temperature', ts));
    const spo = spOverrides.get(eq.id);
    const sp = spo && ts >= spo.at ? spo.value : PROFILE[eq.zoneId].setpoint;
    const mode = running ? modeFor(eq, temp) : 'standby';
    const u = UNIT[eq.id];
    if (eq.type === 'rooftop') {
      return {
        temperature: good(temp, '°C', ts),
        temperatureSetpoint: good(sp, '°C', ts),
        humidity: good(round(signal(eq.zoneId, 'humidity', ts)), '%RH', ts),
        enable: good(enabled, null, ts),
        startCommand: good(enabled && (state !== 'standby'), null, ts),
        fanStatus: good(running, null, ts),
        operatingMode: good(mode, null, ts),
        unitAlarm: good(state === 'stopped', null, ts),
      };
    }
    const flow = running ? Math.round(u.flow + noise(seedOf(eq.id, 'af'), ts) * 120) : 0;
    return {
      temperature: good(temp, '°C', ts),
      temperatureSetpoint: good(sp, '°C', ts),
      enable: good(enabled, null, ts),
      bmsControl: good(true, null, ts),
      remoteStatus: good(true, null, ts),
      fanStatus: good(running, null, ts),
      coolMode: good(running && mode === 'cooling', null, ts),
      heatMode: good(running && mode === 'heating', null, ts),
      fanOnlyMode: good(false, null, ts),
      fanSpeed: good(running ? Math.round(62 + noise(seedOf(eq.id, 'fs'), ts) * 8) : 0, '%', ts),
      airflow: good(flow, 'm³/h', ts),
      staticPressure: good(running ? Math.round(250 + noise(seedOf(eq.id, 'sp'), ts) * 12) : 0, 'Pa', ts),
      staticPressureSetpoint: good(250, 'Pa', ts),
      staticPressureStatus: good(running, null, ts),
      staticPressureFailure: good(false, null, ts),
      noAirflow: good(false, null, ts),
      fanTrip: good(false, null, ts),
      roomTemp1Failure: good(false, null, ts),
      roomTemp2Failure: good(false, null, ts),
      oncoilTempFailure: good(false, null, ts),
      dirtyFilter: good(eq.id === 'HYB-05', null, ts),
    };
  }

  return {
    id: 'demo',
    capabilities: { acknowledge: true, history: true, hvacHistory: true, unitHistory: true, audit: true, notifications: true, control: true },

    async health() { return { ok: true, message: 'Demonstration data generated in this browser', checkedAt: Date.now() }; },

    async snapshot() {
      const now = Date.now();
      const equipment = {};
      for (const e of EQUIPMENT) equipment[e.id] = equipmentReadings(e, now);
      return { ts: now, equipment, alarms: alarms.map((a) => ({ ...a })), audit: audit.slice() };
    },

    /** Returns [{ zoneId, points: [[ts, value|null], ...] }] */
    async history({ metric, zoneIds, from, to, stepMs }) {
      await new Promise((r) => setTimeout(r, 200)); // simulate latency so loading states are visible
      const now = Date.now();
      return zoneIds.map((zoneId) => {
        const points = [];
        for (let t = Math.ceil(from / stepMs) * stepMs; t <= Math.min(to, now); t += stepMs) {
          const lost = COMMS_LOST.has(zoneId) && t > COMMS_LOST_AT;
          points.push([t, lost ? null : round(signal(zoneId, metric, t), 2)]);
        }
        return { zoneId, points };
      });
    },

    /** Unit-level numeric history (space temperature, setpoint). */
    async unitHistory({ unitId, role, from, to, stepMs }) {
      const eq = equipmentById(unitId);
      const now = Date.now();
      const points = [];
      for (let t = Math.ceil(from / stepMs) * stepMs; t <= Math.min(to, now); t += stepMs) {
        const lost = COMMS_LOST.has(unitId) && t > COMMS_LOST_AT;
        points.push([t, lost ? null : round(unitSignal(eq, role, t), 2)]);
      }
      return points;
    },

    /** Returns [{ equipmentId, segments: [{ from, to, state }] }] */
    async hvacHistory({ from, to }) {
      const step = 10 * MIN;
      return EQUIPMENT.map((eq) => {
        const segments = [];
        for (let t = from; t < to; t += step) {
          const state = equipmentState(eq, t);
          const last = segments[segments.length - 1];
          if (last && last.state === state) last.to = Math.min(t + step, to);
          else segments.push({ from: t, to: Math.min(t + step, to), state });
        }
        return { equipmentId: eq.id, segments };
      });
    },

    async acknowledge(alarmId, { actor, note }) {
      const a = alarms.find((x) => x.id === alarmId);
      if (!a) throw new Error('Alarm not found');
      if (a.status !== 'active') throw new Error('Alarm is not awaiting acknowledgement');
      a.status = 'acknowledged';
      a.ackAt = Date.now();
      a.ackBy = actor;
      a.ackNote = note || '';
      audit.push({ id: `DA-${audit.length + 1}`, ts: a.ackAt, type: 'acknowledgement', source: `${a.id} · ${a.source.name}`, actor, description: `Alarm acknowledged (demo mode): ${a.description}${note ? '. Note: ' + note : ''}`, demo: true });
      return { ...a };
    },

    /** Demo command: only reachable when APP_CONFIG.controls.enabled is true. Takes effect after a short delay. */
    async command(unitId, role, value) {
      if (role === 'temperatureSetpoint') { spOverrides.set(unitId, { value, at: Date.now() + 4000 }); return { accepted: true }; }
      if (role !== 'enable') throw new Error('Unsupported control');
      overrides.set(unitId, { value, at: Date.now() + 4000 });
      return { accepted: true };
    },
    async release(unitId) { overrides.delete(unitId); spOverrides.delete(unitId); return { accepted: true }; },
  };
}
