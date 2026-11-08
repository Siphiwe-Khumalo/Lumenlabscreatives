// History logger + store (runs inside `npm run dev` on the host PC, no database server needed).
//
// Every LOG_INTERVAL_MIN minutes (default 5), on the clock (14:00, 14:05, ...), every point of every
// unit is read from the JACE and written to two places under HISTORY_DIR (default ./data/history):
//
//   daily/2026-11-03.csv                 one file per day (SAST), every point: open it in Excel.
//                                        Time (SAST), Unit, Unit name, Reading, Value, Units, Status, Point
//   points/RTU-01/temperature/2026-11.csv  one file per point per month: ts (ms), value, status.
//                                        Used to answer trend requests quickly.
//
// A failed read is logged too (status "down: <reason>"), so gaps in the record are explicit.
// Files are only ever appended to. Back up the data folder like any other records.
//
// Routes (same origin as the dashboard):
//   GET /gw/query/history/<slot path>?from=<ms>&to=<ms>  -> { points: [[ts, value, status], ...] }
//   GET /gw/logs                                         -> { days: [{ date, bytes }], intervalMin, dir }
//   GET /gw/logs.csv?from=YYYY-MM-DD&to=YYYY-MM-DD[&unit=RTU-01]  -> CSV download (daily logs combined)
import { mkdir, appendFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EQUIPMENT_UNITS, ROLE_POINTS, rolesForType, rolesForUnit, slotPath } from '../js/config/points.js';
import { EQUIPMENT } from '../js/config/site.js';

const TZ = 'Africa/Johannesburg';
const DAILY_HEADER = 'Time (SAST),Unit,Unit name,Reading,Value,Units,Status,Point\n';

