'use strict';
// Lumen Outreach front end. Holds no secrets: OAuth tokens and the client
// secret live only on the server. All user text is rendered with textContent.

const MAX_ROWS = 5;
const $ = (sel) => document.querySelector(sel);
let csrfToken = null;
let draftKey = newKey();
let pollTimer = null;

function newKey() {
  return crypto.randomUUID().replace(/-/g, '');
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function flash(message, kind = 'info') {
  const f = $('#flash');
  f.textContent = message;
  f.dataset.kind = kind;
  f.hidden = !message;
  if (message) f.scrollIntoView({ block: 'nearest' });
}

class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error;
    this.details = body?.details;
  }
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') showLogin();
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ---- OAuth return messages (fixed set; never reflect raw query text) ----
const GMAIL_ERRORS = {
  access_denied: 'Gmail connection cancelled: permission was not granted.',
  scope_not_granted: 'Gmail connection failed: the "send email on your behalf" permission was not ticked. Try again and allow it.',
  state_mismatch: 'Gmail connection failed a security check (state mismatch). Start again from Connect Gmail.',
  state_expired: 'The Gmail connection attempt expired. Start again from Connect Gmail.',
  missing_code: 'Google did not return an authorisation code. Try again.',
  exchange_failed: 'Google rejected the authorisation exchange. Check the client ID, secret and redirect URI, then try again.',
  no_refresh_token: 'Google did not issue long-lived access. Remove the app at myaccount.google.com/permissions and connect again.',
  not_configured: 'The server has no Google OAuth client configured yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
  google_error: 'Google reported an error during authorisation. Try again.',
  internal: 'Something went wrong on the server. Try again.',
};

function consumeQueryMessages() {
  const q = new URLSearchParams(location.search);
  if (q.get('gmail') === 'connected') flash('Gmail connected. You can now send batches.', 'ok');
  else if (q.has('gmail_error')) flash(GMAIL_ERRORS[q.get('gmail_error')] || GMAIL_ERRORS.google_error, 'error');
  else if (q.get('login') === 'required') flash('Please sign in first.', 'error');
  if (q.toString()) history.replaceState(null, '', location.pathname);
}

// ---- session ----
function showLogin() {
  $('#login-view').hidden = false;
  $('#app-view').hidden = true;
  $('#logout').hidden = true;
  setStatusPill('unknown', 'Signed out');
  clearInterval(pollTimer);
}

async function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#logout').hidden = false;
  await Promise.all([loadStatus(), loadBatches()]);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  try {
    const data = await api('/login', { method: 'POST', body: { password: form.password.value } });
    csrfToken = data.csrfToken;
    form.reset();
    flash('');
    await showApp();
  } catch (err) {
    flash(err.message, 'error');
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  csrfToken = null;
  showLogin();
});

// ---- Gmail status ----
function setStatusPill(state, label) {
  const pill = $('#gmail-status');
  pill.dataset.state = state;
  pill.querySelector('.label').textContent = label;
}

let gmailConnected = false;
async function loadStatus(verify = false) {
  const s = await api(`/gmail/status${verify ? '?verify=1' : ''}`);
  gmailConnected = s.connected;
  $('#scope').textContent = s.scope;
  $('#redirect-uri').textContent = s.redirectUri;
  renderQuota(s.quota);

  const text = $('#connection-text');
  const connect = $('#connect-gmail');
  if (!s.configured) {
    setStatusPill('not_configured', 'Gmail not configured');
    text.textContent = 'The server has no Google OAuth client yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the backend (see GOOGLE_OAUTH_SETUP.md).';
    connect.hidden = true;
  } else if (s.connected) {
    setStatusPill('connected', 'Gmail connected');
    const who = s.senderEmail ? ` as ${s.senderEmail}` : '';
    text.textContent = `Connected${who} since ${new Date(s.connectedAt).toLocaleString()}. Permission: send email only.`;
    connect.hidden = false;
    connect.textContent = 'Reconnect Gmail';
  } else if (s.state === 'reauth_required') {
    setStatusPill('reauth_required', 'Reconnect needed');
    text.textContent = s.lastError || 'Gmail access was revoked or expired. Reconnect to continue sending.';
    connect.hidden = false;
    connect.textContent = 'Reconnect Gmail';
  } else {
    setStatusPill('disconnected', 'Gmail not connected');
    text.textContent = 'Connect your Gmail account to send. You will approve on Google\'s own page; this app never sees your Gmail password.';
    connect.hidden = false;
    connect.textContent = 'Connect Gmail';
  }
  $('#verify-gmail').hidden = !s.connected;
  $('#disconnect-gmail').hidden = !s.connected;

  if (s.verify) {
    if (s.verify.ok) flash('Gmail connection is working.', 'ok');
    else flash(s.verify.message, 'error');
  }
}

