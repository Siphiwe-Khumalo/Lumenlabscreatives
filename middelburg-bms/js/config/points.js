/* =============================================================================
 * POINT MAP — THE ONLY FILE THAT MAY CONTAIN POINT NAMES OR SLOT PATHS
 * -----------------------------------------------------------------------------
 * SITE POINTS supplied by the project team for RUT_1 (rooftop) and HYBRID_1
 * (hybrid). Units 2–n follow the same pattern with the unit number changed,
 * as instructed; those paths are DERIVED and must be verified on the
 * Commissioning page before handover.
 *
 * Point names are kept EXACTLY as supplied, including spellings such as
 * "Uni1StartCmd" and "STATIC_PESSURE_SETPOINT" — they must match the station.
 *
 * Supplied form:  station:|slot:/Drivers/...   (Niagara ORD)
 * Stored form:    Drivers/...                  (slot path; the gateway adds the ORD prefix)
 *
 * Humidity is MONITORING ONLY. No humidity write point is mapped.
 * Everything else in the app uses logical roles, never these names.
 * ============================================================================= */

export const POINT_MAP_STATUS = Object.freeze({
  placeholder: false,
  source: 'Site points supplied by the project team (unit 1 of each type)',
  label: 'Site point — supplied',
  derivedLabel: 'Site point — derived from unit 1 pattern, verify',
  unmappedLabel: 'Not available on this unit type',
  note: 'Units 2–n are derived by changing the unit number. Verify each on the Commissioning page.',
});

export const ORD_PREFIX = 'station:|slot:/';

/** Controller folders. `n` is the unit number (1, 2, 3 ...). */
export const BASE_PATHS = Object.freeze({
  rooftop: (n) => `Drivers/BcpBacnetNetwork/OFFICES/points/RUT_${n}/`,
  hybrid: (n) => `Drivers/ModbusAsyncNetwork/HYBRID_${n}/points/`,
});

/** Controller names shown in the UI (e.g. on the unit detail panel). */
export const CONTROLLER_NAME = Object.freeze({
  rooftop: (n) => `RUT_${n}`,
  hybrid: (n) => `HYBRID_${n}`,
});

/**
 * Roles. `points[type]` gives the point name for a unit number n (function) or
 * a fixed name (string). A type without an entry does not have that reading.
 *   kind: number | boolean | enum | text
 *   alarm: true -> the point is a fault/alarm flag (true = active, ASSUMED)
 *   writable: false everywhere until controls are approved.
 */
export const ROLE_POINTS = Object.freeze({
  // --- temperatures / humidity --------------------------------------------------
  temperature: { label: 'Space temperature', unit: '°C', kind: 'number',
    points: { rooftop: (n) => `SPACE_TEMP${n}`, hybrid: 'ROOM_TEMP_AVERAGE' } },
  temperatureSetpoint: { label: 'Temperature setpoint', unit: '°C', kind: 'number',
    points: { rooftop: (n) => `Unit${n}Setpoint`, hybrid: 'ROOM_TEMP_SETPOINT' } },
  humidity: { label: 'Relative humidity', unit: '%RH', kind: 'number', monitoringOnly: true,
    points: { rooftop: (n) => `R_Humidity${n}` } },

  // --- run / enable / mode -------------------------------------------------------
  enable: { label: 'Unit enable', kind: 'boolean',
    // The on/off toggle writes here once controls are approved (to be confirmed: Enable vs StartCmd / BMSControl).
    points: { rooftop: (n) => `Unit${n}Enable`, hybrid: 'BMS_Enable' } },
  startCommand: { label: 'Start command', kind: 'boolean', points: { rooftop: (n) => `Uni${n}StartCmd` } },
  bmsControl: { label: 'BMS control', kind: 'boolean', points: { hybrid: 'BMSControl' } },
  remoteStatus: { label: 'Remote status', kind: 'boolean', points: { hybrid: 'REMOTE_STATUS' } },
  fanStatus: { label: 'Supply air fan', kind: 'boolean',
    points: { rooftop: (n) => `Unit${n}SAF`, hybrid: 'SUPPLY_AIR_FAN' } },
  operatingMode: { label: 'Operating mode', kind: 'enum',
    // Rooftop mode is a single point. Map its numeric states here once known, e.g. { 1: 'cooling', 2: 'heating' }.
    enumMap: {},
    points: { rooftop: (n) => `Unit${n}Mode` } },
  coolMode: { label: 'Cool mode', kind: 'boolean', points: { hybrid: 'COOL_MODE' } },
  heatMode: { label: 'Heat mode', kind: 'boolean', points: { hybrid: 'HEAT_MODE' } },
  fanOnlyMode: { label: 'Fan-only mode', kind: 'boolean', points: { hybrid: 'FAN_ONLY_MODE' } },

  // --- air side (hybrid) ---------------------------------------------------------
  fanSpeed: { label: 'Fan speed', unit: '%', unitConfirmed: false, kind: 'number', points: { hybrid: 'FAN_SPEED' } },
  airflow: { label: 'Calculated airflow', unit: 'm³/h', unitConfirmed: false, kind: 'number', points: { hybrid: 'CALCULATED_AIRFLOW' } },
  staticPressure: { label: 'Static air pressure', unit: 'Pa', unitConfirmed: false, kind: 'number', points: { hybrid: 'STATIC_AIR_PRESSURE' } },
  staticPressureSetpoint: { label: 'Static pressure setpoint', unit: 'Pa', unitConfirmed: false, kind: 'number', points: { hybrid: 'STATIC_PESSURE_SETPOINT' } },
  staticPressureStatus: { label: 'Static pressure status', kind: 'boolean', points: { hybrid: 'STATIC_PRESSURE_STATUS' } },

  // --- alarms / faults -------------------------------------------------------------
  unitAlarm: { label: 'Unit alarm', kind: 'boolean', alarm: true, severity: 'critical', points: { rooftop: (n) => `Unit${n}Alarm` } },
  fanTrip: { label: 'Supply air fan trip', kind: 'boolean', alarm: true, severity: 'critical', points: { hybrid: 'SUPPLY_AIR_FAN_TRIP' } },
  noAirflow: { label: 'No airflow', kind: 'boolean', alarm: true, severity: 'critical', points: { hybrid: 'NO_AIRFLOW' } },
  staticPressureFailure: { label: 'Static pressure failure', kind: 'boolean', alarm: true, severity: 'warning', points: { hybrid: 'STATIC_PRESSURE_FAILURE' } },
  roomTemp1Failure: { label: 'Room temperature sensor 1 failure', kind: 'boolean', alarm: true, severity: 'warning', points: { hybrid: 'ROOM_TEMP1_FAILURE' } },
  roomTemp2Failure: { label: 'Room temperature sensor 2 failure', kind: 'boolean', alarm: true, severity: 'warning', points: { hybrid: 'ROOM_TEMP2_FAILURE' } },
  oncoilTempFailure: { label: 'On-coil temperature sensor failure', kind: 'boolean', alarm: true, severity: 'warning', points: { hybrid: 'ONCOIL_TEMP_FAILURE' } },
  dirtyFilter: { label: 'Dirty filter', kind: 'boolean', alarm: true, severity: 'warning', points: { hybrid: 'DIRTY_FILTER' } },
});

