import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { GMAIL_SEND_SCOPE, googleConfigured } from './config.js';
import { encryptJson, decryptJson, sign, unsign, safeEqual, randomToken } from './crypto.js';
import { parseCookies, cookieHeader, appendCookie } from './session.js';

// OAuth 2.0 web-server flow (authorization code + PKCE) for the single
// gmail.send scope. Tokens never leave this module except as an Authorization
// header sent to Google; the browser only ever sees a connection status.

export const OAUTH_COOKIE = 'lo_oauth';
const OAUTH_FLOW_TTL_MS = 10 * 60_000;

export class GmailNotConnectedError extends Error {
  constructor(message = 'Gmail is not connected.', code = 'not_connected') {
    super(message);
    this.code = code;
  }
}

export class GmailAuth {
  constructor(config, store, { clientFactory } = {}) {
    this.config = config;
    this.store = store;
    this.clientFactory =
      clientFactory ||
      (() =>
        new OAuth2Client({
          clientId: config.google.clientId,
          clientSecret: config.google.clientSecret,
          redirectUri: config.redirectUri,
        }));
  }

  // ---- status ---------------------------------------------------------------

  status() {
    const g = this.store.state.gmail;
    return {
      configured: googleConfigured(this.config),
      connected: Boolean(g?.status === 'connected' && g.tokens),
      state: g?.status || 'disconnected',
      connectedAt: g?.connectedAt || null,
      lastError: g?.lastError || null,
      scope: GMAIL_SEND_SCOPE,
      senderEmail: this.config.senderEmail || null,
      redirectUri: this.config.redirectUri,
    };
  }

