// On-site HVAC commissioning: npm run commission [-- HYB-02 RTU-01 ...]   (no list = asks)
// For each unit, ONE AT A TIME and only after you confirm you are authorised:
//   reads its points, sends each command the dashboard can send (same points, same priority),
//   reads it back from the JACE, asks you what the unit physically did, then RESTORES the original values.
// Results: data/commissioning-<date>.csv and .md with the classifications
//   VERIFIED / COMMUNICATION VERIFIED / NOT VERIFIED / FAILED / NOT SUPPORTED.
import http from 'node:http';
import https from 'node:https';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { ossConfig, fetchToken, pointSuffix, pointPath } from './oss-auth.mjs';
import { EQUIPMENT_UNITS, slotPath, controllerName } from '../js/config/points.js';
import { APP_CONFIG } from '../js/config/app-config.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = {};
for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const cfg = ossConfig(env);
const PRIORITY = APP_CONFIG.controls.writePriority;
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q) => (await rl.question(q)).trim().toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((done) => {
    const u = new URL(url);
    const h = { ...headers };
    if (method !== 'GET') h['Content-Length'] = body ? Buffer.byteLength(body) : 0;
    const r = (u.protocol === 'https:' ? https : http).request(u, { method, headers: h, rejectUnauthorized: false, timeout: 8000 }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => done({ status: res.statusCode, text: Buffer.concat(c).toString('utf8') }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', (e) => done({ status: 0, text: e.message }));
    if (body) r.write(body); // the token request has a body (grant_type=client_credentials&scope=...)
    r.end();
  });
}

let token = null;
async function auth() { token = (await fetchToken(req, cfg, env.OSS_CLIENT_ID, env.OSS_CLIENT_SECRET)).token; }
const H = () => ({ Authorization: `Bearer ${token}`, Accept: 'application/json' });
const url = (base, slot, q = '') => cfg.jaceUrl + pointPath(base, pointSuffix(slot, cfg.ordPrefix, cfg.pathEncoding), q);

async function read(unit, role) {
  const slot = slotPath(unit, role);
  let r = await req(url(cfg.readPath, slot), { headers: H() });
  if (r.status === 401) { await auth(); r = await req(url(cfg.readPath, slot), { headers: H() }); }
  let b = null; try { b = JSON.parse(r.text); } catch { /* not JSON */ }
  if (r.status !== 200 || !b) return { ok: false, slot, error: `HTTP ${r.status}` };
  const raw = String(b.value).trim().toLowerCase();
  const value = ['true', 'on', 'active', '1'].includes(raw) ? true : ['false', 'off', 'inactive', '0'].includes(raw) ? false : Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : b.value;
  return { ok: true, slot, value, status: String(b.status ?? 'ok'), live: !/stale|down|fault|disabled/i.test(String(b.status)) };
}
async function write(unit, role, value) {
  const slot = slotPath(unit, role);
  const q = `?value=${encodeURIComponent(value)}&priority=${PRIORITY}`;
  let r = await req(url(cfg.writePath, slot, q), { method: 'PUT', headers: H() });
  if (r.status === 401) { await auth(); r = await req(url(cfg.writePath, slot, q), { method: 'PUT', headers: H() }); }
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: r.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) };
}
const same = (a, b) => (typeof b === 'number' ? Math.abs(Number(a) - b) < 0.05 : a === b);

/** Writes, then reads back up to 4 times (1.5 s apart). -> { written, readBack, matches, detail } */
async function command(unit, role, value) {
  const w = await write(unit, role, value);
  if (!w.ok) return { written: false, matches: false, detail: `write refused: HTTP ${w.status} ${w.text}` };
  for (let i = 0; i < 4; i++) {
    await sleep(1500);
    const r = await read(unit, role);
    if (r.ok && same(r.value, value)) return { written: true, matches: true, detail: `read back ${r.value}` };
    if (i === 3) return { written: true, matches: false, detail: `written (HTTP ${w.status}) but reads back ${r.ok ? r.value : r.error} — something at a higher priority holds it?` };
  }
}
/** Asks what the unit physically did. y = VERIFIED, n = FAILED, s = COMMUNICATION VERIFIED. */
async function physical(question) {
  const a = await ask(`   >> ${question} [y = yes / n = no / s = can't check now] `);
  return a.startsWith('y') ? 'VERIFIED' : a.startsWith('n') ? 'FAILED' : 'COMMUNICATION VERIFIED';
}

