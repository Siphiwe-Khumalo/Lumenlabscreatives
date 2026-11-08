/* Facility Model — the warehouse drawn as a rendered isometric model (SVG, computed from
 * js/config/layout.js). Zones are tinted by status; hybrid units stand on the floor, rooftop units
 * sit on the (glass) roof. Fans spin only when the unit's fan point is LIVE and ON. */
import { EQUIPMENT_TYPES } from '../config/site.js';
import { LAYOUT_LABEL, ZONE_RECTS, DOCKS, UNIT_POS } from '../config/layout.js';
import { icon } from '../ui/icons.js';
import { esc, num, timeSec } from '../util/format.js';
import { openDrawer, readingHTML, DEMO_TAG } from '../ui/components.js';
import { isGood, STATUS_LABEL } from '../data/quality.js';
import { readJSON, writeJSON } from '../util/storage.js';

const VIEW_KEY = 'mbms.modelView.v2';
const UNIT_STATE_LABEL = { running: 'Running', stopped: 'Stopped', fault: 'Fault', unknown: 'No data' };

/* World units: building 100 wide (x) × 60 deep (y), walls 9 high. */
const W = 100, D = 60, H = 9;
const C = Math.cos(Math.PI / 6), S = 0.5, K = 7; // isometric projection, scale

const ZONE_FILL = {
  normal:   { top: '#E3F4EC', edge: '#6CC39E' },
  warning:  { top: '#FCF0D2', edge: '#E3AE3C' },
  critical: { top: '#FBDCDD', edge: '#E5484D' },
  unknown:  { top: '#E9EDF2', edge: '#A9B3C1' },
};
const RUN_COLOR = { running: '#1FA971', stopped: '#8A94A6', fault: '#E5484D', unknown: '#C9A227' };
const MODE_COLOR = { cooling: '#3B8CF0', heating: '#F28C28', 'fan only': '#14A3A0' };

function projector(view) {
  if (view === 'plan') return (x, y) => [x * K * 1.15, y * K * 1.15];
  return (x, y, z = 0) => [(x - y) * C * K, ((x + y) * S - z) * K];
}
const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** SVG matrix that maps a horizontal plane at height z (local x, y in world units) to the screen. */
function planeMatrix(view, z) {
  if (view === 'plan') return `matrix(${K * 1.15} 0 0 ${K * 1.15} 0 0)`;
  return `matrix(${C * K} ${S * K} ${-C * K} ${S * K} 0 ${-z * K})`;
}

const BLADE = 'M0 0C.35-1.7 1.4-3 3.1-3.6C3.6-3.8 4-3.4 3.85-2.9C3.3-1.2 1.9-.2 0 0Z';
function fanGlyph(cx, cy, r, on, color) {
  const s = r / 4.2;
  return `<g transform="translate(${cx} ${cy})">
      <circle r="${r}" fill="#0E1E35" stroke="#B9C4D3" stroke-width="${r * 0.12}"/>
      ${on ? `<circle r="${r * 0.86}" fill="none" stroke="${color}" stroke-width="${r * 0.1}" opacity=".9"/>` : ''}
      <g class="iso-blades${on ? ' spin' : ''}"><g transform="scale(${s})" fill="#DCE5F0">${[0, 72, 144, 216, 288].map((a) => `<path d="${BLADE}" transform="rotate(${a})"/>`).join('')}</g></g>
      <circle r="${r * 0.2}" fill="#9DB0C8"/>
    </g>`;
}

/** An isometric box with three shaded faces (top, front +y, right +x). */
function box(P, view, { x, y, z = 0, w, d, h }, c) {
  const top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  if (view === 'plan') return `<polygon points="${pts(top)}" fill="${c.top}" stroke="${c.line}" stroke-width="1"/>`;
  const front = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const right = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
  return `<polygon points="${pts(front)}" fill="${c.front}"/>
    <polygon points="${pts(right)}" fill="${c.right}"/>
    <polygon points="${pts(top)}" fill="${c.top}"/>
    <polyline points="${pts([front[0], front[1], right[1], right[2], top[2], top[3], front[0]])}" fill="none" stroke="${c.line}" stroke-width=".8" stroke-linejoin="round"/>
    <polyline points="${pts([front[3], front[2], right[3]])}" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width=".8"/>`;
}

