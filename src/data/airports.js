// Curated airports, destination zones and drop-off areas.
// Coordinates are approximate area centres, used only for straight-line
// distance estimates. They are NOT road routes.

export const AIRPORTS = {
  BLR: {
    code: 'BLR',
    name: 'Bengaluru (Kempegowda Intl)',
    city: 'Bengaluru',
    lat: 13.1986,
    lng: 77.7066,
    pickupPoint: 'Terminal 1 Arrivals · App-cab pickup bay',
  },
  DEL: {
    code: 'DEL',
    name: 'Delhi (Indira Gandhi Intl)',
    city: 'Delhi',
    lat: 28.5562,
    lng: 77.1,
    pickupPoint: 'Terminal 3 Arrivals · App-cab pickup bay',
  },
  BOM: {
    code: 'BOM',
    name: 'Mumbai (Chhatrapati Shivaji Maharaj Intl)',
    city: 'Mumbai',
    lat: 19.0896,
    lng: 72.8656,
    pickupPoint: 'Terminal 2 Arrivals · App-cab pickup bay',
  },
};

// Each zone has:
//  - hub:   transit hub used by the CHEAPEST option (shared cab → public transport)
// The BALANCED option picks one shared stop from the riders' own areas (see fareCalculation).
export const ZONES = {
  // Bengaluru
  'BLR-north': {
    id: 'BLR-north', airport: 'BLR', name: 'North Bengaluru',
    hub: { name: 'Yelahanka Bus Stand', lat: 13.1007, lng: 77.5963, mode: 'Bus' },
  },
  'BLR-central': {
    id: 'BLR-central', airport: 'BLR', name: 'Central Bengaluru',
    hub: { name: 'Hebbal Transit Hub', lat: 13.0358, lng: 77.597, mode: 'Metro' },
  },
  'BLR-east': {
    id: 'BLR-east', airport: 'BLR', name: 'East Bengaluru',
    hub: { name: 'KR Puram Transit Hub', lat: 13.0005, lng: 77.675, mode: 'Metro' },
  },
  'BLR-south': {
    id: 'BLR-south', airport: 'BLR', name: 'South Bengaluru',
    hub: { name: 'Hebbal Transit Hub', lat: 13.0358, lng: 77.597, mode: 'Metro + Bus' },
  },
  'BLR-west': {
    id: 'BLR-west', airport: 'BLR', name: 'West Bengaluru',
    hub: { name: 'Yeshwanthpur Transit Hub', lat: 13.0285, lng: 77.5409, mode: 'Metro' },
  },
  // Delhi
  'DEL-south': {
    id: 'DEL-south', airport: 'DEL', name: 'South Delhi',
    hub: { name: 'Aerocity Transit Hub', lat: 28.5486, lng: 77.1206, mode: 'Metro' },
  },
  'DEL-central': {
    id: 'DEL-central', airport: 'DEL', name: 'Central Delhi',
    hub: { name: 'Aerocity Transit Hub', lat: 28.5486, lng: 77.1206, mode: 'Metro' },
  },
  'DEL-gurugram': {
    id: 'DEL-gurugram', airport: 'DEL', name: 'Gurugram',
    hub: { name: 'Aerocity Transit Hub', lat: 28.5486, lng: 77.1206, mode: 'Metro' },
  },
  // Mumbai
  'BOM-west': {
    id: 'BOM-west', airport: 'BOM', name: 'Western Suburbs',
    hub: { name: 'Andheri Station', lat: 19.1197, lng: 72.8468, mode: 'Local train' },
  },
  'BOM-south': {
    id: 'BOM-south', airport: 'BOM', name: 'South Mumbai',
    hub: { name: 'Andheri Station', lat: 19.1197, lng: 72.8468, mode: 'Local train' },
  },
  'BOM-east': {
    id: 'BOM-east', airport: 'BOM', name: 'Eastern Suburbs',
    hub: { name: 'Ghatkopar Station', lat: 19.0863, lng: 72.9081, mode: 'Metro' },
  },
};

