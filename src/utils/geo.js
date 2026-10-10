import { FARE_ASSUMPTIONS } from '../data/config.js';

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

/** Straight-line distance in km. */
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Approximate road distance: straight line × road factor. Not a routed distance. */
export function roadKm(a, b) {
  return haversineKm(a, b) * FARE_ASSUMPTIONS.roadFactor;
}

/** Order stops greedily: from origin, always go to the nearest remaining stop. */
export function orderStops(origin, stops) {
  const remaining = [...stops];
  const ordered = [];
  let cur = origin;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    remaining.forEach((s, i) => {
      const d = haversineKm(cur, s);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    cur = remaining.splice(best, 1)[0];
    ordered.push(cur);
  }
  return ordered;
}

export function googleMapsDirectionsUrl({ origin, destination, waypoints = [], mode = 'driving' }) {
  const fmt = (p) => (p.lat != null ? `${p.lat},${p.lng}` : p.query);
  const params = new URLSearchParams({
    api: '1',
    origin: fmt(origin),
    destination: fmt(destination),
    travelmode: mode,
  });
  if (waypoints.length) params.set('waypoints', waypoints.map(fmt).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleMapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
