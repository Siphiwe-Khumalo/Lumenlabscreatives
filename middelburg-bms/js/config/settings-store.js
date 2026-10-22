/* Browser-local overrides (this browser only). Never authoritative. */
import { APP_CONFIG } from './app-config.js';
import { DEFAULT_THRESHOLDS } from './thresholds.js';
import { readJSON, writeJSON, remove } from '../util/storage.js';

const KEY = 'mbms.settings.v1';

function load() { return readJSON(KEY, {}) || {}; }

/** 'demo' only when the DEMO flag is explicitly on (config, hosted page, or this browser's Settings). */
export function getMode() {
  if (typeof window !== 'undefined' && window.MBMS_DEMO === true) return 'demo';
  if (APP_CONFIG.demo) return 'demo';
  return load().mode === 'demo' ? 'demo' : 'connected';
}

/** Demo scenarios (DEMO flag only). URL ?scenario=... overrides for testing. */
export const DEMO_SCENARIOS = {
  normal: 'Typical day (one sensor outage in history, one unit offline, one fan stopped)',
  'all-live': 'All sensors live, all units running',
  'comms-lost': 'JACE connection lost',
  'no-confirm': 'Controller ignores commands (feedback never confirms)',
};
export function getDemoScenario() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('scenario') : null;
  const v = q || load().scenario;
  return v in DEMO_SCENARIOS ? v : 'normal';
}
export function saveDemoScenario(v) { const s = load(); s.scenario = v; return writeJSON(KEY, s); }

/** Signed-in user (no authentication backend: the role selector is a convenience, not security). */
export const ROLES = {
  viewer: 'Viewer — read only',
  operator: 'Operator — can operate unit controls',
  admin: 'Admin — controls and settings',
};
export function getUser() {
  const u = load().user || {};
  return { name: typeof u.name === 'string' && u.name.trim() ? u.name.trim() : 'Operator', role: u.role in ROLES ? u.role : 'operator' };
}
export function saveUser(user) { const s = load(); s.user = { name: user.name, role: user.role }; return writeJSON(KEY, s); }

export function getGatewayUrl() {
  const v = load().gatewayUrl;
  return typeof v === 'string' ? v : APP_CONFIG.gatewayUrl;
}

/** Returns { ok, url, error }. Only same-origin gateways are accepted. */
export function validateGatewayUrl(input) {
  const value = (input || '').trim();
  if (!value) return { ok: true, url: '' };
  try {
    const u = new URL(value, window.location.href);
    if (u.origin !== window.location.origin) {
      return { ok: false, error: 'Gateway must be on the same origin as this dashboard (credentials stay server-side).' };
    }
    if (u.username || u.password || u.search) {
      return { ok: false, error: 'Do not include credentials or query parameters in the gateway URL.' };
    }
    return { ok: true, url: u.pathname.replace(/\/+$/, '') };
  } catch {
    return { ok: false, error: 'Not a valid URL or path.' };
  }
}

export function saveConnection({ mode, gatewayUrl }) {
  const s = load();
  s.mode = mode;
  s.gatewayUrl = gatewayUrl;
  return writeJSON(KEY, s);
}

export function hasThresholdOverride(zoneId) {
  const o = load().thresholds || {};
  return !!o[zoneId];
}

export function getThresholds(zoneId) {
  const base = DEFAULT_THRESHOLDS[zoneId];
  const o = (load().thresholds || {})[zoneId];
  if (!base) return null;
  return {
    temperature: { ...base.temperature, ...(o?.temperature || {}) },
    humidity: { ...base.humidity, ...(o?.humidity || {}) },
  };
}

export function saveThresholdOverride(zoneId, value) {
  const s = load();
  s.thresholds = { ...(s.thresholds || {}), [zoneId]: value };
  return writeJSON(KEY, s);
}

export function clearThresholdOverride(zoneId) {
  const s = load();
  if (s.thresholds) delete s.thresholds[zoneId];
  return writeJSON(KEY, s);
}

export function resetAll() { return remove(KEY); }

/** Browser-local audit log of changes made in this browser. */
const AUDIT_KEY = 'mbms.localAudit.v1';
export function localAudit() { return readJSON(AUDIT_KEY, []) || []; }
export function appendLocalAudit(entry) {
  const list = localAudit();
  list.unshift({ id: 'L-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), origin: 'browser', ...entry });
  writeJSON(AUDIT_KEY, list.slice(0, 1000));
}