const UNIT_BODY = { top: '#F6F8FB', front: '#DCE3EC', right: '#C5CFDC', line: '#93A1B5' };
const WALL = { top: '#FFFFFF', front: '#E9EEF4', right: '#D6DEE8', line: '#A3B0C2' };

/** Room sensor: a slim post with a teal sensor head (no fan). */
function sensorSVG(P, view, e, p) {
  const live = Object.values(e.readings).some((r) => isGood(r));
  const x = (p.x / 100) * W - 0.8, y = (p.y / 100) * D - 0.8;
  const head = live ? { top: '#5FD3C9', front: '#14A3A0', right: '#0E7C79', line: '#0B6563' } : { top: '#D5DCE5', front: '#B7C2D0', right: '#A2AFC0', line: '#8796AA' };
  const svg = `<g class="iso-unit iso-sensor" data-unit="${e.id}" tabindex="0" role="button" aria-label="${esc(e.name)} (${esc(e.id)}): ${live ? 'live' : 'no data'}">
      ${box(P, view, { x: x + 0.45, y: y + 0.45, z: 0, w: 0.7, d: 0.7, h: 3.2 }, UNIT_BODY)}
      ${box(P, view, { x, y, z: 3.2, w: 1.6, d: 1.6, h: 1.3 }, head)}
      ${live && view !== 'plan' ? `<circle cx="${P(x + 0.8, y + 0.8, 5.2)[0]}" cy="${P(x + 0.8, y + 0.8, 5.2)[1]}" r="3" fill="#14A3A0" class="iso-led"/>` : ''}
    </g>`;
  return { svg, anchor: view === 'plan' ? P(x + 0.8, y - 0.4) : P(x + 0.8, y + 0.8, 6.5), depth: x + y };
}

