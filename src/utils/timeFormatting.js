export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function fmtDuration(min) {
  if (min == null) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** mm:ss (or h:mm:ss) for a countdown in milliseconds. */
export function fmtCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function relativeMinutes(fromIso, toIso) {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000);
}

export function timeAgo(iso, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return fmtTime(iso);
}

/** Value for <input type="datetime-local"> from a Date. */
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const AIRPORT_TZ = 'Asia/Kolkata';

/** HH:mm at the airport, regardless of the viewer's own time zone. */
export const fmtAirportTime = (iso, timeZone = AIRPORT_TZ) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }) : '—';

export const fmtAirportDate = (ymd) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "YYYY-MM-DD" in the airport time zone, offset by `days`. */
export function airportDate(days = 0, timeZone = AIRPORT_TZ, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + days));
  return d.toISOString().slice(0, 10);
}

/** datetime-local value (viewer's zone) for an ISO instant. */
export const isoToLocalInput = (iso) => toLocalInput(new Date(iso));

export function ageText(seconds) {
  if (seconds == null) return '';
  if (seconds < 60) return 'under a minute old';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min old` : `${Math.round(m / 60)} h old`;
}
