/* Reading quality and status evaluation.
 *
 * A reading is { value, unit, ts, quality, error?, lastGood?, override? }.
 * Quality states (shown the same way everywhere):
 *   live          a current, good value — the ONLY state whose value is displayed
 *   stale         no update within the stale period, or the JACE connection is lost
 *   offline       sensor / comms down, or the JACE reports fault / down / disabled
 *   not-mapped    not connected to a real controller point (no point, or point not found)
 *   out-of-range  the reported value is outside the sensor's plausible range
 * Anything other than LIVE evaluates to UNKNOWN status — never Normal. */
import { APP_CONFIG } from '../config/app-config.js';

export const QUALITY = Object.freeze({ LIVE: 'live', STALE: 'stale', OFFLINE: 'offline', NOT_MAPPED: 'not-mapped', OUT_OF_RANGE: 'out-of-range' });
export const QUALITY_LABEL = { live: 'LIVE', stale: 'STALE', offline: 'OFFLINE', 'not-mapped': 'NOT MAPPED', 'out-of-range': 'OUT OF RANGE' };
/** One-letter codes used when storing history compactly. */
export const QUALITY_CODE = { live: 'L', stale: 'S', offline: 'O', 'not-mapped': 'N', 'out-of-range': 'R' };
export const QUALITY_FROM_CODE = Object.fromEntries(Object.entries(QUALITY_CODE).map(([k, v]) => [v, k]));

export const STATUS_LABEL = { normal: 'Normal', warning: 'Warning', critical: 'Critical', unknown: 'Unknown' };
export const STATUS_RANK = { normal: 0, unknown: 1, warning: 2, critical: 3 };

export function notMapped(error = 'Not connected to a controller point') {
  return { value: null, unit: null, ts: null, quality: QUALITY.NOT_MAPPED, error };
}

/**
 * Applies the stale and plausibility rules to a reading.
 * @param role   logical role (for plausible range)
 * @param staleMs stale period in ms
 */
export function normalise(reading, role, staleMs, now = Date.now()) {
  if (!reading) return notMapped();
  const r = { ...reading };
  if (r.quality === QUALITY.LIVE) {
    const range = APP_CONFIG.plausibleRanges[role];
    if (r.value == null || (typeof r.value === 'number' && !isFinite(r.value))) {
      r.quality = QUALITY.OFFLINE; r.error = r.error || 'No value reported';
    } else if (range && typeof r.value === 'number' && (r.value < range[0] || r.value > range[1])) {
      r.quality = QUALITY.OUT_OF_RANGE; r.error = `Reported ${r.value} is outside the plausible range ${range[0]} to ${range[1]}`; r.value = null;
    } else if (r.ts == null) {
      r.quality = QUALITY.STALE; r.error = 'No timestamp';
    } else if (now - r.ts > staleMs) {
      r.quality = QUALITY.STALE; r.error = `No update for ${Math.round((now - r.ts) / 1000)} s (limit ${Math.round(staleMs / 1000)} s)`;
    }
  }
  if (r.quality !== QUALITY.LIVE) r.value = null; // a non-live reading never carries a displayable value
  return r;
}

export const isGood = (r) => !!r && r.quality === QUALITY.LIVE && r.value != null;

/** Evaluates a numeric reading against { actionLow, alertLow, alertHigh, actionHigh }. */
export function evaluate(reading, limits) {
  if (!isGood(reading)) return { status: 'unknown', reason: reading ? `${QUALITY_LABEL[reading.quality]}${reading.error ? ' — ' + reading.error : ''}` : 'No reading' };
  if (!limits) return { status: 'unknown', reason: 'No limits configured' };
  const v = reading.value;
  const { actionLow, alertLow, alertHigh, actionHigh } = limits;
  if (actionHigh != null && v > actionHigh) return { status: 'critical', reason: `Above action limit (${actionHigh})`, limit: actionHigh, side: 'high' };
  if (actionLow != null && v < actionLow) return { status: 'critical', reason: `Below action limit (${actionLow})`, limit: actionLow, side: 'low' };
  if (alertHigh != null && v > alertHigh) return { status: 'warning', reason: `Above alert limit (${alertHigh})`, limit: alertHigh, side: 'high' };
  if (alertLow != null && v < alertLow) return { status: 'warning', reason: `Below alert limit (${alertLow})`, limit: alertLow, side: 'low' };
  return { status: 'normal', reason: 'Within acceptable range' };
}

export function worst(statuses) {
  let w = null;
  for (const s of statuses) if (w == null || STATUS_RANK[s] > STATUS_RANK[w]) w = s;
  return w || 'unknown';
}

export function rangeText(l, unit) {
  if (!l) return '—';
  const lo = l.alertLow, hi = l.alertHigh;
  if (lo != null && hi != null) return `${lo}–${hi} ${unit}`;
  if (hi != null) return `≤ ${hi} ${unit}`;
  if (lo != null) return `≥ ${lo} ${unit}`;
  return '—';
}
