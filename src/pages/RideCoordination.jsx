import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CarFront, Luggage, MapPin, Footprints, LogOut, PlaneLanding, Navigation, Search } from 'lucide-react';
import { Button, Note, TextButton, useDocumentTitle } from '../components/ui.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { AirportMap } from '../components/AirportMap.jsx';
import { useNow, useDeadlineReminder, ReminderBanner } from '../components/Countdown.jsx';
import { useAppState } from '../state/AppState.jsx';
import { IS_LIVE } from '../services/supabaseClient.js';
import { saveTrip } from '../services/tripService.js';
import * as rides from '../services/rideService.js';
import { RIDE_CONFIG } from '../data/config.js';
import { getAirport } from '../data/airports.js';
import { fmtCountdown } from '../utils/timeFormatting.js';
import { formatINR } from '../utils/fareCalculation.js';
import { googleMapsSearchUrl } from '../utils/geo.js';

const NOW_DOING = [
  ['collecting_luggage', 'Collecting baggage', Luggage],
  ['walking', 'Walking to pickup', Footprints],
  ['at_pickup', 'At the pickup point', MapPin],
];

const STATUS_SHORT = {
  not_landed: 'In the air',
  landed: 'Just landed',
  collecting_luggage: 'Collecting baggage',
  walking: 'Walking to pickup',
  at_pickup: 'At pickup',
  departed: 'Departed',
};

function statusText(m) {
  if (m.pickupStatus === 'delayed') return `Delayed · about ${m.delayMinutes} min`;
  return STATUS_SHORT[m.pickupStatus] ?? '';
}

