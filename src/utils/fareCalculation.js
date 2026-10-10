import { FARE_ASSUMPTIONS as F, PREFERENCES } from '../data/config.js';
import { getAirport, getZone } from '../data/airports.js';
import { roadKm, orderStops, googleMapsDirectionsUrl } from './geo.js';

const round = (n) => Math.round(n);

export function vehicleFor(people, bags) {
  const { sedan, suv } = F.vehicles;
  if (people <= sedan.seats && bags <= sedan.bags) return sedan;
  if (people <= suv.seats && bags <= suv.bags) return suv;
  return null; // does not fit in one vehicle
}

/** Total cab fare for a route of `km` road kilometres. */
export function cabFare(km, vehicle = F.vehicles.sedan) {
  return round((F.cab.airportPickupFee + F.cab.base + F.cab.perKm * km) * vehicle.multiplier);
}

/** Cumulative km and minutes from origin to each stop, in order. */
export function routeProgress(origin, orderedStops) {
  let km = 0;
  let minutes = 0;
  let prev = origin;
  return orderedStops.map((stop, i) => {
    const legKm = roadKm(prev, stop);
    km += legKm;
    minutes += i === 0 ? (legKm / F.cab.firstLegKmh) * 60 : (legKm / F.cab.cityKmh) * 60 + F.cab.dwellMinutesPerStop;
    prev = stop;
    return { ...stop, cumKm: km, cumMinutes: minutes };
  });
}

/** Minutes for a cab going straight from the airport to one point. */
export function directCabMinutes(origin, point) {
  return (roadKm(origin, point) / F.cab.firstLegKmh) * 60;
}

function tripPoint(trip) {
  return { lat: trip.destinationLat, lng: trip.destinationLng };
}

/** Baseline: one person, one cab, door to door. */
export function soloDirect(trip) {
  const airport = getAirport(trip.airportCode);
  const km = roadKm(airport, tripPoint(trip));
  const vehicle = vehicleFor(1, trip.luggageCount) || F.vehicles.suv;
  return { fare: cabFare(km, vehicle), minutes: round(directCabMinutes(airport, tripPoint(trip))), km };
}

/** Second leg after the cab drops a rider at `from`. */
export function onwardLeg(kind, from, to, transitMode = 'Metro') {
  const km = roadKm(from, to);
  if (kind === 'direct' || km < F.auto.walkIfUnderKm) {
    if (kind === 'direct' || km < 0.05) return { mode: null, fare: 0, minutes: 0, transfers: 0, km: 0 };
    return { mode: 'Walk', fare: 0, minutes: round((km / F.auto.walkKmh) * 60), transfers: 0, km };
  }
  if (kind === 'cheapest') {
    const t = F.transit;
    return {
      mode: transitMode,
      fare: round(Math.min(t.cap, t.base + t.perKm * km)),
      minutes: round(t.waitMinutes + (km / t.kmh) * 60),
      transfers: km > t.secondTransferAboveKm ? 2 : 1,
      km,
    };
  }
  const a = F.auto;
  return {
    mode: 'Auto',
    fare: round(a.base + a.perKm * Math.max(0, km - a.includedKm)),
    minutes: round(a.pickupMinutes + (km / a.kmh) * 60),
    transfers: 1,
    km,
  };
}

// Only the user's own street address is ever shown; co-passengers appear by area name.
function doorPoint(trip, isMe) {
  return {
    key: `door:${trip.id}`,
    name: isMe && trip.dropoffAddress ? `${trip.dropoffAddress}, ${trip.destinationName}` : trip.destinationName,
    lat: trip.destinationLat,
    lng: trip.destinationLng,
  };
}

/**
 * BALANCED: the cab makes ONE shared stop, chosen from the riders' own areas so that
 * the group's total cost (cab + everyone's last-mile auto) is lowest.
 */
function balancedSharedStop(members, airport) {
  let best = null;
  members.forEach((candidate) => {
    const stop = { key: `shared:${candidate.id}`, name: candidate.destinationName, lat: candidate.destinationLat, lng: candidate.destinationLng };
    const bags = members.reduce((s, m) => s + (m.luggageCount || 0), 0);
    const vehicle = vehicleFor(members.length, bags) || F.vehicles.suv;
    const cost = cabFare(roadKm(airport, stop), vehicle) + members.reduce((s, m) => s + onwardLeg('balanced', stop, tripPoint(m)).fare, 0);
    if (!best || cost < best.cost) best = { stop, cost };
  });
  return best.stop;
}

function dropPointFor(kind, trip, isMe, sharedStop) {
  if (kind === 'cheapest') {
    const zone = getZone(trip.destinationZone);
    return { key: `hub:${zone.hub.name}`, name: zone.hub.name, lat: zone.hub.lat, lng: zone.hub.lng, transitMode: zone.hub.mode };
  }
  if (kind === 'balanced') return sharedStop;
  return doorPoint(trip, isMe);
}

/**
 * Build one journey option for a group.
 * `me` is the current user's trip; `others` are the selected co-passengers.
 */
