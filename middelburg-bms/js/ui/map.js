/* Facility location map — Leaflet + OpenStreetMap.
 * No coordinates are hardcoded. The supplied address is geocoded at runtime
 * with Nominatim (countrycodes=za, addressdetails=1), validated against the
 * expected province (other towns are also called Middelburg), cached in
 * localStorage, and the match precision is shown honestly.
 * The supplied address is a Department of Health office — NOT a confirmed
 * warehouse location. */
import { SITE } from '../config/site.js';
import { icon } from './icons.js';
import { esc, dateTime } from '../util/format.js';
import { readJSON, writeJSON, remove } from '../util/storage.js';

const CACHE_KEY = 'mbms.geocode.v1';
const CACHE_TTL = 30 * 24 * 3600e3;
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const A = SITE.address;

const QUERIES = [
  { level: 'address', params: { street: '14 Dr Mandela Drive', city: 'Middelburg', state: 'Mpumalanga', postalcode: '1055', country: 'South Africa' } },
  { level: 'street',  params: { q: 'Dr Mandela Drive & Jaspis Street, Middelburg, Mpumalanga' } },
  { level: 'street',  params: { street: 'Jaspis Street', city: 'Middelburg', state: 'Mpumalanga', country: 'South Africa' } },
  { level: 'street',  params: { street: 'Dr Mandela Drive', city: 'Middelburg', state: 'Mpumalanga', country: 'South Africa' } },
  { level: 'town',    params: { city: 'Middelburg', state: 'Mpumalanga', country: 'South Africa' } },
];

const PRECISION_TEXT = {
  address: 'Address-level match',
  street: 'Street-level match — approximate',
  town: 'Town-level match only — marker shows Middelburg town, not the building',
};

