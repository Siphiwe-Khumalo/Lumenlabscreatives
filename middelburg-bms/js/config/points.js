/* =============================================================================
 * POINT MAP — THE ONLY FILE THAT MAY CONTAIN POINT NAMES OR SLOT PATHS
 * -----------------------------------------------------------------------------
 * PLACEHOLDER — copied verbatim from ARC Glasshouse. NOT confirmed for the
 * Middelburg site. Replace when Aina supplies the real points.
 *
 * Everything else in the app talks in logical roles (roles.temperature,
 * roles.humidity, ...). To switch to the real site points, edit ROLE_POINTS,
 * BASE_PATH and the unit maps below — nothing else needs to change.
 *
 * Humidity is MONITORING ONLY on this site. No humidity / CO2 write or override
 * point is mapped, and none may be added here. ARC's CO2, humidity-demand,
 * override, UV-light and irrigation points are deliberately NOT carried over.
 * ============================================================================= */

export const POINT_MAP_STATUS = Object.freeze({
  placeholder: true,
  source: 'ARC Glasshouse (reference/arc/api.js)',
  label: 'Placeholder (ARC) — not confirmed',
  note: 'Replace when Aina supplies the real Middelburg points.',
});

/** Per-unit base path (ARC convention). `${unit}` is replaced by e.g. UNIT1. */
export const BASE_PATH = (unit) => `Drivers/BacnetNetwork/${unit}/points/`;

/**
 * Active role mappings. `writable` is false for every role: the temperature
 * setpoint write stays DISABLED until the point and the write permission /
 * priority are confirmed for the site.
 */
export const ROLE_POINTS = Object.freeze({
  temperature:         { point: 'SPACE_TEMP',        label: 'Space temperature',     unit: '°C',   kind: 'number',  scope: ['zone', 'equipment'], writable: false },
  humidity:            { point: 'RELATIVE_HUMIDITY', label: 'Relative humidity',     unit: '%RH',  kind: 'number',  scope: ['zone'], writable: false, monitoringOnly: true },
  temperatureSetpoint: { point: 'TEMP_SETPOINT',     label: 'Temperature setpoint',  unit: '°C',   kind: 'number',  scope: ['zone'], writable: false, writePriority: null },
  runStatus:           { point: 'UNIT_STATUS',       label: 'Run status',            unit: null,   kind: 'boolean', scope: ['equipment'], writable: false },
  operatingMode:       { point: 'UNIT_MODE',         label: 'Operating mode',        unit: null,   kind: 'enum',    scope: ['equipment'], writable: false,
                         // Heating / Cooling / Standby. Text values are matched by keyword.
                         // If the controller reports numeric states, map them here once confirmed.
                         enumMap: {} },
  enable:              { point: 'UNIT_ENABLE',       label: 'Unit enable',           unit: null,   kind: 'boolean', scope: ['equipment'], writable: false },
  airflow:             { point: 'AIR_FLOW',          label: 'Airflow',               unit: 'm³/h', unitConfirmed: false, kind: 'number', scope: ['equipment'], writable: false },
  fanSchedule:         { point: 'FAN_SCH',           label: 'Fan schedule',          unit: null,   kind: 'boolean', scope: ['equipment'], writable: false },
  // Optional, unused unless door monitoring is required on site.
  door:                { point: 'DOOR',              label: 'Door',                  unit: null,   kind: 'boolean', scope: [], writable: false, active: false },
});

/** Illustrative zone -> controller unit mapping (ARC unit numbers). */
export const ZONE_UNITS = Object.freeze({
  'main-store': 'UNIT1',
  'dispatch':   'UNIT2',
  'storage-b':  'UNIT3',
  'receiving':  'UNIT4',
});

/** Illustrative equipment -> controller unit mapping (ARC unit numbers). */
export const EQUIPMENT_UNITS = Object.freeze({
  'HVAC-01': 'UNIT1',
  'HVAC-02': 'UNIT2',
  'HVAC-03': 'UNIT3',
  'HVAC-04': 'UNIT4',
});

/** Returns the slot path for a role on a unit, or null when unmapped. */
export function slotPath(unit, role) {
  const def = ROLE_POINTS[role];
  if (!unit || !def || def.active === false) return null;
  return BASE_PATH(unit) + def.point;
}

/** Roles read for each scope, used by the connected provider. */
export function rolesFor(scope) {
  return Object.keys(ROLE_POINTS).filter((r) => ROLE_POINTS[r].scope.includes(scope) && ROLE_POINTS[r].active !== false);
}

/** Rows for the Settings page mapping table. */
export function mappingRows() {
  const rows = [];
  for (const [kind, map] of [['Zone', ZONE_UNITS], ['Equipment', EQUIPMENT_UNITS]]) {
    for (const [id, unit] of Object.entries(map)) {
      for (const role of rolesFor(kind.toLowerCase())) {
        rows.push({ kind, id, unit, role, label: ROLE_POINTS[role].label, path: slotPath(unit, role), writable: ROLE_POINTS[role].writable });
      }
    }
  }
  return rows;
}

/* -----------------------------------------------------------------------------
 * UNUSED REFERENCE SECTION — ARC SLOT_PATHS (verbatim copy goes here)
 * -----------------------------------------------------------------------------
 * The brief asks for the SLOT_PATHS block from reference/arc/api.js to be copied
 * here VERBATIM (including the $2e encoding, the "C02" spelling with a zero and
 * the UNIT9 HUMD$2eHUMDSCH exception) as an inert reference.
 *
 * TODO: reference/arc/ was not present in this repository when this app was
 * built and the ARC repository could not be read from the build session, so
 * the block has NOT been pasted. It is intentionally left empty rather than
 * reconstructed from memory. Paste it below unchanged; nothing imports it.
 *
 * Do NOT copy ARC's OAuth client ID / client secret into this file or anywhere
 * else in the frontend.
 * ----------------------------------------------------------------------------- */
export const ARC_SLOT_PATHS_REFERENCE = null; // paste verbatim ARC SLOT_PATHS here (unused)
