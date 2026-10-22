# Data audit — Middelburg BMS dashboard

Audit done before the redesign. Status column shows what the redesign did about each item.

## Stack
Plain HTML / CSS / JavaScript ES modules, no framework, no build step. Libraries vendored in
`vendor/` (Leaflet, Chart.js, fonts). `npm run dev` serves the folder with a small Node static
server (`scripts/serve.mjs`).

## Pages (hash routes)
`#/controls` (new landing page), `#/overview`, `#/model`, `#/environment`, `#/alarms`,
`#/trends`, `#/audit`, `#/commissioning`, `#/settings`. The old `#/hvac` page was merged into
`#/controls` (unit cards, unit detail panel and fault grid all moved there); `#/hvac` redirects.

## How points are read and written
- `js/config/points.js` is the only file with point names. Each logical role (temperature,
  fanStatus, startCommand, ...) maps to a slot path per unit type, e.g.
  `Drivers/BcpBacnetNetwork/OFFICES/points/RUT_1/SPACE_TEMP1`.
- `js/data/connected-provider.js` reads every point with `GET {gateway}/query/readPoint/<slot path>`
  through one FIFO queue (one request in flight, timeout), and writes with
  `PUT {gateway}/query/writePoint/<slot path>?value=&priority=`. The gateway (same origin) holds
  the JACE credentials. The gateway itself is proposed, not part of this repo.
- `js/data/store.js` polls, applies quality rules, derives zone and unit state, records history
  and handles commands with read-back confirmation.

## Where every displayed number comes from
| Display | Source |
|---|---|
| Unit space temperature / setpoint / humidity / fan speed / airflow / pressures | that unit's point, read every poll |
| Zone temperature / humidity | the point of the unit named in `ZONE_SOURCES` (illustrative mapping, to be confirmed) |
| Run state (RUNNING / STOPPED / FAULT / UNKNOWN) | derived from the unit's fan point and alarm points (rules in `store.js`) |
| Hybrid mode | COOL_MODE / HEAT_MODE / FAN_ONLY_MODE points |
| Alarms (connected) | derived in the browser from limits and unit alarm points |
| 1 h trends (connected) | history recorded in this browser on every poll, with quality, persisted locally |
| 24 h / 7 d trends (connected) | gateway history endpoint (proposed; shows "Historian not configured" until it exists) |
| MKT, excursions, min/max/mean | calculated from the trend data shown, gaps excluded |

## Places that generated, defaulted, simulated, smoothed or carried values forward
| # | Where | Problem | Status |
|---|---|---|---|
| 1 | `app-config.js` `defaultMode: 'demo'` | simulated data was the default | Fixed: DEMO is an explicit flag, default off; permanent "SIMULATED DATA" banner when on |
| 2 | `demo-provider.js` (whole file) | simulated values | Kept only behind the DEMO flag |
| 3 | `store.js` `seedLiveFromDemo` | pre-filled the live graph with simulated history | Removed; demo trends come from the demo provider's history, labelled simulated |
| 4 | `charts.js` `tension: 0.25` | curve smoothing between samples | Fixed: straight segments, no smoothing |
| 5 | `store.js` live buffer stored only good samples | the line was drawn straight across outages | Fixed: every poll stores a sample with its quality; non-live samples break the line and are hatched |
| 6 | `connected-provider.js` timestamp `?? Date.now()` | receive time used as the reading time without saying so | Kept as the read time (it is when the dashboard last obtained a good value) and labelled "read at"; a source timestamp is used when the gateway supplies one |
| 7 | `app-config.js` `staleAfterMs: 10 min` | far longer than the poll interval | Fixed: STALE after 2 × the effective poll period (configurable) |
| 8 | `store.js` offline snapshot | connection loss showed "Missing/Unknown" instead of STALE, last good value lost | Fixed: connection loss turns every point STALE and shows "last good" small |
| 9 | `components.js` `readingHTML` | non-live readings showed "Unknown" but no last-good context | Fixed: em dash, grey state label, small "last good" line |
| 10 | `demo-provider.js` `lastSample` floored timestamps to 30 s | demo readings looked older than they were | Fixed inside demo |
| 11 | Overview 1-hour delta | computed from history without checking quality | Fixed: only when both ends are live samples |
| 12 | HVAC on/off toggle (old) | showed the unit's state, controls locked | Replaced by the Controls page with COMMANDED / ACTUAL and read-back confirmation |
