/* Commissioning — every point with its live value and a "verified" tick, so the
 * team can confirm each unit reads correctly before handover.
 * Ticks are stored in this browser only. */
import { ZONES, EQUIPMENT } from '../config/site.js';
import { mappingRows, POINT_MAP_STATUS } from '../config/points.js';
import { icon } from '../ui/icons.js';
import { esc, dateTime, timeSec } from '../util/format.js';
import { createTable, readingHTML, openDrawer, toast } from '../ui/components.js';
import { isGood } from '../data/quality.js';
import { readJSON, writeJSON } from '../util/storage.js';
import { appendLocalAudit } from '../config/settings-store.js';

const KEY = 'mbms.commissioning.v1';
const NAME_KEY = 'mbms.commissioning.verifier.v1';
const rowKey = (r) => `${r.id}|${r.role}`;

export default {
  mount(root) {
    let checks = readJSON(KEY, {}) || {};
    let last = null;
    const ui = { q: '', filter: 'all' };
    const rows = mappingRows();

    root.innerHTML = `<div class="page-head">
        <div class="titles"><h1>Commissioning</h1><p>Check every point reads correctly before handover</p></div>
        <div class="toolbar">
          <label class="field"><span>Verified by</span><input class="input" id="comm-name" data-name placeholder="Your name" maxlength="60" value="${esc(readJSON(NAME_KEY, '') || '')}"></label>
          <div class="field"><span>&nbsp;</span><button class="btn" type="button" data-export>${icon('download')}Export checklist</button></div>
        </div>
      </div>
      <div data-note></div>
      <section class="card">
        <div class="card-head" style="align-items:flex-end">
          <div class="progress-wrap"><span class="small muted" data-progress-text></span><div class="progress"><i data-progress></i></div></div>
          <label class="search"><span class="sr-only">Search points</span>${icon('search')}<input class="input" type="search" id="comm-q" placeholder="Search unit, zone or reading" data-q></label>
          <label class="field"><span>Show</span><select class="select" id="comm-filter" data-filter>
            <option value="all">All points</option><option value="todo">Not yet verified</option><option value="done">Verified</option>
            <option value="derived">Derived from unit 1 pattern</option><option value="bad">Not reading (Unknown)</option></select></label>
        </div>
        <div data-table></div>
        <div class="table-meta"><span>Ticks are saved in this browser only and recorded in the Audit Trail as "This browser only".</span><span>${esc(POINT_MAP_STATUS.note)}</span></div>
      </section>`;
    const $ = (s) => root.querySelector(s);

    const nameOf = (r) => r.id;
    function readingFor(r) {
      if (!last) return null;
      return last.equipment.find((e) => e.id === r.id)?.readings[r.role] || null;
    }

    const table = createTable({
      caption: 'Commissioning checklist',
      rowKey,
      initialSort: { key: 'id', dir: 'asc' },
      empty: 'No points match the current filter.',
      columns: [
        { key: 'id', label: 'Unit', sort: (r) => `${r.kind}${r.id}`, render: (r) => `<strong class="mono">${esc(r.id)}</strong><span class="sub">${esc(r.kind)} · ${esc(r.controller)}</span>` },
        { key: 'role', label: 'Reading', sort: (r) => r.label, render: (r) => esc(r.label) },
        { key: 'path', label: 'Point', sortable: false, render: (r) => `<span class="mono">${esc(r.path)}</span>${r.derived ? `<span class="sub">${esc(POINT_MAP_STATUS.derivedLabel)}</span>` : ''}` },
        { key: 'value', label: 'Live value', sortable: false, render: (r) => { const rd = readingFor(r); return rd ? `${readingHTML(rd)}${rd.ts ? `<span class="sub">${esc(timeSec(rd.ts))}</span>` : ''}` : '—'; } },
        { key: 'check', label: 'Verified', sort: (r) => (checks[rowKey(r)] ? 1 : 0), render: (r) => {
          const c = checks[rowKey(r)];
          return `<label class="check"><input type="checkbox" data-check="${esc(rowKey(r))}" ${c ? 'checked' : ''} aria-label="Verified: ${esc(nameOf(r))} ${esc(r.label)}">
            <span>${c ? `${esc(c.by)}<span class="sub">${esc(dateTime(c.at).slice(0, 16))}</span>` : '<span class="muted">Not verified</span>'}</span></label>`;
        } },
        { key: 'note', label: 'Note', sortable: false, render: (r) => `<input class="input note-in" data-note-in="${esc(rowKey(r))}" value="${esc(checks[rowKey(r)]?.note || '')}" placeholder="Optional" maxlength="120" aria-label="Note">` },
      ],
    });
    $('[data-table]').appendChild(table.el);

    function filtered() {
      const q = ui.q.trim().toLowerCase();
      return rows.filter((r) => {
        const rd = readingFor(r);
        if (ui.filter === 'todo' && checks[rowKey(r)]) return false;
        if (ui.filter === 'done' && !checks[rowKey(r)]) return false;
        if (ui.filter === 'derived' && !r.derived) return false;
        if (ui.filter === 'bad' && isGood(rd)) return false;
        return !q || [nameOf(r), r.id, r.label, r.path].join(' ').toLowerCase().includes(q);
      });
    }

    function render(s) {
      last = s;
      if (s.loading) return;
      if (document.activeElement?.matches('.note-in')) return; // do not re-render while typing a note
      table.setRows(filtered());
      const done = rows.filter((r) => checks[rowKey(r)]).length;
      const derived = rows.filter((r) => r.derived).length;
      $('[data-progress-text]').textContent = `${done} of ${rows.length} points verified · ${derived} derived from the unit 1 pattern`;
      $('[data-progress]').style.width = `${(done / rows.length) * 100}%`;
      $('[data-note]').innerHTML = s.mode === 'demo'
        ? `<div class="notice demo">${icon('info')}<span><strong>Demonstration values.</strong> Live values below are illustrative. Verify points only against the connected site, not in demo mode.</span></div>`
        : '';
    }

    const save = () => { if (!writeJSON(KEY, checks)) toast('Could not save — browser storage unavailable', 'err'); };
    root.addEventListener('change', (ev) => {
      const cb = ev.target.closest('[data-check]');
      if (cb) {
        const k = cb.dataset.check;
        const name = $('[data-name]').value.trim();
        if (cb.checked && !name) { cb.checked = false; toast('Enter your name in "Verified by" first', 'err'); $('[data-name]').focus(); return; }
        const [id, role] = k.split('|');
        if (cb.checked) {
          const rd = readingFor(rows.find((r) => rowKey(r) === k));
          checks[k] = { by: name, at: Date.now(), note: checks[k]?.note || '', value: isGood(rd) ? String(rd.value) : 'Unknown', mode: last?.mode };
          appendLocalAudit({ type: 'commissioning', source: `${id} · ${role}`, actor: name, description: `Point verified (this browser only) — value ${checks[k].value}${last?.mode === 'demo' ? ' (demo data)' : ''}` });
        } else {
          delete checks[k];
          appendLocalAudit({ type: 'commissioning', source: `${id} · ${role}`, actor: name || 'This browser', description: 'Verification removed (this browser only)' });
        }
        save();
        if (last) render(last);
      }
      const ni = ev.target.closest('[data-note-in]');
      if (ni && checks[ni.dataset.noteIn]) { checks[ni.dataset.noteIn].note = ni.value.trim(); save(); }
    });
    $('[data-name]').addEventListener('change', (ev) => writeJSON(NAME_KEY, ev.target.value.trim()));
    $('[data-q]').addEventListener('input', (ev) => { ui.q = ev.target.value; if (last) render(last); });
    $('[data-filter]').addEventListener('change', (ev) => { ui.filter = ev.target.value; if (last) render(last); });
    $('[data-export]').addEventListener('click', () => {
      const lines = ['type,unit,controller,reading,ord,derived,live_value,quality,verified_by,verified_at,note'];
      for (const r of rows) {
        const rd = readingFor(r), c = checks[rowKey(r)];
        const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        lines.push([r.kind, r.id, r.controller, r.label, r.ord, r.derived ? 'yes' : 'no', isGood(rd) ? rd.value : '', rd?.quality || '', c?.by || '', c ? dateTime(c.at) : '', c?.note || ''].map(cell).join(','));
      }
      openDrawer({
        title: 'Commissioning checklist',
        subtitle: `${last?.mode === 'demo' ? 'Demonstration values · ' : ''}copy and save as a .csv file`,
        body: `<textarea class="input mono" id="comm-csv" readonly style="min-height:50vh;white-space:pre">${esc(lines.join('\n'))}</textarea>`,
        foot: '<div class="toolbar"><button class="btn primary" type="button" data-copy>Copy CSV</button></div>',
      }).el.querySelector('[data-copy]').addEventListener('click', () => {
        navigator.clipboard.writeText(lines.join('\n')).then(() => toast('Checklist copied'), () => { const ta = document.getElementById('comm-csv'); ta.focus(); ta.select(); toast('Press Ctrl+C to copy the selected text'); });
      });
    });
    return { update: render };
  },
};
