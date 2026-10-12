import fs from 'node:fs';
import path from 'node:path';

// Small durable JSON store for a single-user app. Every mutation is written
// synchronously (temp file + fsync + rename) before the caller continues, so a
// recipient is persisted as "Sending" before the Gmail API is ever called.

const EMPTY = () => ({ version: 1, gmail: null, batches: {}, idempotency: {} });

export class Store {
  constructor(dataDir) {
    this.dir = path.resolve(dataDir);
    this.file = path.join(this.dir, 'outreach-state.json');
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : EMPTY();
  }

  /** Apply fn to the state and persist atomically. Returns fn's result. */
  update(fn) {
    const result = fn(this.data);
    this.#flush();
    return result;
  }

  get state() {
    return this.data;
  }

  #flush() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeSync(fd, JSON.stringify(this.data, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.file);
  }
}
