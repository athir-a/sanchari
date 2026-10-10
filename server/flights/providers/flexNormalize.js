// Maps Cirium FlightStats Flex "flightStatus" objects into Sanchari's NormalizedFlight.
// Field names follow developer.flightstats.com/api-docs/flightstatus/v2/flightstatusresponse.
import { buildFlightId } from '../validate.js';

const STATUS_MAP = {
  S: { normalized: 'SCHEDULED', label: 'Scheduled' },
  A: { normalized: 'EN_ROUTE', label: 'Active' },
  L: { normalized: 'LANDED', label: 'Landed' },
  C: { normalized: 'CANCELLED', label: 'Canceled' },
  D: { normalized: 'DIVERTED', label: 'Diverted' },
  R: { normalized: 'DIVERTED', label: 'Redirected' },
  NO: { normalized: 'NOT_OPERATIONAL', label: 'Not operational' },
  U: { normalized: 'UNKNOWN', label: 'Unknown' },
  DN: { normalized: 'UNKNOWN', label: 'Data source needed' },
};

export function mapStatus(raw) {
  if (raw == null || raw === '') return { raw: null, rawLabel: null, normalized: 'UNKNOWN' };
  const m = STATUS_MAP[String(raw).toUpperCase()];
  return m ? { raw: String(raw), rawLabel: m.label, normalized: m.normalized } : { raw: String(raw), rawLabel: null, normalized: 'UNKNOWN' };
}

const utc = (t) => {
  const v = t?.dateUtc;
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const localDate = (t) => (t?.dateLocal && /^\d{4}-\d{2}-\d{2}/.test(t.dateLocal) ? t.dateLocal.slice(0, 10) : null);
const str = (v) => (v == null || v === '' ? null : String(v));

function indexAppendix(appendix = {}) {
  const airlines = new Map((appendix.airlines || []).map((a) => [a.fs, a]));
  const airports = new Map((appendix.airports || []).map((a) => [a.fs, a]));
  return { airlines, airports };
}

/** Returns a NormalizedFlight, or null when the record lacks the minimum identifying fields. */
export function normalizeFlexStatus(fs, appendix, { retrievedAt, source = 'flightstats-flex' } = {}) {
  const { airlines, airports } = appendix?.airlines instanceof Map ? appendix : indexAppendix(appendix);
  if (!fs || !fs.carrierFsCode || !fs.flightNumber || !fs.arrivalAirportFsCode) return null;

  const ot = fs.operationalTimes || {};
  const airline = airlines.get(fs.carrierFsCode) || {};
  const carrier = airline.iata || fs.carrierFsCode;
  const origin = airports.get(fs.departureAirportFsCode) || {};
  const dest = airports.get(fs.arrivalAirportFsCode) || {};
  const destCode = dest.iata || fs.arrivalAirportFsCode;

  const scheduledArrivalT = ot.scheduledGateArrival || ot.publishedArrival || ot.scheduledRunwayArrival || fs.arrivalDate;
  const arrivalLocalDate = localDate(scheduledArrivalT) || localDate(fs.arrivalDate);
  const actualGate = utc(ot.actualGateArrival);
  const actualRunway = utc(ot.actualRunwayArrival);
  const res = fs.airportResources || {};
  const codeshares = (fs.codeshares || [])
    .map((c) => {
      const code = airlines.get(c.fsCode)?.iata || c.fsCode || c.carrier?.iata || c.carrier?.fs;
      return code && c.flightNumber ? `${code} ${c.flightNumber}` : null;
    })
    .filter(Boolean);

  const updates = fs.flightStatusUpdates?.flightStatusUpdate || fs.flightStatusUpdates || [];
  const lastUpdate = Array.isArray(updates) && updates.length ? updates[updates.length - 1]?.updatedAt?.dateUtc || updates[updates.length - 1]?.updatedAt : null;

  return {
    id: buildFlightId({ airport: destCode, carrier, number: String(fs.flightNumber), date: arrivalLocalDate }),
    providerFlightId: str(fs.flightId),
    source,
    airline: { code: carrier, name: str(airline.name) },
    flightNumber: String(fs.flightNumber),
    designator: `${carrier} ${fs.flightNumber}`,
    codeshares,
    origin: { code: origin.iata || fs.departureAirportFsCode || null, name: str(origin.name), city: str(origin.city) },
    destination: { code: destCode, name: str(dest.name) },
    departure: {
      scheduled: utc(ot.scheduledGateDeparture || ot.publishedDeparture || fs.departureDate),
      estimated: utc(ot.estimatedGateDeparture || ot.estimatedRunwayDeparture),
      actual: utc(ot.actualGateDeparture || ot.actualRunwayDeparture),
    },
    arrival: {
      scheduled: utc(scheduledArrivalT),
      estimated: utc(ot.estimatedGateArrival || ot.estimatedRunwayArrival),
      actual: actualGate || actualRunway,
      actualKind: actualGate ? 'gate' : actualRunway ? 'runway' : null,
    },
    localArrivalDate: arrivalLocalDate,
    status: mapStatus(fs.status),
    terminal: str(res.arrivalTerminal),
    gate: str(res.arrivalGate),
    baggage: str(res.baggage),
    providerUpdatedAt: lastUpdate ? new Date(lastUpdate).toISOString() : str(fs.lastDataAcquiredDate?.dateUtc),
    retrievedAt,
  };
}

/** Validate a Flex response envelope and normalize every record. */
export function normalizeFlexResponse(body, { retrievedAt, expectAirport } = {}) {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Response is not an object' };
  if (body.error) return { ok: false, reason: body.error.errorMessage || body.error.errorCode || 'Provider error', providerError: body.error };
  const list = Array.isArray(body.flightStatuses) ? body.flightStatuses : body.flightStatus ? [body.flightStatus] : null;
  if (!list) return { ok: false, reason: 'Response has no flightStatuses list' };
  const appendix = indexAppendix(body.appendix);
  const flights = [];
  let skipped = 0;
  for (const fs of list) {
    const f = normalizeFlexStatus(fs, appendix, { retrievedAt });
    if (!f || (expectAirport && f.destination.code !== expectAirport)) skipped += 1;
    else flights.push(f);
  }
  return { ok: true, flights, skipped };
}
