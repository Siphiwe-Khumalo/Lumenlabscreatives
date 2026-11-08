# CLAUDE.md — Middelburg BMS dashboard (handover for Claude Code)

Read this first. It records everything decided and built so far, so a new session can carry on.
Last updated: 2026-11-04 (commit after `0807d37`). Branch: **`claude/gifted-sagan-4ugtao`**
in `Siphiwe-Khumalo/Lumenlabscreatives` (subfolder `middelburg-bms/`). No pull request has been opened.

The person you work with is **Siphiwe** (Spartcon Technologies). Siphiwe works on **Windows, PowerShell**,
under deadline pressure, and wants short, direct answers and commands to paste. Do not over-explain.
**Aina** is the site's Niagara/JACE engineer (station, points, Workbench, users). "The boss" asked for stored logs.

---

## 1. What this is

A web dashboard (BMS front end) for the **Middelburg pharmaceutical warehouse** (Department of Health office,
14 Cnr Dr Mandela Drive & Jaspis Street, Middelburg, Mpumalanga), built for **Spartcon Technologies**.
It monitors and controls **16 HVAC units** and reads **6 room sensors** on a **Tridium JACE (Niagara N4)** at **192.168.1.140**:

- **5 rooftop units** (`RTU-01`…`RTU-05`, BACnet, station folders `RUT_1`…`RUT_5`)
- **11 hybrid units** (`HYB-01`…`HYB-11`, station folders `HYBRID_1`…`HYBRID_11`: 1–5 on `ModbusAsyncNetwork`, 6–11 on `ModbusTcpNetwork`)
- **6 room sensors** (`SEN-E1`…`SEN-E3`, `SEN-W1`…`SEN-W3`: `Drivers/TempEast|TempWest/Modbus$20Tcp$20Gateway$20Device1…3`, temperature / humidity / CO₂, read-only)

It is modelled on Siphiwe's earlier **ARC Glasshouse** build (repo `Siphiwe-Khumalo/ARC_Final_Deployment`,
file `ARC FINAL DEPLOYMENT/api.js`), which talks to the same kind of JACE OSS REST API. ARC is a
browser-only app; Middelburg deliberately is **not** (see §6, decision 1).

It runs on a **host PC on the site LAN, 24/7** (`npm run dev`). Remote users reach it over the client's **VPN**.
A **demo copy** with simulated data is published as a private claude.ai artifact:
https://claude.ai/artifact/TCNuj5fU99CZYANgAhzZJS (version 7, built from `hosted.html`; no logo, no history logging; has the building banner and unit photos).

Host PC project path: **`C:\Users\siphi\Lumenlabscreatives\middelburg-bms`**. Always `cd` there before
`git pull` / `npm run …` (running `git pull` in `C:\Users\siphi` fails with "not a git repository").

---

## 2. Tech stack

- Plain **HTML + CSS + JavaScript ES modules**. **No build step, no framework, no npm install needed to run.**
- `package.json` has `"type": "module"`. Node scripts are `.mjs` and use only Node built-ins
  (`node:http`, `node:https`, `node:fs`) — **zero runtime dependencies**. Node 18+ (sandbox used v22).
- Vendored libraries in `vendor/` (works offline on the site network): Chart.js (`vendor/chartjs/chart.umd.js`),
  Leaflet (`vendor/leaflet/`), fonts Plus Jakarta Sans + JetBrains Mono (`vendor/fonts/*.woff2`).
  `npm install && npm run vendor` only refreshes these copies (`scripts/vendor.mjs`).
- The browser never talks to the JACE directly: it calls a **same-origin gateway** at `/gw/...` served by
  `scripts/serve.mjs`, which holds the credentials and forwards to the JACE.
- Storage: browser `localStorage` for UI settings/browser history/audit; **host-PC files** for long-term history
  (`data/history/`, see §5.9).

---

## 3. Commands (run in `C:\Users\siphi\Lumenlabscreatives\middelburg-bms`)

| Command | What it does |
|---|---|
| `git pull` | Get the latest code (branch `claude/gifted-sagan-4ugtao`). Browser: **Ctrl+Shift+R** after. |
| `npm run dev` (= `npm start`) | Starts `scripts/serve.mjs`: dashboard + JACE gateway + history logger on `http://localhost:8080`. Must stay running 24/7. Ctrl+C stops it. |
| `npm run setup` | Interactive: writes `.env` (JACE address, client ID, client secret pasted over several lines then Enter on an empty line). Prints secret length (must be **256**). |
| `npm run check` | `scripts/check-jace.mjs`: tests reachability, gets a token from `/ossRestApiServer/token`, lists points (`/query/listPoints`), reads `RUT_1/SPACE_TEMP1` trying path formats, saves the working `OSS_ORD_PREFIX`/`OSS_PATH_ENCODING` into `.env`, deletes legacy keys. Prints **WORKS** on success. Never prints the secret. |
| `npm run check-write` | `scripts/check-write.mjs`: reads `RUT_1/Unit1Setpoint` and writes the **same value back at priority 16**, printing the JACE's full reply (headers + body) for three variants. Diagnostic only. |
| `start-bms.cmd` | Windows start file for the host PC: runs `node scripts\serve.mjs` in a loop (restarts 10 s after a stop), output to `data\server.log`. Run at boot by the scheduled task "Middelburg BMS" (`schtasks /Create /TN "Middelburg BMS" /TR "C:\BMS\middelburg-bms\start-bms.cmd" /SC ONSTART /RU SYSTEM /RL HIGHEST`). |
| `npm run commission [-- HYB-02 RTU-01]` | `scripts/commission.mjs`: guided on-site HVAC commissioning, one unit at a time, after an authorisation prompt. Hybrids: cooling, heating (others OFF first, then the chosen ON), BMS off/on; rooftops: stop/start, setpoint +1 °C. Each command is read back from the JACE, then you answer what the unit physically did (y/n/s). Original values are restored afterwards. Writes `data/commissioning-<time>.csv/.md` with VERIFIED / COMMUNICATION VERIFIED / NOT VERIFIED / FAILED / NOT SUPPORTED. |
| `npm run check-points` | Reads every configured point once (read-only) and reports per unit what the JACE has; writes `data/check-points.csv`. |
| `npm run vendor` | Re-copies vendored libs from `node_modules` (needs `npm install` first). |

