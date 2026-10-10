import { json, httpError } from './errors.js';
import { FlightDataError } from '../flights/errors.js';
import { fingerprint, bestArrival } from '../flights/model.js';
import { flightColumnsFrom } from './journeyStore.js';
import { baggageMinutes, READINESS_CONFIG } from '../../src/utils/readiness.js';
import { logger } from '../flights/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmt = (iso, tz = 'Asia/Kolkata') => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

async function requireOwnTrip(req, store, tripId) {
  if (!store.available()) throw httpError(501, 'journeys_not_available', 'Journey endpoints need the Supabase live mode. In demo mode journeys live in your browser.');
  if (!UUID_RE.test(tripId)) throw httpError(400, 'invalid_request', 'Journey id must be a UUID.');
  const token = bearer(req);
  if (!token) throw httpError(401, 'unauthenticated', 'Sign in to view this journey.');
  const user = await store.getUser(token);
  if (!user) throw httpError(401, 'unauthenticated', 'Your session has expired. Reload the page.');
  const trip = await store.getOwnTrip(token, tripId);
  // Not found and not yours look identical, so ids can't be probed.
  if (!trip || trip.user_id !== user.id) throw httpError(404, 'not_found', 'Journey not found.');
  return { user, trip };
}

export function tripFlightView(trip) {
  if (!trip.flight_number) return null;
  return {
    designator: trip.flight_number,
    carrierCode: trip.flight_carrier,
    flightDate: trip.flight_date,
    providerFlightId: trip.flight_provider_id,
    airport: trip.airport_code,
    scheduledArrival: trip.flight_scheduled_arrival,
    estimatedArrival: trip.flight_estimated_arrival,
    actualArrival: trip.flight_actual_arrival,
    status: trip.flight_status,
    source: trip.flight_source,
    verification: trip.flight_verification || 'unverified',
    updatedAt: trip.flight_updated_at,
  };
}

/** Readiness-based note for a ride; never changes the agreed departure. */
export function impactMessage({ name, flight, previousBest, bags, ride }) {
  const best = bestArrival(flight);
  if (!best) return null;
  const label = best.kind === 'actual' ? 'landed at' : best.kind === 'estimated' ? 'now estimated' : 'scheduled';
  const was = previousBest && previousBest !== best.time ? ` (was ${fmt(previousBest)})` : '';
  let msg = `${name}’s flight ${flight.designator} ${label} ${fmt(best.time)}${was}.`;
  if (ride?.proposed_departure_time) {
    const ready = new Date(best.time).getTime() + (baggageMinutes(bags) + READINESS_CONFIG.walkToPickupMinutes) * 60000;
    if (ready > new Date(ride.proposed_departure_time).getTime()) {
      msg += ` Likely ready ~${fmt(new Date(ready).toISOString())}, after the agreed departure ${fmt(ride.proposed_departure_time)}. Nothing changed automatically — agree on a new time if needed.`;
    }
  }
  return msg;
}