export const DESTINATIONS = [
  // Bengaluru
  { id: 'blr-yelahanka', airport: 'BLR', zone: 'BLR-north', name: 'Yelahanka', lat: 13.1007, lng: 77.5963 },
  { id: 'blr-manyata', airport: 'BLR', zone: 'BLR-north', name: 'Manyata Tech Park', lat: 13.0473, lng: 77.6205 },
  { id: 'blr-hebbal', airport: 'BLR', zone: 'BLR-north', name: 'Hebbal', lat: 13.0358, lng: 77.597 },
  { id: 'blr-indiranagar', airport: 'BLR', zone: 'BLR-central', name: 'Indiranagar', lat: 12.9719, lng: 77.6412 },
  { id: 'blr-mgroad', airport: 'BLR', zone: 'BLR-central', name: 'MG Road', lat: 12.9755, lng: 77.6067 },
  { id: 'blr-shivajinagar', airport: 'BLR', zone: 'BLR-central', name: 'Shivajinagar', lat: 12.9857, lng: 77.605 },
  { id: 'blr-whitefield', airport: 'BLR', zone: 'BLR-east', name: 'Whitefield', lat: 12.9698, lng: 77.75 },
  { id: 'blr-marathahalli', airport: 'BLR', zone: 'BLR-east', name: 'Marathahalli', lat: 12.9569, lng: 77.7011 },
  { id: 'blr-krpuram', airport: 'BLR', zone: 'BLR-east', name: 'KR Puram', lat: 13.0076, lng: 77.6955 },
  { id: 'blr-koramangala', airport: 'BLR', zone: 'BLR-south', name: 'Koramangala', lat: 12.9352, lng: 77.6245 },
  { id: 'blr-hsr', airport: 'BLR', zone: 'BLR-south', name: 'HSR Layout', lat: 12.9116, lng: 77.6474 },
  { id: 'blr-jayanagar', airport: 'BLR', zone: 'BLR-south', name: 'Jayanagar', lat: 12.925, lng: 77.5938 },
  { id: 'blr-ecity', airport: 'BLR', zone: 'BLR-south', name: 'Electronic City', lat: 12.8452, lng: 77.6602 },
  { id: 'blr-malleshwaram', airport: 'BLR', zone: 'BLR-west', name: 'Malleshwaram', lat: 13.0067, lng: 77.5713 },
  { id: 'blr-rajajinagar', airport: 'BLR', zone: 'BLR-west', name: 'Rajajinagar', lat: 12.991, lng: 77.555 },
  // Delhi
  { id: 'del-hauzkhas', airport: 'DEL', zone: 'DEL-south', name: 'Hauz Khas', lat: 28.5494, lng: 77.2001 },
  { id: 'del-saket', airport: 'DEL', zone: 'DEL-south', name: 'Saket', lat: 28.5245, lng: 77.2066 },
  { id: 'del-cp', airport: 'DEL', zone: 'DEL-central', name: 'Connaught Place', lat: 28.6315, lng: 77.2167 },
  { id: 'del-karolbagh', airport: 'DEL', zone: 'DEL-central', name: 'Karol Bagh', lat: 28.6519, lng: 77.1909 },
  { id: 'del-cybercity', airport: 'DEL', zone: 'DEL-gurugram', name: 'Cyber City', lat: 28.495, lng: 77.0895 },
  { id: 'del-golfcourse', airport: 'DEL', zone: 'DEL-gurugram', name: 'Golf Course Road', lat: 28.4521, lng: 77.0967 },
  // Mumbai
  { id: 'bom-bandra', airport: 'BOM', zone: 'BOM-west', name: 'Bandra West', lat: 19.0596, lng: 72.8295 },
  { id: 'bom-andheri', airport: 'BOM', zone: 'BOM-west', name: 'Andheri West', lat: 19.1364, lng: 72.8296 },
  { id: 'bom-worli', airport: 'BOM', zone: 'BOM-south', name: 'Worli', lat: 19.0176, lng: 72.8172 },
  { id: 'bom-lowerparel', airport: 'BOM', zone: 'BOM-south', name: 'Lower Parel', lat: 18.9953, lng: 72.8302 },
  { id: 'bom-powai', airport: 'BOM', zone: 'BOM-east', name: 'Powai', lat: 19.1176, lng: 72.906 },
  { id: 'bom-ghatkopar', airport: 'BOM', zone: 'BOM-east', name: 'Ghatkopar', lat: 19.0863, lng: 72.9081 },
];

export const destinationsForAirport = (code) => DESTINATIONS.filter((d) => d.airport === code);
export const getDestination = (id) => DESTINATIONS.find((d) => d.id === id) || null;
export const getZone = (id) => ZONES[id] || null;
export const getAirport = (code) => AIRPORTS[code] || null;
