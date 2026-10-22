/* Controls — landing page.
 * Summary strip, one control card per unit (hybrid | rooftop), then LIVE READINGS per zone.
 * No optimistic UI: a command is PENDING until its feedback point confirms it. */
import { ZONES, EQUIPMENT_TYPES, equipmentForZone } from '../config/site.js';
import { ROLE_POINTS, controllerName, slotPath } from '../config/points.js';
import { APP_CONFIG } from '../config/app-config.js';
import { icon } from '../ui/icons.js';
import { esc, num, dateTime, time } from '../util/format.js';
import { statusChip, bigReadingHTML, readingHTML, qualityChip, lastGoodHTML, ageHTML, runChip, fanHTML, openDrawer, confirmDialog, toast } from '../ui/components.js';
import { isGood, QUALITY, QUALITY_LABEL, rangeText } from '../data/quality.js';
import {
  state as S, controlDefs, controlAvailability, commandedValue, getCommand, sendCommand, setpointLimits,
  activeAlarms, connectionOk, canOperate, RANGES,
} from '../data/store.js';
import { mountTrend } from '../ui/trend-card.js';
import { MEASURE_COLORS } from '../ui/charts.js';

const MODE_LABEL = { cooling: 'Cooling', heating: 'Heating', 'fan only': 'Fan only', standby: 'Standby', unknown: '—' };
const boolText = (def, v) => (v == null ? '—' : v ? (def.onLabel || 'On').toUpperCase() : (def.offLabel || 'Off').toUpperCase());

function cmdStatusHTML(rec, def) {
  if (!rec) return '';
  const val = def.kind === 'setpoint' ? `${num(rec.value)} °C` : def.kind === 'mode' ? MODE_LABEL[rec.value] : boolText(def, rec.value);
  if (rec.status === 'pending') return `<div class="cmd cmd-pending" role="status"><span class="spinner sm" aria-hidden="true"></span><b>PENDING</b> ${esc(val)} · sent ${esc(time(rec.sentAt))} by ${esc(rec.by)} — waiting for feedback</div>`;
  if (rec.status === 'confirmed') return `<div class="cmd cmd-ok" role="status">${icon('check')}<b>CONFIRMED</b> ${esc(val)} at ${esc(time(rec.resolvedAt))}</div>`;
  if (rec.status === 'not-confirmed') {
    const act = rec.actual == null ? '—' : def.kind === 'setpoint' ? `${num(rec.actual)} °C` : def.kind === 'mode' ? MODE_LABEL[rec.actual] || rec.actual : boolText(def, rec.actual);
    return `<div class="cmd cmd-bad" role="alert">${icon('alarm')}<b>NOT CONFIRMED</b> ${esc(val)} — controller still reports ${esc(act)}${rec.override ? ` (overridden by ${esc(rec.override.source)})` : ''}</div>`;
  }
  if (rec.status === 'failed') return `<div class="cmd cmd-bad" role="alert">${icon('alarm')}<b>FAILED</b> ${esc(rec.error || '')}</div>`;
  return '';
}

function actualHTML(e, def) {
  if (!def.actualRole) return '';
  const r = e.readings[def.actualRole];
  let v;
  if (!isGood(r)) v = `<span class="v-none">—</span> <span class="q-label">${esc(QUALITY_LABEL[r?.quality] || 'NOT MAPPED')}</span>`;
  else if (def.actualRole === 'fanStatus') v = r.value ? '<b class="ok-ink">Fan running</b>' : '<b>Fan off</b>';
  else v = `<b class="mono-v">${num(r.value)}</b> ${esc(r.unit || '')}`;
  return `<div class="fb"><span class="label-caps">Actual · ${esc(def.actualLabel)}</span><span>${v}</span></div>`;
}

function commandedHTML(e, def) {
  const role = def.kind === 'mode' ? null : def.commandRole;
  const r = role ? e.readings[role] : null;
  let v;
  if (def.kind === 'mode') v = e.mode === 'unknown' ? '<span class="v-none">—</span> <span class="q-label">UNKNOWN</span>' : `<b>${esc(MODE_LABEL[e.mode] || e.mode)}</b>`;
  else if (!isGood(r)) v = `<span class="v-none">—</span> <span class="q-label">${esc(QUALITY_LABEL[r?.quality] || 'NOT MAPPED')}</span>`;
  else v = def.kind === 'setpoint' ? `<b class="mono-v">${num(r.value)}</b> °C` : `<b>${boolText(def, r.value)}</b>`;
  return `<div class="fb"><span class="label-caps">Commanded</span><span>${v}</span></div>`;
}

