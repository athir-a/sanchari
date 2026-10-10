import { IS_LIVE, supabase, ensureSession } from './supabaseClient.js';
import { readJSON, writeJSON, storageKey, uuid } from './storage.js';
import { RIDE_CONFIG } from '../data/config.js';
import { readyAt, effectiveArrival } from '../utils/readiness.js';

// Passenger-reported readiness. Flight data never changes these on its own.
export const STATUS_ORDER = ['not_landed', 'landed', 'collecting_luggage', 'walking', 'at_pickup'];
export const STATUS_LABEL = {
  not_landed: 'Awaiting arrival',
  landed: 'Flight landed',
  collecting_luggage: 'Collecting baggage',
  walking: 'Walking to pickup',
  at_pickup: 'Ready for pickup',
  delayed: 'Needs more time',
  departed: 'Departed',
  left: 'Unable to continue',
};

export function statusMessage(name, status, delayMinutes) {
  switch (status) {
    case 'landed': return `${name} has landed`;
    case 'collecting_luggage': return `${name} is collecting baggage`;
    case 'walking': return `${name} is walking to the pickup point`;
    case 'at_pickup': return `${name} is ready at the pickup point`;
    case 'delayed': return `${name} needs about ${delayMinutes} more min`;
    case 'not_landed': return `${name} hasn't landed yet`;
    case 'left': return `${name} can't continue and left the ride`;
    default: return `${name}: ${STATUS_LABEL[status] || status}`;
  }
}

const RIDE_EVENT = 'sanchari:ride';
const addMinutes = (iso, m) => new Date(new Date(iso).getTime() + m * 60000).toISOString();
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Proposed departure: when the last rider is likely ready (best known arrival — actual,
 * estimated or scheduled — plus their baggage time), rounded up to 5 minutes.
 */
export function planTimes(trips) {
  const latest = Math.max(...trips.map((t) => new Date(readyAt(t)).getTime()));
  const five = 5 * 60000;
  const proposed = new Date(Math.ceil(latest / five) * five).toISOString();
  return { proposed, deadline: addMinutes(proposed, RIDE_CONFIG.waitAfterDepartureMinutes) };
}

function memberFlight(t) {
  const f = t.flight;
  if (!f) return { flightDesignator: t.flightNumber || null, flightVerification: t.flightNumber ? 'unverified' : null, flightBestArrival: null, flightBestKind: null };
  const best = effectiveArrival(t);
  return {
    flightDesignator: f.designator,
    flightVerification: f.verification,
    flightDemo: f.source === 'demo',
    flightBestArrival: f.verification === 'verified' ? best.time : null,
    flightBestKind: f.verification === 'verified' ? best.basis : null,
  };
}

function optionSnapshot(o) {
  return {
    kind: o.kind, label: o.label, modes: o.modes, vehicle: o.vehicle, dropArrangement: o.dropArrangement,
    stops: o.stops, mapsUrl: o.mapsUrl, perPerson: o.perPerson, durationMinutes: o.durationMinutes,
    detourMinutes: o.detourMinutes, transfers: o.transfers, savings: o.savings, soloFare: o.soloFare,
  };
}

/* ───────────────────────── Demo store (this browser only) ───────────────────────── */

const demoRides = () => readJSON('rides', {});
function saveDemoRide(ride) {
  const all = demoRides();
  all[ride.id] = ride;
  if (!writeJSON('rides', all)) {
    // Kept in memory; tell the caller persistence failed rather than pretending.
    ride = { ...ride, persistWarning: 'This browser blocked storage, so the ride will be lost on reload.' };
  }
  window.dispatchEvent(new CustomEvent(RIDE_EVENT, { detail: ride.id }));
  return ride;
}
function mutateDemo(id, fn) {
  const ride = demoRides()[id];
  if (!ride) throw new Error('Ride not found on this device.');
  const next = structuredClone(ride);
  fn(next);
  return saveDemoRide(next);
}
function pushUpdate(ride, text, kind = 'info') {
  ride.updates.unshift({ id: uuid(), at: new Date().toISOString(), text, kind });
  ride.updates = ride.updates.slice(0, 30);
}

/* ───────────────────────── Live mapping ───────────────────────── */

