/* HVAC Systems — Hybrid units on one side, Rooftop units on the other.
 * Unit cards with locked on/off toggles, live detail panel, run hours and duty. */
import { NAMES_ILLUSTRATIVE, EQUIPMENT_TYPES } from '../config/site.js';
import { ROLE_POINTS } from '../config/points.js';
import { APP_CONFIG } from '../config/app-config.js';
import { icon } from '../ui/icons.js';
import { esc, num, dateTime, timeSec, ago } from '../util/format.js';
import { statusChip, readingHTML, openDrawer, toggleHTML, confirmDialog, toast, DEMO_TAG } from '../ui/components.js';
import { isGood, QUALITY_LABEL } from '../data/quality.js';
import { lineChart } from '../ui/charts.js';
import { controlsAvailable, commandUnit, releaseUnit, getLive } from '../data/store.js';

const STATE = {
  running: { label: 'Running', st: 'normal', ic: 'check' },
  standby: { label: 'Standby', st: 'info', ic: 'dot' },
  stopped: { label: 'Stopped — expected running', st: 'critical', ic: 'alarm' },
  unknown: { label: 'Unknown', st: 'unknown', ic: 'info' },
};
const stateChip = (s) => `<span class="status-chip st-${STATE[s].st}">${icon(STATE[s].ic)}${STATE[s].label}</span>`;
const MODE_LABEL = { heating: 'Heating', cooling: 'Cooling', standby: 'Standby', unknown: 'Unknown' };
const LIVE_COLORS = { supplyAirTemp: '#2a78d6', returnAirTemp: '#d95926', temperature: '#199e70' };

/** Formats any role's reading for display ("Not mapped", "Unknown", or the value). */
function roleValue(role, r) {
  if (r?.error === 'Role not mapped') return '<span class="muted">Not mapped</span>';
  if (!isGood(r)) return `<span class="v-unknown">Unknown</span> <span class="q-flag">${esc(QUALITY_LABEL[r?.quality] || 'Missing')}</span>`;
  const v = r.value;
  switch (role) {
    case 'runStatus': return v ? 'Running' : 'Off';
    case 'enable': return v ? 'Enabled' : 'Disabled';
    case 'fanSchedule': return v ? 'Scheduled on' : 'Scheduled off';
    case 'fanStatus': return v ? 'Running' : 'Off';
    case 'filterAlarm': return v ? '<span class="status-chip st-warning">Alarm — replace filter</span>' : 'Normal';
    case 'operatingMode': return MODE_LABEL[v] || esc(v);
    case 'compressorStage': return `${v} on`;
    case 'runHours': return `${Number(v).toLocaleString('en-ZA')} h`;
    case 'airflow': return `${num(v, 0)} ${esc(r.unit || '')}${ROLE_POINTS.airflow.unitConfirmed ? '' : ' <span class="small muted">(unit assumed)</span>'}`;
    default: return readingHTML(r);
  }
}

const DETAIL_ROLES = ['runStatus', 'operatingMode', 'hybridStage', 'enable', 'fanSchedule', 'fanStatus', 'compressorStage',
  'temperature', 'temperatureSetpoint', 'supplyAirTemp', 'returnAirTemp', 'airflow', 'filterAlarm', 'faultCode', 'runHours'];

