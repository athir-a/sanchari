import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IS_LIVE } from '../services/supabaseClient.js';
import { findRideForTrip } from '../services/rideService.js';
import { useAppState } from '../state/AppState.jsx';

/**
 * If Sanchari has put your trip in a ride while you're elsewhere in the app, take you to it:
 * a ride waiting for your answer opens the proposal; one you've accepted opens the meet page.
 */
export function LiveInviteCheck() {
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tripId = state.trip?.id;
  const hasRide = !!state.activeRideId;
  const watching = pathname === '/match' || pathname === '/ride';

  useEffect(() => {
    if (!IS_LIVE || !tripId || hasRide || watching) return undefined;
    let alive = true;
    const check = () =>
      findRideForTrip(tripId)
        .then((found) => {
          if (!alive || !found) return;
          if (found.confirmed) {
            update({ activeRideId: found.id });
            navigate('/ride');
          } else {
            navigate('/match');
          }
        })
        .catch(() => {});
    check();
    const t = setInterval(check, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tripId, hasRide, watching, update, navigate]);

  return null;
}