function mapLive(group, members, updates, myTripId) {
  return {
    id: group.id,
    mode: 'live',
    airportCode: group.airport_code,
    pickupPoint: group.pickup_point,
    proposedDepartureTime: group.proposed_departure_time,
    waitingDeadline: group.waiting_deadline,
    routeSummary: group.route_summary,
    selectedPreference: group.selected_preference,
    estimatedTotalFare: Number(group.estimated_total_fare),
    status: group.status,
    createdAt: group.created_at,
    option: group.route_details || null,
    members: members.map((m) => ({
      id: m.id,
      tripId: m.trip_id,
      displayName: m.display_name,
      destinationName: m.destination_name,
      arrivalTime: m.arrival_time,
      pickupStatus: m.pickup_status,
      delayMinutes: m.delay_minutes,
      fareShare: Number(m.estimated_fare_share),
      confirmed: m.confirmed,
      isMe: m.trip_id === myTripId,
      isDemo: false,
      flightDesignator: m.flight_designator,
      flightVerification: m.flight_verification,
      flightBestArrival: m.flight_best_arrival,
      flightBestKind: m.flight_best_kind,
      updatedAt: m.updated_at,
    })),
    updates: updates.map((u) => ({ id: u.id, at: u.created_at, text: u.message, kind: u.kind })),
  };
}

async function liveGet(id, myTripId) {
  await ensureSession();
  const [g, m, u] = await Promise.all([
    supabase.from('ride_groups').select('*').eq('id', id).maybeSingle(),
    supabase.from('ride_members').select('*').eq('ride_group_id', id).order('arrival_time'),
    supabase.from('ride_updates').select('*').eq('ride_group_id', id).order('created_at', { ascending: false }).limit(30),
  ]);
  const err = g.error || m.error || u.error;
  if (err) throw new Error(`Couldn't load the ride: ${err.message}`);
  if (!g.data) return null;
  return mapLive(g.data, m.data, u.data, myTripId);
}

async function liveUpdate(text, ride, kind = 'info') {
  const me = ride.members.find((x) => x.isMe);
  const { error } = await supabase.from('ride_updates').insert({ ride_group_id: ride.id, trip_id: me?.tripId ?? null, message: text, kind });
  if (error) throw new Error(`Saved, but couldn't post the update: ${error.message}`);
}

/* ───────────────────────── Public API ───────────────────────── */

export async function createRide({ me, others, option }) {
  const { proposed, deadline } = planTimes([me, ...others]);
  const shares = Object.fromEntries(option.members.map((m) => [m.tripId, m.cost]));

  if (!IS_LIVE) {
    const ride = {
      id: uuid(),
      mode: 'demo',
      airportCode: me.airportCode,
      pickupPoint: option.pickupPoint,
      proposedDepartureTime: proposed,
      waitingDeadline: deadline,
      routeSummary: option.routeSummary,
      selectedPreference: option.kind,
      estimatedTotalFare: option.totalCost,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      option: optionSnapshot(option),
      members: [me, ...others].map((t, i) => ({
        id: uuid(),
        tripId: t.id,
        displayName: t.displayName,
        destinationName: t.destinationName,
        arrivalTime: t.arrivalTime,
        pickupStatus: 'not_landed',
        delayMinutes: 0,
        fareShare: shares[t.id],
        confirmed: true,
        isMe: i === 0,
        isDemo: i !== 0,
        readyAt: readyAt(t),
        ...memberFlight(t),
        updatedAt: new Date().toISOString(),
      })),
      updates: [],
    };
    pushUpdate(ride, `${me.displayName} confirmed the ride. Proposed departure ${fmtTime(proposed)}.`, 'success');
    return saveDemoRide(ride);
  }

  await ensureSession();
  const { data, error } = await supabase.rpc('create_ride_group', {
    p_my_trip_id: me.id,
    p_other_trip_ids: others.map((o) => o.id),
    p_pickup_point: option.pickupPoint,
    p_proposed_departure: proposed,
    p_waiting_deadline: deadline,
    p_route_summary: option.routeSummary,
    p_route_details: optionSnapshot(option),
    p_selected_preference: option.kind,
    p_estimated_total_fare: option.totalCost,
    p_fare_shares: shares,
  });
  if (error) throw new Error(`Couldn't create the ride: ${error.message}`);
  return liveGet(data, me.id);
}

export async function getRide(id, myTripId) {
  if (!IS_LIVE) return demoRides()[id] || null;
  return liveGet(id, myTripId);
}

/** Live mode: find a ride another traveller added this trip to. */
export async function findRideForTrip(tripId) {
  if (!IS_LIVE || !tripId) return null;
  await ensureSession();
  const { data, error } = await supabase
    .from('ride_members').select('ride_group_id').eq('trip_id', tripId)
    .order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.ride_group_id ?? null;
}

