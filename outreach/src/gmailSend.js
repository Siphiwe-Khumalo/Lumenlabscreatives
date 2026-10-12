import { buildMessage, toRaw } from './mime.js';

// One call to users.messages.send, classified by what we can honestly say
// about the outcome:
//   accepted   – Gmail accepted the message (not proof of delivery)
//   not_sent   – Gmail definitely did not create the message (safe to retry)
//   uncertain  – the request may or may not have taken effect; never auto-retry
//   auth       – access token rejected; caller may refresh once and retry

export const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Errors raised before any bytes reached Google: the message cannot exist.
const PRE_CONNECT_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']);

function parseRetryAfter(header, bodyMessage) {
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) return secs * 1000;
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  }
  // Gmail sometimes reports "Retry after 2026-01-01T10:00:00.000Z" in the message.
  const m = /Retry after (\S+)/i.exec(bodyMessage || '');
  if (m) {
    const at = Date.parse(m[1]);
    if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  }
  return null;
}

export async function sendGmailMessage({ accessToken, recipient, config, fetchImpl = fetch }) {
  const message = buildMessage({
    fromName: config.senderName,
    fromEmail: config.senderEmail,
    toName: recipient.name,
    toEmail: recipient.email,
    subject: recipient.subject,
    body: recipient.body,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.sendTimeoutMs);
  let res;
  try {
    res = await fetchImpl(GMAIL_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: toRaw(message) }),
      signal: controller.signal,
    });
  } catch (err) {
    const code = err?.cause?.code || err?.code;
    if (PRE_CONNECT_CODES.has(code)) {
      return { outcome: 'not_sent', retryable: true, reason: `Could not reach Gmail (${code}).` };
    }
    const timedOut = err?.name === 'AbortError';
    return {
      outcome: 'uncertain',
      reason: timedOut
        ? 'Gmail did not respond before the timeout. The message may have been sent.'
        : `Connection to Gmail failed mid-request (${code || err?.name || 'error'}). The message may have been sent.`,
    };
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (res.ok) {
    if (data?.id) return { outcome: 'accepted', gmailMessageId: data.id, threadId: data.threadId || null };
    return { outcome: 'uncertain', reason: 'Gmail returned success without a message id.' };
  }

  const gErr = data?.error || {};
  const reasons = (gErr.errors || []).map((e) => e.reason);
  const msg = String(gErr.message || res.statusText || '').slice(0, 300);

  if (res.status === 401) return { outcome: 'auth', reason: 'Access token rejected.' };

  if (res.status === 429 || reasons.includes('rateLimitExceeded') || reasons.includes('userRateLimitExceeded')) {
    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'), msg);
    const dailyLimit = /daily|sending limit|quota/i.test(msg) || (retryAfterMs !== null && retryAfterMs > 60_000);
    return {
      outcome: 'not_sent',
      retryable: true,
      rateLimited: !dailyLimit,
      dailyLimit,
      retryAfterMs,
      reason: dailyLimit ? `Gmail sending limit reached: ${msg}` : `Gmail rate limit: ${msg}`,
    };
  }

  if (res.status === 403 && (reasons.includes('insufficientPermissions') || /insufficient/i.test(msg))) {
    return { outcome: 'not_sent', retryable: false, reauth: true, reason: 'Gmail permission missing. Reconnect Gmail.' };
  }

  if (res.status >= 400 && res.status < 500) {
    return { outcome: 'not_sent', retryable: false, reason: `Gmail rejected the message (${res.status}): ${msg}` };
  }

  // 5xx: Google may have processed the request before failing.
  return { outcome: 'uncertain', reason: `Gmail server error (${res.status}): ${msg}. The message may have been sent.` };
}