function unitSVG(P, view, e) {
  const p = UNIT_POS[e.id];
  if (!p) return { svg: '', anchor: null };
  if (e.type === 'sensor') return sensorSVG(P, view, e, p);
  const fan = e.readings.fanStatus;
  const on = isGood(fan) && fan.value === true;
  const color = MODE_COLOR[e.mode] || '#14A3A0';
  const run = RUN_COLOR[e.runState] || RUN_COLOR.unknown;
  const rooftop = e.type === 'rooftop';
  const dims = rooftop ? { w: 10, d: 6, h: 3.2, z: H } : { w: 6, d: 4.2, h: 6, z: 0 };
  const x = (p.x / 100) * W - dims.w / 2, y = (p.y / 100) * D - dims.d / 2;
  const accent = rooftop ? '#7C5CE6' : '#2F6FED';
  const topZ = dims.z + dims.h;
  const fans = rooftop
    ? [[x + dims.w * 0.3, y + dims.d / 2], [x + dims.w * 0.7, y + dims.d / 2]]
    : [[x + dims.w / 2, y + dims.d / 2]];
  // Accent stripe along the front face, status LED on the front.
  let extra = '';
  if (view !== 'plan') {
    const s0 = P(x, y + dims.d, topZ - 0.9), s1 = P(x + dims.w, y + dims.d, topZ - 0.9), s2 = P(x + dims.w, y + dims.d, topZ - 0.3), s3 = P(x, y + dims.d, topZ - 0.3);
    const led = P(x + dims.w * 0.12, y + dims.d, dims.z + dims.h * 0.35);
    const grille = [0.3, 0.5, 0.7].map((t) => { const a = P(x + dims.w * 0.25, y + dims.d, dims.z + dims.h * t), b = P(x + dims.w * 0.85, y + dims.d, dims.z + dims.h * t); return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#A9B5C6" stroke-width=".7"/>`; }).join('');
    extra = `<polygon points="${pts([s0, s1, s2, s3])}" fill="${accent}"/>${grille}
      <circle cx="${led[0]}" cy="${led[1]}" r="2.2" fill="${run}" class="${e.runState === 'running' ? 'iso-led' : ''}"/>`;
  } else {
    extra = `<rect x="${P(x, y)[0]}" y="${P(x, y)[1]}" width="${dims.w * K * 1.15}" height="3" fill="${accent}"/>`;
  }
  const fanR = rooftop ? 2.1 : 1.7;
  const svg = `<g class="iso-unit st-${e.runState}" data-unit="${e.id}" tabindex="0" role="button"
      aria-label="${esc(e.name)} (${esc(e.id)}): ${UNIT_STATE_LABEL[e.runState]}${e.openAlarms ? `, ${e.openAlarms} open alarm` : ''}">
      ${view !== 'plan' ? `<ellipse cx="${P(x + dims.w / 2 + 1.2, y + dims.d / 2 + 1.2, dims.z)[0]}" cy="${P(x + dims.w / 2 + 1.2, y + dims.d / 2 + 1.2, dims.z)[1]}" rx="${dims.w * K * 0.62}" ry="${dims.w * K * 0.3}" fill="#0B1F3A" opacity=".13" filter="url(#isoSoft)"/>` : ''}
      ${box(P, view, { x, y, z: dims.z, w: dims.w, d: dims.d, h: dims.h }, UNIT_BODY)}
      <g transform="${planeMatrix(view, topZ)}">${fans.map(([fx, fy]) => fanGlyph(fx, fy, fanR, on, color)).join('')}</g>
      ${extra}
      ${e.openAlarms ? `<g transform="translate(${P(x + dims.w, y, topZ + 1)[0]} ${P(x + dims.w, y, topZ + 1)[1]})"><circle r="6" fill="#E5484D" stroke="#fff" stroke-width="1.5"/><text y="3.3" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">!</text></g>` : ''}
    </g>`;
  return { svg, anchor: view === 'plan' ? P(x + dims.w / 2, y - 0.4) : P(x + dims.w / 2, y + dims.d / 2, topZ + 2.5), depth: x + y + (rooftop ? 1000 : 0) };
}

/** Internal partition walls between zones (edges not on the outer wall), deduplicated. */
function partitions() {
  const out = [];
  const seen = new Set();
  for (const r of Object.values(ZONE_RECTS)) {
    const x0 = (r.x / 100) * W, x1 = ((r.x + r.w) / 100) * W, y0 = (r.y / 100) * D, y1 = ((r.y + r.h) / 100) * D;
    for (const [a, b] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x0, y1], [x1, y1]], [[x0, y0], [x0, y1]]]) {
      const outer = (a[0] === b[0] && (a[0] === 0 || a[0] === W)) || (a[1] === b[1] && (a[1] === 0 || a[1] === D));
      const key = [a, b].map((q) => q.map((n) => n.toFixed(2)).join(',')).sort().join('|');
      if (!outer && !seen.has(key)) { seen.add(key); out.push([a, b]); }
    }
  }
  return out;
}

function buildScene(view, s) {
  const P = projector(view);
  const iso = view !== 'plan';
  const parts = [];
  const zoneById = Object.fromEntries(s.zones.map((z) => [z.id, z]));

  // Ground shadow and floor slab.
  if (iso) {
    parts.push(`<polygon points="${pts([P(2, 2, -1.5), P(W + 4, 2, -1.5), P(W + 4, D + 4, -1.5), P(2, D + 4, -1.5)])}" fill="#0B1F3A" opacity=".16" filter="url(#isoShadow)"/>`);
    parts.push(box(P, view, { x: -1.5, y: -1.5, z: -1.6, w: W + 3, d: D + 3, h: 1.6 }, { top: '#F4F6F9', front: '#C9D2DE', right: '#B3BECD', line: '#97A5B8' }));
    // Back walls (inside faces visible): y = 0 and x = 0.
    parts.push(`<polygon points="${pts([P(0, 0, 0), P(W, 0, 0), P(W, 0, H), P(0, 0, H)])}" fill="url(#isoWallBack)" stroke="#B5C0CF" stroke-width=".8"/>`);
    parts.push(`<polygon points="${pts([P(0, 0, 0), P(0, D, 0), P(0, D, H), P(0, 0, H)])}" fill="url(#isoWallLeft)" stroke="#B5C0CF" stroke-width=".8"/>`);
    // Windows strip on the back walls.
    for (let i = 0; i < 9; i++) {
      const x = 6 + i * 10.5;
      parts.push(`<polygon points="${pts([P(x, 0, H * 0.62), P(x + 6.5, 0, H * 0.62), P(x + 6.5, 0, H * 0.82), P(x, 0, H * 0.82)])}" fill="#CFE3F5" stroke="#A9C3DC" stroke-width=".6"/>`);
    }
  } else {
    parts.push(`<rect x="${P(-1.5, -1.5)[0]}" y="${P(-1.5, -1.5)[1]}" width="${(W + 3) * K * 1.15}" height="${(D + 3) * K * 1.15}" rx="6" fill="#F4F6F9" stroke="#97A5B8"/>`);
  }

  // Zone floors.
  for (const [id, r] of Object.entries(ZONE_RECTS)) {
    const z = zoneById[id];
    const st = z?.status?.overall || 'unknown';
    const f = ZONE_FILL[st] || ZONE_FILL.unknown;
    const x0 = (r.x / 100) * W, x1 = ((r.x + r.w) / 100) * W, y0 = (r.y / 100) * D, y1 = ((r.y + r.h) / 100) * D;
    const inset = 0.5;
    parts.push(`<g class="iso-zone st-${st}" data-zone="${id}" role="button" tabindex="0" aria-label="${esc(z?.name || id)}: ${STATUS_LABEL[st]}">
      <polygon points="${pts([P(x0 + inset, y0 + inset), P(x1 - inset, y0 + inset), P(x1 - inset, y1 - inset), P(x0 + inset, y1 - inset)])}" fill="${f.top}" stroke="${f.edge}" stroke-width="1.4"/>
      ${st === 'unknown' ? `<polygon points="${pts([P(x0 + inset, y0 + inset), P(x1 - inset, y0 + inset), P(x1 - inset, y1 - inset), P(x0 + inset, y1 - inset)])}" fill="url(#isoHatch)" opacity=".5" pointer-events="none"/>` : ''}
    </g>`);
  }
  // Floor grid lines (subtle, every 10 units).
  if (iso) {
    const g = [];
    for (let x = 10; x < W; x += 10) g.push(`<line x1="${P(x, 0)[0]}" y1="${P(x, 0)[1]}" x2="${P(x, D)[0]}" y2="${P(x, D)[1]}"/>`);
    for (let y = 10; y < D; y += 10) g.push(`<line x1="${P(0, y)[0]}" y1="${P(0, y)[1]}" x2="${P(W, y)[0]}" y2="${P(W, y)[1]}"/>`);
    parts.push(`<g stroke="#0B1F3A" stroke-opacity=".05" stroke-width=".6" pointer-events="none">${g.join('')}</g>`);
  }

  // Docks (aprons outside the left and front walls).
  for (const d of DOCKS) {
    if (d.side === 'left') {
      const y = (d.pos / 100) * D;
      parts.push(iso ? box(P, view, { x: -6, y: y - 2.5, z: -0.8, w: 4.5, d: 5, h: 0.8 }, { top: '#E4E9F0', front: '#C3CDDA', right: '#AEBACA', line: '#97A5B8' })
        : `<rect x="${P(-6, y - 2.5)[0]}" y="${P(-6, y - 2.5)[1]}" width="${4.5 * K * 1.15}" height="${5 * K * 1.15}" fill="#E4E9F0" stroke="#97A5B8"/>`);
    } else {
      const x = (d.pos / 100) * W;
      parts.push(iso ? box(P, view, { x: x - 2.5, y: D + 1.5, z: -0.8, w: 5, d: 4.5, h: 0.8 }, { top: '#E4E9F0', front: '#C3CDDA', right: '#AEBACA', line: '#97A5B8' })
        : `<rect x="${P(x - 2.5, D + 1.5)[0]}" y="${P(x - 2.5, D + 1.5)[1]}" width="${5 * K * 1.15}" height="${4.5 * K * 1.15}" fill="#E4E9F0" stroke="#97A5B8"/>`);
    }
  }

  // Units: floor units with partitions (painter's order by depth), then the roof and rooftop units.
  const units = s.equipment.map((e) => ({ e, ...unitSVG(P, view, e) })).filter((u) => u.svg);
  const floorUnits = units.filter((u) => u.e.type !== 'rooftop').sort((a, b) => a.depth - b.depth);
  const roofUnits = units.filter((u) => u.e.type === 'rooftop').sort((a, b) => a.depth - b.depth);

  if (iso) {
    for (const [a, b] of partitions()) {
      parts.push(`<polygon points="${pts([P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], H * 0.55), P(a[0], a[1], H * 0.55)])}" fill="#DCEAF6" fill-opacity=".55" stroke="#9FB6CC" stroke-width=".7" pointer-events="none"/>`);
      parts.push(`<line x1="${P(a[0], a[1], H * 0.55)[0]}" y1="${P(a[0], a[1], H * 0.55)[1]}" x2="${P(b[0], b[1], H * 0.55)[0]}" y2="${P(b[0], b[1], H * 0.55)[1]}" stroke="#8EA6BE" stroke-width="1.2" pointer-events="none"/>`);
    }
  } else {
    for (const [a, b] of partitions()) parts.push(`<line x1="${P(...a)[0]}" y1="${P(...a)[1]}" x2="${P(...b)[0]}" y2="${P(...b)[1]}" stroke="#7F93AB" stroke-width="2.5"/>`);
  }
  parts.push(...floorUnits.map((u) => u.svg));

  if (iso) {
    // Front and right walls cut low so the interior stays visible.
    parts.push(box(P, view, { x: 0, y: D - 0.8, z: 0, w: W, d: 0.8, h: 1.8 }, WALL));
    parts.push(box(P, view, { x: W - 0.8, y: 0, z: 0, w: 0.8, d: D, h: 1.8 }, WALL));
    // Corner posts carrying the roof.
    for (const [x, y] of [[0, 0], [W, 0], [W, D], [0, D]]) {
      parts.push(`<line x1="${P(x, y, 0)[0]}" y1="${P(x, y, 0)[1]}" x2="${P(x, y, H)[0]}" y2="${P(x, y, H)[1]}" stroke="#9FB0C4" stroke-width="1.6" pointer-events="none"/>`);
    }
    // Glass roof.
    parts.push(`<polygon points="${pts([P(0, 0, H), P(W, 0, H), P(W, D, H), P(0, D, H)])}" fill="url(#isoGlass)" stroke="#8FA6BF" stroke-width="1.2" pointer-events="none"/>`);
  }
  parts.push(...roofUnits.map((u) => u.svg));

  // Bounds for the viewBox.
  const corners = iso
    ? [P(-8, -2, H + 8), P(W + 6, -2, H + 8), P(W + 6, D + 8, -2), P(-8, D + 8, -2), P(-8, -2, -2), P(W + 6, D + 8, H + 8)]
    : [P(-8, -4), P(W + 4, D + 8)];
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const vb = { x: Math.min(...xs) - 10, y: Math.min(...ys) - 10, w: Math.max(...xs) - Math.min(...xs) + 20, h: Math.max(...ys) - Math.min(...ys) + 20 };

  // Overlay anchors (in % of the stage) for the zone cards and unit tags.
  const pct = ([px, py]) => ({ left: ((px - vb.x) / vb.w) * 100, top: ((py - vb.y) / vb.h) * 100 });
  const zoneAnchors = Object.fromEntries(Object.entries(ZONE_RECTS).map(([id, r]) => [id, pct(P(((r.x + r.w / 2) / 100) * W, ((r.y + r.h / 2) / 100) * D, 0))]));
  const unitAnchors = units.map((u) => ({ e: u.e, ...pct(u.anchor) }));
  return { svg: parts.join(''), vb, zoneAnchors, unitAnchors };
}

/** Moves zone cards (up or down, in small steps) until they no longer cover a unit label or another card. */
function declutter(overlay) {
  const box = overlay.getBoundingClientRect();
  if (!box.height) return;
  const hit = (a, b) => a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2;
  const units = [...overlay.parentElement.querySelectorAll('g.iso-unit > polygon')].map((g) => g.getBoundingClientRect());
  const tags = [...overlay.querySelectorAll('.iso-tag')].map((t) => t.getBoundingClientRect()).concat(units);
  const placed = [];
  for (const card of overlay.querySelectorAll('.iso-card')) {
    const top0 = parseFloat(card.style.top);
    for (const dy of [0, -5, 5, -10, 10, -15, 15, -20, 20, -25, 25]) {
      card.style.top = `${top0 + dy}%`;
      const r = card.getBoundingClientRect();
      if (![...tags, ...placed].some((t) => hit(r, t))) break;
    }
    placed.push(card.getBoundingClientRect());
  }
}

const DEFS = `<defs>
  <filter id="isoShadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="isoSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <linearGradient id="isoWallBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F9FC"/><stop offset="1" stop-color="#E2E8F0"/></linearGradient>
  <linearGradient id="isoWallLeft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEF2F7"/><stop offset="1" stop-color="#D7DFE9"/></linearGradient>
  <linearGradient id="isoGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D6E6F5" stop-opacity=".30"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity=".10"/><stop offset="1" stop-color="#C9DDF0" stop-opacity=".28"/></linearGradient>
  <pattern id="isoHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="8" fill="#B8C2CF"/></pattern>
</defs>`;

export default {
  mount(root) {
    const saved = readJSON(VIEW_KEY, null);
    let view = saved === 'plan' || saved === '3d' ? saved : window.innerWidth < 720 ? 'plan' : '3d';
    let last = null;
    let lastKey = '';
    root.innerHTML = `<div class="page-head">
        <div class="titles"><h1>3D Model</h1><p>Zones and units at a glance. Select a zone or a unit for details.</p></div>
        <div class="toolbar">
          <div class="seg seg-lg" role="group" aria-label="Model view">
            <button type="button" data-view="3d" aria-pressed="${view === '3d'}">3D</button>
            <button type="button" data-view="plan" aria-pressed="${view === 'plan'}">Plan</button>
          </div>
        </div>
      </div>
      <section class="card model-card">
        <div class="model-stage" data-stage></div>
        <div class="model-legend">
          <span><i class="lz st-normal"></i>Normal</span><span><i class="lz st-warning"></i>Warning</span><span><i class="lz st-critical"></i>Critical</span><span><i class="lz st-unknown"></i>No data</span>
          <span class="sep"></span>
          <span><i class="lt hyb"></i>Hybrid unit (floor)</span><span><i class="lt rtu"></i>Rooftop unit (roof)</span><span><i class="lt sen"></i>Room sensor</span>
          <span class="sep"></span>
          <span><i class="ll" style="background:${RUN_COLOR.running}"></i>Running</span><span><i class="ll" style="background:${RUN_COLOR.stopped}"></i>Stopped</span><span><i class="ll" style="background:${RUN_COLOR.fault}"></i>Fault</span>
          <span class="model-meta"><span data-tag></span><span data-updated></span></span>
        </div>
      </section>
      <p class="muted small model-note">${icon('info')}${esc(LAYOUT_LABEL)}.</p>`;
    const $ = (s) => root.querySelector(s);

    function zoneCard(z, a) {
      const st = z.status.overall;
      const t = z.readings.temperature, h = z.readings.humidity;
      return `<button type="button" class="iso-card st-${st}" data-zone="${z.id}" style="left:${a.left}%;top:${a.top}%">
        <strong>${esc(z.name)}</strong>
        <span class="iso-vals"><span class="t">${isGood(t) ? `${num(t.value)}<small>°C</small>` : '—'}</span><span class="h">${isGood(h) ? `${num(h.value, 0)}<small>%RH</small>` : '—'}</span></span>
        <span class="iso-st"><i></i>${esc(STATUS_LABEL[st])}</span>
      </button>`;
    }

    function render(s) {
      last = s;
      if (s.loading) return;
      const sc = buildScene(view, s);
      const stage = $('[data-stage]');
      // Rebuild the SVG only when it changed, so the fans keep spinning smoothly between polls.
      const key = view + sc.svg;
      if (key !== lastKey) {
        lastKey = key;
        stage.innerHTML = `<div class="iso-wrap" style="aspect-ratio:${sc.vb.w} / ${sc.vb.h}">
            <svg class="iso" viewBox="${sc.vb.x} ${sc.vb.y} ${sc.vb.w} ${sc.vb.h}" role="img" aria-label="Warehouse model">${DEFS}${sc.svg}</svg>
            <div class="iso-overlay" data-overlay></div></div>`;
      }
      const overlay = stage.querySelector('[data-overlay]');
      overlay.innerHTML = `
          ${sc.unitAnchors.map((u) => `<button type="button" class="iso-tag ${u.e.type} st-${u.e.runState}" data-unit="${u.e.id}" style="left:${u.left}%;top:${u.top}%">${esc(u.e.id)}</button>`).join('')}
          ${s.zones.map((z) => (sc.zoneAnchors[z.id] ? zoneCard(z, sc.zoneAnchors[z.id]) : '')).join('')}`;
      declutter(overlay);
      $('[data-tag]').innerHTML = s.mode === 'demo' ? DEMO_TAG : '';
      $('[data-updated]').textContent = s.lastPollAt ? `Updated ${timeSec(s.lastPollAt)}` : '';
    }

    function openUnit(id) {
      const e = last?.equipment.find((x) => x.id === id);
      if (!e) return;
      const r = e.readings;
      openDrawer({
        title: `${e.name} · ${e.id}`,
        subtitle: `${esc(EQUIPMENT_TYPES[e.type].short)}${e.type === 'sensor' ? ' · in' : ' unit · serves'} ${esc(e.zoneName || '')}${last.mode === 'demo' ? ' · Demonstration data' : ''}`,
        body: `<dl class="kv">
            ${e.type === 'sensor' ? '' : `<dt>State</dt><dd>${esc(UNIT_STATE_LABEL[e.runState])}</dd>`}
            <dt>Space temperature</dt><dd>${readingHTML(r.temperature)}</dd>
            ${e.type === 'sensor' ? '' : `<dt>Setpoint</dt><dd>${readingHTML(r.temperatureSetpoint)}</dd>`}
            ${e.type === 'rooftop' ? `<dt>Humidity</dt><dd>${readingHTML(r.humidity)}</dd>` : e.type === 'sensor' ? `<dt>Humidity</dt><dd>${readingHTML(r.humidity)}</dd><dt>CO₂</dt><dd>${readingHTML(r.co2, { digits: 0 })}</dd>` : `<dt>Fan speed</dt><dd>${readingHTML(r.fanSpeed, { digits: 0 })}</dd>`}
            <dt>Faults</dt><dd>${e.faults?.length ? esc(e.faults.map((f) => f.label).join(', ')) : 'None'}</dd>
            <dt>Open alarms</dt><dd>${e.openAlarms || 'None'}</dd>
          </dl>
          ${e.type === 'sensor' ? '' : `<a class="btn primary" href="#/controls">${icon('hvac')}Control this unit</a>`}`,
      });
    }

    const activate = (ev) => {
      const v = ev.target.closest('[data-view]');
      if (v) {
        view = v.dataset.view;
        writeJSON(VIEW_KEY, view);
        root.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === v)));
        if (last) render(last);
        return;
      }
      const u = ev.target.closest('[data-unit]');
      if (u) { openUnit(u.dataset.unit); return; }
      const z = ev.target.closest('[data-zone]');
      if (z) location.hash = `#/environment?zone=${z.dataset.zone}`;
    };
    root.addEventListener('click', activate);
    root.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('g[data-unit], g[data-zone]')) { ev.preventDefault(); activate(ev); } });
    return { update: render };
  },
};