export default {
  mount(root) {
    const drafts = new Map();     // `${unitId}` -> setpoint draft
    let interacting = null;       // unit id whose slider is being dragged
    let last = null;
    let typeFilter = 'all';
    const trends = [];
    let range = '1h';

    root.innerHTML = `
      <div class="page-head">
        <div class="titles"><h1>Controls</h1><p>Unit control with confirmed feedback, then live readings per zone</p></div>
        <div class="toolbar">
          <div class="seg" role="group" aria-label="Unit type">
            <button type="button" data-type="all" aria-pressed="true">All units</button>
            <button type="button" data-type="hybrid" aria-pressed="false">Hybrid</button>
            <button type="button" data-type="rooftop" aria-pressed="false">Rooftop</button>
          </div>
          <a class="btn" href="#live-readings" data-jump>${icon('trends')}Live readings</a>
        </div>
      </div>
      <section class="summary-strip" data-summary aria-label="Summary"></section>
      <div data-role-note></div>
      <section class="unit-groups" data-groups aria-label="Unit controls"></section>
      <section class="live-section" id="live-readings" aria-labelledby="lr-h">
        <div class="section-head">
          <h2 id="lr-h">Live readings</h2>
          <span class="muted small">Per zone: temperature, humidity, the units serving it, and trends with limits, alarms and fan state.</span>
          <div class="seg" role="group" aria-label="Trend range">${['1h', '24h', '7d'].map((k) => `<button type="button" data-range="${k}" aria-pressed="${k === range}">${RANGES[k].label}</button>`).join('')}</div>
        </div>
        <div class="zone-live-grid" data-zones></div>
      </section>`;
    const $ = (s) => root.querySelector(s);

    /* ---- summary strip ------------------------------------------------------- */
    function summary(s) {
      const units = s.equipment;
      const run = (t) => units.filter((e) => (!t || e.type === t) && e.runState === 'running').length;
      const open = activeAlarms();
      const crit = open.filter((a) => a.severity === 'critical').length;
      const sensors = [];
      for (const e of units) for (const role of ['temperature', 'humidity']) if (e.readings[role] && e.readings[role].quality !== QUALITY.NOT_MAPPED) sensors.push(e.readings[role]);
      const offline = sensors.filter((r) => r.quality !== QUALITY.LIVE).length;
      const c = s.connection;
      const connTile = s.mode === 'demo' && connectionOk()
        ? `<div class="tile tile-demo"><span class="label-caps">Comms</span><div class="tile-v">${icon('info')}SIMULATED</div><span class="small">Demo data — not the JACE</span></div>`
        : connectionOk()
          ? `<div class="tile tile-ok"><span class="label-caps">Comms</span><div class="tile-v">${icon('check')}JACE connected</div>${ageHTML(s.lastPollAt, 'Last read')}</div>`
          : `<div class="tile tile-bad"><span class="label-caps">Comms</span><div class="tile-v">${icon('alarm')}${c.status === 'not-configured' ? 'Not connected' : 'Connection lost'}</div><span class="small">${c.lastOkAt ? `Last good read ${esc(time(c.lastOkAt))}` : esc(c.message)}</span></div>`;
      $('[data-summary]').innerHTML = `
        <div class="tile"><span class="label-caps">Units running</span><div class="tile-v"><span class="mono-v">${run()}</span><span class="of">/ ${units.length}</span></div>
          <span class="small"><span class="type-dot hyb"></span>Hybrid ${run('hybrid')}/6 · <span class="type-dot rtu"></span>Rooftop ${run('rooftop')}/5</span></div>
        <div class="tile ${crit ? 'tile-bad' : open.length ? 'tile-warn' : ''}"><span class="label-caps">Active alarms</span><div class="tile-v"><span class="mono-v">${open.length}</span></div>
          <span class="small">${crit} critical · ${open.length - crit} warning · <a href="#/alarms">Alarm register</a></span></div>
        <div class="tile ${offline ? 'tile-warn' : ''}"><span class="label-caps">Sensors offline</span><div class="tile-v"><span class="mono-v">${offline}</span><span class="of">/ ${sensors.length}</span></div>
          <span class="small">Temperature and humidity sensors not LIVE</span></div>
        ${connTile}`;
    }

    /* ---- control widgets ------------------------------------------------------- */
    function controlHTML(e, def) {
      const avail = controlAvailability(e, def);
      const dis = avail.ok ? '' : `disabled title="${esc(avail.reason)}" aria-description="${esc(avail.reason)}"`;
      const rec = getCommand(e.id, def.id);
      const ovr = def.commandRole && e.readings[def.commandRole]?.override;
      const head = `<div class="ctl-head"><span class="label-caps">${esc(def.label)}</span>
        ${ovr ? `<span class="ovr-chip" title="Commands from this dashboard will not take effect">${icon('alarm')}Overridden by ${esc(ovr.source)}</span>` : ''}
        ${def.feedbackTodo ? '<span class="todo-chip" title="TODO: the feedback point for this command is not confirmed yet. Until it is, the command is confirmed by reading back the command point itself. See js/config/controls.js">TODO feedback</span>' : ''}
        ${!avail.ok && !avail.notMapped && def.kind !== 'status' ? `<span class="lock" title="${esc(avail.reason)}">${icon('lock')}</span>` : ''}</div>`;

      if (def.kind === 'status') {
        const r = e.readings[def.role];
        const v = def.role === 'enable' && isGood(r) ? `<b>${r.value ? 'ENABLED' : 'DISABLED'}</b>` : readingHTML(r, { digits: def.role === 'fanSpeed' ? 0 : 1, lastGood: true });
        return `<div class="ctl ctl-status">${head}<div class="ctl-row"><span>${v}</span><span class="small muted">${esc(def.note || '')}</span></div></div>`;
      }
      if (avail.notMapped) {
        return `<div class="ctl ctl-unmapped" title="${esc(avail.reason)}">${head}<div class="ctl-row">${qualityChip('not-mapped')}<span class="small muted">${esc(def.todo || avail.reason)}</span></div></div>`;
      }
      let widget = '';
      if (def.kind === 'toggle') {
        const cur = commandedValue(e, def);
        widget = `<div class="seg seg-cmd" role="group" aria-label="${esc(def.label)}">
          <button type="button" data-cmd="${e.id}|${def.id}|1" aria-pressed="${cur === true}" ${dis}>${esc(def.onLabel)}</button>
          <button type="button" data-cmd="${e.id}|${def.id}|0" aria-pressed="${cur === false}" ${dis}>${esc(def.offLabel)}</button></div>`;
      } else if (def.kind === 'mode') {
        widget = `<div class="seg seg-cmd" role="group" aria-label="Mode">${def.options.map((o) => `<button type="button" data-cmd="${e.id}|${def.id}|${o.value}" aria-pressed="${e.mode === o.value}" class="mode-${o.value === 'cooling' ? 'cool' : o.value === 'heating' ? 'heat' : 'fan'}" ${dis}>${esc(o.label)}</button>`).join('')}</div>`;
      } else if (def.kind === 'setpoint') {
        const lim = setpointLimits(e.id);
        const cur = commandedValue(e, def);
        const draft = drafts.has(e.id) ? drafts.get(e.id) : cur;
        const changed = draft != null && cur != null && Math.abs(draft - cur) >= 0.05;
        widget = `<div class="sp">
          <input type="range" class="sp-range" id="sp-${e.id}" data-sp="${e.id}" min="${lim.min ?? 0}" max="${lim.max ?? 40}" step="${lim.step}" value="${draft ?? lim.min ?? 0}" aria-label="${esc(e.id)} temperature setpoint" ${dis}>
          <output class="sp-val mono-v" data-sp-out="${e.id}">${draft == null ? '—' : num(draft)} °C</output>
          <button type="button" class="btn sm primary" data-sp-apply="${e.id}" ${dis} ${changed ? '' : 'disabled'}>Apply</button>
          <span class="sp-lim small muted">${lim.min ?? '—'}–${lim.max ?? '—'} °C</span></div>`;
      }
      return `<div class="ctl">${head}${widget}
        <div class="ctl-fb">${commandedHTML(e, def)}${actualHTML(e, def)}</div>
        ${cmdStatusHTML(rec, def)}
        ${!avail.ok && rec?.status !== 'pending' ? `<div class="ctl-reason small">${icon('lock')}${esc(avail.reason)}</div>` : ''}</div>`;
    }

    const isUnmapped = (e, d) => d.kind !== 'status' && controlAvailability(e, d).notMapped;
    /** All controls without a point, in one compact line (reason on hover). */
    function unmappedRow(e) {
      const list = controlDefs(e.type).filter((d) => isUnmapped(e, d));
      if (!list.length) return '';
      return `<div class="ctl-unmapped-row">${qualityChip('not-mapped')}${list.map((d) => `<span class="um" tabindex="0" title="${esc(controlAvailability(e, d).reason)}">${esc(d.label)}</span>`).join('<span class="muted">·</span>')}</div>`;
    }

    function unitCard(e) {
      const t = EQUIPMENT_TYPES[e.type];
      const fanOff = isGood(e.readings.fanStatus) && e.readings.fanStatus.value === false;
      const second = e.type === 'rooftop'
        ? bigReadingHTML(e.readings.humidity, { label: 'Humidity', cls: 'hum sm' })
        : bigReadingHTML(e.readings.fanSpeed, { label: 'Fan speed', digits: 0, cls: 'sm' });
      return `<article class="ucard ${e.type}" data-unit="${e.id}">
        <header class="ucard-head">
          ${fanHTML(e)}
          <div class="ucard-title"><button type="button" class="linkish" data-open="${e.id}" title="Open ${esc(e.name)} details"><strong>${esc(e.id)}</strong></button>
            <span class="small muted">${esc(t.short)} · ${esc(e.zoneName || '')} · <span class="mono">${esc(controllerName(e.id))}</span></span></div>
          <div class="ucard-state">${runChip(e.runState)}${fanOff ? `<span class="badge-fanoff">${icon('dot')}FAN OFF</span>` : ''}</div>
        </header>
        ${e.faults.length ? `<div class="faults">${e.faults.map((f) => `<span class="status-chip st-${f.severity === 'critical' ? 'critical' : 'warning'}">${icon('alarm')}${esc(f.label)}</span>`).join('')}</div>` : ''}
        <div class="ucard-readings">${bigReadingHTML(e.readings.temperature, { label: 'Space temperature', cls: 'temp' })}${second}</div>
        <div class="ctls">${controlDefs(e.type).filter((d) => !isUnmapped(e, d)).map((d) => controlHTML(e, d)).join('')}
          ${unmappedRow(e)}</div>
      </article>`;
    }

    function groups(s) {
      const html = Object.entries(EQUIPMENT_TYPES).filter(([type]) => typeFilter === 'all' || typeFilter === type).map(([type, t]) => {
        const units = s.equipment.filter((e) => e.type === type);
        const running = units.filter((e) => e.runState === 'running').length;
        return `<section class="ugroup ${type}" aria-labelledby="ug-${type}">
          <div class="ugroup-head"><span class="type-dot ${type === 'hybrid' ? 'hyb' : 'rtu'}"></span><h2 id="ug-${type}">${esc(t.label)}</h2>
            <span class="muted"><b class="mono-v">${running}</b> / ${units.length} running</span></div>
          <div class="ugrid">${units.map(unitCard).join('')}</div></section>`;
      }).join('');
      const g = $('[data-groups]');
      g.classList.toggle('single', typeFilter !== 'all');
      // Do not rebuild a card while its slider is being dragged.
      if (interacting) {
        for (const e of s.equipment) {
          if (e.id === interacting) continue;
          const el = g.querySelector(`[data-unit="${e.id}"]`);
          if (el) el.outerHTML = unitCard(e);
        }
      } else {
        g.innerHTML = html;
      }
    }

    /* ---- zones: live readings ------------------------------------------------------- */
    function zoneSkeleton() {
      $('[data-zones]').innerHTML = ZONES.map((z) => `<article class="zcard" data-zone="${z.id}">
          <header class="zcard-head"><div><h3>${esc(z.name)}</h3><span class="small muted">${esc(z.description)}</span></div><div data-zstatus></div></header>
          <div class="zcard-readings" data-zread></div>
          <div class="zcard-units" data-zunits></div>
          <div class="zcard-trends">
            <div class="ztrend"><div class="ztrend-h"><span class="dot-measure temp"></span>Temperature (°C)</div><div data-trend="${z.id}|temperature"></div></div>
            <div class="ztrend"><div class="ztrend-h"><span class="dot-measure hum"></span>Humidity (%RH)</div><div data-trend="${z.id}|humidity"></div></div>
          </div>
        </article>`).join('');
      for (const z of ZONES) {
        for (const measure of ['temperature', 'humidity']) {
          const el = root.querySelector(`[data-trend="${z.id}|${measure}"]`);
          const src = () => S.zones.find((x) => x.id === z.id)?.sourceUnit;
          trends.push(mountTrend(el, {
            measure, unit: measure === 'temperature' ? '°C' : '%RH', yTitle: '',
            series: () => [{ unitId: src(), role: measure, label: `${z.name} ${measure}`, color: MEASURE_COLORS[measure] }],
            limits: () => S.zones.find((x) => x.id === z.id)?.limits?.[measure] || null,
            runUnits: () => equipmentForZone(z.id).map((e) => e.id),
            fanOffUnit: () => src(),
            markers: () => S.alarms.filter((a) => a.zoneId === z.id && (a.role === measure || a.category !== 'threshold')).map((a) => ({ ts: a.raisedAt, severity: a.severity })),
          }));
        }
      }
    }

    function zones(s) {
      for (const z of s.zones) {
        const el = root.querySelector(`[data-zone="${z.id}"]`);
        if (!el) continue;
        el.querySelector('[data-zstatus]').innerHTML = statusChip(z.status.overall);
        el.querySelector('[data-zread]').innerHTML = `
          ${bigReadingHTML(z.readings.temperature, { label: 'Temperature', cls: 'temp' })}
          ${bigReadingHTML(z.readings.humidity, { label: 'Humidity', cls: 'hum' })}
          <div class="zlimits small muted"><span>Limits ${esc(rangeText(z.limits.temperature, '°C'))} · ${esc(rangeText(z.limits.humidity, '%RH'))}</span><span>Sensor: <b>${esc(z.sourceUnit)}</b> (${esc(controllerName(z.sourceUnit))})</span></div>`;
        el.querySelector('[data-zunits]').innerHTML = s.equipment.filter((e) => e.zoneId === z.id).map((e) => {
          const fanOff = isGood(e.readings.fanStatus) && e.readings.fanStatus.value === false;
          return `<button type="button" class="zunit ${e.type}" data-open="${e.id}"><span class="type-dot ${e.type === 'hybrid' ? 'hyb' : 'rtu'}"></span><b>${esc(e.id)}</b>${runChip(e.runState)}${fanOff ? '<span class="badge-fanoff">FAN OFF</span>' : ''}</button>`;
        }).join('');
      }
    }

    function render(s) {
      last = s;
      if (s.loading) return;
      summary(s);
      $('[data-role-note]').innerHTML = canOperate() ? '' : `<div class="notice">${icon('lock')}<span><strong>Viewer role.</strong> Controls are read-only. Switch to Operator in the top bar to operate units.</span></div>`;
      groups(s);
      zones(s);
      trends.forEach((t) => t.tick());
    }

    /* ---- detail drawer per unit ------------------------------------------------------- */
    function openUnit(id) {
      const e = last?.equipment.find((x) => x.id === id);
      if (!e) return;
      const rows = Object.entries(e.readings).map(([role, r]) => `<tr><td>${esc(ROLE_POINTS[role]?.label || role)}</td>
        <td>${readingHTML(r, { digits: ROLE_POINTS[role]?.unit === '°C' || ROLE_POINTS[role]?.unit === '%RH' ? 1 : 0 })}${r.quality !== 'live' ? `<span class="sub">${lastGoodHTML(r)}</span>` : ''}</td>
        <td>${qualityChip(r.quality)}${r.override ? `<span class="sub">Overridden by ${esc(r.override.source)}</span>` : ''}</td>
        <td class="mono small">${esc(slotPath(e.id, role) || '—')}</td></tr>`).join('');
      const d = openDrawer({
        title: `${e.id} · ${e.name}`,
        subtitle: `${esc(EQUIPMENT_TYPES[e.type].short)} unit · ${esc(e.zoneName || '')} · ${esc(controllerName(e.id))}${last.mode === 'demo' ? ' · SIMULATED DATA' : ''}`,
        body: `<div class="toolbar">${runChip(e.runState)}${fanHTML(e)}<span class="muted small">Mode: ${esc(MODE_LABEL[e.mode] || e.mode)}</span></div>
          <div><div class="toolbar" style="justify-content:space-between"><h3>Space temperature</h3><div class="seg" role="group">${['1h', '24h', '7d'].map((k) => `<button type="button" data-drange="${k}" aria-pressed="${k === '1h'}">${RANGES[k].label}</button>`).join('')}</div></div>
            <div data-unit-trend></div></div>
          <div><h3>Points</h3><div class="table-wrap"><table class="data"><thead><tr><th>Reading</th><th>Value</th><th>Quality</th><th>Point</th></tr></thead><tbody>${rows}</tbody></table></div></div>`,
        onClose: () => tr.destroy(),
      });
      const tr = mountTrend(d.el.querySelector('[data-unit-trend]'), {
        measure: 'temperature', unit: '°C', yTitle: '°C',
        series: () => [{ unitId: e.id, role: 'temperature', label: `${e.id} space temperature`, color: MEASURE_COLORS.temperature }],
        limits: () => S.zones.find((z) => z.id === e.zoneId)?.limits?.temperature || null,
        runUnits: () => [e.id], fanOffUnit: () => e.id,
        markers: () => S.alarms.filter((a) => a.source?.id === e.id).map((a) => ({ ts: a.raisedAt, severity: a.severity })),
      });
      tr.load('1h');
      d.el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-drange]');
        if (!b) return;
        d.el.querySelectorAll('[data-drange]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        tr.load(b.dataset.drange);
      });
    }

    /* ---- commands ---------------------------------------------------------------------- */
    async function command(unitId, controlId, raw) {
      const e = last.equipment.find((x) => x.id === unitId);
      const def = controlDefs(e.type).find((d) => d.id === controlId);
      const value = def.kind === 'toggle' ? raw === '1' : def.kind === 'setpoint' ? Number(raw) : raw;
      const old = commandedValue(e, def);
      if (def.kind !== 'setpoint' && old === value) return;
      const show = (v) => (v == null ? 'unknown' : def.kind === 'setpoint' ? `${num(v)} °C` : def.kind === 'mode' ? MODE_LABEL[v] || v : boolText(def, v));
      const ovr = def.commandRole && e.readings[def.commandRole]?.override;
      const { ok, note } = await confirmDialog({
        title: `${e.id}: ${def.label}`,
        message: `${show(old)} → ${show(value)}. ${e.name} serves ${e.zoneName}.${ovr ? ` WARNING: this point is overridden by ${ovr.source}; the command will not take effect.` : ''}${last.mode === 'demo' ? ' SIMULATED — no equipment is affected.' : ''}`,
        confirmLabel: `Send ${show(value)}`, danger: value === false, withNote: true,
      });
      if (!ok) return;
      try {
        await sendCommand(unitId, controlId, value, note);
        if (def.kind === 'setpoint') drafts.delete(unitId);
        toast(`${unitId} ${def.label}: sent — PENDING until the controller confirms`);
      } catch (err) { toast(err.message, 'err'); }
    }

    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-type]');
      if (t) { typeFilter = t.dataset.type; root.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); if (last) render(last); return; }
      const r = ev.target.closest('[data-range]');
      if (r) { range = r.dataset.range; root.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b === r))); trends.forEach((x) => x.load(range)); return; }
      if (ev.target.closest('[data-jump]')) { ev.preventDefault(); $('#live-readings').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const c = ev.target.closest('[data-cmd]');
      if (c && !c.disabled) { const [u, id, v] = c.dataset.cmd.split('|'); command(u, id, v); return; }
      const ap = ev.target.closest('[data-sp-apply]');
      if (ap && !ap.disabled) { const u = ap.dataset.spApply; command(u, 'tempSetpoint', String(drafts.get(u))); return; }
      const o = ev.target.closest('[data-open]');
      if (o) openUnit(o.dataset.open);
    });
    root.addEventListener('input', (ev) => {
      const sl = ev.target.closest('[data-sp]');
      if (!sl) return;
      const u = sl.dataset.sp;
      interacting = u;
      drafts.set(u, Number(sl.value));
      root.querySelector(`[data-sp-out="${u}"]`).textContent = `${num(Number(sl.value))} °C`;
      const e = last.equipment.find((x) => x.id === u);
      const cur = commandedValue(e, controlDefs(e.type).find((d) => d.id === 'tempSetpoint'));
      const btn = root.querySelector(`[data-sp-apply="${u}"]`);
      if (btn) btn.disabled = cur == null || Math.abs(Number(sl.value) - cur) < 0.05;
    });
    root.addEventListener('change', (ev) => { if (ev.target.closest('[data-sp]')) interacting = null; });
    root.addEventListener('pointerup', () => { interacting = null; });

    zoneSkeleton();
    let loaded = false;
    return {
      update(s) {
        render(s);
        if (!loaded && !s.loading) { loaded = true; trends.forEach((t) => t.load(range)); }
      },
      destroy() { trends.forEach((t) => t.destroy()); },
    };
  },
};
