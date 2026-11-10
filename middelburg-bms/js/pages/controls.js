/* Controls — landing page.
 * Summary strip, one control card per unit (hybrid | rooftop), then LIVE READINGS per zone.
 * No optimistic UI: a command is PENDING until its feedback point confirms it. */
import { ZONES, EQUIPMENT_TYPES, equipmentForZone } from '../config/site.js';
import { ROLE_POINTS, controllerName, slotPath, alarmRoles } from '../config/points.js';
import { APP_CONFIG } from '../config/app-config.js';
import { icon } from '../ui/icons.js';
import { esc, num, dateTime, time } from '../util/format.js';
import { heroHTML, unitPhotoHTML, statusChip, bigReadingHTML, readingHTML, qualityChip, lastGoodHTML, ageHTML, runChip, fanHTML, openDrawer, confirmDialog, toast } from '../ui/components.js';
import { isGood, QUALITY, QUALITY_LABEL, rangeText } from '../data/quality.js';
import {
  state as S, controlDefs, controlAvailability, commandedValue, getCommand, sendCommand, setpointLimits,
  activeAlarms, connectionOk, canOperate, RANGES,
} from '../data/store.js';
import { mountTrend } from '../ui/trend-card.js';
import { MEASURE_COLORS } from '../ui/charts.js';

const MODE_LABEL = { cooling: 'Cooling', heating: 'Heating', 'fan only': 'Fan only', standby: 'Standby', unknown: '—' };
const boolText = (def, v) => (v == null ? '—' : v ? (def.onLabel || 'On').toUpperCase() : (def.offLabel || 'Off').toUpperCase());

function cmdStatusHTML(rec, def, e) {
  if (!rec) return '';
  const val = def.kind === 'setpoint' ? `${num(rec.value)} °C` : def.kind === 'mode' ? MODE_LABEL[rec.value] : boolText(def, rec.value);
  if (rec.status === 'pending') return `<div class="cmd cmd-pending" role="status"><span class="spinner sm" aria-hidden="true"></span><b>Sending</b> ${esc(val)} · waiting for the unit to confirm</div>`;
  if (rec.status === 'confirmed') {
    // The command point reads back the new value. For start/stop, also check what the unit itself reports (supply fan).
    const fan = e && def.actualRole === 'fanStatus' && def.kind === 'toggle' ? e.readings.fanStatus : null;
    const mismatch = fan && isGood(fan) && fan.value !== rec.value && Date.now() - rec.resolvedAt > 20000;
    if (mismatch) return `<div class="cmd cmd-bad" role="alert">${icon('alarm')}<b>Command accepted, unit not following</b> ${esc(val)} written at ${esc(time(rec.resolvedAt))}, but the unit still reports ${fan.value ? 'fan running' : 'fan off'}. Check the unit / its local controller.</div>`;
    return `<div class="cmd cmd-ok" role="status">${icon('check')}<b>Confirmed</b> ${esc(val)} at ${esc(time(rec.resolvedAt))}${fan && isGood(fan) && fan.value !== rec.value ? ' · waiting for the unit to follow' : ''}</div>`;
  }
  if (rec.status === 'not-confirmed') {
    const act = rec.actual == null ? '—' : def.kind === 'setpoint' ? `${num(rec.actual)} °C` : def.kind === 'mode' ? MODE_LABEL[rec.actual] || rec.actual : boolText(def, rec.actual);
    return `<div class="cmd cmd-bad" role="alert">${icon('alarm')}<b>Not confirmed</b> ${esc(val)}: the unit still reports ${esc(act)}${rec.override ? ` (overridden by ${esc(rec.override.source)})` : ''}</div>`;
  }
  if (rec.status === 'failed') return `<div class="cmd cmd-bad" role="alert">${icon('alarm')}<b>Failed</b> ${esc(rec.error || '')}</div>`;
  return '';
}

