/* Sensor calibration register. ILLUSTRATIVE dates — replace with the site's
 * calibration certificates. Dates are YYYY-MM-DD (SAST). */
export const CALIBRATION_LABEL = 'Illustrative calibration dates — replace with site certificates';
export const CALIBRATION_WARN_DAYS = 30;

export const CALIBRATION = Object.freeze({
  'main-store': { temperature: { last: '2026-03-12', intervalMonths: 12 }, humidity: { last: '2026-03-12', intervalMonths: 12 } },
  'dispatch':   { temperature: { last: '2026-01-20', intervalMonths: 12 }, humidity: { last: '2025-10-01', intervalMonths: 12 } },
  'storage-b':  { temperature: { last: '2026-05-08', intervalMonths: 12 }, humidity: { last: '2026-05-08', intervalMonths: 12 } },
  'receiving':  { temperature: { last: '2025-11-05', intervalMonths: 12 }, humidity: { last: '2025-11-05', intervalMonths: 12 } },
});

/** Returns { last, nextDue, daysLeft, status: 'ok'|'due-soon'|'overdue' } */
export function calibrationStatus(zoneId, sensor, now = Date.now()) {
  const c = CALIBRATION[zoneId]?.[sensor];
  if (!c) return null;
  const [y, m, d] = c.last.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1 + c.intervalMonths, d) - 2 * 3600e3); // SAST midnight
  const nextIso = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  const daysLeft = Math.floor((next.getTime() - now) / 864e5);
  return { last: c.last, nextDue: nextIso, daysLeft, status: daysLeft < 0 ? 'overdue' : daysLeft <= CALIBRATION_WARN_DAYS ? 'due-soon' : 'ok' };
}