**Testing:** there is **no automated test suite** (`npm test` does not exist). Verification so far was:
`node --check <file>` for syntax, a mock JACE (small `node:http` server answering `/ossRestApiServer/token`,
`/query/readPoint/...`, `/query/writePoint/...`) plus Playwright screenshots/clicks (Playwright lived in the
cloud sandbox at `/opt/node-tools/node_modules`, not in this repo). Demo mode (`hosted.html`, or
Settings → Data source → DEMO) is the quickest way to check UI: `http://localhost:8080/hosted.html`.
Demo scenarios via URL: `hosted.html?scenario=normal|all-live|comms-lost|no-confirm`.

Never run `pkill -f <pattern>` with a pattern that matches your own shell command (it kills the shell, exit 144).

---

## 4. Folder structure and key files

```
middelburg-bms/
  index.html            Live app shell (sidebar with Department of Health logo, top bar, banners). Loads js/main.js.
  hosted.html           Same app with window.MBMS_DEMO = true (simulated data) — used for the claude.ai demo artifact.
  .env.example          Template for .env (credentials + settings). .env is git-ignored and never served.
  .gitignore            node_modules/, .env, data/
  README.md             User-facing docs (run, connect, data honesty, controls table, stored history, TODOs).
  AUDIT.md              Original data audit: where every number comes from, 12 honesty fixes.
  CLAUDE.md             This file.
  assets/doh-logo.png   Department of Health logo (sidebar + printed reports only; NOT on the demo artifact).
  assets/favicon.svg
  css/app.css           All styles. Design tokens on :root (navy #0B1F3A chrome, #F1F4F9 bg, teal #14A3A0 accent,
                        hybrid blue #2F6FED, rooftop violet #7C5CE6, temp orange #F28C28, humidity cyan #1CB5E0).
  css/print.css         Print styles (Trends "Print report").
  data/history/         (host PC only, git-ignored) logged readings — see §5.9.
  scripts/
    serve.mjs           HTTP server. Loads .env (literal values; # and $ allowed). Order per request:
                        history.handle -> gateway.handle -> static files. Static whitelist: index.html, hosted.html,
                        css/, js/, vendor/, assets/; refuses dotfiles. HOST default 127.0.0.1 (set HOST=0.0.0.0 for VPN).
                        Starts history logger when the gateway is configured and HISTORY_LOG is not off.
    jace-gateway.mjs    createGateway(env): token cache, serial queue, JACE requests, /gw routes, readPoint() for the logger.
    oss-auth.mjs        THE single source of how to talk to the OSS REST API (paths, token request, write format,
                        path encoding). Used by gateway, check-jace and check-write.
    history.mjs         createHistory({readPoint, root, env}): history logger + /gw/query/history + /gw/logs(.csv).
    check-jace.mjs      npm run check (see §3).
    check-write.mjs     npm run check-write (see §3).
    setup.mjs           npm run setup (writes .env, mode 0600).
    vendor.mjs          npm run vendor.
  js/
    main.js             Router + shell. PAGES: controls ("Units", landing), overview, model ("3D Model"),
                        environment ("Conditions"), alarms, trends, audit, commissioning, settings. #/hvac -> #/controls.
                        Top bar: connection pill, user name, role select (viewer/operator/admin), clock, wall-display
                        toggle, alarm bell. Banners: SIMULATED DATA / "JACE connection lost: readings are not live" /
                        not configured. tickAges() keeps "Updated n s ago" live.
    config/
      points.js         THE ONLY FILE WITH POINT NAMES. BASE_PATHS, ROLE_POINTS (roles -> point names per type),
                        EQUIPMENT_UNITS, ZONE_SOURCES, pointName(), slotPath(), controllerName(), rolesForType(),
                        alarmRoles(), mappingRows(). ORD_PREFIX 'station:|slot:/' (not sent; gateway decides).
      controls.js       CONTROL_DEFS per unit type (see §5.2).
      app-config.js     APP_CONFIG: demo:false, gatewayUrl '/gw', pollIntervalMs {demo 5000, connected 15000},
                        stale.factor 2, plausibleRanges, services {history:true, others false},
                        controls {enabled:true, writePriority:1, confirmTimeoutMs:60000, setpointStep:0.5,
                        setpointRange:[15,35]}, live {windowMs 1h, keepMs 2h}.
      site.js           SITE, ZONES (main-store, dispatch, storage-b, receiving — ILLUSTRATIVE names), EQUIPMENT
                        (16 units + 6 sensors with zoneId — ILLUSTRATIVE allocation), EQUIPMENT_TYPES (hybrid, rooftop, sensor), isHvac(), equipmentForZone() (HVAC only), sensorsForZone().
      layout.js         3D/plan model geometry: ZONE_RECTS (% of footprint), DOCKS, UNIT_POS — ILLUSTRATIVE.
      thresholds.js     Per-zone limits (ILLUSTRATIVE): temp action 13/27, alert 15/25; RH alert 60, action 65.
      settings-store.js localStorage 'mbms.settings.v1': mode/demo, scenario, user {name, role}, gateway URL,
                        threshold overrides; local audit 'mbms.localAudit.v1' (cap 1000). getGatewayUrl() falls back
                        to '/gw' when the saved value is empty (fixed a "No gateway URL is configured" bug).
      calibration.js, notifications.js (WhatsApp/email escalation POLICY only — nothing is sent).
    data/
      store.js          App state + polling. poll(), apply(), finalise() (STALE on connection loss, lastGood),
                        deriveRunState(), deriveMode(), derivedConditions() (alarms from limits/fault points),
                        record()/push() (browser history 'mbms.history.v2'), withBreaks(), getUnitSeries(),
                        getZoneSeries(), getRunSegments(), RANGES (1h/24h/7d/30d), controlDefs(),
                        commandedValue(), controlAvailability(), setpointLimits() (15–35 for every unit),
                        sendCommand() (PENDING immediately via refreshView()), checkCommands() (CONFIRMED /
                        NOT CONFIRMED after 60 s / override), auditCommand(), setUser(), canOperate(), isAdmin(),
                        start()/stop()/refresh(), acknowledge() (demo only).
      connected-provider.js  createConnectedProvider(gatewayUrl): readPoint (404 -> NOT MAPPED; non-200 -> OFFLINE
                        with the gateway's message; override from status/activeLevel), snapshot() (throws
                        ConnectionLostError if every read fails), series() -> readHistory() (/gw/query/history),
                        command(unitId, role, value) -> PUT /gw/query/writePoint/<slot>?value=&priority=.
      demo-provider.js  createDemoProvider(scenario): simulated site incl. RTU-01 temp outage, RTU-04 comms lost,
                        HYB-03 BMS off, RTU-02 setpoint overridden at priority 5; simulates written values.
      quality.js        QUALITY states (live/stale/offline/not-mapped/out-of-range), normalise(), evaluate(), worst().
      request-queue.js  Browser-side request queue (one gateway request in flight).
      analytics.js      meanKineticTemperature(), excursions(), formatDuration().
    pages/              One module per page (see §5). Each exports { mount(root) -> { update(state), destroy? } }.
    ui/
      components.js     statusChip, qualityChip, readingHTML, bigReadingHTML, ageHTML, runChip, fanHTML (ducted fan
                        SVG, spins only when fan point LIVE and ON; glow blue cool / orange heat / teal fan-only),
                        toggleHTML, confirmDialog (with audit note), openDrawer, createTable, toast.
      charts.js         Chart.js wrapper: overlayPlugin (limit lines, hatched "Sensor offline" bands, fan-off bands,
                        alarm markers), qualityBands(), lineChart(), legendHTML(), MEASURE_COLORS.
      trend-card.js     mountTrend(el, cfg) with run-state strips; mountTrendCard(el, measure).
      map.js            Leaflet/OpenStreetMap facility location (geocoding needs internet; falls back to links).
      icons.js
    util/format.js      esc, num, dateTime (SAST "YYYY-MM-DD HH:MM:SS"), time, timeSec, day, ago...
    util/storage.js     readJSON/writeJSON/remove with try/catch.
```

