import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { createFlightService } from './service.js';
import { createFlexProvider } from './providers/flexProvider.js';
import { normalizeFlexResponse, mapStatus } from './providers/flexNormalize.js';
import { fetchJson } from './httpClient.js';
import { TtlCache } from './cache.js';
import { splitWindows, zonedToUtc, zonedParts, todayIn } from './time.js';
import { parseFlightDesignator, validateAirport, validateDate } from './validate.js';
import { flightConfig } from './config.js';
import { bestArrival, hasLanded } from './model.js';
import { scrub } from './logger.js';

const FIXTURE = JSON.parse(fs.readFileSync(new URL('./__fixtures__/flex-cok-arrivals.json', import.meta.url)));
const NOW = new Date('2026-10-11T03:30:00+05:30');
const ENV = { FLIGHT_DATA_PROVIDER: 'flightstats_flex', FLIGHTSTATS_APP_ID: 'test-id', FLIGHTSTATS_APP_KEY: 'test-key', FLIGHT_HTTP_BACKOFF_MS: '1' };

function response(status, body, headers = {}) {
  const h = new Map(Object.entries({ 'content-type': 'application/json', ...headers }));
  return { status, headers: { get: (k) => h.get(k.toLowerCase()) ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
}

/** Service wired to a fake fetch; returns { service, calls, clock }. */
function makeService({ handler, env = ENV } = {}) {
  const calls = [];
  const clock = { t: NOW.getTime() };
  const fetchImpl = vi.fn(async (url) => {
    calls.push(url);
    return handler(url, calls.length);
  });
  const service = createFlightService({ env, deps: { fetchImpl, sleep: async () => {}, now: () => new Date(clock.t) } });
  return { service, calls, clock, fetchImpl };
}

describe('arrival retrieval (sanitized fixture)', () => {
  it('normalizes a successful COK arrivals response', async () => {
    const { service, calls } = makeService({ handler: () => response(200, FIXTURE) });
    const r = await service.arrivals({ airport: 'COK', date: '2026-10-11', fromHour: 0, toHour: 6 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/airport/status/COK/arr/2026/10/11/0?');
    expect(calls[0]).toContain('numHours=6');
    expect(r.airport).toBe('COK');
    expect(r.timeZone).toBe('Asia/Kolkata');
    expect(r.freshness).toBe('live');
    expect(r.complete).toBe(true);
    expect(r.flights.map((f) => f.designator)).toEqual(['SQ 536', 'QR 516', 'AI 507', 'EK 530', '6E 2178']);
    const sq = r.flights[0];
    expect(sq.codeshares).toEqual(['AI 8298', 'NZ 3256']);
    expect(sq.terminal).toBe('3');
    expect(sq.baggage).toBe('5');
  });

  it('does not leak credentials in logs', () => {
    expect(scrub({ url: 'https://x/y?appId=abc&appKey=secret', appKey: 'secret' })).toEqual({ url: 'https://x/y?appId=[redacted]&appKey=[redacted]', appKey: '[redacted]' });
  });
});

describe('validation', () => {
  const cfg = flightConfig(ENV);
  it('rejects invalid airport codes', () => {
    expect(() => validateAirport('CO', cfg)).toThrow(/3-letter/);
    expect(() => validateAirport('BLR', cfg)).toThrow(/serve BLR/);
    expect(validateAirport('cok', cfg)).toBe('COK');
  });
  it('rejects invalid dates and dates outside the supported range', () => {
    expect(() => validateDate('2026-02-30', 'Asia/Kolkata', cfg, NOW)).toThrow(/real calendar date/);
    expect(() => validateDate('11-10-2026', 'Asia/Kolkata', cfg, NOW)).toThrow(/YYYY-MM-DD/);
    expect(() => validateDate('2026-10-20', 'Asia/Kolkata', cfg, NOW)).toThrow(/available from/);
    expect(validateDate('2026-10-12', 'Asia/Kolkata', cfg, NOW)).toBe('2026-10-12');
  });
  it('rejects invalid hour windows', async () => {
    const { service } = makeService({ handler: () => response(200, FIXTURE) });
    await expect(service.arrivals({ date: '2026-10-11', fromHour: 12, toHour: 6 })).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
    await expect(service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 25 })).rejects.toMatchObject({ status: 400 });
  });
  it('parses flight designators', () => {
    expect(parseFlightDesignator('6e 2178')).toEqual({ carrier: '6E', number: '2178' });
    expect(parseFlightDesignator('AI-0507')).toEqual({ carrier: 'AI', number: '507' });
    expect(() => parseFlightDesignator('12 345')).toThrow();
    expect(() => parseFlightDesignator('hello')).toThrow();
  });
});

describe('time windows and time zones', () => {
  it('splits a full day into ≤6-hour windows that never pass midnight', () => {
    expect(splitWindows(0, 24, 6)).toEqual([
      { startHour: 0, numHours: 6 }, { startHour: 6, numHours: 6 }, { startHour: 12, numHours: 6 }, { startHour: 18, numHours: 6 },
    ]);
    expect(splitWindows(20, 24, 6)).toEqual([{ startHour: 20, numHours: 4 }]);
    expect(splitWindows(5, 18, 12)).toEqual([{ startHour: 5, numHours: 12 }, { startHour: 17, numHours: 1 }]);
    expect(() => splitWindows(10, 10, 6)).toThrow();
  });
  it('requests every window for a full day', async () => {
    const { service, calls } = makeService({ handler: () => response(200, { flightStatuses: [], appendix: {} }) });
    await service.arrivals({ date: '2026-10-11' });
    expect(calls.map((u) => u.match(/\/2026\/10\/11\/(\d+)\?/)[1])).toEqual(['0', '6', '12', '18']);
  });
  it('converts Asia/Kolkata wall-clock time to UTC and back', () => {
    const utc = zonedToUtc({ year: 2026, month: 10, day: 11, hour: 0, minute: 5 }, 'Asia/Kolkata');
    expect(utc.toISOString()).toBe('2026-10-10T18:35:00.000Z');
    expect(zonedParts(new Date('2026-10-10T18:35:00Z'), 'Asia/Kolkata')).toMatchObject({ day: 11, hour: 0, minute: 5 });
    expect(todayIn('Asia/Kolkata', new Date('2026-10-10T19:00:00Z'))).toBe('2026-10-11');
  });
  it('dates flights by local arrival date, not UTC date', () => {
    const r = normalizeFlexResponse(FIXTURE, { retrievedAt: 'x' });
    const sq = r.flights.find((f) => f.designator === 'SQ 536');
    expect(sq.arrival.scheduled.startsWith('2026-10-10')).toBe(true); // UTC
    expect(sq.localArrivalDate).toBe('2026-10-11'); // local
    expect(sq.id).toBe('COK~SQ~536~2026-10-11');
  });
});

describe('normalization edge cases', () => {
  const r = normalizeFlexResponse(FIXTURE, { retrievedAt: '2026-10-11T00:00:00Z', expectAirport: 'COK' });
  const by = (d) => r.flights.find((f) => f.designator === d);

  it('handles an empty arrivals list', async () => {
    const { service } = makeService({ handler: () => response(200, { flightStatuses: [], appendix: {} }) });
    const out = await service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 });
    expect(out.flights).toEqual([]);
    expect(out.complete).toBe(true);
  });
  it('skips records missing identifying fields and tolerates missing optional fields', () => {
    expect(r.skipped).toBe(1);
    const ek = by('EK 530');
    expect(ek.terminal).toBeNull();
    expect(ek.gate).toBeNull();
    expect(ek.baggage).toBeNull();
    expect(ek.codeshares).toEqual([]);
    expect(ek.providerUpdatedAt).toBeNull();
  });
  it('keeps unknown provider statuses as UNKNOWN with the raw value', () => {
    expect(by('QR 516').status).toEqual({ raw: 'ZZ', rawLabel: null, normalized: 'UNKNOWN' });
    expect(mapStatus(undefined).normalized).toBe('UNKNOWN');
    expect(mapStatus('DN')).toEqual({ raw: 'DN', rawLabel: 'Data source needed', normalized: 'UNKNOWN' });
  });
  it('keeps scheduled, estimated and actual arrival separate', () => {
    const sq = by('SQ 536');
    expect(sq.arrival).toEqual({ scheduled: '2026-10-10T18:35:00.000Z', estimated: '2026-10-10T18:28:00.000Z', actual: '2026-10-10T18:27:00.000Z', actualKind: 'gate' });
    expect(bestArrival(sq)).toEqual({ time: '2026-10-10T18:27:00.000Z', kind: 'actual' });
    const ind = by('6E 2178');
    expect(ind.arrival.actual).toBeNull();
    expect(bestArrival(ind).kind).toBe('estimated');
    expect(bestArrival(by('EK 530')).kind).toBe('scheduled');
  });
  it('never infers landing from the clock', () => {
    const ek = by('EK 530'); // scheduled 05:35 IST, long past in a 12:00 "now"
    expect(hasLanded(ek)).toBe(false);
    expect(hasLanded(by('SQ 536'))).toBe(true);
  });
  it('rejects a response without the expected structure', () => {
    expect(normalizeFlexResponse({ foo: 1 }).ok).toBe(false);
    expect(normalizeFlexResponse({ error: { errorCode: 'AUTH' } }).ok).toBe(false);
  });
});

