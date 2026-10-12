import { loadConfig, googleConfigured } from './config.js';
import { createApp } from './app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { app, batches } = createApp(config);
const recovered = batches.recoverInterrupted();
if (recovered) console.warn(`[startup] ${recovered} message(s) were mid-send when the server stopped; marked Uncertain for reconciliation.`);

app.listen(config.port, () => {
  console.log(`Lumen Outreach listening on port ${config.port}`);
  console.log(`Public base URL:       ${config.baseUrl}`);
  console.log(`OAuth redirect URI:    ${config.redirectUri}`);
  if (!googleConfigured(config)) console.warn('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set: Connect Gmail is disabled until they are.');
});
