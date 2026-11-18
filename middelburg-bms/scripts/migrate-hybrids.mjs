// One-time history migration for the hybrid renumbering (2026-11-18).
//
// Until 2026-11-18 the dashboard listed 11 hybrid units HYB-01…HYB-11 = station folders HYBRID_1…HYBRID_11.
// The site has six: HYBRID_6…HYBRID_11, now shown as HYB-01…HYB-06. HYBRID_1…5 never existed (their logged
// rows are all "down"). Logged history is filed by unit ID, so without this step HYB-01 would show old
// HYBRID_1 rows. This migration:
//   1. copies data/history to data/history-backup-before-hybrid-renumber (once);
//   2. moves points/HYB-01…HYB-05 (old HYBRID_1…5) to retired/points/;
//   3. renames points/HYB-06…HYB-11 to HYB-01…HYB-06;
//   4. rewrites the Unit / Unit name columns of every daily CSV from its Point column (HYBRID_n → HYB-0(n-5));
//      rows of HYBRID_1…5 go to retired/daily/<date>.csv.
// It writes a marker file and never runs twice. It only acts when the old layout is present (points/HYB-11).
//
// Runs automatically from history.start(). Manual: node scripts/migrate-hybrids.mjs [historyDir]
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = '.hybrids-renumbered-6';

/** Minimal CSV line parser (fields may be quoted, quotes doubled). */
function parse(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}
const field = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function migrateHybridHistory(dir, log = console.log) {
  const marker = join(dir, MARKER);
  if (existsSync(marker)) return { done: false, reason: 'already migrated' };
  if (!existsSync(join(dir, 'points', 'HYB-11'))) {
    // New install or nothing logged for the old layout: nothing to move.
    if (existsSync(dir)) await writeFile(marker, `no old hybrid layout found ${new Date().toISOString()}\n`);
    return { done: false, reason: 'old layout not present' };
  }
  log('[history] migrating logged history to the six-hybrid numbering (HYBRID_6…11 = HYB-01…06)…');
  const backup = resolve(dir, '..', 'history-backup-before-hybrid-renumber');
  if (!existsSync(backup)) await cp(dir, backup, { recursive: true });

  // Per-point files.
  const P = join(dir, 'points'), R = join(dir, 'retired', 'points');
  await mkdir(R, { recursive: true });
  for (let k = 1; k <= 5; k++) {
    const id = `HYB-0${k}`;
    if (existsSync(join(P, id))) await rename(join(P, id), join(R, `${id}-station-HYBRID_${k}`));
  }
  for (let n = 6; n <= 11; n++) {
    const from = join(P, `HYB-${String(n).padStart(2, '0')}`), to = join(P, `HYB-0${n - 5}`);
    if (existsSync(from)) await rename(from, to);
  }

  // Daily CSVs.
  const D = join(dir, 'daily'), RD = join(dir, 'retired', 'daily');
  let files = [];
  try { files = (await readdir(D)).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f)); } catch { /* none */ }
  let moved = 0, renamed = 0;
  for (const f of files) {
    const text = await readFile(join(D, f), 'utf8');
    const lines = text.split('\n');
    const keep = [lines[0]], retired = [];
    for (const line of lines.slice(1)) {
      if (!line) continue;
      const cols = parse(line);
      const m = /HYBRID_(\d+)/.exec(cols[cols.length - 1] || '');
      if (!m) { keep.push(line); continue; }
      const n = Number(m[1]);
      if (n <= 5) { retired.push(line); moved++; continue; }
      cols[1] = `HYB-0${n - 5}`; cols[2] = `Hybrid unit ${n - 5}`;
      keep.push(cols.map(field).join(',')); renamed++;
    }
    await writeFile(join(D, f), keep.join('\n') + '\n');
    if (retired.length) { await mkdir(RD, { recursive: true }); await writeFile(join(RD, f), lines[0] + '\n' + retired.join('\n') + '\n'); }
  }
  await writeFile(marker, `migrated ${new Date().toISOString()}: ${renamed} daily rows renamed, ${moved} retired; backup at ${backup}\n`);
  log(`[history] hybrid renumbering done: ${renamed} daily rows renamed, ${moved} rows of HYBRID_1…5 retired. Backup: ${backup}`);
  return { done: true, renamed, moved, backup };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] || 'data/history');
  migrateHybridHistory(dir).then((r) => console.log(r)).catch((e) => { console.error(e); process.exit(1); });
}
