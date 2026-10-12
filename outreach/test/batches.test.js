import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { GmailAuth } from '../src/gmailAuth.js';
import { BatchService, STATUS } from '../src/batches.js';
import { encryptJson } from '../src/crypto.js';
import { testConfig, fakeOAuthClientFactory, recipient } from './helpers.js';

function setup({ sendImpl, config = testConfig(), oauth = {}, connected = true } = {}) {
  const store = new Store(config.dataDir);
  const { factory, calls } = fakeOAuthClientFactory(oauth);
  const gmailAuth = new GmailAuth(config, store, { clientFactory: factory });
  if (connected) {
    store.update((s) => {
      s.gmail = {
        status: 'connected',
        connectedAt: new Date().toISOString(),
        tokens: encryptJson(config.tokenKey, { refresh_token: '1//r', access_token: 'ya29.a', expiry_date: Date.now() + 3600_000 }),
      };
    });
  }
  const sent = [];
  const svc = new BatchService({
    config,
    store,
    gmailAuth,
    sleepImpl: async () => {},
    sendImpl:
      sendImpl ||
      (async ({ recipient: r, accessToken }) => {
        sent.push({ to: r.email, accessToken });
        return { outcome: 'accepted', gmailMessageId: `m-${sent.length}` };
      }),
  });
  return { config, store, gmailAuth, svc, sent, calls };
}

let keyN = 0;
const key = () => `testkey${String(++keyN).padStart(12, '0')}`;

async function sendAll(svc, batch) {
  const { job } = svc.startSend(batch.id, { confirm: true, confirmHash: batch.contentHash });
  await job;
  return svc.get(batch.id);
}

test('validates batch size, emails, duplicates in batch and header injection', () => {
  const { svc } = setup();
  assert.throws(() => svc.create({ recipients: [1, 2, 3, 4, 5, 6].map((i) => recipient(i)), idempotencyKey: key() }), /at most 5/);
  assert.throws(() => svc.create({ recipients: [recipient(1, { email: 'nope' })], idempotencyKey: key() }), (e) => e.details.some((d) => /invalid email/.test(d)));
  assert.throws(() => svc.create({ recipients: [recipient(1), recipient(2, { email: 'PERSON1@example.com' })], idempotencyKey: key() }), (e) => e.details.some((d) => /more than once/.test(d)));
  assert.throws(() => svc.create({ recipients: [recipient(1, { subject: 'a\nBcc: x@y.z' })], idempotencyKey: key() }), (e) => e.details.some((d) => /one line/.test(d)));
  assert.throws(() => svc.create({ recipients: [recipient(1)] }), /Idempotency-Key/);
});

test('personalises each message and sends each recipient individually', async () => {
  const { svc, sent } = setup();
  const { batch } = svc.create({ recipients: [1, 2, 3, 4, 5].map((i) => recipient(i)), idempotencyKey: key() });
  assert.equal(batch.recipients[0].subject, 'Hello Person 1');
  assert.equal(batch.recipients[1].body, 'Hi Person 2,\nThis is message 2.');
  assert.ok(batch.recipients.every((r) => r.status === STATUS.PENDING));

  const done = await sendAll(svc, batch);
  assert.deepEqual(sent.map((s) => s.to), [1, 2, 3, 4, 5].map((i) => `person${i}@example.com`));
  assert.ok(done.recipients.every((r) => r.status === STATUS.SENT && r.gmailMessageId));
});

test('sending requires explicit confirmation of the exact content', () => {
  const { svc } = setup();
  const { batch } = svc.create({ recipients: [recipient(1)], idempotencyKey: key() });
  assert.throws(() => svc.startSend(batch.id, { confirm: false, confirmHash: batch.contentHash }), /confirmation/);
  assert.throws(() => svc.startSend(batch.id, { confirm: true, confirmHash: 'wrong' }), /confirmation/);
});

test('idempotent create: retrying with the same key returns the same batch', () => {
  const { svc } = setup();
  const k = key();
  const a = svc.create({ recipients: [recipient(1)], idempotencyKey: k });
  const b = svc.create({ recipients: [recipient(1)], idempotencyKey: k });
  assert.equal(a.batch.id, b.batch.id);
  assert.equal(b.reused, true);
  assert.throws(() => svc.create({ recipients: [recipient(2)], idempotencyKey: k }), (e) => e.code === 'idempotency_conflict');
});

