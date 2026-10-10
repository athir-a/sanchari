import { IS_LIVE, supabase, ensureSession } from './supabaseClient.js';
import { buildDemoCandidates } from '../data/demoPassengers.js';
import { writeJSON, uuid } from './storage.js';
import { effectiveArrival } from '../utils/readiness.js';

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
    maxBudget: r.max_budget == null ? null : Number(r.max_budget),
    flight: r.flight_best_arrival
      ? {
          // Another traveller's verified readiness input (flight number withheld by the RPC).
          verification: 'verified',
          [`${r.flight_best_kind}Arrival`]: r.flight_best_arrival,
        }
      : r.flight_number
      ? {
          designator: r.flight_number,
          verification: r.flight_verification || 'unverified',
          id: r.flight_verification === 'verified' && r.flight_carrier && r.flight_date
            ? `${r.airport_code}~${r.flight_carrier}~${r.flight_number.replace(/^\S+\s*/, '')}~${r.flight_date}`
            : undefined,
          flightDate: r.flight_date,
          providerFlightId: r.flight_provider_id,
          scheduledArrival: r.flight_scheduled_arrival,
          estimatedArrival: r.flight_estimated_arrival,
          actualArrival: r.flight_actual_arrival,
          status: r.flight_status,
          source: r.flight_source,
          updatedAt: r.flight_updated_at,
        }
      : null,
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
    // Only the designator is client-written; verification fields are server-owned (see schema).
    flight_number: trip.flight?.designator || trip.flightNumber,
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
    max_budget: trip.maxBudget,
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
  const t = new Date(effectiveArrival(trip).time).getTime();
  // Pad beyond the matching window: readiness also depends on bags and live estimates.
  const pad = (windowMinutes + 60) * 60000;
  const { data, error } = await supabase.rpc('find_candidate_trips', {
    p_airport: trip.airportCode,
    p_from: new Date(t - pad).toISOString(),
    p_to: new Date(t + pad).toISOString(),
  });
  if (error) throw new Error(`Couldn't load other travellers: ${error.message}`);
  return (data || []).map(rowToTrip);
}

