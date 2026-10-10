/** Fixed-window, per-client limiter (in-memory, per server instance). */
export function createRateLimiter({ limit, windowMs = 60000, now = () => Date.now() }) {
  const hits = new Map();
  return function check(key) {
    const t = now();
    let e = hits.get(key);
    if (!e || t - e.start >= windowMs) {
      e = { start: t, count: 0 };
      hits.set(key, e);
      if (hits.size > 5000) hits.delete(hits.keys().next().value);
    }
    e.count += 1;
    return { allowed: e.count <= limit, remaining: Math.max(0, limit - e.count), resetSeconds: Math.ceil((e.start + windowMs - t) / 1000) };
  };
}
