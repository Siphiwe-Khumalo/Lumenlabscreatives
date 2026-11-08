import { icon } from './icons.js';
import { esc, num, dateTime, ago } from '../util/format.js';
import { STATUS_LABEL, QUALITY_LABEL, isGood } from '../data/quality.js';

const STATUS_ICON = { normal: 'check', warning: 'alarm', critical: 'alarm', unknown: 'info' };

/** Status chip: icon + label, never colour alone. */
export function statusChip(status, label) {
  const s = STATUS_LABEL[status] ? status : 'unknown';
  return `<span class="status-chip st-${s}">${icon(STATUS_ICON[s])}${esc(label || STATUS_LABEL[s])}</span>`;
}

export const SEVERITY_LABEL = { critical: 'Critical', warning: 'Warning', info: 'Information' };
export function severityChip(sev) {
  const map = { critical: 'critical', warning: 'warning', info: 'info' };
  return `<span class="status-chip st-${map[sev] || 'unknown'}">${icon(sev === 'info' ? 'info' : 'alarm')}${esc(SEVERITY_LABEL[sev] || sev)}</span>`;
}

export const ACK_LABEL = { active: 'Unacknowledged', acknowledged: 'Acknowledged', cleared: 'Cleared' };
export function ackChip(status) {
  const cls = status === 'active' ? 'st-critical' : status === 'acknowledged' ? 'st-warning' : 'st-neutral';
  return `<span class="status-chip ${cls}">${esc(ACK_LABEL[status] || status)}</span>`;
}

const fmtValue = (v, digits) => (typeof v === 'number' ? num(v, digits) : typeof v === 'boolean' ? (v ? 'On' : 'Off') : esc(v));

/** Quality chip (grey for anything not LIVE). */
export function qualityChip(q) {
  return `<span class="q-chip q-${esc(q || 'not-mapped')}">${q === 'live' ? '<i class="q-dot"></i>' : ''}${esc(QUALITY_LABEL[q] || 'NOT MAPPED')}</span>`;
}

/** "last good: 5.2 °C at 14:32" (small) — only ever shown next to a non-live state. */
export function lastGoodHTML(r, digits = 1) {
  const lg = r?.lastGood;
  if (!lg || lg.value == null) return '';
  return `<span class="last-good">last good: ${fmtValue(lg.value, digits)}${r.unit ? ` ${esc(r.unit)}` : ''} at ${esc(dateTime(lg.ts).slice(11, 16))}</span>`;
}

/**
 * Inline reading. LIVE: value + unit. Anything else: em dash + grey state label
 * (+ small last-good when asked). A non-live value is never shown as current.
 */
export function readingHTML(r, { digits = 1, unit, lastGood = false } = {}) {
  if (!isGood(r)) {
    const q = r?.quality || 'not-mapped';
    return `<span class="v-none" title="${esc(r?.error || QUALITY_LABEL[q])}">—</span> <span class="q-label">${esc(QUALITY_LABEL[q] || 'NOT MAPPED')}</span>${lastGood ? ' ' + lastGoodHTML(r, digits) : ''}`;
  }
  const u = unit ?? r.unit;
  return `<span class="v-live">${fmtValue(r.value, digits)}</span>${u ? ` <span class="v-unit">${esc(u)}</span>` : ''}`;
}

/**
 * Large reading for cards: 32–40 px mono value with small muted unit when LIVE;
 * otherwise an em dash, the grey state label and the small last-good line.
 */
export function bigReadingHTML(r, { label, digits = 1, unit, cls = '' } = {}) {
  const u = unit ?? r?.unit;
  const head = label ? `<span class="label-caps">${esc(label)}</span>` : '';
  if (!isGood(r)) {
    const q = r?.quality || 'not-mapped';
    return `<div class="big-reading ${cls} is-${esc(q)}">${head}<div class="big-v"><span class="v-none">—</span></div>
      <div class="big-meta">${qualityChip(q)}${lastGoodHTML(r, digits)}</div></div>`;
  }
  return `<div class="big-reading ${cls}">${head}<div class="big-v"><span class="v-live">${fmtValue(r.value, digits)}</span>${u ? `<span class="v-unit">${esc(u)}</span>` : ''}</div>
    <div class="big-meta">${ageHTML(r.ts)}${r.override ? ` <span class="ovr">${icon('alarm')}Overridden by ${esc(r.override.source)}</span>` : ''}</div></div>`;
}

/** "Updated 3 s ago" — kept live by the shell ticker (data-age). */
export function ageHTML(ts, prefix = 'Updated') {
  if (ts == null) return '<span class="age muted">No update yet</span>';
  return `<span class="age" data-age="${ts}" data-prefix="${esc(prefix)}" title="${esc(dateTime(ts))} SAST">${esc(prefix)} ${esc(ago(ts))}</span>`;
}

export const RUN_LABEL = { running: 'RUNNING', stopped: 'STOPPED', fault: 'FAULT', unknown: 'UNKNOWN' };
const RUN_ICON = { running: 'check', stopped: 'dot', fault: 'alarm', unknown: 'info' };
export function runChip(state) {
  const s = RUN_LABEL[state] ? state : 'unknown';
  return `<span class="run-chip run-${s}">${icon(RUN_ICON[s])}${RUN_LABEL[s]}</span>`;
}