function renderQuota(q) {
  if (q) $('#quota').textContent = `Today: ${q.used} of ${q.cap} sent (${q.timezone})`;
}

$('#verify-gmail').addEventListener('click', () => loadStatus(true).catch((e) => flash(e.message, 'error')));
$('#disconnect-gmail').addEventListener('click', async () => {
  if (!confirm('Disconnect Gmail? The stored authorisation will be revoked at Google and deleted from the server.')) return;
  try {
    await api('/gmail/disconnect', { method: 'POST' });
    flash('Gmail disconnected.', 'ok');
    await loadStatus();
  } catch (e) {
    flash(e.message, 'error');
  }
});

// ---- composer ----
function addRow(values = {}) {
  const rows = $('#rows');
  if (rows.children.length >= MAX_ROWS) return;
  const node = $('#row-template').content.firstElementChild.cloneNode(true);
  for (const [k, v] of Object.entries(values)) node.querySelector(`[name="${k}"]`).value = v;
  node.querySelector('.remove-row').addEventListener('click', () => {
    node.remove();
    renumber();
  });
  node.addEventListener('input', () => (draftKey = newKey()));
  rows.append(node);
  renumber();
}

function renumber() {
  const rows = [...$('#rows').children];
  rows.forEach((r, i) => {
    r.querySelector('.n').textContent = i + 1;
    r.querySelector('.remove-row').hidden = rows.length === 1;
  });
  $('#add-row').disabled = rows.length >= MAX_ROWS;
}

function readRows() {
  return [...$('#rows').children].map((r) => ({
    name: r.querySelector('[name=name]').value,
    email: r.querySelector('[name=email]').value,
    subject: r.querySelector('[name=subject]').value,
    body: r.querySelector('[name=body]').value,
  }));
}

function resetComposer() {
  $('#rows').replaceChildren();
  addRow();
  draftKey = newKey();
}

$('#add-row').addEventListener('click', () => addRow());
$('#copy-first').addEventListener('click', () => {
  const rows = [...$('#rows').children];
  if (rows.length < 2) return;
  const subject = rows[0].querySelector('[name=subject]').value;
  const body = rows[0].querySelector('[name=body]').value;
  for (const r of rows.slice(1)) {
    r.querySelector('[name=subject]').value = subject;
    r.querySelector('[name=body]').value = body;
  }
  draftKey = newKey();
});

function showComposeErrors(list) {
  const ul = $('#compose-errors');
  ul.replaceChildren(...(list || []).map((t) => el('li', { text: t })));
  ul.hidden = !list?.length;
}

$('#compose-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showComposeErrors([]);
  if (!gmailConnected) return flash('Connect Gmail before creating a batch.', 'error');
  const recipients = readRows();
  try {
    let data;
    try {
      data = await api('/batches', { method: 'POST', body: { recipients }, headers: { 'Idempotency-Key': draftKey } });
    } catch (err) {
      if (err.code !== 'possible_duplicate') throw err;
      const lines = err.details.map((d) => `• ${d.email} (${d.status})`).join('\n');
      if (!confirm(`An identical message already exists for:\n${lines}\n\nCreate this batch anyway?`)) return;
      data = await api('/batches', { method: 'POST', body: { recipients, allowRepeat: true }, headers: { 'Idempotency-Key': draftKey } });
    }
    openConfirm(data.batch, { fromComposer: true });
  } catch (err) {
    if (err.details && Array.isArray(err.details)) showComposeErrors(err.details.map((d) => (typeof d === 'string' ? d : d.email)));
    flash(err.message, 'error');
  }
});

// ---- confirmation ----
let confirming = null;
function openConfirm(batch, { fromComposer = false } = {}) {
  const pending = batch.recipients.filter((r) => r.status === 'Pending');
  confirming = { batch, fromComposer };
  $('#confirm-count').textContent = `${pending.length} separate email${pending.length === 1 ? '' : 's'}`;
  $('#confirm-list').replaceChildren(
    ...pending.map((r) =>
      el('li', {}, el('div', {}, el('strong', { text: r.name ? `${r.name} <${r.email}>` : r.email })), el('div', { text: `Subject: ${r.subject}` }), el('pre', { text: r.body })),
    ),
  );
  $('#confirm-check').checked = false;
  $('#confirm-send').disabled = true;
  $('#confirm-dialog').showModal();
}

$('#confirm-check').addEventListener('change', (e) => ($('#confirm-send').disabled = !e.target.checked));

$('#confirm-dialog').addEventListener('close', async () => {
  const dialog = $('#confirm-dialog');
  const ctx = confirming;
  confirming = null;
  if (!ctx) return;
  if (dialog.returnValue !== 'send' || !$('#confirm-check').checked) {
    // Discard the unsent draft batch so it never blocks duplicate checks.
    if (ctx.fromComposer) {
      await api(`/batches/${ctx.batch.id}/cancel`, { method: 'POST' }).catch(() => {});
      draftKey = newKey();
    }
    return;
  }
  await sendBatch(ctx.batch, ctx.fromComposer);
});

