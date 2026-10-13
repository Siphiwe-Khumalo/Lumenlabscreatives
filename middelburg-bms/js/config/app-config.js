/* Runtime configuration. Values here are defaults; Settings can override the
 * mode and gateway URL for this browser only (localStorage).
 *
 * SECURITY: no credentials, client IDs, client secrets or messaging tokens may
 * ever be placed in frontend code. The connected provider talks to a
 * SAME-ORIGIN gateway which holds credentials server-side (see README,
 * "Proposed gateway contract — proposed, not implemented"). */

export const APP_CONFIG = Object.freeze({
  /** 'demo' | 'connected'. OFFLINE is never configured; it is the result of a failed connection. */
  defaultMode: 'demo',

  /** Same-origin gateway base URL, e.g. '/bms-gateway'. Empty = not configured. */
  gatewayUrl: '',
  gatewayPaths: {
    health: '/health',
    readPoint: '/query/readPoint/',   // + encoded slot path (GET)
    writePoint: '/query/writePoint/', // + path ?value=&priority= (PUT) — NOT enabled in this app
  },

  pollIntervalMs: { demo: 5000, connected: 15000 },
  healthIntervalMs: 30000,
  requestTimeoutMs: 8000,

  /** A reading older than this is STALE and shown as Unknown. */
  staleAfterMs: 10 * 60 * 1000,

  /** Backend services that do not exist yet. */
  services: {
    alarmAcknowledgement: false,
    historian: false,
    notifications: false,
    audit: false,
  },

  /** Write enable for the setpoint. Stays false until point + permission confirmed. */
  setpointWriteEnabled: false,

  /** Permission model placeholder — no authentication exists in this frontend. */
  operatorName: 'Demo Operator',
});
