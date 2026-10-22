/* Trend widget: quality-aware line chart + run-state strips for the related units.
 *
 * cfg (functions so filters can change between loads):
 *   measure, unit, yTitle, digits
 *   series():   [{ unitId, role, label, color }]
 *   limits():   { alertLow, alertHigh, actionLow, actionHigh } | null
 *   runUnits(): [unitId]           strips under the chart
 *   fanOffUnit(): unitId | null    shade that unit's fan-off periods on the chart
 *   markers():  [{ ts, severity }] alarm markers */
import { ZONES, equipmentById, equipmentForZone } from '../config/site.js';
import { ZONE_SOURCES } from '../config/points.js';
import { getThresholds } from '../config/settings-store.js';
import { lineChart, qualityBands, legendHTML, ZONE_COLORS, MEASURE_COLORS } from './charts.js';
import { stateBox } from './components.js';
import { RANGES, getUnitSeries, getRunSegments, state } from '../data/store.js';
import { esc, time } from '../util/format.js';

const RUN_TEXT = { running: 'fan running', stopped: 'fan stopped', fault: 'FAULT (fan off)', unknown: 'state unknown' };
const unitLabel = (id) => { const e = equipmentById(id); return e ? `${e.name} (${id})` : id; };

export function mountTrend(el, cfg) {
  let chart = null, seq = 0, current = null, lastData = null;
  el.innerHTML = `<div class="chart-box"><canvas role="img"></canvas></div>
    <div class="run-strips" data-strips></div>
    <div data-legend></div><div class="chart-note" data-note></div>`;
  const box = el.querySelector('.chart-box');
  const canvas = el.querySelector('canvas');
  const stripsEl = el.querySelector('[data-strips]');
  const legendEl = el.querySelector('[data-legend]');
  const noteEl = el.querySelector('[data-note]');

  const overlay = (html) => { box.querySelector('.state')?.remove(); if (html) box.insertAdjacentHTML('beforeend', html); };

  function renderStrips(runs, from, to) {
    if (!runs.length) { stripsEl.innerHTML = ''; return; }
    const span = to - from;
    stripsEl.innerHTML = runs.map(({ unitId, segments, error }) => `<div class="run-strip" aria-label="Run state of ${esc(unitLabel(unitId))}">
        <span class="rs-label">${esc(unitId)}</span>
        <div class="rs-bar">${error ? `<div class="rs-seg unknown" style="left:0;width:100%" title="${esc(error)}"></div>`
          : segments.map((s) => `<div class="rs-seg ${s.state}" style="left:${((s.from - from) / span) * 100}%;width:${Math.max(0.2, ((s.to - s.from) / span) * 100)}%"
            title="${esc(`${unitLabel(unitId)} ${RUN_TEXT[s.state]} ${time(s.from)} to ${time(s.to)}`)}"></div>`).join('')}</div>
      </div>`).join('');
  }

  async function load(rangeKey, { quiet = false } = {}) {
    const my = ++seq;
    current = rangeKey;
    const r = RANGES[rangeKey];
    const specs = cfg.series();
    if (!quiet) overlay(stateBox('loading', 'Loading trend…'));
    try {
      const results = await Promise.all(specs.map((s) => getUnitSeries(s.unitId, s.role, rangeKey)));
      const runIds = cfg.runUnits?.() || [];
      const runs = await Promise.all(runIds.map((unitId) => getRunSegments(unitId, rangeKey).then((x) => ({ unitId, ...x })).catch((err) => ({ unitId, segments: [], error: err.message }))));
      if (my !== seq) return null;
      const from = results[0]?.from ?? Date.now() - r.ms, to = results[0]?.to ?? Date.now();
      const series = specs.map((s, i) => ({ ...s, points: results[i].points }));
      const anyLive = series.some((s) => s.points.some((p) => p[2] === 'live' && p[1] != null));
      chart?.destroy(); chart = null;
      // Quality bands: hatched only when there is one series (a band would mislead other lines).
      let bands = [];
      const notes = [];
      if (series.length === 1) bands = qualityBands(series[0].points, to);
      else for (const s of series) for (const b of qualityBands(s.points, to)) if (b.kind !== 'gap') notes.push(`${s.label}: ${b.kind === 'offline' ? 'sensor offline' : b.kind} from ${time(b.from)}`);
      const fanUnit = cfg.fanOffUnit?.();
      if (fanUnit) {
        const fr = runs.find((x) => x.unitId === fanUnit);
        for (const sgm of fr?.segments || []) if (sgm.state === 'stopped' || sgm.state === 'fault') bands.push({ from: sgm.from, to: sgm.to, kind: 'fan-off' });
      }
      if (!anyLive && !bands.length) {
        stripsEl.innerHTML = ''; legendEl.innerHTML = ''; noteEl.textContent = '';
        overlay(stateBox('empty', 'No live readings in this period', 'Nothing was recorded with LIVE quality for this range.'));
        renderStrips(runs, from, to);
        return null;
      }
      chart = lineChart(canvas, series, {
        unit: cfg.unit, yTitle: cfg.yTitle, digits: cfg.digits ?? 1, from, to,
        limits: cfg.limits?.() || null, bands,
        markers: (cfg.markers?.() || []).filter((m) => m.ts >= from && m.ts <= to),
        onLayout: (a) => { stripsEl.style.paddingLeft = `${a.left}px`; stripsEl.style.width = `${a.right}px`; },
      });
      canvas.setAttribute('aria-label', `${cfg.yTitle} over the last ${r.label}`);
      overlay('');
      renderStrips(runs, from, to);
      legendEl.innerHTML = series.length > 1 ? legendHTML(series) : '';
      const src = results[0]?.source;
      noteEl.innerHTML = [
        src === 'demo' ? '<span class="tag demo">SIMULATED</span>' : src === 'browser' ? 'Recorded by this dashboard on every poll.' : '',
        notes.length ? esc(notes.join(' · ')) : '',
      ].filter(Boolean).join(' ');
      lastData = { series, unit: cfg.unit, measure: cfg.measure, from, to, range: rangeKey };
      return lastData;
    } catch (err) {
      if (my !== seq) return null;
      chart?.destroy(); chart = null; lastData = null;
      legendEl.innerHTML = ''; stripsEl.innerHTML = '';
      overlay(err.notConfigured
        ? stateBox('empty', 'Historian not configured', `${err.message}. The 1 h range uses readings recorded by this dashboard.`)
        : err.connectionLost ? stateBox('error', 'JACE connection lost', 'History cannot be read while the connection is down.')
        : stateBox('error', 'Could not load the trend', err.message));
      return null;
    }
  }

  return {
    load,
    /** Redraw quietly on each poll when the 1 h range is showing. */
    tick() { if (current === '1h') load(current, { quiet: true }); },
    get data() { return lastData; },
    get range() { return current; },
    destroy() { seq++; chart?.destroy(); },
  };
}

