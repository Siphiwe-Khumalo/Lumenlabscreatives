// Write test: npm run check-write
// Reads RUT_1/Unit1Setpoint and writes the SAME value back at priority 16 (no change to the unit),
// first exactly as the gateway does, then with browser-like headers. Prints the JACE's full reply.
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ossConfig, fetchToken } from './oss-auth.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = {};
for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const cfg = ossConfig(env);
const POINT = 'Drivers/BcpBacnetNetwork/OFFICES/points/RUT_1/Unit1Setpoint';
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

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
const show = (label, r) => {
  console.log(`\n${label} -> HTTP ${r.status}`);
  for (const [k, v] of Object.entries(r.headers)) if (!['date', 'connection'].includes(k)) console.log(`   ${k}: ${String(v).slice(0, 200)}`);
  console.log('   body: ' + (r.text || '(empty)').replace(/\s+/g, ' ').slice(0, 400));
};

(async () => {
  console.log('JACE write test (writes the current value back, priority 16)\n');
  const t = await fetchToken(req, cfg, env.OSS_CLIENT_ID, env.OSS_CLIENT_SECRET).catch((e) => { console.log(e.message); process.exit(1); });
  const auth = { Authorization: `Bearer ${t.token}`, Accept: 'application/json' };
  const read = await req(`${cfg.jaceUrl}${cfg.readPath}${enc(POINT)}`, { headers: auth });
  show(`Read ${POINT}`, read);
  let value; try { value = JSON.parse(read.text).value; } catch { /* */ }
  if (value == null || value === '') { console.log('\nNo current value to write back. Send this output.'); return; }
  const url = `${cfg.jaceUrl}${cfg.writePath}${enc(POINT)}?value=${encodeURIComponent(value)}&priority=16`;
  console.log(`\nWrite URL: ${url}`);
  show('A. PUT exactly as the gateway', await req(url, { method: 'PUT', headers: auth }));
  const browser = { ...auth, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', Origin: cfg.jaceUrl, Referer: cfg.jaceUrl + '/', 'Accept-Language': 'en-ZA,en;q=0.9' };
  show('B. PUT with browser headers', await req(url, { method: 'PUT', headers: browser }));
  const num = Number(value);
  if (!Number.isNaN(num) && String(num) !== String(value)) {
    show(`C. PUT with value ${num}`, await req(url.replace(/value=[^&]*/, 'value=' + encodeURIComponent(num)), { method: 'PUT', headers: auth }));
  }
  console.log('\nSend this whole output.');
})();