---

## 5. Features and status

Legend: ✅ working (tested) · 🟡 partial / unconfirmed · ❌ not built / broken.

### 5.1 Connection to the JACE — ✅ reads, ✅ writes (confirmed on site)
- Token, reads of the original 166 points, and writes all work on site (writes needed admin rights on the API client).
- Gateway routes (`scripts/jace-gateway.mjs` → `handle()`):
  - `GET /gw/health` → token check.
  - `GET /gw/query/readPoint/<slot path>` → `{ value, status, timestamp?, activeLevel? }` (normalises JSON or
    Niagara text like `21.40 °C {ok} @ def`). 404 → "Point not found".
  - `PUT /gw/query/writePoint/<slot path>?value=&priority=` → JACE write (see §6).
- Real JACE replies are JSON `{"value":"18.00","status":"ok"}` (value is a **string**; status can be `stale`).

### 5.2 Units page (`js/pages/controls.js`, landing page `#/controls`) — ✅
- Summary tiles (units running, active alarms, sensors offline, comms), filter All/Hybrid/Rooftop,
  tab **Units | Readings & trends** (zone readings + 1h/24h/7d trends with run strips, lazy-loaded).
- One card per unit: fan graphic, name, `RTU-01 · Main Store`, state pill (Running/Stopped/Fault/No data),
  temperature + humidity (rooftop) or fan speed (hybrid), fault chips, controls, read-only facts.
