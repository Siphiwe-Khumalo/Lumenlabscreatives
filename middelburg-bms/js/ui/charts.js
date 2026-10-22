/* Chart.js helpers — honest time series.
 *  - straight segments between samples (no smoothing, tension 0)
 *  - a non-live sample is null, so the line STOPS; it is never bridged
 *  - non-live periods are drawn as grey hatched bands with a label and start time
 *  - fan-off periods are drawn as a light band, alarms as vertical markers
 * Times in Africa/Johannesburg. */
import { time, timeSec, day, dateTimeShort } from '../util/format.js';

export const ZONE_COLORS = { 'main-store': '#2F6FED', 'dispatch': '#F28C28', 'storage-b': '#1FA971', 'receiving': '#7C5CE6' };
export const MEASURE_COLORS = { temperature: '#F28C28', humidity: '#1CB5E0', temperatureSetpoint: '#0B1F3A' };

const BAND_TEXT = { offline: 'Sensor offline', stale: 'Stale — no update', 'out-of-range': 'Out of range', 'not-mapped': 'Not mapped', gap: 'No data recorded' };

let hatch = null;
function hatchPattern(ctx) {
  if (hatch) return hatch;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(238,241,245,0.9)'; g.fillRect(0, 0, 8, 8);
  g.strokeStyle = 'rgba(138,148,166,0.65)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
  hatch = ctx.createPattern(c, 'repeat');
  return hatch;
}

const overlayPlugin = {
  id: 'mbmsOverlay',
  beforeDatasetsDraw(chart, _a, o) {
    const { ctx, chartArea: a, scales: { x, y } } = chart;
    if (!o) return;
    ctx.save();
    // acceptable range tint + limit lines
    const L = o.limits;
    if (L && (L.alertLow != null || L.alertHigh != null)) {
      const top = L.alertHigh != null ? y.getPixelForValue(L.alertHigh) : a.top;
      const bot = L.alertLow != null ? y.getPixelForValue(L.alertLow) : a.bottom;
      ctx.fillStyle = 'rgba(31,169,113,0.06)';
      ctx.fillRect(a.left, Math.max(top, a.top), a.right - a.left, Math.min(bot, a.bottom) - Math.max(top, a.top));
    }
    const hline = (v, color, dash, text) => {
      if (v == null) return;
      const py = y.getPixelForValue(v);
      if (py < a.top || py > a.bottom) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = '600 10px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(text, a.right - 4, py - 3);
    };
    if (L) {
      hline(L.alertHigh, '#C98A00', [5, 4], `Alert ${L.alertHigh}`);
      hline(L.alertLow, '#C98A00', [5, 4], `Alert ${L.alertLow}`);
      hline(L.actionHigh, '#E5484D', [2, 3], `Action ${L.actionHigh}`);
      hline(L.actionLow, '#E5484D', [2, 3], `Action ${L.actionLow}`);
    }
    // quality / fan-off bands
    for (const b of o.bands || []) {
      const x1 = Math.max(a.left, x.getPixelForValue(b.from)), x2 = Math.min(a.right, x.getPixelForValue(b.to));
      if (x2 - x1 < 1) continue;
      if (b.kind === 'fan-off') {
        ctx.fillStyle = 'rgba(138,148,166,0.12)';
        ctx.fillRect(x1, a.top, x2 - x1, a.bottom - a.top);
        ctx.fillStyle = '#56657C'; ctx.font = '600 10px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.textAlign = 'left';
        if (x2 - x1 > 40) ctx.fillText('Fan off', x1 + 4, a.bottom - 6);
        continue;
      }
      ctx.fillStyle = b.kind === 'gap' ? 'rgba(238,241,245,0.8)' : hatchPattern(ctx);
      ctx.fillRect(x1, a.top, x2 - x1, a.bottom - a.top);
      ctx.strokeStyle = 'rgba(138,148,166,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, a.top); ctx.lineTo(x1, a.bottom); ctx.stroke();
      const text = `${BAND_TEXT[b.kind] || 'No live data'}${b.kind !== 'gap' ? ` from ${time(b.from)}` : ''}`;
      ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.textAlign = 'left';
      const w = ctx.measureText(text).width + 10;
      if (x2 - x1 > 34) {
        const tx = Math.min(x1 + 4, a.right - w);
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(tx, a.top + 4, w, 18);
        ctx.fillStyle = '#3B4658'; ctx.fillText(text, tx + 5, a.top + 17);
      }
    }
    ctx.restore();
  },
  afterDatasetsDraw(chart, _a, o) {
    const { ctx, chartArea: a, scales: { x } } = chart;
    ctx.save();
    // alarm markers
    for (const m of o?.markers || []) {
      const px = x.getPixelForValue(m.ts);
      if (px < a.left || px > a.right) continue;
      const color = m.severity === 'critical' ? '#E5484D' : '#F2A900';
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, a.top + 8); ctx.lineTo(px, a.bottom); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(px - 5, a.top); ctx.lineTo(px + 5, a.top); ctx.lineTo(px, a.top + 8); ctx.closePath(); ctx.fill();
    }
    // crosshair
    const active = chart.tooltip?.getActiveElements?.();
    if (active && active.length) {
      const px = active[0].element.x;
      ctx.strokeStyle = 'rgba(15,27,45,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
    }
    ctx.restore();
  },
  afterLayout(chart, _a, o) { o?.onLayout?.(chart.chartArea); },
};

