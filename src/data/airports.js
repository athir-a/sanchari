// Shared rides from Cochin International Airport (COK) to anywhere in Kerala.
// Coordinates are approximate town centres, used only for straight-line
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

// Interchanges used by the CHEAPEST option (shared cab → hub → bus or metro).
const HUBS = {
  aluvaMetro: { name: 'Aluva Metro Station', lat: 10.1099, lng: 76.3497, mode: 'Metro' },
  angamaly: { name: 'Angamaly KSRTC Bus Terminal', lat: 10.1925, lng: 76.3866, mode: 'Bus' },
  vyttila: { name: 'Vyttila Mobility Hub', lat: 9.9672, lng: 76.3205, mode: 'Bus' },
  perumbavoor: { name: 'Perumbavoor KSRTC Bus Station', lat: 10.111, lng: 76.476, mode: 'Bus' },
};

const P = (id, district, name, lat, lng, hub) => ({ id: `cok-${id}`, airport: 'COK', zone: district, district, name, lat, lng, ...(hub ? { hub: HUBS[hub] } : {}) });

export const DESTINATIONS = [
  // Ernakulam
  P('paravur-jn', 'ernakulam', 'Desom', 10.1358, 76.3681),
  P('aluva', 'ernakulam', 'Aluva', 10.1076, 76.3516),
  P('kalamassery', 'ernakulam', 'Kalamassery', 10.051, 76.315),
  P('edappally', 'ernakulam', 'Edappally', 10.0261, 76.3083),
  P('kakkanad', 'ernakulam', 'Kakkanad', 10.0159, 76.3419),
  P('vyttila', 'ernakulam', 'Vyttila', 9.9687, 76.3183),
  P('mg-road', 'ernakulam', 'MG Road, Ernakulam', 9.9763, 76.2826),
  P('tripunithura', 'ernakulam', 'Tripunithura', 9.9439, 76.3494),
  P('fort-kochi', 'ernakulam', 'Fort Kochi', 9.9658, 76.2421),
  P('angamaly', 'ernakulam', 'Angamaly', 10.196, 76.386, 'angamaly'),
  P('kalady', 'ernakulam', 'Kalady', 10.1667, 76.438, 'angamaly'),
  P('karukutty', 'ernakulam', 'Karukutty', 10.2268, 76.377, 'angamaly'),
  P('perumbavoor', 'ernakulam', 'Perumbavoor', 10.1155, 76.477, 'perumbavoor'),
  P('muvattupuzha', 'ernakulam', 'Muvattupuzha', 9.9894, 76.579, 'perumbavoor'),
  P('kothamangalam', 'ernakulam', 'Kothamangalam', 10.0602, 76.6351, 'perumbavoor'),
  P('koothattukulam', 'ernakulam', 'Koothattukulam', 9.86, 76.59, 'perumbavoor'),
  // Thrissur
  P('koratty', 'thrissur', 'Koratty', 10.269, 76.354),
  P('chalakudy', 'thrissur', 'Chalakudy', 10.307, 76.333),
  P('pudukkad', 'thrissur', 'Pudukkad', 10.417, 76.269),
  P('ollur', 'thrissur', 'Ollur', 10.48, 76.24),
  P('thrissur-round', 'thrissur', 'Thrissur Swaraj Round', 10.5241, 76.2141),
  P('thrissur-rly', 'thrissur', 'Thrissur Railway Station', 10.5157, 76.2085),
  P('poonkunnam', 'thrissur', 'Poonkunnam', 10.541, 76.207),
  P('mala', 'thrissur', 'Mala', 10.245, 76.264),
  P('irinjalakuda', 'thrissur', 'Irinjalakuda', 10.342, 76.211),
  P('kodungallur', 'thrissur', 'Kodungallur', 10.2269, 76.195),
  P('guruvayur', 'thrissur', 'Guruvayur', 10.5946, 76.0369),
  P('kunnamkulam', 'thrissur', 'Kunnamkulam', 10.65, 76.07),
  P('vadakkanchery', 'thrissur', 'Wadakkanchery', 10.66, 76.25),
  // Palakkad
  P('alathur', 'palakkad', 'Alathur', 10.648, 76.538),
  P('palakkad', 'palakkad', 'Palakkad town', 10.7867, 76.6548),
  P('ottapalam', 'palakkad', 'Ottapalam', 10.77, 76.377),
  P('shoranur', 'palakkad', 'Shoranur', 10.76, 76.27),
  P('mannarkkad', 'palakkad', 'Mannarkkad', 10.993, 76.46),
  // Malappuram
  P('edappal', 'malappuram', 'Edappal', 10.786, 75.994),
  P('kuttippuram', 'malappuram', 'Kuttippuram', 10.843, 76.035),
  P('valanchery', 'malappuram', 'Valanchery', 10.889, 76.071),
  P('kottakkal', 'malappuram', 'Kottakkal', 10.999, 75.993),
  P('malappuram', 'malappuram', 'Malappuram town', 11.051, 76.071),
  P('tirur', 'malappuram', 'Tirur', 10.914, 75.922),
  P('perinthalmanna', 'malappuram', 'Perinthalmanna', 10.976, 76.226),
  P('manjeri', 'malappuram', 'Manjeri', 11.12, 76.12),
  // Kozhikode
  P('ramanattukara', 'kozhikode', 'Ramanattukara', 11.18, 75.87),
  P('kozhikode', 'kozhikode', 'Kozhikode city', 11.2588, 75.7804),
  P('kozhikode-rly', 'kozhikode', 'Kozhikode Railway Station', 11.2486, 75.7808),
  P('koyilandy', 'kozhikode', 'Koyilandy', 11.44, 75.695),
  P('vadakara', 'kozhikode', 'Vadakara', 11.6, 75.59),
  P('thamarassery', 'kozhikode', 'Thamarassery', 11.415, 75.935),
  // Wayanad
  P('vythiri', 'wayanad', 'Vythiri', 11.55, 76.04),
  P('kalpetta', 'wayanad', 'Kalpetta', 11.6085, 76.0836),
  P('sulthan-bathery', 'wayanad', 'Sulthan Bathery', 11.6656, 76.2627),
  P('mananthavady', 'wayanad', 'Mananthavady', 11.8014, 76.0044),
  // Kannur
  P('thalassery', 'kannur', 'Thalassery', 11.7491, 75.4929),
  P('kannur', 'kannur', 'Kannur town', 11.8745, 75.3704),
  P('taliparamba', 'kannur', 'Taliparamba', 12.036, 75.36),
  P('payyanur', 'kannur', 'Payyanur', 12.1, 75.2),
  // Kasaragod
  P('nileshwaram', 'kasaragod', 'Nileshwaram', 12.25, 75.13),
  P('kanhangad', 'kasaragod', 'Kanhangad', 12.31, 75.09),
  P('kasaragod', 'kasaragod', 'Kasaragod town', 12.4996, 74.9869),
  // Alappuzha
  P('aroor', 'alappuzha', 'Aroor', 9.87, 76.3),
  P('cherthala', 'alappuzha', 'Cherthala', 9.684, 76.336),
  P('alappuzha', 'alappuzha', 'Alappuzha town', 9.4981, 76.3388),
  P('ambalappuzha', 'alappuzha', 'Ambalappuzha', 9.383, 76.36),
  P('haripad', 'alappuzha', 'Haripad', 9.28, 76.46),
  P('kayamkulam', 'alappuzha', 'Kayamkulam', 9.174, 76.501),
  P('chengannur', 'alappuzha', 'Chengannur', 9.317, 76.611),
  // Kottayam
  P('vaikom', 'kottayam', 'Vaikom', 9.749, 76.396),
  P('ettumanoor', 'kottayam', 'Ettumanoor', 9.67, 76.56),
  P('kottayam', 'kottayam', 'Kottayam town', 9.5916, 76.5222),
  P('pala', 'kottayam', 'Pala', 9.71, 76.68),
  P('changanassery', 'kottayam', 'Changanassery', 9.446, 76.541),
  // Pathanamthitta
  P('thiruvalla', 'pathanamthitta', 'Thiruvalla', 9.385, 76.575),
  P('pathanamthitta', 'pathanamthitta', 'Pathanamthitta town', 9.2648, 76.787),
  P('ranni', 'pathanamthitta', 'Ranni', 9.38, 76.78),
  P('adoor', 'pathanamthitta', 'Adoor', 9.155, 76.73),
  // Idukki
  P('thodupuzha', 'idukki', 'Thodupuzha', 9.8959, 76.7184),
  P('adimali', 'idukki', 'Adimali', 10.01, 76.95),
  P('munnar', 'idukki', 'Munnar', 10.0889, 77.0595),
  P('painavu', 'idukki', 'Painavu', 9.85, 76.97),
  P('kattappana', 'idukki', 'Kattappana', 9.75, 77.11),
  P('kumily', 'idukki', 'Kumily', 9.6, 77.17),
  // Kollam
  P('karunagappally', 'kollam', 'Karunagappally', 9.06, 76.535),
  P('kollam', 'kollam', 'Kollam town', 8.8932, 76.6141),
  P('kottarakkara', 'kollam', 'Kottarakkara', 9.0, 76.77),
  P('punalur', 'kollam', 'Punalur', 9.017, 76.926),
  // Thiruvananthapuram
  P('varkala', 'thiruvananthapuram', 'Varkala', 8.733, 76.716),
  P('attingal', 'thiruvananthapuram', 'Attingal', 8.696, 76.815),
  P('kazhakkoottam', 'thiruvananthapuram', 'Kazhakkoottam (Technopark)', 8.556, 76.88),
  P('tvm-central', 'thiruvananthapuram', 'Thiruvananthapuram Central', 8.4875, 76.9525),
  P('kovalam', 'thiruvananthapuram', 'Kovalam', 8.4, 76.978),
  P('neyyattinkara', 'thiruvananthapuram', 'Neyyattinkara', 8.4, 77.08),
];

