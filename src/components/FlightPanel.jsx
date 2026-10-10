import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, BadgeCheck, CircleHelp } from 'lucide-react';
import { Button, Tag, Note } from './ui.jsx';
import { getFlight, getJourneyFlightStatus, flightSnapshot, FRESHNESS_LABEL, STATUS_TEXT } from '../services/flightApi.js';
import { IS_LIVE } from '../services/supabaseClient.js';
import { fmtAirportTime, ageText } from '../utils/timeFormatting.js';
import { readyAt } from '../utils/readiness.js';

const REFRESH_MS = 5 * 60 * 1000;
const fp = (f) => (f ? [f.status, f.scheduledArrival, f.estimatedArrival, f.actualArrival].join('|') : '');

/**
 * The user's own flight on the ride page. Refreshes through Sanchari's API (server-side cache
 * limits provider calls) every 5 minutes while visible, and on demand. If the flight now makes
 * the user ready after the agreed departure, it says so and offers a change — it never applies one.
 */
export function FlightPanel({ trip, ride, onFlight, onProposeShift, busy }) {
  const flight = trip?.flight;
  const [state, setState] = useState({ status: 'idle', freshness: flight?.freshness || null, retrievedAt: flight?.updatedAt || null, error: null });
  const last = useRef(fp(flight));

  const refresh = useCallback(async () => {
    if (!flight || flight.verification !== 'verified') return;
    setState((s) => ({ ...s, status: 'loading' }));
    const r = IS_LIVE ? await getJourneyFlightStatus(trip.id) : await getFlight(flight.id);
    const live = IS_LIVE ? r.data?.live : r.data?.flight;
    if (!r.ok || !live) {
      setState((s) => ({ ...s, status: 'error', error: r.error || r.data?.error || { message: 'No live data available.' } }));
      return;
    }
    const freshness = r.data.freshness;
    const snap = flightSnapshot(live, freshness);
    setState({ status: 'ready', freshness, retrievedAt: r.data.retrievedAt, error: null });
    if (fp(snap) !== last.current) {
      last.current = fp(snap);
      onFlight(snap);
    }
  }, [flight, trip?.id, onFlight]);

  useEffect(() => {
    if (!flight || flight.verification !== 'verified') return undefined;
    refresh();
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), REFRESH_MS);
    return () => clearInterval(t);
    // Only re-arm when the flight identity changes, not on every data update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.id, flight?.verification]);

  if (!flight) {
    return (
      <div className="flight-panel">
        <h3>Your arrival</h3>
        <p className="small">No flight linked — Sanchari uses the landing time you entered. Update your status yourself when you land.</p>
      </div>
    );
  }

  if (flight.verification !== 'verified') {
    return (
      <div className="flight-panel">
        <h3><CircleHelp size={16} aria-hidden style={{ display: 'inline', verticalAlign: '-3px' }} /> {flight.designator} · unverified</h3>
        <p className="small">Entered by you and not checked against live flight data, so it won’t update automatically. Your own landing time and status updates are used.</p>
      </div>
    );
  }

  const mine = ride?.members.find((m) => m.isMe);
  const myReady = readyAt({ ...trip, flight });
  const lateBy = ride ? Math.round((new Date(myReady).getTime() - new Date(ride.proposedDepartureTime).getTime()) / 60000) : 0;
  const closed = ride && ['departed', 'cancelled'].includes(ride.status);

  return (
    <div className="flight-panel stack-sm">
      <div className="verify-row">
        <h3><BadgeCheck size={16} aria-hidden style={{ display: 'inline', verticalAlign: '-3px' }} /> {flight.designator}</h3>
        <Tag tone={flight.status === 'LANDED' ? 'brand' : flight.status === 'CANCELLED' || flight.status === 'DIVERTED' ? 'danger' : ''}>{STATUS_TEXT[flight.status] || 'Status unknown'}</Tag>
      </div>
      <dl>
        <dt>Scheduled</dt><dd>{fmtAirportTime(flight.scheduledArrival)}</dd>
        <dt>Estimated</dt><dd>{flight.estimatedArrival ? fmtAirportTime(flight.estimatedArrival) : <span className="muted">no estimate yet</span>}</dd>
        <dt>Actual</dt><dd>{flight.actualArrival ? fmtAirportTime(flight.actualArrival) : <span className="muted">not landed</span>}</dd>
        {flight.terminal && <><dt>Terminal</dt><dd>{flight.terminal}</dd></>}
      </dl>
      <p className="small muted">
        {state.freshness ? FRESHNESS_LABEL[state.freshness] : 'Verified'}
        {state.retrievedAt && ` · data from ${fmtAirportTime(state.retrievedAt)} IST`}
        {state.status === 'loading' && ' · checking…'}
      </p>
      {state.status === 'error' && <Note tone="accent">Couldn’t refresh: {state.error.message} The times above are the last ones received{state.retrievedAt ? ` (${ageText(Math.round((Date.now() - new Date(state.retrievedAt).getTime()) / 1000))})` : ''}.</Note>}
      {!closed && lateBy > 0 && mine?.pickupStatus !== 'at_pickup' && (
        <Note tone="accent" role="status">
          <strong>Your flight changes the timing.</strong> You’re likely ready around {fmtAirportTime(myReady)}, {lateBy} min after the agreed departure ({fmtAirportTime(ride.proposedDepartureTime)}). Nothing has been changed automatically.
          <div style={{ marginTop: '0.6rem' }}>
            <Button variant="secondary" disabled={busy} onClick={() => onProposeShift(Math.ceil(lateBy / 5) * 5)}>Move departure by {Math.ceil(lateBy / 5) * 5} min</Button>
          </div>
        </Note>
      )}
      <Button variant="secondary" loading={state.status === 'loading'} onClick={refresh}>
        {state.status !== 'loading' && <RefreshCw size={16} aria-hidden />} Refresh flight
      </Button>
    </div>
  );
}
