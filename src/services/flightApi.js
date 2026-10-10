// Browser client for Sanchari's own /api/flights endpoints. The browser never
// talks to a flight-data provider directly.
import { IS_LIVE, supabase } from './supabaseClient.js';

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
  } catch {
    return { ok: false, status: 0, error: { code: 'network', message: 'Sanchari’s server could not be reached. Check your connection.' } };
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    return { ok: false, status: res.status, error: { code: 'bad_response', message: 'Sanchari’s server sent an unreadable response.' } };
  }
  if (!res.ok) return { ok: false, status: res.status, error: body?.error || { code: 'error', message: 'Request failed.' }, body };
  return { ok: true, status: res.status, data: body };
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export const getArrivals = ({ airport = 'COK', date, from, to }) => request(`/api/flights/arrivals?${qs({ airport, date, from, to })}`);
export const searchFlight = ({ number, date, airport = 'COK' }) => request(`/api/flights/search?${qs({ number, date, airport })}`);
export const getFlight = (id) => request(`/api/flights/${encodeURIComponent(id)}`);
export const getProviderHealth = () => request('/api/flights/provider-health');

async function authHeaders() {
  if (!IS_LIVE) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

/** Live mode: ask the server to verify and attach a flight to the saved journey. */
export async function selectFlightForJourney(journeyId, { number, date }) {
  return request(`/api/journeys/${journeyId}/select-flight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ number, date }),
  });
}

export async function getJourneyFlightStatus(journeyId) {
  return request(`/api/journeys/${journeyId}/flight-status`, { headers: await authHeaders() });
}

/** Snapshot of a verified NormalizedFlight stored on a trip. */
export function flightSnapshot(f, freshness = null) {
  return {
    id: f.id,
    designator: f.designator,
    carrierCode: f.airline.code,
    airline: f.airline.name,
    flightDate: f.localArrivalDate,
    providerFlightId: f.providerFlightId,
    airport: f.destination.code,
    origin: f.origin.city || f.origin.code,
    scheduledArrival: f.arrival.scheduled,
    estimatedArrival: f.arrival.estimated,
    actualArrival: f.arrival.actual,
    status: f.status.normalized,
    rawStatus: f.status.rawLabel || f.status.raw,
    terminal: f.terminal,
    source: f.source,
    verification: 'verified',
    freshness,
    updatedAt: f.retrievedAt,
  };
}

export const FRESHNESS_LABEL = {
  live: 'Live — just fetched',
  cached: 'Cached',
  stale: 'Stale — provider unreachable',
  unavailable: 'Unavailable',
};

export const STATUS_TEXT = {
  SCHEDULED: 'Scheduled',
  EN_ROUTE: 'In the air',
  LANDED: 'Landed',
  CANCELLED: 'Cancelled',
  DIVERTED: 'Diverted',
  NOT_OPERATIONAL: 'Not operating',
  UNKNOWN: 'Status unknown',
};
