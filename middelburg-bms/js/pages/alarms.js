/* Alarm Register — filters, search, sortable table, detail drawer,
 * acknowledgement in demo mode only. */
import { ZONES } from '../config/site.js';
import { icon } from '../ui/icons.js';
import { esc, dateTime, dayStart, ago } from '../util/format.js';
import { severityChip, ackChip, readingHTML, createTable, openDrawer, closeDrawer, toast, DEMO_TAG } from '../ui/components.js';
import { acknowledge } from '../data/store.js';

const CATEGORY = { threshold: 'Threshold', equipment: 'Equipment', communication: 'Communication' };
const SEV_RANK = { critical: 3, warning: 2, info: 1 };

function valueText(v) {
  if (!v) return '—';
  return `${esc(v.value)}${v.unit ? ' ' + esc(v.unit) : ''}`;
}

export default {
  mount(root, { params }) {
    const ui = { q: '', severity: 'all', status: 'open', zone: 'all', from: '', to: '' };
    let last = null;
    let openId = params.get('id');

    root.innerHTML = `<div class="page-head">
        <div class="titles"><h1>Alarm Register</h1><p>Active, acknowledged and cleared alarms</p></div>
      </div>
      <div data-mode-note></div>
      <section class="card">
        <div class="card-head" style="align-items:flex-end">
          <label class="search"><span class="sr-only">Search alarms</span>${icon('search')}<input class="input" type="search" placeholder="Search description, source, ID" data-f="q"></label>
          <label class="field"><span>Severity</span><select class="select" data-f="severity"><option value="all">All</option><option value="critical">Critical</option><option value="warning">Warning</option></select></label>
          <label class="field"><span>Status</span><select class="select" data-f="status"><option value="open">Open (active + acknowledged)</option><option value="all">All</option><option value="active">Unacknowledged</option><option value="acknowledged">Acknowledged</option><option value="cleared">Cleared</option></select></label>
          <label class="field"><span>Zone</span><select class="select" data-f="zone"><option value="all">All zones</option>${ZONES.map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join('')}<option value="none">Site / system</option></select></label>
          <label class="field"><span>From</span><input class="input" type="date" data-f="from"></label>
          <label class="field"><span>To</span><input class="input" type="date" data-f="to"></label>
          <button class="btn ghost sm" type="button" data-reset>Reset filters</button>
        </div>
        <div data-table></div>
        <div class="table-meta"><span data-count></span><span>Colours: green normal · amber warning · red critical · grey unknown. Dates in SAST.</span></div>
      </section>`;
    root.querySelector('[data-f="status"]').value = ui.status;

    const table = createTable({
      caption: 'Alarm register',
      rowKey: (a) => a.id,
      initialSort: { key: 'raised', dir: 'desc' },
      onRowClick: (id) => openDetail(id),
      empty: 'No alarms match the current filters.',
      columns: [
        { key: 'severity', label: 'Severity', sort: (a) => SEV_RANK[a.severity], render: (a) => severityChip(a.severity) },
        { key: 'raised', label: 'Raised', sort: (a) => a.raisedAt, render: (a) => `<span class="nowrap">${esc(dateTime(a.raisedAt))}</span><span class="sub">${esc(ago(a.raisedAt))}</span>` },
        { key: 'source', label: 'Source', sort: (a) => a.source?.name, render: (a) => `${esc(a.source?.name || '—')}<span class="sub">${esc(CATEGORY[a.category] || '')}</span>` },
        { key: 'description', label: 'Description', render: (a) => `${esc(a.description)}${a.derived ? '<span class="sub">Derived in this browser — not a BMS alarm record</span>' : ''}` },
        { key: 'reading', label: 'Current reading', sortable: false, render: (a) => (a.currentReading ? readingHTML(a.currentReading) : '<span class="muted">—</span>') },
        { key: 'threshold', label: 'Threshold', sortable: false, render: (a) => (a.thresholdResolved ? `${esc(a.thresholdResolved.text)}<span class="sub">${esc(a.thresholdResolved.label)}</span>` : '—') },
        { key: 'status', label: 'Status', sort: (a) => ({ active: 0, acknowledged: 1, cleared: 2 }[a.status]), render: (a) => ackChip(a.status) + (a.ackBy ? `<span class="sub">${esc(a.ackBy)}</span>` : '') },
      ],
    });
    root.querySelector('[data-table]').appendChild(table.el);

    function filtered(s) {
      const q = ui.q.trim().toLowerCase();
      const from = ui.from ? dayStart(ui.from) : -Infinity;
      const to = ui.to ? dayStart(ui.to) + 864e5 : Infinity;
      return s.alarms.filter((a) => {
        if (ui.severity !== 'all' && a.severity !== ui.severity) return false;
        if (ui.status === 'open' && a.status === 'cleared') return false;
        if (!['open', 'all'].includes(ui.status) && a.status !== ui.status) return false;
        if (ui.zone === 'none' && a.zoneId) return false;
        if (!['all', 'none'].includes(ui.zone) && a.zoneId !== ui.zone) return false;
        if (a.raisedAt < from || a.raisedAt >= to) return false;
        if (q && ![a.id, a.description, a.source?.name, a.zoneName, a.details].join(' ').toLowerCase().includes(q)) return false;
        return true;
      });
    }

    function render(s) {
      last = s;
      if (s.loading) return;
      const rows = filtered(s);
      table.setRows(rows);
      root.querySelector('[data-count]').textContent = `${rows.length} of ${s.alarms.length} alarm records`;
      const note = root.querySelector('[data-mode-note]');
      note.innerHTML = s.mode === 'demo'
        ? `<div class="notice demo">${icon('info')}<span><strong>Demonstration records.</strong> These alarms are illustrative and are not verified production records. Acknowledgement works in demo mode only and changes nothing outside this browser session.</span></div>`
        : `<div class="notice">${icon('info')}<span><strong>Alarm service not configured.</strong> Conditions below are evaluated in this browser from current readings against the configured limits; they are not BMS alarm records and have no acknowledgement or history.</span></div>`;
      if (openId) { const id = openId; openId = null; openDetail(id); }
    }

    function openDetail(id) {
      const a = last?.alarms.find((x) => x.id === id);
      if (!a) { toast('Alarm record not found', 'err'); return; }
      table.setSelected(id);
      const demo = last.mode === 'demo' && !a.derived;
      const timeline = [
        ['Raised', a.raisedAt], ['Acknowledged', a.ackAt], ['Cleared', a.clearedAt],
      ].filter(([, t]) => t).map(([k, t]) => `<dt>${k}</dt><dd>${esc(dateTime(t))} SAST</dd>`).join('');
      const notifs = a.notifications?.length
        ? `<div><h3>Notification delivery</h3><div style="margin:6px 0">${a.notifications.some((n) => n.demo) ? DEMO_TAG : ''}</div>
            <table class="data"><thead><tr><th>Channel</th><th>Recipient</th><th>Status</th><th>Time</th></tr></thead><tbody>
            ${a.notifications.map((n) => `<tr><td>${esc(n.channel)}</td><td>${esc(n.recipient)}</td><td>${esc(n.status)}</td><td class="nowrap">${esc(dateTime(n.at).slice(11))}</td></tr>`).join('')}</tbody></table></div>`
        : ''; // shown only when status data exists
      let foot;
      if (a.status !== 'active') {
        foot = `<p class="small muted">${a.status === 'cleared' ? 'This alarm has cleared.' : 'Acknowledged'}${a.ackBy ? ` — acknowledged by ${esc(a.ackBy)} at ${esc(dateTime(a.ackAt))}` : ''}.</p>`;
      } else if (demo) {
        foot = `<label class="field"><span>Acknowledgement note (optional)</span><textarea class="input" data-note maxlength="300" placeholder="Action taken or reason"></textarea></label>
          <div class="toolbar"><button class="btn primary" type="button" data-ack>${icon('check')}Acknowledge (demo)</button>${DEMO_TAG}</div>
          <p class="small muted">Demo mode only: recorded in this browser session as a demonstration record.</p>`;
      } else {
        foot = `<div class="toolbar"><button class="btn" type="button" disabled>${icon('lock')}Acknowledge</button></div>
          <p class="small muted">Acknowledgement service not configured.</p>`;
      }
      const d = openDrawer({
        title: a.description,
        subtitle: `${esc(a.id)} · ${esc(a.source?.name || '')}${demo ? ' · Demonstration record' : a.derived ? ' · Derived in this browser' : ''}`,
        body: `<div class="toolbar">${severityChip(a.severity)}${ackChip(a.status)}<span class="tag">${esc(CATEGORY[a.category] || a.category)}</span></div>
          <dl class="kv">
            <dt>Source</dt><dd>${esc(a.source?.name || '—')}${a.zoneName && a.source?.type !== 'zone' ? ` (${esc(a.zoneName)})` : ''}</dd>
            <dt>Current reading</dt><dd>${a.currentReading ? readingHTML(a.currentReading) + (a.currentReading.ts ? ` <span class="small muted">at ${esc(dateTime(a.currentReading.ts).slice(11))}</span>` : '') : '—'}</dd>
            <dt>Value when raised</dt><dd>${valueText(a.valueAtRaise)}</dd>
            <dt>Configured threshold</dt><dd>${a.thresholdResolved ? `${esc(a.thresholdResolved.text)} <span class="muted small">(${esc(a.thresholdResolved.label)})</span>` : '—'}</dd>
            ${timeline}
            ${a.ackNote ? `<dt>Note</dt><dd>${esc(a.ackNote)}</dd>` : ''}
          </dl>
          <div><h3>Details</h3><p style="margin-top:6px">${esc(a.details || '—')}</p></div>
          ${notifs}`,
        foot,
        onClose: () => table.setSelected(null),
      });
      d.el.querySelector('[data-ack]')?.addEventListener('click', async (ev) => {
        ev.currentTarget.disabled = true;
        try {
          await acknowledge(a.id, d.el.querySelector('[data-note]').value.trim());
          toast(`${a.id} acknowledged (demo)`);
          closeDrawer();
        } catch (err) {
          toast(err.message, 'err');
          ev.currentTarget.disabled = false;
        }
      });
    }

    root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener(el.tagName === 'INPUT' && el.type === 'search' ? 'input' : 'change', () => {
      ui[el.dataset.f] = el.value;
      if (last) render(last);
    }));
    root.querySelector('[data-reset]').addEventListener('click', () => {
      Object.assign(ui, { q: '', severity: 'all', status: 'all', zone: 'all', from: '', to: '' });
      root.querySelectorAll('[data-f]').forEach((el) => (el.value = ui[el.dataset.f]));
      if (last) render(last);
    });

    return {
      update: render,
      onParams(p) { if (p.get('id') && last) openDetail(p.get('id')); },
    };
  },
};

