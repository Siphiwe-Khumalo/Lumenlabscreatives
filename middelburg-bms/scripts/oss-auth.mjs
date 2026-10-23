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
