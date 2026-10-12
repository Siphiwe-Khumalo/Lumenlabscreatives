import { sign, unsign, safeEqual, randomToken } from './crypto.js';

// Signed, HttpOnly session cookie protecting the whole app. This app sends
// mail as you, so nothing but the login page is reachable without a session.
// State-changing API calls also need the per-session CSRF token in a header
// and (when the browser sends one) a same-origin Origin header.

export const SESSION_COOKIE = 'lo_session';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

export function cookieHeader(config, name, value, { maxAgeMs } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (config.secureCookies) parts.push('Secure');
  if (maxAgeMs !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`);
  return parts.join('; ');
}

export function appendCookie(res, value) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, value) : value);
}

export function readSession(config, req) {
  const s = unsign(config.sessionSecret, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  if (!s || typeof s.exp !== 'number' || s.exp < Date.now() || !s.sid || !s.csrf) return null;
  return s;
}

// Simple in-memory brute-force guard for the access password.
class LoginLimiter {
  constructor({ maxFailures = 5, windowMs = 15 * 60_000 } = {}) {
    this.max = maxFailures;
    this.window = windowMs;
    this.failures = new Map();
  }
  blocked(key) {
    const f = this.failures.get(key);
    if (!f) return false;
    if (Date.now() - f.first > this.window) {
      this.failures.delete(key);
      return false;
    }
    return f.count >= this.max;
  }
  fail(key) {
    const f = this.failures.get(key);
    if (!f || Date.now() - f.first > this.window) this.failures.set(key, { first: Date.now(), count: 1 });
    else f.count += 1;
  }
  reset(key) {
    this.failures.delete(key);
  }
}

export function createSessionHandlers(config) {
  const limiter = new LoginLimiter();

  function login(req, res) {
    const key = req.ip || 'unknown';
    if (limiter.blocked(key)) {
      return res.status(429).json({ error: 'too_many_attempts', message: 'Too many failed attempts. Try again in 15 minutes.' });
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !safeEqual(password, config.appPassword)) {
      limiter.fail(key);
      return res.status(401).json({ error: 'invalid_password', message: 'Incorrect access password.' });
    }
    limiter.reset(key);
    const session = { sid: randomToken(16), csrf: randomToken(24), exp: Date.now() + config.sessionTtlMs };
    appendCookie(res, cookieHeader(config, SESSION_COOKIE, sign(config.sessionSecret, session), { maxAgeMs: config.sessionTtlMs }));
    res.json({ authenticated: true, csrfToken: session.csrf });
  }

  function logout(req, res) {
    appendCookie(res, cookieHeader(config, SESSION_COOKIE, '', { maxAgeMs: 0 }));
    res.json({ authenticated: false });
  }

  function sessionInfo(req, res) {
    const s = readSession(config, req);
    res.json(s ? { authenticated: true, csrfToken: s.csrf } : { authenticated: false });
  }

  /** Attach req.session or reject. JSON for /api, redirect for page routes. */
  function requireSession(req, res, next) {
    const s = readSession(config, req);
    if (!s) {
      if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'unauthenticated', message: 'Please sign in.' });
      return res.redirect(303, '/?login=required');
    }
    req.session = s;
    next();
  }

  /** CSRF + origin check for state-changing requests. */
  function requireCsrf(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.headers.origin;
    if (origin && origin !== config.baseUrl) {
      return res.status(403).json({ error: 'bad_origin', message: 'Cross-origin request rejected.' });
    }
    const token = req.headers['x-csrf-token'];
    if (!req.session || typeof token !== 'string' || !safeEqual(token, req.session.csrf)) {
      return res.status(403).json({ error: 'bad_csrf', message: 'Session check failed. Reload the page.' });
    }
    next();
  }

  return { login, logout, sessionInfo, requireSession, requireCsrf };
}
