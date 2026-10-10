import { ValidationError } from './errors.js';
import { parseDate, todayIn, dayDiff } from './time.js';

const AIRPORT_RE = /^[A-Z]{3}$/;
// IATA airline designator: 2 chars (letters/digits, not both digits) + 1–4 digits + optional suffix letter.
const FLIGHT_RE = /^([A-Z0-9]{2}|[A-Z]{3})\s*-?\s*(\d{1,4})([A-Z]?)$/;

export function validateAirport(code, cfg) {
  const c = String(code || cfg.defaultAirport).trim().toUpperCase();
  if (!AIRPORT_RE.test(c)) throw new ValidationError('Airport must be a 3-letter IATA code, e.g. COK.', 'airport');
  if (!cfg.airportTimeZones[c]) throw new ValidationError(`Sanchari doesn't serve ${c} yet. Supported: ${Object.keys(cfg.airportTimeZones).join(', ')}.`, 'airport');
  return c;
}

export function validateDate(date, timeZone, cfg, now = new Date()) {
  const today = todayIn(timeZone, now);
  const d = date ? String(date).trim() : today;
  if (!parseDate(d)) throw new ValidationError('Date must be a real calendar date in YYYY-MM-DD format.', 'date');
  const diff = dayDiff(today, d);
  if (diff < -cfg.dateRange.pastDays || diff > cfg.dateRange.futureDays) {
    throw new ValidationError(`Flight data is available from ${cfg.dateRange.pastDays} day(s) before to ${cfg.dateRange.futureDays} days after today (airport time).`, 'date');
  }
  return d;
}

export function validateHours(from, to) {
  const f = from === undefined || from === '' ? 0 : Number(from);
  const t = to === undefined || to === '' ? 24 : Number(to);
  if (!Number.isInteger(f) || !Number.isInteger(t) || f < 0 || f > 23 || t < 1 || t > 24 || f >= t) {
    throw new ValidationError('Hours must be whole numbers with 0 ≤ from < to ≤ 24.', 'hours');
  }
  return { fromHour: f, toHour: t };
}

/** "6E 2178", "6e2178", "AI-507" → { carrier: '6E', number: '2178' } */
export function parseFlightDesignator(input) {
  const s = String(input || '').trim().toUpperCase();
  const m = FLIGHT_RE.exec(s);
  if (!m || /^\d{2}$/.test(m[1])) throw new ValidationError('Enter a flight number like 6E 2178 or AI 507.', 'number');
  return { carrier: m[1], number: String(Number(m[2])) + m[3] };
}

/** Internal flight id: ARRIVAL-AIRPORT~CARRIER~NUMBER~LOCAL-ARRIVAL-DATE, e.g. COK~6E~2178~2026-10-11 */
export function buildFlightId({ airport, carrier, number, date }) {
  return `${airport}~${carrier}~${number}~${date}`;
}

export function parseFlightId(id) {
  const parts = String(id || '').split('~');
  if (parts.length !== 4) throw new ValidationError('Unknown flight id.', 'id');
  const [airport, carrier, number, date] = parts;
  if (!AIRPORT_RE.test(airport) || !parseDate(date)) throw new ValidationError('Unknown flight id.', 'id');
  const f = parseFlightDesignator(`${carrier}${number}`);
  return { airport, carrier: f.carrier, number: f.number, date };
}
