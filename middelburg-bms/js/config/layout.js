/* Warehouse model layout. ILLUSTRATIVE — replace with the architectural
 * drawing. Coordinates are percentages of the building footprint
 * (x: 0–100 left→right, y: 0–100 back→front). */
export const LAYOUT_LABEL = 'Illustrative layout — replace with the architectural drawing';

export const ZONE_RECTS = Object.freeze({
  'receiving':  { x: 0,  y: 0,  w: 22, h: 100 },
  'main-store': { x: 22, y: 0,  w: 50, h: 68 },
  'storage-b':  { x: 72, y: 0,  w: 28, h: 68 },
  'dispatch':   { x: 22, y: 68, w: 78, h: 32 },
});

/** Loading docks drawn on the outer walls. side: 'left' | 'front'; pos in % along that wall. */
export const DOCKS = Object.freeze([
  { side: 'left', pos: 20, label: 'Dock R1' }, { side: 'left', pos: 45, label: 'Dock R2' },
  { side: 'front', pos: 40, label: 'Dock D1' }, { side: 'front', pos: 62, label: 'Dock D2' }, { side: 'front', pos: 84, label: 'Dock D3' },
]);

/** Unit positions. Hybrid units sit at floor/wall level; rooftop units on the roof. */
export const UNIT_POS = Object.freeze({
  'HYB-01': { x: 30, y: 8 },  'HYB-05': { x: 62, y: 8 },
  'HYB-02': { x: 30, y: 92 }, 'HYB-03': { x: 78, y: 8 },
  'HYB-04': { x: 6,  y: 90 }, 'HYB-06': { x: 94, y: 60 },
  'RTU-01': { x: 36, y: 30 }, 'RTU-02': { x: 64, y: 30 },
  'RTU-03': { x: 82, y: 95 }, 'RTU-04': { x: 11, y: 30 }, 'RTU-05': { x: 88, y: 28 },
});
