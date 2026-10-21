/* Settings — data source, point mapping (placeholder), thresholds (browser
 * override), monitoring parameters, services and the proposed gateway contract. */
import { ZONES, EQUIPMENT } from '../config/site.js';
import { CHANNELS, ESCALATION, NOTIFICATIONS_LABEL } from '../config/notifications.js';
import { APP_CONFIG } from '../config/app-config.js';
import { THRESHOLDS_LABEL, DEFAULT_THRESHOLDS } from '../config/thresholds.js';
import { POINT_MAP_STATUS, mappingRows, BASE_PATHS, ZONE_SOURCES, ORD_PREFIX } from '../config/points.js';
import {
  getMode, getGatewayUrl, validateGatewayUrl, saveConnection,
  getThresholds, saveThresholdOverride, clearThresholdOverride, hasThresholdOverride, appendLocalAudit,
} from '../config/settings-store.js';
import { icon } from '../ui/icons.js';
import { esc, dateTime } from '../util/format.js';
import { createTable, toast } from '../ui/components.js';
import { clearGeocodeCache } from '../ui/map.js';
import * as store from '../data/store.js';

const FIELDS = [
  ['temperature', 'actionLow', 'Temp action low'], ['temperature', 'alertLow', 'Temp alert low'],
  ['temperature', 'alertHigh', 'Temp alert high'], ['temperature', 'actionHigh', 'Temp action high'],
  ['temperature', 'setpointMin', 'Setpoint min'], ['temperature', 'setpointMax', 'Setpoint max'],
  ['humidity', 'alertHigh', 'RH alert high'], ['humidity', 'actionHigh', 'RH action high'],
];

const CONTRACT = `PROPOSED, NOT IMPLEMENTED — same-origin gateway (credentials held server-side)

GET  {gateway}/health
     200 { "status": "ok", "jace": "reachable", "time": "<ISO 8601>" }

GET  {gateway}/query/readPoint/<slot path>
     e.g. /query/readPoint/${BASE_PATHS.rooftop(1)}<POINT>   (slot path; the gateway adds "${ORD_PREFIX}")
     200 { "value": 21.4, "timestamp": "<ISO 8601>", "status": "ok" | "fault" | "stale" | "down" }
     404 point not found

PUT  {gateway}/query/writePoint/<slot path>?value=<v>&priority=<n>
     NOT used — setpoint writes are disabled (writable: false).

Gateway responsibilities: hold OAuth / JACE credentials, serialise requests to the
JACE (one in flight), enforce an allow-list of readable points, and never expose
secrets to the browser. The browser also queues requests one at a time.`;

function validate(t) {
  const errs = [];
  const T = t.temperature, H = t.humidity;
  const asc = (arr, label) => { const v = arr.filter((x) => x != null); for (let i = 1; i < v.length; i++) if (v[i] <= v[i - 1]) { errs.push(label); return; } };
  asc([T.actionLow, T.alertLow, T.alertHigh, T.actionHigh], 'Temperature limits must increase: action low < alert low < alert high < action high.');
  if (T.setpointMin != null && T.setpointMax != null && T.setpointMin >= T.setpointMax) errs.push('Setpoint min must be below setpoint max.');
  asc([H.alertHigh, H.actionHigh], 'Humidity alert high must be below action high.');
  if ([H.alertHigh, H.actionHigh].some((v) => v != null && (v < 0 || v > 100))) errs.push('Humidity limits must be between 0 and 100 %RH.');
  return errs;
}

