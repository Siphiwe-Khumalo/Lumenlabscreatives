// Connection check for the JACE ossRestApi. Run on the host PC: npm run check
// Tries the address over https and http, common token paths and both ways of sending the
// client credentials, then reads one point. Prints a report; never prints the secret.
import http from 'node:http';
import https from 'node:https';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ossConfig, fetchToken, LEGACY_ENV_KEYS, PATH_ENCODINGS, pointSuffix, pointPath } from './oss-auth.mjs';

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
      res.on('end', () => resolve({ status: res.statusCode, full: Buffer.concat(c).toString('utf8'), text: Buffer.concat(c).toString('utf8').slice(0, 300), type: res.headers['content-type'] || '', location: res.headers.location || '', headers: res.headers }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', (e) => resolve({ status: 0, text: e.code || e.message }));
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  console.log('JACE connection check\n');
  if (env.JACE_USER && env.JACE_PASSWORD && host) return checkUser();
  if (!id || !secret || !host) { console.log('Missing in .env: ' + ['JACE_URL', 'OSS_CLIENT_ID', 'OSS_CLIENT_SECRET'].filter((k) => !env[k]).join(', ') + '\nRun: npm run setup'); return; }
  console.log(`Address: ${host} · client ID: ${id.slice(0, 4)}… · secret: ${secret.length} characters\n`);

  // 1. Reachability
  const schemes = [];
  for (const s of ['https', 'http']) {
    const r = await req(`${s}://${host}/`);
    console.log(`1. ${s}://${host}/ -> ${r.status ? 'HTTP ' + r.status : 'no answer (' + r.text + ')'}${r.location ? ' -> ' + r.location : ''}`);
    if (r.status) schemes.push(s);
  }
  if (!schemes.length) { console.log('\nThe JACE does not answer from this PC. Check the IP address, the network cable/VPN and the firewall.'); return; }

  // 2. Token: exactly what the gateway does (scripts/oss-auth.mjs). Few attempts, spaced out, so we
  // never hammer the JACE with failed logins.
  const s = schemes.includes('https') ? 'https' : schemes[0];
  const cfg = ossConfig({ ...env, JACE_URL: `${s}://${host}` });
  let found = null;
  console.log(`\n2. Token: POST ${cfg.jaceUrl}${cfg.tokenPath} (${cfg.authStyle}, scope "${cfg.scope}")`);
  for (let attempt = 1; attempt <= 2 && !found; attempt++) {
    try {
      const t = await fetchToken(req, cfg, id, secret);
      found = { s, token: t.token };
      console.log(`   attempt ${attempt} -> TOKEN OK (valid ${t.expiresIn} s)`);
    } catch (e) {
      console.log(`   attempt ${attempt} -> ${e.message}`);
      const skip = ['date', 'content-length', 'content-type', 'connection', 'cache-control', 'pragma', 'expires', 'set-cookie'];
      if (attempt === 1 && e.headers) for (const [k, v] of Object.entries(e.headers)) if (!skip.includes(k)) console.log(`     header ${k}: ${String(v).slice(0, 160)}`);
      if (attempt < 2) { console.log('   waiting 60 s before trying once more...'); await new Promise((ok) => setTimeout(ok, 60000)); }
    }
  }
  removeLegacyEnv();
  if (!found) {
    console.log(`\nNo token. Make sure npm run dev is NOT running, wait a few minutes, unlock the client in Workbench
if it shows locked, then run npm run check again (alone).`);
    return;
  }
  saveEnv({ JACE_URL: cfg.jaceUrl });

  // 2b. What the API exposes for the points the dashboard writes (listPoints, as ARC). Shows whether
  // the JACE treats them as writable.
  {
    const r = await req(`${cfg.jaceUrl}/ossRestApiServer/query/listPoints`, { headers: { Authorization: `Bearer ${found.token}`, Accept: 'application/json' }, full: true });
    console.log(`\n2b. listPoints -> HTTP ${r.status}`);
    if (r.status === 200) {
      let list = null; try { list = JSON.parse(r.full); } catch { /* not JSON */ }
      const items = Array.isArray(list) ? list : (list && (list.points || list.data || list.result)) || [];
      const want = /RUT_1\/(Uni1StartCmd|Unit1Setpoint|SPACE_TEMP1)|HYBRID_1\/points\/(BMS_Enable|COOL_MODE)/;
      const hits = (Array.isArray(items) ? items : []).filter((p) => want.test(JSON.stringify(p)));
      console.log(`   ${Array.isArray(items) ? items.length : '?'} points listed. Entries for the points we write:`);
      for (const h of hits.slice(0, 10)) console.log('   ' + JSON.stringify(h).slice(0, 300));
      if (!hits.length) console.log('   (none of them listed) First entry: ' + (Array.isArray(items) && items[0] ? JSON.stringify(items[0]).slice(0, 300) : r.full.slice(0, 300)));
    } else console.log('   ' + r.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160));
  }

  // 3. Read one point. ARC uses the plain slot path (segments, no prefix); that is tried first.
  console.log(`\n3. Reading ${POINT}:`);
  for (const encoding of PATH_ENCODINGS) for (const prefix of ['', '/', 'station:|slot:/', 'slot:/']) {
    const path = pointPath(cfg.readPath, pointSuffix(POINT, prefix, encoding));
    const r = await req(`${found.s}://${host}${path}`, { headers: { Authorization: `Bearer ${found.token}`, Accept: 'application/json, text/plain' } });
    console.log(`   ${encoding} "${prefix}" -> ${r.status ? 'HTTP ' + r.status : r.text}  ${r.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)}`);
    if (r.status === 200) {
      const set = { OSS_ORD_PREFIX: prefix, OSS_PATH_ENCODING: encoding };
      saveEnv(set);
      console.log(`\nWORKS. Saved the working settings in .env (${cfg.jaceUrl}${cfg.tokenPath}, path format ${encoding}${prefix ? ', prefix ' + prefix : ''}).\nNow run: npm run dev`);
      return;
    }
  }
  console.log('\nToken OK but the point could not be read. Send this report.');
})();