const ids = (...names) => names.map((n) => `cok-${n}`);

// `route`: the main road from the airport, in order (it can pass through other districts).
// `more`: other places in the district, off that road.
export const DISTRICTS = [
  { id: 'thiruvananthapuram', name: 'Thiruvananthapuram', hub: HUBS.vyttila,
    route: ids('vyttila', 'cherthala', 'alappuzha', 'kayamkulam', 'kollam', 'attingal', 'kazhakkoottam', 'tvm-central'), more: ids('varkala', 'kovalam', 'neyyattinkara') },
  { id: 'kollam', name: 'Kollam', hub: HUBS.vyttila,
    route: ids('vyttila', 'cherthala', 'alappuzha', 'kayamkulam', 'karunagappally', 'kollam'), more: ids('kottarakkara', 'punalur') },
  { id: 'pathanamthitta', name: 'Pathanamthitta', hub: HUBS.perumbavoor,
    route: ids('perumbavoor', 'muvattupuzha', 'ettumanoor', 'kottayam', 'changanassery', 'thiruvalla', 'pathanamthitta'), more: ids('ranni', 'adoor') },
  { id: 'alappuzha', name: 'Alappuzha', hub: HUBS.vyttila,
    route: ids('edappally', 'vyttila', 'aroor', 'cherthala', 'alappuzha'), more: ids('ambalappuzha', 'haripad', 'kayamkulam', 'chengannur') },
  { id: 'kottayam', name: 'Kottayam', hub: HUBS.perumbavoor,
    route: ids('perumbavoor', 'muvattupuzha', 'koothattukulam', 'ettumanoor', 'kottayam'), more: ids('pala', 'changanassery', 'vaikom') },
  { id: 'idukki', name: 'Idukki', hub: HUBS.perumbavoor,
    route: ids('perumbavoor', 'kothamangalam', 'adimali', 'munnar'), more: ids('thodupuzha', 'painavu', 'kattappana', 'kumily') },
  { id: 'ernakulam', name: 'Ernakulam', hub: HUBS.aluvaMetro,
    route: ids('paravur-jn', 'aluva', 'kalamassery', 'edappally', 'vyttila'),
    more: ids('kakkanad', 'mg-road', 'tripunithura', 'fort-kochi', 'angamaly', 'kalady', 'karukutty', 'perumbavoor', 'muvattupuzha', 'kothamangalam') },
  { id: 'thrissur', name: 'Thrissur', hub: HUBS.angamaly,
    route: ids('angamaly', 'karukutty', 'koratty', 'chalakudy', 'pudukkad', 'ollur', 'thrissur-round'),
    more: ids('thrissur-rly', 'poonkunnam', 'irinjalakuda', 'mala', 'kodungallur', 'guruvayur', 'kunnamkulam', 'vadakkanchery') },
  { id: 'palakkad', name: 'Palakkad', hub: HUBS.angamaly,
    route: ids('angamaly', 'chalakudy', 'thrissur-round', 'vadakkanchery', 'alathur', 'palakkad'), more: ids('ottapalam', 'shoranur', 'mannarkkad') },
  { id: 'malappuram', name: 'Malappuram', hub: HUBS.angamaly,
    route: ids('angamaly', 'chalakudy', 'thrissur-round', 'kunnamkulam', 'edappal', 'kuttippuram', 'valanchery', 'kottakkal', 'malappuram'), more: ids('tirur', 'perinthalmanna', 'manjeri') },
  { id: 'kozhikode', name: 'Kozhikode', hub: HUBS.angamaly,
    route: ids('angamaly', 'chalakudy', 'thrissur-round', 'kunnamkulam', 'edappal', 'valanchery', 'kottakkal', 'ramanattukara', 'kozhikode'), more: ids('kozhikode-rly', 'koyilandy', 'vadakara', 'thamarassery') },
  { id: 'wayanad', name: 'Wayanad', hub: HUBS.angamaly,
    route: ids('angamaly', 'thrissur-round', 'kunnamkulam', 'kottakkal', 'ramanattukara', 'thamarassery', 'vythiri', 'kalpetta'), more: ids('sulthan-bathery', 'mananthavady') },
  { id: 'kannur', name: 'Kannur', hub: HUBS.angamaly,
    route: ids('angamaly', 'thrissur-round', 'kottakkal', 'kozhikode', 'koyilandy', 'vadakara', 'thalassery', 'kannur'), more: ids('taliparamba', 'payyanur') },
  { id: 'kasaragod', name: 'Kasaragod', hub: HUBS.angamaly,
    route: ids('angamaly', 'thrissur-round', 'kozhikode', 'vadakara', 'kannur', 'payyanur', 'nileshwaram', 'kanhangad', 'kasaragod'), more: [] },
];

/** Districts keyed by id; `destinationZone` on a trip is its district id. */
export const ZONES = Object.fromEntries(DISTRICTS.map((d, order) => [d.id, { ...d, airport: 'COK', order }]));

export const destinationsForAirport = (code) => DESTINATIONS.filter((d) => d.airport === code);
export const getDestination = (id) => DESTINATIONS.find((d) => d.id === id) || null;
export const getAirport = (code) => AIRPORTS[code] || null;
export const getDistrict = (id) => ZONES[id] || null;

/** Zone lookup that also accepts older zone ids by falling back to the destination's district. */
export function getZone(id, destinationId) {
  return ZONES[id] || ZONES[getDestination(destinationId)?.district] || null;
}

/** Transit hub for the cheapest option: the place's own hub, else its district's. */
export function hubFor(destinationId, zoneId) {
  const d = getDestination(destinationId);
  return d?.hub || getZone(zoneId, destinationId)?.hub || HUBS.angamaly;
}

/** The stops a district picker shows: the road there, then other places in the district. */
export function districtStops(districtId) {
  const d = getDistrict(districtId);
  if (!d) return { route: [], more: [] };
  return { route: d.route.map(getDestination), more: d.more.map(getDestination) };
}