/** One measure for one zone or all zones (Overview, Environment, Trends pages). */
export function mountTrendCard(el, measure) {
  const META = { temperature: { unit: '°C', yTitle: 'Space temperature (°C)' }, humidity: { unit: '%RH', yTitle: 'Relative humidity (%RH)' } };
  let zoneId = 'all';
  const zones = () => ZONES.filter((z) => zoneId === 'all' || z.id === zoneId);
  const t = mountTrend(el, {
    measure, ...META[measure],
    series: () => zones().map((z) => ({ zoneId: z.id, unitId: ZONE_SOURCES[z.id], role: measure, label: z.name, color: zoneId === 'all' ? ZONE_COLORS[z.id] : MEASURE_COLORS[measure] })),
    limits: () => (zoneId === 'all' ? null : getThresholds(zoneId)?.[measure] || null),
    runUnits: () => (zoneId === 'all' ? [] : equipmentForZone(zoneId).map((e) => e.id)),
    fanOffUnit: () => (zoneId === 'all' ? null : ZONE_SOURCES[zoneId]),
    markers: () => state.alarms.filter((a) => (zoneId === 'all' || a.zoneId === zoneId) && (a.role === measure || a.category !== 'threshold')).map((a) => ({ ts: a.raisedAt, severity: a.severity })),
  });
  return {
    load({ zoneId: z = 'all', range = '1h' }) { zoneId = z; return t.load(range); },
    tick: t.tick,
    get data() { return t.data; },
    destroy: t.destroy,
  };
}