/**
 * Fan graphic: a ducted fan with curved blades. It spins only when the fan point is LIVE and ON;
 * the glow ring follows the mode (cooling blue, heating orange, fan only teal). Still when off,
 * faded with a "?" when the state is unknown.
 */
const BLADE = 'M32 32C33.5 24.5 38 18.5 45.5 15.5C47.8 14.6 49.6 16.4 48.9 18.7C46.4 26.2 40.4 30.6 32 32Z';
export function fanHTML(e, { size = 56 } = {}) {
  const fan = e.readings.fanStatus;
  const known = isGood(fan);
  const on = known && fan.value === true;
  const mode = e.mode === 'cooling' ? 'cool' : e.mode === 'heating' ? 'heat' : 'fan';
  const label = !known ? 'Fan state unknown' : on ? `Fan running${e.mode !== 'unknown' ? ', ' + e.mode : ''}` : 'Fan off';
  const blades = [0, 72, 144, 216, 288].map((r) => `<path d="${BLADE}" transform="rotate(${r} 32 32)"/>`).join('');
  return `<span class="fan ${on ? `on ${mode}` : known ? 'off' : 'unknown'}" style="--fan-size:${size}px" role="img" aria-label="${esc(label)}" title="${esc(label)}">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="fanHousing" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D5DDE8"/></radialGradient>
        <radialGradient id="fanWell" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#1D3557"/><stop offset="1" stop-color="#0A1628"/></radialGradient>
        <linearGradient id="fanBlade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F8FC"/><stop offset="1" stop-color="#9FB3CC"/></linearGradient>
        <radialGradient id="fanHub" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#8FA3BD"/></radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#fanHousing)" stroke="#C4CEDB"/>
      <circle class="fan-glow" cx="32" cy="32" r="26.5" fill="none" stroke-width="2.5"/>
      <circle cx="32" cy="32" r="24.5" fill="url(#fanWell)"/>
      <g class="blades" fill="url(#fanBlade)">${blades}</g>
      <g class="guard" fill="none" stroke="#FFFFFF" stroke-opacity=".14" stroke-width=".8"><circle cx="32" cy="32" r="10"/><circle cx="32" cy="32" r="17"/><path d="M32 7.5V56.5M7.5 32H56.5"/></g>
      <circle cx="32" cy="32" r="5.2" fill="url(#fanHub)" stroke="#6F84A0" stroke-width=".6"/>
      <circle cx="30.4" cy="30.4" r="1.4" fill="#FFFFFF" opacity=".8"/>
    </svg>${!known ? '<b class="fan-q">?</b>' : ''}</span>`;
}

/** Unit photo (HVAC units) with the live fan as a badge: the photo shows what the unit is, the fan shows its state. */
export function unitPhotoHTML(e, { size = 'sm' } = {}) {
  // Hybrid: outdoor unit photo (with its background, cropped to fill). Rooftop: packaged unit on white.
  const img = e.type === 'hybrid'
    ? '<img class="photo-fill" src="assets/hybrid-unit.jpg" alt="" loading="lazy" width="588" height="459">'
    : '<img src="assets/hvac-unit.jpg" alt="" loading="lazy" width="523" height="382">';
  return `<span class="unit-photo ${size} ${e.type}">${img}${fanHTML(e, { size: size === 'lg' ? 52 : 34 })}</span>`;
}

/**
 * Facility hero banner (building photo on the right, fading into navy). `facts` is a list of
 * { label, value, tone } shown as chips; tone: ok | warn | bad | demo | ''.
 */
export function heroHTML({ title, subtitle, facts = [] }) {
  return `<section class="hero" aria-label="${esc(title)}">
    <div class="hero-photo" aria-hidden="true"><img src="assets/facility.jpg" alt="" width="580" height="573"></div>
    <div class="hero-text">
      <span class="hero-kicker">Mpumalanga · Facility Environmental Monitoring</span>
      <h2 class="hero-title">${esc(title)}</h2>
      ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      <div class="hero-facts">${facts.map((f) => `<span class="hero-fact ${f.tone || ''}"><b>${f.value}</b>${esc(f.label)}</span>`).join('')}</div>
    </div>
  </section>`;
}

export function tsHTML(ts) {
  if (ts == null) return '<span class="muted">No timestamp</span>';
  return `<span title="${esc(dateTime(ts))} SAST">${esc(dateTime(ts).slice(11, 19))}<span class="sub">${esc(ago(ts))}</span></span>`;
}

export function stateBox(kind, title, message = '', extra = '') {
  const ic = kind === 'loading' ? '<div class="spinner" aria-hidden="true"></div>' : icon(kind === 'error' ? 'alarm' : 'info');
  return `<div class="state ${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${ic}<strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ''}${extra}</div>`;
}

