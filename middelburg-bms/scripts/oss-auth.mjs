// Builds the OAuth client-credentials token request. Shared by the gateway and npm run check.
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
