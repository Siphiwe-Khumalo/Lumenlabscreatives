/* HVAC Systems — equipment table with search, state filter and detail drawer. */
import { NAMES_ILLUSTRATIVE } from '../config/site.js';
import { ROLE_POINTS } from '../config/points.js';
import { icon } from '../ui/icons.js';
import { esc, cap, dateTime } from '../util/format.js';
import { statusChip, readingHTML, tsHTML, createTable, openDrawer, DEMO_TAG } from '../ui/components.js';
import { isGood, STATUS_RANK } from '../data/quality.js';

const STATE = {
  running: { label: 'Running', st: 'normal' },
  standby: { label: 'Standby', st: 'info' },
  stopped: { label: 'Stopped — expected running', st: 'critical' },
  unknown: { label: 'Unknown', st: 'unknown' },
};
const stateChip = (s) => `<span class="status-chip st-${STATE[s].st}">${icon(s === 'running' ? 'check' : s === 'unknown' ? 'info' : s === 'stopped' ? 'alarm' : 'dot')}${STATE[s].label}</span>`;
const MODE_LABEL = { heating: 'Heating', cooling: 'Cooling', standby: 'Standby', unknown: 'Unknown' };
const boolText = (r, yes, no) => (isGood(r) ? (r.value ? yes : no) : `<span class="v-unknown">Unknown</span> <span class="q-flag">${esc(cap(r?.quality || 'missing'))}</span>`);

export default {
  mount(root) {
    const ui = { q: '', state: 'all' };
    let last = null;
    root.innerHTML = `<div class="page-head">
        <div class="titles"><h1>HVAC Systems</h1><p>Air handling equipment serving the storage zones</p></div>
        <div class="toolbar">
          <label class="search"><span class="sr-only">Search equipment</span>${icon('search')}<input class="input" type="search" placeholder="Search ID, name or zone" data-q></label>
          <label class="field"><span class="sr-only">Operating state</span><select class="select" data-state aria-label="Filter by operating state">
            <option value="all">All states</option><option value="running">Running</option><option value="standby">Standby</option><option value="stopped">Stopped</option><option value="unknown">Unknown</option></select></label>
        </div>
      </div>
      <div class="notice demo">${icon('info')}<span><strong>Equipment placeholders.</strong> ${esc(NAMES_ILLUSTRATIVE)}. Equipment control is not configured — demonstration only. No commands are sent from this dashboard.</span></div>
      <section class="card">
        <div class="card-head"><h2>Equipment</h2><span data-tag></span><span class="sub" data-count></span></div>
        <div data-table></div>
        <div class="table-meta"><span>Airflow unit (${esc(ROLE_POINTS.airflow.unit)}) is ${ROLE_POINTS.airflow.unitConfirmed ? 'confirmed' : 'assumed — to be confirmed'}.</span><span>Select a row for details.</span></div>
      </section>`;

    const table = createTable({
      caption: 'HVAC equipment',
      rowKey: (e) => e.id,
      initialSort: { key: 'id', dir: 'asc' },
      onRowClick: (id) => openDetail(id),
      columns: [
        { key: 'id', label: 'ID', render: (e) => `<strong class="mono">${esc(e.id)}</strong>` },
        { key: 'name', label: 'Name', render: (e) => `${esc(e.name)}<span class="sub">${esc(e.zoneName || '')}</span>` },
        { key: 'opState', label: 'Operating state', sort: (e) => e.opState, render: (e) => stateChip(e.opState) },
        { key: 'mode', label: 'Mode', render: (e) => (e.mode === 'unknown' ? '<span class="v-unknown">Unknown</span>' : MODE_LABEL[e.mode]) },
        { key: 'temp', label: 'Space temp.', num: true, sort: (e) => (isGood(e.readings.temperature) ? e.readings.temperature.value : null), render: (e) => readingHTML(e.readings.temperature) },
        { key: 'airflow', label: 'Airflow', num: true, sort: (e) => (isGood(e.readings.airflow) ? e.readings.airflow.value : null), render: (e) => readingHTML(e.readings.airflow, { digits: 0 }) },
        { key: 'alarm', label: 'Alarm status', sort: (e) => STATUS_RANK[e.alarmStatus], render: (e) => statusChip(e.alarmStatus, e.openAlarms ? `${e.openAlarms} open` : undefined) },
        { key: 'updated', label: 'Last update', sort: (e) => e.lastUpdate, render: (e) => tsHTML(e.lastUpdate) },
      ],
    });
    root.querySelector('[data-table]').appendChild(table.el);

    function filtered(s) {
      const q = ui.q.trim().toLowerCase();
      return s.equipment.filter((e) => (ui.state === 'all' || e.opState === ui.state) && (!q || [e.id, e.name, e.zoneName].join(' ').toLowerCase().includes(q)));
    }

    function render(s) {
      last = s;
      if (s.loading) return;
      const rows = filtered(s);
      table.setRows(rows);
      root.querySelector('[data-count]').textContent = `${rows.length} of ${s.equipment.length}`;
      root.querySelector('[data-tag]').innerHTML = s.mode === 'demo' ? DEMO_TAG : '';
    }

    function openDetail(id) {
      const e = last?.equipment.find((x) => x.id === id);
      if (!e) return;
      const reason = last.mode === 'demo' ? 'Not configured — demonstration only' : 'Not configured — no writable control points confirmed';
      const rows = [
        ['Operating state', stateChip(e.opState)],
        ['Mode', e.mode === 'unknown' ? '<span class="v-unknown">Unknown</span>' : MODE_LABEL[e.mode]],
        ['Run status', boolText(e.readings.runStatus, 'Running', 'Off')],
        ['Unit enable', boolText(e.readings.enable, 'Enabled', 'Disabled')],
        ['Fan schedule', boolText(e.readings.fanSchedule, 'Scheduled on', 'Scheduled off')],
        ['Space temperature', readingHTML(e.readings.temperature)],
        ['Airflow', readingHTML(e.readings.airflow, { digits: 0 }) + (ROLE_POINTS.airflow.unitConfirmed ? '' : ' <span class="small muted">(unit assumed)</span>')],
        ['Last update', e.lastUpdate ? esc(dateTime(e.lastUpdate)) + ' SAST' : 'No timestamp'],
      ];
      openDrawer({
        title: `${e.id} · ${e.name}`,
        subtitle: `Serves ${esc(e.zoneName || '')}${last.mode === 'demo' ? ' · Demonstration data' : ''}`,
        body: `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
          <div><h3>Controls</h3>
          <div class="toolbar" style="margin-top:8px">
            <button class="btn" type="button" disabled title="${reason}">Enable unit</button>
            <button class="btn" type="button" disabled title="${reason}">Disable unit</button>
            <button class="btn" type="button" disabled title="${reason}">Change mode</button>
          </div>
          <p class="small muted" style="margin-top:8px">${icon('lock')} ${reason}. No commands are sent from this dashboard.</p></div>
          <div><h3>Open alarms</h3><p class="small">${e.openAlarms ? `${e.openAlarms} open — <a href="#/alarms">view in Alarm Register</a>` : 'None'}</p></div>`,
        onClose: () => table.setSelected(null),
      });
    }

    root.querySelector('[data-q]').addEventListener('input', (ev) => { ui.q = ev.target.value; if (last) render(last); });
    root.querySelector('[data-state]').addEventListener('change', (ev) => { ui.state = ev.target.value; if (last) render(last); });
    return { update: render };
  },
};
