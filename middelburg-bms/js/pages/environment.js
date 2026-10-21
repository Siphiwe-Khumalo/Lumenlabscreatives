/* Environmental Conditions — per-zone temperature (actual vs setpoint) and
 * humidity (monitoring only). */
import { ZONES, NAMES_ILLUSTRATIVE, equipmentForZone } from '../config/site.js';
import { THRESHOLDS_LABEL } from '../config/thresholds.js';
import { ROLE_POINTS, controllerName } from '../config/points.js';
import { APP_CONFIG } from '../config/app-config.js';
import { hasThresholdOverride } from '../config/settings-store.js';
import { icon } from '../ui/icons.js';
import { esc, num, dateTime, ago } from '../util/format.js';
import { statusChip, stateBox } from '../ui/components.js';
import { isGood, QUALITY_LABEL } from '../data/quality.js';
import { calibrationStatus, CALIBRATION_LABEL } from '../config/calibration.js';
import { meanKineticTemperature } from '../data/analytics.js';
import { getProvider } from '../data/store.js';

const mktCache = {}; // zoneId -> { value, samples, from, to } | { error }

function calibrationHTML(zoneId, sensor) {
  const c = calibrationStatus(zoneId, sensor);
  if (!c) return '<span class="muted">Not recorded</span>';
  const chip = c.status === 'overdue' ? `<span class="status-chip st-critical">${icon('alarm')}Overdue</span>`
    : c.status === 'due-soon' ? `<span class="status-chip st-warning">${icon('clock')}Due in ${c.daysLeft} d</span>` : '';
  return `Last ${esc(c.last)} · next due ${esc(c.nextDue)} ${chip}`;
}

function mktHTML(zoneId) {
  const m = mktCache[zoneId];
  if (!m) return '<span class="muted">Calculating…</span>';
  if (m.error) return `<span class="muted">${esc(m.error)}</span>`;
  return `<strong>${num(m.value, 2)} °C</strong> <span class="muted small">last 30 days · ${m.samples} hourly samples</span>`;
}