test('repeating an identical message needs explicit acknowledgement', async () => {
  const { svc } = setup();
  const { batch } = svc.create({ recipients: [recipient(1)], idempotencyKey: key() });
  await sendAll(svc, batch);
  assert.throws(() => svc.create({ recipients: [recipient(1)], idempotencyKey: key() }), (e) => e.code === 'possible_duplicate');
  assert.ok(svc.create({ recipients: [recipient(1)], idempotencyKey: key(), allowRepeat: true }).batch);
});

test('a second send call never resends; concurrent calls run one worker', async () => {
  const { svc, sent } = setup();
  const { batch } = svc.create({ recipients: [recipient(1), recipient(2)], idempotencyKey: key() });
  const first = svc.startSend(batch.id, { confirm: true, confirmHash: batch.contentHash });
  const second = svc.startSend(batch.id, { confirm: true, confirmHash: batch.contentHash });
  assert.equal(first.started, true);
  assert.equal(second.started, false);
  await first.job;
  const third = svc.startSend(batch.id, { confirm: true, confirmHash: batch.contentHash });
  assert.equal(third.started, false);
  assert.equal(sent.length, 2);
});

test('uncertain outcomes are never retried automatically and need reconciliation', async () => {
  let n = 0;
  const { svc } = setup({
    sendImpl: async () => (++n === 1 ? { outcome: 'uncertain', reason: 'timeout' } : { outcome: 'accepted', gmailMessageId: 'ok' }),
  });
  const { batch } = svc.create({ recipients: [recipient(1), recipient(2)], idempotencyKey: key() });
  let b = await sendAll(svc, batch);
  assert.equal(b.recipients[0].status, STATUS.UNCERTAIN);
  assert.equal(b.recipients[1].status, STATUS.SENT);
  assert.equal(n, 2);

  // Not retryable while uncertain, and resending the batch does nothing.
  assert.throws(() => svc.requeue(batch.id, b.recipients[0].id), (e) => e.code === 'not_retryable');
  assert.equal(svc.startSend(batch.id, { confirm: true, confirmHash: batch.contentHash }).started, false);

  b = svc.reconcile(batch.id, b.recipients[0].id, 'not_sent');
  assert.equal(b.recipients[0].status, STATUS.FAILED);
  b = svc.requeue(batch.id, b.recipients[0].id);
  assert.equal(b.recipients[0].status, STATUS.PENDING);
  b = await sendAll(svc, b);
  assert.equal(b.recipients[0].status, STATUS.SENT);
  assert.equal(n, 3);
});

test('reconcile as sent marks Sent without a resend', async () => {
  const { svc } = setup({ sendImpl: async () => ({ outcome: 'uncertain', reason: '503' }) });
  const { batch } = svc.create({ recipients: [recipient(1)], idempotencyKey: key() });
  const b = await sendAll(svc, batch);
  const r = svc.reconcile(batch.id, b.recipients[0].id, 'sent').recipients[0];
  assert.equal(r.status, STATUS.SENT);
  assert.equal(r.reconciled.outcome, 'sent');
});

test('server restart turns in-flight Sending into Uncertain', () => {
  const { svc, store } = setup();
  const { batch } = svc.create({ recipients: [recipient(1)], idempotencyKey: key() });
  store.update((s) => {
    s.batches[batch.id].recipients[0].status = STATUS.SENDING;
  });
  const fresh = new BatchService({ config: svc.config, store: new Store(svc.config.dataDir), gmailAuth: svc.gmailAuth });
  assert.equal(fresh.recoverInterrupted(), 1);
  assert.equal(fresh.get(batch.id).recipients[0].status, STATUS.UNCERTAIN);
});

test('status is persisted as Sending before Gmail is called', async () => {
  let statusDuringCall;
  const ctx = setup({
    sendImpl: async () => {
      statusDuringCall = new Store(ctx.config.dataDir).state.batches[batchId].recipients[0].status;
      return { outcome: 'accepted', gmailMessageId: 'x' };
    },
  });
  const { batch } = ctx.svc.create({ recipients: [recipient(1)], idempotencyKey: key() });
  const batchId = batch.id;
  await sendAll(ctx.svc, batch);
  assert.equal(statusDuringCall, STATUS.SENDING);
});

