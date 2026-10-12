import { randomToken, sha256 } from './crypto.js';
import { GmailNotConnectedError } from './gmailAuth.js';
import { sendGmailMessage } from './gmailSend.js';

// Batch lifecycle. Each recipient is an independent message with its own
// status:
//   Pending    – not attempted yet (or explicitly re-queued after a definite failure)
//   Sending    – persisted *before* the Gmail call; in flight right now
//   Sent       – Gmail accepted the message (this is not proof of delivery)
//   Failed     – Gmail definitely did not create the message
//   Uncertain  – the request may have taken effect (timeout, 5xx, crash mid-send).
//                Never retried automatically: you must check Gmail's Sent folder
//                and reconcile it as sent or not sent.

export const MAX_RECIPIENTS = 5;
export const STATUS = Object.freeze({
  PENDING: 'Pending',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
  UNCERTAIN: 'Uncertain',
});

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const MAX_SUBJECT = 250;
const MAX_BODY = 50_000;
const MAX_NAME = 120;
const RATE_LIMIT_RETRIES = 3;

export class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.status = 400;
    this.code = 'validation_error';
    this.details = details;
  }
}

export class ConflictError extends Error {
  constructor(code, message, details) {
    super(message);
    this.status = 409;
    this.code = code;
    this.details = details;
  }
}

/** Replace {{name}} / {{firstName}} / {{email}} placeholders for one recipient. */
export function personalise(template, { name, email }) {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  return String(template).replace(/\{\{\s*(name|firstName|email)\s*\}\}/g, (_, key) =>
    key === 'name' ? name || '' : key === 'firstName' ? first : email,
  );
}

export function validateRecipients(input) {
  if (!Array.isArray(input) || input.length === 0) throw new ValidationError('Add at least one recipient.');
  if (input.length > MAX_RECIPIENTS) throw new ValidationError(`A batch can contain at most ${MAX_RECIPIENTS} recipients.`);

  const errors = [];
  const seen = new Set();
  const recipients = input.map((r, i) => {
    const row = `Recipient ${i + 1}`;
    const name = typeof r?.name === 'string' ? r.name.trim() : '';
    const email = typeof r?.email === 'string' ? r.email.trim() : '';
    const subjectT = typeof r?.subject === 'string' ? r.subject : '';
    const bodyT = typeof r?.body === 'string' ? r.body : '';
    const subject = personalise(subjectT, { name, email }).trim();
    const body = personalise(bodyT, { name, email });

    if (!EMAIL_RE.test(email) || email.length > 254) errors.push(`${row}: invalid email address.`);
    if (/[\r\n]/.test(name) || name.length > MAX_NAME) errors.push(`${row}: name must be one line, at most ${MAX_NAME} characters.`);
    if (!subject) errors.push(`${row}: subject is required.`);
    if (/[\r\n]/.test(subject) || subject.length > MAX_SUBJECT) errors.push(`${row}: subject must be one line, at most ${MAX_SUBJECT} characters.`);
    if (!body.trim()) errors.push(`${row}: message body is required.`);
    if (body.length > MAX_BODY) errors.push(`${row}: message body is too long.`);
    const key = email.toLowerCase();
    if (seen.has(key)) errors.push(`${row}: ${email} appears more than once in this batch.`);
    seen.add(key);
    return { name, email, subject, body };
  });
  if (errors.length) throw new ValidationError('Please fix the highlighted problems.', errors);
  return recipients;
}

/** Fingerprint of exactly what will be sent; the confirmation must echo it. */
export function contentHash(recipients) {
  return sha256(JSON.stringify(recipients.map(({ name, email, subject, body }) => [name, email, subject, body])));
}

const messageKey = (r) => sha256(`${r.email.toLowerCase()}\n${r.subject}\n${r.body}`);

