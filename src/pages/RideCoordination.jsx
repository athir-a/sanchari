import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CarFront, Luggage, MapPin, Footprints, LogOut, PlaneLanding, Navigation, Search, PlaneTakeoff, BadgeCheck, BriefcaseBusiness, Coffee, Timer, Users } from 'lucide-react';
import { Button, Note, PageHeading, JourneySteps, Tag, TextButton, useDocumentTitle } from '../components/ui.jsx';
import { RouteMap } from '../components/RouteMap.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { AirportMap } from '../components/AirportMap.jsx';
import { useNow, useDeadlineReminder, ReminderBanner } from '../components/Countdown.jsx';
import { useAppState } from '../state/AppState.jsx';
import { IS_LIVE } from '../services/supabaseClient.js';
import { saveTrip } from '../services/tripService.js';
import * as rides from '../services/rideService.js';
import { RIDE_CONFIG } from '../data/config.js';
import { getAirport } from '../data/airports.js';
import { fmtCountdown, fmtTime } from '../utils/timeFormatting.js';
import { formatINR } from '../utils/fareCalculation.js';
import { googleMapsSearchUrl } from '../utils/geo.js';

// Everything a rider might be doing between the aircraft door and the cab.
const NOW_DOING = [
  ['landed', 'Getting off the plane', PlaneTakeoff],
  ['immigration', 'At immigration', BadgeCheck],
  ['collecting_luggage', 'Waiting for my bags', Luggage],
  ['got_bags', 'Got my bags', BriefcaseBusiness],
  ['quick_stop', 'Quick stop (restroom, food, ATM)', Coffee],
  ['walking', 'Walking to pickup', Footprints],
  ['at_pickup', 'At the pickup point', MapPin],
];

