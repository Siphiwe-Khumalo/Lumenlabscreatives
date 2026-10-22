/* Overview — "Environmental Assurance" */
import { ZONES, NAMES_ILLUSTRATIVE, EQUIPMENT_TYPES } from '../config/site.js';
import { THRESHOLDS_LABEL } from '../config/thresholds.js';
import { icon } from '../ui/icons.js';
import { esc, num, timeSec, dateTime, ago } from '../util/format.js';
import { statusChip, severityChip, ackChip, readingHTML, tsHTML, createTable, DEMO_TAG } from '../ui/components.js';
import { isGood, worst, rangeText, STATUS_RANK } from '../data/quality.js';
import { state as storeState, getZoneSeries, RANGES } from '../data/store.js';
import { mountTrendCard } from '../ui/trend-card.js';
import { mountFacilityMap } from '../ui/map.js';

const zoneOptions = (sel) => `<option value="all" ${sel === 'all' ? 'selected' : ''}>All zones</option>` +
  ZONES.map((z) => `<option value="${z.id}" ${sel === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('');

function rangeSeg(sel) {
  return `<div class="seg" role="group" aria-label="Trend time range">${['1h', '24h', '7d'].map((k) => [k, RANGES[k]]).map(([k, r]) => `<button type="button" data-range="${k}" aria-pressed="${k === sel}">${r.label}</button>`).join('')}</div>`;
}

export default {
  mount(root, { params }) {
    const ui = { zone: params.get('zone') && ZONES.some((z) => z.id === params.get('zone')) ? params.get('zone') : 'all', range: '1h' };
    const deltas = {}; // `${zone}:${metric}` -> { value, at }

    root.innerHTML = `
      <div class="page-head">
        <div class="titles"><h1>Environmental Assurance</h1><p>Warehouse conditions and building systems</p></div>
        <div class="toolbar">
          <label class="field"><span>Zone</span><select class="select" data-zone aria-label="Zone">${zoneOptions(ui.zone)}</select></label>
          <div class="field"><span>Trend range</span>${rangeSeg(ui.range)}</div>
        </div>
      </div>
      <div data-banner></div>
      <section class="grid cols-4" aria-label="Key metrics" data-metrics></section>
      <section class="grid cols-2" aria-label="Trends">
        <div class="card"><div class="card-head"><h2>Space temperature</h2><span class="sub" data-trend-sub="t"></span></div><div data-trend="temperature"></div></div>
        <div class="card"><div class="card-head"><h2>Relative humidity</h2><span class="sub" data-trend-sub="h"></span></div><div data-trend="humidity"></div></div>
      </section>
      <section class="card" aria-labelledby="zt-title">
        <div class="card-head"><h2 id="zt-title">Storage zones</h2><span class="tag placeholder">${esc(NAMES_ILLUSTRATIVE)}</span>
          <div class="actions"><a class="btn sm" href="#/environment">Zone details ${icon('chevron')}</a></div></div>
        <div data-zone-table></div>
        <div class="table-meta"><span>Acceptable ranges: ${esc(THRESHOLDS_LABEL)}</span><span>Unknown = stale, missing or bad reading — never treated as normal.</span></div>
      </section>
      <section class="card" aria-labelledby="ev-title">
        <div class="card-head"><h2 id="ev-title">Recent events</h2><span data-ev-tag></span>
          <div class="actions"><a class="btn sm" href="#/alarms">Alarm Register ${icon('chevron')}</a></div></div>
        <div data-events></div>
      </section>
      <section class="card" aria-labelledby="map-title">
        <div class="card-head"><h2 id="map-title">Facility location</h2><span class="sub">OpenStreetMap</span></div>
        <div data-map></div>
      </section>`;

    const $ = (s) => root.querySelector(s);
    const trendT = mountTrendCard($('[data-trend="temperature"]'), 'temperature');
    const trendH = mountTrendCard($('[data-trend="humidity"]'), 'humidity');
    const forceFail = new URLSearchParams(location.search).get('geocode') === 'fail';
    const map = mountFacilityMap($('[data-map]'), { forceFail });

    const zoneTable = createTable({
      caption: 'Storage zones',
      rowKey: (z) => z.id,
      initialSort: { key: 'status', dir: 'desc' },
      onRowClick: (id) => { location.hash = `#/environment?zone=${id}`; },
      columns: [
        { key: 'name', label: 'Zone', render: (z) => `<strong>${esc(z.name)}</strong><span class="sub">${esc(z.description)}</span>` },
        { key: 'temp', label: 'Temperature', num: true, sort: (z) => (isGood(z.readings.temperature) ? z.readings.temperature.value : null), render: (z) => readingHTML(z.readings.temperature) },
        { key: 'hum', label: 'Humidity', num: true, sort: (z) => (isGood(z.readings.humidity) ? z.readings.humidity.value : null), render: (z) => readingHTML(z.readings.humidity) },
        { key: 'ranges', label: 'Acceptable ranges', sortable: false, render: (z) => `<span class="nowrap">${esc(rangeText(z.limits.temperature, '°C'))}</span><span class="sub">${esc(rangeText(z.limits.humidity, '%RH'))}</span>` },
        { key: 'status', label: 'Status', sort: (z) => STATUS_RANK[z.status.overall], render: (z) => statusChip(z.status.overall) },
        { key: 'updated', label: 'Last update', sort: (z) => z.lastUpdate, render: (z) => tsHTML(z.lastUpdate) },
      ],
    });
    $('[data-zone-table]').appendChild(zoneTable.el);

    const eventsTable = createTable({
      caption: 'Recent events',
      rowKey: (a) => a.id,
      initialSort: { key: 'ts', dir: 'desc' },
      onRowClick: (id) => { location.hash = `#/alarms?id=${encodeURIComponent(id)}`; },
      empty: 'No events recorded.',
      columns: [
        { key: 'ts', label: 'Timestamp', sort: (a) => a.raisedAt, render: (a) => `<span class="nowrap">${esc(dateTime(a.raisedAt))}</span>` },
        { key: 'description', label: 'Description', render: (a) => `${esc(a.description)}${a.derived ? '<span class="sub">Derived in this browser</span>' : ''}` },
        { key: 'source', label: 'Zone / equipment', sort: (a) => a.source?.name, render: (a) => esc(a.source?.name || '—') },
        { key: 'severity', label: 'Severity', sort: (a) => ({ critical: 3, warning: 2, info: 1 }[a.severity]), render: (a) => severityChip(a.severity) },
        { key: 'ack', label: 'Acknowledgement', sort: (a) => a.status, render: (a) => ackChip(a.status) },
      ],
    });
    $('[data-events]').appendChild(eventsTable.el);

    async function loadTrends() {
      const zn = ui.zone === 'all' ? 'All zones' : ZONES.find((z) => z.id === ui.zone).name;
      root.querySelectorAll('[data-trend-sub]').forEach((el) => (el.textContent = `${zn} · last ${RANGES[ui.range].label}`));
      await Promise.all([trendT.load({ zoneId: ui.zone, range: ui.range }), trendH.load({ zoneId: ui.zone, range: ui.range })]);
    }

    /** 1-hour change: only when the sample one hour ago AND the current reading are LIVE. */
    async function loadDeltas() {
      if (ui.zone === 'all') return;
      try {
        for (const metric of ['temperature', 'humidity']) {
          const { points } = await getZoneSeries(ui.zone, metric, '1h');
          const target = Date.now() - 60 * 60e3;
          const pt = points.find((x) => x[0] >= target - 5 * 60e3 && x[0] <= target + 5 * 60e3);
          deltas[`${ui.zone}:${metric}`] = pt && pt[2] === 'live' && pt[1] != null ? { value: pt[1], at: pt[0] } : null;
        }
        update(storeState);
      } catch { /* deltas are optional */ }
    }

    function metricCard({ ico, title, valueHTML, unit, status, meta }) {
      return `<article class="card metric">
        <div class="metric-top">${icon(ico)}<span>${esc(title)}</span>${statusChip(status)}</div>
        <div class="metric-value">${valueHTML}${unit ? `<span class="u">${esc(unit)}</span>` : ''}</div>
        <div class="metric-meta">${meta.filter(Boolean).join('')}</div>
      </article>`;
    }

    function envMetric(s, metric, title, ico, unit) {
      const zones = ui.zone === 'all' ? s.zones : s.zones.filter((z) => z.id === ui.zone);
      const good = zones.filter((z) => isGood(z.readings[metric]));
      const status = worst(zones.map((z) => z.status[metric].status));
      const unknownCount = zones.length - good.length;
      if (!good.length) {
        return metricCard({ ico, title, valueHTML: '<span class="v unknown">Unknown</span>', unit: '', status: 'unknown',
          meta: [`<span>${zones.length === 1 ? esc(zones[0].readings[metric].error || 'No current reading') : 'No zones reporting'}</span>`] });
      }
      const vals = good.map((z) => z.readings[metric].value);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const latest = Math.max(...good.map((z) => z.readings[metric].ts));
      if (ui.zone === 'all') {
        return metricCard({ ico, title, unit, status,
          valueHTML: `<span class="v">${num(lo)}–${num(hi)}</span>`,
          meta: [`<span>Range across ${good.length} of ${zones.length} reporting zones (not an average)</span>`,
            unknownCount ? `<span><span class="q-label">${unknownCount} Unknown</span></span>` : '',
            `<span>Updated ${esc(timeSec(latest))}</span>`] });
      }
      const r = good[0].readings[metric];
      const d = deltas[`${ui.zone}:${metric}`];
      const delta = d ? r.value - d.value : null;
      return metricCard({ ico, title, unit, status,
        valueHTML: `<span class="v">${num(r.value)}</span>`,
        meta: [delta != null ? `<span class="delta">${delta >= 0 ? '+' : '−'}${num(Math.abs(delta))} ${esc(unit)} in 1 h</span>` : '',
          `<span>Acceptable ${esc(rangeText(good[0].limits[metric], unit))}</span>`,
          `<span title="${esc(dateTime(r.ts))}">Updated ${esc(timeSec(r.ts))}</span>`] });
    }

    function update(s) {
      if (s.loading) return;
      const zoneFilter = (a) => ui.zone === 'all' || a.zoneId === ui.zone;
      const open = s.alarms.filter((a) => a.status !== 'cleared' && zoneFilter(a));
      const crit = open.filter((a) => a.severity === 'critical').length;
      const warn = open.filter((a) => a.severity === 'warning').length;
      const unack = open.filter((a) => a.status === 'active').length;
      const demo = s.mode === 'demo';

      // Alarm banner
      const banner = $('[data-banner]');
      if (open.length) {
        const sev = crit ? 'critical' : 'warning';
        const top = open.slice().sort((a, b) => STATUS_RANK[b.severity] - STATUS_RANK[a.severity] || (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0) || b.raisedAt - a.raisedAt)[0];
        banner.innerHTML = `<div class="alarm-banner ${sev}" role="status">${icon('alarm')}
          <div class="msg"><strong>${open.length} active event${open.length === 1 ? '' : 's'}${ui.zone !== 'all' ? ' in this zone' : ''} — ${crit} critical, ${warn} warning, ${unack} unacknowledged</strong>
          <span class="muted">Most significant: ${esc(top.source?.name || '')} — ${esc(top.description)} (since ${esc(timeSec(top.raisedAt))})</span></div>
          ${demo ? DEMO_TAG : top.derived ? '<span class="tag">Derived in this browser</span>' : ''}
          <a class="btn sm" href="#/alarms">Review alarms ${icon('chevron')}</a></div>`;
      } else banner.innerHTML = '';

      // Metric cards
      const eqs = ui.zone === 'all' ? s.equipment : s.equipment.filter((e) => e.zoneId === ui.zone);
      const running = eqs.filter((e) => e.runState === 'running').length;
      const stopped = eqs.filter((e) => e.runState === 'fault').length;
      const standby = eqs.filter((e) => e.runState === 'stopped').length;
      const unknown = eqs.filter((e) => e.runState === 'unknown').length;
      const hvacStatus = stopped ? 'critical' : unknown ? 'unknown' : 'normal';
      const eqTs = eqs.map((e) => e.lastUpdate).filter(Boolean);
      const grp = (t) => { const g = eqs.filter((e) => e.type === t); return g.length ? `<span><b>${EQUIPMENT_TYPES[t].short}</b> ${g.filter((e) => e.runState === 'running').length}/${g.length}</span>` : ''; };
      const hvacCard = metricCard({ ico: 'hvac', title: 'HVAC Availability', status: hvacStatus, unit: 'running',
        valueHTML: `<span class="v">${running} / ${eqs.length}</span>`,
        meta: [grp('hybrid'), grp('rooftop'), standby ? `<span>${standby} stopped</span>` : '', stopped ? `<span>${stopped} FAULT</span>` : '',
          unknown ? `<span class="q-label">${unknown} Unknown</span>` : '', eqTs.length ? `<span>Updated ${esc(timeSec(Math.max(...eqTs)))}</span>` : ''] });
      const alarmStatus = crit ? 'critical' : warn ? 'warning' : 'normal';
      const alarmCard = `<article class="card metric">
        <div class="metric-top">${icon('alarm')}<span>Active Alarms</span>${statusChip(alarmStatus, open.length ? undefined : 'None active')}</div>
        <div class="metric-value"><span class="v">${open.length}</span><span class="u">active</span></div>
        <div class="sev-breakdown"><span><b>${crit}</b> critical</span><span><b>${warn}</b> warning</span><span><b>${unack}</b> unacknowledged</span></div>
        <div class="metric-meta">${demo ? DEMO_TAG : s.mode === 'connected' ? '<span>Evaluated in this browser — alarm service not configured</span>' : '<span>No live data</span>'}<span>Checked ${esc(timeSec(s.lastPollAt))}</span></div>
      </article>`;
      $('[data-metrics]').innerHTML = envMetric(s, 'temperature', 'Space Temperature', 'environment', '°C') + envMetric(s, 'humidity', 'Relative Humidity', 'droplet', '%RH') + hvacCard + alarmCard;

      zoneTable.setRows(ui.zone === 'all' ? s.zones : s.zones.filter((z) => z.id === ui.zone));
      eventsTable.setRows(s.alarms.filter(zoneFilter).sort((a, b) => b.raisedAt - a.raisedAt).slice(0, 6));
      $('[data-ev-tag]').innerHTML = demo ? DEMO_TAG : '';
    }

    $('[data-zone]').addEventListener('change', (e) => {
      ui.zone = e.target.value;
      history.replaceState(null, '', ui.zone === 'all' ? '#/overview' : `#/overview?zone=${ui.zone}`);
      update(storeState); loadTrends(); loadDeltas();
    });
    root.querySelector('.seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-range]');
      if (!b) return;
      ui.range = b.dataset.range;
      root.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      loadTrends();
    });

    let lastMode = null;
    return {
      update(s) {
        update(s);
        trendT.tick(); trendH.tick();
        if (s.mode !== lastMode && s.mode !== 'starting') { lastMode = s.mode; loadTrends(); loadDeltas(); }
      },
      destroy() { trendT.destroy(); trendH.destroy(); map.destroy(); },
    };
  },
};
