import { MATCHING_CONFIG, FARE_ASSUMPTIONS, PREFERENCES } from '../data/config.js';
import { getAirport, getZone } from '../data/airports.js';
import { haversineKm, roadKm, orderStops } from './geo.js';
import { vehicleFor, soloDirect, buildOption } from './fareCalculation.js';

const minutesBetween = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const point = (t) => ({ lat: t.destinationLat, lng: t.destinationLng });

/**
 * Extra minutes the shared door-to-door route adds for whichever rider is dropped second,
 * and who is dropped first. Approximation from straight-line distances × road factor —
 * not a routed estimate. Small values mean one drop-off lies along the other's route.
 */
export function estimateDetour(a, b) {
  const airport = getAirport(a.airportCode) || getAirport(b.airportCode);
  const pa = point(a);
  const pb = point(b);
  const [first, second] = orderStops(airport, [pa, pb]);
  const viaKm = roadKm(airport, first) + roadKm(first, second);
  const extraKm = Math.max(0, viaKm - roadKm(airport, second));
  const sameSpot = haversineKm(first, second) < 0.3;
  const minutes = (extraKm / FARE_ASSUMPTIONS.cab.cityKmh) * 60 + (sameSpot ? 0 : FARE_ASSUMPTIONS.cab.dwellMinutesPerStop);
  return { minutes: Math.round(minutes), aFirst: first === pa };
}

/** The stricter of the two riders' detour limits. */
export function detourLimit(a, b, config = MATCHING_CONFIG) {
  return Math.min(a.maxDetourMinutes ?? config.maxDetourMinutes, b.maxDetourMinutes ?? config.maxDetourMinutes);
}

/**
 * Evaluate whether two trips can share a ride. Hard rules run first and reject;
 * only compatible pairs are scored. Destinations are compatible when they are
 * close together OR one lies along the other's route (small detour).
 */
export function evaluatePair(me, other, config = MATCHING_CONFIG) {
  const windowMin = config.arrivalWindowMinutes;

  if (me.airportCode !== other.airportCode) {
    return { ok: false, code: 'airport', reason: `Lands at ${other.airportCode}, not ${me.airportCode}` };
  }

  const timeDiff = Math.round(minutesBetween(me.arrivalTime, other.arrivalTime));
  if (timeDiff > windowMin) {
    return { ok: false, code: 'time', reason: `Arrives ${timeDiff} min apart (limit ${windowMin})` };
  }

  const gapKm = haversineKm(point(me), point(other));
  const { minutes: detour, aFirst: meFirst } = estimateDetour(me, other);
  const limit = detourLimit(me, other, config);
  if (gapKm > config.maxDropoffGapKm && detour > limit) {
    return { ok: false, code: 'destination', reason: `${other.destinationName} is off your route (~${detour} min detour)` };
  }
  if (detour > limit) {
    return { ok: false, code: 'detour', reason: `Would add ~${detour} min (limit ${limit})` };
  }

  const bags = (me.luggageCount || 0) + (other.luggageCount || 0);
  const vehicle = vehicleFor(2, bags);
  if (!vehicle) {
    return { ok: false, code: 'luggage', reason: `${bags} bags together won't fit in one cab` };
  }

  const prefScore = config.preferenceCompatibility[me.preference]?.[other.preference] ?? 0;
  if (prefScore === 0) {
    return {
      ok: false,
      code: 'preference',
      reason: `Wants ${PREFERENCES[other.preference].label}; you chose ${PREFERENCES[me.preference].label}`,
    };
  }

  const w = config.weights;
  const parts = {
    time: clamp01(1 - timeDiff / windowMin),
    destination: clamp01(Math.max(1 - gapKm / config.maxDropoffGapKm, 1 - detour / limit)),
    preference: prefScore,
    detour: clamp01(1 - detour / limit),
    luggage: vehicle.id === 'sedan' ? 1 : 0.6,
  };
  const score = Math.round(
    100 * (w.time * parts.time + w.destination * parts.destination + w.preference * parts.preference + w.detour * parts.detour + w.luggage * parts.luggage),
  );

  return { ok: true, score, parts, metrics: { timeDiff, gapKm, detour, meFirst, vehicle: vehicle.id, bags } };
}

