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
    writePoint: '/query/writePoint/', // + path ?value=&priority= (PUT) — unit enable only, when controls are enabled
    history: '/query/history/',       // + path ?from=&to= (GET) — proposed
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
    history: false, // gateway history endpoint (Niagara histories) — proposed
  },

  /** Write enable for the setpoint. Stays false until point + permission confirmed. */
  setpointWriteEnabled: false,

  /** Unit on/off toggles. LOCKED until the project team confirms the points,
   *  write priority and who may operate them. Flip `enabled` only then. */
  controls: {
    enabled: false,
    lockedReason: 'Controls not enabled yet — waiting for confirmed points and approval',
    writePriority: null,          // Niagara priority level to write at (e.g. 8), to be confirmed
    releaseSupported: false,      // "Return to auto" (release the priority) once confirmed
    confirmTimeoutMs: 60000,      // a command not confirmed by read-back within this time is reported as failed
    setpointStep: 0.5,            // °C per press of the − / + buttons
  },

  /** Live graphs: readings collected in the browser on every poll. */
  live: { windowMs: 60 * 60 * 1000, keepMs: 6 * 60 * 60 * 1000 },

  /** Permission model placeholder — no authentication exists in this frontend. */
  operatorName: 'Demo Operator',
});