export async function updateMyStatus(ride, status, delayMinutes = 0) {
  const me = ride.members.find((m) => m.isMe);
  const text = statusMessage(me.displayName, status, delayMinutes);
  const kind = status === 'delayed' ? 'warning' : status === 'at_pickup' ? 'success' : 'info';
  if (!IS_LIVE) {
    return mutateDemo(ride.id, (r) => {
      const m = r.members.find((x) => x.isMe);
      m.pickupStatus = status;
      m.delayMinutes = status === 'delayed' ? delayMinutes : 0;
      m.updatedAt = new Date().toISOString();
      pushUpdate(r, text, kind);
    });
  }
  const { error } = await supabase.from('ride_members')
    .update({ pickup_status: status, delay_minutes: status === 'delayed' ? delayMinutes : 0, updated_at: new Date().toISOString() })
    .eq('id', me.id);
  if (error) throw new Error(`Couldn't update your status: ${error.message}`);
  await liveUpdate(text, ride, kind);
  return liveGet(ride.id, me.tripId);
}

export async function confirmMembership(ride) {
  const me = ride.members.find((m) => m.isMe);
  if (!IS_LIVE) return ride;
  const { error } = await supabase.from('ride_members').update({ confirmed: true, updated_at: new Date().toISOString() }).eq('id', me.id);
  if (error) throw new Error(`Couldn't confirm: ${error.message}`);
  await liveUpdate(`${me.displayName} confirmed the ride`, ride, 'success');
  return liveGet(ride.id, me.tripId);
}

/** Move proposed departure and deadline together (e.g. someone is delayed). */
export async function shiftDeparture(ride, minutes) {
  const me = ride.members.find((m) => m.isMe);
  const proposed = addMinutes(ride.proposedDepartureTime, minutes);
  const deadline = addMinutes(ride.waitingDeadline, minutes);
  const text = `${me.displayName} moved departure to ${fmtTime(proposed)} (+${minutes} min)`;
  if (!IS_LIVE) {
    return mutateDemo(ride.id, (r) => {
      r.proposedDepartureTime = proposed;
      r.waitingDeadline = deadline;
      pushUpdate(r, text, 'warning');
    });
  }
  const { error } = await supabase.from('ride_groups').update({ proposed_departure_time: proposed, waiting_deadline: deadline }).eq('id', ride.id);
  if (error) throw new Error(`Couldn't change the departure time: ${error.message}`);
  await liveUpdate(text, ride, 'warning');
  return liveGet(ride.id, me.tripId);
}

/** Testing helper: put the waiting deadline `seconds` from now. */
export async function setDeadlineFromNow(ride, seconds) {
  const deadline = new Date(Date.now() + seconds * 1000).toISOString();
  // Keep "leave by" no later than the deadline so the test stays coherent.
  const proposed = ride.proposedDepartureTime > deadline ? deadline : ride.proposedDepartureTime;
  const text = `Test: waiting window set to end at ${fmtTime(deadline)}`;
  if (!IS_LIVE) {
    return mutateDemo(ride.id, (r) => {
      r.waitingDeadline = deadline;
      r.proposedDepartureTime = proposed;
      pushUpdate(r, text, 'info');
    });
  }
  const me = ride.members.find((m) => m.isMe);
  const { error } = await supabase.from('ride_groups').update({ waiting_deadline: deadline, proposed_departure_time: proposed }).eq('id', ride.id);
  if (error) throw new Error(error.message);
  await liveUpdate(text, ride);
  return liveGet(ride.id, me.tripId);
}

export async function setRideStatus(ride, status) {
  const me = ride.members.find((m) => m.isMe);
  const text = status === 'departed' ? `${me.displayName} marked the ride as departed` : `${me.displayName} cancelled the ride`;
  if (!IS_LIVE) {
    return mutateDemo(ride.id, (r) => {
      r.status = status;
      if (status === 'departed') r.members.forEach((m) => { if (m.pickupStatus === 'at_pickup') m.pickupStatus = 'departed'; });
      pushUpdate(r, text, status === 'departed' ? 'success' : 'warning');
    });
  }
  const { error } = await supabase.from('ride_groups').update({ status }).eq('id', ride.id);
  if (error) throw new Error(error.message);
  await liveUpdate(text, ride, status === 'departed' ? 'success' : 'warning');
  return liveGet(ride.id, me.tripId);
}

