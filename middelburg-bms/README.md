# Middelburg Pharmaceutical Facility — BMS dashboard

Frontend for the Spartcon Technologies BMS at the Middelburg pharmaceutical warehouse
(Tridium JACE / Niagara N4). Plain HTML, CSS and JavaScript (ES modules), no build step.
Libraries and fonts are vendored in `vendor/` (works on a closed network).

See **AUDIT.md** for the data audit: where every number comes from and what was fixed.

## Run

```powershell
git clone https://github.com/Siphiwe-Khumalo/Lumenlabscreatives.git
cd Lumenlabscreatives
git checkout claude/gifted-sagan-4ugtao
cd middelburg-bms
npm run dev          # http://localhost:8080
```

No `npm install` is needed to run it. `npm install && npm run vendor` only refreshes `vendor/`.

## Data honesty rules (enforced in `js/data/quality.js` and `js/data/store.js`)

| State | Meaning | Display |
|---|---|---|
| **LIVE** | current good value | the value, with "Updated n s ago" |
| **STALE** | no update within 2 × the effective poll period, or JACE connection lost | — + STALE + small "last good: 5.2 °C at 14:32" |
| **OFFLINE** | sensor / comms down, or the JACE reports fault / down / disabled | — + OFFLINE + last good |
| **NOT MAPPED** | no controller point (or the JACE says the point does not exist) | — + NOT MAPPED |
| **OUT OF RANGE** | value outside the plausible sensor range | — + OUT OF RANGE |

- Only LIVE readings carry a value. A last good value is never shown large.
- Trends: non-live samples break the line (no smoothing, no bridging) and the period is
  hatched grey with "Sensor offline from 09:12". History is stored with its quality.
- A thin run-state strip (RUNNING / STOPPED / FAULT / UNKNOWN) sits under every
  temperature/humidity trend for the units of that zone; hover shows e.g.
  "Hybrid unit 3 (HYB-03) fan stopped 09:12 to 09:47". Fan-off periods are shaded on the chart
  and the unit card shows a FAN OFF badge.
- JACE connection lost → red banner "JACE connection lost: readings are not live", every value
  STALE, all controls disabled.
- DEMO is an explicit flag (default **off**): Settings → Data source → "DEMO — simulated data",
  or `window.MBMS_DEMO = true` (the hosted copy). A permanent "SIMULATED DATA" banner shows on
  every page while it is on.

## Controls page (landing page)

- Summary strip: units running, active alarms, sensors offline, comms status.
- One card per unit — 6 hybrid (blue), 5 rooftop (violet). Each control shows
  **COMMANDED** vs **ACTUAL** side by side.
- No optimistic UI: after a command the control shows **PENDING** until the feedback point
  confirms it; after `controls.confirmTimeoutMs` (60 s) it shows **NOT CONFIRMED** in red with
  the actual value. "Overridden by <source>" is shown when the JACE reports another source or a
  higher priority is driving the point.
- Every command has a confirm step (old → new); setpoints outside the zone's setpoint limits
  are rejected. Controls are disabled (reason on hover) when the point is NOT MAPPED / not LIVE,
  comms are lost, or the user is a Viewer.
- Roles (top bar): **Viewer** (no controls), **Operator** (controls), **Admin** (controls +
  settings). Every command is logged in the Audit Trail: who, role, when, what, point, old → new,
  result (SENT / CONFIRMED / NOT CONFIRMED / FAILED).
- Scroll down: **Live readings** per zone with temperature, humidity, the units serving the zone,
  and 1 h / 24 h / 7 d trends with limit lines, alarm markers and run strips.

| Unit | Control | Writes | Confirmed by | Actual shown |
|---|---|---|---|---|
| Rooftop | Start / stop | `UninStartCmd` | read-back of `UninStartCmd` — **TODO** | `UnitnSAF` (supply fan) |
| Rooftop | Unit enable | — (output, status only) | — | `UnitnEnable` |
| Rooftop | Temperature setpoint (slider) | `UnitnSetpoint` | read-back of `UnitnSetpoint` | space temperature |
| Hybrid | BMS switch | `BMS_Enable` — **TODO vs BMSControl** | read-back — **TODO** | `SUPPLY_AIR_FAN` |
| Hybrid | Mode Cool / Heat / Fan only | `COOL_MODE`, `HEAT_MODE`, `FAN_ONLY_MODE` (chosen ON, others OFF) | read-back of all three | `SUPPLY_AIR_FAN` |
| Hybrid | Temperature setpoint, fan speed | read-only | — | — |
| Both | Auto / manual, schedule | **NOT MAPPED** (no point supplied) | — | — |
| Both | Humidity setpoint | not shown (no unit supplies one) | — | — |

## Site points

`js/config/points.js` is the only file with point names. Unit 1 of each type was supplied; units
2–n follow the same pattern (`RUT_1…RUT_5`, `HYBRID_1…HYBRID_6`) — 166 points. Names are kept
exactly as supplied (including `Uni1StartCmd` and `STATIC_PESSURE_SETPOINT`). The app sends the slot
path (`Drivers/...`); the gateway adds `station:|slot:/`. Verify each derived point on the
Commissioning page.

## Gateway contract (proposed — the gateway is not part of this repo)

```
GET  {gateway}/health                       -> 200 { "status": "ok" }
GET  {gateway}/query/readPoint/<slot path>  -> 200 { "value": 21.4, "status": "{ok}",
                                                     "timestamp"?: "<ISO>", "activeLevel"?: 8,
                                                     "overrideSource"?: "..." }
                                               404 when the point does not exist (NOT MAPPED)
PUT  {gateway}/query/writePoint/<slot path>?value=<v>&priority=<n>
GET  {gateway}/query/history/<slot path>?from=&to=  -> 200 { "points": [[ts, value, status], ...] }
```

The gateway holds the JACE credentials, serialises requests to the JACE (one in flight), must
enforce real sign-in and roles, and should log commands centrally. Until the history endpoint
exists, 24 h / 7 d trends show "Historian not configured" in live mode; the 1 h trend uses
readings recorded by the dashboard on every poll (kept for 2 h in this browser).

## To confirm with Aina (all marked TODO in code)

1. Feedback point for rooftop start/stop (`UnitnSAF` or `UnitnEnable`?).
2. Hybrid BMS switch: `BMS_Enable` or `BMSControl`? Is `BMSControl` the Auto/Manual point?
3. Write priority for dashboard commands (set to 8, `js/config/app-config.js`).
4. Rooftop run rule: is a started unit with its fan off cycling (STOPPED) or a FAULT?
5. Alarm point polarity (true = alarm), `UnitnMode` numeric values, units for fan speed / airflow / pressure.
6. Which unit's sensors represent each zone (`ZONE_SOURCES`), and the real limits.
7. Schedule and Auto/Manual points, if they exist.

## Structure

```
js/config/   points.js (point names), controls.js (controls & feedback), app-config.js,
             site.js, thresholds.js, settings-store.js (user/role, demo flag), layout.js, ...
js/data/     store.js, quality.js, connected-provider.js, demo-provider.js (DEMO only), ...
js/ui/       components.js, charts.js, trend-card.js, map.js, icons.js
js/pages/    controls (landing), overview, model, environment, alarms, trends, audit,
             commissioning, settings
```

The former HVAC Systems page was merged into Controls (unit cards, unit detail panel); `#/hvac`
redirects there. The unit fault grid was replaced by fault chips on each unit card and the unit
detail panel's point table.
