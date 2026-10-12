// Builds a plain-text RFC 5322 message for one recipient. Header values are
// validated upstream to contain no CR/LF; non-ASCII text is RFC 2047 encoded.

const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;

export function encodeHeaderText(text) {
  if (ASCII_PRINTABLE.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

export function formatAddress(name, email) {
  if (!name) return `<${email}>`;
  const display = ASCII_PRINTABLE.test(name) ? `"${name.replace(/["\\]/g, '\\$&')}"` : encodeHeaderText(name);
  return `${display} <${email}>`;
}

function assertHeaderSafe(...values) {
  for (const v of values) {
    if (/[\r\n]/.test(v || '')) throw new Error('Header values must not contain line breaks');
  }
}

export function buildMessage({ fromName, fromEmail, toName, toEmail, subject, body }) {
  assertHeaderSafe(fromName, fromEmail, toName, toEmail, subject);
  const headers = [];
  // Without SENDER_EMAIL, Gmail fills in the connected account's address.
  if (fromEmail) headers.push(`From: ${formatAddress(fromName, fromEmail)}`);
  headers.push(`To: ${formatAddress(toName, toEmail)}`);
  headers.push(`Subject: ${encodeHeaderText(subject)}`);
  headers.push(`Date: ${new Date().toUTCString().replace('GMT', '+0000')}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: base64');

  const normalisedBody = String(body).replace(/\r?\n/g, '\r\n');
  const encodedBody = Buffer.from(normalisedBody, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${encodedBody}\r\n`;
}

/** Gmail's messages.send expects the full message as base64url in `raw`. */
export const toRaw = (message) => Buffer.from(message, 'utf8').toString('base64url');