export default {
  mount(root) {
    root.innerHTML = `<div class="page-head"><div class="titles"><h1>Settings</h1><p>Data source, point mapping, thresholds and service configuration</p></div></div>

      <section class="card" aria-labelledby="ds-h">
        <div class="card-head"><h2 id="ds-h">Data source</h2><span class="tag">This browser only</span></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
          <div class="form-row">
            <label class="field"><span>Mode</span><select class="select" data-mode>
              <option value="demo">Demonstration (illustrative data)</option>
              <option value="connected">Connected (BMS gateway)</option></select></label>
            <label class="field" style="flex:1 1 260px"><span>Gateway URL (same origin, e.g. /bms-gateway)</span><input class="input" data-gw placeholder="Not configured" autocomplete="off" spellcheck="false"></label>
            <button class="btn primary" type="button" data-apply>${icon('refresh')}Save and reconnect</button>
          </div>
          <span class="error-text" data-gw-err role="alert"></span>
          <dl class="kv" data-ds-status></dl>
          <div class="notice">${icon('lock')}<span>No credentials are stored or entered here. Connected mode calls a same-origin gateway that holds credentials server-side. "Connected" is shown only after a successful gateway health check; otherwise the dashboard is Offline and readings are Unknown.</span></div>
        </div>
      </section>

      <section class="card" aria-labelledby="pm-h">
        <div class="card-head"><h2 id="pm-h">Point mapping</h2><span class="tag">Site points</span><span class="sub">Source: js/config/points.js</span></div>
        <div class="card-body" style="padding-bottom:0;display:flex;flex-direction:column;gap:10px"><div class="notice warn">${icon('alarm')}<span><strong>Unit 1 points supplied; units 2–6 derived.</strong> ${esc(POINT_MAP_STATUS.note)} Humidity is monitoring only. All points are read-only until controls are approved.</span></div>
          <div class="notice">${icon('info')}<span><strong>Zone sensors (to be confirmed):</strong> ${Object.entries(ZONE_SOURCES).map(([z, u]) => `${esc(ZONES.find((x) => x.id === z).name)} ← ${esc(u)}`).join(' · ')}. Humidity exists only on the rooftop units.</span></div></div>
        <div data-map-table style="margin-top:12px"></div>
      </section>

      <section class="grid cols-2">
        <section class="card" aria-labelledby="ctl-h">
          <div class="card-head"><h2 id="ctl-h">Unit controls</h2><span class="status-chip ${APP_CONFIG.controls.enabled ? 'st-warning' : 'st-neutral'}">${icon('lock')}${APP_CONFIG.controls.enabled ? 'Enabled' : 'Locked'}</span></div>
          <div class="card-body"><dl class="kv">
            <dt>On/off toggles</dt><dd>${APP_CONFIG.controls.enabled ? 'Enabled' : esc(APP_CONFIG.controls.lockedReason)}</dd>
            <dt>Write priority</dt><dd>${APP_CONFIG.controls.writePriority ?? 'Not set — to be confirmed'}</dd>
            <dt>Return to auto</dt><dd>${APP_CONFIG.controls.releaseSupported ? 'Supported' : 'Not configured'}</dd>
            <dt>Confirmation</dt><dd>Read-back within ${APP_CONFIG.controls.confirmTimeoutMs / 1000} s, otherwise reported as not confirmed</dd>
            <dt>Who may operate</dt><dd>To be agreed — no user logins exist yet</dd>
          </dl>
          <p class="small muted" style="margin-top:10px">Enabled in js/config/app-config.js (controls.enabled) once the points, priority and approval are confirmed. Every switch asks for confirmation and is recorded in the Audit Trail.</p></div>
        </section>
        <section class="card" aria-labelledby="nt-h">
          <div class="card-head"><h2 id="nt-h">WhatsApp and email alerts</h2><span class="tag demo">${esc(NOTIFICATIONS_LABEL)}</span></div>
          <div class="card-body flush"><div class="table-wrap"><table class="data"><thead><tr><th>Level</th><th>When</th><th>Severity</th><th>Recipient</th><th>Channels</th></tr></thead><tbody>
            ${ESCALATION.map((e) => `<tr><td>${e.level}</td><td>${e.afterMin ? `If unacknowledged after ${e.afterMin} min` : 'Immediately'}</td><td>${e.severities.map((x) => x[0].toUpperCase() + x.slice(1)).join(', ')}</td><td>${esc(e.recipient)}</td><td>${e.channels.map((c) => CHANNELS.find((x) => x.id === c).label).join(', ')}</td></tr>`).join('')}
          </tbody></table></div></div>
          <div class="table-meta"><span>Delivery: ${CHANNELS.map((c) => `${c.label} ${c.configured ? 'configured' : 'not configured'}`).join(' · ')}. Needs a backend notification service; no messages are sent from this dashboard.</span></div>
        </section>
      </section>

      <section class="card" aria-labelledby="th-h">
        <div class="card-head"><h2 id="th-h">Zone thresholds</h2><span class="tag demo">${esc(THRESHOLDS_LABEL)}</span><span class="tag">Overrides: this browser only</span></div>
        <div class="card-body flush"><div class="table-wrap"><table class="data thr-table"><thead><tr><th>Zone</th>${FIELDS.map(([, , l]) => `<th>${l}</th>`).join('')}<th>Source</th><th></th></tr></thead><tbody data-thr></tbody></table></div></div>
        <div class="table-meta"><span>°C for temperature, %RH for humidity. Blank = no limit on that side. Overrides apply only in this browser and are recorded in the Audit Trail as "This browser only".</span></div>
      </section>

      <section class="grid cols-2">
        <section class="card" aria-labelledby="mp-h">
          <div class="card-head"><h2 id="mp-h">Monitoring parameters</h2><span class="sub">js/config/app-config.js</span></div>
          <div class="card-body"><dl class="kv">
            <dt>Stale after</dt><dd>${APP_CONFIG.staleAfterMs / 60000} min without update → Unknown</dd>
            <dt>Poll interval</dt><dd>${APP_CONFIG.pollIntervalMs.connected / 1000} s connected · ${APP_CONFIG.pollIntervalMs.demo / 1000} s demo</dd>
            <dt>Gateway health check</dt><dd>every ${APP_CONFIG.healthIntervalMs / 1000} s</dd>
            <dt>Request timeout</dt><dd>${APP_CONFIG.requestTimeoutMs / 1000} s, one request in flight (FIFO)</dd>
            <dt>Setpoint writes</dt><dd>${APP_CONFIG.setpointWriteEnabled ? 'Enabled' : 'Disabled — point and permission not confirmed'}</dd>
            <dt>Time zone</dt><dd>Africa/Johannesburg (SAST, UTC+02:00)</dd>
          </dl></div>
        </section>
        <section class="card" aria-labelledby="sv-h">
          <div class="card-head"><h2 id="sv-h">Services</h2></div>
          <div class="card-body"><dl class="kv">
            <dt>Alarm acknowledgement</dt><dd>Not configured (demo mode only)</dd>
            <dt>Historian</dt><dd>Not configured (demo history is illustrative)</dd>
            <dt>WhatsApp notifications</dt><dd>Not configured</dd>
            <dt>Email notifications</dt><dd>Not configured</dd>
            <dt>Central audit log</dt><dd>Not configured</dd>
            <dt>Facility map</dt><dd>Geocoded at runtime · <button class="btn sm" type="button" data-geo>Clear cached location</button></dd>
          </dl></div>
        </section>
      </section>

      <section class="card" aria-labelledby="gc-h">
        <div class="card-head"><h2 id="gc-h">Gateway contract</h2><span class="tag placeholder">Proposed, not implemented</span></div>
        <div class="card-body"><pre class="contract">${esc(CONTRACT)}</pre></div>
      </section>`;

    const $ = (s) => root.querySelector(s);
    $('[data-mode]').value = getMode();
    $('[data-gw]').value = getGatewayUrl();

    const mapTable = createTable({
      caption: 'Site point mapping',
      rowKey: (r) => `${r.id}-${r.role}`,
      initialSort: { key: 'id', dir: 'asc' },
      columns: [
        { key: 'kind', label: 'Type' },
        { key: 'id', label: 'Unit', render: (r) => `<strong class="mono">${esc(r.id)}</strong><span class="sub">${esc(r.controller)}</span>` },
        { key: 'role', label: 'Reading', render: (r) => `${esc(r.label)}<span class="sub mono">${esc(r.role)}</span>` },
        { key: 'path', label: 'Point (slot path)', sort: (r) => r.path, render: (r) => `<span class="mono">${esc(r.path)}</span>` },
        { key: 'writable', label: 'Access', sort: (r) => (r.writable ? 1 : 0), render: (r) => (r.writable ? 'Read/write' : 'Read only') },
        { key: 'status', label: 'Status', sort: (r) => (r.derived ? 1 : 0), render: (r) => (r.derived ? `<span class="tag placeholder">${esc(POINT_MAP_STATUS.derivedLabel)}</span>` : `<span class="tag live">${esc(POINT_MAP_STATUS.label)}</span>`) },
      ],
    });
    $('[data-map-table]').appendChild(mapTable.el);
    mapTable.setRows(mappingRows());

    function renderThresholds() {
      $('[data-thr]').innerHTML = ZONES.map((z) => {
        const t = getThresholds(z.id);
        const ov = hasThresholdOverride(z.id);
        return `<tr data-zone="${z.id}"><td><strong>${esc(z.name)}</strong></td>
          ${FIELDS.map(([g, k, l]) => `<td><input class="input num" type="number" step="0.5" data-g="${g}" data-k="${k}" value="${t[g][k] ?? ''}" aria-label="${esc(z.name)} ${l}"></td>`).join('')}
          <td>${ov ? '<span class="tag">Browser override</span>' : '<span class="tag demo">Default (illustrative)</span>'}</td>
          <td class="nowrap"><button class="btn sm primary" type="button" data-save>Save</button> <button class="btn sm" type="button" data-reset ${ov ? '' : 'disabled'}>Reset</button></td></tr>`;
      }).join('');
    }
    renderThresholds();

    $('[data-thr]').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-zone]');
      if (!tr) return;
      const zoneId = tr.dataset.zone;
      const zone = ZONES.find((z) => z.id === zoneId);
      if (e.target.closest('[data-save]')) {
        const before = getThresholds(zoneId);
        const next = { temperature: { ...before.temperature }, humidity: { ...before.humidity } };
        tr.querySelectorAll('input[data-k]').forEach((inp) => { next[inp.dataset.g][inp.dataset.k] = inp.value === '' ? null : Number(inp.value); });
        const errs = validate(next);
        if (errs.length) { toast(errs[0], 'err'); return; }
        const changes = FIELDS.filter(([g, k]) => before[g][k] !== next[g][k]).map(([g, k, l]) => `${l} ${before[g][k] ?? '—'} → ${next[g][k] ?? '—'}`);
        if (!changes.length) { toast('No changes to save'); return; }
        const def = DEFAULT_THRESHOLDS[zoneId];
        const diff = { temperature: {}, humidity: {} };
        for (const [g, k] of FIELDS) if (def[g][k] !== next[g][k]) diff[g][k] = next[g][k];
        if (!saveThresholdOverride(zoneId, diff)) { toast('Could not save — browser storage unavailable', 'err'); return; }
        appendLocalAudit({ type: 'configuration', source: `Thresholds · ${zone.name}`, actor: 'This browser', description: `Threshold override saved (this browser only): ${changes.join('; ')}` });
        toast(`Thresholds saved for ${zone.name} (this browser only)`);
        renderThresholds(); store.refresh();
      } else if (e.target.closest('[data-reset]')) {
        clearThresholdOverride(zoneId);
        appendLocalAudit({ type: 'configuration', source: `Thresholds · ${zone.name}`, actor: 'This browser', description: 'Threshold override removed; illustrative defaults restored (this browser only)' });
        toast(`Defaults restored for ${zone.name}`);
        renderThresholds(); store.refresh();
      }
    });

    $('[data-apply]').addEventListener('click', () => {
      const mode = $('[data-mode]').value;
      const v = validateGatewayUrl($('[data-gw]').value);
      $('[data-gw-err]').textContent = v.ok ? '' : v.error;
      if (!v.ok) return;
      const prev = { mode: getMode(), url: getGatewayUrl() };
      if (!saveConnection({ mode, gatewayUrl: v.url })) { toast('Could not save — browser storage unavailable', 'err'); return; }
      $('[data-gw]').value = v.url;
      if (prev.mode !== mode || prev.url !== v.url) {
        appendLocalAudit({ type: 'configuration', source: 'Data source', actor: 'This browser', description: `Data source changed (this browser only): ${prev.mode}${prev.url ? ' ' + prev.url : ''} → ${mode}${v.url ? ' ' + v.url : ''}` });
      }
      toast(mode === 'demo' ? 'Switched to demonstration mode' : 'Connecting to gateway…');
      store.start();
    });

    $('[data-geo]').addEventListener('click', () => { clearGeocodeCache(); toast('Cached location cleared; the map will geocode again on the Overview'); });

    function update(s) {
      const g = s.gateway;
      $('[data-ds-status]').innerHTML = `
        <dt>Current mode</dt><dd>${esc(s.mode.toUpperCase())}${s.mode === 'demo' ? ' — illustrative data' : ''}</dd>
        <dt>Gateway</dt><dd>${esc(g.status)}${g.message ? ` — ${esc(g.message)}` : ''}</dd>
        <dt>Last health check</dt><dd>${g.checkedAt ? esc(dateTime(g.checkedAt)) : '—'}</dd>`;
    }
    return { update };
  },
};
