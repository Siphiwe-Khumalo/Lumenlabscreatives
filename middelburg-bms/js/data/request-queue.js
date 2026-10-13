/* Single FIFO request queue — one request in flight at a time, each with a
 * timeout. Lesson carried over from ARC: the JACE could not tolerate concurrent
 * requests on one token. */
export class RequestQueue {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
    this.queue = [];
    this.busy = false;
  }

  get pending() { return this.queue.length + (this.busy ? 1 : 0); }

  /** Enqueue fetch(url, init). Resolves with the Response, rejects on network error / timeout. */
  fetch(url, init = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, init, resolve, reject });
      this._next();
    });
  }

  clear(reason = 'Queue cleared') {
    const q = this.queue.splice(0);
    for (const job of q) job.reject(new Error(reason));
  }

  async _next() {
    if (this.busy) return;
    const job = this.queue.shift();
    if (!job) return;
    this.busy = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(job.url, { ...job.init, signal: ctrl.signal, credentials: 'same-origin', cache: 'no-store' });
      job.resolve(res);
    } catch (err) {
      job.reject(err.name === 'AbortError' ? new Error(`Timed out after ${this.timeoutMs} ms`) : err);
    } finally {
      clearTimeout(timer);
      this.busy = false;
      this._next();
    }
  }
}
