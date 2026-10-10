// Data access for journey (trip) endpoints. Supabase-backed; injectable for tests.
import { userClient, serviceClient, supabaseConfigured, serviceRoleConfigured } from './supabaseServer.js';

export const TRIP_FLIGHT_COLUMNS =
  'id, user_id, display_name, airport_code, arrival_time, luggage_count, status, flight_number, flight_carrier, flight_date, flight_provider_id, flight_source, flight_verification, flight_scheduled_arrival, flight_estimated_arrival, flight_actual_arrival, flight_status, flight_fingerprint, flight_updated_at';

export function flightColumnsFrom(flight, { fingerprint }) {
  return {
    flight_carrier: flight.airline.code,
    flight_number: flight.designator,
    flight_date: flight.localArrivalDate,
    flight_provider_id: flight.providerFlightId,
    flight_source: flight.source,
    flight_verification: 'verified',
    flight_scheduled_arrival: flight.arrival.scheduled,
    flight_estimated_arrival: flight.arrival.estimated,
    flight_actual_arrival: flight.arrival.actual,
    flight_status: flight.status.normalized,
    flight_fingerprint: fingerprint,
    flight_updated_at: new Date().toISOString(),
  };
}

export function createSupabaseJourneyStore() {
  return {
    available: () => supabaseConfigured(),
    canWriteVerified: () => serviceRoleConfigured(),

    async getUser(token) {
      const { data, error } = await userClient(token).auth.getUser(token);
      return error || !data?.user ? null : { id: data.user.id };
    },

    /** RLS guarantees only the owner's trip is returned. */
    async getOwnTrip(token, tripId) {
      const { data, error } = await userClient(token).from('trips').select(TRIP_FLIGHT_COLUMNS).eq('id', tripId).maybeSingle();
      if (error) throw error;
      return data;
    },

    async writeFlight(userId, tripId, columns) {
      const { data, error } = await serviceClient().from('trips').update(columns).eq('id', tripId).eq('user_id', userId).select(TRIP_FLIGHT_COLUMNS).maybeSingle();
      if (error) throw error;
      return data;
    },

    async tripsNeedingRefresh({ fromIso, toIso, limit = 100 }) {
      const { data, error } = await serviceClient()
        .from('trips')
        .select(TRIP_FLIGHT_COLUMNS)
        .eq('flight_verification', 'verified')
        .in('status', ['searching', 'matched'])
        .gte('flight_scheduled_arrival', fromIso)
        .lte('flight_scheduled_arrival', toIso)
        .order('flight_scheduled_arrival')
        .limit(limit);
      if (error) throw error;
      return data;
    },

    async updateTripFlightById(tripId, columns) {
      const { error } = await serviceClient().from('trips').update(columns).eq('id', tripId);
      if (error) throw error;
    },

    /** Active rides containing this trip, with the member row. */
    async activeRidesForTrip(tripId) {
      const { data, error } = await serviceClient()
        .from('ride_members')
        .select('id, ride_group_id, display_name, ride_groups!inner(id, status, proposed_departure_time, waiting_deadline)')
        .eq('trip_id', tripId)
        .in('ride_groups.status', ['proposed', 'confirmed']);
      if (error) throw error;
      return data || [];
    },

    async updateMemberFlight(memberId, columns) {
      const { error } = await serviceClient().from('ride_members').update(columns).eq('id', memberId);
      if (error) throw error;
    },

    async postRideUpdate(groupId, tripId, message, kind) {
      const { error } = await serviceClient().from('ride_updates').insert({ ride_group_id: groupId, trip_id: tripId, message: message.slice(0, 200), kind });
      if (error) throw error;
    },
  };
}
