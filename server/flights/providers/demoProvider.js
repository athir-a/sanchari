// DEMO flight source — generated sample arrivals for Cochin (COK), for demonstrations only.
// Enabled with FLIGHT_DATA_PROVIDER=demo. Every record carries source "demo" and the UI
// labels it as sample data, so it is never mistaken for live flight information.
import { zonedToUtc, parseDate } from '../time.js';
import { buildFlightId } from '../validate.js';

const AIRLINES = {
  '6E': 'IndiGo', AI: 'Air India', IX: 'Air India Express', EK: 'Emirates', QR: 'Qatar Airways',
  SQ: 'Singapore Airlines', G9: 'Air Arabia', WY: 'Oman Air', EY: 'Etihad Airways', QP: 'Akasa Air', UL: 'SriLankan Airlines',
};
const ORIGINS = {
  BLR: ['Bengaluru', 'Kempegowda International Airport'], DEL: ['Delhi', 'Indira Gandhi International Airport'],
  BOM: ['Mumbai', 'Chhatrapati Shivaji Maharaj International Airport'], MAA: ['Chennai', 'Chennai International Airport'],
  HYD: ['Hyderabad', 'Rajiv Gandhi International Airport'], DXB: ['Dubai', 'Dubai International Airport'],
  DOH: ['Doha', 'Hamad International Airport'], SIN: ['Singapore', 'Singapore Changi Airport'], SHJ: ['Sharjah', 'Sharjah International Airport'],
  MCT: ['Muscat', 'Muscat International Airport'], AUH: ['Abu Dhabi', 'Zayed International Airport'], CMB: ['Colombo', 'Bandaranaike International Airport'],
};

// [carrier, number, origin, HH:MM local arrival, block minutes, terminal, special]
const SCHEDULE = [
  ['SQ', '9536', 'SIN', '00:10', 240, '3'],
  ['EK', '9530', 'DXB', '02:55', 235, '3'],
  ['G9', '9426', 'SHJ', '03:40', 240, '3'],
  ['6E', '9171', 'BLR', '05:30', 65, '1'],
  ['QR', '9516', 'DOH', '06:15', 250, '3'],
  ['AI', '9501', 'DEL', '07:20', 190, '1'],
  ['IX', '9452', 'DXB', '07:55', 245, '3', 'cancelled'],
  ['6E', '9221', 'BOM', '08:45', 115, '1'],
  ['QP', '9118', 'BLR', '09:30', 60, '1'],
  ['UL', '9165', 'CMB', '10:20', 75, '3'],
  ['6E', '9365', 'MAA', '11:05', 70, '1'],
  ['WY', '9283', 'MCT', '12:10', 220, '3'],
  ['AI', '9681', 'BOM', '13:00', 110, '1'],
  ['6E', '9412', 'HYD', '13:50', 90, '1'],
  ['EY', '9280', 'AUH', '14:35', 235, '3'],
  ['6E', '9178', 'BLR', '15:25', 65, '1'],
  ['EK', '9532', 'DXB', '16:10', 240, '3'],
  ['AI', '9833', 'DEL', '17:05', 195, '1'],
  ['QR', '9506', 'DOH', '18:00', 250, '3'],
  ['IX', '9434', 'SHJ', '18:50', 240, '3', 'diverted'],
  ['6E', '9244', 'BOM', '19:40', 115, '1'],
  ['QP', '9144', 'BLR', '20:30', 60, '1'],
  ['AI', '9503', 'MAA', '21:15', 75, '1'],
  ['6E', '9305', 'DEL', '22:05', 200, '1'],
  ['G9', '9428', 'SHJ', '23:10', 240, '3'],
];

/** Small deterministic hash so delays are stable for a given flight and date. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

const iso = (ms) => new Date(ms).toISOString();

function build(row, date, nowMs, retrievedAt) {
  const [carrier, number, origin, hhmm, block, terminal, special] = row;
  const d = parseDate(date);
  const [hh, mm] = hhmm.split(':').map(Number);
  const sched = zonedToUtc({ ...d, hour: hh, minute: mm }, 'Asia/Kolkata').getTime();
  const delayMin = (hash(`${carrier}${number}${date}`) % 41) - 10; // −10 … +30 minutes
  const eta = sched + delayMin * 60000;
  const departed = eta - block * 60000;

  let status = 'S';
  let estimated = null;
  let actual = null;
  if (special === 'cancelled') status = 'C';
  else if (special === 'diverted' && nowMs >= departed) status = 'D';
  else if (nowMs >= eta) {
    status = 'L';
    actual = iso(eta);
    estimated = iso(eta);
  } else if (nowMs >= departed) {
    status = 'A';
    estimated = iso(eta);
  } else if (eta - nowMs < 6 * 3600e3) {
    estimated = iso(eta); // airlines usually publish estimates a few hours out
  }

  const showBelt = status === 'L';
  return {
    id: buildFlightId({ airport: 'COK', carrier, number, date }),
    providerFlightId: `demo-${carrier}${number}-${date}`,
    source: 'demo',
    airline: { code: carrier, name: AIRLINES[carrier] },
    flightNumber: number,
    designator: `${carrier} ${number}`,
    codeshares: [],
    origin: { code: origin, name: ORIGINS[origin][1], city: ORIGINS[origin][0] },
    destination: { code: 'COK', name: 'Cochin International Airport' },
    departure: { scheduled: iso(sched - block * 60000), estimated: null, actual: nowMs >= departed && status !== 'C' ? iso(departed) : null },
    arrival: { scheduled: iso(sched), estimated, actual, actualKind: actual ? 'gate' : null },
    localArrivalDate: date,
    status: {
      raw: status,
      rawLabel: { S: 'Scheduled', A: 'Active', L: 'Landed', C: 'Canceled', D: 'Diverted' }[status],
      normalized: { S: 'SCHEDULED', A: 'EN_ROUTE', L: 'LANDED', C: 'CANCELLED', D: 'DIVERTED' }[status],
    },
    terminal,
    gate: null,
    baggage: showBelt ? String((hash(number) % 6) + 1) : null,
    providerUpdatedAt: retrievedAt,
    retrievedAt,
  };
}

export function createDemoProvider(deps = {}) {
  const now = deps.now || (() => new Date());
  const all = (date) => {
    const t = now();
    return SCHEDULE.map((row) => build(row, date, t.getTime(), t.toISOString()));
  };
  return {
    id: 'demo',
    label: 'Sample schedule',
    configured: true,
    isDemo: true,
    maxWindowHours: 6,
    async arrivalsWindow({ airport, date, startHour, numHours }) {
      if (airport !== 'COK') return { flights: [], retrievedAt: now().toISOString() };
      const flights = all(date).filter((f) => {
        const h = Number(new Date(f.arrival.scheduled).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
        return h >= startHour && h < startHour + numHours;
      });
      return { flights, retrievedAt: now().toISOString() };
    },
    async flightStatus({ carrier, number, date }) {
      const flights = all(date).filter((f) => f.airline.code === carrier && f.flightNumber === number);
      return { flights, retrievedAt: now().toISOString() };
    },
  };
}
