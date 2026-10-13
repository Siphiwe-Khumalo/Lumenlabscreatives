/* Safe localStorage wrappers — storage may be unavailable (private mode, blocked). */
export function readJSON(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
export function writeJSON(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function remove(key) {
  try { window.localStorage.removeItem(key); return true; } catch { return false; }
}
