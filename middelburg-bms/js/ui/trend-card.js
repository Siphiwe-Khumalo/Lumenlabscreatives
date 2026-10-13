/* Trend chart card body: loading / empty / error / not-configured states,
 * acceptable-range band when a single zone is shown. */
import { ZONES } from '../config/site.js';
import { getThresholds } from '../config/settings-store.js';
import { lineChart, RANGES, ZONE_COLORS, SINGLE_COLOR, legendHTML } from './charts.js';
import { stateBox } from './components.js';
import { getProvider, state } from '../data/store.js';

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

  async function load({ zoneId = 'all', range = '24h' }) {
    const my = ++seq;
    const r = RANGES[range];
    const now = Date.now();
    const zoneIds = zoneId === 'all' ? ZONES.map((z) => z.id) : [zoneId];
    const provider = getProvider();
    overlay(stateBox('loading', 'Loading history…'));
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

  return {
    load,
    get data() { return lastData; },
    destroy() { seq++; chart?.destroy(); },
  };
}
