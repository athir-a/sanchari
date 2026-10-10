// Service area: Cochin International Airport (COK) → Thrissur corridor,
// via Aluva, Angamaly and Chalakudy, plus nearby Kochi suburbs.
// Coordinates are approximate area centres, used only for straight-line
// distance estimates (× road factor). They are NOT routed road distances.

export const AIRPORTS = {
  COK: {
    code: 'COK',
    name: 'Cochin International Airport',
    city: 'Kochi',
    lat: 10.152,
    lng: 76.4019,
    pickupPoint: 'Arrivals forecourt · Taxi & app-cab pickup area',
  },
};

// `hub` is the public-transport interchange used by the CHEAPEST option
// (shared cab → hub → bus or metro). The BALANCED option picks one shared stop
// from the riders' own areas (see fareCalculation).
export const ZONES = {
  'COK-kochi': {
    id: 'COK-kochi', airport: 'COK', name: 'Kochi suburbs', order: 0,
    hub: { name: 'Aluva Metro Station', lat: 10.1099, lng: 76.3497, mode: 'Metro' },
  },
  'COK-aluva': {
    id: 'COK-aluva', airport: 'COK', name: 'Aluva', order: 1,
    hub: { name: 'Aluva KSRTC Bus Station', lat: 10.1072, lng: 76.3528, mode: 'Bus' },
  },
  'COK-angamaly': {
    id: 'COK-angamaly', airport: 'COK', name: 'Angamaly & Kalady', order: 2,
    hub: { name: 'Angamaly KSRTC Bus Terminal', lat: 10.1925, lng: 76.3866, mode: 'Bus' },
  },
  'COK-chalakudy': {
    id: 'COK-chalakudy', airport: 'COK', name: 'Chalakudy & Koratty', order: 3,
    hub: { name: 'Angamaly KSRTC Bus Terminal', lat: 10.1925, lng: 76.3866, mode: 'Bus' },
  },
  'COK-thrissur': {
    id: 'COK-thrissur', airport: 'COK', name: 'Thrissur', order: 4,
    hub: { name: 'Angamaly KSRTC Bus Terminal', lat: 10.1925, lng: 76.3866, mode: 'Bus' },
  },
};

export const DESTINATIONS = [
  // Kochi suburbs (south-west of the airport)
  { id: 'cok-kalamassery', airport: 'COK', zone: 'COK-kochi', name: 'Kalamassery', lat: 10.051, lng: 76.315 },
  { id: 'cok-edappally', airport: 'COK', zone: 'COK-kochi', name: 'Edappally', lat: 10.0261, lng: 76.3083 },
  { id: 'cok-kakkanad', airport: 'COK', zone: 'COK-kochi', name: 'Kakkanad', lat: 10.0159, lng: 76.3419 },
  // Aluva
  { id: 'cok-aluva', airport: 'COK', zone: 'COK-aluva', name: 'Aluva town', lat: 10.1076, lng: 76.3516 },
  { id: 'cok-paravur-jn', airport: 'COK', zone: 'COK-aluva', name: 'Desom', lat: 10.1358, lng: 76.3681 },
  // Angamaly & Kalady (north of the airport)
  { id: 'cok-angamaly', airport: 'COK', zone: 'COK-angamaly', name: 'Angamaly', lat: 10.196, lng: 76.386 },
  { id: 'cok-kalady', airport: 'COK', zone: 'COK-angamaly', name: 'Kalady', lat: 10.1667, lng: 76.438 },
  { id: 'cok-karukutty', airport: 'COK', zone: 'COK-angamaly', name: 'Karukutty', lat: 10.2268, lng: 76.377 },
  // Chalakudy & Koratty (on the NH 544 corridor)
  { id: 'cok-koratty', airport: 'COK', zone: 'COK-chalakudy', name: 'Koratty', lat: 10.269, lng: 76.354 },
  { id: 'cok-chalakudy', airport: 'COK', zone: 'COK-chalakudy', name: 'Chalakudy', lat: 10.307, lng: 76.333 },
  { id: 'cok-mala', airport: 'COK', zone: 'COK-chalakudy', name: 'Mala', lat: 10.245, lng: 76.264 },
  // Thrissur
  { id: 'cok-irinjalakuda', airport: 'COK', zone: 'COK-thrissur', name: 'Irinjalakuda', lat: 10.342, lng: 76.211 },
  { id: 'cok-pudukkad', airport: 'COK', zone: 'COK-thrissur', name: 'Pudukkad', lat: 10.417, lng: 76.269 },
  { id: 'cok-ollur', airport: 'COK', zone: 'COK-thrissur', name: 'Ollur', lat: 10.48, lng: 76.24 },
  { id: 'cok-thrissur-round', airport: 'COK', zone: 'COK-thrissur', name: 'Thrissur Swaraj Round', lat: 10.5241, lng: 76.2141 },
  { id: 'cok-thrissur-rly', airport: 'COK', zone: 'COK-thrissur', name: 'Thrissur Railway Station', lat: 10.5157, lng: 76.2085 },
  { id: 'cok-poonkunnam', airport: 'COK', zone: 'COK-thrissur', name: 'Poonkunnam', lat: 10.541, lng: 76.207 },
];

/** Corridor stops shown on the home page, airport outward. */
export const CORRIDOR = ['Cochin Airport', 'Angamaly', 'Koratty', 'Chalakudy', 'Pudukkad', 'Ollur', 'Thrissur'];

export const destinationsForAirport = (code) => DESTINATIONS.filter((d) => d.airport === code);
export const getDestination = (id) => DESTINATIONS.find((d) => d.id === id) || null;
export const getZone = (id) => ZONES[id] || null;
export const getAirport = (code) => AIRPORTS[code] || null;
