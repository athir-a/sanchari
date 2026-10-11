import { getDestination, getDistrict } from './airports.js';

// Fictional travellers used when Sanchari runs without a database (local mode).
// Arrival times are relative to YOUR arrival so it works for any date and time.
// The default demo trip (COK → Thrissur Swaraj Round, Balanced, 2 bags) produces:
//   matches:  Ananya, Meera, Joseph (Thrissur area); Arjun, Rohan, Priya (on your route)
//   rejected: Kabir (time), Farah (Kakkanad is off-route), Vikram (luggage), Ishaan (airport), and others
const SEED = [
  { id: 'demo-ananya', name: 'Ananya', airport: 'COK', offset: 12, dest: 'cok-thrissur-rly', bags: 1, pref: 'balanced', flight: '6E 1127' },
  { id: 'demo-rohan', name: 'Rohan', airport: 'COK', offset: -8, dest: 'cok-chalakudy', bags: 1, pref: 'cheapest', flight: 'AI 2817' },
  { id: 'demo-meera', name: 'Meera', airport: 'COK', offset: 18, dest: 'cok-poonkunnam', bags: 2, pref: 'direct', flight: 'EK 530' },
  { id: 'demo-joseph', name: 'Joseph', airport: 'COK', offset: 6, dest: 'cok-ollur', bags: 1, pref: 'balanced', flight: 'QR 516' },
  { id: 'demo-kabir', name: 'Kabir', airport: 'COK', offset: 95, dest: 'cok-thrissur-round', bags: 1, pref: 'balanced', flight: '6E 6413' },
  { id: 'demo-farah', name: 'Farah', airport: 'COK', offset: 4, dest: 'cok-kakkanad', bags: 2, pref: 'balanced', flight: 'IX 434' },
  { id: 'demo-vikram', name: 'Vikram', airport: 'COK', offset: 10, dest: 'cok-thrissur-rly', bags: 5, pref: 'balanced', flight: 'EY 280' },
  { id: 'demo-sana', name: 'Sana', airport: 'COK', offset: -15, dest: 'cok-aluva', bags: 1, pref: 'balanced', flight: 'AI 507' },
  { id: 'demo-nikhil', name: 'Nikhil', airport: 'COK', offset: 30, dest: 'cok-edappally', bags: 1, pref: 'direct', flight: 'UK 841' },
  { id: 'demo-tara', name: 'Tara', airport: 'COK', offset: -55, dest: 'cok-kalady', bags: 1, pref: 'cheapest', flight: 'SG 37' },
  { id: 'demo-priya', name: 'Priya', airport: 'COK', offset: -20, dest: 'cok-irinjalakuda', bags: 2, pref: 'cheapest', flight: '6E 2045' },
  { id: 'demo-arjun', name: 'Arjun', airport: 'COK', offset: 3, dest: 'cok-koratty', bags: 1, pref: 'direct', flight: 'QP 1372' },
  { id: 'demo-zoya', name: 'Zoya', airport: 'COK', offset: 70, dest: 'cok-angamaly', bags: 2, pref: 'balanced', flight: 'IX 412' },
  { id: 'demo-leela', name: 'Leela', airport: 'COK', offset: -5, dest: 'cok-kalamassery', bags: 1, pref: 'balanced', flight: 'AI 933' },
  // Lands at a different airport — must be rejected.
  { id: 'demo-ishaan', name: 'Ishaan', airport: 'TRV', offset: 4, dest: 'cok-thrissur-round', bags: 1, pref: 'balanced', flight: '6E 515' },
];

/** Two extra travellers on the road to your district, so every district has someone to ride with. */
function routeCompanions(trip) {
  const district = getDistrict(trip?.destinationZone);
  if (!district || ['thrissur', 'ernakulam'].includes(district.id)) return [];
  const route = district.route;
  return [
    { id: 'demo-devika', name: 'Devika', airport: 'COK', offset: 7, dest: route[route.length - 1], bags: 1, pref: trip.preference, flight: '6E 482' },
    { id: 'demo-sameer', name: 'Sameer', airport: 'COK', offset: -6, dest: route[Math.max(0, route.length - 3)], bags: 1, pref: trip.preference, flight: 'AI 681' },
  ];
}

/** Build candidate trips around the given arrival time (ISO string). */
export function buildDemoCandidates(anchorArrivalIso, trip = null) {
  const anchor = new Date(anchorArrivalIso).getTime();
  return [...SEED, ...routeCompanions(trip)].map((p) => {
    const d = getDestination(p.dest);
    return {
      id: p.id,
      isDemo: true,
      displayName: p.name,
      flightNumber: p.flight,
      airportCode: p.airport,
      arrivalTime: new Date(anchor + p.offset * 60000).toISOString(),
      destinationId: d.id,
      destinationName: d.name,
      destinationZone: d.zone,
      destinationLat: d.lat,
      destinationLng: d.lng,
      luggageCount: p.bags,
      preference: p.pref,
      maxDetourMinutes: 25,
      status: 'searching',
    };
  });
}

export const DEMO_TRIP = {
  displayName: 'Aditi',
  flightNumber: '6E 2178',
  airportCode: 'COK',
  destinationId: 'cok-thrissur-round',
  dropoffAddress: 'Near Vadakkumnathan Temple, East Fort',
  district: 'thrissur',
  luggageCount: 2,
  preference: 'balanced',
  maxDetourMinutes: 25,
};
