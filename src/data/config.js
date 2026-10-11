// All tunable thresholds, weights and fare assumptions live here.
// Fares and times are estimates from fixed assumptions — not live quotes.

export const MATCHING_CONFIG = {
  // Riders are grouped only when they're likely ready within the 30-minute pickup window.
  arrivalWindowMinutes: 30,
  // Straight-line distance between two drop-offs above which riders aren't paired.
  maxDropoffGapKm: 7,
  // Extra minutes a shared route may add for either rider.
  maxDetourMinutes: 25,
  // Co-passengers the user can add (user + 3 = 4 people).
  maxCoPassengers: 3,
  weights: {
    time: 0.35,
    destination: 0.3,
    preference: 0.15,
    detour: 0.12,
    luggage: 0.08,
  },
  // 0 means "never pair": a direct-only rider is never put with someone who
  // wants the public-transport-heavy option.
  preferenceCompatibility: {
    cheapest: { cheapest: 1, balanced: 0.75, direct: 0 },
    balanced: { cheapest: 0.75, balanced: 1, direct: 0.75 },
    direct: { cheapest: 0, balanced: 0.75, direct: 1 },
  },
};

export const FARE_ASSUMPTIONS = {
  currency: 'INR',
  roadFactor: 1.35, // road km ≈ straight-line km × this
  balancedClusterKm: 4, // Balanced: riders this close share one stop
  cab: {
    airportPickupFee: 120,
    base: 100,
    perKm: 22,
    firstLegKmh: 40, // airport → first stop (mostly NH 544)
    cityKmh: 25, // between stops
    dwellMinutesPerStop: 3,
  },
  vehicles: {
    sedan: { id: 'sedan', label: 'Sedan', seats: 4, bags: 4, multiplier: 1 },
    suv: { id: 'suv', label: 'SUV', seats: 6, bags: 6, multiplier: 1.35 },
  },
  transit: {
    base: 20,
    perKm: 1.2,
    cap: 650,
    kmh: 38, // KSRTC bus / Kochi Metro incl. stops
    waitMinutes: 10,
    secondTransferAboveKm: 150,
  },
  auto: {
    base: 30,
    includedKm: 2,
    perKm: 15,
    kmh: 18,
    pickupMinutes: 4,
    walkIfUnderKm: 1.2,
    walkKmh: 4.5,
  },
};

export const RIDE_CONFIG = {
  // Proposed departure = when the last rider is likely ready (see utils/readiness.js),
  // rounded up to 5 minutes. The pickup window is always 30 minutes; it starts when
  // the first rider says they've landed.
  pickupWindowMinutes: 30,
  reminderLeadSeconds: 120,
  extendByMinutes: 10,
};

export const PREFERENCES = {
  cheapest: {
    id: 'cheapest',
    label: 'Cheapest',
    short: 'Shared cab to a transit hub, then metro or bus.',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    short: 'One shared cab stop in your area, then a short auto or walk.',
  },
  direct: {
    id: 'direct',
    label: 'Direct',
    short: 'Shared cab to your exact address. No transfers.',
  },
};