async function testUnit(id) {
  const u = EQUIPMENT_UNITS[id];
  const row = { unit: id, controller: controllerName(id), onoff: 'NOT VERIFIED', heating: 'NOT VERIFIED', cooling: 'NOT VERIFIED', setpoint: 'NOT VERIFIED', feedback: 'NOT VERIFIED', notes: [] };
  console.log(`\n=== ${id} (${controllerName(id)}) ===`);
  const t = await read(id, 'temperature');
  row.feedback = t.ok && t.live ? 'COMMUNICATION VERIFIED' : 'FAILED';
  row.notes.push(`temperature ${t.ok ? `${t.value} (${t.status})` : t.error}`);
  console.log(`   Temperature: ${t.ok ? `${t.value} °C, status ${t.status}` : `not readable (${t.error})`}`);
  if (await ask(`   Authorised to test ${id} now (it will switch mode/state and then be restored)? [y/N] `) !== 'y') {
    row.notes.push('skipped: not authorised'); console.log('   Skipped.'); return row;
  }

  if (u.type === 'hybrid') {
    const orig = {};
    for (const r of ['enable', 'coolMode', 'heatMode', 'fanOnlyMode']) orig[r] = await read(id, r);
    console.log(`   Now: BMS ${orig.enable.value}, cool ${orig.coolMode.value}, heat ${orig.heatMode.value}, fan-only ${orig.fanOnlyMode.value}`);
    if (Object.values(orig).some((r) => !r.ok)) { row.notes.push('could not read the control points'); return row; }
    const setMode = async (m) => { // others OFF first, then the chosen ON (never heat + cool together)
      for (const r of ['coolMode', 'heatMode', 'fanOnlyMode'].filter((x) => x !== m)) { const c = await command(id, r, false); if (!c.matches) return c; }
      return command(id, m, true);
    };
    // BMS on for the mode tests
    if (orig.enable.value !== true) { const c = await command(id, 'enable', true); console.log(`   BMS ON: ${c.detail}`); }
    for (const [mode, key, wanted] of [['coolMode', 'cooling', 'cold air from the unit / compressor running in COOLING'], ['heatMode', 'heating', 'warm air from the unit / running in HEATING']]) {
      console.log(`   -> ${key.toUpperCase()}`);
      const c = await setMode(mode);
      console.log(`      ${c.detail}`);
      if (!c.written) { row[key] = 'FAILED'; row.notes.push(`${key}: ${c.detail}`); continue; }
      if (!c.matches) { row[key] = 'NOT VERIFIED'; row.notes.push(`${key}: ${c.detail}`); continue; }
      console.log('      Give the unit 1–3 minutes to respond (compressor delays).');
      row[key] = await physical(`Is ${id} ${wanted}?`);
    }
    console.log('   -> OFF / ON (BMS switch)');
    const off = await command(id, 'enable', false);
    console.log(`      OFF: ${off.detail}`);
    if (off.matches) {
      await sleep(5000);
      const fan = await read(id, 'fanStatus');
      console.log(`      Supply fan now reads: ${fan.ok ? fan.value : fan.error}`);
      const p = await physical(`Has ${id} stopped (fan off)?`);
      const on = await command(id, 'enable', true);
      console.log(`      ON: ${on.detail}`);
      row.onoff = p === 'VERIFIED' && on.matches ? (await physical(`Has ${id} started again?`)) : on.matches ? p : 'FAILED';
    } else row.onoff = off.written ? 'NOT VERIFIED' : 'FAILED';
    row.setpoint = 'NOT SUPPORTED';
    row.notes.push('hybrid setpoint ROOM_TEMP_SETPOINT is read-only in the dashboard (no write point agreed)');
    // restore
    console.log('   Restoring original state...');
    for (const r of ['coolMode', 'heatMode', 'fanOnlyMode'].filter((x) => orig[x].value === false)) await write(id, r, false);
    for (const r of ['coolMode', 'heatMode', 'fanOnlyMode'].filter((x) => orig[x].value === true)) await write(id, r, true);
    await write(id, 'enable', orig.enable.value);
  } else if (u.type === 'rooftop') {
    const start = await read(id, 'startCommand'), sp = await read(id, 'temperatureSetpoint'), mode = await read(id, 'operatingMode');
    console.log(`   Now: start ${start.value}, setpoint ${sp.value}, mode point ${mode.ok ? mode.value : mode.error}`);
    const whenTrue = APP_CONFIG.controls.rooftopModeWhenTrue; // 'heating' | 'cooling' | null
    if (!whenTrue) {
      row.heating = 'NOT VERIFIED'; row.cooling = 'NOT VERIFIED';
      row.notes.push(`heat/cool: Unit${u.n}Mode is writable (true/false) but what TRUE means is not confirmed — set APP_CONFIG.controls.rooftopModeWhenTrue`);
    } else if (mode.ok && typeof mode.value === 'boolean') {
      for (const [key, v] of [['heating', whenTrue === 'heating'], ['cooling', whenTrue === 'cooling']]) {
        console.log(`   -> ${key.toUpperCase()} (Unit${u.n}Mode = ${v})`);
        const c = await command(id, 'operatingMode', v);
        console.log(`      ${c.detail}`);
        row[key] = !c.written ? 'FAILED' : !c.matches ? 'NOT VERIFIED' : await physical(`Is ${id} ${key === 'heating' ? 'blowing warm air / heating' : 'blowing cold air / cooling'}? (allow 1–3 min)`);
      }
      await write(id, 'operatingMode', mode.value);
      console.log(`      Restored Unit${u.n}Mode = ${mode.value}.`);
    }
    if (start.ok) {
      console.log('   -> STOP / START');
      const off = await command(id, 'startCommand', false);
      console.log(`      STOP: ${off.detail}`);
      if (off.matches) {
        await sleep(5000);
        const saf = await read(id, 'fanStatus');
        console.log(`      Supply fan (Unit${u.n}SAF) now reads: ${saf.ok ? saf.value : saf.error}`);
        const p = await physical(`Has ${id} stopped?`);
        const on = await command(id, 'startCommand', true);
        console.log(`      START: ${on.detail}`);
        row.onoff = on.matches ? (p === 'VERIFIED' ? await physical(`Has ${id} started again?`) : p) : 'FAILED';
      } else row.onoff = off.written ? 'NOT VERIFIED' : 'FAILED';
      await write(id, 'startCommand', start.value);
    }
    if (sp.ok && typeof sp.value === 'number') {
      const test = Math.min(35, Math.max(15, sp.value + (sp.value < 34 ? 1 : -1)));
      console.log(`   -> SETPOINT ${sp.value} -> ${test}`);
      const c = await command(id, 'temperatureSetpoint', test);
      console.log(`      ${c.detail}`);
      row.setpoint = !c.written ? 'FAILED' : !c.matches ? 'NOT VERIFIED' : await physical(`Does ${id}'s own controller/display show setpoint ${test}?`);
      await write(id, 'temperatureSetpoint', sp.value);
      console.log(`      Restored setpoint ${sp.value}.`);
    }
  }
  return row;
}

