# Lumen Outreach

Single-user tool for sending individually personalised emails from your own Gmail account through the Gmail API (`gmail.send` scope only).

- **Backend:** Node.js 20.10+ / Express, in `src/`. It serves the UI from `public/` on the same origin.
- **Security:** OAuth secrets and tokens stay on the server. Tokens are encrypted at rest (AES-256-GCM). The app is behind an access password with a signed HttpOnly session cookie, CSRF tokens and same-origin checks. OAuth uses a `state` parameter bound to the session plus PKCE.
- **Sending:** batches of up to 5 recipients. Each recipient gets a separate message (never shared To/CC/BCC). Sending requires explicit confirmation of the exact rendered content. Each recipient has its own status: Pending, Sending, Sent, Failed or Uncertain.
- **Duplicate protection:**
  - batch creation is idempotent;
  - a recipient is saved as Sending before Gmail is called;
  - a repeated send request never resends Sent or Uncertain recipients;
  - uncertain outcomes need manual reconciliation;
  - identical repeat messages need explicit acknowledgement.
- **Limits:** a daily cap (`DAILY_SEND_CAP`), backoff on Gmail rate limits, and a pause between messages.

## Run locally

```
cd outreach
npm install
cp .env.example .env      # then fill in values; for local dev remove NODE_ENV=production and PUBLIC_BASE_URL
npm run gen-secrets       # paste output into .env
npm run dev               # http://localhost:3000
npm test
```

Google Cloud setup is described in [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md).

## Routes

| Route | Purpose |
|---|---|
| `GET /auth/google/start` | Starts Google authorisation (requires app session) |
| `GET /auth/google/callback` (`OAUTH_CALLBACK_PATH`) | Google's redirect target: validates state, exchanges code |
| `GET /api/gmail/status[?verify=1]` | Connection status and daily quota (never tokens) |
| `POST /api/gmail/disconnect` | Revokes the token at Google and deletes it |
| `POST /api/batches` | Creates a draft batch (`Idempotency-Key` header) |
| `POST /api/batches/:id/send` | `{confirm: true, confirmHash}`, starts sending |
| `POST /api/batches/:id/cancel` | Discards an unsent draft |
| `POST /api/batches/:id/recipients/:rid/retry` | Re-queues a definitely failed recipient |
| `POST /api/batches/:id/recipients/:rid/reconcile` | `{outcome: "sent" \| "not_sent"}` for Uncertain recipients |

## Deployment notes

- HTTPS is required in production. `PUBLIC_BASE_URL` must be the public origin.
- `DATA_DIR` must be on a persistent disk. State lives in one JSON file written atomically.
- Run a single instance. The send worker and duplicate guards are in-process.
