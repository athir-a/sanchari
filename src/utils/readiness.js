// Shared by the browser and the server: when is a passenger likely ready at pickup?
// Not every passenger needs the same time — it depends on bags and on whether
// we know the real (estimated/actual) arrival.

export const READINESS_CONFIG = {
  noBagMinutes: 12, // deplane + walk with cabin bag only
  baggageBaseMinutes: 18, // first checked bag
  perExtraBagMinutes: 4,
  walkToPickupMinutes: 5,
};

export function baggageMinutes(bags, cfg = READINESS_CONFIG) {
  const n = Math.max(0, Number(bags) || 0);
  return n === 0 ? cfg.noBagMinutes : cfg.baggageBaseMinutes + (n - 1) * cfg.perExtraBagMinutes;
}

/**
 * Best known arrival for a trip and where it came from.
 * actual (verified) > estimated (verified) > scheduled (verified) > passenger-entered time.
 */
export function effectiveArrival(trip) {
  const f = trip.flight;
  if (f && f.verification === 'verified') {
    if (f.actualArrival) return { time: f.actualArrival, basis: 'actual' };
    if (f.estimatedArrival) return { time: f.estimatedArrival, basis: 'estimated' };
    if (f.scheduledArrival) return { time: f.scheduledArrival, basis: 'scheduled' };
  }
  return { time: trip.arrivalTime, basis: 'passenger' };
}

/** When the passenger is likely at the pickup point (ISO string). */
export function readyAt(trip, cfg = READINESS_CONFIG) {
  const { time } = effectiveArrival(trip);
  const minutes = baggageMinutes(trip.luggageCount, cfg) + cfg.walkToPickupMinutes;
  return new Date(new Date(time).getTime() + minutes * 60000).toISOString();
}