export default {
  mount(root) {
    const drafts = new Map();     // `${unitId}` -> setpoint draft
    const notSent = new Map();    // `${unitId}|${controlId}` -> reason a command was not sent (kept on the card)
    let last = null;
    let typeFilter = 'all';
    const trends = [];
    let range = '1h';

    let tab = 'units';
    root.innerHTML = `
      <div data-hero></div>
      <div class="page-head">
        <div class="titles"><h1>Units</h1><p>Start, stop and set each unit. Changes are confirmed by the unit itself.</p></div>
        <div class="toolbar">
          <div class="seg seg-lg" role="tablist" aria-label="View">
            <button type="button" role="tab" data-tab="units" aria-pressed="true">Units</button>
            <button type="button" role="tab" data-tab="readings" aria-pressed="false">Readings &amp; trends</button>
          </div>
        </div>
      </div>
      <section class="summary-strip" data-summary aria-label="Summary"></section>
      <div data-role-note></div>
      <div data-panel="units">
        <div class="filter-row">
          <div class="seg" role="group" aria-label="Unit type">
            <button type="button" data-type="all" aria-pressed="true">All units</button>
            <button type="button" data-type="hybrid" aria-pressed="false"><span class="type-dot hyb"></span>Hybrid</button>
            <button type="button" data-type="rooftop" aria-pressed="false"><span class="type-dot rtu"></span>Rooftop</button>
            <button type="button" data-type="sensor" aria-pressed="false"><span class="type-dot sen"></span>Sensors</button>
          </div>
        </div>
        <section class="unit-groups" data-groups aria-label="Unit controls"></section>
      </div>
      <section class="live-section" data-panel="readings" hidden aria-labelledby="lr-h">
        <div class="section-head">
          <h2 id="lr-h">Readings per zone</h2>
          <div class="seg" role="group" aria-label="Trend range">${['1h', '24h', '7d'].map((k) => `<button type="button" data-range="${k}" aria-pressed="${k === range}">${RANGES[k].label}</button>`).join('')}</div>
        </div>
        <div class="zone-live-grid" data-zones></div>
      </section>`;
    const $ = (s) => root.querySelector(s);

    /* ---- facility hero ---- */
    function hero(s) {
      const hvac = s.equipment.filter((e) => e.type !== 'sensor');
      const running = hvac.filter((e) => e.runState === 'running').length;
      const open = activeAlarms();
      const sensors = s.equipment.filter((e) => e.type === 'sensor');
      const sensorsLive = sensors.filter((e) => Object.values(e.readings).some((r) => isGood(r))).length;
      const comms = s.mode === 'demo' ? { label: 'Simulated data', value: 'DEMO', tone: 'demo' }
        : connectionOk() ? { label: 'JACE connected', value: '●', tone: 'ok' } : { label: 'JACE connection lost', value: '!', tone: 'bad' };
      $('[data-hero]').innerHTML = heroHTML({
        title: 'Middelburg Pharmaceutical Facility',
        subtitle: `${hvac.length} HVAC units and ${sensors.length} room sensors, monitored and controlled through the site JACE.`,
        facts: [
          comms,
          { label: 'units running', value: `${running}/${hvac.length}`, tone: running ? 'ok' : 'warn' },
          { label: 'active alarms', value: String(open.length), tone: open.some((a) => a.severity === 'critical') ? 'bad' : open.length ? 'warn' : 'ok' },
          { label: 'sensors live', value: `${sensorsLive}/${sensors.length}`, tone: sensorsLive === sensors.length ? 'ok' : 'warn' },
        ],
      });
    }

    /* ---- summary strip ------------------------------------------------------- */
    function summary(s) {
      const units = s.equipment.filter((e) => e.type !== 'sensor');
      const run = (t) => units.filter((e) => (!t || e.type === t) && e.runState === 'running').length;
      const count = (t) => units.filter((e) => e.type === t).length;
      const open = activeAlarms();
      const crit = open.filter((a) => a.severity === 'critical').length;
      const sensors = [];
      for (const e of s.equipment) for (const role of ['temperature', 'humidity']) if (e.readings[role] && e.readings[role].quality !== QUALITY.NOT_MAPPED) sensors.push(e.readings[role]);
      const offline = sensors.filter((r) => r.quality !== QUALITY.LIVE).length;
      const c = s.connection;
      const connTile = s.mode === 'demo' && connectionOk()
        ? `<div class="tile tile-demo"><span class="label-caps">Comms</span><div class="tile-v">${icon('info')}SIMULATED</div><span class="small">Demo data — not the JACE</span></div>`
        : connectionOk()
          ? `<div class="tile tile-ok"><span class="label-caps">Comms</span><div class="tile-v">${icon('check')}JACE connected</div>${ageHTML(s.lastPollAt, 'Last read')}</div>`
          : `<div class="tile tile-bad"><span class="label-caps">Comms</span><div class="tile-v">${icon('alarm')}${c.status === 'not-configured' ? 'Not connected' : 'Connection lost'}</div><span class="small">${c.lastOkAt ? `Last good read ${esc(time(c.lastOkAt))}` : esc(c.message)}</span></div>`;
      $('[data-summary]').innerHTML = `
        <div class="tile"><span class="label-caps">Units running</span><div class="tile-v"><span class="mono-v">${run()}</span><span class="of">/ ${units.length}</span></div>
          <span class="small"><span class="type-dot hyb"></span>Hybrid ${run('hybrid')}/${count('hybrid')} · <span class="type-dot rtu"></span>Rooftop ${run('rooftop')}/${count('rooftop')}</span></div>
        <div class="tile ${crit ? 'tile-bad' : open.length ? 'tile-warn' : ''}"><span class="label-caps">Active alarms</span><div class="tile-v"><span class="mono-v">${open.length}</span></div>
          <span class="small">${crit} critical · ${open.length - crit} warning · <a href="#/alarms">Alarm register</a></span></div>
        <div class="tile ${offline ? 'tile-warn' : ''}"><span class="label-caps">Sensors offline</span><div class="tile-v"><span class="mono-v">${offline}</span><span class="of">/ ${sensors.length}</span></div>
          <span class="small">Temperature and humidity sensors not LIVE</span></div>
        ${connTile}`;
    }

    /* ---- control widgets ------------------------------------------------------- */
    const runText = (r, def) => {
      if (!isGood(r)) return `<span class="q-label">${esc(QUALITY_LABEL[r?.quality] || 'NOT MAPPED')}</span>`;
      if (def.actualRole === 'fanStatus') return r.value ? '<b class="ok-ink">fan running</b>' : '<b>fan off</b>';
      return `<b>${num(r.value)} ${esc(r.unit || '')}</b>`;
    };
    /** One short line under a control: what the unit itself reports now. */
    const btnClass = (label, dflt) => (label === 'Heat' ? 'mode-heat' : label === 'Cool' ? 'mode-cool' : dflt);
    function nowLine(e, def) {
      if (def.id === 'rtuMode') {
        const r = e.readings.operatingMode;
        return isGood(r) ? `Unit reports <b>${esc(MODE_LABEL[e.mode] || e.mode)}</b>` : `Mode point ${runText(r, def)}${r?.error ? ` <span class="muted">(${esc(r.error)})</span>` : ''}`;
      }
      if (def.kind === 'setpoint') {
        const sp = e.readings[def.commandRole];
        const m = e.type === 'rooftop' && isGood(e.readings.operatingMode) ? ` · unit mode <b>${esc(MODE_LABEL[e.mode] || e.mode)}</b>` : '';
        // Room vs target: the room takes time to reach a new setpoint; say which way the unit should be working.
        const room = e.readings.temperature;
        let gap = '';
        if (isGood(sp) && isGood(room)) {
          // Changeover per Aina: cooling above the setpoint, heating below setpoint − 1 °C, idle in between.
          const d = room.value - sp.value;
          gap = d > 0.2 ? ` · room ${num(d)} °C above target, unit should be cooling (takes time)`
            : d < -1 ? ` · room ${num(-d)} °C below target, unit should be heating (heats below ${num(sp.value - 1)} °C)`
            : ' · room at target (no heating or cooling needed)';
        }
        return `Target (setpoint) ${isGood(sp) ? `<b>${num(sp.value)} °C</b>` : runText(sp, def)}${m}${gap}`;
      }
      if (def.kind === 'mode') return `Unit reports <b>${esc(MODE_LABEL[e.mode] || e.mode)}</b>`;
      return def.actualRole ? `Unit reports ${runText(e.readings[def.actualRole], def)}` : '';
    }

    function controlHTML(e, def) {
      const avail = controlAvailability(e, def);
      const dis = avail.ok ? '' : `disabled title="${esc(avail.reason)}"`;
      const rec = getCommand(e.id, def.id);
      const ovr = def.commandRole && e.readings[def.commandRole]?.override;
      let widget = '';
      if (def.kind === 'toggle') {
        const cur = commandedValue(e, def);
        widget = `<div class="seg seg-cmd" role="group" aria-label="${esc(def.label)}">
          <button type="button" class="${btnClass(def.onLabel, 'on')}" data-cmd="${e.id}|${def.id}|1" aria-pressed="${cur === true}" ${dis}>${esc(def.onLabel)}</button>
          <button type="button" class="${btnClass(def.offLabel, 'off')}" data-cmd="${e.id}|${def.id}|0" aria-pressed="${cur === false}" ${dis}>${esc(def.offLabel)}</button></div>`;
      } else if (def.kind === 'mode') {
        widget = `<div class="seg seg-cmd" role="group" aria-label="Mode">${def.options.map((o) => `<button type="button" data-cmd="${e.id}|${def.id}|${o.value}" aria-pressed="${e.mode === o.value}" class="mode-${o.value === 'cooling' ? 'cool' : o.value === 'heating' ? 'heat' : 'fan'}" ${dis}>${esc(o.label)}</button>`).join('')}</div>`;
      } else if (def.kind === 'setpoint') {
        const lim = setpointLimits(e.id);
        const cur = commandedValue(e, def);
        const draft = drafts.has(e.id) ? drafts.get(e.id) : cur;
        const changed = draft != null && cur != null && Math.abs(draft - cur) >= 0.05;
        widget = `<div class="stepper" role="group" aria-label="${esc(e.id)} temperature setpoint, ${lim.min} to ${lim.max} °C">
            <button type="button" data-sp-step="${e.id}|-1" aria-label="Lower setpoint" ${dis} ${draft != null && draft <= lim.min ? 'disabled' : ''}>−</button>
            <output data-sp-out="${e.id}">${draft == null ? '—' : num(draft)}<small>°C</small></output>
            <button type="button" data-sp-step="${e.id}|1" aria-label="Raise setpoint" ${dis} ${draft != null && draft >= lim.max ? 'disabled' : ''}>+</button>
          </div>
          <button type="button" class="btn sm primary" data-sp-apply="${e.id}" ${dis} ${changed ? '' : 'disabled'}>Apply</button>`;
      }
      return `<div class="ctl">
        <div class="ctl-main">
          <div class="ctl-l"><span class="ctl-name">${esc(def.label)}${!avail.ok ? `<span class="lock" title="${esc(avail.reason)}">${icon('lock')}</span>` : ''}</span>
            <span class="ctl-now">${nowLine(e, def)}${def.kind === 'setpoint' ? ` <span class="muted">· range ${setpointLimits(e.id).min}–${setpointLimits(e.id).max} °C</span>` : ''}</span></div>
          <div class="ctl-r">${widget}</div>
        </div>
        ${ovr ? `<div class="cmd cmd-bad">${icon('alarm')}Overridden by ${esc(ovr.source)}: commands from here will not take effect</div>` : ''}
        ${notSent.has(`${e.id}|${def.id}`) ? `<div class="cmd cmd-bad" role="alert">${icon('alarm')}<b>Not sent</b> ${esc(notSent.get(`${e.id}|${def.id}`))}</div>` : cmdStatusHTML(rec, def, e)}</div>`;
    }

    const isUnmapped = (e, d) => d.kind !== 'status' && controlAvailability(e, d).notMapped;

    /** Read-only facts (unit enable, hybrid setpoint, fan speed) as small key/value pairs. */
    function factsHTML(e) {
      const items = controlDefs(e.type).filter((d) => d.kind === 'status' && (d.derived || (e.readings[d.role] && e.readings[d.role].quality !== 'not-mapped'))).map((d) => {
        const r = e.readings[d.role];
        const v = d.derived === 'mode' && isGood(r) ? `<b>${esc(MODE_LABEL[e.mode] || e.mode)}</b>`
          : d.derived === 'mode' && e.type === 'hybrid' ? `<b>${esc(MODE_LABEL[e.mode] || e.mode)}</b>`
          : !isGood(r) ? `<span class="q-label">${esc(QUALITY_LABEL[r?.quality] || 'NOT MAPPED')}</span>`
          : d.role === 'enable' ? `<b>${r.value ? (e.type === 'hybrid' ? 'On' : 'Enabled') : (e.type === 'hybrid' ? 'Off' : 'Disabled')}</b>`
          : d.role === 'fanStatus' ? `<b>${r.value ? 'Running' : 'Off'}</b>`
          : typeof r.value === 'boolean' ? `<b>${r.value ? 'ON' : 'OFF'}</b>`
          : `<b>${num(r.value, d.role === 'fanSpeed' ? 0 : 1)} ${esc(r.unit || '')}</b>`;
        return `<span class="fact"><span>${esc(d.label)}</span>${v}</span>`;
      });
      if (e.type === 'rooftop') items.push('<span class="fact fact-note">Heating / cooling changes over automatically on the unit.</span>');
      if (e.type === 'hybrid') items.push('<span class="fact fact-note">Monitoring only: hybrid units are read, not controlled, from this dashboard.</span>');
      return items.length ? `<div class="facts">${items.join('')}</div>` : '';
    }

    const STATE_TEXT = { running: 'Running', stopped: 'Stopped', fault: 'Fault', unknown: 'No data' };
    const dotOf = (type) => (type === 'hybrid' ? 'hyb' : type === 'sensor' ? 'sen' : 'rtu');
    const bigVal = (r, unit, digits = 1) => (isGood(r) ? `${num(r.value, digits)}<small>${unit}</small>` : `<span class="v-none">—</span>`);

    /** Room sensor: readings only (temperature, humidity, CO2). */
    function sensorCard(e) {
      const r = e.readings;
      const live = Object.values(r).some((x) => isGood(x));
      const tile = (x, label, unit, digits, cls) => `<div class="rd ${cls}"><span>${label}</span><b>${bigVal(x, unit, digits)}</b>${!isGood(x) ? qualityChip(x?.quality) : ''}</div>`;
      return `<article class="ucard sensor" data-unit="${e.id}">
        <header class="ucard-head">
          <span class="sensor-ico" aria-hidden="true">${icon('environment')}</span>
          <div class="ucard-title">
            <button type="button" class="linkish" data-open="${e.id}" title="Details for ${esc(e.name)}"><strong>${esc(e.name)}</strong></button>
            <span class="ucard-sub"><span class="type-dot sen"></span>${esc(e.id)} · ${esc(e.zoneName || '')}</span>
          </div>
          <span class="state-pill ${live ? 'st-running' : 'st-unknown'}"><i></i>${live ? 'Live' : 'No data'}</span>
        </header>
        <div class="ucard-readings three">
          ${tile(r.temperature, 'Temperature', '°C', 1, 'temp')}${tile(r.humidity, 'Humidity', '%RH', 0, 'hum')}${tile(r.co2, 'CO₂', 'ppm', 0, 'co2')}
        </div>
      </article>`;
    }

    /** The unit's own alarm points: green OK / red ALARM (true = alarm). Dirty filter: Clean / Dirty — replace filter. */
    function alarmsPanel(e) {
      const roles = alarmRoles(e.type).filter((r) => e.readings[r]);
      if (!roles.length) return '';
      let active = 0;
      const rows = roles.map((role) => {
        const r = e.readings[role];
        const live = isGood(r);
        const on = live && r.value === true;
        if (on) active++;
        const filter = role === 'dirtyFilter';
        const label = filter ? 'Filter' : ROLE_POINTS[role].label;
        const state = !live ? `<span class="q-label">${esc(QUALITY_LABEL[r.quality] || 'NO DATA')}</span>`
          : filter ? (on ? '<b>DIRTY — replace filter</b>' : '<b>Clean</b>')
          : (on ? '<b>ALARM</b>' : '<b>OK</b>');
        return `<li class="al ${!live ? 'none' : on ? 'bad' : 'ok'}"><i></i><span>${esc(label)}</span>${state}</li>`;
      }).join('');
      return `<div class="alarms-panel ${active ? 'has-alarm' : ''}">
        <div class="ap-head">${icon('alarm')}<b>Alarms</b><span>${active ? `${active} active · ${esc(e.zoneName || '')}` : 'none active'}</span></div>
        <ul>${rows}</ul></div>`;
    }

    function unitCard(e) {
      if (e.type === 'sensor') return sensorCard(e);
      const t = EQUIPMENT_TYPES[e.type];
      const temp = e.readings.temperature;
      const second = e.type === 'rooftop'
        ? { r: e.readings.humidity, label: 'Humidity', digits: 0 }
        : { r: e.readings.fanSpeed, label: 'Fan speed', digits: 0 };
      const big = bigVal;
      return `<article class="ucard ${e.type} st-${e.runState}" data-unit="${e.id}">
        <header class="ucard-head">
          ${unitPhotoHTML(e)}
          <div class="ucard-title">
            <button type="button" class="linkish" data-open="${e.id}" title="Details for ${esc(e.name)}"><strong>${esc(e.name)}</strong></button>
            <span class="ucard-sub"><span class="type-dot ${e.type === 'hybrid' ? 'hyb' : 'rtu'}"></span>${esc(e.id)} · ${esc(e.zoneName || '')}</span>
          </div>
          <span class="state-pill st-${e.runState}"><i></i>${STATE_TEXT[e.runState] || 'No data'}</span>
        </header>
        <div class="ucard-readings">
          <div class="rd temp"><span>Temperature</span><b>${big(temp, '°C')}</b>${!isGood(temp) ? qualityChip(temp?.quality) : ''}</div>
          <div class="rd ${e.type === 'rooftop' ? 'hum' : ''}"><span>${second.label}</span><b>${big(second.r, second.r?.unit || '', second.digits)}</b>${!isGood(second.r) ? qualityChip(second.r?.quality) : ''}</div>
        </div>
        ${alarmsPanel(e)}
        ${(() => { const c = controlDefs(e.type).filter((d) => d.kind !== 'status' && !isUnmapped(e, d)); return c.length ? `<div class="ctls">${c.map((d) => controlHTML(e, d)).join('')}</div>` : ''; })()}
        ${factsHTML(e)}
      </article>`;
    }

    /** Fire dampers (hybrids 6–11): read only (GET), never written. */
    function dampersHTML(s) {
      const list = s.equipment.filter((e) => e.readings.fireDamper);
      if (!list.length) return '';
      const tile = (e) => {
        const r = e.readings.fireDamper;
        const v = isGood(r) ? (r.value ? 'ON' : 'OFF') : '—';
        return `<div class="damper ${isGood(r) ? (r.value ? 'on' : 'off') : 'none'}">
          <span class="damper-name">${esc(e.id)} · ${esc(e.name)}</span>
          <b>${v}</b>${isGood(r) ? ageHTML(r.ts) : qualityChip(r.quality)}
        </div>`;
      };
      return `<section class="ugroup" aria-labelledby="ug-dampers">
        <div class="ugroup-head"><span class="type-dot damper-dot"></span><h2 id="ug-dampers">Fire dampers</h2>
          <span class="muted">${list.length} dampers · monitoring only</span></div>
        <div class="damper-grid">${list.map(tile).join('')}</div>
        <p class="muted small">Read from the JACE (FIRE DAMPERS network). The dashboard never writes to fire dampers.</p>
      </section>`;
    }

    function groups(s) {
      const html = Object.entries(EQUIPMENT_TYPES).filter(([type]) => typeFilter === 'all' || typeFilter === type).map(([type, t]) => {
        const units = s.equipment.filter((e) => e.type === type);
        const running = units.filter((e) => e.runState === 'running').length;
        return `<section class="ugroup ${type}" aria-labelledby="ug-${type}">
          <div class="ugroup-head"><span class="type-dot ${dotOf(type)}"></span><h2 id="ug-${type}">${esc(t.label)}</h2>
            <span class="muted">${type === 'sensor' ? `${units.length} sensors · temperature, humidity, CO₂` : `<b class="mono-v">${running}</b> / ${units.length} running`}</span></div>
          <div class="ugrid">${units.map(unitCard).join('')}</div></section>`;
      }).join('');
      const g = $('[data-groups]');
      g.classList.toggle('single', typeFilter !== 'all');
      g.innerHTML = html + (typeFilter === 'all' || typeFilter === 'hybrid' ? dampersHTML(s) : '');
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
        el.querySelector('[data-zunits]').innerHTML = s.equipment.filter((e) => e.zoneId === z.id && e.type !== 'sensor').map((e) => {
          const fanOff = isGood(e.readings.fanStatus) && e.readings.fanStatus.value === false;
          return `<button type="button" class="zunit ${e.type}" data-open="${e.id}"><span class="type-dot ${e.type === 'hybrid' ? 'hyb' : 'rtu'}"></span><b>${esc(e.id)}</b>${runChip(e.runState)}${fanOff ? '<span class="badge-fanoff">FAN OFF</span>' : ''}</button>`;
        }).join('');
      }
    }

    function render(s) {
      last = s;
      if (s.loading) return;
      summary(s);
      hero(s);
      $('[data-role-note]').innerHTML = canOperate() ? '' : `<div class="notice">${icon('lock')}<span><strong>Viewer role.</strong> Controls are read-only. Switch to Operator in the top bar to operate units.</span></div>`;
      groups(s);
      if (tab === 'readings') { zones(s); trends.forEach((t) => t.tick()); }
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
        subtitle: `${esc(EQUIPMENT_TYPES[e.type].short)}${e.type === 'sensor' ? '' : ' unit'} · ${esc(e.zoneName || '')} · ${esc(controllerName(e.id))}${last.mode === 'demo' ? ' · SIMULATED DATA' : ''}`,
        body: `${e.type === 'sensor' ? '' : `${unitPhotoHTML(e, { size: 'lg' })}<div class="toolbar">${runChip(e.runState)}<span class="muted small">Mode: ${esc(MODE_LABEL[e.mode] || e.mode)}</span></div>`}
          <div><div class="toolbar" style="justify-content:space-between"><h3>Space temperature</h3><div class="seg" role="group">${['1h', '24h', '7d'].map((k) => `<button type="button" data-drange="${k}" aria-pressed="${k === '1h'}">${RANGES[k].label}</button>`).join('')}</div></div>
            <div data-unit-trend></div></div>
          <div><h3>Points</h3><div class="table-wrap"><table class="data"><thead><tr><th>Reading</th><th>Value</th><th>Quality</th><th>Point</th></tr></thead><tbody>${rows}</tbody></table></div></div>`,
        onClose: () => tr.destroy(),
      });
      const tr = mountTrend(d.el.querySelector('[data-unit-trend]'), {
        measure: 'temperature', unit: '°C', yTitle: '°C',
        series: () => [{ unitId: e.id, role: 'temperature', label: `${e.id} space temperature`, color: MEASURE_COLORS.temperature }],
        limits: () => S.zones.find((z) => z.id === e.zoneId)?.limits?.temperature || null,
        runUnits: () => (e.type === 'sensor' ? [] : [e.id]), fanOffUnit: () => (e.type === 'sensor' ? null : e.id),
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
      const key = `${unitId}|${controlId}`;
      try {
        notSent.delete(key);
        await sendCommand(unitId, controlId, value, note);
        if (def.kind === 'setpoint') drafts.delete(unitId);
        toast(`${unitId} ${def.label}: sent — waiting for the unit to confirm`);
      } catch (err) {
        // A command refused by the JACE is recorded by the store (shown as Failed); anything stopped before
        // sending (point not live, previous command pending, ...) is kept on the card here.
        if (getCommand(unitId, controlId)?.status !== 'failed' || getCommand(unitId, controlId)?.error !== err.message) notSent.set(key, `${err.message} (${time(Date.now())})`);
        toast(err.message, 'err');
      }
      if (last) render(last);
    }

    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-type]');
      if (t) { typeFilter = t.dataset.type; root.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); if (last) render(last); return; }
      const r = ev.target.closest('[data-range]');
      if (r) { range = r.dataset.range; root.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b === r))); trendsLoaded = true; trends.forEach((x) => x.load(range)); return; }
      const tb = ev.target.closest('[data-tab]');
      if (tb) {
        tab = tb.dataset.tab;
        root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b === tb)));
        root.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
        if (tab === 'readings') { if (!trendsLoaded) { trendsLoaded = true; trends.forEach((t) => t.load(range)); } if (last) render(last); }
        return;
      }
      const st = ev.target.closest('[data-sp-step]');
      if (st && !st.disabled) {
        const [u, dir] = st.dataset.spStep.split('|');
        const e = last.equipment.find((x) => x.id === u);
        const lim = setpointLimits(u);
        const cur = drafts.has(u) ? drafts.get(u) : commandedValue(e, controlDefs(e.type).find((d) => d.id === 'tempSetpoint'));
        const next = Math.min(lim.max, Math.max(lim.min, Math.round(((cur ?? 21) + Number(dir) * lim.step) / lim.step) * lim.step));
        drafts.set(u, next);
        render(last);
        return;
      }
      const c = ev.target.closest('[data-cmd]');
      if (c && !c.disabled) { const [u, id, v] = c.dataset.cmd.split('|'); command(u, id, v); return; }
      const ap = ev.target.closest('[data-sp-apply]');
      if (ap && !ap.disabled) { const u = ap.dataset.spApply; command(u, 'tempSetpoint', String(drafts.get(u))); return; }
      const o = ev.target.closest('[data-open]');
      if (o) openUnit(o.dataset.open);
    });

    zoneSkeleton();
    let trendsLoaded = false;
    return {
      update(s) { render(s); },
      destroy() { trends.forEach((t) => t.destroy()); },
    };
  },
};
