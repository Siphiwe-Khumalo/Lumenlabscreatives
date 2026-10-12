# Google OAuth setup for Lumen Outreach

Lumen Outreach sends mail from your own Gmail account through the official Gmail API. It uses the OAuth 2.0 web-server flow (authorisation code with PKCE) and requests **one scope only**:

```
https://www.googleapis.com/auth/gmail.send
```

That scope can send mail but cannot read your inbox, contacts or profile. You never give this app your Gmail password: you approve access on Google's own consent page.

---

## Part A: steps you can do now

### 1. Create or select a Google Cloud project
1. Open <https://console.cloud.google.com/>.
2. Use the project picker in the top bar to choose an existing project, or click **New project** and name it (for example `lumen-outreach`).

### 2. Enable the Gmail API
1. Go to **APIs & Services → Library**.
2. Search for **Gmail API**, open it, and click **Enable**.

### 3. Configure the Google Auth Platform (consent screen)
Open **Google Auth Platform** (in older consoles: **APIs & Services → OAuth consent screen**) and click **Get started** if it hasn't been set up yet.

- **Branding:** app name (`Lumen Outreach`), a user support email, and a developer contact email. A logo is optional; adding one can trigger brand verification, so skip it for a private app.
- **Audience:**
  - **External** if you send from a personal `@gmail.com` account. Leave the publishing status as **Testing**.
  - **Internal** is available only if the sending account belongs to a Google Workspace organisation that owns this Cloud project. Internal apps need no test users and no verification, and their refresh tokens do not expire after 7 days (see section 9).
  - **Test users** (External + Testing only): click **Add users** and add the exact Gmail address you'll send from. Only listed test users can authorise the app.

### 4. Add the OAuth scope
Under **Data access**, click **Add or remove scopes** and add only:
```
https://www.googleapis.com/auth/gmail.send
```
(Search for "gmail.send". It is shown under the Gmail API as "Send email on your behalf" and is classed as a *sensitive* scope.) Save. Do not add any other Gmail scope.

### 5. Create the Web application OAuth client
Go to **Google Auth Platform → Clients → Create client** (or **APIs & Services → Credentials → Create credentials → OAuth client ID**):
- **Application type:** Web application
- **Name:** `Lumen Outreach backend`
- **Authorised JavaScript origins:** leave empty. The token exchange happens on the server, so none are needed.
- **Authorised redirect URIs:** add the local development URI now if you plan to run the app locally:
  ```
  http://localhost:3000/auth/google/callback
  ```
  (Change `3000` to your `PORT` if it differs.) Add the production URI later, in Part B.

Click **Create** and copy the **Client ID** and **Client secret**. Store the secret only in your host's environment settings or a local `.env` file. Never put it in Git, frontend code or chat messages.

### 6. Generate the app's own secrets
In the `outreach/` folder:
```
npm install
npm run gen-secrets
```
This prints fresh values for `TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET`. Also choose an `APP_ACCESS_PASSWORD` of at least 12 characters. It unlocks this app and is **not** your Gmail password.

### 7. Environment variables
Every variable is listed with placeholders in [`.env.example`](./.env.example). Locally, copy it to `outreach/.env` (it is git-ignored). On your host, set the same values in its environment-variable settings.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes (prod) | `production` enforces HTTPS and requires `PUBLIC_BASE_URL`. |
| `PUBLIC_BASE_URL` | yes (prod) | The deployed backend's public origin, e.g. `https://<your-backend-host>`. No path and no trailing slash. **The redirect URI is derived from this.** |
| `OAUTH_CALLBACK_PATH` | no | Defaults to `/auth/google/callback`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | From step 5. |
| `TOKEN_ENCRYPTION_KEY` | yes | From step 6. Encrypts stored Gmail tokens (AES-256-GCM). |
| `SESSION_SECRET` | yes | From step 6. |
| `APP_ACCESS_PASSWORD` | yes | Unlocks the app. Not your Gmail password. |
| `DATA_DIR` | yes (prod) | Must be on **persistent storage**. Otherwise tokens and send history are lost on every redeploy. |
| `DAILY_SEND_CAP` / `DAILY_CAP_TIMEZONE` | no | Default 20 per day, counted in `UTC` unless you set a time zone. |
| `TRUST_PROXY` | no | Number of reverse proxies in front of the app (typically `1` on a PaaS host). |
| `SENDER_EMAIL` / `SENDER_NAME` | no | Sets the From header. If left empty, Gmail uses the connected account's address. |

---

## Part B: steps that wait until the backend is deployed

The production redirect URI cannot be known until the backend has a public HTTPS address. It is always:

```
<PUBLIC_BASE_URL>/auth/google/callback
```

### 6b. Find and register the exact redirect URI
After deploying with `PUBLIC_BASE_URL` set, get the exact URI in any of these ways:
- the server's startup log line `OAuth redirect URI: …`;
- **Setup details** on the app's Gmail connection card;
- `PUBLIC_BASE_URL=https://<your-backend-host> npm run redirect-uri`.

In Google Cloud, open your Web client (step 5). Under **Authorised redirect URIs**, add that value **exactly**: scheme, host, no trailing slash, same path. Save. Changes can take a few minutes to apply. A mismatch shows `Error 400: redirect_uri_mismatch` on Google's page.

### 8. Connect Gmail and send a safe test
1. Open `PUBLIC_BASE_URL` in your browser and sign in with `APP_ACCESS_PASSWORD`.
2. Click **Connect Gmail**. On Google's page, choose the test-user account. While the app is unverified you will see **"Google hasn't verified this app"**: click **Continue**, which is expected for a private app. Tick **Send email on your behalf** and continue.
3. Back in the app the indicator should read **Gmail connected**. Click **Check connection** to confirm Google accepts the stored authorisation.
4. Create a batch with **one** recipient: an address you own, such as a second mailbox. Review it, tick the confirmation box, and click **Send now**.
5. Watch the status move from Pending to Sending to Sent. **Sent means Gmail accepted the message, not that it was delivered.** Confirm it in your Gmail **Sent** folder and in the recipient's inbox.
6. Only after that, try a small real batch (up to 5).

If a status shows **Uncertain** (for example a timeout or Gmail server error), the app will not resend it automatically. Use **Search Gmail Sent**, then mark it **It was sent** or **It was not sent**. Only a message marked not sent can be retried.

---

## 9. Testing-mode restrictions and verification

- **Test users only.** In *Testing*, only the test users you listed can authorise the app (up to 100).
- **7-day refresh tokens.** For *External* apps in *Testing*, Google expires refresh tokens after **7 days**. When that happens the app shows **Reconnect needed**. Click **Reconnect Gmail** and approve again. No messages are sent while disconnected.
- **Avoiding the weekly reconnect:**
  - use an **Internal** audience (Workspace account in the same organisation), or
  - set the publishing status to **In production** without submitting for verification. Because `gmail.send` is a *sensitive* scope, an unverified production app shows the "unverified app" warning, is capped at 100 users, and is meant for personal use by people you know. That fits a private single-user tool. Full verification (privacy policy, homepage, demo video) is only needed if you open the app to other people.
- **Gmail sending limits still apply** (about 500 recipients per day for consumer Gmail, and lower for new accounts). The app's `DAILY_SEND_CAP` is a stricter, self-imposed limit. If Gmail reports its own limit, the batch stops and the remaining recipients stay Pending.
- **Revoking access:** use **Disconnect** in the app (it revokes the token at Google), or remove the app at <https://myaccount.google.com/permissions>. The app detects revoked access on its next use and asks you to reconnect.
