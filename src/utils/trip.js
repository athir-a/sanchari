import { getDestination } from '../data/airports.js';

/** Turn the arrival form into a trip record used by matching and fares. */
export function tripFromForm(form, id = 'me') {
  const d = getDestination(form.destinationId);
  return {
    id,
    displayName: form.displayName.trim(),
    flightNumber: form.flightNumber?.trim() || null,
    airportCode: form.airportCode,
    arrivalTime: new Date(form.arrivalLocal).toISOString(),
    destinationId: d?.id ?? null,
    destinationName: d?.name ?? '',
    destinationZone: d?.zone ?? '',
    destinationLat: d?.lat ?? null,
    destinationLng: d?.lng ?? null,
    dropoffAddress: form.dropoffAddress?.trim() || '',
    luggageCount: Number(form.luggageCount) || 0,
    preference: form.preference,
    status: 'searching',
  };
}
