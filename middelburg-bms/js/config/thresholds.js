/* Per-zone limits.
 * ILLUSTRATIVE — replace with approved site requirements. These values are
 * demonstration defaults only; they are not derived from any approved
 * specification and imply no regulatory compliance.
 *
 * alertLow/alertHigh  -> outside = Warning   (acceptable range is between them)
 * actionLow/actionHigh-> outside = Critical
 * setpointMin/Max     -> permitted setpoint adjustment range (writes disabled)
 * null = no limit on that side.
 *
 * A Settings override stored in localStorage (this browser only) is merged on
 * top of these defaults by js/config/settings-store.js. */

export const THRESHOLDS_LABEL = 'Illustrative — replace with approved site requirements';

const ambient = {
  temperature: { actionLow: 13, alertLow: 15, alertHigh: 25, actionHigh: 27, setpointMin: 17, setpointMax: 23 },
  humidity:    { actionLow: null, alertLow: null, alertHigh: 60, actionHigh: 65 },
};

export const DEFAULT_THRESHOLDS = Object.freeze({
  'main-store': ambient,
  'dispatch':   ambient,
  'storage-b':  ambient,
  'receiving':  ambient,
});