export async function leaveRide(ride) {
  const me = ride.members.find((m) => m.isMe);
  if (!IS_LIVE) {
    return mutateDemo(ride.id, (r) => {
      const m = r.members.find((x) => x.isMe);
      m.pickupStatus = 'left';
      m.confirmed = false;
      r.status = 'cancelled';
      pushUpdate(r, `${me.displayName} left the ride`, 'warning');
    });
  }
  const { error } = await supabase.from('ride_members').update({ pickup_status: 'left', confirmed: false, updated_at: new Date().toISOString() }).eq('id', me.id);
  if (error) throw new Error(error.message);
  await liveUpdate(`${me.displayName} left the ride`, ride, 'warning');
  return liveGet(ride.id, me.tripId);
}

/** Demo only: move the least-progressed fictional passenger one step forward. */
export async function simulateProgress(ride) {
  return mutateDemo(ride.id, (r) => {
    const rank = (s) => (s === 'delayed' ? 2 : STATUS_ORDER.indexOf(s));
    const others = r.members.filter((m) => !m.isMe && rank(m.pickupStatus) >= 0 && rank(m.pickupStatus) < STATUS_ORDER.length - 1);
    if (!others.length) return;
    others.sort((a, b) => rank(a.pickupStatus) - rank(b.pickupStatus));
    const m = others[0];
    m.pickupStatus = STATUS_ORDER[rank(m.pickupStatus) + 1];
    m.delayMinutes = 0;
    m.updatedAt = new Date().toISOString();
    pushUpdate(r, `${statusMessage(m.displayName, m.pickupStatus)} (demo)`, m.pickupStatus === 'at_pickup' ? 'success' : 'info');
  });
}

/** Demo only: a fictional passenger reports a delay. */
export async function simulateDelay(ride) {
  return mutateDemo(ride.id, (r) => {
    const m = r.members.find((x) => !x.isMe && !['at_pickup', 'departed', 'left', 'delayed'].includes(x.pickupStatus));
    if (!m) return;
    m.pickupStatus = 'delayed';
    m.delayMinutes = 15;
    m.updatedAt = new Date().toISOString();
    pushUpdate(r, `${statusMessage(m.displayName, 'delayed', 15)} (demo)`, 'warning');
  });
}

/**
 * Subscribe to changes. Demo: same-tab events + other tabs via `storage`.
 * Live: Supabase Realtime, plus a 20 s poll as a fallback.
 */
export function subscribeToRide(id, myTripId, onChange) {
  if (!IS_LIVE) {
    const reload = () => onChange(demoRides()[id] || null);
    const onEvent = (e) => { if (e.detail === id) reload(); };
    const onStorage = (e) => { if (e.key === storageKey('rides')) reload(); };
    window.addEventListener(RIDE_EVENT, onEvent);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RIDE_EVENT, onEvent);
      window.removeEventListener('storage', onStorage);
    };
  }
  let alive = true;
  const reload = () => liveGet(id, myTripId).then((r) => alive && onChange(r)).catch(() => {});
  const channel = supabase
    .channel(`ride-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_members', filter: `ride_group_id=eq.${id}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_updates', filter: `ride_group_id=eq.${id}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_groups', filter: `id=eq.${id}` }, reload)
    .subscribe();
  const poll = setInterval(reload, 20000);
  return () => {
    alive = false;
    clearInterval(poll);
    supabase.removeChannel(channel);
  };
}

/**
 * Demo mode: record a refreshed flight on my ride member and post one update when the
 * best-known arrival changes (identical refreshes are ignored). Never changes ride times.
 * Live mode does this on the server (journey flight-status endpoint / scheduled refresh).
 */
export async function recordMyFlight(ride, flight) {
  if (IS_LIVE || flight?.verification !== 'verified') return ride;
  const best = flight.actualArrival || flight.estimatedArrival || flight.scheduledArrival;
  const kind = flight.actualArrival ? 'actual' : flight.estimatedArrival ? 'estimated' : 'scheduled';
  const me = ride.members.find((m) => m.isMe);
  if (me.flightBestArrival === best && me.flightBestKind === kind) return ride;
  return mutateDemo(ride.id, (r) => {
    const m = r.members.find((x) => x.isMe);
    const was = m.flightBestArrival;
    Object.assign(m, { flightDesignator: flight.designator, flightVerification: 'verified', flightBestArrival: best, flightBestKind: kind, updatedAt: new Date().toISOString() });
    const label = kind === 'actual' ? 'landed at' : kind === 'estimated' ? 'now estimated' : 'scheduled';
    pushUpdate(r, `${m.displayName}’s flight ${flight.designator} ${label} ${fmtTime(best)}${was && was !== best ? ` (was ${fmtTime(was)})` : ''}`, 'info');
  });
}
