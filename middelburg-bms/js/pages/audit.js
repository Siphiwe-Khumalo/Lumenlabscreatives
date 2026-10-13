/* Audit Trail — searchable, sortable, filterable event history. */
import { icon } from '../ui/icons.js';
import { esc, dateTime } from '../util/format.js';
import { createTable } from '../ui/components.js';

const TYPES = {
  acknowledgement: 'Acknowledgement',
  configuration: 'Configuration change',
  setpoint: 'Setpoint change',
  notification: 'Notification',
  communication: 'Communication',
  service: 'Service',
};

export default {
  mount(root) {
    const ui = { q: '', type: 'all', origin: 'all' };
    let last = null;
    root.innerHTML = `<div class="page-head">
        <div class="titles"><h1>Audit Trail</h1><p>Acknowledgements, configuration changes, notifications, communication and service events</p></div>
      </div>
      <div data-note></div>
      <section class="card">
        <div class="card-head" style="align-items:flex-end">
          <label class="search"><span class="sr-only">Search audit trail</span>${icon('search')}<input class="input" type="search" placeholder="Search description, source, actor" data-f="q"></label>
          <label class="field"><span>Type</span><select class="select" data-f="type"><option value="all">All types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label class="field"><span>Record origin</span><select class="select" data-f="origin"><option value="all">All</option><option value="demo">Demonstration records</option><option value="browser">This browser only</option></select></label>
        </div>
        <div data-table></div>
        <div class="table-meta"><span data-count></span><span>Times in SAST. Setpoint writes are disabled, so no setpoint changes are recorded.</span></div>
      </section>`;

    const originOf = (e) => (e.demo ? 'demo' : 'browser');
    const table = createTable({
      caption: 'Audit trail',
      rowKey: (e) => e.id,
      initialSort: { key: 'ts', dir: 'desc' },
      empty: 'No audit entries match the current filters.',
      columns: [
        { key: 'ts', label: 'Timestamp', render: (e) => `<span class="nowrap">${esc(dateTime(e.ts))}</span>` },
        { key: 'type', label: 'Type', sort: (e) => TYPES[e.type] || e.type, render: (e) => `<span class="tag">${esc(TYPES[e.type] || e.type)}</span>` },
        { key: 'source', label: 'Source', render: (e) => esc(e.source) },
        { key: 'actor', label: 'Actor', render: (e) => esc(e.actor) },
        { key: 'description', label: 'Description', render: (e) => esc(e.description) },
        { key: 'origin', label: 'Record', sort: originOf, render: (e) => (e.demo ? '<span class="tag demo">Demonstration record</span>' : '<span class="tag">This browser only</span>') },
      ],
    });
    root.querySelector('[data-table]').appendChild(table.el);

    function render(s) {
      last = s;
      if (s.loading) return;
      const q = ui.q.trim().toLowerCase();
      const rows = s.audit.filter((e) => (ui.type === 'all' || e.type === ui.type)
        && (ui.origin === 'all' || originOf(e) === ui.origin)
        && (!q || [e.description, e.source, e.actor, TYPES[e.type]].join(' ').toLowerCase().includes(q)));
      table.setRows(rows);
      root.querySelector('[data-count]').textContent = `${rows.length} of ${s.audit.length} entries`;
      root.querySelector('[data-note]').innerHTML = s.mode === 'demo'
        ? `<div class="notice demo">${icon('info')}<span><strong>Demonstration records.</strong> Entries marked as demonstration records are illustrative and are not verified production records. Entries marked "This browser only" were recorded locally by this browser (for example, threshold overrides) and are not stored centrally.</span></div>`
        : `<div class="notice">${icon('info')}<span><strong>Audit service not configured.</strong> Only events recorded locally by this browser are shown. They are not stored centrally and are not verified production records.</span></div>`;
    }

    root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener(el.type === 'search' ? 'input' : 'change', () => { ui[el.dataset.f] = el.value; if (last) render(last); }));
    return { update: render };
  },
};
