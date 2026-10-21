/* Calculations on recorded series. Results describe the data only and make
 * no claim of regulatory compliance. */

/** ΔH/R for mean kinetic temperature: ΔH = 83.144 kJ/mol (conventional), R = 8.3144 J/(mol·K) -> 10 000 K. */
export const MKT_DH_OVER_R = 10000;

/**
 * Mean kinetic temperature (°C) of evenly spaced temperature samples (°C).
 * MKT = (ΔH/R) / -ln( (1/n) Σ exp(-ΔH/(R·Ti)) ), Ti in kelvin.
 * Returns null when there are fewer than 2 samples.
 */
export function meanKineticTemperature(valuesC) {
  const v = valuesC.filter((x) => x != null && isFinite(x));
  if (v.length < 2) return null;
  const k = MKT_DH_OVER_R;
  const sum = v.reduce((acc, c) => acc + Math.exp(-k / (c + 273.15)), 0);
  return k / -Math.log(sum / v.length) - 273.15;
}

/**
 * Periods where a series sits outside [low, high] (null = no limit on that side).
 * points: [[ts, value|null], ...] evenly spaced; gaps (null) end an excursion.
 * Returns [{ from, to, durationMs, side, peak, limit }]
 */
export function excursions(points, low, high, stepMs) {
  const out = [];
  let cur = null;
  const close = (endTs) => { if (cur) { cur.to = endTs; cur.durationMs = Math.max(stepMs, cur.to - cur.from); out.push(cur); cur = null; } };
  for (const [t, v] of points) {
    const side = v == null ? null : high != null && v > high ? 'high' : low != null && v < low ? 'low' : null;
    if (side && cur && cur.side === side) {
      cur.peak = side === 'high' ? Math.max(cur.peak, v) : Math.min(cur.peak, v);
      cur.last = t;
    } else {
      close(cur ? cur.last + stepMs : t);
      if (side) cur = { from: t, last: t, side, peak: v, limit: side === 'high' ? high : low };
    }
  }
  close(cur ? cur.last + stepMs : 0);
  return out.map(({ last, ...rest }) => rest);
}

export function formatDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
