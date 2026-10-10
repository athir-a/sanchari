/**
 * Small TTL cache with stale fallback and in-flight de-duplication.
 * Entries younger than ttl are "fresh"; older ones (up to maxStale) may be served
 * only when a refresh fails, and are always labelled stale.
 *
 * In-memory: shared by all requests handled by one server process. On serverless
 * hosts each instance has its own copy — see docs/FLIGHT_DATA.md.
 */
export class TtlCache {
  constructor({ ttlSeconds, maxStaleSeconds, now = () => Date.now(), maxEntries = 500 }) {
    this.ttl = ttlSeconds * 1000;
    this.maxStale = maxStaleSeconds * 1000;
    this.now = now;
    this.maxEntries = maxEntries;
    this.map = new Map();
    this.inflight = new Map();
  }

  peek(key) {
    const e = this.map.get(key);
    if (!e) return null;
    const age = this.now() - e.storedAt;
    if (age > this.maxStale) {
      this.map.delete(key);
      return null;
    }
    return { value: e.value, storedAt: e.storedAt, ageMs: age, fresh: age <= this.ttl };
  }

  set(key, value) {
    if (this.map.size >= this.maxEntries) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { value, storedAt: this.now() });
  }

  /**
   * Return fresh cached value, or run `loader` (once per key concurrently).
   * Result: { value, state: 'live'|'cached'|'stale', storedAt, error? }
   * Throws only when the loader fails and no stale value exists.
   */
  async getOrLoad(key, loader) {
    const hit = this.peek(key);
    if (hit?.fresh) return { value: hit.value, state: 'cached', storedAt: hit.storedAt };
    if (!this.inflight.has(key)) {
      const p = (async () => {
        try {
          const value = await loader();
          this.set(key, value);
          return { value, state: 'live', storedAt: this.now() };
        } finally {
          this.inflight.delete(key);
        }
      })();
      this.inflight.set(key, p);
    }
    const pending = this.inflight.get(key);
    try {
      return await pending;
    } catch (error) {
      const stale = this.peek(key);
      if (stale) return { value: stale.value, state: 'stale', storedAt: stale.storedAt, error };
      throw error;
    }
  }

  clear() {
    this.map.clear();
  }
}
