// Connection check for the JACE ossRestApi. Run on the host PC: npm run check
// Tries the address over https and http, common token paths and both ways of sending the
// client credentials, then reads one point. Prints a report; never prints the secret.
import http from 'node:http';
import https from 'node:https';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = {};
if (existsSync(join(root, '.env'))) {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  }
}
const id = env.OSS_CLIENT_ID, secret = env.OSS_CLIENT_SECRET;
const base = (env.JACE_URL || '').replace(/\/+$/, '');
const host = base.replace(/^https?:\/\//, '');
const POINT = 'Drivers/BcpBacnetNetwork/OFFICES/points/RUT_1/SPACE_TEMP1';

function req(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const r = lib.request(u, { method, headers, rejectUnauthorized: false, timeout: 6000 }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(c).toString('utf8').slice(0, 300), type: res.headers['content-type'] || '' }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', (e) => resolve({ status: 0, text: e.code || e.message }));
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  console.log('JACE connection check\n');
  if (!id || !secret || !host) { console.log('Missing in .env: ' + ['JACE_URL', 'OSS_CLIENT_ID', 'OSS_CLIENT_SECRET'].filter((k) => !env[k]).join(', ') + '\nRun: npm run setup'); return; }
  console.log(`Address: ${host} · client ID: ${id.slice(0, 4)}… · secret: ${secret.length} characters\n`);

  // 1. Reachability
  const schemes = [];
  for (const s of ['https', 'http']) {
    const r = await req(`${s}://${host}/`);
    console.log(`1. ${s}://${host}/ -> ${r.status ? 'HTTP ' + r.status : 'no answer (' + r.text + ')'}`);
    if (r.status) schemes.push(s);
  }
  if (!schemes.length) { console.log('\nThe JACE does not answer from this PC. Check the IP address, the network cable/VPN and the firewall.'); return; }

  // 2. Token
  const paths = [env.OSS_TOKEN_PATH, '/oauth/token', '/oauth2/token', '/token', '/ossRestApi/oauth/token', '/api/oauth/token', '/oauth/token/'].filter((v, i, a) => v && a.indexOf(v) === i);
  let found = null;
  console.log('\n2. Token requests (client credentials):');
  outer: for (const s of schemes) for (const p of paths) for (const style of ['basic', 'body']) {
    const form = new URLSearchParams({ grant_type: 'client_credentials' });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (style === 'body') { form.set('client_id', id); form.set('client_secret', secret); } else headers.Authorization = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
    const r = await req(`${s}://${host}${p}`, { method: 'POST', headers, body: form.toString() });
    let token = null; try { token = JSON.parse(r.text).access_token; } catch { /* not JSON */ }
    console.log(`   ${s} ${p} (${style}) -> ${r.status ? 'HTTP ' + r.status : r.text}${token ? '  TOKEN OK' : r.status ? '  ' + r.text.replace(/\s+/g, ' ').slice(0, 90) : ''}`);
    if (token) { found = { s, p, style, token }; break outer; }
  }
  if (!found) { console.log('\nNo token. Send this report. (Likely: wrong token path, or the client ID/secret is not exactly as on the JACE.)'); return; }

  // 3. Read one point
  console.log(`\n3. Reading ${POINT}:`);
  for (const prefix of ['', 'station:|slot:/', 'slot:/']) {
    const path = '/query/readPoint/' + (prefix + POINT).split('/').map(encodeURIComponent).join('/');
    const r = await req(`${found.s}://${host}${path}`, { headers: { Authorization: `Bearer ${found.token}`, Accept: 'application/json, text/plain' } });
    console.log(`   prefix "${prefix}" -> ${r.status ? 'HTTP ' + r.status : r.text}  ${r.text.replace(/\s+/g, ' ').slice(0, 160)}`);
    if (r.status === 200) {
      const set = { JACE_URL: `${found.s}://${host}`, OSS_TOKEN_PATH: found.p, OSS_AUTH_STYLE: found.style, OSS_ORD_PREFIX: prefix };
      let text = readFileSync(join(root, '.env'), 'utf8');
      for (const [k, v] of Object.entries(set)) {
        const re = new RegExp(`^${k}=.*$`, 'm');
        text = re.test(text) ? text.replace(re, () => `${k}=${v}`) : `${text.replace(/\n?$/, '\n')}${k}=${v}\n`;
      }
      writeFileSync(join(root, '.env'), text);
      console.log(`\nWORKS. Saved the working settings in .env (${set.JACE_URL}, token ${found.p}, ${found.style}${prefix ? ', prefix ' + prefix : ''}).\nNow run: npm run dev`);
      return;
    }
  }
  console.log('\nToken OK but the point could not be read. Send this report.');
})();
