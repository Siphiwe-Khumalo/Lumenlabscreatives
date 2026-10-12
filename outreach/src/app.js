import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Store } from './store.js';
import { GmailAuth } from './gmailAuth.js';
import { BatchService } from './batches.js';
import { createSessionHandlers } from './session.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp(config, deps = {}) {
  const store = deps.store || new Store(config.dataDir);
  const gmailAuth = deps.gmailAuth || new GmailAuth(config, store, deps);
  const batches = deps.batches || new BatchService({ config, store, gmailAuth, ...deps.batchOptions });
  const session = createSessionHandlers(config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // Security headers. no-referrer keeps the OAuth ?code= out of Referer headers.
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  // Minimal access log: method, path (never the query string, which can hold
  // an OAuth code), status.
  app.use((req, res, next) => {
    res.on('finish', () => console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode}`));
    next();
  });

  app.use('/api', express.json({ limit: '400kb' }));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // ---- session ----
  app.get('/api/session', session.sessionInfo);
  app.post('/api/login', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origin !== config.baseUrl) return res.status(403).json({ error: 'bad_origin', message: 'Cross-origin request rejected.' });
    session.login(req, res, next);
  });
  app.post('/api/logout', session.requireSession, session.requireCsrf, session.logout);

  // ---- Gmail OAuth ----
  app.get('/auth/google/start', session.requireSession, (req, res) => gmailAuth.start(req, res));
  app.get(config.callbackPath, session.requireSession, (req, res) => gmailAuth.callback(req, res));

  const api = express.Router();
  api.use(session.requireSession, session.requireCsrf);

  api.get('/gmail/status', async (req, res) => {
    const verify = req.query.verify === '1' && gmailAuth.status().connected ? await gmailAuth.verify() : null;
    res.json({ ...gmailAuth.status(), verify, quota: batches.quota() });
  });
  api.post('/gmail/disconnect', async (req, res) => {
    await gmailAuth.disconnect();
    res.json(gmailAuth.status());
  });

  // ---- batches ----
  api.get('/batches', (req, res) => res.json({ batches: batches.list(), quota: batches.quota() }));
  api.get('/batches/:id', (req, res) => {
    const b = batches.get(req.params.id);
    if (!b) return res.status(404).json({ error: 'not_found', message: 'Batch not found.' });
    res.json({ batch: b, quota: batches.quota() });
  });
  api.post('/batches', (req, res) => {
    const { batch, reused } = batches.create({
      recipients: req.body?.recipients,
      idempotencyKey: req.headers['idempotency-key'],
      allowRepeat: req.body?.allowRepeat === true,
    });
    res.status(reused ? 200 : 201).json({ batch, quota: batches.quota() });
  });
  api.post('/batches/:id/send', (req, res) => {
    const { batch, started } = batches.startSend(req.params.id, { confirm: req.body?.confirm, confirmHash: req.body?.confirmHash });
    res.status(202).json({ batch, started });
  });
  api.post('/batches/:id/cancel', (req, res) => res.json({ batch: batches.cancel(req.params.id) }));
  api.post('/batches/:id/recipients/:rid/retry', (req, res) => res.json({ batch: batches.requeue(req.params.id, req.params.rid) }));
  api.post('/batches/:id/recipients/:rid/reconcile', (req, res) =>
    res.json({ batch: batches.reconcile(req.params.id, req.params.rid, req.body?.outcome) }),
  );

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'Unknown endpoint.' }));

  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: 0 }));

  // Errors: known errors carry status/code; anything else is a generic 500
  // with no internals in the response.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Malformed JSON.' });
    if (err.status && err.status < 500 && err.code) {
      return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    }
    console.error(`[error] ${req.method} ${req.path}:`, err.message);
    if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ error: 'internal', message: 'Something went wrong.' });
    res.redirect(303, '/?gmail_error=internal');
  });

  return { app, store, gmailAuth, batches };
}
