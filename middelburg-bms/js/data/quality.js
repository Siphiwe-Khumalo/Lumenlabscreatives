/* Reading quality and status evaluation.
 * A reading is { value, unit, ts, quality: 'good'|'stale'|'bad'|'missing', error? }.
 * Anything other than a fresh, good reading evaluates to UNKNOWN — never Normal. */
import { APP_CONFIG } from '../config/app-config.js';

export const QUALITY_LABEL = { good: 'Good', stale: 'Stale', bad: 'Bad', missing: 'Missing' };
export const STATUS_LABEL = { normal: 'Normal', warning: 'Warning', critical: 'Critical', unknown: 'Unknown' };
export const STATUS_RANK = { normal: 0, unknown: 1, warning: 2, critical: 3 };

export function missing(error = 'No data') {
  return { value: null, unit: null, ts: null, quality: 'missing', error };
}

/** Applies the stale-after rule to a reading (provider-agnostic). */
export function normalise(reading, now = Date.now()) {
  if (!reading) return missing();
  const r = { ...reading };
  if (r.quality === 'good') {
    if (r.value == null || (typeof r.value === 'number' && !isFinite(r.value))) { r.quality = 'missing'; r.error = r.error || 'No value'; }
    else if (r.ts == null) { r.quality = 'stale'; r.error = 'No timestamp'; }
    else if (now - r.ts > APP_CONFIG.staleAfterMs) { r.quality = 'stale'; r.error = `No update for more than ${Math.round(APP_CONFIG.staleAfterMs / 60000)} min`; }
  }
  return r;
}

export const isGood = (r) => !!r && r.quality === 'good' && r.value != null;

/** Evaluates a numeric reading against { actionLow, alertLow, alertHigh, actionHigh }. */
export function evaluate(reading, limits) {
  if (!isGood(reading)) return { status: 'unknown', reason: reading?.error || 'No current reading' };
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