const pct = (v, lo, hi) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)).toFixed(2)}%`;
const lim = (v, unit) => (v == null ? '<span class="muted">None</span>' : `${v} ${unit}`);

function rangeBar({ limits, unit, reading, setpoint, digits = 1 }) {
  const val = isGood(reading) ? reading.value : null;
  const sp = isGood(setpoint) ? setpoint.value : null;
  const pts = [limits.actionLow, limits.alertLow, limits.alertHigh, limits.actionHigh, val, sp, limits.setpointMin, limits.setpointMax].filter((v) => v != null);
  // One-sided limits (e.g. humidity upper only): show a consistent span below the limit.
  if (limits.alertLow == null && limits.actionLow == null && limits.alertHigh != null) pts.push(limits.alertHigh - 25);
  const span = Math.max(...pts) - Math.min(...pts);
  const lo = Math.floor(Math.min(...pts) - Math.max(2, span * 0.15));
  const hi = Math.ceil(Math.max(...pts) + Math.max(2, span * 0.15));
  const seg = (a, b, cls) => {
    const l = a == null ? lo : a, r = b == null ? hi : b;
    return `<div class="${cls}" style="left:${pct(l, lo, hi)};right:calc(100% - ${pct(r, lo, hi)})"></div>`;
  };
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  return `<div class="rangebar" aria-hidden="true">
      <div class="rb-track">${seg(limits.actionLow, limits.actionHigh, 'rb-alert')}${seg(limits.alertLow, limits.alertHigh, 'rb-ok')}</div>
      ${limits.setpointMin != null ? `<div class="rb-sp-range" style="left:${pct(limits.setpointMin, lo, hi)};right:calc(100% - ${pct(limits.setpointMax, lo, hi)})" title="Permitted setpoint adjustment"></div>` : ''}
      ${sp != null ? `<div class="rb-marker setpoint" style="left:${pct(sp, lo, hi)}"><div class="tick"></div><span class="lab">Setpoint ${num(sp, digits)} ${unit}</span></div>` : ''}
      ${val != null ? `<div class="rb-marker actual" style="left:${pct(val, lo, hi)}"><span class="lab">Measured ${num(val, digits)} ${unit}</span><div class="pin"></div></div>` : ''}
    </div>
    <div class="rb-scale"><span>${ticks[0]} ${unit}</span><span>${ticks[1]}</span><span>${ticks[2]} ${unit}</span></div>
    <div class="rb-legend">
      <span><i class="lg-actual"></i>Measured</span>
      ${setpoint !== undefined ? '<span><i class="lg-sp"></i>Setpoint</span>' : ''}
      <span><i class="lg-ok"></i>Acceptable</span><span><i class="lg-alert"></i>Alert band</span><span><i class="lg-action"></i>Beyond action limit</span>
    </div>`;
}

function valueBlock(label, r, unit) {
  if (!isGood(r)) return `<div><span class="lbl">${label}</span><span class="val v-unknown">Unknown</span><span class="small muted">${esc(QUALITY_LABEL[r?.quality] || 'Missing')} — ${esc(r?.error || 'no reading')}</span></div>`;
  return `<div><span class="lbl">${label}</span><span class="val">${num(r.value)} <small>${unit}</small></span><span class="small muted" title="${esc(dateTime(r.ts))}">at ${esc(dateTime(r.ts).slice(11))} (${esc(ago(r.ts))})</span></div>`;
}

function zonePanel(z, mode) {
  const t = z.limits.temperature, h = z.limits.humidity;
  const writable = APP_CONFIG.setpointWriteEnabled && ROLE_POINTS.temperatureSetpoint.writable && mode === 'connected';
  const reason = mode === 'demo'
    ? 'Demonstration only — setpoint writes are disabled.'
    : 'Not configured — setpoint write point and permission not confirmed (writable: false).';
  const override = hasThresholdOverride(z.id);
  return `<section class="card zone-panel" id="zone-${z.id}" aria-labelledby="zh-${z.id}">
    <div class="card-head">
      <h2 id="zh-${z.id}">${esc(z.name)}</h2><span class="sub">${esc(z.description)} · sensor: ${esc(z.sourceUnit)} (${esc(controllerName(z.sourceUnit))}, to be confirmed) · units: ${esc(equipmentForZone(z.id).map((e) => e.id).join(', '))}</span>
      <div class="actions">${statusChip(z.status.overall)}<span class="small muted">Last update ${z.lastUpdate ? `${esc(dateTime(z.lastUpdate).slice(11))} SAST (${esc(ago(z.lastUpdate))})` : '—'}</span></div>
    </div>
    <div class="card-body readings">
      <div class="reading-block">
        <h3>${icon('environment')}Space temperature ${statusChip(z.status.temperature.status)}</h3>
        <div class="big-pair">${valueBlock('Measured', z.readings.temperature, '°C')}${valueBlock('Setpoint', z.readings.temperatureSetpoint, '°C')}</div>
        ${rangeBar({ limits: t, unit: '°C', reading: z.readings.temperature, setpoint: z.readings.temperatureSetpoint })}
        <dl class="kv">
          <dt>Acceptable range (alert limits)</dt><dd>${lim(t.alertLow, '°C')} to ${lim(t.alertHigh, '°C')}</dd>
          <dt>Action limits</dt><dd>${lim(t.actionLow, '°C')} to ${lim(t.actionHigh, '°C')}</dd>
          <dt>Permitted setpoint adjustment</dt><dd>${lim(t.setpointMin, '°C')} to ${lim(t.setpointMax, '°C')}</dd>
          <dt>Evaluation</dt><dd>${esc(z.status.temperature.reason)}</dd>
          <dt title="Single temperature expressing the cumulative thermal stress of the recorded temperatures (ΔH/R = 10 000 K)">Mean kinetic temperature</dt><dd>${mktHTML(z.id)}</dd>
          <dt>Sensor calibration</dt><dd>${calibrationHTML(z.id, 'temperature')}</dd>
        </dl>
        <div class="control-row">
          <label class="sr-only" for="sp-${z.id}">New setpoint for ${esc(z.name)}</label>
          <input class="input num" id="sp-${z.id}" type="number" step="0.5" min="${t.setpointMin}" max="${t.setpointMax}" value="${isGood(z.readings.temperatureSetpoint) ? z.readings.temperatureSetpoint.value : ''}" ${writable ? '' : 'disabled'} aria-describedby="spr-${z.id}">
          <button class="btn sm" type="button" ${writable ? '' : 'disabled'}>Apply setpoint</button>
          <span class="reason" id="spr-${z.id}">${icon('lock')}${esc(reason)}</span>
        </div>
      </div>
      <div class="reading-block">
        <h3>${icon('droplet')}Relative humidity ${statusChip(z.status.humidity.status)}</h3>
        <div class="big-pair">${valueBlock('Measured', z.readings.humidity, '%RH')}</div>
        ${rangeBar({ limits: h, unit: '%RH', reading: z.readings.humidity })}
        <dl class="kv">
          <dt>Acceptable range (alert limits)</dt><dd>${lim(h.alertLow, '%RH')} to ${lim(h.alertHigh, '%RH')}</dd>
          <dt>Action limits</dt><dd>${lim(h.actionLow, '%RH')} to ${lim(h.actionHigh, '%RH')}</dd>
          <dt>Evaluation</dt><dd>${esc(z.status.humidity.reason)}</dd>
          <dt>Sensor calibration</dt><dd>${calibrationHTML(z.id, 'humidity')}</dd>
        </dl>
        <div class="notice">${icon('info')}<span>Monitoring only. No humidity control or override is mapped on this site.</span></div>
      </div>
    </div>
    <div class="card-foot"><span>Limits: ${override ? '<strong>Browser override active</strong> (this browser only)' : esc(THRESHOLDS_LABEL)}. ${esc(CALIBRATION_LABEL)}. MKT is a calculation on recorded data, not a compliance statement.${mode === 'demo' ? ' Values illustrative.' : ''}</span><a href="#/settings">Edit thresholds</a></div>
  </section>`;
}

export default {
  mount(root, { params }) {
    let zone = params.get('zone') && ZONES.some((z) => z.id === params.get('zone')) ? params.get('zone') : 'all';
    root.innerHTML = `<div class="page-head">
        <div class="titles"><h1>Environmental Conditions</h1><p>Per-zone temperature against setpoint and humidity against limits</p></div>
        <div class="toolbar"><label class="field"><span>Zone</span><select class="select" data-zone>
          <option value="all">All zones</option>${ZONES.map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join('')}</select></label></div>
      </div>
      <div class="notice">${icon('info')}<span>${esc(NAMES_ILLUSTRATIVE)}. Limits: ${esc(THRESHOLDS_LABEL)}. Readings older than the stale-after period, or with bad quality, are shown as Unknown.</span></div>
      <div class="grid" data-panels>${stateBox('loading', 'Loading zone conditions…')}</div>`;
    const sel = root.querySelector('[data-zone]');
    sel.value = zone;
    let last = null;
    const render = (s) => {
      last = s;
      if (s.loading) return;
      const zones = zone === 'all' ? s.zones : s.zones.filter((z) => z.id === zone);
      root.querySelector('[data-panels]').innerHTML = zones.map((z) => zonePanel(z, s.mode)).join('');
    };
    sel.addEventListener('change', () => {
      zone = sel.value;
      history.replaceState(null, '', zone === 'all' ? '#/environment' : `#/environment?zone=${zone}`);
      if (last) render(last);
    });
    async function loadMkt() {
      const p = getProvider();
      const now = Date.now();
      for (const z of ZONES) {
        if (!p?.capabilities.history) { mktCache[z.id] = { error: 'Needs history — historian not configured' }; continue; }
        try {
          const [d] = await p.history({ metric: 'temperature', zoneIds: [z.id], from: now - 30 * 864e5, to: now, stepMs: 3600e3 });
          const vals = d.points.map((x) => x[1]).filter((v) => v != null);
          const v = meanKineticTemperature(vals);
          mktCache[z.id] = v == null ? { error: 'Not enough data' } : { value: v, samples: vals.length };
        } catch (err) { mktCache[z.id] = { error: err.notConfigured ? 'Needs history — historian not configured' : err.message }; }
      }
      if (last) render(last);
    }
    let mktMode = null;

    return {
      update(s) { render(s); if (!s.loading && s.mode !== mktMode && s.mode !== 'starting') { mktMode = s.mode; loadMkt(); } },
      onParams(p) { zone = p.get('zone') || 'all'; sel.value = zone; if (last) render(last); },
    };
  },
};
