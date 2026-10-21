/* WhatsApp / email alerting — policy only. Delivery needs a backend
 * notification service (not configured). Recipients are ROLES, not people;
 * real contacts and any API tokens live server-side, never in this file. */
export const NOTIFICATIONS_LABEL = 'Illustrative escalation policy — to be agreed with the project team';

export const CHANNELS = Object.freeze([
  { id: 'whatsapp', label: 'WhatsApp', configured: false },
  { id: 'email', label: 'Email', configured: false },
]);

export const ESCALATION = Object.freeze([
  { level: 1, afterMin: 0,  severities: ['warning', 'critical'], recipient: 'Facility supervisor', channels: ['whatsapp', 'email'] },
  { level: 2, afterMin: 15, severities: ['critical'],            recipient: 'Duty technician',     channels: ['whatsapp'] },
  { level: 3, afterMin: 30, severities: ['critical'],            recipient: 'Site manager',        channels: ['whatsapp', 'email'] },
]);