async function sendBatch(batch, fromComposer) {
  try {
    await api(`/batches/${batch.id}/send`, { method: 'POST', body: { confirm: true, confirmHash: batch.contentHash } });
    if (fromComposer) resetComposer();
    flash('Sending started. Each recipient\'s status updates below.', 'ok');
  } catch (err) {
    if (err.status === undefined || err.status >= 500) {
      // Network failure or server error: the server never sends a recipient
      // twice, so re-checking the batch is always safe.
      flash('Could not confirm the send request reached the server. Showing the batch\'s current state; press Send again only if recipients are still Pending.', 'error');
    } else {
      flash(err.message, 'error');
    }
  }
  await loadBatches();
}

// ---- batch list ----
async function loadBatches() {
  const { batches, quota } = await api('/batches');
  renderQuota(quota);
  const host = $('#batches');
  if (!batches.length) {
    host.replaceChildren(el('p', { class: 'muted', text: 'No batches yet.' }));
  } else {
    host.replaceChildren(...batches.map(renderBatch));
  }
  const active = batches.some((b) => b.running || b.recipients.some((r) => r.status === 'Sending'));
  clearTimeout(pollTimer);
  if (active) pollTimer = setTimeout(() => loadBatches().catch(() => {}), 1500);
}

function sentFolderSearch(r) {
  const q = `in:sent to:${r.email} subject:"${r.subject.replace(/"/g, '')}"`;
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
}

async function act(path, body) {
  try {
    const { batch } = await api(path, { method: 'POST', body });
    await loadBatches();
    return batch;
  } catch (e) {
    flash(e.message, 'error');
    return null;
  }
}

function renderBatch(b) {
  const c = b.counts;
  const summary = Object.entries(c).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(' · ');
  const pending = c.Pending > 0;
  const rows = b.recipients.map((r) => {
    const actions = el('div', { class: 'row-actions' });
    if (r.status === 'Uncertain') {
      actions.append(
        el('a', { class: 'button', href: sentFolderSearch(r), target: '_blank', rel: 'noopener noreferrer', text: 'Search Gmail Sent' }),
        el('button', { text: 'It was sent', onclick: () => act(`/batches/${b.id}/recipients/${r.id}/reconcile`, { outcome: 'sent' }) }),
        el('button', {
          text: 'It was not sent',
          onclick: () => {
            if (confirm(`Only choose this if the message to ${r.email} is definitely NOT in your Gmail Sent folder.`)) act(`/batches/${b.id}/recipients/${r.id}/reconcile`, { outcome: 'not_sent' });
          },
        }),
      );
    }
    if (r.retryable) {
      actions.append(
        el('button', {
          text: 'Retry',
          onclick: async () => {
            const batch = await act(`/batches/${b.id}/recipients/${r.id}/retry`);
            if (batch) openConfirm(batch);
          },
        }),
      );
    }
    const detail = r.status === 'Sent'
      ? r.reconciled ? 'Marked sent by you after checking Gmail.' : 'Accepted by Gmail. Delivery is not confirmed.'
      : r.error;
    return el(
      'tr',
      {},
      el('td', {}, el('div', { text: r.name || '' }), el('div', { class: 'muted small', text: r.email })),
      el('td', { text: r.subject }),
      el('td', {}, el('span', { class: 'badge', 'data-s': r.status, text: r.status }), detail ? el('div', { class: 'row-error', text: detail }) : null, actions.children.length ? actions : null),
    );
  });

  return el(
    'div',
    { class: 'batch' },
    el('div', { class: 'batch-head' }, el('span', { text: new Date(b.createdAt).toLocaleString() }), el('span', { text: summary }), b.running ? el('span', { text: 'Sending…' }) : null),
    b.notice ? el('div', { class: 'notice', text: b.notice }) : null,
    el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Recipient' }), el('th', { text: 'Subject' }), el('th', { text: 'Status' }))), el('tbody', {}, ...rows))),
    pending && !b.running && b.confirmedAt ? el('div', { class: 'actions' }, el('button', { text: 'Send remaining Pending…', onclick: () => openConfirm(b) })) : null,
  );
}

$('#refresh-batches').addEventListener('click', () => loadBatches().catch((e) => flash(e.message, 'error')));

// ---- boot ----
(async function init() {
  consumeQueryMessages();
  resetComposer();
  try {
    const s = await api('/session');
    if (s.authenticated) {
      csrfToken = s.csrfToken;
      await showApp();
    } else {
      showLogin();
    }
  } catch (e) {
    flash(e.message, 'error');
    showLogin();
  }
})();
