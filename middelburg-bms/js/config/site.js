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
});

// 6 hybrid + 5 rooftop = 11 units. Zone allocation is illustrative.
export const EQUIPMENT = Object.freeze([
  { id: 'HYB-01', type: 'hybrid',  name: 'Hybrid unit 1',  zoneId: 'main-store' },
  { id: 'HYB-02', type: 'hybrid',  name: 'Hybrid unit 2',  zoneId: 'dispatch' },
  { id: 'HYB-03', type: 'hybrid',  name: 'Hybrid unit 3',  zoneId: 'storage-b' },
  { id: 'HYB-04', type: 'hybrid',  name: 'Hybrid unit 4',  zoneId: 'receiving' },
  { id: 'HYB-05', type: 'hybrid',  name: 'Hybrid unit 5',  zoneId: 'main-store' },
  { id: 'HYB-06', type: 'hybrid',  name: 'Hybrid unit 6',  zoneId: 'storage-b' },
  { id: 'RTU-01', type: 'rooftop', name: 'Rooftop unit 1', zoneId: 'main-store' },
  { id: 'RTU-02', type: 'rooftop', name: 'Rooftop unit 2', zoneId: 'main-store' },
  { id: 'RTU-03', type: 'rooftop', name: 'Rooftop unit 3', zoneId: 'dispatch' },
  { id: 'RTU-04', type: 'rooftop', name: 'Rooftop unit 4', zoneId: 'receiving' },
  { id: 'RTU-05', type: 'rooftop', name: 'Rooftop unit 5', zoneId: 'storage-b' },
]);

export const zoneById = (id) => ZONES.find((z) => z.id === id) || null;
export const equipmentById = (id) => EQUIPMENT.find((e) => e.id === id) || null;
export const equipmentForZone = (zoneId) => EQUIPMENT.filter((e) => e.zoneId === zoneId);
