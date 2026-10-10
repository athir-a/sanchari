import { getDestination } from './airports.js';

// Fictional passengers for demo mode. Arrival times are expressed relative to
// YOUR arrival so the demo works for any date and time you enter.
// The default demo trip (BLR → Indiranagar, Balanced, 2 bags) produces:
//   matches:  Ananya, Meera, Rohan, Zoya
//   rejected: Kabir (time), Farah (destination), Vikram (luggage), Ishaan (airport)
const SEED = [
  // Bengaluru
  { id: 'demo-ananya', name: 'Ananya', airport: 'BLR', offset: 12, dest: 'blr-koramangala', bags: 1, pref: 'balanced', flight: '6E 512' },
  { id: 'demo-rohan', name: 'Rohan', airport: 'BLR', offset: -8, dest: 'blr-mgroad', bags: 1, pref: 'cheapest', flight: 'AI 803' },
  { id: 'demo-meera', name: 'Meera', airport: 'BLR', offset: 18, dest: 'blr-indiranagar', bags: 2, pref: 'direct', flight: 'UK 815' },
  { id: 'demo-zoya', name: 'Zoya', airport: 'BLR', offset: 14, dest: 'blr-hsr', bags: 2, pref: 'balanced', flight: 'QP 1341' },
  { id: 'demo-kabir', name: 'Kabir', airport: 'BLR', offset: 95, dest: 'blr-indiranagar', bags: 1, pref: 'balanced', flight: '6E 2134' },
  { id: 'demo-farah', name: 'Farah', airport: 'BLR', offset: 6, dest: 'blr-whitefield', bags: 2, pref: 'balanced', flight: 'AI 507' },
  { id: 'demo-vikram', name: 'Vikram', airport: 'BLR', offset: 10, dest: 'blr-koramangala', bags: 5, pref: 'balanced', flight: 'EK 568' },
  { id: 'demo-sana', name: 'Sana', airport: 'BLR', offset: -15, dest: 'blr-krpuram', bags: 1, pref: 'balanced', flight: '6E 6011' },
  { id: 'demo-nikhil', name: 'Nikhil', airport: 'BLR', offset: 30, dest: 'blr-whitefield', bags: 1, pref: 'direct', flight: 'UK 862' },
  { id: 'demo-tara', name: 'Tara', airport: 'BLR', offset: 25, dest: 'blr-ecity', bags: 1, pref: 'cheapest', flight: 'IX 2981' },
  { id: 'demo-priya', name: 'Priya', airport: 'BLR', offset: -20, dest: 'blr-jayanagar', bags: 2, pref: 'cheapest', flight: 'AI 2817' },
  { id: 'demo-leela', name: 'Leela', airport: 'BLR', offset: 22, dest: 'blr-malleshwaram', bags: 1, pref: 'balanced', flight: '6E 401' },
  { id: 'demo-arjun', name: 'Arjun', airport: 'BLR', offset: 3, dest: 'blr-hebbal', bags: 1, pref: 'direct', flight: 'QP 1102' },
  { id: 'demo-ravi', name: 'Ravi', airport: 'BLR', offset: 40, dest: 'blr-rajajinagar', bags: 1, pref: 'cheapest', flight: 'SG 136' },
  // Delhi
  { id: 'demo-ishaan', name: 'Ishaan', airport: 'DEL', offset: 4, dest: 'del-hauzkhas', bags: 1, pref: 'balanced', flight: 'AI 504' },
  { id: 'demo-neha', name: 'Neha', airport: 'DEL', offset: -10, dest: 'del-saket', bags: 2, pref: 'direct', flight: '6E 2045' },
  { id: 'demo-aman', name: 'Aman', airport: 'DEL', offset: 20, dest: 'del-cp', bags: 1, pref: 'balanced', flight: 'UK 818' },
  // Mumbai
  { id: 'demo-kiran', name: 'Kiran', airport: 'BOM', offset: 8, dest: 'bom-bandra', bags: 1, pref: 'balanced', flight: 'AI 609' },
  { id: 'demo-pooja', name: 'Pooja', airport: 'BOM', offset: -12, dest: 'bom-worli', bags: 2, pref: 'balanced', flight: '6E 5318' },
];

/** Build candidate trips around the given arrival time (ISO string). */
export function buildDemoCandidates(anchorArrivalIso) {
  const anchor = new Date(anchorArrivalIso).getTime();
  return SEED.map((p) => {
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
      status: 'searching',
    };
  });
}

export const DEMO_TRIP = {
  displayName: 'Aditi',
  flightNumber: '6E 2178',
  airportCode: 'BLR',
  destinationId: 'blr-indiranagar',
  dropoffAddress: '12th Main, HAL 2nd Stage',
  luggageCount: 2,
  preference: 'balanced',
};
