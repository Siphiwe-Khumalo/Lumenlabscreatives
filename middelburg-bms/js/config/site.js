/* Site identity, zones and equipment. Zone and equipment names are
 * ILLUSTRATIVE placeholders until confirmed by the project team. */

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
  { id: 'main-store', name: 'Main Store',     description: 'Bulk ambient storage',   equipmentId: 'HVAC-01' },
  { id: 'dispatch',   name: 'Dispatch',       description: 'Order picking and dispatch bay', equipmentId: 'HVAC-02' },
  { id: 'storage-b',  name: 'Storage Zone B', description: 'Secondary ambient storage', equipmentId: 'HVAC-03' },
  { id: 'receiving',  name: 'Receiving',      description: 'Goods receiving and quarantine', equipmentId: 'HVAC-04' },
]);

export const EQUIPMENT = Object.freeze([
  { id: 'HVAC-01', name: 'Main Store air handling unit',     zoneId: 'main-store' },
  { id: 'HVAC-02', name: 'Dispatch air handling unit',       zoneId: 'dispatch' },
  { id: 'HVAC-03', name: 'Storage Zone B air handling unit', zoneId: 'storage-b' },
  { id: 'HVAC-04', name: 'Receiving air handling unit',      zoneId: 'receiving' },
]);

export const zoneById = (id) => ZONES.find((z) => z.id === id) || null;
export const equipmentById = (id) => EQUIPMENT.find((e) => e.id === id) || null;