/* ---- sortable table -------------------------------------------------------- */
/** columns: [{ key, label, sort?: row=>value, render: row=>html, num?, sortable? }] */
export function createTable({ columns, rowKey, onRowClick, empty = 'No records match the current filters.', initialSort, caption }) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  let rows = [];
  let sort = initialSort || null; // { key, dir: 'asc'|'desc' }
  let selected = null;

  function sorted() {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sort || ((r) => r[col.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls / unknowns last
      if (vb == null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir;
    });
  }

  function render() {
    const list = sorted();
    const head = columns.map((c) => {
      const aria = sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      const inner = c.sortable === false ? esc(c.label) : `<button type="button" class="sort-btn" data-sort="${c.key}">${esc(c.label)}${icon(sort?.key === c.key ? (sort.dir === 'asc' ? 'up' : 'down') : 'sort')}</button>`;
      return `<th scope="col" class="${c.num ? 'num' : ''}" ${c.sortable === false ? '' : `aria-sort="${aria}"`}>${inner}</th>`;
    }).join('');
    const body = list.length
      ? list.map((r) => `<tr data-key="${esc(rowKey(r))}" class="${onRowClick ? 'clickable' : ''} ${selected === rowKey(r) ? 'selected' : ''}" ${onRowClick ? 'tabindex="0"' : ''}>${columns.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length}">${stateBox('empty', empty)}</td></tr>`;
    wrap.innerHTML = `<table class="data">${caption ? `<caption class="sr-only">${esc(caption)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.sort-btn');
    if (btn) {
      const key = btn.dataset.sort;
      sort = sort?.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
      render();
      wrap.querySelector(`.sort-btn[data-sort="${key}"]`)?.focus();
      return;
    }
    const tr = e.target.closest('tr[data-key]');
    if (tr && onRowClick && !e.target.closest('a,button')) { selected = tr.dataset.key; onRowClick(tr.dataset.key); render(); }
  });
  wrap.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-key]');
    if (tr && onRowClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selected = tr.dataset.key; onRowClick(tr.dataset.key); render(); }
  });

  return {
    el: wrap,
    setRows(next) { rows = next; render(); },
    setSelected(key) { selected = key; render(); },
    get count() { return rows.length; },
  };
}

/* ---- drawer ---------------------------------------------------------------- */
let lastFocus = null;
export function openDrawer({ title, subtitle = '', body, foot = '', onClose }) {
  const root = document.getElementById('drawer-root');
  lastFocus = document.activeElement;
  root.innerHTML = `<div class="drawer-scrim" data-close></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div class="drawer-head"><div><h2 id="drawer-title">${esc(title)}</h2>${subtitle ? `<div class="muted small">${subtitle}</div>` : ''}</div>
        <button class="btn ghost icon-btn close" type="button" data-close aria-label="Close details">${icon('close')}</button></div>
      <div class="drawer-body">${body}</div>
      ${foot ? `<div class="drawer-foot">${foot}</div>` : ''}
    </aside>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); onClose?.(); lastFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  root.querySelector('.drawer .close').focus();
  return { el: root.querySelector('.drawer'), close };
}
export function closeDrawer() { const root = document.getElementById('drawer-root'); if (root.innerHTML) root.querySelector('[data-close]')?.click(); }

export function toast(message, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/** Banner text for demo-only items. */
export const DEMO_TAG = '<span class="tag demo">Demonstration data</span>';

/* ---- toggle switch --------------------------------------------------------- */
/** On/off switch. When `disabled`, shows a lock and the reason (as visible text and tooltip). */
export function toggleHTML({ id, on, disabled, reason, pending, label }) {
  const state = on == null ? 'unknown' : on ? 'on' : 'off';
  return `<div class="toggle-wrap">
    <button type="button" class="toggle ${state}" role="switch" aria-checked="${on === true}" data-toggle="${esc(id)}"
      ${disabled ? 'disabled' : ''} aria-label="${esc(label)}" title="${esc(disabled ? reason : label)}"><span class="knob"></span></button>
    <span class="toggle-text">${pending ? '<span class="q-flag">Pending confirmation…</span>' : on == null ? 'Unknown' : on ? 'On' : 'Off'}${disabled ? ` ${icon('lock', 'lock-ico')}` : ''}</span>
  </div>`;
}

/* ---- confirmation dialog ---------------------------------------------------- */
/** In-page confirmation (browser confirm() is not used). Resolves { ok, note }. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, withNote = false }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'modal-root';
    root.innerHTML = `<div class="drawer-scrim" data-x></div>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-msg">
        <h2 id="modal-title">${esc(title)}</h2>
        <p id="modal-msg">${esc(message)}</p>
        ${withNote ? '<label class="field"><span>Reason (recorded in the Audit Trail)</span><textarea class="input" id="modal-note" maxlength="200"></textarea></label>' : ''}
        <div class="toolbar" style="justify-content:flex-end">
          <button class="btn" type="button" data-x>Cancel</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-ok>${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    const done = (ok) => { const note = root.querySelector('#modal-note')?.value.trim() || ''; root.remove(); document.removeEventListener('keydown', onKey); resolve({ ok, note }); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    root.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => done(false)));
    root.querySelector('[data-ok]').addEventListener('click', () => done(true));
    root.querySelector('[data-x].btn').focus();
  });
}
