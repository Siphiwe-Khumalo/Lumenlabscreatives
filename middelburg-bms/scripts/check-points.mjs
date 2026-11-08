// Point check: npm run check-points
// Reads every point in js/config/points.js once (one at a time) and reports, per unit, which points the JACE
// has and which it does not. Read-only. Use it after Aina adds or renames points.
import http from 'node:http';
import https from 'node:https';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ossConfig, fetchToken, pointSuffix, pointPath } from './oss-auth.mjs';
import { EQUIPMENT_UNITS, rolesForType, rolesForUnit, slotPath, controllerName } from '../js/config/points.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = {};
for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const cfg = ossConfig(env);

function req(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((done) => {
    const u = new URL(url);
    const h = { ...headers };
    if (method !== 'GET') h['Content-Length'] = body ? Buffer.byteLength(body) : 0;
    const r = (u.protocol === 'https:' ? https : http).request(u, { method, headers: h, rejectUnauthorized: false, timeout: 8000 }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, text: Buffer.concat(c).toString('utf8') }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', (e) => done({ status: 0, headers: {}, text: e.message }));
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  let t;
  try { t = await fetchToken(req, cfg, env.OSS_CLIENT_ID, env.OSS_CLIENT_SECRET); } catch (e) { console.log(e.message); process.exit(1); }
  const auth = { Authorization: `Bearer ${t.token}`, Accept: 'application/json' };
  const report = [];
  let ok = 0, missing = 0, stale = 0;
  console.log(`Checking every point on ${cfg.jaceUrl} (one at a time)...\n`);
  for (const [id, u] of Object.entries(EQUIPMENT_UNITS)) {
    const bad = [], st = [];
    let good = 0;
    const roles = rolesForUnit(id);
    for (const role of roles) {
      const slot = slotPath(id, role);
      const r = await req(cfg.jaceUrl + pointPath(cfg.readPath, pointSuffix(slot, cfg.ordPrefix, cfg.pathEncoding)), { headers: auth });
      let body = null; try { body = JSON.parse(r.text); } catch { /* not JSON */ }
      const line = `${id},${controllerName(id)},${role},${slot},${r.status},${body?.value ?? ''},${body?.status ?? ''}`;
      report.push(line);
      if (r.status === 200 && body) { good++; ok++; if (/stale|down|fault/i.test(String(body.status))) { st.push(slot.split('/').pop()); stale++; } }
      else { bad.push(`${slot.split('/').pop()} (HTTP ${r.status || r.text})`); missing++; }
    }
    const tag = bad.length === 0 ? 'OK  ' : good === 0 ? 'NONE' : 'PART';
    console.log(`${tag} ${id.padEnd(7)} ${controllerName(id).padEnd(20)} ${good}/${roles.length} found${st.length ? `, ${st.length} stale/down` : ''}`);
    if (bad.length && good) console.log(`       missing: ${bad.join(', ')}`);
    if (!good) {
      console.log(`       folder not found? ${slotPath(id, roles[0]).replace(/[^/]*$/, '')}`);
      if (u.type === 'hybrid') {
        // Look for the same unit on the other Modbus network (units can be moved between networks in the station).
        const here = slotPath(id, 'temperature');
        const other = here.includes('ModbusAsyncNetwork') ? here.replace('ModbusAsyncNetwork', 'ModbusTcpNetwork') : here.replace('ModbusTcpNetwork', 'ModbusAsyncNetwork');
        const r = await req(cfg.jaceUrl + pointPath(cfg.readPath, pointSuffix(other, cfg.ordPrefix, cfg.pathEncoding)), { headers: auth });
        console.log(`       on the other network (${other.split('/')[1]})? ${r.status === 200 ? `YES — found there: ${r.text.slice(0, 60)}` : `no (HTTP ${r.status})`}`);
      }
    }
  }
  const out = join(root, 'data', 'check-points.csv');
  try { (await import('node:fs')).mkdirSync(join(root, 'data'), { recursive: true }); writeFileSync(out, 'unit,controller,role,slot,http,value,status\n' + report.join('\n') + '\n'); } catch { /* ignore */ }
  console.log(`\n${ok} found, ${missing} not found, ${stale} found but stale/down. Full list: ${out}`);
})();
