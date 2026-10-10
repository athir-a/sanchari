import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CarFront, Luggage, MapPin, PartyPopper, Timer, Footprints, LogOut, Plus, ExternalLink, PlaneLanding } from 'lucide-react';
import { Button, Note, PageHeading, TextButton, useDocumentTitle } from '../components/ui.jsx';
import { RideStatusCard, JourneyChecklist, MemberList, UpdatesFeed } from '../components/RideStatus.jsx';
import { useNow, useDeadlineReminder, ReminderBanner } from '../components/Countdown.jsx';
import { FlightPanel } from '../components/FlightPanel.jsx';
import { useAppState } from '../state/AppState.jsx';
import { IS_LIVE } from '../services/supabaseClient.js';
import * as rides from '../services/rideService.js';
import { RIDE_CONFIG } from '../data/config.js';
import { fmtTime } from '../utils/timeFormatting.js';
import { formatINR } from '../utils/fareCalculation.js';

const NEXT = {
  not_landed: { status: 'landed', label: 'I’ve landed', question: 'Off the plane?', icon: PlaneLanding, hint: 'Tap when your flight is on the ground. Sanchari never assumes this from the clock.' },
  landed: { status: 'collecting_luggage', label: 'I’m collecting my baggage', question: 'At the belt?', icon: Luggage, hint: 'Tap when you reach baggage claim.' },
  collecting_luggage: { status: 'walking', label: 'I’m walking to the pickup point', question: 'Got your bags?', icon: Footprints, hint: 'Tap once you have your bags.' },
  delayed: { status: 'walking', label: 'I’m walking to the pickup point', question: 'On your way now?', icon: Footprints, hint: 'Tap once you’re on your way.' },
  walking: { status: 'at_pickup', label: 'I’m at the pickup point', question: 'Reached the pickup area?', icon: MapPin, hint: 'Tap when you reach the pickup area.' },
};

const STATUS_BUTTONS = [
  ['landed', 'Flight landed', PlaneLanding],
  ['collecting_luggage', 'Collecting baggage', Luggage],
  ['walking', 'Walking to pickup', Footprints],
  ['at_pickup', 'Ready for pickup', MapPin],
];

