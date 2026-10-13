/* Chart.js helpers: time-series line chart with acceptable-range band,
 * action-limit lines, crosshair and tooltips. Times in Africa/Johannesburg. */
import { time, day, dateTimeShort } from '../util/format.js';

export const ZONE_COLORS = { 'main-store': '#2a78d6', 'dispatch': '#d95926', 'storage-b': '#199e70', 'receiving': '#8b5fbf' };
export const SINGLE_COLOR = '#173D30';

const bandPlugin = {
  id: 'mbmsBand',
  beforeDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea: a, scales: { y } } = chart;
    if (!opts || !y) return;
    ctx.save();
    if (opts.band) {
      // An open side (null limit) extends the band to the chart edge.
      const top = opts.band.high != null ? y.getPixelForValue(opts.band.high) : a.top;
      const bot = opts.band.low != null ? y.getPixelForValue(opts.band.low) : a.bottom;
      ctx.fillStyle = 'rgba(40, 122, 80, 0.08)';
      ctx.fillRect(a.left, Math.max(top, a.top), a.right - a.left, Math.min(bot, a.bottom) - Math.max(top, a.top));
    }
    const line = (v, color, dash) => {
      if (v == null) return;
      const py = y.getPixelForValue(v);
      if (py < a.top || py > a.bottom) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
    };
    if (opts.band) { line(opts.band.low, 'rgba(40,122,80,0.55)', [4, 3]); line(opts.band.high, 'rgba(40,122,80,0.55)', [4, 3]); }
    for (const v of opts.action || []) line(v, 'rgba(180,35,50,0.7)', [2, 3]);
    ctx.restore();
  },
};

const crosshairPlugin = {
  id: 'mbmsCrosshair',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.();
    if (!active || !active.length) return;
    const { ctx, chartArea: a } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.strokeStyle = 'rgba(32,41,35,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
    ctx.restore();
  },
};

let registered = false;
function ensure() {
  if (!window.Chart) throw new Error('Chart library failed to load');
  if (!registered) {
    window.Chart.register(bandPlugin, crosshairPlugin);
    window.Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    window.Chart.defaults.font.size = 12;
    window.Chart.defaults.color = '#6B756E';
    registered = true;
  }
}

/**
 * series: [{ label, color, points: [[ts, v|null], ...] }]
 * opts: { unit, yTitle, rangeMs, band: {low, high}|null, action: [v...], digits }
 */
export function lineChart(canvas, series, opts) {
  ensure();
  const long = opts.rangeMs > 36 * 3600e3;
  const values = series.flatMap((s) => s.points.map((p) => p[1])).filter((v) => v != null);
  const extra = [opts.band?.low, opts.band?.high, ...(opts.action || [])].filter((v) => v != null);
  const lo = Math.min(...values, ...extra), hi = Math.max(...values, ...extra);
  const pad = Math.max(0.5, (hi - lo) * 0.08);
  return new window.Chart(canvas, {
    type: 'line',
    data: {
      datasets: series.map((s) => ({
        label: s.label,
        data: s.points.map(([x, y]) => ({ x, y })),
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 8,
        tension: 0.25,
        spanGaps: false,
      })),
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      scales: {
        x: {
          type: 'linear',
          min: opts.from, max: opts.to,
          grid: { color: '#EEF2EF' },
          border: { color: '#CDD6CF' },
          title: { display: true, text: 'Time (SAST)' },
          ticks: { maxTicksLimit: long ? 8 : 7, maxRotation: 0, callback: (v) => (long ? day(v) : time(v)) },
        },
        y: {
          suggestedMin: lo - pad, suggestedMax: hi + pad,
          grid: { color: '#EEF2EF' },
          border: { display: false },
          title: { display: true, text: opts.yTitle },
          ticks: { callback: (v) => `${Number(v).toFixed(opts.unit === '%RH' ? 0 : 1)}` },
        },
      },
      plugins: {
        legend: { display: false },
        mbmsBand: { band: opts.band, action: opts.action },
        tooltip: {
          backgroundColor: '#173D30',
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            title: (items) => (items.length ? `${dateTimeShort(items[0].parsed.x)} SAST` : ''),
            label: (item) => `${item.dataset.label}: ${item.parsed.y == null ? 'no data' : item.parsed.y.toFixed(opts.digits ?? 1) + ' ' + opts.unit}`,
          },
        },
      },
    },
  });
}

export const RANGES = {
  '24h': { label: '24 h', ms: 24 * 3600e3, step: 10 * 60e3 },
  '7d':  { label: '7 days', ms: 7 * 24 * 3600e3, step: 60 * 60e3 },
  '30d': { label: '30 days', ms: 30 * 24 * 3600e3, step: 3 * 60 * 60e3 },
};

export function legendHTML(series, band) {
  const items = series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`);
  if (band) items.push('<span><i class="band"></i>Acceptable range (alert limits)</span>', '<span><i style="background:transparent;border-top:2px dotted rgba(180,35,50,.8);height:0"></i>Action limit</span>');
  return `<div class="legend">${items.join('')}</div>`;
}
