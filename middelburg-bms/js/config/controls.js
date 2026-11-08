import { APP_CONFIG } from './app-config.js';
/* Unit controls shown on the Controls page.
 *
 * Each control names the point it WRITES (commandRole) and the point whose
 * read-back CONFIRMS it (feedbackRole). "Actual" is the point that shows what
 * the equipment is really doing (actualRole). A control with commandRole null
 * has no point yet and is shown as NOT MAPPED (disabled).
 *
 * Supplied by the project team:
 *   Rooftop: start/stop is the command (UnitnStartCmd); Unit enable is an OUTPUT (status only);
 *            the setpoint is a slider.
 *   Hybrid:  the BMS toggle and the Cool / Heat / Fan-only mode are controlled; pressures,
 *            airflow, fan speed and temperatures are read-only.
 */

export const CONTROL_DEFS = Object.freeze({
  rooftop: [
    {
      id: 'startStop', kind: 'toggle', label: 'Start / stop', onLabel: 'Start', offLabel: 'Stop',
      commandRole: 'startCommand',
      // TODO(confirm): which point confirms a start/stop command? Candidates: UnitnSAF (supply fan)
      // or UnitnEnable (enable output). Until confirmed, the command is confirmed by reading back
      // the command point itself, and the supply fan is shown as ACTUAL.
      feedbackRole: 'startCommand', feedbackTodo: true,
      actualRole: 'fanStatus', actualLabel: 'Supply fan',
    },
    { id: 'enableStatus', kind: 'status', label: 'Unit enable', role: 'enable', note: 'Output from the unit — status only' },
    // Mode: shown only (heating / cooling, decided automatically by the unit). Never written — see points.js operatingMode.
    { id: 'modeStatus', kind: 'status', label: 'Mode', role: 'operatingMode', derived: 'mode' },
    {
      id: 'tempSetpoint', kind: 'setpoint', label: 'Temperature setpoint', unit: '°C',
      commandRole: 'temperatureSetpoint', feedbackRole: 'temperatureSetpoint', actualRole: 'temperature', actualLabel: 'Space',
    },
    { id: 'autoManual', kind: 'toggle', label: 'Auto / manual', commandRole: null, todo: 'TODO: no Auto/Manual point supplied for rooftop units' },
    { id: 'schedule', kind: 'toggle', label: 'Schedule', commandRole: null, todo: 'TODO: no schedule point supplied' },
  ],
  // Hybrids are READ-ONLY (Aina, 2026-11-08): the dashboard reads them and never sends commands.
  hybrid: [
    { id: 'bmsStatus', kind: 'status', label: 'BMS', role: 'enable' },
    { id: 'modeStatus', kind: 'status', label: 'Mode', role: 'coolMode', derived: 'mode' },
    { id: 'fanStatus', kind: 'status', label: 'Supply fan', role: 'fanStatus' },
    { id: 'tempSetpoint', kind: 'status', label: 'Setpoint', role: 'temperatureSetpoint' },
    { id: 'fireDamper', kind: 'status', label: 'Fire damper', role: 'fireDamper' }, // hybrids 6–11 only
  ],
});
// Humidity setpoint: no unit supplies one, so it is not shown.
