import { IS_LIVE, supabase, ensureSession } from './supabaseClient.js';
import { buildDemoCandidates } from '../data/demoPassengers.js';
import { writeJSON, uuid } from './storage.js';

function rowToTrip(r) {
  return {
    id: r.id,
    isDemo: false,
    displayName: r.display_name,
    flightNumber: r.flight_number,
    airportCode: r.airport_code,
    arrivalTime: r.arrival_time,
    destinationId: r.destination_id,
    destinationName: r.destination_name,
    destinationZone: r.destination_zone,
    destinationLat: r.destination_lat == null ? null : Number(r.destination_lat),
    destinationLng: r.destination_lng == null ? null : Number(r.destination_lng),
    dropoffAddress: r.dropoff_address || '',
    luggageCount: r.luggage_count,
    preference: r.preference,
    maxDetourMinutes: r.max_detour_minutes ?? 25,
    status: r.status,
  };
}

/** Save (or update) the user's trip. Returns the trip with its stored id. */
export async function saveTrip(trip, existingId) {
  if (!IS_LIVE) {
    const saved = { ...trip, id: existingId && existingId.startsWith('me-') ? existingId : `me-${uuid()}` };
    writeJSON('trip', saved);
    return saved;
  }
  await ensureSession();
  const row = {
    display_name: trip.displayName,
    flight_number: trip.flightNumber,
    airport_code: trip.airportCode,
    arrival_time: trip.arrivalTime,
    destination_id: trip.destinationId,
    destination_name: trip.destinationName,
    destination_zone: trip.destinationZone,
    destination_lat: trip.destinationLat,
    destination_lng: trip.destinationLng,
    dropoff_address: trip.dropoffAddress || null,
    luggage_count: trip.luggageCount,
    preference: trip.preference,
    max_detour_minutes: trip.maxDetourMinutes,
    status: 'searching',
  };
  const q = existingId && !existingId.startsWith('me-')
    ? supabase.from('trips').update(row).eq('id', existingId).select().single()
    : supabase.from('trips').insert(row).select().single();
  const { data, error } = await q;
  if (error) throw new Error(`Couldn't save your trip: ${error.message}`);
  return rowToTrip(data);
}

/**
 * Candidate trips near the user's arrival.
 * Demo: fictional passengers placed around your arrival time.
 * Live: other travellers' trips via a privacy-limited RPC (no street addresses).
 */
export async function getCandidateTrips(trip, windowMinutes) {
  if (!IS_LIVE) return buildDemoCandidates(trip.arrivalTime);
  await ensureSession();
  const t = new Date(trip.arrivalTime).getTime();
  const pad = windowMinutes * 60000;
  const { data, error } = await supabase.rpc('find_candidate_trips', {
    p_airport: trip.airportCode,
    p_from: new Date(t - pad).toISOString(),
    p_to: new Date(t + pad).toISOString(),
  });
  if (error) throw new Error(`Couldn't load other travellers: ${error.message}`);
  return (data || []).map(rowToTrip);
}