let registered = false;
function ensure() {
  if (!window.Chart) throw new Error('Chart library failed to load');
  if (!registered) {
    window.Chart.register(overlayPlugin);
    window.Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
    window.Chart.defaults.font.size = 11;
    window.Chart.defaults.color = '#56657C';
    registered = true;
  }
}

/** Contiguous non-live periods of a series: [{ from, to, kind }]. */
export function qualityBands(points, to) {
  const bands = [];
  let cur = null;
  for (let i = 0; i < points.length; i++) {
    const [t, , q] = points[i];
    const bad = q && q !== 'live';
    if (bad && cur && cur.kind === q) continue;
    if (cur) { cur.to = t; bands.push(cur); cur = null; }
    if (bad) cur = { from: t, kind: q };
  }
  if (cur) { cur.to = to; bands.push(cur); }
  return bands;
}

/**
 * series: [{ label, color, points: [[ts, value|null, quality]] }]
 * opts: { unit, yTitle, from, to, digits, limits, bands, markers, onLayout }
 */
export function lineChart(canvas, series, opts) {
  ensure();
  const span = opts.to - opts.from;
  const long = span > 36 * 3600e3, short = span <= 2 * 3600e3;
  const values = series.flatMap((s) => s.points.map((p) => p[1])).filter((v) => v != null);
  const L = opts.limits || {};
  const extra = [L.alertLow, L.alertHigh].filter((v) => v != null);
  const lo = Math.min(...values, ...extra), hi = Math.max(...values, ...extra);
  const pad = Math.max(0.5, (hi - lo) * 0.1);
  return new window.Chart(canvas, {
    type: 'line',
    data: {
      datasets: series.map((s) => ({
        label: s.label,
        data: s.points.map(([x, y, q]) => ({ x, y: q && q !== 'live' ? null : y })),
        borderColor: s.color, backgroundColor: s.color,
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 8,
        tension: 0, spanGaps: false, stepped: s.stepped || false,
      })),
    },
    options: {
      animation: false, maintainAspectRatio: false, parsing: false, normalized: true,
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      scales: {
        x: {
          type: 'linear', min: opts.from, max: opts.to,
          grid: { color: '#EEF2F7' }, border: { color: '#CBD4E1' },
          ticks: { maxTicksLimit: long ? 8 : 7, maxRotation: 0, callback: (v) => (long ? day(v) : short ? timeSec(v).slice(0, 5) : time(v)) },
        },
        y: {
          suggestedMin: values.length ? lo - pad : undefined, suggestedMax: values.length ? hi + pad : undefined,
          grid: { color: '#EEF2F7' }, border: { display: false },
          title: { display: !!opts.yTitle, text: opts.yTitle },
          ticks: { callback: (v) => Number(v).toFixed(hi - lo < 6 ? 1 : opts.unit === '%RH' ? 0 : 1) },
        },
      },
      plugins: {
        legend: { display: false },
        mbmsOverlay: { limits: opts.limits, bands: opts.bands, markers: opts.markers, onLayout: opts.onLayout },
        tooltip: {
          backgroundColor: '#0B1F3A', padding: 10, boxPadding: 4, usePointStyle: true,
          callbacks: {
            title: (items) => (items.length ? `${dateTimeShort(items[0].parsed.x)} SAST` : ''),
            label: (item) => `${item.dataset.label}: ${item.parsed.y == null ? 'no live reading' : `${item.parsed.y.toFixed(opts.digits ?? 1)} ${opts.unit}`}`,
          },
        },
      },
    },
  });
}

export function legendHTML(series) {
  return `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>`;
}
