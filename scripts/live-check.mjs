#!/usr/bin/env node
// Manual integration check against the REAL configured flight-data provider.
//   npm run check:flights            (reads .env / .env.local)
// Prints PASS only if a genuine request succeeded and the returned records validate.
import fs from 'node:fs';
import { createFlightService } from '../server/flights/service.js';
import { todayIn, zonedParts } from '../server/flights/time.js';

for (const f of ['.env', '.env.local']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const airport = (process.argv[2] || 'COK').toUpperCase();
const service = createFlightService();
const health = service.providerHealth();
console.log(`Provider: ${health.provider.label} (${health.provider.id})`);
if (!health.provider.configured) {
  console.log(`NOT RUN — ${health.provider.reason}`);
  console.log('Set FLIGHT_DATA_PROVIDER=flightstats_flex, FLIGHTSTATS_APP_ID and FLIGHTSTATS_APP_KEY to run this check.');
  process.exit(2);
}

const tz = service.config.airportTimeZones[airport];
const date = todayIn(tz);
const hour = zonedParts(new Date(), tz).hour;
const from = Math.min(hour, 18);
const to = Math.min(24, from + 6);
console.log(`Requesting ${airport} arrivals for ${date} ${String(from).padStart(2, '0')}:00–${String(to).padStart(2, '0')}:00 (${tz})…`);

try {
  const r = await service.arrivals({ airport, date, fromHour: from, toHour: to });
  const problems = [];
  if (r.airport !== airport) problems.push('airport mismatch');
  if (r.freshness !== 'live') problems.push(`expected a live fetch, got ${r.freshness}`);
  for (const f of r.flights) {
    if (f.destination.code !== airport) problems.push(`${f.designator}: destination ${f.destination.code}`);
    if (!f.designator || !f.arrival.scheduled) problems.push(`${f.id}: missing designator or scheduled arrival`);
  }
  const fields = ['providerFlightId', 'airline.name', 'origin.code', 'arrival.scheduled', 'arrival.estimated', 'arrival.actual', 'status.raw', 'terminal', 'gate', 'baggage', 'providerUpdatedAt'];
  const get = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
  console.log(`Flights returned: ${r.flights.length} (complete: ${r.complete})`);
  for (const p of fields) console.log(`  ${p.padEnd(20)} present in ${r.flights.filter((f) => get(f, p) != null).length}/${r.flights.length}`);
  console.log('Sample:', r.flights.slice(0, 3).map((f) => `${f.designator} from ${f.origin.code} sched ${f.arrival.scheduled} status ${f.status.normalized}`));
  if (problems.length) {
    console.log('FAIL —', problems.slice(0, 10));
    process.exit(1);
  }
  console.log(r.flights.length ? 'PASS — real data received and validated.' : 'INCONCLUSIVE — request succeeded but returned no flights in this window.');
} catch (e) {
  console.log(`FAIL — ${e.code || 'error'}: ${e.message}`);
  process.exit(1);
}