(async () => {
  console.log(`HVAC commissioning — JACE ${cfg.jaceUrl}, write priority ${PRIORITY}\n`);
  console.log('Test ONE unit at a time, with site authorisation. Every unit is restored to its original state afterwards.');
  console.log('Stop the test with Ctrl+C at any time; then check the unit in the dashboard.\n');
  try { await auth(); } catch (e) { console.log(e.message); process.exit(1); }
  const hvac = Object.keys(EQUIPMENT_UNITS).filter((id) => EQUIPMENT_UNITS[id].type !== 'sensor');
  let ids = process.argv.slice(2).map((s) => s.toUpperCase()).filter((s) => hvac.includes(s));
  if (!ids.length) {
    const a = await ask(`Which units? (e.g. HYB-01 RTU-02, or "all" = ${hvac.length} units one after another): `);
    ids = a === 'all' ? hvac : a.toUpperCase().split(/[\s,]+/).filter((s) => hvac.includes(s));
  }
  const rows = [];
  for (const id of ids) rows.push(await testUnit(id));
  rl.close();
  const day = new Date().toISOString().slice(0, 10);
  mkdirSync(join(root, 'data'), { recursive: true });
  const csv = ['unit,controller,on_off,heating,cooling,setpoint,feedback,notes', ...rows.map((r) => [r.unit, r.controller, r.onoff, r.heating, r.cooling, r.setpoint, r.feedback, `"${r.notes.join('; ').replace(/"/g, "'")}"`].join(','))].join('\n');
  const md = ['| HVAC Unit | ON/OFF | Heating | Cooling | Setpoint | Feedback |', '|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.unit} (${r.controller}) | ${r.onoff} | ${r.heating} | ${r.cooling} | ${r.setpoint} | ${r.feedback} |`), '', ...rows.map((r) => `- ${r.unit}: ${r.notes.join('; ')}`)].join('\n');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  writeFileSync(join(root, 'data', `commissioning-${stamp}.csv`), csv + '\n');
  writeFileSync(join(root, 'data', `commissioning-${stamp}.md`), md + '\n');
  console.log(`\n${md}\n\nSaved: data\\commissioning-${stamp}.csv and .md (${day})`);
})();
