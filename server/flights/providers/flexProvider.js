// Cirium FlightStats Flex API (licensed; requires appId + appKey from developer.flightstats.com).
// Paths: /airport/status/{airport}/arr/{y}/{m}/{d}/{hour}  and  /flight/status/{carrier}/{flight}/arr/{y}/{m}/{d}
import { fetchJson } from '../httpClient.js';
import { FlightDataError } from '../errors.js';
import { normalizeFlexResponse } from './flexNormalize.js';
import { parseDate } from '../time.js';

export function createFlexProvider(cfg, deps = {}) {
  const { appId, appKey, baseUrl, maxWindowHours } = cfg.flex;
  const http = { ...cfg.http, fetchImpl: deps.fetchImpl, sleep: deps.sleep };
  const now = deps.now || (() => new Date());

  function url(path, params) {
    const q = new URLSearchParams({ appId, appKey, utc: 'false', extendedOptions: 'useHTTPErrors', ...params });
    return `${baseUrl}/${path}?${q}`;
  }

  async function call(path, params, label, expectAirport) {
    const body = await fetchJson(url(path, params), { ...http, logLabel: label });
    const retrievedAt = now().toISOString();
    const n = normalizeFlexResponse(body, { retrievedAt, expectAirport });
    if (!n.ok) throw new FlightDataError('upstream_invalid', 'The flight-data provider returned an unexpected response.', { detail: n.reason });
    return { flights: n.flights, skipped: n.skipped, retrievedAt };
  }

  return {
    id: 'flightstats-flex',
    label: 'Cirium FlightStats Flex API',
    configured: Boolean(appId && appKey),
    maxWindowHours,
    /** One arrivals window at the airport, local time. */
    async arrivalsWindow({ airport, date, startHour, numHours }) {
      const d = parseDate(date);
      return call(`airport/status/${airport}/arr/${d.year}/${d.month}/${d.day}/${startHour}`, { numHours: String(numHours), maxFlights: '500' }, 'flex.arrivals', airport);
    },
    /** A flight arriving on a local date, optionally at a specific airport. */
    async flightStatus({ carrier, number, date, airport }) {
      const d = parseDate(date);
      const params = airport ? { airport } : {};
      return call(`flight/status/${carrier}/${number}/arr/${d.year}/${d.month}/${d.day}`, params, 'flex.flight', airport);
    },
  };
}
