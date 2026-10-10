// Sanchari's provider-neutral flight model. Providers map their own JSON into this;
// nothing outside server/flights/providers knows provider field names.

export const FLIGHT_STATUSES = ['SCHEDULED', 'EN_ROUTE', 'LANDED', 'CANCELLED', 'DIVERTED', 'NOT_OPERATIONAL', 'UNKNOWN'];

/**
 * @typedef {object} NormalizedFlight
 * @property {string} id                 Sanchari id, e.g. "COK~6E~2178~2026-10-11"
 * @property {string|null} providerFlightId
 * @property {string} source             e.g. "flightstats-flex"
 * @property {{ code: string, name: string|null }} airline
 * @property {string} flightNumber
 * @property {string} designator          "6E 2178"
 * @property {string[]} codeshares        other designators for the same flight
 * @property {{ code: string, name: string|null, city: string|null }} origin
 * @property {{ code: string, name: string|null }} destination
 * @property {{ scheduled: string|null, estimated: string|null, actual: string|null }} departure  UTC ISO
 * @property {{ scheduled: string|null, estimated: string|null, actual: string|null, actualKind: 'gate'|'runway'|null }} arrival
 * @property {string} localArrivalDate    YYYY-MM-DD at the arrival airport (from the schedule)
 * @property {{ raw: string|null, rawLabel: string|null, normalized: string }} status
 * @property {string|null} terminal
 * @property {string|null} gate
 * @property {string|null} baggage
 * @property {string|null} providerUpdatedAt
 * @property {string} retrievedAt
 */

/** Best arrival estimate: actual > estimated > scheduled. Returns { time, kind } or null. */
export function bestArrival(f) {
  if (f.arrival.actual) return { time: f.arrival.actual, kind: 'actual' };
  if (f.arrival.estimated) return { time: f.arrival.estimated, kind: 'estimated' };
  if (f.arrival.scheduled) return { time: f.arrival.scheduled, kind: 'scheduled' };
  return null;
}

/** Only an explicit landed status or an observed arrival time counts as landed. */
export const hasLanded = (f) => f.status.normalized === 'LANDED' || !!f.arrival.actual;

/** Fields that matter to passengers; used to suppress duplicate updates. */
export function fingerprint(f) {
  return JSON.stringify([f.status.normalized, f.status.raw, f.arrival.scheduled, f.arrival.estimated, f.arrival.actual, f.terminal, f.gate, f.baggage]);
}
