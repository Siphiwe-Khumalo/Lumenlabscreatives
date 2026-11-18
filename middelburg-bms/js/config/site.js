/* Site identity, zones and equipment. Zone names, unit allocation and
 * equipment names are ILLUSTRATIVE placeholders until confirmed by the
 * project team. */

export const SITE = Object.freeze({
  name: 'Middelburg Pharmaceutical Facility',
  subtitle: 'Facility Environmental Monitoring',
  location: 'Middelburg, Mpumalanga, South Africa',
  operator: 'Spartcon Technologies',
  timeZone: 'Africa/Johannesburg',
  timeZoneLabel: 'Africa/Johannesburg (SAST, UTC+02:00)',
  address: {
    label: 'Department of Health Office (Middelburg)',
    lines: ['14 Cnr. Dr. Mandela Drive & Jaspis Street', 'Middelburg, 1055', 'Mpumalanga, South Africa'],
    oneLine: 'Department of Health Office, 14 Cnr. Dr. Mandela Drive & Jaspis Street, Middelburg, 1055, Mpumalanga, South Africa',
    searchText: '14 Dr Mandela Drive & Jaspis Street, Middelburg, 1055, Mpumalanga, South Africa',
    status: 'Supplied Department of Health address — warehouse location to be confirmed',
    expectedState: 'Mpumalanga',
  },
});

export const NAMES_ILLUSTRATIVE = 'Illustrative names — to be confirmed with the project team';

export const ZONES = Object.freeze([
  { id: 'main-store', name: 'Main Store',     description: 'Bulk ambient storage' },
  { id: 'dispatch',   name: 'Dispatch',       description: 'Order picking and dispatch bay' },
  { id: 'storage-b',  name: 'Storage Zone B', description: 'Secondary ambient storage' },
  { id: 'receiving',  name: 'Receiving',      description: 'Goods receiving and quarantine' },
]);

/** Equipment groups. Shown as separate sections (hybrid on one side, rooftop on the other). */
export const EQUIPMENT_TYPES = Object.freeze({
  hybrid:  { label: 'Hybrid units',   short: 'Hybrid',  prefix: 'HYB' },
  rooftop: { label: 'Rooftop units',  short: 'Rooftop', prefix: 'RTU' },
  sensor:  { label: 'Room sensors',   short: 'Sensor',  prefix: 'SEN' }, // temperature, humidity, CO2 only
});

// 6 hybrid (VRF) units, one per warehouse supply line (lines 1–3 Warehouse 1, lines 4–6 Warehouse 2), + 5 rooftop units
// + 6 room sensors. Zone allocation is illustrative (zones still to be replaced by the real lines / support areas).
export const EQUIPMENT = Object.freeze([
  { id: 'HYB-01', type: 'hybrid',  name: 'Hybrid unit 1',  zoneId: 'main-store' }, // line 1
  { id: 'HYB-02', type: 'hybrid',  name: 'Hybrid unit 2',  zoneId: 'main-store' }, // line 2
  { id: 'HYB-03', type: 'hybrid',  name: 'Hybrid unit 3',  zoneId: 'main-store' }, // line 3
  { id: 'HYB-04', type: 'hybrid',  name: 'Hybrid unit 4',  zoneId: 'storage-b' },  // line 4
  { id: 'HYB-05', type: 'hybrid',  name: 'Hybrid unit 5',  zoneId: 'storage-b' },  // line 5
  { id: 'HYB-06', type: 'hybrid',  name: 'Hybrid unit 6',  zoneId: 'storage-b' },  // line 6
  { id: 'RTU-01', type: 'rooftop', name: 'Rooftop unit 1', zoneId: 'main-store' },
  { id: 'RTU-02', type: 'rooftop', name: 'Rooftop unit 2', zoneId: 'main-store' },
  { id: 'RTU-03', type: 'rooftop', name: 'Rooftop unit 3', zoneId: 'dispatch' },
  { id: 'RTU-04', type: 'rooftop', name: 'Rooftop unit 4', zoneId: 'receiving' },
  { id: 'RTU-05', type: 'rooftop', name: 'Rooftop unit 5', zoneId: 'storage-b' },
  { id: 'SEN-E1', type: 'sensor',  name: 'East sensor 1',  zoneId: 'storage-b' },
  { id: 'SEN-E2', type: 'sensor',  name: 'East sensor 2',  zoneId: 'storage-b' },
  { id: 'SEN-E3', type: 'sensor',  name: 'East sensor 3',  zoneId: 'dispatch' },
  { id: 'SEN-W1', type: 'sensor',  name: 'West sensor 1',  zoneId: 'receiving' },
  { id: 'SEN-W2', type: 'sensor',  name: 'West sensor 2',  zoneId: 'main-store' },
  { id: 'SEN-W3', type: 'sensor',  name: 'West sensor 3',  zoneId: 'main-store' },
]);

export const zoneById = (id) => ZONES.find((z) => z.id === id) || null;
export const equipmentById = (id) => EQUIPMENT.find((e) => e.id === id) || null;
/** HVAC units serving a zone (room sensors excluded; see sensorsForZone). */
export const equipmentForZone = (zoneId) => EQUIPMENT.filter((e) => e.zoneId === zoneId && e.type !== 'sensor');
export const sensorsForZone = (zoneId) => EQUIPMENT.filter((e) => e.zoneId === zoneId && e.type === 'sensor');

/** HVAC units only (sensors have no fan, run state or controls). */
export const isHvac = (e) => e.type !== 'sensor';
