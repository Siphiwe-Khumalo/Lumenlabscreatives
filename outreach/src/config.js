// Central configuration. Every value comes from the environment; nothing here
// is a guessed production URL. In production the app refuses to start when a
// required value is missing, so a half-configured deployment fails loudly.

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const DEFAULT_CALLBACK_PATH = '/auth/google/callback';

function int(env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function normaliseBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PUBLIC_BASE_URL must be an absolute URL such as https://your-backend.example');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('PUBLIC_BASE_URL must use http or https');
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('PUBLIC_BASE_URL must be an origin only (no path, query or fragment)');
  }
  return url.origin;
}

export function normaliseCallbackPath(raw) {
  const path = raw || DEFAULT_CALLBACK_PATH;
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(path) || path.includes('//') || path.startsWith('/api/')) {
    throw new Error('OAUTH_CALLBACK_PATH must be a simple absolute path such as /auth/google/callback');
  }
  return path;
}

/** The exact redirect URI to register in Google Cloud Console. */
export function deriveRedirectUri(baseUrl, callbackPath) {
  return `${baseUrl}${callbackPath}`;
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = int(env, 'PORT', 3000, { min: 1, max: 65535 });
  const errors = [];

  let baseUrl;
  if (env.PUBLIC_BASE_URL) {
    baseUrl = normaliseBaseUrl(env.PUBLIC_BASE_URL);
  } else if (production) {
    errors.push('PUBLIC_BASE_URL is required in production');
  } else {
    baseUrl = `http://localhost:${port}`;
  }
  if (production && baseUrl && !baseUrl.startsWith('https://')) {
    errors.push('PUBLIC_BASE_URL must use https in production');
  }

  const callbackPath = normaliseCallbackPath(env.OAUTH_CALLBACK_PATH);

  const tokenKey = env.TOKEN_ENCRYPTION_KEY ? Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64') : null;
  if (!tokenKey || tokenKey.length !== 32) {
    errors.push('TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (run: npm run gen-secrets)');
  }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters (run: npm run gen-secrets)');
  }
  if (!env.APP_ACCESS_PASSWORD || env.APP_ACCESS_PASSWORD.length < 12) {
    errors.push('APP_ACCESS_PASSWORD must be at least 12 characters (this is NOT your Gmail password)');
  }

  const senderEmail = env.SENDER_EMAIL || '';
  if (senderEmail && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(senderEmail)) {
    errors.push('SENDER_EMAIL is not a valid email address');
  }
  const senderName = env.SENDER_NAME || '';
  if (/[\r\n]/.test(senderName)) errors.push('SENDER_NAME must not contain line breaks');

  const timezone = env.DAILY_CAP_TIMEZONE || 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  } catch {
    errors.push(`DAILY_CAP_TIMEZONE "${timezone}" is not a valid IANA time zone`);
  }

  if (errors.length) {
    const err = new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
    err.configErrors = errors;
    throw err;
  }

  return Object.freeze({
    production,
    port,
    baseUrl,
    callbackPath,
    redirectUri: deriveRedirectUri(baseUrl, callbackPath),
    secureCookies: baseUrl.startsWith('https://'),
    trustProxy: int(env, 'TRUST_PROXY', production ? 1 : 0, { min: 0, max: 10 }),
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    },
    tokenKey,
    sessionSecret: env.SESSION_SECRET,
    sessionTtlMs: int(env, 'SESSION_TTL_HOURS', 12, { min: 1, max: 24 * 30 }) * 3600_000,
    appPassword: env.APP_ACCESS_PASSWORD,
    dataDir: env.DATA_DIR || './data',
    dailyCap: int(env, 'DAILY_SEND_CAP', 20, { min: 1, max: 2000 }),
    timezone,
    minSendIntervalMs: int(env, 'MIN_SEND_INTERVAL_MS', 2000, { min: 0, max: 600_000 }),
    sendTimeoutMs: int(env, 'GMAIL_SEND_TIMEOUT_MS', 30_000, { min: 1000, max: 300_000 }),
    senderEmail,
    senderName,
  });
}

/** True once the Google OAuth client credentials have been supplied. */
export function googleConfigured(config) {
  return Boolean(config.google.clientId && config.google.clientSecret);
}