export default function RideCoordination() {
  useDocumentTitle('Meet your co-passengers');
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const { search } = useLocation();
  const tools = new URLSearchParams(search).has('tools');
  const now = useNow(1000);
  const [ride, setRide] = useState(undefined); // undefined = loading, null = not found
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [more, setMore] = useState(null); // null | 'delay' | 'leave'
  const busy = useRef(false);
  const rideId = state.activeRideId;
  const myTripId = state.trip?.id;

  useEffect(() => {
    if (!rideId) {
      setRide(null);
      return undefined;
    }
    let alive = true;
    rides.getRide(rideId, myTripId).then((r) => alive && setRide(r)).catch((e) => alive && (setError(e.message), setRide(null)));
    const unsub = rides.subscribeToRide(rideId, myTripId, (r) => alive && setRide(r));
    return () => {
      alive = false;
      unsub();
    };
  }, [rideId, myTripId]);

  const closed = ride?.status === 'departed' || ride?.status === 'cancelled';
  const started = !!ride?.pickupWindowStartedAt;
  const { reminder, remaining, dismiss } = useDeadlineReminder(ride, now, !!ride && !closed && started);

  const act = useCallback(async (name, fn) => {
    if (busy.current) return;
    busy.current = true;
    setPending(name);
    setError('');
    try {
      const next = await fn();
      if (next) setRide(next);
      setMore(null);
    } catch (e) {
      setError(e.message);
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, []);

  async function findAnother() {
    setPending('again');
    try {
      if (state.trip) {
        const saved = await saveTrip(state.trip, state.trip.id);
        update({ trip: { ...state.trip, ...saved, flight: state.trip.flight }, activeRideId: null });
      } else {
        update({ activeRideId: null });
      }
      navigate('/match');
    } catch (e) {
      setError(e.message);
      setPending(null);
    }
  }

  if (ride === undefined) {
    return <div className="narrow" style={{ paddingTop: '3rem' }} aria-busy="true" aria-label="Loading your ride"><div className="skeleton" style={{ height: 360 }} /></div>;
  }

  if (!ride) {
    return (
      <div className="narrow meet">
        <p className="eyebrow">Your ride</p>
        <h1 className="meet-title">No ride yet.</h1>
        {error && <Note tone="danger">{error}</Note>}
        <Button onClick={() => { update({ activeRideId: null }); navigate(state.trip ? '/match' : '/'); }}>
          <Search size={18} aria-hidden /> {state.trip ? 'Find my ride' : 'Plan a ride'}
        </Button>
      </div>
    );
  }

  const me = ride.members.find((m) => m.isMe);
  // Not accepted yet: the answer is given on the proposal page.
  if (me && !me.confirmed && ride.status === 'proposed' && me.pickupStatus !== 'left') return <Navigate to="/match" replace />;
  const active = ride.members.filter((m) => m.pickupStatus !== 'left');
  const others = active.filter((m) => !m.isMe);
  const notHere = others.filter((m) => m.pickupStatus !== 'at_pickup');
  const waitingFor = others.filter((m) => !m.confirmed);
  const meLanded = !['not_landed', 'delayed', 'left'].includes(me.pickupStatus);
  const timeUp = started && remaining <= 0;
  const everyoneHere = active.length > 1 && active.every((m) => m.pickupStatus === 'at_pickup');
  const airport = getAirport(ride.airportCode);
  const iLeft = me.pickupStatus === 'left';

  if (closed || iLeft) {
    const departed = ride.status === 'departed';
    return (
      <div className="narrow meet">
        <p className="eyebrow">Your ride</p>
        <h1 className="meet-title">{departed ? <>Have a good <em>ride</em>.</> : iLeft ? 'You left this ride.' : 'This ride was called off.'}</h1>
        <p className="lead">
          {departed ? `Your share is about ${formatINR(me.fareShare)}. Settle up with your co-passengers.` : 'Sanchari can look for another group on your road.'}
        </p>
        {error && <Note tone="danger">{error}</Note>}
        <div className="button-row" style={{ marginTop: '1.4rem' }}>
          {departed ? (
            <Button onClick={() => { update({ activeRideId: null }); navigate('/'); }}>Plan another ride</Button>
          ) : (
            <Button loading={pending === 'again'} onClick={findAnother}><Search size={18} aria-hidden /> Find another ride</Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="narrow meet">
      {reminder && <ReminderBanner reminder={reminder} remaining={remaining} deadline={ride.waitingDeadline} onDismiss={dismiss} />}

      <p className="eyebrow">Meet your co-passengers</p>
      <div className={`countdown${!started ? ' idle' : timeUp ? ' over' : remaining <= RIDE_CONFIG.reminderLeadSeconds * 1000 ? ' warn' : ''}`} role="timer" aria-live="off">
        <span className="countdown-value tabnum">{started ? (timeUp ? '00:00' : fmtCountdown(remaining)) : `${RIDE_CONFIG.pickupWindowMinutes}:00`}</span>
        <span className="countdown-label">
          {!started ? `Your ${RIDE_CONFIG.pickupWindowMinutes} minutes start when the first of you lands` : timeUp ? 'Time’s up' : 'left to meet at pickup'}
        </span>
      </div>
      <p className="meet-sub">
        <a href={googleMapsSearchUrl(`${airport?.name ?? ride.airportCode} arrivals taxi pickup`)} target="_blank" rel="noreferrer">
          <Navigation size={14} aria-hidden /> {ride.pickupPoint}
        </a>
        <span>Your share {formatINR(me.fareShare)}</span>
      </p>

      {ride.status === 'proposed' && waitingFor.length > 0 && (
        <p className="small muted" role="status">Waiting for {waitingFor.map((m) => m.displayName).join(' and ')} to say yes.</p>
      )}

      <AirportMap members={active} />

      <ul className="who-list">
        {active.map((m) => (
          <li key={m.id}>
            <Avatar name={m.displayName} me={m.isMe} small />
            <span className="who-name">{m.isMe ? 'You' : m.displayName}</span>
            <span className={`who-status${m.pickupStatus === 'delayed' ? ' late' : m.pickupStatus === 'at_pickup' ? ' here' : ''}`}>{statusText(m)}</span>
          </li>
        ))}
      </ul>

      {error && <Note tone="danger" role="alert">{error}</Note>}

      <section className="meet-action" aria-label="Your status">
        {timeUp && !everyoneHere ? (
          <>
            <h2>{notHere.length ? `${notHere.map((m) => m.displayName).join(' and ')} ${notHere.length === 1 ? 'isn’t' : 'aren’t'} here yet.` : 'Time’s up.'}</h2>
            <div className="decision">
              <Button loading={pending === 'depart'} onClick={() => act('depart', () => rides.setRideStatus(ride, 'departed'))}><CarFront size={18} aria-hidden /> Leave with who’s here</Button>
              <Button variant="secondary" loading={pending === 'extend'} onClick={() => act('extend', () => rides.extendWindow(ride, RIDE_CONFIG.extendByMinutes))}>Wait {RIDE_CONFIG.extendByMinutes} more min</Button>
            </div>
          </>
        ) : everyoneHere ? (
          <>
            <h2>Everyone’s here.</h2>
            <Button block loading={pending === 'depart'} onClick={() => act('depart', () => rides.setRideStatus(ride, 'departed'))}><CarFront size={18} aria-hidden /> We’ve left together</Button>
          </>
        ) : !meLanded ? (
          <Button block className="big-button" loading={pending === 'landed'} onClick={() => act('landed', () => rides.updateMyStatus(ride, 'landed'))}>
            <PlaneLanding size={20} aria-hidden /> I’ve landed
          </Button>
        ) : (
          <>
            <h2 id="doing-label">What are you doing now?</h2>
            <div className="doing" role="group" aria-labelledby="doing-label">
              {NOW_DOING.map(([s, label, Icon]) => (
                <Button key={s} variant="secondary" disabled={!!pending} aria-pressed={me.pickupStatus === s} onClick={() => act(s, () => rides.updateMyStatus(ride, s))}>
                  <Icon size={18} aria-hidden /> {label}
                </Button>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="meet-more">
        {more === 'delay' ? (
          <div className="delay-picker" role="group" aria-label="How late">
            <span className="small">Delayed by about</span>
            {[15, 30, 60].map((m) => (
              <Button key={m} variant="secondary" disabled={!!pending} onClick={() => act('delay', () => rides.updateMyStatus(ride, 'delayed', m))}>{m} min</Button>
            ))}
            <TextButton onClick={() => setMore(null)}>Cancel</TextButton>
          </div>
        ) : more === 'leave' ? (
          <div className="delay-picker">
            <span className="small">Leave this ride? The others will see it.</span>
            <Button variant="warning" loading={pending === 'leave'} onClick={() => act('leave', () => rides.leaveRide(ride))}><LogOut size={16} aria-hidden /> Leave</Button>
            <TextButton onClick={() => setMore(null)}>Keep my seat</TextButton>
          </div>
        ) : (
          <>
            {!meLanded && <TextButton onClick={() => setMore('delay')}>Flight delayed?</TextButton>}
            <TextButton danger onClick={() => setMore('leave')}>Can’t make it</TextButton>
          </>
        )}
      </div>

      {tools && (
        <details className="disclosure" style={{ marginTop: '2rem' }}>
          <summary>Testing tools<span className="plus" aria-hidden>+</span></summary>
          <div className="disclosure-body">
            <div className="button-row">
              <Button variant="secondary" disabled={!!pending} onClick={() => act('t1', () => rides.setDeadlineFromNow(ride, 130))}>Window ends in 2:10</Button>
              <Button variant="secondary" disabled={!!pending} onClick={() => act('t2', () => rides.setDeadlineFromNow(ride, 20))}>Window ends in 0:20</Button>
              {!IS_LIVE && <Button variant="secondary" disabled={!!pending} onClick={() => act('sim', () => rides.simulateProgress(ride))}>Move a co-rider forward</Button>}
              {!IS_LIVE && <Button variant="secondary" disabled={!!pending} onClick={() => act('simd', () => rides.simulateDelay(ride))}>Delay a co-rider</Button>}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
