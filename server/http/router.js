import { json, errorResponse } from './errors.js';
import { createHandlers } from './handlers.js';
import { createRateLimiter } from './rateLimit.js';
import { getFlightService } from '../flights/service.js';
import { createSupabaseJourneyStore } from './journeyStore.js';
import { logger } from '../flights/logger.js';

const ROUTES = [
  ['GET', /^\/api\/flights\/arrivals\/?$/, 'arrivals', true],
  ['GET', /^\/api\/flights\/search\/?$/, 'search', true],
  ['GET', /^\/api\/flights\/provider-health\/?$/, 'providerHealth', true],
  ['GET', /^\/api\/flights\/(?<id>[^/]+)\/?$/, 'flightById', true],
  ['GET', /^\/api\/journeys\/(?<id>[^/]+)\/flight-status\/?$/, 'journeyFlightStatus', false],
  ['POST', /^\/api\/journeys\/(?<id>[^/]+)\/select-flight\/?$/, 'selectFlight', false],
  ['POST', /^\/api\/cron\/refresh-flights\/?$/, 'refreshFlights', false],
  ['GET', /^\/api\/cron\/refresh-flights\/?$/, 'refreshFlights', false],
];

/**
 * Framework-free router: ({ method, url, headers, body, ip }) → { status, headers, body }.
 * Used by the Vite dev/preview middleware and by the Vercel functions in /api.
 */
export function createRouter({ service = getFlightService(), store = createSupabaseJourneyStore(), rateLimit } = {}) {
  const handlers = createHandlers({ service, store });
  const limiter = rateLimit || createRateLimiter({ limit: service.config.rateLimitPerMinute });

  return async function route(req) {
    const started = Date.now();
    const u = new URL(req.url, 'http://local');
    const path = u.pathname;
    const match = ROUTES.map(([m, re, name, pub]) => ({ m, name, pub, g: re.exec(path) })).filter((r) => r.g);
    if (!match.length) return json(404, { error: { code: 'not_found', message: 'No such API route.' } });
    const r = match.find((x) => x.m === req.method);
    if (!r) return json(405, { error: { code: 'method_not_allowed', message: `Use ${match.map((x) => x.m).join(' or ')}.` } }, { allow: match.map((x) => x.m).join(', ') });

    if (r.pub) {
      const rl = limiter(req.ip || 'unknown');
      if (!rl.allowed) {
        return json(429, { error: { code: 'rate_limited', message: 'Too many requests. Try again in a minute.' } }, { 'retry-after': String(rl.resetSeconds) });
      }
    }
    try {
      const res = await handlers[r.name]({ ...req, query: Object.fromEntries(u.searchParams) }, r.g.groups || {});
      logger.info('api', { route: r.name, status: res.status, ms: Date.now() - started });
      return res;
    } catch (e) {
      const res = errorResponse(e);
      logger.info('api', { route: r.name, status: res.status, code: res.body?.error?.code, ms: Date.now() - started });
      return res;
    }
  };
}
