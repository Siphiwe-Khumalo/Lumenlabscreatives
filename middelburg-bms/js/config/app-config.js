/* Runtime configuration. Values here are defaults; Settings can override the
 * data source and gateway URL for this browser only (localStorage).
 *
 * SECURITY: no credentials, client IDs, client secrets or messaging tokens may
 * ever be placed in frontend code. The connected provider talks to a
 * SAME-ORIGIN gateway which holds credentials server-side (see README,
 * "Proposed gateway contract"). */

export const APP_CONFIG = Object.freeze({
  /**
   * DEMO flag. Default OFF. When on, every value is simulated by
   * js/data/demo-provider.js and a permanent "SIMULATED DATA" banner is shown
   * on every page. Can also be switched on per browser in Settings, or by a
   * page that sets window.MBMS_DEMO = true before loading (the hosted demo).
   */
  demo: false,

  /** Same-origin gateway base URL, e.g. '/bms-gateway'. Empty = not configured. */
  gatewayUrl: '',
  gatewayPaths: {
    health: '/health',
    readPoint: '/query/readPoint/',   // + encoded slot path (GET)
    writePoint: '/query/writePoint/', // + path ?value=&priority= (PUT)
    history: '/query/history/',       // + path ?from=&to= (GET) — proposed
  },

  pollIntervalMs: { demo: 5000, connected: 15000 },
  healthIntervalMs: 30000,
  requestTimeoutMs: 8000,

  /**
   * STALE rule: a reading is STALE when it has not been updated within
   * `factor` x the effective poll period. The effective period is the poll
   * interval plus the time the last read cycle took (166 points are read one
   * at a time, so a cycle is not instant).
   */
  stale: { factor: 2 },

  /** Plausible sensor ranges. A value outside its range is OUT OF RANGE and is not displayed. */
  plausibleRanges: {
    temperature: [-30, 70],
    temperatureSetpoint: [0, 40],
    humidity: [0, 100],
    fanSpeed: [0, 100],
    airflow: [0, 100000],
    staticPressure: [-1000, 3000],
    staticPressureSetpoint: [-1000, 3000],
  },

  /** Backend services that do not exist yet. */
  services: {
    alarmAcknowledgement: false,
    notifications: false,
    audit: false,          // central audit log (the dashboard keeps a browser log meanwhile)
    history: false,        // gateway history endpoint (Niagara histories) — proposed
  },

  /** Unit controls (Controls page). */
  controls: {
    enabled: true,
    // TODO(confirm with Aina): Niagara priority level for dashboard writes. 8 is the conventional
    // "manual operator" level, below life-safety (1–2) and above schedules. Change if the site differs.
    writePriority: 8,
    confirmTimeoutMs: 60000,      // no feedback within this time -> NOT CONFIRMED (red)
    setpointStep: 0.5,            // °C slider / step size
  },

  /** Browser-recorded history used for the 1 h trend (with quality per sample). */
  live: { windowMs: 60 * 60 * 1000, keepMs: 2 * 60 * 60 * 1000 },
});