- Controls (`js/config/controls.js` CONTROL_DEFS):
  - Rooftop `startStop` toggle → writes `Uni{n}StartCmd` (role `startCommand`); feedback = read-back of the same
    point (**TODO** confirm SAF vs Enable); "Unit reports fan running/off" from `Unit{n}SAF`.
  - Rooftop `enableStatus` → **status only** (`Unit{n}Enable` is an output, not a command — Siphiwe's instruction).
  - Rooftop `tempSetpoint` → − / + stepper (0.5 °C steps, **15–35 °C**) + Apply → writes `Unit{n}Setpoint`.
  - Hybrid `bms` toggle → writes `BMS_Enable` (**TODO**: or `BMSControl`?).
  - Hybrid `mode` Cool/Heat/Fan only → writes chosen flag ON and the other two OFF (`COOL_MODE`, `HEAT_MODE`,
    `FAN_ONLY_MODE`).
  - Hybrid setpoint `ROOM_TEMP_SETPOINT` read-only; fan speed read-only.
  - `autoManual`, `schedule` → NOT MAPPED (no points supplied), hidden from cards.
- Every command: confirm dialog (old → new, optional reason) → **Sending…** → **Confirmed** when the feedback point
  matches, or **Not confirmed** after 60 s (`confirmTimeoutMs`), "Overridden by …" when a higher priority holds it.
  Logged to the Audit Trail. Viewer role cannot operate. Default role: Operator.
- Unit name opens a drawer: all points with quality and slot path + temperature trend.

### 5.3 Data honesty rules — ✅ (non-negotiable, from the original spec)
Only LIVE values are shown. States LIVE / STALE (no update within 2 × effective poll) / OFFLINE / NOT MAPPED /
OUT OF RANGE; non-live shows "—" + grey label + small "last good: … at …". Trends break the line on gaps and hatch
"Sensor offline from 09:12". Connection lost → red banner, everything STALE, controls disabled. DEMO flag default
off; when on, a permanent "SIMULATED DATA" banner. Do not weaken these.

### 5.4 3D Model (`js/pages/model.js`, `#/model`) — ✅ (layout illustrative)
Isometric SVG computed from `layout.js` (`buildScene(view, s)`, `box()`, `unitSVG()`, `fanGlyph()`, `partitions()`,
`planeMatrix()`): shaded walls with windows, glass partitions, glass roof, rooftop units on the roof, hybrids on the
floor, fans spinning in perspective when running, status LED, alarm badge, zones tinted by status. 3D/Plan toggle
(`mbms.modelView.v2`). HTML overlay cards per zone + unit tags; `declutter()` moves zone cards off units/tags.
SVG is rebuilt only when it changes (fans keep spinning). Zone click → `#/environment?zone=…`; unit click → drawer.

### 5.5 Overview (`overview.js`), Conditions (`environment.js`), Alarms (`alarms.js`), Audit (`audit.js`),
Commissioning (`commissioning.js`), Settings (`settings.js`) — ✅ / 🟡
- Overview: summary cards, all-zone trends, zone table, recent events, facility map (Leaflet; geocoding fails offline).
- Conditions: per-zone readings, limits, setpoint range (now fixed text "15 °C to 35 °C (all units)"), MKT (30 d,
  now from host history), calibration placeholders.
- Alarms: derived in the browser from limits and fault points (`derivedConditions()`). 🟡 **Acknowledge works in demo
  only** (`services.alarmAcknowledgement:false`); no central alarm store.
- Audit Trail: 🟡 **per browser only** (localStorage `mbms.localAudit.v1`) — not central, not tamper-proof.
- Commissioning: list of all 289 points with live status, to verify derived points (units 2–n) on site.
- Settings: data source (connected / DEMO + scenario), user name, thresholds (admin only), controls info.
  Setpoint min/max fields were removed (range is global 15–35).

### 5.6 Trends (`js/pages/trends.js`, `#/trends`) — ✅
Zone filter, 1h/24h/7d/30d, temperature + humidity charts, period summary (min/max/mean/MKT/% outside),
excursion report, HVAC operating-state history, Print report (logo + header), Export CSV, **Stored logs** card.
1 h uses browser-recorded readings; 24 h+ use host-PC history (gaps > 11 min break the line).

### 5.7 Design — ✅
Simplified "techy but pharmaceutical" look (Nov 2026 redesign): navy sidebar with white Department of Health logo
panel, short menu (Units, Overview, 3D Model, Conditions, Alarms, Trends | Audit Trail, Commissioning, Settings),
soft white cards, large mono numbers, coloured reading tiles. Works at phone width (no horizontal scroll).

### 5.8 Demo artifact — ✅ (version 7, 2026-11-08)
Published with the Artifact tool from `hosted.html` with `root` = this folder and the changed files listed in `files`.
Update by publishing to `url: https://claude.ai/artifact/TCNuj5fU99CZYANgAhzZJS` (read/list files first; the tool
refuses overwriting unread files). It does **not** have the Stored-logs text or the logo (deliberately — no
government branding on a shared link without the Department's sign-off).

### 5.9 Stored history / logs (`scripts/history.mjs`) — ✅ against a mock, 🟡 not yet run on the real JACE
- While `npm run dev` runs, `logOnce()` reads **every point of every unit and sensor (289)** every `LOG_INTERVAL_MIN` (default 5,
  aligned to the clock) via `gateway.readPoint()` and appends to:
  - `data/history/daily/YYYY-MM-DD.csv` (SAST day): `Time (SAST),Unit,Unit name,Reading,Value,Units,Status,Point`
  - `data/history/points/<UNIT>/<role>/YYYY-MM.csv`: `ts_ms,value,status`
- Failed reads are logged with status `down: <reason>` (explicit gaps). Files are append-only. ~4–5 MB/day.
- Routes (handled before the gateway): `GET /gw/query/history/<slot>?from=<ms>&to=<ms>` →
  `{points:[[ts,value,"{status}"]], intervalMin}`; `GET /gw/logs` → `{days, intervalMin, dir, last}`;
  `GET /gw/logs.csv?from=YYYY-MM-DD&to=YYYY-MM-DD[&unit=RTU-01]` → CSV download (UTF-8 BOM for Excel).
- Run-state strips for 24 h+ derive from logged `fanStatus` (running / stopped / unknown).
- History only exists from when logging started; PC off = gap. `data/` must be backed up (not in git).

### 5.10 Not built ❌
- **Phone alerts (WhatsApp + SMS fallback)** for alarms — agreed in principle (host PC 24/7, VPN, client prefers
  WhatsApp, SMS fallback; JACE has no alarm limits/email configured). Siphiwe has not said "start".
- Real **login/authentication** (the role select is client-side only; anyone who can open the page can operate).
- Central audit log and alarm acknowledgement on the server.
- Schedules and Auto/Manual (no points supplied).
- Architectural floor plan (layout is illustrative).

---

## 6. Key decisions and why

1. **Credentials stay server-side.** The OAuth client ID/secret live only in `.env` on the host PC; the browser calls
   `/gw`. Never put credentials, tokens or WhatsApp/SMS keys in frontend code or git. (ARC put its client secret in
   browser JS in a public repo — see §9.) Never print the secret; `npm run check` prints only its length.
2. **One shared OSS module** (`oss-auth.mjs`). A bug came from the gateway using a stale `.env` key
   (`OSS_TOKEN_PATH=/oauth/token`) while the check used the right path; failed logins then locked the client out.
   Now paths are fixed in code and `OSS_TOKEN_PATH`, `OSS_READ_PATH`, `OSS_WRITE_PATH` are ignored
   (`LEGACY_ENV_KEYS`, removed from `.env` by `npm run check`).
3. **One token, one request at a time.** The JACE's embedded OAuth issuer invalidates the previous token when a new
   one is minted (seen on ARC; Aina's own tooling uses the same client). Gateway: single cached token, one refresh in
   flight (shared promise), a 401 only refreshes if the failing token is still current, all JACE requests serialised.
   After a refused login the gateway waits **5 min** (`LOGIN_COOLDOWN_MS`) before trying again — no hammering.
4. **Write format = ARC's**: `PUT /ossRestApiServer/query/writePoint/<segment-encoded slot>?value=<v>&priority=<p>`,
   `Authorization: Bearer`, `Accept: application/json`, `Content-Length: 0` (no chunked bodies). Values: `true`/`false`,
   numbers like `21.5`. Default `OSS_WRITE_STYLE=put-query`; the other styles in `WRITE_STYLES` are diagnostic only.
5. **Write priority 1** (tried 8 on 2026-11-08, reverted to 1 the same day by Siphiwe) — see §11.10/12. Nothing at 2–16
   (schedules, logic, Aina's Workbench overrides) can override a dashboard command. Tradeoff accepted; revert by
   changing that one constant (16 was tried first).
6. **No optimistic UI**: a command is PENDING until the feedback point confirms it.
7. **Setpoint range 15–35 °C for every unit** (`setpointRange`), 0.5 °C steps — Siphiwe's instruction.
8. **Unit enable is an output, not a command** (rooftop). Start/stop is the command. Hybrid: BMS switch + mode buttons.
9. **History as plain CSV files on the host PC**, not a database server: zero install, opens in Excel, append-only,
   easy to back up. Revisit (e.g. SQLite / Niagara histories) only if size or queries become a problem.
10. **Logo** only in the live app (sidebar, print), not on the shared demo.

---

## 7. JACE / OSS REST API reference

- JACE: **`https://192.168.1.140`** (HTTPS only; HTTP refused; self-signed cert → `JACE_ALLOW_SELF_SIGNED=true`).
  Root redirects to `/ord`; unauthenticated requests redirect to `/login`.
- API base: **`/ossRestApiServer`** (NOT `/ossRestApi`, NOT `/oauth/token`). Same as ARC's `OSS_BASE_URL`.
- Token: `POST /ossRestApiServer/token`, `Authorization: Basic base64(client_id:client_secret)`,
  `Content-Type: application/x-www-form-urlencoded`, body `grant_type=client_credentials&scope=read write`.
  Reply `{access_token, expires_in}` (expires_in observed as a huge number). Implemented in `fetchToken()`.
- Read: `GET /ossRestApiServer/query/readPoint/<slot path>` — slot path **without** `station:|slot:/` prefix, each
  segment URL-encoded (`pointSuffix(slot, '', 'segments')`). Reply `{"value":"18.00","status":"ok"}`.
- Write: see decision 4. A generic HTML `400 Bad Request` (no message) means the API **may not write** the point
  (it was the client's permissions) or the point doesn't exist; the API's own 400s carry a message.
- List: `GET /ossRestApiServer/query/listPoints` (used by `npm run check` step 2b, and by ARC to discover paths).
- Credentials: a **new client** was issued by Aina (client ID starts `NIwA…`, secret **256** characters with many
  special characters — paste it exactly). Stored only in the host PC's `.env`. It was pasted into chat — **ask Aina
  to rotate it** once things are stable, then `npm run setup`. The API client now has **admin** rights (needed for
  writes); reduce to operator-write on `Drivers/BcpBacnetNetwork` and `Drivers/ModbusAsyncNetwork` when possible.
- `.env` keys: `JACE_URL`, `OSS_CLIENT_ID`, `OSS_CLIENT_SECRET`, optional `JACE_USER`/`JACE_PASSWORD` (station user with
  HTTPBasicScheme instead of OAuth; fallback, unused), `OSS_SCOPE` (default `read write`), `OSS_AUTH_STYLE` (`basic`),
  `OSS_ORD_PREFIX` (empty), `OSS_PATH_ENCODING` (`segments`), `OSS_WRITE_STYLE` (`put-query`), `OSS_TIMEOUT_MS` (8000),
  `JACE_ALLOW_SELF_SIGNED`, `HOST` (`0.0.0.0` for VPN), `PORT` (8080), `LOG_INTERVAL_MIN` (5),
  `HISTORY_DIR` (`data/history`), `HISTORY_LOG` (`on`/`off`).
- Quick fix to write `.env` from PowerShell without Notepad (single quotes; the secret has no `'`):
  `Set-Content .env -Encoding ascii -Value @('JACE_URL=https://192.168.1.140','OSS_CLIENT_ID=…','OSS_CLIENT_SECRET=…','JACE_ALLOW_SELF_SIGNED=true','HOST=0.0.0.0','PORT=8080')`
  — or just `npm run setup`.

### Point mapping (`js/config/points.js`) — 289 points
These are **real site point names from Aina** (unit 1 of each type supplied; units 2–n derived by changing the
number). **None are ARC placeholders.** Names are kept exactly, including the misspellings `Uni{n}StartCmd` and
`STATIC_PESSURE_SETPOINT`. Derived points (n ≠ 1) still need verifying on the Commissioning page.

Rooftop `Drivers/BcpBacnetNetwork/OFFICES/points/RUT_{n}/` (n = 1…5), 8 points:

| Role | Point | Notes |
|---|---|---|
| temperature | `SPACE_TEMP{n}` | zone temperature source |
| humidity | `R_Humidity{n}` | monitoring only |
| unitAlarm | `Unit{n}Alarm` | true = alarm (ASSUMED) |
| fanStatus | `Unit{n}SAF` | supply air fan |
| mode | `Unit{n}Mode` | numeric values unconfirmed |
| startCommand | `Uni{n}StartCmd` | **written** (start/stop) |
| enable | `Unit{n}Enable` | output, status only |
| temperatureSetpoint | `Unit{n}Setpoint` | **written** (15–35) |

Hybrid `Drivers/ModbusAsyncNetwork/HYBRID_{n}/points/` (n = 1…5) and `Drivers/ModbusTcpNetwork/HYBRID_{n}/points/` (n = 6…11;
split set by `HYBRID_TCP_FROM = 6` in `points.js`), 21 points each (same names in every unit). Aina's Nov 2026 document
"new path for third party integration" says "ModbusTcpNetwork HYBRID_6 TO 11" with HYBRID_7 as the example — **TODO confirm
HYBRID_6** is on the TCP network (not Async). Supplied verbatim: HYBRID_1 and HYBRID_7; the rest derived:
`BMS_Enable` (**written**, BMS switch), `BMSControl`, `REMOTE_STATUS`, `COOL_MODE`/`HEAT_MODE`/`FAN_ONLY_MODE`
(**written**, mode), `SUPPLY_AIR_FAN`, `FAN_SPEED`, `CALCULATED_AIRFLOW`, `STATIC_AIR_PRESSURE`,
`STATIC_PESSURE_SETPOINT`, `STATIC_PRESSURE_STATUS`, `ROOM_TEMP_AVERAGE`, `ROOM_TEMP_SETPOINT` (read-only),
alarms `SUPPLY_AIR_FAN_TRIP`, `NO_AIRFLOW`, `STATIC_PRESSURE_FAILURE`, `ROOM_TEMP1_FAILURE`, `ROOM_TEMP2_FAILURE`,
`ONCOIL_TEMP_FAILURE`, `DIRTY_FILTER`.

Room sensors (same document), type `sensor`, read-only, 3 points each, `n` = 1…3, side East/West:
`Drivers/TempEast/Modbus$20Tcp$20Gateway$20Device{n}/points/` and `Drivers/TempWest/...`: `SpaceTemp` (temperature),
`RelativeHumidity` (humidity), `C02` (role `co2`, ppm — spelled with a zero). `$20` is Niagara's escaped space and is
kept in the slot path; the encoder sends `$` as `%24` (ARC does the same with `CO2$2eC02SCH`). Units page shows them in a
"Room sensors" group; 3D model draws them as teal posts; they have no run state (`deriveRunState` returns `'sensor'`) and are
excluded from HVAC counts and run-state history. **TODO**: which zone each sensor is in, and whether zone readings should
come from these sensors instead of `ZONE_SOURCES` (rooftop units).

`npm run check-points` (`scripts/check-points.mjs`) reads all 289 points once and prints, per unit, found / missing / stale,
plus `data/check-points.csv`. Run it on site after any point change.

Things in config that ARE placeholders (illustrative, to replace): zone names and unit→zone allocation
(`site.js`), `ZONE_SOURCES` (`points.js`: main-store→RTU-01, dispatch→RTU-03, storage-b→RTU-05, receiving→RTU-04),
limits (`thresholds.js`), model geometry (`layout.js`), facility address status (`site.js`).

---

## 8. Open issues, blockers, in-progress

1. 🟡 **History logger not yet run on the real JACE.** After `git pull` + restart, the console should show
   `History: logging 289 points every 5 min …` then `[history] … logged 289 points` every 5 min. Check
   `data\history\daily\` and Trends → Stored logs. The logger adds 289 reads per 5 min to the JACE's serial queue on
   top of the dashboard's 15 s polling — watch for slow polling / STALE flicker.
2. 🟡 **Stale points on the JACE**: `RUT_1/SPACE_TEMP1` read `{"value":"0.00","status":"stale"}`. Aina must make
   points poll continuously (proxy points poll only when subscribed; e.g. add history extensions / tuning policy) or fix
   comms to the OFFICES BACnet device. Dashboard correctly shows STALE.
3. 🟡 **Leftover test write**: `npm run check-write` wrote `RUT_1 Unit1Setpoint = 18.00` at **priority 16**. Harmless
   (dashboard writes at 1) but Aina may want to release slot 16.
4. 🟡 **TODOs to confirm with Aina** (marked `TODO(confirm)` in code): start/stop feedback point (`Unit{n}SAF` vs
   `Unit{n}Enable`); hybrid BMS switch `BMS_Enable` vs `BMSControl` (and is `BMSControl` Auto/Manual?); rooftop run
   rule (started + fan off = STOPPED or FAULT?); alarm polarity; `Unit{n}Mode` values; units of fan speed / airflow /
   pressure; `ZONE_SOURCES`; real limits; schedule and Auto/Manual points; architectural layout.
5. 🟡 **Security**: no real login (role select is client-side); API client has admin; secret exposed in chat (rotate);
   ARC repo is public and its `api.js` contains its OAuth client secret in plain text (rotate ARC's secret, move it
   server-side). `HOST=0.0.0.0` exposes the dashboard to the whole VPN.
6. 🟡 Audit trail and alarm acknowledgement are per-browser only.
7. ❌ Phone alerts not built (§5.10).
8. Demo artifact is at version 7 (16 units + sensors, photos, banner; no Stored-logs text, no logo). Update only if Siphiwe asks.

---

## 9. Lessons from ARC (read `ARC FINAL DEPLOYMENT/api.js` and `scheduler.js` before changing write logic)

- **Write priority conflicts with other integrators on the same JACE.** On ARC, writes at priority 16 and 8 returned
  HTTP 200 but **never took effect** (CO2, UV lighting `LIGHT1_sch`, irrigation `ValveSch_2`): something else — most
  likely Aina's interface, or a stale earlier priority-1 write never relinquished — held a higher priority. A priority-1
  probe stuck immediately, so ARC set `WRITE_PRIORITY = 1` app-wide (2026-10-01). Middelburg copies this. Consequences:
  - A BACnet/Niagara point's value is the highest non-null **priority slot**, not the last write. Always **read back**
    after writing (Middelburg: `checkCommands()`; ARC: `writeAndVerifySlot()` with `VERIFY_DELAY_MS = 1200`).
  - If a command shows **Not confirmed** / "Overridden by priority N", another system holds a higher slot — talk to
    Aina; don't just raise ours. At priority 1 we now override everyone, including Aina's Workbench overrides.
  - To release a slot you must **relinquish** it (write null at that priority). ARC's `relinquishPriority()` probe found
    the server rejects a write without `value` ("Write request must contain a value parameter"); `value=null` /
    empty string were still being tested — the correct relinquish syntax is **unconfirmed**.
  - ARC also had a `holdPointValue()` loop that re-writes a point every 5 s when something on the JACE resets it. It is
    a workaround that fights other logic; Middelburg does **not** do this.
- **Scheduling via browser JS direct point writes (ARC `scheduler.js`).** ARC has no browser-side timers: the
  scheduler page reads and writes the JACE's own schedule points directly (`LightSch_n`, `ValveSch_n`; `VALVE_n`
  read-only), resolving slot paths at runtime from `/query/listPoints` (`discoverSchedulePoints()`), interpreting the
  value it reads (boolean = enable/disable; `"HH:MM-HH:MM"` string = time window, overnight-aware; anything else =
  read-only), writing via `writeSchedulePoint()` and confirming by read-back. Lessons: (1) a Niagara **Schedule
  component re-evaluates on its own** — forcing its output (ARC's `CO2_Sched = false`) gets overwritten; change the
  schedule's configured periods instead; (2) never pretend a device runs on a timer in the browser; the JACE is the
  source of truth; (3) a browser that is closed runs nothing — anything that must happen on time belongs on the JACE
  (or the 24/7 host PC). If Middelburg gets schedule points, follow this pattern: discover, read, write the JACE
  schedule, verify.
- **Token invalidation**: ARC added up to 4 re-auth retries with jitter because Aina's tooling shares the same OAuth
  client and minting a token kills ours. Middelburg instead serialises everything and refreshes only when the failing
  token is still current; if Siphiwe sees intermittent 401s while Aina works, this is why (a separate client for the
  dashboard would fix it).
- **ARC parallel-read overload**: ARC fired ~20 reads in parallel and the JACE choked; it now queues one at a time
  (`enqueueJaceRequest`). Middelburg's gateway and browser queue both keep one request in flight.
- **Don't ship credentials in browser JS** (ARC did, in a public repo).

---

## 10. Next steps, in order

1. On the host PC: `cd C:\Users\siphi\Lumenlabscreatives\middelburg-bms` → `git pull` → stop and restart
   `npm run dev` → Ctrl+Shift+R. Confirm the logo, the new UI, and the `History: logging 289 points…` line.
2. After 10–15 min: check `data\history\daily\<today>.csv` opens in Excel, and Trends → 24 h shows recorded data and
   Stored logs downloads a CSV. Fix anything that differs from the mock (value formats, `down:` rows, speed).
3. With Aina: make stale points poll continuously; verify all derived points on the Commissioning page (units 2–5 / 2–6).
4. With Aina: answer the §8.4 TODOs, then update `js/config/controls.js` (feedback roles, BMS point), `points.js`
   (`ZONE_SOURCES`), `site.js` (zone names / allocation), `thresholds.js` (approved limits), `layout.js` (real plan).
5. Security hardening: rotate the OAuth secret (`npm run setup`), reduce the API client to operator-write, add a real
   login on the server (users/roles checked in `serve.mjs`, not just the browser), move the audit trail to the host PC
   (append-only file like history), consider a dedicated OAuth client for the dashboard.
6. Phone alerts service on the host PC (only when Siphiwe says go): WhatsApp primary, SMS fallback, escalation
   (`js/config/notifications.js` policy), acknowledgement, delay/debounce, heartbeat if the PC/JACE goes silent;
   keys in `.env`, never in the frontend.
7. Back-up plan for `data/history` (e.g. nightly copy to a network share); optional retention/compression.
8. Update the demo artifact if Siphiwe wants (publish `hosted.html` to the URL in §1).

Commit style used so far: short imperative subject, body optional, ending with the Co-Authored-By / Claude-Session
trailer lines the harness provides. Push with `git push -u origin claude/gifted-sagan-4ugtao`. Don't open a PR unless asked.

---

## 11. Final audit (2026-11-08) — fixes made

Tested end-to-end against a simulated JACE (point store with priorities, 400 on writes to read-only points, controller
logic: fan follows command, heat+cool overlap detected). Not yet re-tested on the real JACE.
1. **Mode change briefly set heat AND cool ON** (`sendCommand` wrote the chosen flag first). Now: other flags OFF first,
   then the chosen ON. Mock: 1 overlap event before, 0 after.
2. **`refresh()` reset the `polling` flag mid-poll**, starting a second overlapping poll (temporary double JACE load,
   older snapshot could be applied after a newer one). Now one loop only (`refreshQueued`).
3. **Command confirmation waited for the full 289-point cycle** (6–11 s on the mock, longer on site). Now
   `verifyCommand()` reads only the feedback points at 1.5 s / 5 s / 15 s (`provider.readOne`) → ~1.7 s.
4. **Partial mode-write failure was reported as a plain failure**; now says which points were already written.
5. **Gateway**: commands jump the queue (`serial(fn, {priority:true})`); shared read cache `READ_CACHE_MS` (5 s) with
   in-flight de-duplication so several screens + the history logger don't multiply JACE load; cache cleared per point on write.
6. **Site results 2026-11-08** (`npm run check-write`): hybrid `HYBRID_9/COOL_MODE` and `HEAT_MODE` refuse writes
   (HTTP 400 → read-only on the JACE; hybrid mode change cannot work until Aina makes them writable or names the real
   mode command point). Rooftop `RUT_1/Unit1Mode` is a writable **boolean** (reads "false", write HTTP 200). Rooftop
   Heat/Cool buttons exist but stay hidden until `APP_CONFIG.controls.rooftopModeWhenTrue` is set to 'heating' or
   'cooling' (Aina to confirm). HYB-09 reads 0.0 °C / setpoint 0.0 / fan 0 with status ok → Modbus TCP link suspect.
7. **False "overridden" warning removed** (our own priority-1 writes show status overridden); command refusals now show
   the JACE's reason; partial mode changes are rolled back automatically.
8. **Aina, 2026-11-08: rooftop `Unit{n}Mode` true = HEATING** (`rooftopModeWhenTrue: 'heating'`) → rooftop cards have
   Heat / Cool buttons. **Hybrids are READ-ONLY** (monitoring only): no hybrid role is controllable, hybrid cards show
   BMS / mode / fan / setpoint as facts, and the gateway refuses any write outside the allowlist (`WRITABLE` in
   `jace-gateway.mjs`: 15 points = RTU start/stop, setpoint, mode). `npm run commission` does a read-only check on hybrids.
9. **Aina, later on 2026-11-08: rooftop heating/cooling changes over AUTOMATICALLY.** `Unit{n}Mode` is now display-only
   (true = heating). The Heat/Cool buttons were removed: a priority-1 write would lock the mode and stop the changeover.
   Writable points are now 10: rooftop `Uni{n}StartCmd` and `Unit{n}Setpoint`. Earlier tests may have written
   `Unit{n}Mode` at priority 1 (RTU-01 check-write, possibly RTU-02/03 via commission/dashboard): Aina must release
   priority 1 on those points in Workbench, or the changeover stays locked.
10. **Write priority is now 8** (manual operator; Siphiwe, 2026-11-08), was 1. Leftover priority-1 values from earlier
    tests (RTU `Uni{n}StartCmd`, `Unit{n}Setpoint`, `Unit{n}Mode`) out-rank the dashboard until released (Workbench:
    Actions > Auto, or `node scripts/release.mjs <unit> <role> 1`, experimental).
11. **Fire dampers** (Aina): `Drivers/BcpBacnetNetwork/FIRE$20DAMPERS/points/HYBRID_{n}_FireDamper`, n = 6…11 only.
    Role `fireDamper` (boolean, read-only, no alarm; meaning of true/false TODO). Uses `ROLE_POINTS[role].paths` (a point
    outside the unit's folder) and `rolesForUnit(id)` (roles that exist on that unit). Total points now 295.
12. **Priority back to 1** (Siphiwe, 2026-11-08, after 8 left commands "Not confirmed" behind leftover priority-1 values).
    Gateway: point reads time out after `OSS_READ_TIMEOUT_MS` (4 s); a unit folder that gives no answer 3 times is skipped
    for 30 s (log: "not answering"), so a dead Modbus network no longer slows commands. All 11 hybrids read OFFLINE on
    site at that time: check Modbus networks / `npm run check-points`.
13. **Site decision 2026-11-08: heating, cooling and temperature setpoint are READ, not commanded.** The only writable
    points are the 5 rooftop start commands `Uni{n}StartCmd` (gateway `WRITABLE` allowlist). Rooftop setpoint shown as a
    fact; the setpoint stepper is gone. `npm run commission` reports setpoint NOT SUPPORTED.
