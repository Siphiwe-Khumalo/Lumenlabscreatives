/* App shell: sidebar, top bar (site, connection, user & role, clock), banners, hash router. */
import { SITE } from './config/site.js';
import { ROLES } from './config/settings-store.js';
import { icon } from './ui/icons.js';
import { esc, dayLong, timeSec, time, ago } from './util/format.js';
import * as store from './data/store.js';
import { closeDrawer } from './ui/components.js';

import overview from './pages/overview.js';
import environment from './pages/environment.js';
import controls from './pages/controls.js';
import alarms from './pages/alarms.js';
import trends from './pages/trends.js';
import audit from './pages/audit.js';
import settings from './pages/settings.js';
import model from './pages/model.js';
import commissioning from './pages/commissioning.js';

const PAGES = [
  { id: 'controls', label: 'Controls', icon: 'hvac', page: controls },
  { id: 'overview', label: 'Overview', icon: 'overview', page: overview },
  { id: 'model', label: 'Facility Model', icon: 'model', page: model },
  { id: 'environment', label: 'Environmental Conditions', icon: 'environment', page: environment },
  { id: 'alarms', label: 'Alarm Register', icon: 'alarm', page: alarms },
  { id: 'trends', label: 'Trends & Reports', icon: 'trends', page: trends },
  { id: 'audit', label: 'Audit Trail', icon: 'audit', page: audit },
  { id: 'commissioning', label: 'Commissioning', icon: 'checklist', page: commissioning, sepBefore: true },
  { id: 'settings', label: 'Settings', icon: 'settings', page: settings },
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
      <span class="conn-pill checking" data-conn aria-live="polite"><span class="dot"></span><span data-conn-text>Connecting…</span></span>
      <div class="vsep"></div>
      <div class="user-box">
        <span class="user-name" data-user-name title="Signed-in name (change in Settings)"></span>
        <label class="sr-only" for="role-select">Role</label>
        <select class="select" id="role-select" data-role title="Role (no authentication backend: this selector is not security)">
          ${Object.keys(ROLES).map((r) => `<option value="${r}">${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="vsep"></div>
      <div class="clock" aria-label="Current site time"><strong data-time></strong><span data-date></span></div>
      <button class="bell" type="button" data-wall aria-label="Start wall display" title="Wall display">${icon('display')}</button>
      <a class="bell" href="#/alarms" aria-label="Alarm Register" data-bell>${icon('bell')}<span class="badge-count zero" data-bell-count>0</span></a>
    </div>`;
  $('.menu-btn').addEventListener('click', () => setNavOpen(!$('#app').classList.contains('nav-open')));
  $('[data-wall]').addEventListener('click', startWall);
  $('[data-role]').addEventListener('change', (e) => store.setUser({ name: store.state.user.name, role: e.target.value }));
}

/** Keeps every "Updated n s ago" current. */
function tickAges() {
  document.querySelectorAll('[data-age]').forEach((el) => {
    el.textContent = `${el.dataset.prefix || 'Updated'} ${ago(Number(el.dataset.age))}`;
  });
}

function tickClock() {
  const now = Date.now();
  const t = $('[data-time]'), d = $('[data-date]');
  if (t) t.textContent = timeSec(now);
  if (d) d.textContent = `${dayLong(now)} · SAST`;
}

function renderStatus(s) {
  const c = s.connection;
  const pill = $('[data-conn]');
  const demo = s.mode === 'demo';
  const cls = c.status === 'ok' ? (demo ? 'demo' : 'ok') : c.status === 'checking' ? 'checking' : 'lost';
  pill.className = `conn-pill ${cls}`;
  $('[data-conn-text]').textContent = c.status === 'ok' ? (demo ? 'Simulated data' : `JACE connected · ${time(s.lastPollAt)}`)
    : c.status === 'checking' ? 'Connecting…' : c.status === 'not-configured' ? 'JACE not connected' : 'JACE connection lost';
  pill.title = c.message || '';
  $('[data-user-name]').textContent = s.user.name;
  $('[data-role]').value = s.user.role;

  const open = store.activeAlarms();
  const n = open.length;
  const bell = $('[data-bell-count]');
  bell.textContent = n > 99 ? '99+' : String(n);
  bell.classList.toggle('zero', n === 0);
  $('[data-bell]').setAttribute('aria-label', `Alarm Register — ${n} active alarm${n === 1 ? '' : 's'}${demo ? ' (simulated)' : ''}`);
  const navCount = $('[data-nav-count]');
  if (navCount) { navCount.hidden = n === 0; navCount.textContent = n; }

  // Banners: SIMULATED DATA is permanent in demo; connection loss is red and explicit.
  const banners = [];
  if (demo) banners.push(`<div class="banner sim" role="note">${icon('info')}<span><strong>SIMULATED DATA</strong> — every value on this page is generated in the browser for demonstration. It is not from the JACE and must not be used for operational or quality decisions.${s.scenario && s.scenario !== 'normal' ? ` Scenario: ${esc(s.scenario)}.` : ''}</span></div>`);
  if (c.status === 'lost') banners.push(`<div class="banner lost" role="alert">${icon('alarm')}<span><strong>JACE connection lost: readings are not live.</strong> Every value is STALE${c.lastOkAt ? `; last good read at ${esc(timeSec(c.lastOkAt))}` : ''}. ${esc(c.message || '')}</span></div>`);
  if (c.status === 'not-configured') banners.push(`<div class="banner lost" role="alert">${icon('alarm')}<span><strong>Not connected to the JACE: readings are not live.</strong> No gateway URL is configured (Settings → Data source).</span></div>`);
  $('#mode-banner').innerHTML = banners.join('');
}

/* ---- wall display ----------------------------------------------------------- */
const WALL_PAGES = ['controls', 'overview', 'model', 'alarms'];
const WALL_SECONDS = 30;
let wallTimer = null, wallIdx = 0, wallCountdown = null;

function startWall() {
  document.body.classList.add('wall');
  document.documentElement.requestFullscreen?.().catch(() => {});
  let bar = document.getElementById('wall-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'wall-bar';
    bar.className = 'wall-bar';
    document.body.appendChild(bar);
    bar.addEventListener('click', (e) => { if (e.target.closest('[data-wall-exit]')) stopWall(); if (e.target.closest('[data-wall-next]')) wallNext(); });
  }
  wallIdx = Math.max(0, WALL_PAGES.indexOf(parseHash().id));
  location.hash = `#/${WALL_PAGES[wallIdx]}`;
  let left = WALL_SECONDS;
  const paint = () => {
    bar.innerHTML = `<span>${icon('display')} Wall display · ${esc(PAGES.find((p) => p.id === WALL_PAGES[wallIdx]).label)} · next in ${left} s</span>
      <button class="btn sm" type="button" data-wall-next>Next page</button><button class="btn sm" type="button" data-wall-exit>Exit (Esc)</button>`;
  };
  paint();
  clearInterval(wallCountdown);
  wallCountdown = setInterval(() => { left -= 1; if (left <= 0) { wallNext(); left = WALL_SECONDS; } paint(); }, 1000);
  wallTimer = { reset: () => { left = WALL_SECONDS; paint(); } };
}
function wallNext() {
  wallIdx = (wallIdx + 1) % WALL_PAGES.length;
  location.hash = `#/${WALL_PAGES[wallIdx]}`;
  wallTimer?.reset();
}
function stopWall() {
  clearInterval(wallCountdown); wallTimer = null;
  document.body.classList.remove('wall');
  document.getElementById('wall-bar')?.remove();
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

/* ---- router ---------------------------------------------------------------- */
function parseHash() {
  const [path, query = ''] = (location.hash.replace(/^#\/?/, '') || 'controls').split('?');
  return { id: path, params: new URLSearchParams(query) };
}

function route() {
  const { id, params } = parseHash();
  if (id === 'live-readings') return; // in-page anchor on the Controls page
  const entry = PAGES.find((p) => p.id === id);
  if (!entry) { location.replace('#/controls'); return; } // includes the old #/hvac page, merged into Controls
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setNavOpen(false); if (document.body.classList.contains('wall')) stopWall(); } });
  tickClock();
  setInterval(() => { tickClock(); tickAges(); }, 1000);
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
