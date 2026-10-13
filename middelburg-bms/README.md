# Middelburg Pharmaceutical Facility — Facility Environmental Monitoring

Frontend for the Spartcon Technologies BMS at a pharmaceutical warehouse linked to a
Department of Health project in Middelburg, Mpumalanga, South Africa.

Plain HTML, CSS and JavaScript (ES modules). No framework, no build step. Libraries are
vendored in `vendor/`, so at runtime the only external requests are OpenStreetMap map tiles
and the Nominatim geocoder.

> **Status:** demonstration build. The point map, zone names, equipment names and
> thresholds are **placeholders**. No value in demo mode is site telemetry.

## Run

No `npm install` is needed to run the app; the libraries are already in `vendor/`.

```bash
git clone https://github.com/Siphiwe-Khumalo/Lumenlabscreatives.git
cd Lumenlabscreatives
git checkout claude/gifted-sagan-4ugtao
cd middelburg-bms
npm start                        # Node static server (any OS)
# or: python -m http.server 8080   (Windows: py -m http.server 8080; macOS/Linux: python3 ...)
# open http://localhost:8080/
```

Opening `index.html` directly from disk (file://) will not work: ES modules need a server.

To refresh the vendored libraries (only needed when you change versions):

```bash
npm install && npm run vendor
```

Testing hook: `http://localhost:8080/?geocode=fail#/overview` forces the map's
geocoding-failure fallback.

## Modes

| Mode | When | What you see |
|---|---|---|
| **DEMO** (default) | `defaultMode: 'demo'` or chosen in Settings | A persistent banner says all values are illustrative. Data comes only from `js/data/demo-provider.js`. |
| **CONNECTED** | Connected mode is chosen **and** a real gateway health check succeeds | Live reads through the gateway. Readings carry timestamps and quality. |
| **OFFLINE** | Connected mode is chosen but the gateway is not configured or is unreachable | Every reading is **Unknown**. Last-known values are never shown as current. |

Readings older than `staleAfterMs` (10 min), or with bad or missing quality, are shown as
**Unknown** and never count as Normal.

## Structure

```
index.html               shell (sidebar, header, banner)
css/app.css, print.css   styles; print.css drives the printable report
js/config/
  points.js              ONLY place with point names / slot paths (placeholder, from ARC)
  site.js                facility identity, address, zones, equipment (illustrative)
  thresholds.js          per-zone limits (illustrative)
  app-config.js          mode, gateway URL, polling, stale-after, service flags
  settings-store.js      browser-only overrides (localStorage)
js/data/
  demo-provider.js       all demonstration data
  connected-provider.js  gateway client (FIFO queue, quality, no mock fallback)
  request-queue.js       one request in flight, with timeouts
  quality.js             quality + status evaluation
  store.js               polling, mode resolution, derived status, subscribers
js/ui/                   icons, tables, drawer, charts, trend card, map
js/pages/                overview, environment, hvac, alarms, trends, audit, settings
vendor/                  leaflet 1.9.4, chart.js 4.4.9, Inter (@fontsource/inter 5.2.5)
```

## Replacing the placeholder points

Edit **only** `js/config/points.js`: `BASE_PATH`, `ROLE_POINTS[*].point`, `ZONE_UNITS`,
`EQUIPMENT_UNITS`. UI and data code use logical roles (`temperature`, `humidity`,
`temperatureSetpoint`, `runStatus`, `operatingMode`, `enable`, `airflow`, `fanSchedule`).
Humidity is monitoring-only. Do not add humidity or CO2 write or override points.

The verbatim ARC `SLOT_PATHS` reference block still needs to be pasted into
`ARC_SLOT_PATHS_REFERENCE` (see the TODO in that file). The ARC source was not available
when this app was built.

## Proposed gateway contract (proposed, not implemented)

The browser calls a **same-origin** gateway (`gatewayUrl`, empty by default). The gateway
holds all credentials (OAuth client, JACE user) server-side. **No credentials, client
secrets or messaging tokens may be placed in this frontend.**

```
GET  {gateway}/health                        -> 200 { "status": "ok" }
GET  {gateway}/query/readPoint/<slot path>   -> 200 { "value": 21.4, "timestamp": "<ISO>", "status": "ok"|"fault"|"stale"|"down" }
                                                404 when the point does not exist
PUT  {gateway}/query/writePoint/<slot path>?value=&priority=   (NOT used; writes disabled)
```

The gateway should serialise requests to the JACE, which could not handle concurrent
requests on one token. The browser also sends one request at a time. It should also
allow-list readable points, and should later add history, alarm and acknowledgement
endpoints.

## Not configured (shown as such in the UI)

Alarm acknowledgement service (demo-only acknowledgement), historian, WhatsApp/email
notifications, central audit log, setpoint writes (`writable: false`,
`setpointWriteEnabled: false`), equipment control.

## Facility location

The supplied address is a **Department of Health office, not a confirmed warehouse**. It is
geocoded at runtime with Nominatim (`countrycodes=za`, `addressdetails=1`). Matches must be
in Mpumalanga, because other towns are also called Middelburg. Queries get progressively
broader, the result is cached in localStorage for 30 days, and the precision (address,
street or town) is displayed. If geocoding fails, a fallback panel shows the address, a
Retry button and Google Maps links. No coordinates are hardcoded.

No regulatory compliance, certification or endorsement is claimed by this interface.
