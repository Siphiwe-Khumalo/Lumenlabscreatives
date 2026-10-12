import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendGmailMessage, GMAIL_SEND_URL } from '../src/gmailSend.js';
import { testConfig } from './helpers.js';

const config = testConfig({ GMAIL_SEND_TIMEOUT_MS: '1000' });
const recipient = { name: 'A', email: 'a@example.com', subject: 'S', body: 'B' };

function respond(status, body, headers = {}) {
  return async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
const send = (fetchImpl) => sendGmailMessage({ accessToken: 'tok', recipient, config, fetchImpl });

test('posts raw message to the Gmail send endpoint with bearer token', async () => {
  let seen;
  const r = await send(async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ id: 'm1', threadId: 't1' }), { status: 200 });
  });
  assert.equal(seen.url, GMAIL_SEND_URL);
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  const raw = JSON.parse(seen.init.body).raw;
  assert.match(Buffer.from(raw, 'base64url').toString(), /^To: "A" <a@example.com>$/m);
  assert.deepEqual(r, { outcome: 'accepted', gmailMessageId: 'm1', threadId: 't1' });
});

test('classifies Gmail responses', async () => {
  assert.equal((await send(respond(401, { error: { message: 'Invalid Credentials' } }))).outcome, 'auth');

  const rl = await send(respond(429, { error: { message: 'Too many requests', errors: [{ reason: 'rateLimitExceeded' }] } }, { 'retry-after': '3' }));
  assert.equal(rl.outcome, 'not_sent');
  assert.equal(rl.rateLimited, true);
  assert.equal(rl.retryAfterMs, 3000);

  const daily = await send(respond(429, { error: { message: 'Daily user sending limit exceeded' } }));
  assert.equal(daily.dailyLimit, true);
  assert.equal(daily.rateLimited, false);

  const bad = await send(respond(400, { error: { message: 'Invalid To header' } }));
  assert.equal(bad.outcome, 'not_sent');
  assert.equal(bad.retryable, false);

  const perm = await send(respond(403, { error: { message: 'Request had insufficient authentication scopes.', errors: [{ reason: 'insufficientPermissions' }] } }));
  assert.equal(perm.reauth, true);

  assert.equal((await send(respond(503, { error: { message: 'Backend Error' } }))).outcome, 'uncertain');
  assert.equal((await send(respond(200, {}))).outcome, 'uncertain');
});

test('timeouts are uncertain; DNS failures are definitely not sent', async () => {
  const timeout = await send(async () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    throw e;
  });
  assert.equal(timeout.outcome, 'uncertain');

  const reset = await send(async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
  });
  assert.equal(reset.outcome, 'uncertain');

  const dns = await send(async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  });
  assert.equal(dns.outcome, 'not_sent');
  assert.equal(dns.retryable, true);
});
