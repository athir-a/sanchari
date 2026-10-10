import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IS_LIVE } from '../services/supabaseClient.js';
import { findRideForTrip } from '../services/rideService.js';
import { useAppState } from '../state/AppState.jsx';

/**
 * Live mode only: if another traveller added your trip to a ride, open it.
 * Checks on load and every 30 s while you're searching.
 */
export function LiveInviteCheck() {
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const tripId = state.trip?.id;
  const hasRide = !!state.activeRideId;

  useEffect(() => {
    if (!IS_LIVE || !tripId || hasRide) return undefined;
    let alive = true;
    const check = () =>
      findRideForTrip(tripId)
        .then((id) => {
          if (alive && id) {
            update({ activeRideId: id });
            navigate('/ride');
          }
        })
        .catch(() => {});
    check();
    const t = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tripId, hasRide, update, navigate]);

  return null;
}
