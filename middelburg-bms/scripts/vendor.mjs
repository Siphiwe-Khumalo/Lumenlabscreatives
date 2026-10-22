// Copies the runtime files of the npm dependencies into vendor/ so the app
// runs from any static server with no CDN and no build step.
// Usage: npm install && npm run vendor
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const out = (p) => join(root, 'vendor', p);

const copies = [
  ['leaflet/dist/leaflet.js', 'leaflet/leaflet.js'],
  ['leaflet/dist/leaflet.css', 'leaflet/leaflet.css'],
  ['leaflet/dist/images', 'leaflet/images'],
  ['leaflet/LICENSE', 'leaflet/LICENSE'],
  ['chart.js/dist/chart.umd.js', 'chartjs/chart.umd.js'],
  ['chart.js/LICENSE.md', 'chartjs/LICENSE.md'],
  ['@fontsource/plus-jakarta-sans/LICENSE', 'fonts/plus-jakarta-sans-LICENSE'],
  ['@fontsource/jetbrains-mono/LICENSE', 'fonts/jetbrains-mono-LICENSE'],
];
for (const w of [400, 500, 600, 700]) {
  copies.push([`@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-${w}-normal.woff2`, `fonts/plus-jakarta-sans-latin-${w}-normal.woff2`]);
}
for (const w of [400, 500, 600]) {
  copies.push([`@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff2`, `fonts/jetbrains-mono-latin-${w}-normal.woff2`]);
}

for (const [from, to] of copies) {
  mkdirSync(dirname(out(to)), { recursive: true });
  cpSync(nm(from), out(to), { recursive: true });
  console.log('vendored', to);
}