describe('HTTP failures, retries and rate limits', () => {
  it('rejects malformed JSON', async () => {
    const { service } = makeService({ handler: () => response(200, '{"flightStatuses": [', { 'content-type': 'application/json' }) });
    await expect(service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 })).rejects.toMatchObject({ code: 'upstream_invalid' });
  });
  it('rejects HTML (e.g. a block page) as non-JSON', async () => {
    const { service } = makeService({ handler: () => response(200, '<html>blocked</html>', { 'content-type': 'text/html' }) });
    await expect(service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 })).rejects.toMatchObject({ code: 'upstream_invalid' });
  });
  it('retries 5xx with backoff, then succeeds', async () => {
    const waits = [];
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(503, {})).mockResolvedValueOnce(response(200, { ok: 1 }));
    const out = await fetchJson('https://x', { fetchImpl, sleep: async (ms) => waits.push(ms), backoffBaseMs: 100, random: () => 0.5 });
    expect(out).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([100]);
  });
  it('uses exponential backoff and gives up after maxRetries', async () => {
    const waits = [];
    const fetchImpl = vi.fn().mockResolvedValue(response(500, {}));
    await expect(fetchJson('https://x', { fetchImpl, maxRetries: 2, sleep: async (ms) => waits.push(ms), backoffBaseMs: 100, random: () => 0.5 })).rejects.toMatchObject({ code: 'upstream_error' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([100, 200]);
  });
  it('honours Retry-After on 429', async () => {
    const waits = [];
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(429, {}, { 'retry-after': '3' })).mockResolvedValueOnce(response(200, { ok: 1 }));
    await fetchJson('https://x', { fetchImpl, sleep: async (ms) => waits.push(ms) });
    expect(waits).toEqual([3000]);
  });
  it('does not retry auth failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(403, {}));
    await expect(fetchJson('https://x', { fetchImpl, sleep: async () => {} })).rejects.toMatchObject({ code: 'upstream_auth' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('times out slow requests', async () => {
    const fetchImpl = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    await expect(fetchJson('https://x', { fetchImpl, timeoutMs: 20, maxRetries: 0 })).rejects.toMatchObject({ code: 'upstream_timeout', status: 504 });
  });
  it('reports partial results when one window fails', async () => {
    const { service } = makeService({ handler: (url) => (url.includes('/11/6?') ? response(500, {}) : response(200, FIXTURE)) });
    const r = await service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 12 });
    expect(r.complete).toBe(false);
    expect(r.freshness).toBe('unavailable');
    expect(r.notice).toMatch(/06:00–12:00/);
    expect(r.flights.length).toBeGreaterThan(0);
  });
  it('fails cleanly when every window fails and nothing is cached', async () => {
    const { service } = makeService({ handler: () => response(500, {}) });
    await expect(service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 })).rejects.toMatchObject({ code: 'upstream_error', status: 502 });
    expect(service.providerHealth().status).toBe('degraded');
  });
});