export default function RideCoordination() {
  useDocumentTitle('Your ride');
  const { state, update, resetJourney } = useAppState();
  const navigate = useNavigate();
  const now = useNow(1000);
  const [ride, setRide] = useState(undefined); // undefined = loading, null = not found
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [showDelay, setShowDelay] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
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

  const onFlight = useCallback(
    async (snap) => {
      update((s) => (s.trip ? { trip: { ...s.trip, flight: { ...s.trip.flight, ...snap } } } : {}));
      try {
        const current = await rides.getRide(rideId, myTripId);
        if (current) {
          const next = await rides.recordMyFlight(current, snap);
          if (next) setRide(next);
        }
      } catch {
        /* the panel already shows the new times */
      }
    },
    [update, rideId, myTripId],
  );
  const { reminder, remaining, dismiss } = useDeadlineReminder(ride, now, !!ride && !closed);

  const act = useCallback(async (name, fn) => {
    if (busy.current) return;
    busy.current = true;
    setPending(name);
    setError('');
    try {
      const next = await fn();
      if (next) setRide(next);
    } catch (e) {
      setError(e.message);
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, []);

  if (ride === undefined) {
    return (
      <div className="stack" style={{ paddingTop: '3rem' }} aria-busy="true" aria-label="Loading your ride">
        <div className="skeleton" style={{ height: 260 }} />
        <div className="skeleton" />
      </div>
    );
  }

  if (!ride) {
    return (
      <>
        <PageHeading eyebrow="Your ride" title="No active ride.">
          {error || 'Plan your arrival to find travellers to share a cab with.'}
        </PageHeading>
        <Button onClick={() => { update({ activeRideId: null }); navigate('/'); }}>Plan a trip</Button>
      </>
    );
  }

  const me = ride.members.find((m) => m.isMe);
  const others = ride.members.filter((m) => !m.isMe && m.pickupStatus !== 'left');
  const notHere = others.filter((m) => m.pickupStatus !== 'at_pickup');
  const delayed = ride.members.filter((m) => m.pickupStatus === 'delayed');
  const maxDelay = Math.max(0, ...delayed.map((m) => m.delayMinutes || 0));
  const deadlinePassed = remaining <= 0;
  const next = NEXT[me.pickupStatus];
  const activeCount = ride.members.filter((m) => m.pickupStatus !== 'left').length;

  const startNew = () => {
    resetJourney(true);
    navigate('/');
  };

  return (
    <>
      {reminder && !closed && <ReminderBanner reminder={reminder} remaining={remaining} deadline={ride.waitingDeadline} onDismiss={dismiss} />}

      <PageHeading eyebrow="After landing · Your ride" title={closed ? (ride.status === 'departed' ? <>You’re on <em>your way</em>.</> : 'This ride was cancelled.') : <>Meet your <em>co-passengers</em>.</>}>
        {closed
          ? ride.status === 'departed'
            ? `Your estimated share is ${formatINR(me.fareShare)}. Settle the split with your co-passengers.`
            : 'You can plan a new trip any time.'
          : `${activeCount} riders · ${ride.routeSummary}`}
      </PageHeading>

      <RideStatusCard ride={ride} now={now} />

      <div className="stack" style={{ marginTop: '1.4rem' }}>
        {ride.persistWarning && <Note tone="accent">{ride.persistWarning}</Note>}
        {error && <Note tone="danger" title="That didn’t go through" role="alert">{error}</Note>}

        {IS_LIVE && !me.confirmed && me.pickupStatus !== 'left' && !closed && (
          <div className="quiet-note">
            <span className="icon-box"><CarFront size={22} aria-hidden /></span>
            <div style={{ flex: 1 }}>
              <p><strong>You’ve been added to this shared ride.</strong> Confirm so the others know you’re coming.</p>
              <div className="button-row" style={{ marginTop: '0.8rem' }}>
                <Button loading={pending === 'confirm'} onClick={() => act('confirm', () => rides.confirmMembership(ride))}>Confirm I’m in</Button>
                <Button variant="secondary" onClick={() => act('leave', () => rides.leaveRide(ride))}>Decline</Button>
              </div>
            </div>
          </div>
        )}

        {!closed && deadlinePassed && (
          <section className="result-card alert" style={{ maxWidth: 'none' }}>
            <p className="eyebrow"><Timer size={14} aria-hidden style={{ display: 'inline', verticalAlign: '-2px' }} /> Waiting window ended</p>
            <h2>Time to decide.</h2>
            <p style={{ marginTop: '0.4rem' }}>
              {notHere.length ? `${notHere.map((m) => m.displayName).join(', ')} ${notHere.length === 1 ? 'isn’t' : 'aren’t'} at the pickup point yet.` : 'Everyone is at the pickup point.'}
            </p>
            <div className="button-row" style={{ marginTop: '1.2rem' }}>
              <Button loading={pending === 'depart'} onClick={() => act('depart', () => rides.setRideStatus(ride, 'departed'))}>Leave with who’s here</Button>
              <Button variant="secondary" loading={pending === 'extend'} onClick={() => act('extend', () => rides.shiftDeparture(ride, RIDE_CONFIG.extendByMinutes))}>
                Wait {RIDE_CONFIG.extendByMinutes} more minutes
              </Button>
            </div>
          </section>
        )}

        {!closed && !deadlinePassed && delayed.length > 0 && (
          <div className="note accent" role="status">
            <strong>
              <AlertTriangle size={15} aria-hidden style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              {delayed.map((m) => (m.isMe ? 'You need' : `${m.displayName} needs`)).join(', ')} about {maxDelay} more min.
            </strong>{' '}
            Departure is still {fmtTime(ride.proposedDepartureTime)}.{' '}
            <TextButton style={{ color: 'var(--accent)', minHeight: 0 }} disabled={!!pending} onClick={() => act('shift', () => rides.shiftDeparture(ride, maxDelay))}>
              Push departure by {maxDelay} min
            </TextButton>
          </div>
        )}
      </div>

      <section className="workspace" style={{ marginTop: '1.8rem' }}>
        <div className="stack">
          {!closed ? (
            <div className="input-card">
              {next ? (
                <>
                  <p className="eyebrow">Your next step</p>
                  <h2>{next.question}</h2>
                  <p style={{ margin: '0.3rem 0 1.2rem' }}>{next.hint}</p>
                  <Button block loading={pending === next.status} onClick={() => act(next.status, () => rides.updateMyStatus(ride, next.status))}>
                    <next.icon size={18} aria-hidden /> {next.label}
                  </Button>
                </>
              ) : (
                <>
                  <p className="eyebrow">You’re at the pickup point</p>
                  <h2>{notHere.length ? 'Waiting for the others.' : 'Everyone’s here.'}</h2>
                  <p style={{ margin: '0.3rem 0 1.2rem' }}>
                    {notHere.length ? `Still to arrive: ${notHere.map((m) => m.displayName).join(', ')}.` : 'Book the cab together and head off.'}
                  </p>
                  <Button block loading={pending === 'depart'} onClick={() => act('depart', () => rides.setRideStatus(ride, 'departed'))}>
                    <CarFront size={18} aria-hidden /> We’ve left together
                  </Button>
                </>
              )}

              <div className="form-section" style={{ marginTop: '1.6rem' }}>
                <h3 id="status-label">Or set your status</h3>
                <div className="status-grid" role="group" aria-labelledby="status-label">
                  {STATUS_BUTTONS.map(([s, label, Icon]) => (
                    <Button key={s} variant="secondary" disabled={!!pending} aria-pressed={me.pickupStatus === s} onClick={() => act(s, () => rides.updateMyStatus(ride, s))}>
                      <Icon size={18} aria-hidden /> {label}
                    </Button>
                  ))}
                  <Button variant="warning" disabled={!!pending} aria-expanded={showDelay} aria-pressed={me.pickupStatus === 'delayed'} onClick={() => setShowDelay((v) => !v)}>
                    <AlertTriangle size={18} aria-hidden /> I need more time
                  </Button>
                </div>
                {showDelay && (
                  <div className="note accent delay-picker">
                    <span>I need about</span>
                    {[10, 20, 30].map((m) => (
                      <Button key={m} variant="secondary" disabled={!!pending} onClick={() => { setShowDelay(false); act('delay', () => rides.updateMyStatus(ride, 'delayed', m)); }}>
                        {m} min
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="input-card stack-sm">
              <span className={`icon-box${ride.status === 'departed' ? '' : ' accent'}`}>
                {ride.status === 'departed' ? <PartyPopper size={22} aria-hidden /> : <LogOut size={22} aria-hidden />}
              </span>
              <h2>{ride.status === 'departed' ? 'Have a good ride.' : 'Ride cancelled.'}</h2>
              <div className="button-row">
                <Button onClick={startNew}><Plus size={18} aria-hidden /> Plan another trip</Button>
                {ride.status === 'departed' && ride.option?.mapsUrl && (
                  <a className="button secondary" href={ride.option.mapsUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={18} aria-hidden /> Open route in Maps
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="input-card">
            <p className="eyebrow">The plan</p>
            <JourneyChecklist ride={ride} />
          </div>

          <details className="disclosure">
            <summary>Testing tools — reminder and demo controls<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <div className="stack-sm">
                <h3>Test the 2-minute reminder</h3>
                <p className="small">Sets a real stored deadline. The reminder fires once when 2:00 remain — reloading won’t repeat it.</p>
                <div className="button-row">
                  <Button variant="secondary" disabled={closed || !!pending} onClick={() => act('t1', () => rides.setDeadlineFromNow(ride, 130))}>Deadline in 2:10</Button>
                  <Button variant="secondary" disabled={closed || !!pending} onClick={() => act('t2', () => rides.setDeadlineFromNow(ride, 20))}>Deadline in 0:20</Button>
                </div>
                <p className="small">
                  Vibration: {typeof navigator !== 'undefined' && 'vibrate' in navigator ? 'available in this browser (Android browsers usually allow it after you’ve tapped the page)' : 'not available in this browser — you’ll see the on-screen alert only'}. A web page can’t vibrate or notify while it’s closed or in the background.
                </p>
              </div>
              {!IS_LIVE && (
                <div className="stack-sm form-section">
                  <h3>Simulate co-passengers (demo)</h3>
                  <div className="button-row">
                    <Button variant="secondary" disabled={closed || !!pending || !others.some((m) => m.pickupStatus !== 'at_pickup')} onClick={() => act('sim', () => rides.simulateProgress(ride))}>
                      <PlaneLanding size={18} aria-hidden /> Advance someone
                    </Button>
                    <Button variant="secondary" disabled={closed || !!pending || !others.some((m) => !['at_pickup', 'delayed'].includes(m.pickupStatus))} onClick={() => act('simd', () => rides.simulateDelay(ride))}>
                      <AlertTriangle size={18} aria-hidden /> Someone’s delayed
                    </Button>
                  </div>
                  <p className="small">Demo co-passengers only change when you use these controls — Sanchari never assumes someone has arrived.</p>
                </div>
              )}
            </div>
          </details>
        </div>

        <aside className="quick-panel" aria-label="Your flight, riders and updates">
          <div>
            <p className="eyebrow">Your flight</p>
            <FlightPanel trip={state.trip} ride={ride} onFlight={onFlight} busy={!!pending} onProposeShift={(m) => act('shift', () => rides.shiftDeparture(ride, m))} />
          </div>
          <div className="divider" />
          <div>
            <p className="eyebrow">Who’s riding</p>
            <MemberList ride={ride} now={now} />
          </div>
          <div className="divider" />
          <div>
            <h3>Updates</h3>
            <UpdatesFeed updates={ride.updates} now={now} />
          </div>
          {!closed && (
            <>
              <div className="divider" />
              {confirmLeave ? (
                <div className="stack-sm">
                  <p className="small">Leave this ride? Your co-passengers will see that you left.</p>
                  <div className="button-row">
                    <Button variant="secondary" onClick={() => setConfirmLeave(false)}>Keep my seat</Button>
                    <Button variant="warning" loading={pending === 'leave'} onClick={() => act('leave', () => rides.leaveRide(ride))}>
                      <LogOut size={18} aria-hidden /> Yes, leave
                    </Button>
                  </div>
                </div>
              ) : (
                <TextButton danger disabled={!!pending} onClick={() => setConfirmLeave(true)}>
                  <LogOut size={15} aria-hidden /> I can’t continue — leave this ride
                </TextButton>
              )}
            </>
          )}
        </aside>
      </section>
    </>
  );
}