function removeLegacyEnv() {
  const text = readFileSync(join(root, '.env'), 'utf8');
  const out = text.split(/\r?\n/).filter((l) => !LEGACY_ENV_KEYS.some((k) => l.startsWith(k + '='))).join('\n');
  if (out !== text.replace(/\r\n/g, '\n')) { writeFileSync(join(root, '.env'), out); console.log('   (removed old OSS_TOKEN_PATH / OSS_READ_PATH / OSS_WRITE_PATH lines from .env)'); }
}

function saveEnv(set) {
  let text = readFileSync(join(root, '.env'), 'utf8');
  for (const [k, v] of Object.entries(set)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, () => `${k}=${v}`) : `${text.replace(/\n?$/, '\n')}${k}=${v}\n`;
  }
  writeFileSync(join(root, '.env'), text);
}

// Station user with HTTP Basic (JACE_USER / JACE_PASSWORD in .env) instead of OAuth.
async function checkUser() {
  console.log(`Address: ${host} · station user: ${env.JACE_USER} (HTTP Basic, no token)\n`);
  const auth = 'Basic ' + Buffer.from(`${env.JACE_USER}:${env.JACE_PASSWORD}`).toString('base64');
  for (const s of ['https', 'http']) for (const prefix of ['', 'station:|slot:/', 'slot:/']) {
    const path = ossConfig(env).readPath + (prefix + POINT).split('/').map(encodeURIComponent).join('/');
    const r = await req(`${s}://${host}${path}`, { headers: { Authorization: auth, Accept: 'application/json, text/plain' } });
    console.log(`   ${s} prefix "${prefix}" -> ${r.status ? 'HTTP ' + r.status : r.text}  ${r.location ? 'redirects to ' + r.location : r.text.replace(/\s+/g, ' ').slice(0, 160)}`);
    if (r.status === 200) {
      let text = readFileSync(join(root, '.env'), 'utf8');
      for (const [k, v] of Object.entries({ JACE_URL: `${s}://${host}`, OSS_ORD_PREFIX: prefix })) {
        const re = new RegExp(`^${k}=.*$`, 'm');
        text = re.test(text) ? text.replace(re, () => `${k}=${v}`) : `${text.replace(/\n?$/, '\n')}${k}=${v}\n`;
      }
      writeFileSync(join(root, '.env'), text);
      console.log('\nWORKS with the station user. Saved in .env. Now run: npm run dev');
      return;
    }
  }
  console.log('\nThe station user could not read the point. Send this report.');
}
