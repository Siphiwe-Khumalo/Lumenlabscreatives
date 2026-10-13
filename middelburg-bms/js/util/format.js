import { SITE } from '../config/site.js';

const TZ = SITE.timeZone;
const fmt = (opts) => new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, ...opts });
const fDateTime = fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fDateTimeShort = fmt({ day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const fTime = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const fTimeSec = fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fDayLong = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fDay = fmt({ day: '2-digit', month: 'short' });

function parts(ts) {
  const o = {};
  for (const p of fDateTime.formatToParts(new Date(ts))) o[p.type] = p.value;
  return o;
}

/** 2026-10-13 14:05:09 in Africa/Johannesburg */
export function dateTime(ts) {
  if (ts == null || !isFinite(ts)) return '—';
  const p = parts(ts);
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}
export const dateTimeShort = (ts) => (ts == null ? '—' : fDateTimeShort.format(new Date(ts)));
export const time = (ts) => (ts == null ? '—' : fTime.format(new Date(ts)));
export const timeSec = (ts) => (ts == null ? '—' : fTimeSec.format(new Date(ts)));
export const dayLong = (ts) => fDayLong.format(new Date(ts));
export const day = (ts) => fDay.format(new Date(ts));
/** YYYY-MM-DD for date inputs, in site time. */
export function isoDay(ts) { const p = parts(ts); return `${p.year}-${p.month}-${p.day}`; }
/** Start of a YYYY-MM-DD day in site time (SAST has no DST: fixed +02:00). */
export const dayStart = (iso) => Date.parse(`${iso}T00:00:00+02:00`);

export function ago(ts, now = Date.now()) {
  if (ts == null) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 6) / 10;
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function num(v, digits = 1) {
  return v == null || !isFinite(v) ? '—' : Number(v).toFixed(digits);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
