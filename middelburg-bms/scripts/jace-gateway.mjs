// JACE gateway — runs on the host PC next to the dashboard (same origin, under /gw).
// Holds the ossRestApi OAuth credentials SERVER-SIDE (from .env); the browser never sees them.
//
//   GET  /gw/health                       -> { status: 'ok' } when a token can be obtained
//   GET  /gw/query/readPoint/<slot path>  -> { value, status, timestamp?, activeLevel?, raw }
//   PUT  /gw/query/writePoint/<slot path>?value=&priority=
//
// Rules: one request to the JACE at a time (FIFO), timeouts, token cached and refreshed,
// one retry on 401. Responses are normalised but never invented: anything unparseable is
// returned as an error so the dashboard shows OFFLINE.
import http from 'node:http';
import https from 'node:https';
import { tokenRequest } from './oss-auth.mjs';

export function createGateway(env) {
  const cfg = {
    jaceUrl: (env.JACE_URL || '').replace(/\/+$/, ''),
    clientId: env.OSS_CLIENT_ID || '',
    clientSecret: env.OSS_CLIENT_SECRET || '',
    // Alternative to OAuth: a Niagara station user with the HTTP Basic authentication scheme.
    user: env.JACE_USER || '',
    password: env.JACE_PASSWORD || '',
    tokenPath: env.OSS_TOKEN_PATH || '/oauth/token',          // TODO(confirm): token endpoint used by ARC
    authStyle: (env.OSS_AUTH_STYLE || 'basic').toLowerCase(), // basic | basic-encoded | body | json (scripts/oss-auth.mjs)
    readPath: env.OSS_READ_PATH || '/query/readPoint/',
    writePath: env.OSS_WRITE_PATH || '/query/writePoint/',
    writeMethod: (env.OSS_WRITE_METHOD || 'PUT').toUpperCase(),
    ordPrefix: env.OSS_ORD_PREFIX ?? '',                      // e.g. 'station:|slot:/' if the API wants full ORDs
    timeoutMs: Number(env.OSS_TIMEOUT_MS || 8000),
    // JACEs usually have a self-signed certificate. Only for the JACE address, only on the site LAN.
    allowSelfSigned: /^(1|true|yes)$/i.test(env.JACE_ALLOW_SELF_SIGNED || ''),
  };
  const useUser = !!(cfg.user && cfg.password);
  const configured = !!(cfg.jaceUrl && (useUser || (cfg.clientId && cfg.clientSecret)));
  const missing = ['JACE_URL', 'OSS_CLIENT_ID', 'OSS_CLIENT_SECRET'].filter((k) => !env[k]);

  /* ---- HTTP to the JACE (no dependencies) ---- */
  function request(url, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(u, { method, headers, rejectUnauthorized: !cfg.allowSelfSigned, timeout: cfg.timeoutMs }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('timeout', () => req.destroy(new Error(`JACE did not answer within ${cfg.timeoutMs} ms`)));
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  /* ---- one request in flight (the JACE cannot take concurrent requests on one token) ---- */
  let chain = Promise.resolve();
  const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

  /* ---- OAuth client-credentials token ---- */
  let token = null, tokenExp = 0;
  async function getToken(force = false) {
    if (!force && token && Date.now() < tokenExp - 30e3) return token;
    const { headers, body } = tokenRequest(cfg.authStyle, cfg.clientId, cfg.clientSecret);
    const res = await request(cfg.jaceUrl + cfg.tokenPath, { method: 'POST', headers, body });
    if (res.status !== 200) throw new Error(`Token request refused (HTTP ${res.status}) — check OSS_CLIENT_ID / OSS_CLIENT_SECRET / OSS_TOKEN_PATH`);
    let j; try { j = JSON.parse(res.text); } catch { throw new Error('Token response was not JSON — check OSS_TOKEN_PATH'); }
    if (!j.access_token) throw new Error('Token response had no access_token');
    token = j.access_token;
    tokenExp = Date.now() + (Number(j.expires_in) || 300) * 1000;
    return token;
  }

  async function jace(method, path, attempt = 0) {
    const auth = useUser ? 'Basic ' + Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64') : `Bearer ${await getToken()}`;
    const res = await request(cfg.jaceUrl + path, { method, headers: { Authorization: auth, Accept: 'application/json, text/plain' } });
    if (res.status === 401 && attempt === 0 && !useUser) { token = null; await getToken(true); return jace(method, path, 1); }
    return res;
  }

  const encodeSlot = (p) => (cfg.ordPrefix + p).split('/').map(encodeURIComponent).join('/');

  /** Normalises a readPoint reply. Supports JSON ({value,status}) and Niagara text ("21.40 °C {ok} @ def"). */
  const seenShapes = new Set();
  function normalise(text, slot) {
    let body = null;
    try { body = JSON.parse(text); } catch { /* text reply */ }
    let value, status, timestamp, activeLevel;
    if (body && typeof body === 'object') {
      const pick = (...ks) => { for (const k of ks) { const v = k.split('.').reduce((o, x) => (o == null ? o : o[x]), body); if (v !== undefined) return v; } return undefined; };
      value = pick('value', 'out.value', 'result.value', 'data.value', 'pointValue');
      status = pick('status', 'out.status', 'result.status', 'data.status');
      timestamp = pick('timestamp', 'out.timestamp', 'time');
      activeLevel = pick('activeLevel', 'out.activeLevel', 'priority');
    } else if (body !== null) {
      value = body;
    } else {
      const t = String(text).trim();
      const m = t.match(/\{([^}]*)\}/);
      status = m ? `{${m[1]}}` : undefined;
      value = t.replace(/\{[^}]*\}.*$/, '').replace(/@.*$/, '').trim();
    }
    // Log the shape of the first reply per kind of point, without values, to confirm the format.
    const kind = slot.split('/').pop().replace(/\d+/g, 'n');
    if (!seenShapes.has(kind)) { seenShapes.add(kind); console.log(`[gateway] first reply for ${kind}: ${body && typeof body === 'object' ? 'JSON keys ' + Object.keys(body).join(',') : 'text'}`); }
    if (value === undefined || value === null || value === '') return null;
    return { value, status: status ?? '{ok}', timestamp, activeLevel };
  }

  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

  /** Handles /gw/* requests. Returns true when handled. */
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/gw/')) return false;
    const sub = url.pathname.slice(3);
    if (!configured) { send(res, 503, { status: 'error', message: `JACE not configured: set ${missing.join(', ')} in .env` }); return true; }
    try {
      if (sub === '/health') {
        await serial(() => getToken());
        send(res, 200, { status: 'ok', jace: cfg.jaceUrl.replace(/\/\/.*@/, '//') });
        return true;
      }
      if (sub.startsWith('/query/readPoint/') && req.method === 'GET') {
        const slot = decodeURIComponent(sub.slice('/query/readPoint/'.length));
        const r = await serial(() => jace('GET', cfg.readPath + encodeSlot(slot)));
        if (r.status === 404) { send(res, 404, { status: 'error', message: 'Point not found on the JACE' }); return true; }
        if (r.status !== 200) { send(res, 502, { status: 'error', message: `JACE returned HTTP ${r.status}` }); return true; }
        const n = normalise(r.text, slot);
        if (!n) { send(res, 502, { status: 'error', message: 'Unrecognised reply from the JACE' }); return true; }
        send(res, 200, n);
        return true;
      }
      if (sub.startsWith('/query/writePoint/') && req.method === 'PUT') {
        const slot = decodeURIComponent(sub.slice('/query/writePoint/'.length));
        const value = url.searchParams.get('value');
        const priority = url.searchParams.get('priority');
        if (value == null || priority == null) { send(res, 400, { status: 'error', message: 'value and priority are required' }); return true; }
        const q = `?value=${encodeURIComponent(value)}&priority=${encodeURIComponent(priority)}`;
        const r = await serial(() => jace(cfg.writeMethod, cfg.writePath + encodeSlot(slot) + q));
        console.log(`[gateway] write ${slot} = ${value} @ priority ${priority} -> HTTP ${r.status}`);
        send(res, r.status >= 200 && r.status < 300 ? 200 : 502, r.status >= 200 && r.status < 300 ? { status: 'ok' } : { status: 'error', message: `JACE returned HTTP ${r.status}` });
        return true;
      }
      send(res, 404, { status: 'error', message: 'Unknown gateway route' });
    } catch (err) {
      send(res, 502, { status: 'error', message: err.message });
    }
    return true;
  }

  return { handle, configured, missing, cfg: { jaceUrl: cfg.jaceUrl, tokenPath: useUser ? `none (station user ${cfg.user})` : cfg.tokenPath, allowSelfSigned: cfg.allowSelfSigned } };
}
