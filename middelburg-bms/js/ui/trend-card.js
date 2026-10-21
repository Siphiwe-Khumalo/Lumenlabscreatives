/* Trend chart card body: loading / empty / error / not-configured states,
 * acceptable-range band when a single zone is shown. */
import { ZONES } from '../config/site.js';
import { getThresholds } from '../config/settings-store.js';
import { lineChart, RANGES, ZONE_COLORS, SINGLE_COLOR, legendHTML } from './charts.js';
import { stateBox } from './components.js';
import { getProvider, state, getLive, liveSince } from '../data/store.js';
import { timeSec } from '../util/format.js';

const META = {
  temperature: { unit: '°C', yTitle: 'Space temperature (°C)', digits: 1 },
  humidity: { unit: '%RH', yTitle: 'Relative humidity (%RH)', digits: 1 },
};

export function mountTrendCard(el, metric) {
  let chart = null;
  let seq = 0;
  el.innerHTML = '<div class="chart-box"><canvas role="img"></canvas></div><div data-legend></div><div class="chart-note" data-note></div>';
  const box = el.querySelector('.chart-box');
  const canvas = el.querySelector('canvas');
  const legendEl = el.querySelector('[data-legend]');
  const noteEl = el.querySelector('[data-note]');
  let lastData = null;

  function overlay(html) {
    box.querySelector('.state')?.remove();
    if (html) box.insertAdjacentHTML('beforeend', html);
  }

  let current = null;

  async function load({ zoneId = 'all', range = '24h' }, { quiet = false } = {}) {
    const my = ++seq;
    current = { zoneId, range };
    const r = RANGES[range];
    const now = Date.now();
    const zoneIds = zoneId === 'all' ? ZONES.map((z) => z.id) : [zoneId];
    const provider = getProvider();
    if (!quiet) overlay(stateBox('loading', r.live ? 'Collecting live readings…' : 'Loading history…'));
    if (r.live) return renderLive(zoneIds, zoneId, r, now);
    if (!provider || !provider.capabilities.history) {
      chart?.destroy(); chart = null; lastData = null;
      legendEl.innerHTML = '';
      noteEl.textContent = '';
      overlay(stateBox('empty', 'Historian not configured', state.mode === 'offline' ? 'No gateway connection, and no historian service has been supplied.' : 'No historian service has been supplied for connected mode.'));
      return null;
    }
    try {
      const data = await provider.history({ metric, zoneIds, from: now - r.ms, to: now, stepMs: r.step });
      if (my !== seq) return null;
      const series = data.map((d) => ({
        zoneId: d.zoneId,
        label: ZONES.find((z) => z.id === d.zoneId)?.name || d.zoneId,
        color: zoneId === 'all' ? ZONE_COLORS[d.zoneId] : SINGLE_COLOR,
        points: d.points,
      }));
      const any = series.some((s) => s.points.some((p) => p[1] != null));
      chart?.destroy(); chart = null;
      if (!any) {
        legendEl.innerHTML = '';
        overlay(stateBox('empty', 'No data in this range', 'No readings were recorded for the selected zone and period.'));
        return null;
      }
      const limits = zoneId === 'all' ? null : getThresholds(zoneId)?.[metric];
      const band = limits && (limits.alertLow != null || limits.alertHigh != null) ? { low: limits.alertLow, high: limits.alertHigh } : null;
      const action = limits ? [limits.actionLow, limits.actionHigh].filter((v) => v != null) : [];
      const m = META[metric];
      chart = lineChart(canvas, series, { ...m, rangeMs: r.ms, from: now - r.ms, to: now, band, action });
      canvas.setAttribute('aria-label', `${m.yTitle} over the last ${r.label} for ${zoneId === 'all' ? 'all zones' : series[0].label}. Illustrative demonstration history.`);
      overlay('');
      legendEl.innerHTML = legendHTML(zoneId === 'all' ? series : [], band);
      const gaps = series.filter((s) => s.points.some((p) => p[1] == null)).map((s) => s.label);
      noteEl.innerHTML = [
        state.mode === 'demo' ? '<span class="tag demo">Illustrative history — generated in browser</span>' : '',
        zoneId === 'all' ? 'Select a single zone to show its acceptable range.' : '',
        gaps.length ? `Gaps indicate no data (${gaps.join(', ')}).` : '',
      ].filter(Boolean).join(' ');
      lastData = { series, metric, unit: m.unit, range, zoneId };
      return lastData;
    } catch (err) {
      if (my !== seq) return null;
      chart?.destroy(); chart = null; lastData = null;
      legendEl.innerHTML = '';
      overlay(err.notConfigured ? stateBox('empty', 'Historian not configured') : stateBox('error', 'Could not load history', err.message));
      return null;
    }
  }

  function renderLive(zoneIds, zoneId, r, now) {
    const from = now - r.ms;
    const series = zoneIds.map((id) => ({
      zoneId: id,
      label: ZONES.find((z) => z.id === id)?.name || id,
      color: zoneId === 'all' ? ZONE_COLORS[id] : SINGLE_COLOR,
      points: getLive('zone', id, metric, from),
    }));
    const count = series.reduce((n, s) => n + s.points.length, 0);
    if (count < 2) {
      chart?.destroy(); chart = null; lastData = null;
      legendEl.innerHTML = '';
      noteEl.textContent = '';
      overlay(stateBox('empty', state.mode === 'offline' ? 'No live readings' : 'Collecting live readings…',
        state.mode === 'offline' ? 'The gateway is not connected, so no readings are arriving.' : 'Points are added on every poll; the graph appears after the second reading.'));
      return null;
    }
    const limits = zoneId === 'all' ? null : getThresholds(zoneId)?.[metric];
    const band = limits && (limits.alertLow != null || limits.alertHigh != null) ? { low: limits.alertLow, high: limits.alertHigh } : null;
    const action = limits ? [limits.actionLow, limits.actionHigh].filter((v) => v != null) : [];
    const m = META[metric];
    chart?.destroy();
    chart = lineChart(canvas, series, { ...m, rangeMs: r.ms, from, to: now, band, action });
    canvas.setAttribute('aria-label', `${m.yTitle}, live readings over the last hour`);
    overlay('');
    legendEl.innerHTML = legendHTML(zoneId === 'all' ? series : [], band);
    const since = liveSince();
    noteEl.innerHTML = state.mode === 'demo'
      ? '<span class="tag demo">Illustrative — demo readings, updates every poll</span>'
      : `<span class="tag live">Live</span> Readings collected in this browser${since ? ` since ${timeSec(since)}` : ''}; updates on every poll.`;
    lastData = { series, metric, unit: m.unit, range: 'live', zoneId };
    return lastData;
  }

  return {
    load,
    /** Re-draw if the live range is showing (call on every store update). */
    tick() { if (current && RANGES[current.range].live) load(current, { quiet: true }); },
    get data() { return lastData; },
    destroy() { seq++; chart?.destroy(); },
  };
}
