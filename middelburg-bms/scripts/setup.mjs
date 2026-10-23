// One-time setup on the host PC: asks for the JACE OAuth client ID and secret and writes .env.
// Usage: npm run setup
// The secret may be pasted over several lines (as in the Word document): lines are joined
// without spaces until you press Enter on an empty line.
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envFile = join(root, '.env');
const template = readFileSync(join(root, '.env.example'), 'utf8');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const lines = [];
let resolveLine;
rl.on('line', (l) => { if (resolveLine) { const r = resolveLine; resolveLine = null; r(l); } else lines.push(l); });
const nextLine = () => (lines.length ? Promise.resolve(lines.shift()) : new Promise((r) => { resolveLine = r; }));
const ask = async (q) => { process.stdout.write(q); return (await nextLine()).trim(); };

(async () => {
  console.log('Middelburg BMS — JACE connection setup\n');
  if (existsSync(envFile)) {
    const a = await ask('.env already exists. Replace it? (y/N) ');
    if (!/^y/i.test(a)) { console.log('Nothing changed.'); rl.close(); return; }
  }
  const url = (await ask('JACE address [https://192.168.1.140]: ')) || 'https://192.168.1.140';
  const id = await ask('Client ID: ');
  console.log('Client secret: paste it (all lines), then press Enter on an empty line:');
  const parts = [];
  for (;;) { const l = (await nextLine()).trim(); if (!l) break; parts.push(l); }
  const secret = parts.join('');
  if (!id || !secret) { console.log('Client ID and secret are required. Nothing written.'); rl.close(); return; }
  const out = template
    .replace(/^JACE_URL=.*$/m, `JACE_URL=${url}`)
    .replace(/^OSS_CLIENT_ID=.*$/m, `OSS_CLIENT_ID=${id}`)
    .replace(/^OSS_CLIENT_SECRET=.*$/m, () => `OSS_CLIENT_SECRET=${secret}`);
  writeFileSync(envFile, out, { mode: 0o600 });
  console.log(`\nSaved .env (secret length ${secret.length} characters). Now run: npm run dev`);
  rl.close();
})();
