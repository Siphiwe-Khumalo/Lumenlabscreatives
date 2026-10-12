// Generates fresh random values for TOKEN_ENCRYPTION_KEY and SESSION_SECRET.
// Paste the output into your host's environment settings; never commit it.
import crypto from 'node:crypto';

console.log(`TOKEN_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('base64')}`);
console.log(`SESSION_SECRET=${crypto.randomBytes(48).toString('base64url')}`);