export function buildOption(kind, me, others) {
  const members = [me, ...others];
  const airport = getAirport(me.airportCode);
  const n = members.length;
  const bags = members.reduce((s, m) => s + (m.luggageCount || 0), 0);
  const vehicle = vehicleFor(n, bags);

  // Unique drop points, visited nearest-first.
  const drops = new Map();
  const memberDrop = new Map();
  const sharedStop = kind === 'balanced' ? balancedSharedStop(members, airport) : null;
  members.forEach((m, i) => {
    const p = dropPointFor(kind, m, i === 0, sharedStop);
    if (!drops.has(p.key)) drops.set(p.key, { ...p, riders: [] });
    drops.get(p.key).riders.push(m);
    memberDrop.set(m.id, p.key);
  });
  const ordered = routeProgress(airport, orderStops(airport, [...drops.values()]));
  const byKey = new Map(ordered.map((s, i) => [s.key, { ...s, index: i }]));
  const totalKm = ordered.length ? ordered[ordered.length - 1].cumKm : 0;
  const cab = vehicle ? cabFare(totalKm, vehicle) : null;

  const perMember = members.map((m) => {
    const stop = byKey.get(memberDrop.get(m.id));
    const leg = onwardLeg(kind, stop, tripPoint(m), stop.transitMode);
    const cabMinutes = stop.cumMinutes;
    return {
      trip: m,
      stop,
      leg,
      cabShare: cab != null ? cab / n : null,
      cost: cab != null ? round(cab / n + leg.fare) : null,
      minutes: round(cabMinutes + leg.minutes),
      detourMinutes: Math.max(0, round(cabMinutes - directCabMinutes(airport, stop))),
    };
  });
  const mine = perMember[0];
  const solo = soloDirect(me);

  const directOnly = others.filter((o) => o.preference === 'direct');
  let available = !!vehicle;
  let unavailableReason = vehicle ? null : 'Too many people or bags for one vehicle.';
  if (kind === 'cheapest' && directOnly.length) {
    available = false;
    unavailableReason = `${directOnly.map((o) => o.displayName).join(' & ')} asked for a door-to-door drop, so the group won't be sent to a transit hub.`;
  }

  const modes = ['Shared cab'];
  if (mine.leg.mode) modes.push(mine.leg.mode);

  let dropArrangement;
  if (kind === 'cheapest') {
    dropArrangement = mine.leg.mode === 'Walk' || !mine.leg.mode
      ? `Cab drops you at ${mine.stop.name}, a short walk from your destination.`
      : `Cab drops you at ${mine.stop.name}. Continue by ${mine.leg.mode.toLowerCase()} (~${mine.leg.km.toFixed(1)} km).`;
  } else if (kind === 'balanced') {
    if (mine.leg.mode === 'Auto') dropArrangement = `One shared stop at ${mine.stop.name}. Short auto (~${mine.leg.km.toFixed(1)} km) to your door.`;
    else if (mine.leg.mode === 'Walk') dropArrangement = `One shared stop at ${mine.stop.name}, a short walk from your door.`;
    else dropArrangement = `One shared stop in your own area (${mine.stop.name}). Others continue by auto.`;
  } else {
    dropArrangement = `Cab drops everyone at their own address. You're stop ${mine.stop.index + 1} of ${ordered.length}.`;
  }

  const routeSummary = [
    airport.code,
    ...ordered.map((s) => {
      const names = s.riders.map((r) => (r.id === me.id ? 'you' : r.displayName));
      return `${s.name} (${names.join(', ')})`;
    }),
  ].join(' → ');

  const last = ordered[ordered.length - 1];
  const mapsUrl = googleMapsDirectionsUrl({
    origin: airport,
    destination: last,
    waypoints: ordered.slice(0, -1),
  });

  const transitTotal = perMember.reduce((s, p) => s + p.leg.fare, 0);

  return {
    id: kind,
    kind,
    label: PREFERENCES[kind].label,
    available,
    unavailableReason,
    vehicle: vehicle ? vehicle.label : null,
    modes,
    pickupPoint: airport.pickupPoint,
    dropArrangement,
    routeSummary,
    stops: ordered.map((s) => ({ name: s.name, riders: s.riders.map((r) => r.displayName), lat: s.lat, lng: s.lng })),
    cabFare: cab,
    totalCost: cab != null ? round(cab + transitTotal) : null,
    perPerson: mine.cost,
    durationMinutes: mine.minutes,
    detourMinutes: mine.detourMinutes,
    transfers: mine.leg.transfers,
    soloFare: solo.fare,
    soloMinutes: solo.minutes,
    savings: mine.cost != null ? solo.fare - mine.cost : null,
    members: perMember.map((p) => ({
      tripId: p.trip.id,
      displayName: p.trip.displayName,
      cost: p.cost,
      dropAt: p.stop.name,
      onward: p.leg.mode,
    })),
    mapsUrl,
  };
}

export function buildRideOptions(me, others) {
  return ['cheapest', 'balanced', 'direct'].map((k) => buildOption(k, me, others));
}

export const formatINR = (n) =>
  n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`;
