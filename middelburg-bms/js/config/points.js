/* =============================================================================
 * POINT MAP — THE ONLY FILE THAT MAY CONTAIN POINT NAMES OR SLOT PATHS
 * -----------------------------------------------------------------------------
 * PLACEHOLDER — copied verbatim from ARC Glasshouse. NOT confirmed for the
 * Middelburg site. Replace when Aina supplies the real points.
 *
 * Everything else in the app talks in logical roles (roles.temperature,
 * roles.supplyAirTemp, ...). To switch to the real site points, edit
 * ROLE_POINTS, BASE_PATH and the unit maps below — nothing else changes.
 *
 * Roles with `point: null` have NO placeholder: ARC had no equivalent, so no
 * name is invented. They read as "Not mapped" until the real point is added.
 *
 * Humidity is MONITORING ONLY on this site. No humidity / CO2 write or override
 * point is mapped, and none may be added here. ARC's CO2, humidity-demand,
 * override, UV-light and irrigation points are deliberately NOT carried over.
 * ============================================================================= */

export const POINT_MAP_STATUS = Object.freeze({
  placeholder: true,
  source: 'ARC Glasshouse (reference/arc/api.js)',
  label: 'Placeholder (ARC) — not confirmed',
  unmappedLabel: 'Not mapped — awaiting site points',
  note: 'Replace when Aina supplies the real Middelburg points.',
});

/** Per-unit base path (ARC convention). `${unit}` is replaced by e.g. UNIT1. */
export const BASE_PATH = (unit) => `Drivers/BacnetNetwork/${unit}/points/`;

/**
 * Role mappings.
 *  scope:  where the role is read ('zone' and/or 'equipment')
 *  types:  equipment types the role applies to (omit = all)
 *  writable: false everywhere until the point and write permission are confirmed.
 */
export const ROLE_POINTS = Object.freeze({
  // --- ARC placeholders (names copied from ARC) -------------------------------
  temperature:         { point: 'SPACE_TEMP',        label: 'Space temperature',     unit: '°C',   kind: 'number',  scope: ['zone', 'equipment'], writable: false },
  humidity:            { point: 'RELATIVE_HUMIDITY', label: 'Relative humidity',     unit: '%RH',  kind: 'number',  scope: ['zone'], writable: false, monitoringOnly: true },
  temperatureSetpoint: { point: 'TEMP_SETPOINT',     label: 'Temperature setpoint',  unit: '°C',   kind: 'number',  scope: ['zone', 'equipment'], writable: false, writePriority: null },
  runStatus:           { point: 'UNIT_STATUS',       label: 'Run status',            unit: null,   kind: 'boolean', scope: ['equipment'], writable: false },
  operatingMode:       { point: 'UNIT_MODE',         label: 'Operating mode',        unit: null,   kind: 'enum',    scope: ['equipment'], writable: false,
                         // Heating / Cooling / Standby. Text values are matched by keyword.
                         // If the controller reports numeric states, map them here once confirmed.
                         enumMap: {} },
  enable:              { point: 'UNIT_ENABLE',       label: 'Unit enable',           unit: null,   kind: 'boolean', scope: ['equipment'],
                         // The on/off toggle writes here once controls are enabled (APP_CONFIG.controls).
                         writable: false, writePriority: null },
  airflow:             { point: 'AIR_FLOW',          label: 'Airflow',               unit: 'm³/h', unitConfirmed: false, kind: 'number', scope: ['equipment'], writable: false },
  fanSchedule:         { point: 'FAN_SCH',           label: 'Fan schedule',          unit: null,   kind: 'boolean', scope: ['equipment'], writable: false },
  // Optional, unused unless door monitoring is required on site.
  door:                { point: 'DOOR',              label: 'Door',                  unit: null,   kind: 'boolean', scope: [], writable: false, active: false },

  // --- New roles for the 11 site units: NO placeholder exists ------------------
  supplyAirTemp:   { point: null, label: 'Supply air temperature', unit: '°C', kind: 'number',  scope: ['equipment'], writable: false },
  returnAirTemp:   { point: null, label: 'Return air temperature', unit: '°C', kind: 'number',  scope: ['equipment'], writable: false },
  fanStatus:       { point: null, label: 'Supply fan status',      unit: null, kind: 'boolean', scope: ['equipment'], writable: false },
  compressorStage: { point: null, label: 'Compressor stages on',   unit: null, kind: 'number',  scope: ['equipment'], writable: false },
  filterAlarm:     { point: null, label: 'Filter alarm',           unit: null, kind: 'boolean', scope: ['equipment'], writable: false },
  runHours:        { point: null, label: 'Run hours',              unit: 'h',  kind: 'number',  scope: ['equipment'], writable: false },
  faultCode:       { point: null, label: 'Fault code',             unit: null, kind: 'text',    scope: ['equipment'], writable: false },
  hybridStage:     { point: null, label: 'Hybrid stage',           unit: null, kind: 'text',    scope: ['equipment'], types: ['hybrid'], writable: false },
});

/** Zone reference sensors -> controller unit (illustrative, per ARC unit numbers). */
export const ZONE_UNITS = Object.freeze({
  'main-store': 'UNIT1',
  'dispatch':   'UNIT2',
  'storage-b':  'UNIT3',
  'receiving':  'UNIT4',
});

/** Equipment -> controller unit (illustrative). 11 units: hybrids UNIT1–6, rooftops UNIT7–11. */
export const EQUIPMENT_UNITS = Object.freeze({
  'HYB-01': 'UNIT1', 'HYB-02': 'UNIT2', 'HYB-03': 'UNIT3', 'HYB-04': 'UNIT4', 'HYB-05': 'UNIT5', 'HYB-06': 'UNIT6',
  'RTU-01': 'UNIT7', 'RTU-02': 'UNIT8', 'RTU-03': 'UNIT9', 'RTU-04': 'UNIT10', 'RTU-05': 'UNIT11',
});

/** Returns the slot path for a role on a unit, or null when unmapped. */
export function slotPath(unit, role) {
  const def = ROLE_POINTS[role];
  if (!unit || !def || def.active === false || !def.point) return null;
  return BASE_PATH(unit) + def.point;
}

/** Roles read for a scope (and equipment type). */
export function rolesFor(scope, type) {
  return Object.keys(ROLE_POINTS).filter((r) => {
    const d = ROLE_POINTS[r];
    return d.scope.includes(scope) && d.active !== false && (!type || !d.types || d.types.includes(type));
  });
}

/** Rows for the Settings mapping table and the Commissioning checklist. */
export function mappingRows(equipment = []) {
  const typeOf = Object.fromEntries(equipment.map((e) => [e.id, e.type]));
  const rows = [];
  for (const [kind, map] of [['Zone', ZONE_UNITS], ['Equipment', EQUIPMENT_UNITS]]) {
    for (const [id, unit] of Object.entries(map)) {
      for (const role of rolesFor(kind.toLowerCase(), typeOf[id])) {
        const path = slotPath(unit, role);
        rows.push({ kind, id, unit, role, label: ROLE_POINTS[role].label, path, mapped: !!path, writable: ROLE_POINTS[role].writable });
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
