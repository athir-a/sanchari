import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { createRouter } from './router.js';
import { createFlightService } from '../flights/service.js';
import { refreshActiveFlights, impactMessage } from './handlers.js';
import { createRateLimiter } from './rateLimit.js';

const FIXTURE = JSON.parse(fs.readFileSync(new URL('../flights/__fixtures__/flex-cok-arrivals.json', import.meta.url)));
const NOW = new Date('2026-10-11T03:30:00+05:30');
const ENV = { FLIGHT_DATA_PROVIDER: 'flightstats_flex', FLIGHTSTATS_APP_ID: 'id', FLIGHTSTATS_APP_KEY: 'key' };
const ok = (body) => ({ status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(body) });
const flex6E = (est = '2026-10-11T00:35:00.000Z') => ({
  flightStatuses: [{ ...FIXTURE.flightStatuses[1], operationalTimes: { ...FIXTURE.flightStatuses[1].operationalTimes, estimatedGateArrival: { dateUtc: est } } }],
  appendix: FIXTURE.appendix,
});

const ALICE = { id: '11111111-1111-4111-8111-111111111111' };
const TRIP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRIP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** In-memory stand-in for Supabase that mimics RLS: getOwnTrip only returns the caller's rows. */
function fakeStore({ serviceRole = true } = {}) {
  const trips = {
    [TRIP_A]: { id: TRIP_A, user_id: ALICE.id, display_name: 'Aditi', airport_code: 'COK', luggage_count: 2, status: 'matched', flight_number: null, flight_verification: 'unverified' },
    [TRIP_B]: { id: TRIP_B, user_id: '22222222-2222-4222-8222-222222222222', display_name: 'Bob', airport_code: 'COK', luggage_count: 1, status: 'searching', flight_number: '6E 2178', flight_verification: 'verified', flight_date: '2026-10-11' },
  };
  const tokens = { 'alice-token': ALICE };
  const updates = [];
  return {
    trips,
    updates,
    available: () => true,
    canWriteVerified: () => serviceRole,
    getUser: async (t) => tokens[t] || null,
    getOwnTrip: async (t, id) => (tokens[t] && trips[id]?.user_id === tokens[t].id ? trips[id] : null),
    writeFlight: async (uid, id, cols) => (trips[id]?.user_id === uid ? Object.assign(trips[id], cols) : null),
    tripsNeedingRefresh: async () => Object.values(trips).filter((t) => t.flight_verification === 'verified'),
    updateTripFlightById: async (id, cols) => Object.assign(trips[id], cols),
    activeRidesForTrip: async (id) => (id === TRIP_B ? [{ id: 'm1', ride_group_id: 'g1', display_name: 'Bob', ride_groups: { status: 'confirmed', proposed_departure_time: '2026-10-11T00:55:00.000Z' } }] : []),
    updateMemberFlight: vi.fn(async () => {}),
    postRideUpdate: async (g, t, msg, kind) => updates.push({ g, t, msg, kind }),
  };
}

function setup({ env = ENV, store = fakeStore(), handler = () => ok(FIXTURE), limit = 100 } = {}) {
  const fetchImpl = vi.fn(async (u) => handler(u));
  const service = createFlightService({ env, deps: { fetchImpl, sleep: async () => {}, now: () => NOW } });
  const route = createRouter({ service, store, rateLimit: createRateLimiter({ limit }) });
  const call = (method, url, { token, body, ip = '1.1.1.1' } = {}) => route({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, body, ip });
  return { call, store, fetchImpl, service };
}

describe('public flight endpoints', () => {
  it('GET /api/flights/arrivals returns normalized data with freshness', async () => {
    const { call } = setup();
    const r = await call('GET', '/api/flights/arrivals?airport=COK&date=2026-10-11&from=0&to=6');
    expect(r.status).toBe(200);
    expect(r.body.freshness).toBe('live');
    expect(r.body.flights[0]).toMatchObject({ designator: 'SQ 536', origin: { code: 'SIN' } });
    expect(JSON.stringify(r.body)).not.toMatch(/appKey|flightStatuses|operationalTimes/);
  });
  it('validates input with 400 and a consistent error shape', async () => {
    const { call } = setup();
    const r = await call('GET', '/api/flights/arrivals?airport=XX&date=2026-10-11');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: { code: 'invalid_request', message: expect.any(String), field: 'airport' } });
  });
  it('returns 503 provider_not_configured without credentials', async () => {
    const { call } = setup({ env: {} });
    const r = await call('GET', '/api/flights/arrivals?date=2026-10-11');
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('provider_not_configured');
  });
  it('hides upstream error details from clients', async () => {
    const { call } = setup({ handler: () => ({ status: 500, headers: { get: () => 'text/plain' }, text: async () => 'stack trace secret' }) });
    const r = await call('GET', '/api/flights/arrivals?date=2026-10-11&from=0&to=6');
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toMatch(/stack|secret|HTTP 500/);
  });
  it('GET /api/flights/search and /api/flights/:id resolve a flight', async () => {
    const { call } = setup({ handler: () => ok(flex6E()) });
    const s = await call('GET', '/api/flights/search?number=6E2178&date=2026-10-11');
    expect(s.status).toBe(200);
    expect(s.body.flight.id).toBe('COK~6E~2178~2026-10-11');
    const byId = await call('GET', `/api/flights/${encodeURIComponent('COK~6E~2178~2026-10-11')}`);
    expect(byId.body.flight.designator).toBe('6E 2178');
  });
  it('rate-limits public endpoints per client', async () => {
    const { call } = setup({ limit: 2 });
    await call('GET', '/api/flights/provider-health');
    await call('GET', '/api/flights/provider-health');
    const r = await call('GET', '/api/flights/provider-health');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBeDefined();
    expect((await call('GET', '/api/flights/provider-health', { ip: '2.2.2.2' })).status).toBe(200);
  });
  it('provider-health never exposes configuration secrets', async () => {
    const { call } = setup();
    const r = await call('GET', '/api/flights/provider-health');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/key|id"\s*:\s*"id"/i);
  });
  it('unknown routes and wrong methods', async () => {
    const { call } = setup();
    expect((await call('GET', '/api/nope')).status).toBe(404);
    expect((await call('POST', '/api/flights/arrivals')).status).toBe(405);
  });
});