function statusText(m) {
  if (m.pickupStatus === 'delayed') return `Delayed · about ${m.delayMinutes} min`;
  return rides.STATUS_LABEL[m.pickupStatus] ?? '';
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
      <div>
        <PageHeading eyebrow="Your ride" title={<>No ride <em>yet</em>.</>} />
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
      <div>
        <PageHeading eyebrow="Your ride" title={departed ? <>Have a good <em>ride</em>.</> : iLeft ? <>You left <em>this ride</em>.</> : <>This ride was <em>called off</em>.</>}>
          {departed ? `Your share is about ${formatINR(me.fareShare)}. Settle up with your co-passengers.` : 'Sanchari can look for another group on your road.'}
        </PageHeading>
        {error && <Note tone="danger">{error}</Note>}
        <div className="button-row" style={{ marginTop: '1.4rem' }}>
          {departed ? (
            <>
              <Button onClick={() => { update({ activeRideId: null }); navigate('/'); }}>Plan another ride</Button>
              {ride.option?.mapsUrl && <a className="button secondary" href={ride.option.mapsUrl} target="_blank" rel="noreferrer"><Navigation size={18} aria-hidden /> Open the route in Google Maps</a>}
            </>
          ) : (
            <Button loading={pending === 'again'} onClick={findAnother}><Search size={18} aria-hidden /> Find another ride</Button>
          )}
        </div>
      </div>
    );
  }

  const windowClass = !started ? ' idle' : timeUp ? ' over' : remaining <= RIDE_CONFIG.reminderLeadSeconds * 1000 ? ' warn' : '';
  const headline = everyoneHere
    ? { text: 'Everyone is at pickup', tone: 'brand' }
    : timeUp ? { text: 'Time’s up', tone: 'danger' }
    : active.some((m) => m.pickupStatus === 'delayed') ? { text: 'Someone is delayed', tone: 'accent' }
    : !started ? { text: 'Waiting for the first landing', tone: '' }
    : { text: `${active.filter((m) => m.pickupStatus === 'at_pickup').length} of ${active.length} at pickup`, tone: '' };

  return (
    <>
      {reminder && <ReminderBanner reminder={reminder} remaining={remaining} deadline={ride.waitingDeadline} onDismiss={dismiss} />}

      <PageHeading eyebrow="After landing · Your ride" title={<>Meet your <em>co-passengers</em>.</>}>
        You, {others.map((m) => m.displayName).join(' and ')}: one cab from Cochin Airport. Tap where you are as you go and the others see it straight away.
      </PageHeading>
      <JourneySteps current={2} />

      <section className="workspace meet-layout">
        <div className="stack">
          <section className={`result-card window-card${windowClass}`} aria-labelledby="window-title" style={{ maxWidth: 'none' }}>
            <div className="tags" style={{ marginBottom: '0.9rem' }}>
              <span role="status"><Tag tone={headline.tone}>{headline.text}</Tag></span>
              {ride.status === 'proposed' && waitingFor.length > 0 && <Tag tone="plain">Waiting for {waitingFor.map((m) => m.displayName).join(' & ')} to say yes</Tag>}
            </div>
            <dl className="status-board">
              <div>
                <dt id="window-title">{started ? 'Time left to meet' : 'Pickup window'}</dt>
                <dd className="big-value tabnum countdown-value" role="timer">{started ? (timeUp ? '00:00' : fmtCountdown(remaining)) : `${RIDE_CONFIG.pickupWindowMinutes}:00`}</dd>
              </div>
              <div>
                <dt>{started ? 'Ends at' : 'Starts'}</dt>
                <dd className="big-value tabnum" style={{ fontSize: '1.9rem' }}>{started ? fmtTime(ride.waitingDeadline) : 'On landing'}</dd>
              </div>
              <div>
                <dt>Your share</dt>
                <dd className="big-value tabnum" style={{ fontSize: '1.9rem' }}>{formatINR(me.fareShare)}</dd>
              </div>
            </dl>
            <div className="status-meta">
              <a className="text-button" style={{ minHeight: 0 }} href={googleMapsSearchUrl(`${airport?.name ?? ride.airportCode} arrivals taxi pickup`)} target="_blank" rel="noreferrer">
                <Navigation size={15} aria-hidden /> {ride.pickupPoint}
              </a>
            </div>
          </section>

          {error && <Note tone="danger" role="alert">{error}</Note>}

          <section className="input-card meet-action" aria-labelledby="action-title">
            {timeUp && !everyoneHere ? (
              <>
                <p className="eyebrow"><Timer size={14} aria-hidden style={{ display: 'inline', verticalAlign: '-2px' }} /> Window ended</p>
                <h2 id="action-title">{notHere.length ? `${notHere.map((m) => m.displayName).join(' and ')} ${notHere.length === 1 ? 'isn’t' : 'aren’t'} here yet.` : 'Time’s up.'}</h2>
                <div className="decision">
                  <Button loading={pending === 'depart'} onClick={() => act('depart', () => rides.setRideStatus(ride, 'departed'))}><CarFront size={18} aria-hidden /> Leave with who’s here</Button>
                  <Button variant="secondary" loading={pending === 'extend'} onClick={() => act('extend', () => rides.extendWindow(ride, RIDE_CONFIG.extendByMinutes))}>Wait {RIDE_CONFIG.extendByMinutes} more min</Button>
                </div>
              </>
            ) : everyoneHere ? (
              <>
                <p className="eyebrow">All together</p>
                <h2 id="action-title">Everyone’s here.</h2>
                <p>Book the cab together and head off.</p>
                <Button block className="big-button" loading={pending === 'depart'} onClick={() => act('depart', () => rides.setRideStatus(ride, 'departed'))}><CarFront size={20} aria-hidden /> We’ve left together</Button>
              </>
            ) : !meLanded ? (
              <>
                <p className="eyebrow">Your next step</p>
                <h2 id="action-title">Off the plane?</h2>
                <p>Tap when your flight is on the ground. {started ? '' : `This starts everyone’s ${RIDE_CONFIG.pickupWindowMinutes}-minute window.`}</p>
                <Button block className="big-button" loading={pending === 'landed'} onClick={() => act('landed', () => rides.updateMyStatus(ride, 'landed'))}>
                  <PlaneLanding size={22} aria-hidden /> I’ve landed
                </Button>
              </>
            ) : (
              <>
                <p className="eyebrow">Your status</p>
                <h2 id="action-title">What are you doing now?</h2>
                <div className="doing" role="group" aria-labelledby="action-title">
                  {NOW_DOING.map(([s, label, Icon]) => (
                    <Button key={s} variant="secondary" className="doing-option" disabled={!!pending} aria-pressed={me.pickupStatus === s} onClick={() => act(s, () => rides.updateMyStatus(ride, s))}>
                      <Icon size={20} aria-hidden /> {label}
                    </Button>
                  ))}
                </div>
              </>
            )}

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
          </section>
        </div>

        <aside className="quick-panel" aria-label="Where everyone is">
          <div>
            <p className="eyebrow">Where everyone is</p>
            <AirportMap members={active} />
          </div>
          <div>
            <h3 style={{ marginBottom: '0.7rem' }}><Users size={16} aria-hidden style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Who’s riding</h3>
            <ul className="who-list">
              {active.map((m) => (
                <li key={m.id}>
                  <Avatar name={m.displayName} me={m.isMe} small />
                  <span className="who-name">{m.isMe ? 'You' : m.displayName}<span className="who-dest">to {m.destinationName}</span></span>
                  <span className={`who-status${m.pickupStatus === 'delayed' ? ' late' : m.pickupStatus === 'at_pickup' ? ' here' : ''}`}>{statusText(m)}</span>
                </li>
              ))}
            </ul>
          </div>
          {ride.option?.stops?.length > 0 && airport && (
            <>
              <div className="divider" />
              <div>
                <p className="eyebrow">The cab route</p>
                <RouteMap
                  airport={airport}
                  stops={ride.option.stops}
                  myStop={ride.option.stops.find((s) => s.riders.includes(me.displayName)) || null}
                  myDestination={state.trip?.destinationLat != null ? { lat: state.trip.destinationLat, lng: state.trip.destinationLng } : null}
                />
              </div>
            </>
          )}
        </aside>
      </section>

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
    </>
  );
}