export function dayKey(date, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class BatchService {
  constructor({ config, store, gmailAuth, sendImpl = sendGmailMessage, sleepImpl = sleep, now = () => new Date() }) {
    this.config = config;
    this.store = store;
    this.gmailAuth = gmailAuth;
    this.sendImpl = sendImpl;
    this.sleep = sleepImpl;
    this.now = now;
    this.running = new Map(); // batchId -> Promise
  }

  /** Called once at startup: anything left "Sending" was interrupted mid-call. */
  recoverInterrupted() {
    let n = 0;
    this.store.update((s) => {
      for (const b of Object.values(s.batches)) {
        for (const r of b.recipients) {
          if (r.status === STATUS.SENDING) {
            r.status = STATUS.UNCERTAIN;
            r.error = 'The server stopped while this message was being sent. Check your Gmail Sent folder, then reconcile.';
            r.updatedAt = this.now().toISOString();
            n += 1;
          }
        }
      }
    });
    return n;
  }

  // ---- queries --------------------------------------------------------------

  get(id) {
    const b = this.store.state.batches[id];
    return b ? this.#view(b) : null;
  }

  list(limit = 20) {
    return Object.values(this.store.state.batches)
      .filter((b) => !b.cancelled)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((b) => this.#view(b));
  }

  /** Messages counted against today's cap: anything that reached Gmail or might have. */
  usedToday() {
    const today = dayKey(this.now(), this.config.timezone);
    let used = 0;
    for (const b of Object.values(this.store.state.batches)) {
      for (const r of b.recipients) {
        if ([STATUS.SENT, STATUS.SENDING, STATUS.UNCERTAIN].includes(r.status) && r.attemptedAt && dayKey(new Date(r.attemptedAt), this.config.timezone) === today) {
          used += 1;
        }
      }
    }
    return used;
  }

  quota() {
    const used = this.usedToday();
    return { cap: this.config.dailyCap, used, remaining: Math.max(0, this.config.dailyCap - used), timezone: this.config.timezone };
  }

  #view(b) {
    const counts = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
    for (const r of b.recipients) counts[r.status] += 1;
    return {
      id: b.id,
      createdAt: b.createdAt,
      confirmedAt: b.confirmedAt || null,
      contentHash: b.contentHash,
      cancelled: Boolean(b.cancelled),
      running: this.running.has(b.id),
      notice: b.notice || null,
      counts,
      recipients: b.recipients.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        subject: r.subject,
        body: r.body,
        status: r.status,
        error: r.error || null,
        retryable: r.status === STATUS.FAILED && r.retryable !== false,
        attempts: r.attempts,
        gmailMessageId: r.gmailMessageId || null,
        acceptedAt: r.acceptedAt || null,
        reconciled: r.reconciled || null,
        updatedAt: r.updatedAt,
      })),
    };
  }

  // ---- commands -------------------------------------------------------------

  /**
   * Create a draft batch. `idempotencyKey` makes a retried create (e.g. after a
   * timeout) return the same batch instead of a second one.
   */
  create({ recipients: input, idempotencyKey, allowRepeat = false }) {
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) {
      throw new ValidationError('Missing or invalid Idempotency-Key.');
    }
    const recipients = validateRecipients(input);
    const hash = contentHash(recipients);
    const s = this.store.state;

    const existingId = s.idempotency[idempotencyKey];
    if (existingId && s.batches[existingId]) {
      if (s.batches[existingId].contentHash !== hash) {
        throw new ConflictError('idempotency_conflict', 'This draft was already submitted with different content. Start a new draft.');
      }
      return { batch: this.#view(s.batches[existingId]), reused: true };
    }

    // Same recipient + subject + body already sent, in flight, uncertain or queued elsewhere?
    if (!allowRepeat) {
      const keys = new Map(recipients.map((r) => [messageKey(r), r.email]));
      const repeats = [];
      for (const b of Object.values(s.batches)) {
        if (b.cancelled) continue;
        for (const r of b.recipients) {
          if (r.status !== STATUS.FAILED && keys.has(r.messageKey)) repeats.push({ email: r.email, status: r.status, batchId: b.id });
        }
      }
      if (repeats.length) {
        throw new ConflictError(
          'possible_duplicate',
          'An identical message to some of these recipients already exists (sent, queued, or uncertain).',
          repeats,
        );
      }
    }

    const at = this.now().toISOString();
    const batch = {
      id: `b_${randomToken(12)}`,
      createdAt: at,
      contentHash: hash,
      recipients: recipients.map((r) => ({
        id: `r_${randomToken(9)}`,
        ...r,
        messageKey: messageKey(r),
        status: STATUS.PENDING,
        attempts: 0,
        updatedAt: at,
      })),
    };
    this.store.update((st) => {
      st.batches[batch.id] = batch;
      st.idempotency[idempotencyKey] = batch.id;
    });
    return { batch: this.#view(batch), reused: false };
  }

  cancel(id) {
    const b = this.#mustGet(id);
    if (this.running.has(id) || b.recipients.some((r) => r.status !== STATUS.PENDING)) {
      throw new ConflictError('not_cancellable', 'Only a batch that has not started sending can be discarded.');
    }
    this.store.update(() => {
      b.cancelled = true;
    });
    return this.#view(b);
  }

  /**
   * Confirm and start sending. `confirmHash` must equal the batch's content
   * hash, proving the user confirmed exactly this content. Sending runs in
   * the background; poll get(id). Calling again while running is a no-op.
   */
  startSend(id, { confirm, confirmHash }) {
    const b = this.#mustGet(id);
    if (confirm !== true || confirmHash !== b.contentHash) {
      throw new ValidationError('Explicit confirmation of this exact batch is required before sending.');
    }
    if (b.cancelled) throw new ConflictError('cancelled', 'This batch was discarded.');
    if (this.running.has(id)) return { batch: this.#view(b), started: false };

    const pending = b.recipients.filter((r) => r.status === STATUS.PENDING).length;
    if (pending === 0) return { batch: this.#view(b), started: false };

    if (!this.gmailAuth.status().connected) {
      throw new ConflictError('gmail_not_connected', 'Connect Gmail before sending.');
    }
    const { remaining, cap } = this.quota();
    if (pending > remaining) {
      throw new ConflictError('daily_cap', `Daily sending cap: ${remaining} of ${cap} messages left today, but this batch has ${pending} to send.`);
    }

    this.store.update(() => {
      b.confirmedAt = b.confirmedAt || this.now().toISOString();
      b.notice = null;
    });
    const job = this.#run(b).finally(() => this.running.delete(id));
    this.running.set(id, job);
    return { batch: this.#view(b), started: true, job };
  }

  /** Re-queue a definitely-failed recipient. Sending it still needs confirmation. */
  requeue(id, recipientId) {
    const b = this.#mustGet(id);
    const r = this.#mustGetRecipient(b, recipientId);
    if (this.running.has(id)) throw new ConflictError('busy', 'Wait for the current send to finish.');
    if (r.status !== STATUS.FAILED || r.retryable === false) {
      throw new ConflictError('not_retryable', 'Only recipients whose send definitely failed can be retried.');
    }
    this.store.update(() => {
      Object.assign(r, { status: STATUS.PENDING, error: null, updatedAt: this.now().toISOString() });
    });
    return this.#view(b);
  }

  /** Resolve an Uncertain recipient after checking Gmail's Sent folder. */
  reconcile(id, recipientId, outcome) {
    const b = this.#mustGet(id);
    const r = this.#mustGetRecipient(b, recipientId);
    if (r.status !== STATUS.UNCERTAIN) throw new ConflictError('not_uncertain', 'Only uncertain recipients need reconciling.');
    if (outcome !== 'sent' && outcome !== 'not_sent') throw new ValidationError('outcome must be "sent" or "not_sent".');
    const at = this.now().toISOString();
    this.store.update(() => {
      if (outcome === 'sent') {
        Object.assign(r, { status: STATUS.SENT, error: null, reconciled: { outcome, at }, updatedAt: at });
      } else {
        Object.assign(r, {
          status: STATUS.FAILED,
          retryable: true,
          error: 'You confirmed this message is not in your Gmail Sent folder.',
          reconciled: { outcome, at },
          updatedAt: at,
        });
      }
    });
    return this.#view(b);
  }

  // ---- worker ---------------------------------------------------------------

  async #run(b) {
    let first = true;
    for (const r of b.recipients) {
      if (r.status !== STATUS.PENDING) continue; // never resend Sent / Uncertain
      if (!first && this.config.minSendIntervalMs) await this.sleep(this.config.minSendIntervalMs);
      first = false;

      if (this.quota().remaining <= 0) {
        this.#note(b, 'Daily sending cap reached. Remaining recipients stay Pending until tomorrow.');
        return;
      }

      const at = this.now().toISOString();
      this.store.update(() => {
        Object.assign(r, { status: STATUS.SENDING, attempts: r.attempts + 1, attemptedAt: at, error: null, updatedAt: at });
      });

      let result;
      try {
        result = await this.#sendOne(r);
      } catch (err) {
        // Token errors happen before any send request, so nothing was created.
        // Anything else is unexpected: assume the worst and require a check.
        const tokenError = err instanceof GmailNotConnectedError || err.code === 'refresh_failed';
        result = tokenError
          ? { outcome: 'not_sent', retryable: true, reason: err.message, stop: true }
          : { outcome: 'uncertain', reason: `Unexpected error during send: ${err.message}`, stop: true };
      }
      this.#apply(r, result);

      if (result.stop || result.reauth || result.dailyLimit) {
        this.#note(b, `Stopped this batch: ${result.reason} Remaining recipients stay Pending.`);
        if (result.reauth) this.gmailAuth.markNeedsReconnect('Gmail rejected the send permission. Reconnect Gmail.');
        return;
      }
    }
  }

  async #sendOne(r) {
    let token = await this.gmailAuth.getAccessToken();
    let refreshed = false;
    for (let attempt = 0; ; attempt += 1) {
      const result = await this.sendImpl({ accessToken: token, recipient: r, config: this.config });
      if (result.outcome === 'auth' && !refreshed) {
        refreshed = true;
        token = await this.gmailAuth.getAccessToken({ forceRefresh: true });
        continue;
      }
      if (result.outcome === 'auth') return { outcome: 'not_sent', retryable: true, reauth: true, reason: 'Gmail rejected the access token after refresh.' };
      if (result.outcome === 'not_sent' && result.rateLimited && attempt < RATE_LIMIT_RETRIES) {
        const backoff = Math.min(60_000, result.retryAfterMs ?? 2000 * 2 ** attempt);
        await this.sleep(backoff);
        continue;
      }
      return result;
    }
  }

  #apply(r, result) {
    const at = this.now().toISOString();
    this.store.update(() => {
      if (result.outcome === 'accepted') {
        Object.assign(r, { status: STATUS.SENT, gmailMessageId: result.gmailMessageId, acceptedAt: at, error: null, updatedAt: at });
      } else if (result.outcome === 'not_sent') {
        Object.assign(r, { status: STATUS.FAILED, retryable: result.retryable !== false, error: result.reason, updatedAt: at });
      } else {
        Object.assign(r, { status: STATUS.UNCERTAIN, error: result.reason, updatedAt: at });
      }
    });
  }

  #note(b, text) {
    this.store.update(() => {
      b.notice = text;
    });
  }

  #mustGet(id) {
    const b = this.store.state.batches[id];
    if (!b) {
      const e = new Error('Batch not found.');
      e.status = 404;
      e.code = 'not_found';
      throw e;
    }
    return b;
  }

  #mustGetRecipient(b, rid) {
    const r = b.recipients.find((x) => x.id === rid);
    if (!r) {
      const e = new Error('Recipient not found.');
      e.status = 404;
      e.code = 'not_found';
      throw e;
    }
    return r;
  }
}