describe('caching', () => {
  it('serves repeated requests from cache within the TTL', async () => {
    const { service, calls, clock } = makeService({ handler: () => response(200, FIXTURE) });
    const a = await service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 });
    clock.t += 60_000;
    const b = await service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 });
    expect(calls).toHaveLength(1);
    expect(a.freshness).toBe('live');
    expect(b.freshness).toBe('cached');
    expect(b.ageSeconds).toBe(60);
  });
  it('refetches after the TTL expires', async () => {
    const { service, calls, clock } = makeService({ handler: () => response(200, FIXTURE) });
    await service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 });
    clock.t += 301_000;
    const r = await service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 });
    expect(calls).toHaveLength(2);
    expect(r.freshness).toBe('live');
  });
  it('serves stale data with a label when the provider fails after the TTL', async () => {
    const { service, clock } = makeService({ handler: (u, n) => (n === 1 ? response(200, FIXTURE) : response(500, {})) });
    await service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 });
    clock.t += 20 * 60_000;
    const r = await service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 });
    expect(r.freshness).toBe('stale');
    expect(r.flights[0].freshness).toBe('stale');
    expect(r.ageSeconds).toBe(1200);
    expect(r.notice).toMatch(/last data/);
  });
  it('drops stale data older than the maximum stale age', async () => {
    const c = new TtlCache({ ttlSeconds: 10, maxStaleSeconds: 60, now: () => t });
    let t = 0;
    c.set('k', 1);
    t = 61_000;
    expect(c.peek('k')).toBeNull();
  });
  it('de-duplicates concurrent requests for the same window', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const { service, calls } = makeService({ handler: async () => { await gate; return response(200, FIXTURE); } });
    const p = Promise.all([1, 2, 3].map(() => service.arrivals({ date: '2026-10-11', fromHour: 0, toHour: 6 })));
    release();
    await p;
    expect(calls).toHaveLength(1);
  });
});

