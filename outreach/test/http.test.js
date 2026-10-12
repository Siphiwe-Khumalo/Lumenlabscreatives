import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { testConfig, fakeOAuthClientFactory, recipient } from './helpers.js';

let server;
let base;
let ctx;
const oauth = fakeOAuthClientFactory();
const sent = [];

before(async () => {
  const config = testConfig();
  ctx = createApp(config, {
    clientFactory: oauth.factory,
    batchOptions: {
      sleepImpl: async () => {},
      sendImpl: async ({ recipient: r }) => {
        sent.push(r.email);
        return { outcome: 'accepted', gmailMessageId: `m${sent.length}` };
      },
    },
  });
  ctx.config = config;
  await new Promise((resolve) => {
    server = ctx.app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function cookieJar() {
  const jar = {};
  return {
    jar,
    absorb(res) {
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';');
        const [k, v] = pair.split('=');
        if (attrs.some((a) => /max-age=0/i.test(a.trim()))) delete jar[k];
        else jar[k] = v;
      }
    },
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
  };
}

async function login() {
  const c = cookieJar();
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'correct horse battery' }) });
  assert.equal(res.status, 200);
  c.absorb(res);
  const { csrfToken } = await res.json();
  const req = (p, opts = {}) =>
    fetch(`${base}${p}`, {
      redirect: 'manual',
      ...opts,
      headers: { cookie: c.header(), 'x-csrf-token': csrfToken, 'content-type': 'application/json', ...(opts.headers || {}) },
    }).then((r) => {
      c.absorb(r);
      return r;
    });
  return { c, csrfToken, req };
}

test('API and OAuth routes require a session; wrong password rejected', async () => {
  assert.equal((await fetch(`${base}/api/gmail/status`)).status, 401);
  const start = await fetch(`${base}/auth/google/start`, { redirect: 'manual' });
  assert.equal(start.status, 303);
  assert.match(start.headers.get('location'), /login=required/);
  const bad = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"wrong"}' });
  assert.equal(bad.status, 401);
});

test('state-changing calls need the CSRF token and same origin', async () => {
  const { c } = await login();
  const noToken = await fetch(`${base}/api/gmail/disconnect`, { method: 'POST', headers: { cookie: c.header() } });
  assert.equal(noToken.status, 403);
  const { req } = await login();
  const crossOrigin = await req('/api/gmail/disconnect', { method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal(crossOrigin.status, 403);
});

test('start redirects to Google with only gmail.send, offline access, state and PKCE', async () => {
  const { req, c } = await login();
  const res = await req('/auth/google/start');
  assert.equal(res.status, 303);
  const url = new URL(res.headers.get('location'));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.send');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('state').length >= 32);
  assert.ok(c.jar.lo_oauth, 'oauth flow cookie set');
});

test('callback rejects a mismatched or missing state', async () => {
  const { req } = await login();
  await req('/auth/google/start');
  const res = await req('/auth/google/callback?code=abc&state=forged');
  assert.match(res.headers.get('location'), /gmail_error=state_mismatch/);
  const again = await req('/auth/google/callback?code=abc&state=forged');
  assert.match(again.headers.get('location'), /gmail_error=state_expired/, 'flow cookie is single-use');
  const denied = await req('/auth/google/callback?error=access_denied');
  assert.match(denied.headers.get('location'), /gmail_error=access_denied/);
  assert.equal(oauth.calls.getToken.length, 0);
});

test('full flow: connect, status never exposes tokens, send a batch, disconnect', async () => {
  const { req } = await login();
  const start = await req('/auth/google/start');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const cb = await req(`/auth/google/callback?code=auth-code&state=${state}`);
  assert.equal(cb.headers.get('location'), '/?gmail=connected');
  assert.deepEqual(oauth.calls.getToken.at(-1), { code: 'auth-code', codeVerifier: 'verifier-123' });

  const status = await (await req('/api/gmail/status')).json();
  assert.equal(status.connected, true);
  assert.equal(status.redirectUri, 'http://localhost:3999/auth/google/callback');
  const raw = JSON.stringify(status);
  assert.ok(!raw.includes('refresh') && !raw.includes('ya29') && !raw.includes('test-client-secret'));

  // Tokens are encrypted at rest.
  const file = fs.readFileSync(path.join(ctx.config.dataDir, 'outreach-state.json'), 'utf8');
  assert.ok(!file.includes('1//refresh') && !file.includes('ya29.access'));

  const create = await req('/api/batches', {
    method: 'POST',
    headers: { 'idempotency-key': 'httpflowkey000000001' },
    body: JSON.stringify({ recipients: [recipient(1), recipient(2)] }),
  });
  assert.equal(create.status, 201);
  const { batch } = await create.json();

  const noConfirm = await req(`/api/batches/${batch.id}/send`, { method: 'POST', body: JSON.stringify({}) });
  assert.equal(noConfirm.status, 400);

  const go = await req(`/api/batches/${batch.id}/send`, { method: 'POST', body: JSON.stringify({ confirm: true, confirmHash: batch.contentHash }) });
  assert.equal(go.status, 202);
  await ctx.batches.running.get(batch.id);
  const after = await (await req(`/api/batches/${batch.id}`)).json();
  assert.deepEqual(after.batch.recipients.map((r) => r.status), ['Sent', 'Sent']);
  assert.deepEqual(sent, ['person1@example.com', 'person2@example.com']);

  // Retrying the same send request (e.g. after a timeout) sends nothing new.
  await req(`/api/batches/${batch.id}/send`, { method: 'POST', body: JSON.stringify({ confirm: true, confirmHash: batch.contentHash }) });
  assert.equal(sent.length, 2);

  const disc = await req('/api/gmail/disconnect', { method: 'POST' });
  assert.equal((await disc.json()).connected, false);
  assert.deepEqual(oauth.calls.revoke, ['1//refresh']);
});

test('callback rejects a grant without the gmail.send scope', async () => {
  const narrow = fakeOAuthClientFactory({ tokens: { access_token: 'a', refresh_token: 'r', scope: 'openid' } });
  const app2 = createApp(testConfig(), { clientFactory: narrow.factory });
  const srv = await new Promise((resolve) => {
    const s = app2.app.listen(0, () => resolve(s));
  });
  const b2 = `http://127.0.0.1:${srv.address().port}`;
  try {
    const c = cookieJar();
    const l = await fetch(`${b2}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'correct horse battery' }) });
    c.absorb(l);
    const s = await fetch(`${b2}/auth/google/start`, { redirect: 'manual', headers: { cookie: c.header() } });
    c.absorb(s);
    const state = new URL(s.headers.get('location')).searchParams.get('state');
    const cb = await fetch(`${b2}/auth/google/callback?code=x&state=${state}`, { redirect: 'manual', headers: { cookie: c.header() } });
    assert.match(cb.headers.get('location'), /gmail_error=scope_not_granted/);
    assert.equal(app2.gmailAuth.status().connected, false);
    assert.deepEqual(narrow.calls.revoke, ['r']);
  } finally {
    srv.close();
  }
});