describe('journey endpoints: authentication and privacy', () => {
  it('requires a bearer token', async () => {
    const { call } = setup();
    const r = await call('GET', `/api/journeys/${TRIP_A}/flight-status`);
    expect(r.status).toBe(401);
  });
  it('rejects an invalid token', async () => {
    const { call } = setup();
    expect((await call('GET', `/api/journeys/${TRIP_A}/flight-status`, { token: 'forged' })).status).toBe(401);
  });
  it("returns 404 (not 403) for another user's journey", async () => {
    const { call } = setup();
    const r = await call('GET', `/api/journeys/${TRIP_B}/flight-status`, { token: 'alice-token' });
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/Bob|6E/);
  });
  it('rejects non-UUID ids such as demo-mode journeys', async () => {
    const { call } = setup();
    expect((await call('GET', '/api/journeys/me-123/flight-status', { token: 'alice-token' })).status).toBe(400);
  });
});

describe('selecting a flight for a journey', () => {
  it('verifies the flight with the provider and stores server-owned fields', async () => {
    const { call, store } = setup({ handler: () => ok(flex6E()) });
    const r = await call('POST', `/api/journeys/${TRIP_A}/select-flight`, { token: 'alice-token', body: { number: '6E 2178', date: '2026-10-11' } });
    expect(r.status).toBe(200);
    expect(r.body.flight).toMatchObject({ designator: '6E 2178', verification: 'verified', scheduledArrival: '2026-10-11T00:15:00.000Z', estimatedArrival: '2026-10-11T00:35:00.000Z', actualArrival: null, source: 'flightstats-flex' });
    expect(store.trips[TRIP_A].flight_fingerprint).toBeTruthy();
  });
  it('does not mark a flight verified when the provider cannot find it', async () => {
    const { call, store } = setup({ handler: () => ok({ flightStatuses: [], appendix: {} }) });
    const r = await call('POST', `/api/journeys/${TRIP_A}/select-flight`, { token: 'alice-token', body: { number: '6E 9999', date: '2026-10-11' } });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('flight_not_found');
    expect(store.trips[TRIP_A].flight_verification).toBe('unverified');
  });
  it('refuses to save verified data without a service-role key', async () => {
    const { call } = setup({ store: fakeStore({ serviceRole: false }), handler: () => ok(flex6E()) });
    const r = await call('POST', `/api/journeys/${TRIP_A}/select-flight`, { token: 'alice-token', body: { number: '6E 2178', date: '2026-10-11' } });
    expect(r.status).toBe(503);
  });
  it('reports manually entered flights as unverified without calling the provider', async () => {
    const store = fakeStore();
    Object.assign(store.trips[TRIP_A], { flight_number: 'XY 123', flight_verification: 'unverified' });
    const { call, fetchImpl } = setup({ store });
    const r = await call('GET', `/api/journeys/${TRIP_A}/flight-status`, { token: 'alice-token' });
    expect(r.status).toBe(200);
    expect(r.body.live).toBeNull();
    expect(r.body.message).toMatch(/isn’t verified/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('scheduled refresh', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron';
  });
  it('requires the cron secret', async () => {
    const { call } = setup();
    expect((await call('POST', '/api/cron/refresh-flights', { token: 'wrong' })).status).toBe(401);
  });
  it('updates changed flights, notifies the ride without changing its times, and suppresses duplicates', async () => {
    let est = '2026-10-11T00:35:00.000Z';
    const store = fakeStore();
    let t = NOW.getTime();
    const service = createFlightService({ env: { ...ENV, FLIGHT_CACHE_TTL_SECONDS: '0' }, deps: { fetchImpl: async () => ok(flex6E(est)), sleep: async () => {}, now: () => new Date((t += 1000)) } });
    const first = await refreshActiveFlights({ service, store, now: () => NOW });
    expect(first).toMatchObject({ checked: 1, changed: 1, notified: 1 });
    expect(store.updates[0].msg).toMatch(/Bob’s flight 6E 2178 now estimated 06:05/);
    expect(store.updates[0].msg).toMatch(/Nothing changed automatically/);

    const second = await refreshActiveFlights({ service, store, now: () => NOW });
    expect(second).toMatchObject({ changed: 0, unchanged: 1, notified: 0 });

    est = '2026-10-11T00:50:00.000Z';
    const third = await refreshActiveFlights({ service, store, now: () => NOW });
    expect(third).toMatchObject({ changed: 1, notified: 1 });
    expect(store.updates[1].msg).toMatch(/now estimated 06:20 \(was 06:05\)/);
  });
  it('builds a calm message when the change does not affect departure', () => {
    const msg = impactMessage({ name: 'Rohan', flight: { designator: 'AI 507', arrival: { scheduled: '2026-10-11T00:00:00Z', estimated: '2026-10-11T00:05:00Z', actual: null } }, previousBest: '2026-10-11T00:00:00Z', bags: 1, ride: { proposed_departure_time: '2026-10-11T01:00:00Z' } });
    expect(msg).toBe('Rohan’s flight AI 507 now estimated 05:35 (was 05:30).');
  });
});
