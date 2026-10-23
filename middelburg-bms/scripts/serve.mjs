// Dashboard server + JACE gateway (no dependencies, works on Windows/macOS/Linux).
// Usage: npm run dev   (or: node scripts/serve.mjs [port])
//
// Settings come from a .env file next to package.json (see .env.example). The .env file holds the
// JACE credentials: it is never served to browsers and never committed to git.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway } from './jace-gateway.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Minimal .env reader: KEY=value per line; the value is taken literally (# and $ allowed); quotes optional. */
function loadEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
const env = { ...loadEnv(join(root, '.env')), ...process.env };
const port = Number(process.argv[2] || env.PORT || 8080);
const host = env.HOST || '127.0.0.1'; // set HOST=0.0.0.0 on the host PC so VPN users can reach it
const gateway = createGateway(env);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
// Only these folders and files are served; everything else (including .env, scripts, node_modules) is refused.
const PUBLIC = [/^\/index\.html$/, /^\/hosted\.html$/, /^\/css\//, /^\/js\//, /^\/vendor\//, /^\/assets\//];

createServer(async (req, res) => {
  try {
    if (await gateway.handle(req, res)) return;
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') path = '/index.html';
    if (path.split('/').some((seg) => seg.startsWith('.')) || !PUBLIC.some((re) => re.test(path))) { res.writeHead(404).end('Not found'); return; }
    const file = normalize(join(root, path));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, host, () => {
  console.log(`Middelburg BMS running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/  (Ctrl+C to stop)`);
  console.log(gateway.configured
    ? `JACE gateway: ${gateway.cfg.jaceUrl} (token path ${gateway.cfg.tokenPath}${gateway.cfg.allowSelfSigned ? ', self-signed certificate allowed' : ''})`
    : `JACE gateway: NOT configured — create .env with ${gateway.missing.join(', ')} (see .env.example)`);
});
