// Server-only configuration for the flight-data layer. Read lazily so tests and
// the dev server can set process.env before first use. Never send this object
// to the browser — it can contain credentials.

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export function flightConfig(env = process.env) {
  return {
    provider: (env.FLIGHT_DATA_PROVIDER || 'none').trim().toLowerCase(),
    defaultAirport: (env.FLIGHT_DEFAULT_AIRPORT || 'COK').toUpperCase(),
    airportTimeZones: { COK: 'Asia/Kolkata' },
    flex: {
      appId: env.FLIGHTSTATS_APP_ID || '',
      appKey: env.FLIGHTSTATS_APP_KEY || '',
      baseUrl: env.FLIGHTSTATS_FLEX_BASE_URL || 'https://api.flightstats.com/flex/flightstatus/rest/v2/json',
      // Airport-status requests are split into windows of at most this many hours.
      maxWindowHours: Math.min(6, Math.max(1, num(env.FLIGHTSTATS_MAX_WINDOW_HOURS, 6))),
    },
    http: {
      timeoutMs: num(env.FLIGHT_HTTP_TIMEOUT_MS, 8000),
      maxRetries: Math.min(4, num(env.FLIGHT_HTTP_MAX_RETRIES, 2)),
      backoffBaseMs: num(env.FLIGHT_HTTP_BACKOFF_MS, 400),
    },
    cache: {
      ttlSeconds: num(env.FLIGHT_CACHE_TTL_SECONDS, 300),
      // Old data is only ever served with a "stale" label, and never older than this.
      // Kept well under the 3-day storage limit common in Cirium agreements.
      maxStaleSeconds: Math.min(3 * 86400, num(env.FLIGHT_CACHE_MAX_STALE_SECONDS, 6 * 3600)),
    },
    // Dates the board accepts, relative to "today" at the airport.
    dateRange: { pastDays: num(env.FLIGHT_DATE_PAST_DAYS, 1), futureDays: num(env.FLIGHT_DATE_FUTURE_DAYS, 3) },
    rateLimitPerMinute: num(env.API_RATE_LIMIT_PER_MINUTE, 60),
  };
}
