import { getDestination } from '../data/airports.js';

const FLIGHT_RE = /^[A-Z0-9]{2}\s?\d{1,4}[A-Z]?$/i;

/** Returns an object of field → message. Empty object means valid. */
export function validateArrival(form, now = Date.now()) {
  const e = {};
  if (!form.displayName?.trim()) e.displayName = 'Add a first name so co-passengers know who to look for.';
  else if (form.displayName.trim().length > 30) e.displayName = 'Keep it under 30 characters.';

  if (form.flightNumber?.trim() && !FLIGHT_RE.test(form.flightNumber.trim())) {
    e.flightNumber = 'That doesn’t look like a flight number (e.g. 6E 2178). You can leave it blank.';
  }

  if (!form.airportCode) e.airportCode = 'Choose the airport you’re landing at.';

  if (!form.arrivalLocal) {
    e.arrivalLocal = 'Enter when you expect to land.';
  } else {
    const t = new Date(form.arrivalLocal).getTime();
    if (Number.isNaN(t)) e.arrivalLocal = 'Enter a valid date and time.';
    else if (t < now - 6 * 3600e3) e.arrivalLocal = 'That’s more than 6 hours ago. Check the date.';
    else if (t > now + 30 * 24 * 3600e3) e.arrivalLocal = 'Matching opens 30 days before arrival.';
  }

  const d = getDestination(form.destinationId);
  if (!d) e.destinationId = 'Choose the area you’re heading to.';
  else if (form.airportCode && d.airport !== form.airportCode) e.destinationId = 'Pick an area served from this airport.';

  if (form.dropoffAddress && form.dropoffAddress.length > 120) e.dropoffAddress = 'Keep the address under 120 characters.';

  const bags = Number(form.luggageCount);
  if (!Number.isInteger(bags) || bags < 0 || bags > 6) e.luggageCount = 'Bags must be between 0 and 6.';

  if (!['cheapest', 'balanced', 'direct'].includes(form.preference)) e.preference = 'Choose how you’d like to travel.';
  return e;
}
