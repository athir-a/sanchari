// Time-zone helpers. Internally all instants are UTC ISO strings; airport-local
// wall-clock times are only produced for display or for provider URLs.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Wall-clock parts of `date` in `timeZone`. */
export function zonedParts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. +330 for Asia/Kolkata). */
export function offsetMinutes(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** UTC instant for a wall-clock time in `timeZone`. Handles DST by re-checking the offset. */
export function zonedToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  let utc = new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60000);
  const corrected = new Date(guess.getTime() - offsetMinutes(utc, timeZone) * 60000);
  if (corrected.getTime() !== utc.getTime()) utc = corrected;
  return utc;
}

/** "YYYY-MM-DD" for today at the airport. */
export function todayIn(timeZone, now = new Date()) {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function parseDate(str) {
  const m = DATE_RE.exec(str || '');
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return { year: y, month: mo, day: d };
}

/** Whole days between two "YYYY-MM-DD" strings (b - a). */
export function dayDiff(a, b) {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86400000);
}

/**
 * Split [fromHour, toHour) into windows of at most `maxHours` that never cross midnight,
 * matching the provider constraint "startHour + numHours ≤ 24".
 */
export function splitWindows(fromHour, toHour, maxHours) {
  if (!Number.isInteger(fromHour) || !Number.isInteger(toHour) || fromHour < 0 || toHour > 24 || fromHour >= toHour) {
    throw new RangeError('Invalid hour window');
  }
  const out = [];
  for (let h = fromHour; h < toHour; h += maxHours) out.push({ startHour: h, numHours: Math.min(maxHours, toHour - h) });
  return out;
}

/** Local "YYYY-MM-DDTHH:mm" → UTC ISO, given the provider's paired dateLocal/dateUtc when available. */
export function toUtcIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
