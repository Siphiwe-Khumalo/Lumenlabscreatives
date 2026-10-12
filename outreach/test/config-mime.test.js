import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, deriveRedirectUri } from '../src/config.js';
import { buildMessage, toRaw } from '../src/mime.js';
import { encryptJson, decryptJson, sign, unsign } from '../src/crypto.js';
import { testEnv } from './helpers.js';

test('redirect URI is derived from PUBLIC_BASE_URL and OAUTH_CALLBACK_PATH', () => {
  const c = loadConfig(testEnv({ PUBLIC_BASE_URL: 'https://outreach.example.org/', OAUTH_CALLBACK_PATH: '/oauth/cb' }));
  assert.equal(c.redirectUri, 'https://outreach.example.org/oauth/cb');
  assert.equal(c.secureCookies, true);
  assert.equal(deriveRedirectUri('https://a.example', '/auth/google/callback'), 'https://a.example/auth/google/callback');
});

test('development falls back to localhost; default callback path', () => {
  const c = loadConfig(testEnv());
  assert.equal(c.redirectUri, 'http://localhost:3999/auth/google/callback');
});

test('production requires an https PUBLIC_BASE_URL and strong secrets', () => {
  assert.throws(() => loadConfig(testEnv({ NODE_ENV: 'production' })), /PUBLIC_BASE_URL is required/);
  assert.throws(() => loadConfig(testEnv({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'http://x.example' })), /https/);
  assert.throws(() => loadConfig(testEnv({ PUBLIC_BASE_URL: 'https://x.example/app' })), /origin only/);
  assert.throws(() => loadConfig(testEnv({ SESSION_SECRET: 'short' })), /SESSION_SECRET/);
  assert.throws(() => loadConfig(testEnv({ TOKEN_ENCRYPTION_KEY: 'abc' })), /TOKEN_ENCRYPTION_KEY/);
  assert.throws(() => loadConfig(testEnv({ OAUTH_CALLBACK_PATH: 'no-slash' })), /OAUTH_CALLBACK_PATH/);
});

test('token encryption round-trips and detects tampering', () => {
  const key = Buffer.alloc(32, 7);
  const enc = encryptJson(key, { refresh_token: 'secret' });
  assert.ok(!enc.includes('secret'));
  assert.deepEqual(decryptJson(key, enc), { refresh_token: 'secret' });
  const parts = enc.split('.');
  parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptJson(key, parts.join('.')));
});

test('signed cookies reject modification', () => {
  const s = sign('k'.repeat(32), { a: 1 });
  assert.deepEqual(unsign('k'.repeat(32), s), { a: 1 });
  assert.equal(unsign('k'.repeat(32), s.replace(/^./, 'x')), null);
  assert.equal(unsign('other'.repeat(8), s), null);
});

test('MIME message: single recipient, encoded subject, base64 body, no Cc/Bcc', () => {
  const msg = buildMessage({ fromName: '', fromEmail: '', toName: 'Zoë', toEmail: 'z@example.com', subject: 'Héllo', body: 'Line 1\nLine 2' });
  const [head, body] = msg.split('\r\n\r\n');
  assert.match(head, /^To: =\?UTF-8\?B\?.+\?= <z@example.com>$/m);
  assert.match(head, /^Subject: =\?UTF-8\?B\?.+\?=$/m);
  assert.doesNotMatch(head, /^(From|Cc|Bcc):/im);
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Line 1\r\nLine 2');
  assert.match(toRaw(msg), /^[A-Za-z0-9_-]+$/);
});

test('MIME message rejects header injection', () => {
  assert.throws(() => buildMessage({ toEmail: 'a@b.co', subject: 'x\r\nBcc: evil@example.com', body: 'b' }), /line breaks/);
});
