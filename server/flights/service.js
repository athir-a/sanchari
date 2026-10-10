import { flightConfig } from './config.js';
import { createProvider } from './providers/index.js';
import { TtlCache } from './cache.js';
import { splitWindows } from './time.js';
import { validateAirport, validateDate, validateHours, parseFlightDesignator, parseFlightId } from './validate.js';
import { FlightDataError } from './errors.js';
import { fingerprint } from './model.js';
import { logger } from './logger.js';

const RANK = { live: 0, cached: 1, stale: 2, unavailable: 3 };
const worst = (states) => states.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'live');
const safeError = (e) => ({ code: e?.code || 'internal_error', message: e instanceof FlightDataError ? e.message : 'Flight data could not be loaded.' });

/** Tracks the last fingerprint per flight so identical updates are ignored. */
export class FlightUpdateTracker {
  constructor() {
    this.seen = new Map();
  }
  observe(flight) {
    const fp = fingerprint(flight);
    const prev = this.seen.get(flight.id);
    this.seen.set(flight.id, fp);
    if (prev === fp) return { changed: false, first: false };
    return { changed: true, first: prev === undefined };
  }
}

export function createFlightService({ env = process.env, deps = {} } = {}) {
  const cfg = flightConfig(env);
  const provider = deps.provider || createProvider(cfg, deps);
  const now = deps.now || (() => new Date());
  const cache = new TtlCache({ ...cfg.cache, now: () => now().getTime() });
  const tracker = new FlightUpdateTracker();
  const health = { lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null, consecutiveFailures: 0, requests: 0 };

  const providerInfo = () => ({ id: provider.id, label: provider.label, configured: provider.configured, isDemo: !!provider.isDemo });

  async function guarded(fn) {
    health.requests += 1;
    try {
      const r = await fn();
      health.lastSuccessAt = now().toISOString();
      health.consecutiveFailures = 0;
      return r;
    } catch (e) {
      if (e?.code !== 'provider_not_configured') {
        health.lastFailureAt = now().toISOString();
        health.lastErrorCode = e?.code || 'internal_error';
        health.consecutiveFailures += 1;
      }
      throw e;
    }
  }

  function requireProvider() {
    if (!provider.configured) {
      const e = new FlightDataError('provider_not_configured', 'Live flight data is not connected on this server, so flights can’t be verified right now.', { status: 503 });
      e.provider = { ...providerInfo(), reason: provider.reason };
      throw e;
    }
  }

  async function arrivals(query) {
    const airport = validateAirport(query.airport, cfg);
    const tz = cfg.airportTimeZones[airport];
    const date = validateDate(query.date, tz, cfg, now());
    const { fromHour, toHour } = validateHours(query.fromHour, query.toHour);
    requireProvider();

    const windows = splitWindows(fromHour, toHour, provider.maxWindowHours || cfg.flex.maxWindowHours);
    const results = await Promise.all(
      windows.map(async (w) => {
        const key = `arr:${provider.id}:${airport}:${date}:${w.startHour}:${w.numHours}`;
        try {
          const r = await cache.getOrLoad(key, () => guarded(() => provider.arrivalsWindow({ airport, date, ...w })));
          if (r.error) logger.warn('serving_stale', { key, code: r.error.code });
          return { ...w, state: r.state, storedAt: r.storedAt, flights: r.value.flights, error: r.error ? safeError(r.error) : null };
        } catch (e) {
          return { ...w, state: 'unavailable', storedAt: null, flights: [], error: safeError(e) };
        }
      }),
    );

    if (results.every((r) => r.state === 'unavailable')) {
      const first = results[0].error;
      throw new FlightDataError(first.code, first.message, { status: first.code === 'upstream_timeout' ? 504 : 502 });
    }

    const seen = new Set();
    const flights = [];
    for (const r of results) {
      for (const f of r.flights) {
        const k = f.providerFlightId || f.id;
        if (seen.has(k)) continue;
        seen.add(k);
        flights.push({ ...f, freshness: r.state });
      }
    }
    flights.sort((a, b) => String(a.arrival.scheduled).localeCompare(String(b.arrival.scheduled)));
    const stored = results.filter((r) => r.storedAt).map((r) => r.storedAt);
    const oldest = stored.length ? Math.min(...stored) : null;
    const freshness = worst(results.map((r) => r.state));
    const failed = results.filter((r) => r.state === 'unavailable');
    return {
      airport,
      timeZone: tz,
      date,
      fromHour,
      toHour,
      provider: providerInfo(),
      freshness,
      complete: failed.length === 0,
      retrievedAt: oldest ? new Date(oldest).toISOString() : null,
      ageSeconds: oldest ? Math.round((now().getTime() - oldest) / 1000) : null,
      windows: results.map((r) => ({ fromHour: r.startHour, toHour: r.startHour + r.numHours, state: r.state, retrievedAt: r.storedAt ? new Date(r.storedAt).toISOString() : null, error: r.error })),
      notice: failed.length
        ? `Some hours (${failed.map((r) => `${String(r.startHour).padStart(2, '0')}:00–${String(r.startHour + r.numHours).padStart(2, '0')}:00`).join(', ')}) could not be loaded.`
        : freshness === 'stale'
          ? 'The provider could not be reached; showing the last data Sanchari received.'
          : null,
      flights,
    };
  }

  async function search(query) {
    const airport = validateAirport(query.airport, cfg);
    const tz = cfg.airportTimeZones[airport];
    const date = validateDate(query.date, tz, cfg, now());
    const { carrier, number } = parseFlightDesignator(query.number);
    requireProvider();
    const designator = `${carrier} ${number}`;
    const key = `flt:${provider.id}:${airport}:${carrier}:${number}:${date}`;
    const r = await cache.getOrLoad(key, () => guarded(() => provider.flightStatus({ carrier, number, date, airport })));
    const matches = r.value.flights.filter((f) => f.destination.code === airport && (f.designator === designator || f.codeshares.includes(designator)));
    const match = matches.find((f) => f.localArrivalDate === date) || matches[0] || null;
    const base = {
      query: { airport, date, designator },
      provider: providerInfo(),
      freshness: r.state,
      retrievedAt: new Date(r.storedAt).toISOString(),
      ageSeconds: Math.round((now().getTime() - r.storedAt) / 1000),
    };
    if (!match) {
      throw Object.assign(new FlightDataError('flight_not_found', `${designator} wasn’t found arriving at ${airport} on ${date}. You can still enter your landing time yourself — it will be marked unverified.`, { status: 404 }), { extra: base });
    }
    const update = tracker.observe(match);
    return { ...base, flight: { ...match, freshness: r.state, verification: 'verified' }, changed: update.changed };
  }

  async function byId(id) {
    const { airport, carrier, number, date } = parseFlightId(id);
    return search({ airport, date, number: `${carrier}${number}` });
  }

  function providerHealth() {
    let status = 'ok';
    if (!provider.configured) status = 'not_configured';
    else if (health.consecutiveFailures >= 3) status = 'down';
    else if (health.consecutiveFailures > 0) status = 'degraded';
    else if (!health.lastSuccessAt) status = 'unknown';
    return {
      provider: { ...providerInfo(), reason: provider.configured ? undefined : provider.reason },
      status,
      lastSuccessAt: health.lastSuccessAt,
      lastFailureAt: health.lastFailureAt,
      lastErrorCode: health.lastErrorCode,
      consecutiveFailures: health.consecutiveFailures,
      cache: { ttlSeconds: cfg.cache.ttlSeconds, maxStaleSeconds: cfg.cache.maxStaleSeconds, entries: cache.map.size },
      checkedAt: now().toISOString(),
    };
  }

  return { arrivals, search, byId, providerHealth, tracker, cache, config: cfg, provider };
}

let singleton;
export function getFlightService() {
  if (!singleton) singleton = createFlightService();
  return singleton;
}
export function resetFlightService() {
  singleton = undefined;
}
