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

/** Value + unit, or 'Unknown' with the quality reason. Never presents a non-good reading as a value. */
export function readingHTML(r, { digits = 1, unit } = {}) {
  if (r?.error === 'Role not mapped') return '<span class="muted" title="No point supplied for this reading yet">Not mapped</span>';
  if (!isGood(r)) {
    const q = r?.quality ? QUALITY_LABEL[r.quality] : 'Missing';
    return `<span class="v-unknown" title="${esc(r?.error || '')}">Unknown</span> <span class="q-flag">${esc(q)}</span>`;
  }
  const v = typeof r.value === 'number' ? num(r.value, digits) : esc(r.value);
  return `${v}${unit ?? r.unit ? ` <span class="muted">${esc(unit ?? r.unit)}</span>` : ''}`;
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