export function createHandlers({ service, store }) {
  return {
    async arrivals(req) {
      const q = req.query;
      return json(200, await service.arrivals({ airport: q.airport, date: q.date, fromHour: q.from, toHour: q.to }));
    },

    async search(req) {
      const q = req.query;
      if (!q.number) throw httpError(400, 'invalid_request', 'Add a flight number, e.g. ?number=6E2178.');
      return json(200, await service.search({ number: q.number, date: q.date, airport: q.airport }));
    },

    async flightById(req, { id }) {
      return json(200, await service.byId(decodeURIComponent(id)));
    },

    async providerHealth() {
      return json(200, service.providerHealth());
    },

    async journeyFlightStatus(req, { id }) {
      const { user, trip } = await requireOwnTrip(req, store, id);
      const stored = tripFlightView(trip);
      if (!stored) throw httpError(409, 'no_flight', 'No flight is linked to this journey yet.');
      if (stored.verification !== 'verified') {
        return json(200, { journeyId: id, flight: stored, live: null, message: 'This flight was entered manually and isn’t verified, so it won’t update automatically.' });
      }
      let result;
      try {
        result = await service.search({ number: stored.designator, date: stored.flightDate, airport: trip.airport_code });
      } catch (e) {
        if (e instanceof FlightDataError) {
          return json(200, { journeyId: id, flight: stored, live: null, error: { code: e.code, message: e.message } });
        }
        throw e;
      }
      const fp = fingerprint(result.flight);
      let persisted = false;
      if (fp !== trip.flight_fingerprint && store.canWriteVerified()) {
        await store.writeFlight(user.id, id, flightColumnsFrom(result.flight, { fingerprint: fp }));
        persisted = true;
      }
      return json(200, { journeyId: id, flight: stored, live: result.flight, freshness: result.freshness, retrievedAt: result.retrievedAt, changed: fp !== trip.flight_fingerprint, persisted });
    },

    async selectFlight(req, { id }) {
      const { user, trip } = await requireOwnTrip(req, store, id);
      const body = req.body || {};
      if (!body.number) throw httpError(400, 'invalid_request', 'Body must include "number" (e.g. "6E 2178") and "date" (YYYY-MM-DD).');
      if (!store.canWriteVerified()) throw httpError(503, 'verification_unavailable', 'This server can’t save verified flights (SUPABASE_SERVICE_ROLE_KEY is not set).');
      const result = await service.search({ number: body.number, date: body.date, airport: trip.airport_code });
      const fp = fingerprint(result.flight);
      const row = await store.writeFlight(user.id, id, flightColumnsFrom(result.flight, { fingerprint: fp }));
      if (!row) throw httpError(404, 'not_found', 'Journey not found.');
      logger.info('flight_selected', { journey: id.slice(0, 8), flight: result.flight.id });
      return json(200, { journeyId: id, flight: tripFlightView(row), live: result.flight, freshness: result.freshness });
    },

    /** Scheduled job: refresh verified flights of active journeys; suppress duplicates; notify rides. */
    async refreshFlights(req) {
      const secret = process.env.CRON_SECRET;
      if (!secret || bearer(req) !== secret) throw httpError(401, 'unauthenticated', 'Missing or wrong cron secret.');
      if (!store.available() || !store.canWriteVerified()) throw httpError(501, 'journeys_not_available', 'Refresh needs Supabase with a service-role key.');
      return json(200, await refreshActiveFlights({ service, store }));
    },
  };
}

let running = false;
/** Exported for tests. Protected against overlapping runs in one process. */
export async function refreshActiveFlights({ service, store, now = () => new Date() }) {
  if (running) return { skipped: true, reason: 'A refresh is already running.' };
  running = true;
  const summary = { checked: 0, flights: 0, changed: 0, unchanged: 0, failed: 0, notified: 0 };
  try {
    const t = now().getTime();
    const trips = await store.tripsNeedingRefresh({ fromIso: new Date(t - 6 * 3600e3).toISOString(), toIso: new Date(t + 24 * 3600e3).toISOString() });
    summary.checked = trips.length;
    const byFlight = new Map();
    for (const trip of trips) {
      const k = `${trip.airport_code}|${trip.flight_number}|${trip.flight_date}`;
      if (!byFlight.has(k)) byFlight.set(k, []);
      byFlight.get(k).push(trip);
    }
    summary.flights = byFlight.size;
    for (const group of byFlight.values()) {
      const first = group[0];
      let flight;
      try {
        ({ flight } = await service.search({ number: first.flight_number, date: first.flight_date, airport: first.airport_code }));
      } catch {
        summary.failed += 1;
        continue;
      }
      const fp = fingerprint(flight);
      for (const trip of group) {
        if (trip.flight_fingerprint === fp) {
          summary.unchanged += 1;
          continue;
        }
        summary.changed += 1;
        const previousBest = trip.flight_actual_arrival || trip.flight_estimated_arrival || trip.flight_scheduled_arrival;
        await store.updateTripFlightById(trip.id, flightColumnsFrom(flight, { fingerprint: fp }));
        const best = bestArrival(flight);
        const rides = await store.activeRidesForTrip(trip.id);
        for (const m of rides) {
          await store.updateMemberFlight(m.id, { flight_designator: flight.designator, flight_verification: 'verified', flight_best_arrival: best?.time ?? null, flight_best_kind: best?.kind ?? null });
          const msg = impactMessage({ name: m.display_name, flight, previousBest, bags: trip.luggage_count, ride: m.ride_groups });
          if (msg && best?.time !== previousBest) {
            await store.postRideUpdate(m.ride_group_id, trip.id, msg, 'warning');
            summary.notified += 1;
          }
        }
      }
    }
    return summary;
  } finally {
    running = false;
  }
}