describe('flight search and update tracking', () => {
  const single = (fs) => ({ flightStatuses: [fs], appendix: FIXTURE.appendix });
  it('finds a flight by number and date, including codeshare numbers', async () => {
    const { service, calls } = makeService({ handler: () => response(200, single(FIXTURE.flightStatuses[0])) });
    const r = await service.search({ number: 'AI 8298', date: '2026-10-11' });
    expect(calls[0]).toContain('/flight/status/AI/8298/arr/2026/10/11?');
    expect(r.flight.designator).toBe('SQ 536');
    expect(r.flight.verification).toBe('verified');
  });
  it('returns flight_not_found instead of guessing', async () => {
    const { service } = makeService({ handler: () => response(200, { flightStatuses: [], appendix: {} }) });
    await expect(service.search({ number: '6E 9999', date: '2026-10-11' })).rejects.toMatchObject({ code: 'flight_not_found', status: 404 });
  });
  it('suppresses duplicate updates and reports real changes', async () => {
    const base = FIXTURE.flightStatuses[1];
    let est = '2026-10-11T00:35:00.000Z';
    const { service, clock } = makeService({
      handler: () => response(200, single({ ...base, operationalTimes: { ...base.operationalTimes, estimatedGateArrival: { dateUtc: est } } })),
    });
    const a = await service.search({ number: '6E2178', date: '2026-10-11' });
    clock.t += 400_000;
    const b = await service.search({ number: '6E2178', date: '2026-10-11' });
    clock.t += 400_000;
    est = '2026-10-11T00:50:00.000Z';
    const c = await service.search({ number: '6E2178', date: '2026-10-11' });
    expect([a.changed, b.changed, c.changed]).toEqual([true, false, true]);
    expect(c.flight.arrival.estimated).toBe('2026-10-11T00:50:00.000Z');
  });
});

describe('provider configuration', () => {
  it('reports not_configured and never fabricates flights without credentials', async () => {
    const { service, fetchImpl } = makeService({ handler: () => response(200, FIXTURE), env: { FLIGHT_DATA_PROVIDER: 'flightstats_flex' } });
    await expect(service.arrivals({ date: '2026-10-11' })).rejects.toMatchObject({ code: 'provider_not_configured', status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(service.providerHealth().status).toBe('not_configured');
  });
  it('defaults to no provider', () => {
    const s = createFlightService({ env: {} });
    expect(s.provider.configured).toBe(false);
    expect(s.providerHealth().provider.reason).toMatch(/FLIGHT_DATA_PROVIDER=none/);
  });
  it('builds Flex URLs with credentials as query parameters', async () => {
    const urls = [];
    const p = createFlexProvider(flightConfig(ENV), { fetchImpl: async (u) => (urls.push(u), response(200, { flightStatuses: [], appendix: {} })), sleep: async () => {} });
    await p.arrivalsWindow({ airport: 'COK', date: '2026-10-09', startHour: 18, numHours: 6 });
    const u = new URL(urls[0]);
    expect(u.pathname).toBe('/flex/flightstatus/rest/v2/json/airport/status/COK/arr/2026/10/9/18');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ appId: 'test-id', appKey: 'test-key', utc: 'false', numHours: '6' });
  });
});

describe('demo provider', () => {
  const demo = (now = NOW) => createFlightService({ env: { FLIGHT_DATA_PROVIDER: 'demo' }, deps: { now: () => now } });
  it('serves clearly labelled sample COK arrivals', async () => {
    const r = await demo().arrivals({ date: '2026-10-11' });
    expect(r.provider).toMatchObject({ id: 'demo', isDemo: true, configured: true });
    expect(r.provider.label).toBe('Sample schedule');
    expect(r.flights.length).toBe(25);
    expect(r.flights.every((f) => f.source === 'demo' && /^\S+ 9\d{3}$/.test(f.designator))).toBe(true);
  });
  it('derives status from the clock it is given, never inventing actuals in the future', async () => {
    const r = await demo(new Date('2026-10-11T12:00:00+05:30')).arrivals({ date: '2026-10-11' });
    for (const f of r.flights) {
      if (f.arrival.actual) expect(new Date(f.arrival.actual) <= new Date('2026-10-11T12:00:00+05:30')).toBe(true);
    }
    expect(r.flights.find((f) => f.designator === 'IX 9452').status.normalized).toBe('CANCELLED');
    expect(r.flights.some((f) => f.status.normalized === 'LANDED')).toBe(true);
    expect(r.flights.some((f) => f.status.normalized === 'SCHEDULED')).toBe(true);
  });
  it('finds a demo flight by number', async () => {
    const r = await demo().search({ number: '6E 9178', date: '2026-10-11' });
    expect(r.flight.designator).toBe('6E 9178');
  });
});
