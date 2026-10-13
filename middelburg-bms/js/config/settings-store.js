/* Browser-local overrides (this browser only). Never authoritative. */
import { APP_CONFIG } from './app-config.js';
import { DEFAULT_THRESHOLDS } from './thresholds.js';
import { readJSON, writeJSON, remove } from '../util/storage.js';

const KEY = 'mbms.settings.v1';

function load() { return readJSON(KEY, {}) || {}; }

export function getMode() {
  const m = load().mode;
  return m === 'connected' || m === 'demo' ? m : APP_CONFIG.defaultMode;
}

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
  list.unshift({ id: 'L-' + Date.now().toString(36), ts: Date.now(), origin: 'browser', ...entry });
  writeJSON(AUDIT_KEY, list.slice(0, 300));
}