/** SAST date/time parts for a timestamp. */
function sast(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}`, time: `${p.hour}:${p.minute}:${p.second}` };
}
const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** "21.40 °C" -> 21.4, "true" -> true; anything else stays a string. */
function typed(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v).trim();
  if (/^(true|on|active)$/i.test(s)) return true;
  if (/^(false|off|inactive)$/i.test(s)) return false;
  const n = parseFloat(s);
  return Number.isFinite(n) && /^[-+]?\d/.test(s) ? n : s;
}
const cleanStatus = (st) => String(st ?? 'ok').replace(/[{}]/g, '').trim() || 'ok';

export function createHistory({ readPoint, root, env }) {
  const dir = resolve(root, env.HISTORY_DIR || 'data/history');
  const intervalMin = Math.max(1, Number(env.LOG_INTERVAL_MIN || 5));
  const names = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e.name]));

  // Every point the dashboard knows, and a reverse map slot path -> point.
  const POINTS = [];
  for (const [unitId, u] of Object.entries(EQUIPMENT_UNITS)) {
    for (const role of rolesForUnit(unitId)) {
      const slot = slotPath(unitId, role);
      if (slot) POINTS.push({ unitId, role, slot, label: ROLE_POINTS[role].label, units: ROLE_POINTS[role].unit || '' });
    }
  }
  const BY_SLOT = new Map(POINTS.map((p) => [p.slot, p]));

  const pointFile = (p, month) => join(dir, 'points', p.unitId, p.role, `${month}.csv`);
  const dailyFile = (date) => join(dir, 'daily', `${date}.csv`);

  /* ---- logging ------------------------------------------------------------------------ */
  let running = false, timer = null, last = null;
  async function logOnce() {
    if (running) return;
    running = true;
    const ts = Math.floor(Date.now() / 60000) * 60000; // whole minute
    const { date, month, time } = sast(ts);
    const daily = [];
    let ok = 0, failed = 0;
    try {
      for (const p of POINTS) {
        let value = '', status;
        try {
          const r = await readPoint(p.slot);
          value = typed(r.value);
          status = cleanStatus(r.status);
          ok++;
        } catch (e) {
          status = `down: ${e.notFound ? 'point not found' : e.message}`.slice(0, 120);
          failed++;
        }
        const f = pointFile(p, month);
        if (!existsSync(f)) await mkdir(join(f, '..'), { recursive: true });
        await appendFile(f, `${ts},${csv(value)},${status.replace(/[,\n"]/g, ';')}\n`);
        daily.push([`${date} ${time}`, p.unitId, names[p.unitId] || '', p.label, value === true ? 'ON' : value === false ? 'OFF' : value, p.units, status, p.slot].map(csv).join(','));
      }
      const df = dailyFile(date);
      if (!existsSync(df)) { await mkdir(join(dir, 'daily'), { recursive: true }); await appendFile(df, DAILY_HEADER); }
      await appendFile(df, daily.join('\n') + '\n');
      last = { ts, ok, failed };
      console.log(`[history] ${date} ${time} logged ${ok} points${failed ? `, ${failed} failed` : ''}`);
    } catch (e) {
      console.log(`[history] could not write the log: ${e.message}`);
    } finally {
      running = false;
    }
  }
  function schedule() {
    const ms = intervalMin * 60000;
    const wait = ms - (Date.now() % ms) + 2000; // on the clock, 2 s after the boundary
    timer = setTimeout(async () => { await logOnce(); schedule(); }, wait);
  }

  /* ---- queries ------------------------------------------------------------------------ */
  function monthsBetween(from, to) {
    const out = [];
    const d = new Date(Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth() - 1, 1)); // one month early (SAST vs UTC edges)
    while (d.getTime() <= to) { out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); d.setUTCMonth(d.getUTCMonth() + 1); }
    return out;
  }
  async function series(slot, from, to) {
    const p = BY_SLOT.get(slot);
    if (!p) return null;
    const out = [];
    for (const m of monthsBetween(from, to)) {
      let text;
      try { text = await readFile(pointFile(p, m), 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line) continue;
        const i = line.indexOf(','), j = line.lastIndexOf(',');
        const ts = Number(line.slice(0, i));
        if (!(ts >= from && ts <= to)) continue;
        const raw = line.slice(i + 1, j).replace(/^"|"$/g, '');
        const st = line.slice(j + 1).replace(/^"|"$/g, '');
        out.push([ts, raw === '' ? null : typed(raw), `{${st}}`]);
      }
    }
    return out;
  }

  async function days() {
    let files = [];
    try { files = (await readdir(join(dir, 'daily'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort(); } catch { /* none yet */ }
    return Promise.all(files.map(async (f) => ({ date: f.slice(0, 10), bytes: (await stat(dailyFile(f.slice(0, 10)))).size })));
  }

  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

  /** Handles the history routes. Returns true when handled. */
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (req.method !== 'GET' || !(path.startsWith('/gw/query/history/') || path === '/gw/logs' || path === '/gw/logs.csv')) return false;
    try {
      if (path.startsWith('/gw/query/history/')) {
        const slot = decodeURIComponent(path.slice('/gw/query/history/'.length));
        const from = Number(url.searchParams.get('from')), to = Number(url.searchParams.get('to')) || Date.now();
        if (!Number.isFinite(from)) { send(res, 400, { status: 'error', message: 'from is required (ms)' }); return true; }
        const points = await series(slot, from, to);
        if (!points) { send(res, 404, { status: 'error', message: 'Unknown point' }); return true; }
        send(res, 200, { points, intervalMin });
        return true;
      }
      if (path === '/gw/logs') {
        send(res, 200, { days: await days(), intervalMin, dir, last });
        return true;
      }
      // /gw/logs.csv
      const re = /^\d{4}-\d{2}-\d{2}$/;
      const from = url.searchParams.get('from'), to = url.searchParams.get('to') || from;
      const unit = url.searchParams.get('unit');
      if (!re.test(from || '') || !re.test(to || '') || to < from) { send(res, 400, { status: 'error', message: 'from and to must be dates (YYYY-MM-DD), from ≤ to' }); return true; }
      const list = (await days()).filter((d) => d.date >= from && d.date <= to);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="middelburg-bms-log_${from}_to_${to}${unit ? '_' + unit.replace(/[^\w-]/g, '') : ''}.csv"`,
      });
      res.write('﻿' + DAILY_HEADER); // BOM so Excel opens °C correctly
      for (const d of list) {
        const text = await readFile(dailyFile(d.date), 'utf8');
        const rows = text.split('\n').slice(1).filter((l) => l && (!unit || l.split(',')[1] === unit));
        if (rows.length) res.write(rows.join('\n') + '\n');
      }
      res.end();
      return true;
    } catch (err) {
      if (!res.headersSent) send(res, 500, { status: 'error', message: err.message });
      else res.end();
      return true;
    }
  }

  return {
    handle, dir, intervalMin, points: POINTS.length,
    start() { schedule(); logOnce(); },
    stop() { clearTimeout(timer); },
    logOnce,
  };
}