export default {
  mount(root) {
    const ui = { q: '', state: 'all' };
    let last = null;
    let detail = null; // { id, drawer, chart }

    root.innerHTML = `<div class="page-head">
        <div class="titles"><h1>HVAC Systems</h1><p>6 hybrid units and 5 rooftop units serving the storage zones</p></div>
        <div class="toolbar">
          <label class="search"><span class="sr-only">Search equipment</span>${icon('search')}<input class="input" type="search" id="hvac-q" placeholder="Search ID, name or zone" data-q></label>
          <label class="field"><span class="sr-only">Operating state</span><select class="select" id="hvac-state" data-state aria-label="Filter by operating state">
            <option value="all">All states</option><option value="running">Running</option><option value="standby">Standby</option><option value="stopped">Stopped</option><option value="unknown">Unknown</option></select></label>
        </div>
      </div>
      <div data-ctrl-note></div>
      <div class="unit-groups" data-groups></div>
      <section class="card" aria-labelledby="duty-h">
        <div class="card-head"><h2 id="duty-h">Run hours and duty rotation</h2><span data-duty-tag></span>
          <span class="sub">Units well above their group average are candidates for duty rotation or earlier service.</span></div>
        <div data-duty></div>
      </section>`;
    const $ = (s) => root.querySelector(s);

    function controlNote(s) {
      const c = controlsAvailable();
      $('[data-ctrl-note]').innerHTML = c.ok
        ? `<div class="notice ${s.mode === 'demo' ? 'demo' : 'warn'}">${icon('info')}<span><strong>Unit controls enabled.</strong> Every switch asks for confirmation, is shown as pending until the unit reports the new state, and is recorded in the Audit Trail. ${esc(c.reason)}</span></div>`
        : `<div class="notice">${icon('lock')}<span><strong>Unit controls locked.</strong> ${esc(c.reason)}. The switches show each unit's current enable state only. ${esc(NAMES_ILLUSTRATIVE)}.</span></div>`;
    }

    function unitCard(e, ctrl) {
      const r = e.readings;
      return `<article class="unit-card ${e.opState}" data-unit="${esc(e.id)}">
        <header>
          <button class="unit-title" type="button" data-open="${esc(e.id)}"><strong class="mono">${esc(e.id)}</strong><span>${esc(e.zoneName || '')}</span></button>
          ${stateChip(e.opState)}
        </header>
        <dl class="unit-vals">
          <div><dt>Space</dt><dd>${readingHTML(r.temperature)}</dd></div>
          <div><dt>Supply air</dt><dd>${readingHTML(r.supplyAirTemp)}</dd></div>
          <div><dt>Return air</dt><dd>${readingHTML(r.returnAirTemp)}</dd></div>
          <div><dt>Mode</dt><dd>${e.mode === 'unknown' ? '<span class="v-unknown">Unknown</span>' : MODE_LABEL[e.mode]}${e.type === 'hybrid' && isGood(r.hybridStage) ? `<span class="sub">${esc(r.hybridStage.value)}</span>` : ''}</dd></div>
        </dl>
        <footer>
          ${toggleHTML({ id: e.id, on: isGood(r.enable) ? r.enable.value : null, disabled: !ctrl.ok || !!e.pending || !isGood(r.enable), reason: ctrl.ok ? 'Current state unknown' : ctrl.reason, pending: !!e.pending, label: `${e.id} on/off` })}
          <span class="unit-meta">${e.openAlarms ? statusChip(e.alarmStatus, `${e.openAlarms} alarm${e.openAlarms > 1 ? 's' : ''}`) : ''}<span class="muted small" title="${esc(dateTime(e.lastUpdate))}">${e.lastUpdate ? esc(timeSec(e.lastUpdate)) : 'No data'}</span></span>
        </footer>
      </article>`;
    }

    function groups(s) {
      const q = ui.q.trim().toLowerCase();
      const ctrl = controlsAvailable();
      return Object.entries(EQUIPMENT_TYPES).map(([type, t]) => {
        const all = s.equipment.filter((e) => e.type === type);
        const shown = all.filter((e) => (ui.state === 'all' || e.opState === ui.state) && (!q || [e.id, e.name, e.zoneName].join(' ').toLowerCase().includes(q)));
        const count = (st) => all.filter((e) => e.opState === st).length;
        const alarms = all.reduce((n, e) => n + (e.openAlarms || 0), 0);
        return `<section class="card unit-group" aria-labelledby="g-${type}">
          <div class="card-head">
            <h2 id="g-${type}">${esc(t.label)}</h2>
            <span class="group-sum"><b>${count('running')} / ${all.length}</b> running</span>
            <div class="actions small muted">${count('standby') ? `<span>${count('standby')} standby</span>` : ''}${count('stopped') ? `<span class="q-flag" style="color:var(--crit)">${count('stopped')} stopped</span>` : ''}${count('unknown') ? `<span class="q-flag">${count('unknown')} unknown</span>` : ''}${alarms ? `<span>${alarms} open alarm${alarms > 1 ? 's' : ''}</span>` : ''}${s.mode === 'demo' ? DEMO_TAG : ''}</div>
          </div>
          <div class="unit-grid">${shown.length ? shown.map((e) => unitCard(e, ctrl)).join('') : '<p class="muted small" style="padding:8px 4px">No units match the filters.</p>'}</div>
        </section>`;
      }).join('');
    }

    function duty(s) {
      const rows = Object.entries(EQUIPMENT_TYPES).map(([type, t]) => {
        const units = s.equipment.filter((e) => e.type === type);
        const hrs = units.map((e) => (isGood(e.readings.runHours) ? e.readings.runHours.value : null));
        const known = hrs.filter((h) => h != null);
        if (!known.length) return `<div class="duty-group"><h3>${esc(t.label)}</h3><p class="muted small">Run hours ${units.some((e) => e.readings.runHours?.error === 'Role not mapped') ? 'not mapped yet' : 'not available'}.</p></div>`;
        const avg = known.reduce((a, b) => a + b, 0) / known.length;
        const max = Math.max(...known);
        return `<div class="duty-group"><h3>${esc(t.label)} <span class="muted small">group average ${Math.round(avg).toLocaleString('en-ZA')} h</span></h3>
          ${units.map((e, i) => {
            const h = hrs[i];
            const dev = h == null ? null : (h - avg) / avg;
            const flag = dev != null && dev > 0.25; // 25 % above the group average
            return `<div class="duty-row"><span class="mono">${esc(e.id)}</span>
              <div class="duty-bar" role="img" aria-label="${esc(e.id)} run hours ${h ?? 'unknown'}"><i style="width:${h == null ? 0 : (h / max) * 100}%" class="${flag ? 'hi' : ''}"></i><b style="left:${(avg / max) * 100}%" title="Group average"></b></div>
              <span class="num">${h == null ? '<span class="v-unknown">Unknown</span>' : `${h.toLocaleString('en-ZA')} h`}</span>
              <span class="small ${flag ? '' : 'muted'}">${dev == null ? '' : flag ? `<span class="status-chip st-warning">+${Math.round(dev * 100)}% — rotate duty</span>` : `${dev >= 0 ? '+' : ''}${Math.round(dev * 100)}%`}</span></div>`;
          }).join('')}</div>`;
      });
      return `<div class="duty">${rows.join('')}</div>`;
    }

    function render(s) {
      last = s;
      if (s.loading) return;
      controlNote(s);
      const focusId = document.activeElement?.dataset?.open || document.activeElement?.dataset?.toggle;
      $('[data-groups]').innerHTML = groups(s);
      if (focusId) root.querySelector(`[data-open="${focusId}"], [data-toggle="${focusId}"]`)?.focus();
      $('[data-duty]').innerHTML = duty(s);
      $('[data-duty-tag]').innerHTML = s.mode === 'demo' ? DEMO_TAG : '';
      if (detail) updateDetail();
    }

    /* ---- controls ------------------------------------------------------------ */
    async function toggle(id) {
      const e = last?.equipment.find((x) => x.id === id);
      if (!e || !isGood(e.readings.enable)) return;
      const target = !e.readings.enable.value;
      const { ok, note } = await confirmDialog({
        title: `Switch ${id} ${target ? 'ON' : 'OFF'}?`,
        message: `${e.name} serves ${e.zoneName}. ${target ? 'The unit will start.' : 'The unit will stop and the zone may drift out of range.'}${last.mode === 'demo' ? ' Demonstration: no equipment is affected.' : ''}`,
        confirmLabel: `Switch ${target ? 'on' : 'off'}`, danger: !target, withNote: true,
      });
      if (!ok) return;
      try { await commandUnit(id, target, note); toast(`${id}: command sent — waiting for the unit to confirm`); } catch (err) { toast(err.message, 'err'); }
    }

    /* ---- detail drawer ------------------------------------------------------- */
    function detailBody(e) {
      const ctrl = controlsAvailable();
      const roles = DETAIL_ROLES.filter((r) => r in e.readings);
      return `<dl class="kv">
          <dt>Operating state</dt><dd>${stateChip(e.opState)}</dd>
          ${roles.map((r) => `<dt>${esc(ROLE_POINTS[r].label)}</dt><dd>${roleValue(r, e.readings[r])}</dd>`).join('')}
          <dt>Last update</dt><dd>${e.lastUpdate ? `${esc(dateTime(e.lastUpdate))} SAST (${esc(ago(e.lastUpdate))})` : 'No timestamp'}</dd>
        </dl>
        <div><h3>Controls</h3>
          <div class="toolbar" style="margin-top:8px">
            ${toggleHTML({ id: e.id, on: isGood(e.readings.enable) ? e.readings.enable.value : null, disabled: !ctrl.ok || !!e.pending || !isGood(e.readings.enable), reason: ctrl.reason, pending: !!e.pending, label: `${e.id} on/off` })}
            <button class="btn sm" type="button" data-release ${ctrl.ok && (APP_CONFIG.controls.releaseSupported || last.mode === 'demo') ? '' : 'disabled'}>Return to auto</button>
          </div>
          <p class="small muted" style="margin-top:8px">${icon('lock')} ${esc(ctrl.ok ? 'Switching asks for confirmation and is recorded in the Audit Trail.' : ctrl.reason)}</p></div>
        <div><h3>Open alarms</h3><p class="small">${e.openAlarms ? `${e.openAlarms} open — <a href="#/alarms">view in Alarm Register</a>` : 'None'}</p></div>`;
    }

    function liveSeries(id) {
      const from = Date.now() - APP_CONFIG.live.windowMs;
      return ['supplyAirTemp', 'returnAirTemp', 'temperature'].map((role) => ({ role, label: ROLE_POINTS[role].label, color: LIVE_COLORS[role], points: getLive('equipment', id, role, from) }));
    }

    function drawChart() {
      const series = liveSeries(detail.id);
      const box = detail.drawer.el.querySelector('[data-unit-chart]');
      detail.chart?.destroy(); detail.chart = null;
      if (series.every((s) => s.points.length < 2)) { box.innerHTML = '<p class="muted small">Collecting live readings — the graph appears after the second reading.</p>'; return; }
      if (!box.querySelector('canvas')) box.innerHTML = '<div class="chart-box" style="height:200px"><canvas></canvas></div>';
      const now = Date.now();
      detail.chart = lineChart(box.querySelector('canvas'), series.filter((s) => s.points.length), { unit: '°C', yTitle: 'Temperature (°C)', rangeMs: APP_CONFIG.live.windowMs, from: now - APP_CONFIG.live.windowMs, to: now, band: null, action: [] });
    }

    function updateDetail() {
      const e = last.equipment.find((x) => x.id === detail.id);
      if (!e || !detail.drawer.el.isConnected) { detail = null; return; }
      detail.drawer.el.querySelector('[data-unit-body]').innerHTML = detailBody(e);
      drawChart();
    }

    function openDetail(id) {
      const e = last?.equipment.find((x) => x.id === id);
      if (!e) return;
      detail?.chart?.destroy();
      const drawer = openDrawer({
        title: `${e.id} · ${e.name}`,
        subtitle: `${esc(EQUIPMENT_TYPES[e.type].label.slice(0, -1))} · serves ${esc(e.zoneName || '')}${last.mode === 'demo' ? ' · Demonstration data' : ''}`,
        body: `<div><h3>Live temperatures (last hour)</h3>
            <div class="legend" style="padding:6px 0">${['supplyAirTemp', 'returnAirTemp', 'temperature'].map((r) => `<span><i style="background:${LIVE_COLORS[r]}"></i>${ROLE_POINTS[r].label}</span>`).join('')}</div>
            <div data-unit-chart></div></div>
          <div data-unit-body></div>`,
        onClose: () => { detail?.chart?.destroy(); detail = null; },
      });
      detail = { id, drawer, chart: null };
      drawer.el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-toggle]')) toggle(id);
        if (ev.target.closest('[data-release]')) releaseUnit(id).then(() => toast(`${id} returned to automatic control`), (err) => toast(err.message, 'err'));
      });
      updateDetail();
    }

    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-toggle]');
      if (t && root.contains(t)) { toggle(t.dataset.toggle); return; }
      const o = ev.target.closest('[data-open]');
      if (o) openDetail(o.dataset.open);
    });
    $('[data-q]').addEventListener('input', (ev) => { ui.q = ev.target.value; if (last) render(last); });
    $('[data-state]').addEventListener('change', (ev) => { ui.state = ev.target.value; if (last) render(last); });
    return { update: render, destroy() { detail?.chart?.destroy(); } };
  },
};

