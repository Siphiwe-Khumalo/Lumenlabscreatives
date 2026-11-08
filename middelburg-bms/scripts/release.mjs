// Release (relinquish) the dashboard's priority slot on one point: npm run release -- RTU-01 operatingMode
// A value written at priority 1 stays there and out-ranks everything else (schedules, the unit's own logic). This tries
// to empty that slot through the API by writing value=null at the same priority, then reads the point back.
// EXPERIMENTAL: the OSS REST API's release syntax is not confirmed (ARC: a write without a value is rejected).
// If it does not work, release it in Workbench: right-click the point > Actions > Auto (or clear In1).
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ossConfig, fetchToken, pointSuffix, pointPath } from './oss-auth.mjs';
import { EQUIPMENT_UNITS, slotPath } from '../js/config/points.js';
import { APP_CONFIG } from '../js/config/app-config.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = {};
for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const cfg = ossConfig(env);
const [unit, role, prio] = process.argv.slice(2);
const id = (unit || '').toUpperCase();
if (!EQUIPMENT_UNITS[id] || !role || !slotPath(id, role)) { console.log('Usage: npm run release -- <unit> <role> [priority]   e.g. npm run release -- RTU-01 operatingMode'); process.exit(1); }
const slot = slotPath(id, role);
const priority = Number(prio || APP_CONFIG.controls.writePriority);

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
    if (body) r.write(body);
    r.end();
  });
}
const clean = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || '(empty)';

(async () => {
  const { token } = await fetchToken(req, cfg, env.OSS_CLIENT_ID, env.OSS_CLIENT_SECRET).catch((e) => { console.log(e.message); process.exit(1); });
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const read = async () => clean((await req(cfg.jaceUrl + pointPath(cfg.readPath, pointSuffix(slot, cfg.ordPrefix, cfg.pathEncoding)), { headers: H })).text);
  console.log(`Point: ${slot}\nBefore: ${await read()}\n`);
  for (const v of ['null', '']) {
    const q = `?value=${encodeURIComponent(v)}&priority=${priority}`;
    const r = await req(cfg.jaceUrl + pointPath(cfg.writePath, pointSuffix(slot, cfg.ordPrefix, cfg.pathEncoding), q), { method: 'PUT', headers: H });
    console.log(`Release attempt value="${v}" at priority ${priority} -> HTTP ${r.status} ${clean(r.text)}`);
    if (r.status >= 200 && r.status < 300) {
      await new Promise((ok) => setTimeout(ok, 1500));
      console.log(`After:  ${await read()}`);
      console.log('\nIf the value/status changed (e.g. no longer "overridden", or the unit\'s own value), the slot was released.');
      console.log('If it still shows the old value, the API did not release it: ask Aina to release priority ' + priority + ' in Workbench (Actions > Auto).');
      return;
    }
  }
  console.log('\nThe API refused both release forms. Ask Aina to release priority ' + priority + ' in Workbench: right-click the point > Actions > Auto.');
})();
