/* DEMO PROVIDER — the ONLY place demonstration data exists.
 * Every value produced here is an illustrative placeholder generated in the
 * browser. Nothing here is site telemetry.
 *
 * Signals are a deterministic function of time, so current values, 1-hour
 * deltas, history and alarm records stay consistent with each other. */
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

// Receiving / HVAC-04 stop reporting 47 minutes before load (communication interruption).
const COMMS_LOST_AT = T0 - 47 * MIN;
const COMMS_LOST_UNITS = new Set(['receiving', 'HVAC-04']);

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
function seedOf(zoneId, metric) {
  let h = 7;
  for (const c of zoneId + metric) h = Math.imul(h ^ c.charCodeAt(0), 31);
  return h >>> 0;
}

function signal(zoneId, metric, t) {
  const p = PROFILE[zoneId][metric];
  const [base, amp, phase] = p;
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

function lastSample(unitKey, now) {
  // Values update every 30 s; after comms loss the last sample freezes.
  const lost = COMMS_LOST_UNITS.has(unitKey) && now > COMMS_LOST_AT;
  return lost ? COMMS_LOST_AT : Math.floor(now / 30e3) * 30e3;
}

const good = (value, unit, ts) => ({ value, unit, ts, quality: 'good' });

function equipmentState(eq, t) {
  const hourOfDay = ((t / HOUR) + 2) % 24;
  if (eq.id === 'HVAC-03') {
    // Duty cycles in storage zone B: runs ~40 min of each 2 h, plus office hours.
    const cyc = ((t / MIN) % 120);
    const running = (hourOfDay >= 7 && hourOfDay < 9) || cyc < 40;
    return running ? 'running' : 'standby';
  }
  if (eq.id === 'HVAC-02' && t > T0 - 3 * DAY - 5 * HOUR && t < T0 - 3 * DAY - 3 * HOUR) return 'stopped';
  if (eq.id === 'HVAC-04' && t > COMMS_LOST_AT) return 'unknown';
  return 'running';
}

function modeFor(eq, zoneTemp) {
  if (eq.id === 'HVAC-03') return 'standby';
  const sp = PROFILE[eq.zoneId].setpoint;
  if (zoneTemp < sp - 1.5) return 'heating';
  return 'cooling';
}

/* ---- alarm / audit scenario ----------------------------------------------- */
const demoNotice = (channel, recipient, status, at) => ({ channel, recipient, status, at, demo: true });

function buildAlarms() {
  const z = (id) => ({ type: 'zone', id, name: zoneById(id).name });
  const e = (id) => ({ type: 'equipment', id, name: equipmentById(id).name });
  const dispatchCross = (() => { // first time dispatch humidity crosses its alert limit
    const lim = getThresholds('dispatch').humidity.alertHigh;
    for (let t = T0 - 3 * HOUR; t <= T0; t += MIN) if (signal('dispatch', 'humidity', t) > lim) return t;
    return T0 - HOUR;
  })();
  const list = [
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
      source: e('HVAC-04'), zoneId: 'receiving', role: null,
      description: 'Communication interruption — no updates from Receiving controller',
      raisedAt: COMMS_LOST_AT + 10 * MIN, valueAtRaise: null,
      threshold: { label: 'Stale after', text: `${APP_CONFIG.staleAfterMs / MIN} min without update` },
      ackAt: COMMS_LOST_AT + 18 * MIN, ackBy: 'Demo Operator', ackNote: 'Technician informed (demonstration record).',
      details: 'Readings for the Receiving zone and HVAC-04 have not updated. Values are shown as Unknown until communication is restored.',
      notifications: [demoNotice('WhatsApp', 'Duty technician (demo contact)', 'Delivered', COMMS_LOST_AT + 11 * MIN)],
    },
    {
      id: 'DEMO-1041', severity: 'warning', status: 'cleared', category: 'threshold',
      source: z('main-store'), zoneId: 'main-store', role: 'temperature',
      description: 'Space temperature above alert limit',
      raisedAt: T0 - 41 * HOUR - 25 * MIN, clearedAt: T0 - 40 * HOUR - 20 * MIN, valueAtRaise: { value: 25.2, unit: '°C' },
      threshold: { label: 'Alert high', key: 'alertHigh', role: 'temperature' },
      ackAt: T0 - 41 * HOUR - 12 * MIN, ackBy: 'Demo Operator', ackNote: 'Loading-door left open during delivery (demonstration record).',
      details: 'Short temperature excursion during a delivery. Returned within range without intervention.',
      notifications: [demoNotice('WhatsApp', 'Facility supervisor (demo contact)', 'Delivered', T0 - 41 * HOUR - 24 * MIN), demoNotice('Email', 'Site operations (demo contact)', 'Failed — mailbox unavailable', T0 - 41 * HOUR - 24 * MIN)],
    },
    {
      id: 'DEMO-1036', severity: 'critical', status: 'cleared', category: 'equipment',
      source: e('HVAC-02'), zoneId: 'dispatch', role: 'runStatus',
      description: 'Unit not running while enabled and scheduled',
      raisedAt: T0 - 3 * DAY - 5 * HOUR + 2 * MIN, clearedAt: T0 - 3 * DAY - 3 * HOUR, valueAtRaise: { value: 'Stopped', unit: null },
      threshold: { label: 'Expected', text: 'Running when enabled and scheduled' },
      ackAt: T0 - 3 * DAY - 4 * HOUR - 40 * MIN, ackBy: 'Demo Operator', ackNote: 'Reset by technician on site (demonstration record).',
      details: 'HVAC-02 stopped for approximately two hours.',
      notifications: [demoNotice('WhatsApp', 'Duty technician (demo contact)', 'Delivered', T0 - 3 * DAY - 5 * HOUR + 3 * MIN)],
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
  push(T0 - 20 * DAY, 'service', 'Monitoring service', 'System', 'Monitoring service started');
  push(T0 - 27 * DAY, 'configuration', 'Zones', 'Demo Engineer', 'Zone names imported from placeholder list');
  return out;
}

/* ---- provider ------------------------------------------------------------- */
export function createDemoProvider() {
  const alarms = buildAlarms();
  const audit = buildAudit(alarms);

  function zoneReadings(zoneId, now) {
    const ts = lastSample(zoneId, now);
    return {
      temperature: good(round(signal(zoneId, 'temperature', ts)), '°C', ts),
      humidity: good(round(signal(zoneId, 'humidity', ts)), '%RH', ts),
      temperatureSetpoint: good(PROFILE[zoneId].setpoint, '°C', ts),
    };
  }

  function equipmentReadings(eq, now) {
    const ts = lastSample(eq.id === 'HVAC-04' ? 'HVAC-04' : eq.id, now);
    const state = equipmentState(eq, ts);
    const temp = round(signal(eq.zoneId, 'temperature', ts));
    const running = state === 'running' || (eq.id === 'HVAC-04' && state === 'unknown');
    const baseFlow = { 'HVAC-01': 4200, 'HVAC-02': 3800, 'HVAC-03': 2600, 'HVAC-04': 3100 }[eq.id];
    return {
      runStatus: good(running, null, ts),
      operatingMode: good(running ? modeFor(eq, temp) : 'standby', null, ts),
      enable: good(true, null, ts),
      airflow: good(running ? Math.round(baseFlow + noise(seedOf(eq.id, 'af'), ts) * 120) : 0, 'm³/h', ts),
      fanSchedule: good(eq.id === 'HVAC-03' ? running : true, null, ts),
      temperature: good(temp, '°C', ts),
    };
  }

  return {
    id: 'demo',
    capabilities: { acknowledge: true, history: true, hvacHistory: true, audit: true, notifications: true },

    async health() { return { ok: true, message: 'Demonstration data generated in this browser', checkedAt: Date.now() }; },

    async snapshot() {
      const now = Date.now();
      const zones = {}, equipment = {};
      for (const z of ZONES) zones[z.id] = zoneReadings(z.id, now);
      for (const e of EQUIPMENT) equipment[e.id] = equipmentReadings(e, now);
      return { ts: now, zones, equipment, alarms: alarms.map((a) => ({ ...a })), audit: audit.slice() };
    },

    /** Returns [{ zoneId, points: [[ts, value|null], ...] }] */
    async history({ metric, zoneIds, from, to, stepMs }) {
      await new Promise((r) => setTimeout(r, 250)); // simulate latency so loading states are visible
      const now = Date.now();
      return zoneIds.map((zoneId) => {
        const points = [];
        for (let t = Math.ceil(from / stepMs) * stepMs; t <= Math.min(to, now); t += stepMs) {
          const lost = COMMS_LOST_UNITS.has(zoneId) && t > COMMS_LOST_AT;
          points.push([t, lost ? null : round(signal(zoneId, metric, t), 2)]);
        }
        return { zoneId, points };
      });
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
  };
}
