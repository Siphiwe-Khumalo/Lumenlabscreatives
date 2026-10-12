import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig } from '../src/config.js';

export function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-outreach-test-'));
}

export function testEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PORT: '3999',
    GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    APP_ACCESS_PASSWORD: 'correct horse battery',
    DATA_DIR: tmpDir(),
    MIN_SEND_INTERVAL_MS: '0',
    DAILY_SEND_CAP: '10',
    ...overrides,
  };
}

export const testConfig = (overrides) => loadConfig(testEnv(overrides));

/** Stand-in for google-auth-library's OAuth2Client; records calls. */
export function fakeOAuthClientFactory(behaviour = {}) {
  const calls = { getToken: [], revoke: [], refresh: 0 };
  const factory = () => ({
    credentials: {},
    async generateCodeVerifierAsync() {
      return { codeVerifier: 'verifier-123', codeChallenge: 'challenge-abc' };
    },
    generateAuthUrl(opts) {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for (const [k, v] of Object.entries(opts)) u.searchParams.set(k, Array.isArray(v) ? v.join(' ') : String(v));
      return u.toString();
    },
    async getToken(opts) {
      calls.getToken.push(opts);
      if (behaviour.getTokenError) throw behaviour.getTokenError;
      return {
        tokens: behaviour.tokens || {
          access_token: 'ya29.access',
          refresh_token: '1//refresh',
          expiry_date: Date.now() + 3600_000,
          scope: 'https://www.googleapis.com/auth/gmail.send',
        },
      };
    },
    setCredentials(c) {
      this.credentials = { ...c };
    },
    async getAccessToken() {
      const c = this.credentials;
      if (c.access_token && c.expiry_date && c.expiry_date > Date.now()) return { token: c.access_token };
      calls.refresh += 1;
      if (behaviour.refreshError) throw behaviour.refreshError;
      this.credentials = { ...c, access_token: `ya29.refreshed${calls.refresh}`, expiry_date: Date.now() + 3600_000 };
      return { token: this.credentials.access_token };
    },
    async revokeToken(t) {
      calls.revoke.push(t);
    },
  });
  return { factory, calls };
}

export const recipient = (i, extra = {}) => ({
  name: `Person ${i}`,
  email: `person${i}@example.com`,
  subject: `Hello {{firstName}} ${i}`,
  body: `Hi {{name}},\nThis is message ${i}.`,
  ...extra,
});
