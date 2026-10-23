// Connection check for the JACE ossRestApi. Run on the host PC: npm run check
// Tries the address over https and http, common token paths and both ways of sending the
// client credentials, then reads one point. Prints a report; never prints the secret.
import http from 'node:http';
import https from 'node:https';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTH_STYLES, tokenRequest, PATH_ENCODINGS, pointSuffix, pointPath } from './oss-auth.mjs';

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
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(c).toString('utf8').slice(0, 300), type: res.headers['content-type'] || '', location: res.headers.location || '', headers: res.headers }));
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

  // 2. Token. The endpoint is known (ARC's api.js): POST /ossRestApiServer/token, Basic client credentials.
  // No guessing other paths any more: repeated failed logins can make the JACE refuse the client for a while.
  const tokenPath = '/ossRestApiServer/token', style = env.OSS_AUTH_STYLE && env.OSS_AUTH_STYLE !== 'basic' ? env.OSS_AUTH_STYLE : 'basic';
  const s = schemes.includes('https') ? 'https' : schemes[0];
  let found = null;
  console.log(`\n2. Token: POST ${s}://${host}${tokenPath} (${style})`);
  for (let attempt = 1; attempt <= 3 && !found; attempt++) {
    const { headers, body } = tokenRequest(style, id, secret, env.OSS_SCOPE ?? 'read write');
    const r = await req(`${s}://${host}${tokenPath}`, { method: 'POST', headers, body });
    let token = null; try { token = JSON.parse(r.text).access_token; } catch { /* not JSON */ }
    console.log(`   attempt ${attempt} -> ${r.status ? 'HTTP ' + r.status : r.text}${token ? '  TOKEN OK' : '  ' + r.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}`);
    if (token) found = { s, p: tokenPath, style, token };
    else if (attempt === 1 && r.headers) {
      const skip = ['date', 'content-length', 'content-type', 'connection', 'cache-control', 'pragma', 'expires', 'set-cookie'];
      for (const [k, v] of Object.entries(r.headers)) if (!skip.includes(k)) console.log(`     header ${k}: ${String(v).slice(0, 160)}`);
    }
    else if (attempt < 3) { console.log('   waiting 30 s before trying again...'); await new Promise((ok) => setTimeout(ok, 30000)); }
  }
  if (!found) {
    console.log(`\nNo token. The same request worked before, so the JACE is refusing this client right now. Check:
  - Is the dashboard (npm run dev) or ARC running with the SAME client ID? Stop it, wait 2 minutes, run npm run check again.
  - In Workbench, the ossRestApiServer client may be locked out after failed attempts: check its status / unlock it.`);
    return;
  }
  saveEnv({ JACE_URL: `${s}://${host}`, OSS_TOKEN_PATH: tokenPath, OSS_AUTH_STYLE: style, OSS_READ_PATH: '/ossRestApiServer/query/readPoint/', OSS_WRITE_PATH: '/ossRestApiServer/query/writePoint/' });

  // 3. Read one point. The API lives under the token's apiBase path (e.g. /ossRestApiServer/token -> /ossRestApiServer).
  const apiBase = found.p.replace(/\/(oauth2?\/)?token\/?$/, '');
  console.log(`\n3. Reading ${POINT}:`);
  for (const encoding of PATH_ENCODINGS) for (const prefix of ['', '/', 'station:|slot:/', 'slot:/']) {
    const path = pointPath(apiBase + '/query/readPoint/', pointSuffix(POINT, prefix, encoding));
    const r = await req(`${found.s}://${host}${path}`, { headers: { Authorization: `Bearer ${found.token}`, Accept: 'application/json, text/plain' } });
    console.log(`   ${encoding} "${prefix}" -> ${r.status ? 'HTTP ' + r.status : r.text}  ${r.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)}`);
    if (r.status === 200) {
      const set = { JACE_URL: `${found.s}://${host}`, OSS_TOKEN_PATH: found.p, OSS_AUTH_STYLE: found.style, OSS_ORD_PREFIX: prefix, OSS_PATH_ENCODING: encoding, OSS_READ_PATH: apiBase + '/query/readPoint/', OSS_WRITE_PATH: apiBase + '/query/writePoint/' };
      saveEnv(set);
      console.log(`\nWORKS. Saved the working settings in .env (${set.JACE_URL}, token ${found.p}, path format ${encoding}${prefix ? ', prefix ' + prefix : ''}).\nNow run: npm run dev`);
      return;
    }
  }
  console.log('\nToken OK but the point could not be read. Send this report.');
})();

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
    const path = '/ossRestApiServer/query/readPoint/' + (prefix + POINT).split('/').map(encodeURIComponent).join('/');
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