  #tokens() {
    const g = this.store.state.gmail;
    if (!g?.tokens || g.status !== 'connected') return null;
    return decryptJson(this.config.tokenKey, g.tokens);
  }

  #saveTokens(tokens) {
    this.store.update((s) => {
      s.gmail = {
        ...(s.gmail || {}),
        status: 'connected',
        tokens: encryptJson(this.config.tokenKey, tokens),
        lastError: null,
      };
    });
  }

  /** Forget tokens locally and record why, so the UI can ask for a reconnect. */
  markNeedsReconnect(reason) {
    this.store.update((s) => {
      s.gmail = { status: 'reauth_required', tokens: null, connectedAt: s.gmail?.connectedAt || null, lastError: reason };
    });
  }

  // ---- authorisation flow ---------------------------------------------------

  /** GET /auth/google/start — redirect to Google's consent screen. */
  async start(req, res) {
    if (!googleConfigured(this.config)) {
      return res.redirect(303, '/?gmail_error=not_configured');
    }
    const client = this.clientFactory();
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomToken(32);
    const flow = { state, codeVerifier, sid: req.session.sid, exp: Date.now() + OAUTH_FLOW_TTL_MS };
    appendCookie(res, cookieHeader(this.config, OAUTH_COOKIE, sign(this.config.sessionSecret, flow), { maxAgeMs: OAUTH_FLOW_TTL_MS }));

    const url = client.generateAuthUrl({
      // Offline access is required: a batch is sent over several seconds and
      // you will send on later days without re-consenting each hour. The
      // refresh token stays encrypted on the server.
      access_type: 'offline',
      // Always show consent so Google issues a refresh token on reconnect.
      prompt: 'consent',
      scope: [GMAIL_SEND_SCOPE],
      include_granted_scopes: false,
      state,
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: codeChallenge,
      ...(this.config.senderEmail ? { login_hint: this.config.senderEmail } : {}),
    });
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(303, url);
  }

  /** GET <OAUTH_CALLBACK_PATH> — validate state and exchange the code. */
  async callback(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const fail = (code) => res.redirect(303, `/?gmail_error=${encodeURIComponent(code)}`);

    // Always consume the one-time flow cookie, whatever the outcome.
    const flow = unsign(this.config.sessionSecret, parseCookies(req.headers.cookie)[OAUTH_COOKIE]);
    appendCookie(res, cookieHeader(this.config, OAUTH_COOKIE, '', { maxAgeMs: 0 }));

    const q = req.query;
    if (typeof q.error === 'string') {
      return fail(q.error === 'access_denied' ? 'access_denied' : 'google_error');
    }
    if (!flow || typeof flow.exp !== 'number' || flow.exp < Date.now()) return fail('state_expired');
    if (typeof q.state !== 'string' || !safeEqual(q.state, flow.state) || flow.sid !== req.session.sid) {
      return fail('state_mismatch');
    }
    if (typeof q.code !== 'string' || !q.code) return fail('missing_code');

    let tokens;
    try {
      ({ tokens } = await this.clientFactory().getToken({ code: q.code, codeVerifier: flow.codeVerifier }));
    } catch (err) {
      console.error('[oauth] code exchange failed:', describeGoogleError(err));
      return fail('exchange_failed');
    }

    const granted = String(tokens.scope || '').split(/\s+/);
    if (!granted.includes(GMAIL_SEND_SCOPE)) {
      // The user un-ticked the "Send email on your behalf" checkbox.
      await this.#revokeQuietly(tokens.refresh_token || tokens.access_token);
      return fail('scope_not_granted');
    }
    if (!tokens.refresh_token) {
      return fail('no_refresh_token');
    }

    this.#saveTokens({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token || null,
      expiry_date: tokens.expiry_date || null,
      scope: tokens.scope,
    });
    this.store.update((s) => {
      s.gmail.connectedAt = new Date().toISOString();
    });
    console.log('[oauth] Gmail connected (gmail.send)');
    res.redirect(303, '/?gmail=connected');
  }

  // ---- tokens for sending ---------------------------------------------------

  /**
   * Return a valid access token, refreshing if needed. Throws
   * GmailNotConnectedError when there is no connection or Google has revoked it.
   */
  async getAccessToken({ forceRefresh = false } = {}) {
    const tokens = this.#tokens();
    if (!tokens) throw new GmailNotConnectedError();
    const client = this.clientFactory();
    client.setCredentials({
      refresh_token: tokens.refresh_token,
      access_token: forceRefresh ? undefined : tokens.access_token || undefined,
      expiry_date: forceRefresh ? 1 : tokens.expiry_date || undefined,
    });
    try {
      const { token } = await client.getAccessToken();
      if (!token) throw new Error('No access token returned');
      const c = client.credentials;
      if (c.access_token !== tokens.access_token) {
        this.#saveTokens({
          ...tokens,
          access_token: c.access_token,
          expiry_date: c.expiry_date || null,
          refresh_token: c.refresh_token || tokens.refresh_token,
        });
      }
      return token;
    } catch (err) {
      if (isInvalidGrant(err)) {
        this.markNeedsReconnect('Google rejected the stored authorisation (revoked or expired). Reconnect Gmail.');
        throw new GmailNotConnectedError('Gmail access was revoked or has expired. Reconnect Gmail.', 'reauth_required');
      }
      const e = new Error(`Could not refresh Gmail access: ${describeGoogleError(err)}`);
      e.code = 'refresh_failed';
      throw e;
    }
  }

  /** Force a refresh to confirm Google still honours the authorisation. */
  async verify() {
    try {
      await this.getAccessToken({ forceRefresh: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, code: err.code || 'error', message: err.message };
    }
  }

  async disconnect() {
    let tokens = null;
    try {
      tokens = this.#tokens();
    } catch {
      /* undecryptable: just drop it */
    }
    if (tokens) await this.#revokeQuietly(tokens.refresh_token);
    this.store.update((s) => {
      s.gmail = { status: 'disconnected', tokens: null, connectedAt: null, lastError: null };
    });
  }

  async #revokeQuietly(token) {
    if (!token) return;
    try {
      await this.clientFactory().revokeToken(token);
    } catch (err) {
      console.warn('[oauth] token revoke failed (already revoked?):', describeGoogleError(err));
    }
  }
}

export function isInvalidGrant(err) {
  const data = err?.response?.data;
  return data?.error === 'invalid_grant' || /invalid_grant/.test(String(err?.message || ''));
}

/** A short, secret-free description of a Google client error for logs. */
export function describeGoogleError(err) {
  const data = err?.response?.data;
  if (data && typeof data === 'object') {
    return [err.response.status, data.error, data.error_description].filter(Boolean).join(' ');
  }
  return String(err?.code || err?.message || 'unknown error').slice(0, 200);
}