function explain(me, other, metrics) {
  const reasons = [];
  const { timeDiff, gapKm, detour, vehicle } = metrics;
  reasons.push(timeDiff <= 2 ? 'Landing at about the same time' : `Arriving ${timeDiff} min apart`);
  if (me.destinationId && me.destinationId === other.destinationId) {
    reasons.push(`Same area: ${other.destinationName}`);
  } else if (me.destinationZone === other.destinationZone) {
    reasons.push(`Both heading to ${getZone(other.destinationZone)?.name ?? 'the same zone'}`);
  } else if (gapKm <= MATCHING_CONFIG.maxDropoffGapKm) {
    reasons.push(`Drop-offs about ${gapKm.toFixed(1)} km apart`);
  } else {
    reasons.push(metrics.meFirst ? `${other.destinationName} is further along your route` : `${other.destinationName} is on your way`);
  }
  reasons.push(detour <= 3 ? 'Almost no detour' : `Adds about ${detour} min`);
  if (me.preference === other.preference) reasons.push(`Also prefers ${PREFERENCES[other.preference].label}`);
  if (vehicle === 'suv') reasons.push('Needs an SUV for the bags');
  return reasons;
}

/**
 * Rank candidates for the current trip.
 * Returns { matches: [...sorted best first], rejected: [...] }.
 */
export function findCompatiblePassengers(currentTrip, candidateTrips, overrides = {}) {
  const config = { ...MATCHING_CONFIG, ...overrides };
  const matches = [];
  const rejected = [];
  const solo = soloDirect(currentTrip);

  for (const c of candidateTrips) {
    if (c.id === currentTrip.id) continue;
    const r = evaluatePair(currentTrip, c, config);
    if (!r.ok) {
      rejected.push({ trip: c, code: r.code, reason: r.reason });
      continue;
    }
    const sharedDirect = buildOption('direct', currentTrip, [c]);
    matches.push({
      trip: c,
      score: r.score,
      metrics: r.metrics,
      reasons: explain(currentTrip, c, r.metrics),
      estimatedSavings: sharedDirect.perPerson != null ? Math.max(0, solo.fare - sharedDirect.perPerson) : 0,
    });
  }

  matches.sort((a, b) => b.score - a.score || a.metrics.timeDiff - b.metrics.timeDiff);
  return { matches, rejected };
}

/**
 * Can `candidate` join a group that already contains `me` + `selected`?
 * Checks every pair plus whole-group capacity.
 */
export function canJoinGroup(me, selected, candidate, overrides = {}) {
  const config = { ...MATCHING_CONFIG, ...overrides };
  if (selected.length >= config.maxCoPassengers) {
    return { ok: false, reason: `Up to ${config.maxCoPassengers} co-passengers per cab` };
  }
  for (const s of selected) {
    const r = evaluatePair(s, candidate, config);
    if (!r.ok) {
      const a = s.displayName;
      const b = candidate.displayName;
      const why = {
        time: `${a} and ${b} land too far apart`,
        destination: `${b}’s drop-off is too far from ${a}’s`,
        luggage: `${a} and ${b} have too many bags together`,
        preference: `${a} wants ${PREFERENCES[s.preference].label} and ${b} wants ${PREFERENCES[candidate.preference].label}`,
        detour: `Riding with ${a} would add too much detour`,
        airport: `${b} lands at a different airport`,
      }[r.code];
      return { ok: false, reason: `Can’t add to this group: ${why}.` };
    }
  }
  const group = [me, ...selected, candidate];
  const bags = group.reduce((s, t) => s + (t.luggageCount || 0), 0);
  if (!vehicleFor(group.length, bags)) return { ok: false, reason: `${bags} bags for ${group.length} people won't fit one cab` };
  return { ok: true };
}
