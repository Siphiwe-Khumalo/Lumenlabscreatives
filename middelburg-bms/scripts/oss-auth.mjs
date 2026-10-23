// The ONE place that knows how to talk to the JACE's OSS REST API (as ARC's api.js does).
// Used by the gateway (npm run dev) and npm run check, so they can never disagree.
//   Base:   <JACE_URL>/ossRestApiServer
//   Token:  POST <base>/token, Basic client credentials, grant_type=client_credentials&scope=read write
//   Read:   GET  <base>/query/readPoint/<slot path>   (no station:/slot: prefix)
//   Write:  PUT  <base>/query/writePoint/<slot path>?value=&priority=   (as ARC's api.js)
export const OSS_BASE_PATH = '/ossRestApiServer';
// Old .env keys from before the path was known. They are ignored (and npm run check removes them).
export const LEGACY_ENV_KEYS = ['OSS_TOKEN_PATH', 'OSS_READ_PATH', 'OSS_WRITE_PATH'];

export function ossConfig(env) {
  const jaceUrl = (env.JACE_URL || '').replace(/\/+$/, '');
  const base = OSS_BASE_PATH;
  return {
    jaceUrl,
    tokenPath: `${base}/token`,
    readPath: `${base}/query/readPoint/`,
    writePath: `${base}/query/writePoint/`,
    scope: env.OSS_SCOPE ?? 'read write',
    authStyle: (env.OSS_AUTH_STYLE || 'basic').toLowerCase(),
    ordPrefix: env.OSS_ORD_PREFIX ?? '',
    pathEncoding: env.OSS_PATH_ENCODING || 'segments',
  };
}

/** Requests a token. `send(url, {method, headers, body})` -> {status, text}. Returns {token, expiresIn} or throws (err.status set). */
export async function fetchToken(send, cfg, id, secret) {
  const { headers, body } = tokenRequest(cfg.authStyle, id, secret, cfg.scope);
  const res = await send(cfg.jaceUrl + cfg.tokenPath, { method: 'POST', headers, body });
  let j = null; try { j = JSON.parse(res.text); } catch { /* not JSON */ }
  if (res.status !== 200 || !j?.access_token) {
    const why = String(res.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const err = new Error(`JACE refused the login (HTTP ${res.status}${why ? ': ' + why : ''})`);
    err.status = res.status; err.headers = res.headers;
    throw err;
  }
  return { token: j.access_token, expiresIn: Number(j.expires_in) || 300 };
}

// Builds the OAuth client-credentials token request.
// Styles (OSS_AUTH_STYLE):
//   basic         Authorization: Basic base64(id:secret)
//   basic-encoded Authorization: Basic base64(urlencode(id):urlencode(secret)) (RFC 6749 2.3.1;
//                 needed when the secret contains + % : & etc.)
//   body          client_id / client_secret as form fields
//   json          JSON body { grant_type, client_id, client_secret }
export const AUTH_STYLES = ['basic', 'basic-encoded', 'body', 'json'];

export function tokenRequest(style, id, secret, scope = 'read write') {
  const headers = { Accept: 'application/json' };
  if (style === 'json') {
    headers['Content-Type'] = 'application/json';
    return { headers, body: JSON.stringify({ grant_type: 'client_credentials', scope, client_id: id, client_secret: secret }) };
  }
  headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const form = new URLSearchParams({ grant_type: 'client_credentials' });
  if (scope) form.set('scope', scope);
  if (style === 'body') { form.set('client_id', id); form.set('client_secret', secret); }
  else {
    const enc = (s) => (style === 'basic-encoded' ? encodeURIComponent(s) : s);
    headers.Authorization = 'Basic ' + Buffer.from(`${enc(id)}:${enc(secret)}`).toString('base64');
  }
  return { headers, body: form.toString() };
}

// How the point's slot path is put in the URL (OSS_PATH_ENCODING). npm run check finds the one the JACE accepts.
//   segments  readPoint/Drivers/Bcp.../SPACE_TEMP1 (each segment URL-encoded)
//   raw       readPoint/<prefix + path> unencoded (e.g. station:|slot:/Drivers/...)
//   full      readPoint/<whole path URL-encoded, slashes as %2F>
//   query:<n> readPoint?<n>=<URL-encoded path>
export const PATH_ENCODINGS = ['segments', 'raw', 'full', 'query:ord', 'query:path', 'query:point', 'query:slotPath'];

export function pointSuffix(slot, prefix = '', encoding = 'segments') {
  const p = prefix + slot;
  if (encoding.startsWith('query:')) return `?${encoding.slice(6)}=${encodeURIComponent(p)}`;
  if (encoding === 'raw') return p.replace(/ /g, '%20');
  if (encoding === 'full') return encodeURIComponent(p);
  return p.split('/').map(encodeURIComponent).join('/');
}

/** Joins a read/write base path and a point suffix; extra query (e.g. ?value=) is merged. */
export function pointPath(base, suffix, query = '') {
  const b = suffix.startsWith('?') ? base.replace(/\/+$/, '') : base;
  const sep = (suffix.includes('?') && query.startsWith('?')) ? '&' + query.slice(1) : query;
  return b + suffix + sep;
}

// How a write is sent (OSS_WRITE_STYLE). Default put-query, as ARC. The others are kept only for diagnosis.
export const WRITE_STYLES = ['put-query', 'put-json', 'post-json', 'post-query', 'post-form', 'put-query-value', 'put-json-value'];

/** -> { method, query, headers, body } for writing `value` at `priority`. */
export function writeRequest(style, value, priority) {
  const typed = value === 'true' ? true : value === 'false' ? false : (value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value);
  const q = (withPriority) => `?value=${encodeURIComponent(value)}${withPriority ? `&priority=${encodeURIComponent(priority)}` : ''}`;
  const json = (withPriority) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withPriority ? { value: typed, priority: Number(priority) } : { value: typed }) });
  switch (style) {
    case 'put-json': return { method: 'PUT', query: '', ...json(true) };
    case 'post-json': return { method: 'POST', query: '', ...json(true) };
    case 'post-query': return { method: 'POST', query: q(true) };
    case 'post-form': return { method: 'POST', query: '', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q(true).slice(1) };
    case 'put-query-value': return { method: 'PUT', query: q(false) };
    case 'put-json-value': return { method: 'PUT', query: '', ...json(false) };
    default: return { method: 'PUT', query: q(true) }; // put-query
  }
}
