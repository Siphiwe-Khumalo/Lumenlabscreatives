/* Trends & Reports — history charts, HVAC state history, summary, print, CSV. */
import { SITE, ZONES, EQUIPMENT, EQUIPMENT_TYPES } from '../config/site.js';
import { meanKineticTemperature, excursions, formatDuration } from '../data/analytics.js';
import { THRESHOLDS_LABEL } from '../config/thresholds.js';
import { getThresholds } from '../config/settings-store.js';
import { icon } from '../ui/icons.js';
import { esc, num, dateTime, day, time } from '../util/format.js';
import { stateBox, toast, openDrawer, DEMO_TAG } from '../ui/components.js';
import { RANGES } from '../ui/charts.js';
import { mountTrendCard } from '../ui/trend-card.js';
import { getProvider, state as storeState } from '../data/store.js';

const MODE_TEXT = {
  demo: 'DEMO — illustrative data generated in the browser; not site telemetry',
  connected: 'CONNECTED — site gateway',
  offline: 'OFFLINE — no site data',
  starting: 'STARTING',
};
const isoSast = (ts) => `${dateTime(ts).replace(' ', 'T')}+02:00`;

export default {
  mount(root) {
    const ui = { zone: 'all', range: '24h' };
    root.innerHTML = `<div class="page-head">
        <div class="titles"><h1>Trends &amp; Reports</h1><p>Environmental history, equipment operating state and exportable reports</p></div>
        <div class="toolbar">
          <label class="field"><span>Zone</span><select class="select" data-zone><option value="all">All zones</option>${ZONES.map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join('')}</select></label>
          <div class="field"><span>Range</span><div class="seg" role="group" aria-label="Time range">${Object.entries(RANGES).map(([k, r]) => `<button type="button" data-range="${k}" aria-pressed="${k === ui.range}">${r.label}</button>`).join('')}</div></div>
          <div class="field"><span>&nbsp;</span><div class="toolbar">
            <button class="btn" type="button" data-print>${icon('print')}Print report</button>
            <button class="btn" type="button" data-csv>${icon('download')}Export CSV</button></div></div>
        </div>
      </div>
      <div class="print-only" data-print-head></div>
      <div data-note></div>
      <section class="grid cols-2">
        <div class="card"><div class="card-head"><h2>Space temperature</h2><span class="sub" data-sub></span></div><div data-trend="temperature"></div></div>
        <div class="card"><div class="card-head"><h2>Relative humidity</h2><span class="sub" data-sub></span></div><div data-trend="humidity"></div></div>
      </section>
      <section class="card"><div class="card-head"><h2>Period summary</h2><span class="sub">Statistics over the selected range</span><span data-sum-tag></span></div><div data-summary></div>
        <div class="table-meta"><span>Limits: ${esc(THRESHOLDS_LABEL)}</span><span>Outside range = share of samples beyond the alert limits.</span></div></section>
      <section class="card"><div class="card-head"><h2>Excursion report</h2><span class="sub">Periods outside the acceptable range (alert limits)</span><span data-exc-tag></span></div><div data-exc></div>
        <div class="table-meta"><span>Calculated from the history shown above. Gaps in data end an excursion.</span><span>Times in SAST.</span></div></section>
      <section class="card"><div class="card-head"><h2>HVAC operating-state history</h2><span data-hvac-tag></span></div><div data-hvac></div></section>`;

    const $ = (s) => root.querySelector(s);
    const tT = mountTrendCard($('[data-trend="temperature"]'), 'temperature');
    const tH = mountTrendCard($('[data-trend="humidity"]'), 'humidity');
    let lastLoad = null;

    function printHead() {
      const s = storeState;
      $('[data-print-head]').innerHTML = `<h1 style="font-size:18px">${esc(SITE.name)} — Environmental report</h1>
        <p>${esc(SITE.subtitle)} · ${esc(SITE.location)}</p>
        <p>Zone: ${esc(ui.zone === 'all' ? 'All zones' : ZONES.find((z) => z.id === ui.zone).name)} · Range: last ${RANGES[ui.range].label} · Generated ${esc(dateTime(Date.now()))} (${esc(SITE.timeZoneLabel)})</p>
        <p><strong>Data source: ${esc(MODE_TEXT[s.mode])}</strong></p>
        <p>Limits: ${esc(THRESHOLDS_LABEL)}. This report makes no claim of regulatory compliance.</p>`;
    }

    function summary(t, h) {
      excursionReport(t, h);
      if (!t && !h) { $('[data-summary]').innerHTML = stateBox('empty', 'No history available', storeState.mode === 'demo' ? '' : 'Historian not configured.'); return; }
      const rows = [];
      for (const [data, metric, unit] of [[t, 'temperature', '°C'], [h, 'humidity', '%RH']]) {
        if (!data) continue;
        for (const s of data.series) {
          const vals = s.points.map((p) => p[1]).filter((v) => v != null);
          const l = getThresholds(s.zoneId)[metric];
          const out = vals.filter((v) => (l.alertHigh != null && v > l.alertHigh) || (l.alertLow != null && v < l.alertLow)).length;
          rows.push(`<tr><td>${esc(s.label)}</td><td>${metric === 'temperature' ? 'Temperature' : 'Humidity'}</td>
            <td class="num">${vals.length ? num(Math.min(...vals)) : '—'}</td><td class="num">${vals.length ? num(Math.max(...vals)) : '—'}</td>
            <td class="num">${vals.length ? num(vals.reduce((a, b) => a + b, 0) / vals.length) : '—'}</td><td>${unit}</td>
            <td class="num">${metric === 'temperature' && vals.length > 1 ? num(meanKineticTemperature(vals), 2) + ' °C' : '—'}</td>
            <td class="num">${vals.length ? num((out / vals.length) * 100) + ' %' : '—'}</td>
            <td class="num">${vals.length} / ${s.points.length}</td></tr>`);
        }
      }
      $('[data-summary]').innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Zone</th><th>Measure</th><th class="num">Min</th><th class="num">Max</th><th class="num">Mean</th><th>Unit</th><th class="num" title="Mean kinetic temperature, ΔH/R = 10 000 K">MKT</th><th class="num">Outside range</th><th class="num">Samples with data</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    }

    function excursionReport(t, h) {
      const el = $('[data-exc]');
      $('[data-exc-tag]').innerHTML = storeState.mode === 'demo' ? DEMO_TAG : '';
      const rows = [];
      for (const [data, metric, unit] of [[t, 'temperature', '°C'], [h, 'humidity', '%RH']]) {
        if (!data) continue;
        for (const s of data.series) {
          const l = getThresholds(s.zoneId)[metric];
          for (const x of excursions(s.points, l.alertLow, l.alertHigh, RANGES[ui.range].step)) rows.push({ ...x, zone: s.label, metric, unit, l });
        }
      }
      if (!t && !h) { el.innerHTML = stateBox('empty', 'No history available'); return; }
      if (!rows.length) { el.innerHTML = stateBox('empty', 'No excursions in this period', 'All recorded values stayed within the acceptable range.'); return; }
      rows.sort((a, b) => b.from - a.from);
      el.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Zone</th><th>Measure</th><th>Start</th><th>End</th><th class="num">Duration</th><th>Direction</th><th class="num">Peak</th><th class="num">Limit</th><th>Severity</th></tr></thead><tbody>
        ${rows.map((x) => {
          const crit = x.side === 'high' ? x.l.actionHigh != null && x.peak > x.l.actionHigh : x.l.actionLow != null && x.peak < x.l.actionLow;
          return `<tr><td>${esc(x.zone)}</td><td>${x.metric === 'temperature' ? 'Temperature' : 'Humidity'}</td>
            <td class="nowrap">${esc(dateTime(x.from).slice(0, 16))}</td><td class="nowrap">${esc(dateTime(x.to).slice(0, 16))}</td>
            <td class="num">${formatDuration(x.durationMs)}</td><td>${x.side === 'high' ? 'Above' : 'Below'}</td>
            <td class="num">${num(x.peak)} ${x.unit}</td><td class="num">${x.limit} ${x.unit}</td>
            <td><span class="status-chip st-${crit ? 'critical' : 'warning'}">${crit ? 'Beyond action limit' : 'Alert band'}</span></td></tr>`;
        }).join('')}</tbody></table></div>`;
    }

    async function hvacHistory() {
      const p = getProvider();
      const el = $('[data-hvac]');
      $('[data-hvac-tag]').innerHTML = storeState.mode === 'demo' ? DEMO_TAG : '';
      if (!p?.capabilities.hvacHistory) { el.innerHTML = stateBox('empty', 'Historian not configured', 'Operating-state history is available only when a historian service is supplied.'); return; }
      el.innerHTML = stateBox('loading', 'Loading operating-state history…');
      const now = Date.now(), from = now - RANGES[ui.range].ms;
      try {
        const data = await p.hvacHistory({ from, to: now });
        const span = now - from;
        const eqs = (ui.zone === 'all' ? EQUIPMENT : EQUIPMENT.filter((e) => e.zoneId === ui.zone)).slice().sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
        let lastType = null;
        const rows = eqs.map((eq) => {
          const head = eq.type !== lastType ? `<div class="tl-group">${esc(EQUIPMENT_TYPES[eq.type].label)}</div>` : '';
          lastType = eq.type;
          const d = data.find((x) => x.equipmentId === eq.id);
          const segs = (d?.segments || []).map((s) => `<div class="tl-seg ${s.state}" style="left:${((s.from - from) / span) * 100}%;width:${((s.to - s.from) / span) * 100}%" title="${s.state} · ${esc(dateTime(s.from))} – ${esc(dateTime(s.to))}"></div>`).join('');
          return `${head}<div class="tl-row"><span><strong class="mono">${esc(eq.id)}</strong> <span class="muted">${esc(ZONES.find((z) => z.id === eq.zoneId).name)}</span></span><div class="tl-bar" role="img" aria-label="Operating state history for ${esc(eq.id)}">${segs}</div></div>`;
        }).join('');
        const long = span > 36 * 3600e3;
        const axis = [0, 0.25, 0.5, 0.75, 1].map((f) => `<span>${esc(long ? day(from + f * span) : time(from + f * span))}</span>`).join('');
        el.innerHTML = `<div class="timeline">${rows}<div class="tl-axis">${axis}</div></div>
          <div class="tl-legend"><span><i style="background:#2F7D59"></i>Running</span><span><i style="background:#CFE0D7"></i>Standby</span><span><i style="background:#B42332"></i>Stopped (expected running)</span><span><i class="tl-seg unknown" style="position:static;display:inline-block"></i>Unknown / no data</span></div>`;
      } catch (err) {
        el.innerHTML = err.notConfigured ? stateBox('empty', 'Historian not configured') : stateBox('error', 'Could not load operating-state history', err.message);
      }
    }

    async function load() {
      root.querySelectorAll('[data-sub]').forEach((el) => (el.textContent = `${ui.zone === 'all' ? 'All zones' : ZONES.find((z) => z.id === ui.zone).name} · last ${RANGES[ui.range].label}`));
      $('[data-note]').innerHTML = storeState.mode === 'demo'
        ? `<div class="notice demo no-print">${icon('info')}<span><strong>Illustrative history.</strong> All history on this page is generated in the browser for demonstration. It is not recorded site data.</span></div>`
        : `<div class="notice no-print">${icon('info')}<span><strong>Historian not configured.</strong> Trend history, operating-state history and reports require a historian service, which has not been supplied.</span></div>`;
      $('[data-sum-tag]').innerHTML = storeState.mode === 'demo' ? DEMO_TAG : '';
      const [t, h] = await Promise.all([tT.load({ zoneId: ui.zone, range: ui.range }), tH.load({ zoneId: ui.zone, range: ui.range }), hvacHistory()]);
      lastLoad = { t, h };
      summary(t, h);
      printHead();
    }

    function exportCsv() {
      const { t, h } = lastLoad || {};
      if (!t && !h) { toast('No history to export — historian not configured', 'err'); return; }
      const lines = [
        `# ${SITE.name} — environmental history export`,
        `# Data source: ${MODE_TEXT[storeState.mode]}`,
        `# Time zone: ${SITE.timeZoneLabel}; timestamps are ISO 8601 with +02:00 offset`,
        `# Zone: ${ui.zone === 'all' ? 'All zones' : ZONES.find((z) => z.id === ui.zone).name}; range: last ${RANGES[ui.range].label}`,
        `# Generated: ${isoSast(Date.now())}`,
        `# Limits: ${THRESHOLDS_LABEL}`,
        'timestamp,zone,measure,value,unit,quality',
      ];
      for (const data of [t, h]) {
        if (!data) continue;
        for (const s of data.series) for (const [ts, v] of s.points) {
          lines.push([isoSast(ts), `"${s.label}"`, data.metric, v == null ? '' : v.toFixed(2), data.unit, v == null ? 'missing' : storeState.mode === 'demo' ? 'illustrative' : 'good'].join(','));
        }
      }
      const csv = lines.join('\r\n') + '\r\n';
      if (window.MBMS_HOSTED) { showCsv(csv); return; } // hosted frame blocks file downloads
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `middelburg-environment-${storeState.mode}-${ui.range}-${dateTime(Date.now()).slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(storeState.mode === 'demo' ? 'CSV exported (demonstration data)' : 'CSV exported');
    }

    $('[data-zone]').addEventListener('change', (e) => { ui.zone = e.target.value; load(); });
    root.querySelector('.seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-range]'); if (!b) return;
      ui.range = b.dataset.range;
      root.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      load();
    });
    // Hosted page: shows the CSV text to copy instead of downloading a file.
    function showCsv(csv) {
      const d = openDrawer({
        title: 'CSV export',
        subtitle: storeState.mode === 'demo' ? 'Demonstration data · copy and paste into a .csv file' : 'Copy and paste into a .csv file',
        body: `<p class="small muted">File downloads are not available on this hosted page. Copy the text below and save it as a .csv file.</p>
          <textarea class="input mono" id="csv-text" readonly style="min-height:50vh;white-space:pre">${esc(csv)}</textarea>`,
        foot: '<div class="toolbar"><button class="btn primary" type="button" data-copy>Copy CSV</button></div>',
      });
      const ta = d.el.querySelector('#csv-text');
      d.el.querySelector('[data-copy]').addEventListener('click', () => {
        navigator.clipboard.writeText(csv).then(() => toast('CSV copied'), () => { ta.focus(); ta.select(); toast('Press Ctrl+C to copy the selected text'); });
      });
    }
    if (window.MBMS_HOSTED) $('[data-print]').hidden = true; // printing is unavailable in the hosted frame
    $('[data-print]').addEventListener('click', () => { printHead(); window.print(); });
    $('[data-csv]').addEventListener('click', exportCsv);

    let lastMode = null;
    return {
      update(s) {
        if (s.mode !== lastMode && s.mode !== 'starting' && !s.loading) { lastMode = s.mode; load(); return; }
        if (ui.range === 'live' && !s.loading) {
          tT.tick(); tH.tick();
          lastLoad = { t: tT.data, h: tH.data };
          summary(lastLoad.t, lastLoad.h);
        }
      },
      destroy() { tT.destroy(); tH.destroy(); },
    };
  },
};