export const googleSearchUrl = () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(A.searchText)}`;
export const googleDirectionsUrl = () => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(A.searchText)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function precisionOf(hit, requested) {
  const ad = hit.address || {};
  if (ad.house_number) return 'address';
  if (ad.road && requested !== 'town') return 'street';
  return 'town';
}

async function geocode() {
  let lastError = 'No match found';
  for (let i = 0; i < QUERIES.length; i++) {
    if (i > 0) await sleep(1100); // Nominatim usage policy: max 1 request per second
    const q = QUERIES[i];
    const url = new URL(NOMINATIM);
    for (const [k, v] of Object.entries({ format: 'jsonv2', addressdetails: '1', countrycodes: 'za', limit: '5', ...q.params })) url.searchParams.set(k, v);
    let hits;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      clearTimeout(t);
      if (!res.ok) { lastError = `Geocoder returned HTTP ${res.status}`; continue; }
      hits = await res.json();
    } catch (err) {
      lastError = err.name === 'AbortError' ? 'Geocoder timed out' : `Geocoder unreachable (${err.message})`;
      continue;
    }
    const valid = (Array.isArray(hits) ? hits : []).filter((h) => {
      const ad = h.address || {};
      const inState = (ad.state || '').toLowerCase() === A.expectedState.toLowerCase();
      const town = [ad.city, ad.town, ad.village, ad.suburb, ad.municipality, h.display_name].join(' ').toLowerCase();
      return inState && town.includes('middelburg');
    });
    if (!valid.length) { lastError = 'No match in Middelburg, Mpumalanga'; continue; }
    const hit = valid[0];
    return {
      lat: parseFloat(hit.lat), lon: parseFloat(hit.lon),
      precision: precisionOf(hit, q.level),
      displayName: hit.display_name,
      query: Object.values(q.params).join(', '),
      geocodedAt: Date.now(),
    };
  }
  throw new Error(lastError);
}

function cached() {
  const c = readJSON(CACHE_KEY);
  if (!c || !isFinite(c.lat) || !isFinite(c.lon) || Date.now() - c.geocodedAt > CACHE_TTL) return null;
  return c;
}

export function clearGeocodeCache() { remove(CACHE_KEY); }

function addressHTML() {
  return `<address><strong>${esc(A.label)}</strong><br>${A.lines.map(esc).join('<br>')}</address>`;
}

function linksHTML() {
  return `<div class="toolbar">
    <a class="btn primary" href="${googleDirectionsUrl()}" target="_blank" rel="noopener noreferrer">${icon('external')}Open directions in Google Maps</a>
    <a class="btn" href="${googleSearchUrl()}" target="_blank" rel="noopener noreferrer">${icon('pin')}Search in Google Maps</a>
  </div>`;
}

/** Mounts the map card body into `el`. Returns { destroy }. */
export function mountFacilityMap(el, { forceFail = false } = {}) {
  let map = null;
  let destroyed = false;

  el.innerHTML = `<div class="map-layout">
      <div class="map-slot"><div class="map-fallback">${'<div class="spinner" aria-hidden="true"></div>'}<span class="muted">Locating the supplied address…</span></div></div>
      <div class="map-side">
        <span class="tag placeholder">${icon('info')}${esc(A.status)}</span>
        ${addressHTML()}
        <div class="precision" data-precision></div>
        ${linksHTML()}
        <p class="small muted">The address above is the supplied Department of Health office. It has not been confirmed as the warehouse and the facility has not been geolocated or verified.</p>
      </div>
    </div>`;
  const slot = el.querySelector('.map-slot');
  const precisionEl = el.querySelector('[data-precision]');

  function showFallback(reason) {
    if (map) { map.remove(); map = null; }
    precisionEl.innerHTML = `<span class="status-chip st-unknown">${icon('info')}Not located</span><span class="muted">${esc(reason)}</span>`;
    slot.innerHTML = `<div class="map-fallback" role="status">
        <strong>Map location unavailable</strong>
        <span class="muted">The supplied address could not be located automatically (${esc(reason)}). Use the links to open it in Google Maps, or retry.</span>
        ${addressHTML()}
        <div class="actions">
          <button class="btn" type="button" data-retry>${icon('refresh')}Retry</button>
          <a class="btn" href="${googleSearchUrl()}" target="_blank" rel="noopener noreferrer">${icon('pin')}Search in Google Maps</a>
          <a class="btn" href="${googleDirectionsUrl()}" target="_blank" rel="noopener noreferrer">${icon('external')}Directions</a>
        </div>
      </div>`;
    slot.querySelector('[data-retry]').addEventListener('click', () => { clearGeocodeCache(); load(true); });
  }

  function showMap(loc) {
    if (!window.L) { showFallback('map library failed to load'); return; }
    slot.innerHTML = '<div class="map" role="region" aria-label="Map of the supplied address"></div>';
    const zoom = loc.precision === 'address' ? 17 : loc.precision === 'street' ? 16 : 13;
    map = window.L.map(slot.firstElementChild, { scrollWheelZoom: false, zoomControl: true }).setView([loc.lat, loc.lon], zoom);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · Geocoding: <a href="https://nominatim.org/" target="_blank" rel="noopener">Nominatim</a>',
    }).addTo(map);
    window.L.Icon.Default.imagePath = 'vendor/leaflet/images/';
    const marker = window.L.marker([loc.lat, loc.lon], { title: SITE.name, alt: 'Supplied address marker' }).addTo(map);
    marker.bindPopup(`<strong>${esc(SITE.name)}</strong>${esc(A.label)}<br>${A.lines.map(esc).join('<br>')}
      <br><span style="color:#6B756E">${esc(PRECISION_TEXT[loc.precision])}. Warehouse location to be confirmed.</span>
      <br><a href="${googleDirectionsUrl()}" target="_blank" rel="noopener noreferrer">Open directions in Google Maps</a>`).openPopup();
    if (loc.precision !== 'address') {
      window.L.circle([loc.lat, loc.lon], { radius: loc.precision === 'street' ? 150 : 1500, color: '#4F8275', weight: 1, fillOpacity: 0.06, interactive: false }).addTo(map);
    }
    const st = loc.precision === 'address' ? 'st-info' : 'st-unknown';
    precisionEl.innerHTML = `<span class="status-chip ${st}">${icon('pin')}${esc(PRECISION_TEXT[loc.precision])}</span>
      <span class="muted">Matched: ${esc(loc.displayName)} · geocoded ${esc(dateTime(loc.geocodedAt))}</span>`;
    setTimeout(() => map && map.invalidateSize(), 50);
  }

  async function load(fresh = false) {
    precisionEl.innerHTML = '<span class="muted">Locating…</span>';
    if (!fresh) {
      const c = cached();
      if (c) { showMap(c); return; }
    }
    try {
      if (forceFail) throw new Error('geocoding disabled for testing');
      const loc = await geocode();
      if (destroyed) return;
      writeJSON(CACHE_KEY, loc);
      showMap(loc);
    } catch (err) {
      if (!destroyed) showFallback(err.message);
    }
  }

  const onResize = () => map && map.invalidateSize();
  window.addEventListener('resize', onResize);
  load();
  return { destroy() { destroyed = true; window.removeEventListener('resize', onResize); if (map) map.remove(); } };
}