/** Equipment -> controller (type + unit number). */
export const EQUIPMENT_UNITS = Object.freeze({
  'HYB-01': { type: 'hybrid', n: 1 }, 'HYB-02': { type: 'hybrid', n: 2 }, 'HYB-03': { type: 'hybrid', n: 3 },
  'HYB-04': { type: 'hybrid', n: 4 }, 'HYB-05': { type: 'hybrid', n: 5 }, 'HYB-06': { type: 'hybrid', n: 6 },
  'RTU-01': { type: 'rooftop', n: 1 }, 'RTU-02': { type: 'rooftop', n: 2 }, 'RTU-03': { type: 'rooftop', n: 3 },
  'RTU-04': { type: 'rooftop', n: 4 }, 'RTU-05': { type: 'rooftop', n: 5 },
});

/**
 * Which unit's sensors represent each zone (ILLUSTRATIVE — to be confirmed).
 * Humidity exists only on rooftop units, so zones read from a rooftop unit.
 */
export const ZONE_SOURCES = Object.freeze({
  'main-store': 'RTU-01',
  'dispatch':   'RTU-03',
  'storage-b':  'RTU-05',
  'receiving':  'RTU-04',
});
export const ZONE_ROLES = ['temperature', 'humidity', 'temperatureSetpoint'];

/** Point name for a role on a unit, or null when that unit type has no such point. */
export function pointName(equipmentId, role) {
  const u = EQUIPMENT_UNITS[equipmentId];
  const p = u && ROLE_POINTS[role]?.points[u.type];
  if (!p) return null;
  return typeof p === 'function' ? p(u.n) : p;
}

/** Slot path for a role on a unit, or null when unavailable. */
export function slotPath(equipmentId, role) {
  const name = pointName(equipmentId, role);
  if (!name) return null;
  const u = EQUIPMENT_UNITS[equipmentId];
  return BASE_PATHS[u.type](u.n) + name;
}

export const controllerName = (equipmentId) => {
  const u = EQUIPMENT_UNITS[equipmentId];
  return u ? CONTROLLER_NAME[u.type](u.n) : '';
};

/** Roles available for an equipment type. */
export function rolesForType(type) {
  return Object.keys(ROLE_POINTS).filter((r) => ROLE_POINTS[r].points[type]);
}
export const alarmRoles = (type) => rolesForType(type).filter((r) => ROLE_POINTS[r].alarm);

/** Rows for the Settings mapping table and the Commissioning checklist. */
export function mappingRows() {
  const rows = [];
  for (const [id, u] of Object.entries(EQUIPMENT_UNITS)) {
    for (const role of rolesForType(u.type)) {
      rows.push({
        kind: u.type === 'hybrid' ? 'Hybrid' : 'Rooftop', id, controller: controllerName(id), role,
        label: ROLE_POINTS[role].label, path: slotPath(id, role), ord: ORD_PREFIX + slotPath(id, role),
        mapped: true, derived: u.n !== 1, writable: false,
      });
    }
  }
  return rows;
}