test('daily cap blocks batches that would exceed it', async () => {
  const { svc, sent } = setup({ config: testConfig({ DAILY_SEND_CAP: '3' }) });
  const a = svc.create({ recipients: [recipient(1), recipient(2)], idempotencyKey: key() }).batch;
  await sendAll(svc, a);
  const b = svc.create({ recipients: [recipient(3), recipient(4)], idempotencyKey: key() }).batch;
  assert.throws(() => svc.startSend(b.id, { confirm: true, confirmHash: b.contentHash }), (e) => e.code === 'daily_cap');
  assert.deepEqual(svc.quota(), { cap: 3, used: 2, remaining: 1, timezone: 'UTC' });
  assert.equal(sent.length, 2);
});

test('rate limits back off and retry; daily-limit errors stop the batch', async () => {
  let n = 0;
  const { svc } = setup({
    sendImpl: async () => {
      n += 1;
      if (n <= 2) return { outcome: 'not_sent', retryable: true, rateLimited: true, retryAfterMs: 10 };
      if (n === 3) return { outcome: 'accepted', gmailMessageId: 'ok' };
      return { outcome: 'not_sent', retryable: true, dailyLimit: true, reason: 'Gmail sending limit reached.' };
    },
  });
  const { batch } = svc.create({ recipients: [recipient(1), recipient(2), recipient(3)], idempotencyKey: key() });
  const b = await sendAll(svc, batch);
  assert.deepEqual(b.recipients.map((r) => r.status), [STATUS.SENT, STATUS.FAILED, STATUS.PENDING]);
  assert.match(b.notice, /Stopped/);
});

test('401 triggers one token refresh then retries the same message', async () => {
  let n = 0;
  const tokens = [];
  const { svc, calls } = setup({
    sendImpl: async ({ accessToken }) => {
      tokens.push(accessToken);
      return ++n === 1 ? { outcome: 'auth' } : { outcome: 'accepted', gmailMessageId: 'ok' };
    },
  });
  const { batch } = svc.create({ recipients: [recipient(1)], idempotencyKey: key() });
  const b = await sendAll(svc, batch);
  assert.equal(b.recipients[0].status, STATUS.SENT);
  assert.equal(calls.refresh, 1);
  assert.notEqual(tokens[0], tokens[1]);
});

test('revoked authorisation fails cleanly and asks for reconnect', async () => {
  const invalid = Object.assign(new Error('invalid_grant'), { response: { status: 400, data: { error: 'invalid_grant' } } });
  const { svc, gmailAuth, sent } = setup({ oauth: { refreshError: invalid } });
  const { batch } = svc.create({ recipients: [recipient(1), recipient(2)], idempotencyKey: key() });
  // Force a refresh by expiring the stored access token.
  gmailAuth.store.update((s) => {
    s.gmail.tokens = encryptJson(svc.config.tokenKey, { refresh_token: '1//r', access_token: 'old', expiry_date: 1 });
  });
  const b = await sendAll(svc, batch);
  assert.equal(sent.length, 0);
  assert.equal(b.recipients[0].status, STATUS.FAILED);
  assert.equal(b.recipients[1].status, STATUS.PENDING);
  assert.equal(gmailAuth.status().state, 'reauth_required');
  assert.equal(gmailAuth.status().connected, false);
  assert.throws(() => svc.startSend(batch.id, { confirm: true, confirmHash: batch.contentHash }), (e) => e.code === 'gmail_not_connected');
});

test('cancel only works before sending starts', async () => {
  const { svc } = setup();
  const a = svc.create({ recipients: [recipient(1)], idempotencyKey: key() }).batch;
  assert.equal(svc.cancel(a.id).cancelled, true);
  assert.throws(() => svc.startSend(a.id, { confirm: true, confirmHash: a.contentHash }), (e) => e.code === 'cancelled');
  // A discarded draft does not count as a duplicate.
  const b = svc.create({ recipients: [recipient(1)], idempotencyKey: key() }).batch;
  await sendAll(svc, b);
  assert.throws(() => svc.cancel(b.id), (e) => e.code === 'not_cancellable');
});
