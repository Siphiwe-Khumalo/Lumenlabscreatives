/* App shell: sidebar, header, mode banner, hash router. */
import { SITE } from './config/site.js';
import { POINT_MAP_STATUS } from './config/points.js';
import { icon } from './ui/icons.js';
import { esc, dayLong, timeSec, dateTime } from './util/format.js';
import * as store from './data/store.js';
import { closeDrawer } from './ui/components.js';

import overview from './pages/overview.js';
import environment from './pages/environment.js';
import hvac from './pages/hvac.js';
import alarms from './pages/alarms.js';
import trends from './pages/trends.js';
import audit from './pages/audit.js';
import settings from './pages/settings.js';

const PAGES = [
  { id: 'overview', label: 'Overview', icon: 'overview', page: overview },
  { id: 'environment', label: 'Environmental Conditions', icon: 'environment', page: environment },
  { id: 'hvac', label: 'HVAC Systems', icon: 'hvac', page: hvac },
  { id: 'alarms', label: 'Alarm Register', icon: 'alarm', page: alarms },
  { id: 'trends', label: 'Trends & Reports', icon: 'trends', page: trends },
  { id: 'audit', label: 'Audit Trail', icon: 'audit', page: audit },
  { id: 'settings', label: 'Settings', icon: 'settings', page: settings, sepBefore: true },
];

const $ = (sel) => document.querySelector(sel);
let current = null; // { id, instance }

/* ---- sidebar --------------------------------------------------------------- */
function renderNav() {
  $('#nav').innerHTML = PAGES.map((p) => `${p.sepBefore ? '<div class="nav-sep"></div>' : ''}
    <a href="#/${p.id}" data-page="${p.id}">${icon(p.icon)}<span>${esc(p.label)}</span>${p.id === 'alarms' ? '<span class="count" data-nav-count hidden></span>' : ''}</a>`).join('');
}

function setNavOpen(open) {
  $('#app').classList.toggle('nav-open', open);
  $('#scrim').hidden = !open;
  $('.menu-btn')?.setAttribute('aria-expanded', String(open));
}

/* ---- header ---------------------------------------------------------------- */
function renderTopbar() {
  $('#topbar').innerHTML = `
    <button class="btn ghost icon-btn menu-btn" type="button" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>
    <div class="facility"><strong>${esc(SITE.name)}</strong><span>${esc(SITE.subtitle)} · ${esc(SITE.location)}</span></div>
    <div class="topbar-right">
      <div class="conn" aria-live="polite">
        <div class="conn-row"><span class="lbl">Monitoring service</span><span data-svc></span></div>
        <div class="conn-row"><span class="lbl">Connection</span><span data-conn></span></div>
      </div>
      <div class="vsep"></div>
      <div class="clock" aria-label="Current site time"><strong data-time></strong><span data-date></span></div>
      <a class="bell" href="#/alarms" aria-label="Alarm Register" data-bell>${icon('bell')}<span class="badge-count zero" data-bell-count>0</span></a>
    </div>`;
  $('.menu-btn').addEventListener('click', () => setNavOpen(!$('#app').classList.contains('nav-open')));
}

function tickClock() {
  const now = Date.now();
  const t = $('[data-time]'), d = $('[data-date]');
  if (t) t.textContent = timeSec(now);
  if (d) d.textContent = `${dayLong(now)} · SAST`;
}

function renderStatus(s) {
  const svc = $('[data-svc]'), conn = $('[data-conn]');
  const chip = (dot, text) => `<span class="dot ${dot}"></span> ${esc(text)}`;
  if (s.mode === 'demo') {
    svc.innerHTML = chip('warn', 'Simulated (demo)');
    conn.innerHTML = chip('unk', 'Not connected — demo data');
  } else if (s.mode === 'connected') {
    svc.innerHTML = chip('ok', 'Gateway healthy');
    conn.innerHTML = chip('ok', `Connected · ${s.gateway.checkedAt ? timeSec(s.gateway.checkedAt) : ''}`);
  } else if (s.mode === 'offline') {
    svc.innerHTML = chip('unk', 'Unavailable');
    conn.innerHTML = chip('crit', s.gateway.configured ? 'Offline — gateway unreachable' : 'Offline — not configured');
  } else {
    svc.innerHTML = chip('unk', 'Starting…');
    conn.innerHTML = chip('unk', 'Checking…');
  }

  const open = store.activeAlarms();
  const n = open.length;
  const bell = $('[data-bell-count]');
  bell.textContent = n > 99 ? '99+' : String(n);
  bell.classList.toggle('zero', n === 0);
  $('[data-bell]').setAttribute('aria-label', `Alarm Register — ${n} active alarm${n === 1 ? '' : 's'}${s.mode === 'demo' ? ' (demonstration data)' : ''}`);
  const navCount = $('[data-nav-count]');
  if (navCount) { navCount.hidden = n === 0; navCount.textContent = n; }

  const banner = $('#mode-banner');
  if (s.mode === 'demo') {
    banner.innerHTML = `<div class="mode-banner" role="note">${icon('info')}<div><strong>DEMONSTRATION MODE</strong> — All values shown are illustrative placeholders generated in this browser. They are not site telemetry and must not be used for operational or quality decisions.</div></div>`;
  } else if (s.mode === 'offline') {
    banner.innerHTML = `<div class="mode-banner offline" role="status">${icon('alarm')}<div><strong>OFFLINE</strong> — No live site data. ${esc(s.gateway.message)} All readings are shown as Unknown.</div></div>`;
  } else if (s.mode === 'connected') {
    banner.innerHTML = `<div class="mode-banner connected" role="status">${icon('check')}<div><strong>CONNECTED</strong> — Gateway health check succeeded at ${esc(dateTime(s.gateway.checkedAt))}. Point mapping: ${esc(POINT_MAP_STATUS.label)}.</div></div>`;
  } else {
    banner.innerHTML = `<div class="mode-banner offline" role="status">${icon('refresh')}<div><strong>STARTING</strong> — ${esc(s.gateway.message || 'Initialising data source…')}</div></div>`;
  }
}

/* ---- router ---------------------------------------------------------------- */
function parseHash() {
  const [path, query = ''] = (location.hash.replace(/^#\/?/, '') || 'overview').split('?');
  return { id: path, params: new URLSearchParams(query) };
}

function route() {
  const { id, params } = parseHash();
  const entry = PAGES.find((p) => p.id === id);
  if (!entry) { location.replace('#/overview'); return; }
  closeDrawer();
  setNavOpen(false);
  document.querySelectorAll('#nav a').forEach((a) => (a.dataset.page === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (current?.id === id) { current.instance.onParams?.(params); return; }
  current?.instance.destroy?.();
  const main = $('#main');
  main.innerHTML = '';
  const instance = entry.page.mount(main, { params, state: store.state });
  current = { id, instance };
  document.title = `${entry.label} — ${SITE.name}`;
  if (!store.state.loading) instance.update?.(store.state);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/* ---- boot ------------------------------------------------------------------ */
function boot() {
  renderNav();
  renderTopbar();
  $('#scrim').addEventListener('click', () => setNavOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNavOpen(false); });
  tickClock();
  setInterval(tickClock, 1000);
  store.subscribe((s) => {
    renderStatus(s);
    current?.instance.update?.(s);
  });
  renderStatus(store.state);
  window.addEventListener('hashchange', route);
  route();
  store.start();
}

// Classic vendor scripts are `defer`red; module scripts run after them, so window.L / window.Chart are ready.
boot();

export { PAGES };
