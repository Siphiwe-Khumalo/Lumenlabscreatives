/* Facility Model — graphical warehouse model: plan view and tilted 3D view of
 * the same layout. Zones are coloured by status and show live readings;
 * hybrid units sit at floor level, rooftop units on the roof. */
import { EQUIPMENT_TYPES } from '../config/site.js';
import { LAYOUT_LABEL, ZONE_RECTS, DOCKS, UNIT_POS } from '../config/layout.js';
import { icon } from '../ui/icons.js';
import { esc, num, timeSec } from '../util/format.js';
import { statusChip, openDrawer, readingHTML, DEMO_TAG } from '../ui/components.js';
import { isGood, STATUS_LABEL } from '../data/quality.js';
import { readJSON, writeJSON } from '../util/storage.js';

const VIEW_KEY = 'mbms.modelView.v1';
const UNIT_STATE_LABEL = { running: 'Running', standby: 'Standby', stopped: 'Stopped', unknown: 'Unknown' };
const val = (r, d = 1) => (isGood(r) ? num(r.value, d) : '—');

export default {
  mount(root) {
    const saved = readJSON(VIEW_KEY, null);
    let view = saved === 'plan' || saved === '3d' ? saved : window.innerWidth < 720 ? 'plan' : '3d'; // 3D is cramped on phones
    let last = null;
    root.innerHTML = `<div class="page-head">
        <div class="titles"><h1>Facility Model</h1><p>Warehouse zones and HVAC units at a glance</p></div>
        <div class="toolbar">
          <div class="seg" role="group" aria-label="Model view">
            <button type="button" data-view="3d" aria-pressed="${view === '3d'}">3D view</button>
            <button type="button" data-view="plan" aria-pressed="${view === 'plan'}">Plan view</button>
          </div>
        </div>
      </div>
      <div class="notice">${icon('info')}<span>${esc(LAYOUT_LABEL)}. Select a zone for its conditions or a unit for its details.</span></div>
      <section class="card model-card">
        <div class="card-head"><h2>Warehouse</h2><span data-tag></span><span class="sub" data-updated></span></div>
        <div class="model-stage" data-stage><div class="model-floor" data-floor></div></div>
        <div class="model-legend">
          <span><i class="lz st-normal"></i>Normal</span><span><i class="lz st-warning"></i>Warning</span><span><i class="lz st-critical"></i>Critical</span><span><i class="lz st-unknown"></i>Unknown</span>
          <span class="sep"></span>
          <span><i class="lu hybrid running"></i>Hybrid unit (floor level)</span><span><i class="lu rooftop running"></i>Rooftop unit (on roof)</span>
          <span><i class="lu hybrid running"></i>Running</span><span><i class="lu hybrid standby"></i>Standby</span><span><i class="lu hybrid stopped"></i>Stopped</span><span><i class="lu hybrid unknown"></i>Unknown</span>
        </div>
      </section>`;
    const $ = (s) => root.querySelector(s);

    function zoneTile(z) {
      const r = ZONE_RECTS[z.id];
      const st = z.status.overall;
      return `<button type="button" class="mz st-${st}" data-zone="${z.id}" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%"
          aria-label="${esc(z.name)}: ${STATUS_LABEL[st]}, temperature ${val(z.readings.temperature)} °C, humidity ${val(z.readings.humidity)} %RH">
        <span class="mz-card">
          <strong>${esc(z.name)}</strong>
          <span class="mz-vals"><span>${isGood(z.readings.temperature) ? `${num(z.readings.temperature.value)}<small>°C</small>` : '<em>Unknown</em>'}</span>
          <span>${isGood(z.readings.humidity) ? `${num(z.readings.humidity.value)}<small>%RH</small>` : '<em>Unknown</em>'}</span></span>
          ${statusChip(st)}
        </span>
      </button>`;
    }

    function unitMarker(e) {
      const p = UNIT_POS[e.id];
      if (!p) return '';
      return `<button type="button" class="mu ${e.type} ${e.opState}${e.openAlarms ? ' has-alarm' : ''}" data-unit="${e.id}" style="left:${p.x}%;top:${p.y}%"
          aria-label="${esc(e.id)} ${EQUIPMENT_TYPES[e.type].short}: ${UNIT_STATE_LABEL[e.opState]}${e.openAlarms ? `, ${e.openAlarms} open alarm` : ''}">
        <span class="mu-body"></span><span class="mu-lbl">${esc(e.id)}</span>
      </button>`;
    }

    function docks() {
      return DOCKS.map((d) => d.side === 'left'
        ? `<span class="dock left" style="top:${d.pos}%" title="${esc(d.label)}">${esc(d.label)}</span>`
        : `<span class="dock front" style="left:${d.pos}%" title="${esc(d.label)}">${esc(d.label)}</span>`).join('');
    }

    function render(s) {
      last = s;
      if (s.loading) return;
      $('[data-stage]').classList.toggle('is-3d', view === '3d');
      $('[data-floor]').innerHTML = `
        <span class="mwall back"></span><span class="mwall left"></span><span class="mwall front"></span><span class="mwall right"></span>
        ${s.zones.map(zoneTile).join('')}
        ${docks()}
        <span class="roof" aria-hidden="true"></span>
        ${s.equipment.map(unitMarker).join('')}`;
      $('[data-tag]').innerHTML = s.mode === 'demo' ? DEMO_TAG : '';
      $('[data-updated]').textContent = s.lastPollAt ? `Updated ${timeSec(s.lastPollAt)}` : '';
    }

    function openUnit(id) {
      const e = last?.equipment.find((x) => x.id === id);
      if (!e) return;
      const r = e.readings;
      openDrawer({
        title: `${e.id} · ${e.name}`,
        subtitle: `${esc(EQUIPMENT_TYPES[e.type].short)} unit · serves ${esc(e.zoneName || '')}${last.mode === 'demo' ? ' · Demonstration data' : ''}`,
        body: `<dl class="kv">
            <dt>State</dt><dd>${esc(UNIT_STATE_LABEL[e.opState])}</dd>
            <dt>Space temperature</dt><dd>${readingHTML(r.temperature)}</dd>
            <dt>Supply air</dt><dd>${readingHTML(r.supplyAirTemp)}</dd>
            <dt>Return air</dt><dd>${readingHTML(r.returnAirTemp)}</dd>
            <dt>Open alarms</dt><dd>${e.openAlarms || 'None'}</dd>
          </dl>
          <a class="btn" href="#/hvac">${icon('hvac')}Open HVAC Systems</a>`,
      });
    }

    root.addEventListener('click', (ev) => {
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
    });
    return { update: render };
  },
};
