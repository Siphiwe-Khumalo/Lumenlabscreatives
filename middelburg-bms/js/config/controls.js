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
    {
      id: 'tempSetpoint', kind: 'setpoint', label: 'Temperature setpoint', unit: '°C',
      commandRole: 'temperatureSetpoint', feedbackRole: 'temperatureSetpoint', actualRole: 'temperature', actualLabel: 'Space',
    },
    { id: 'autoManual', kind: 'toggle', label: 'Auto / manual', commandRole: null, todo: 'TODO: no Auto/Manual point supplied for rooftop units' },
    { id: 'schedule', kind: 'toggle', label: 'Schedule', commandRole: null, todo: 'TODO: no schedule point supplied' },
  ],
  hybrid: [
    {
      id: 'bms', kind: 'toggle', label: 'BMS switch', onLabel: 'On', offLabel: 'Off',
      // TODO(confirm): BMS_Enable is assumed to be the BMS toggle; BMSControl is the alternative.
      commandRole: 'enable', feedbackRole: 'enable', feedbackTodo: true,
      actualRole: 'fanStatus', actualLabel: 'Supply fan',
    },
    {
      id: 'mode', kind: 'mode', label: 'Mode',
      // Choosing a mode writes that flag ON and the other two OFF (agreed behaviour; confirm on site).
      options: [
        { value: 'cooling', role: 'coolMode', label: 'Cool' },
        { value: 'heating', role: 'heatMode', label: 'Heat' },
        { value: 'fan only', role: 'fanOnlyMode', label: 'Fan only' },
      ],
      actualRole: 'fanStatus', actualLabel: 'Supply fan',
    },
    { id: 'tempSetpoint', kind: 'status', label: 'Temperature setpoint', role: 'temperatureSetpoint', note: 'Read-only on hybrid units' },
    // Fan speed is shown in the card's readings (read-only).
    { id: 'autoManual', kind: 'toggle', label: 'Auto / manual', commandRole: null, todo: 'TODO: confirm whether BMSControl is the Auto/Manual point' },
    { id: 'schedule', kind: 'toggle', label: 'Schedule', commandRole: null, todo: 'TODO: no schedule point supplied' },
  ],
});
// Humidity setpoint: no unit supplies one, so it is not shown.
