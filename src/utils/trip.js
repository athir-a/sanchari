import { getDestination } from '../data/airports.js';

const norm = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '');

/** Verified snapshot when the form's flight was checked; otherwise a passenger-entered, unverified flight. */
export function flightFromForm(form) {
  const number = form.flightNumber?.trim();
  if (!number) return null;
  if (form.flightRef && norm(form.flightRef.designator) === norm(number)) return { ...form.flightRef };
  return { designator: number.toUpperCase(), verification: 'unverified', source: 'passenger' };
}

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
    maxDetourMinutes: Number(form.maxDetourMinutes) || 25,
    maxBudget: form.maxBudget ? Number(form.maxBudget) : null,
    flight: flightFromForm(form),
    status: 'searching',
  };
}
