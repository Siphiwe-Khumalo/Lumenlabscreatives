// Prints the exact OAuth redirect URI derived from PUBLIC_BASE_URL and
// OAUTH_CALLBACK_PATH, for pasting into Google Cloud Console.
import { normaliseBaseUrl, normaliseCallbackPath, deriveRedirectUri } from '../src/config.js';

const base = process.env.PUBLIC_BASE_URL;
if (!base) {
  console.error('PUBLIC_BASE_URL is not set. Set it to your deployed backend origin, e.g. PUBLIC_BASE_URL=https://<your-host> npm run redirect-uri');
  process.exit(1);
}
try {
  console.log(deriveRedirectUri(normaliseBaseUrl(base), normaliseCallbackPath(process.env.OAUTH_CALLBACK_PATH)));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
