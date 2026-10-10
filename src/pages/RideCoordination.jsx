import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CarFront, ChevronDown, FlaskConical, Luggage, MapPin, PartyPopper, PlaneLanding, Timer, Footprints, LogOut, Plus, ExternalLink } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { Button, Notice } from '../components/ui.jsx';
import { RideHero, JourneySteps, MemberList, UpdatesFeed } from '../components/RideStatus.jsx';
import { useNow, useDeadlineReminder, ReminderBanner } from '../components/Countdown.jsx';
import { useAppState } from '../state/AppState.jsx';
import { IS_LIVE } from '../services/supabaseClient.js';
import * as rides from '../services/rideService.js';
import { RIDE_CONFIG } from '../data/config.js';
import { fmtTime } from '../utils/timeFormatting.js';
import { formatINR } from '../utils/fareCalculation.js';

const NEXT = {
  not_landed: { status: 'collecting_luggage', label: 'I’ve landed · collecting luggage', icon: Luggage, hint: 'Tap when you’re off the plane.' },
  collecting_luggage: { status: 'walking', label: 'I’m walking to pickup', icon: Footprints, hint: 'Tap once you have your bags.' },
  delayed: { status: 'walking', label: 'I’m walking to pickup', icon: Footprints, hint: 'Tap once you’re on your way.' },
  walking: { status: 'at_pickup', label: 'I’m at the pickup point', icon: MapPin, hint: 'Tap when you reach the pickup bay.' },
};

function Section({ title, children, action }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function RideCoordination() {
  const { state, update, resetJourney } = useAppState();
  const navigate = useNavigate();
  const now = useNow(1000);
  const [ride, setRide] = useState(undefined); // undefined = loading, null = not found
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [showDelay, setShowDelay] = useState(false);
  const [showTools, setShowTools] = useState(false);
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
      <AppShell>
        <div className="grid gap-3" aria-busy="true"><div className="h-64 animate-pulse rounded-[28px] bg-ink/10" /><div className="card h-40 animate-pulse" /></div>
      </AppShell>
    );
  }

  if (!ride) {
    return (
      <AppShell>
        <div className="card p-6 text-center">
          <CarFront className="mx-auto size-10 text-faint" aria-hidden />
          <h1 className="mt-3 text-lg font-bold">No active ride</h1>
          <p className="mt-1 text-[14px] text-mute">{error || 'Plan your arrival to find people to share a cab with.'}</p>
          <Button className="mt-5 w-full" onClick={() => { update({ activeRideId: null }); navigate('/'); }}>Plan a trip</Button>
        </div>
      </AppShell>
    );
  }

  const me = ride.members.find((m) => m.isMe);
  const others = ride.members.filter((m) => !m.isMe && m.pickupStatus !== 'left');
  const notHere = others.filter((m) => m.pickupStatus !== 'at_pickup');
  const delayed = ride.members.filter((m) => m.pickupStatus === 'delayed');
  const maxDelay = Math.max(0, ...delayed.map((m) => m.delayMinutes || 0));
  const deadlinePassed = remaining <= 0;
  const next = NEXT[me.pickupStatus];

  const startNew = () => {
    resetJourney(true);
    navigate('/');
  };

  return (
    <AppShell>
      <RideHero ride={ride} now={now} />

      {ride.persistWarning && <Notice tone="amber" className="mt-4">{ride.persistWarning}</Notice>}
      {error && <Notice tone="rose" className="mt-4" title="That didn’t go through">{error}</Notice>}

      <div className="mt-4">
        {reminder && !closed && <ReminderBanner reminder={reminder} remaining={remaining} deadline={ride.waitingDeadline} onDismiss={dismiss} />}

        {IS_LIVE && !me.confirmed && me.pickupStatus !== 'left' && !closed && (
          <Notice tone="sky" title="You’ve been added to this shared ride" className="mb-4">
            <div className="mt-2 flex gap-2">
              <Button size="sm" loading={pending === 'confirm'} onClick={() => act('confirm', () => rides.confirmMembership(ride))}>Confirm I’m in</Button>
              <Button size="sm" variant="secondary" onClick={() => act('leave', () => rides.leaveRide(ride))}>Decline</Button>
            </div>
          </Notice>
        )}

        {/* Waiting window ended */}
        {!closed && deadlinePassed && (
          <section className="rise mb-4 rounded-3xl border border-rose/25 bg-rose-soft p-4">
            <p className="flex items-center gap-2 font-bold text-rose"><Timer className="size-5" aria-hidden /> The waiting window has ended</p>
            <p className="mt-1 text-[14px] text-ink-2">
              {notHere.length ? `${notHere.map((m) => m.displayName).join(', ')} ${notHere.length === 1 ? 'isn’t' : 'aren’t'} at the pickup point yet.` : 'Everyone is at the pickup point.'}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="sm" loading={pending === 'depart'} onClick={() => act('depart', () => rides.setRideStatus(ride, 'departed'))}>Leave with who’s here</Button>
              <Button size="sm" variant="secondary" loading={pending === 'extend'} onClick={() => act('extend', () => rides.shiftDeparture(ride, RIDE_CONFIG.extendByMinutes))}>Wait {RIDE_CONFIG.extendByMinutes} more min</Button>
            </div>
          </section>
        )}

        {/* Someone is delayed */}
        {!closed && !deadlinePassed && delayed.length > 0 && (
          <Notice tone="amber" icon={AlertTriangle} className="mb-4" title={delayed.map((m) => (m.isMe ? 'You are' : `${m.displayName} is`)).join(', ') + ` delayed ~${maxDelay} min`}>
            Departure is still {fmtTime(ride.proposedDepartureTime)}.{' '}
            <button className="font-bold underline underline-offset-2" disabled={!!pending} onClick={() => act('shift', () => rides.shiftDeparture(ride, maxDelay))}>
              Push departure +{maxDelay} min
            </button>
          </Notice>
        )}

        {/* Primary next action */}
        {!closed && (
          <section className="card p-4">
            {next ? (
              <>
                <p className="eyebrow">Your next step</p>
                <Button size="lg" className="mt-2 w-full" loading={pending === next.status} onClick={() => act(next.status, () => rides.updateMyStatus(ride, next.status))}>
                  <next.icon className="size-5" aria-hidden /> {next.label}
                </Button>
                <p className="mt-2 text-center text-[13px] text-mute">{next.hint}</p>
              </>
            ) : (
              <>
                <p className="eyebrow">You’re at the pickup point</p>
                <p className="mt-1 text-[14px] text-ink-2">
                  {notHere.length ? `Waiting for ${notHere.map((m) => m.displayName).join(', ')}.` : 'Everyone’s here. Book the cab together and head off.'}
                </p>
                <Button size="lg" className="mt-3 w-full" loading={pending === 'depart'} onClick={() => act('depart', () => rides.setRideStatus(ride, 'departed'))}>
                  <CarFront className="size-5" aria-hidden /> We’ve left together
                </Button>
              </>
            )}

            <div className="mt-4 border-t border-line/70 pt-3">
              <p className="mb-2 text-[12px] font-bold text-mute">Or set your status</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['collecting_luggage', 'Collecting luggage', Luggage],
                  ['walking', 'Walking to pickup', Footprints],
                  ['at_pickup', 'At pickup point', MapPin],
                ].map(([s, label, Icon]) => (
                  <button
                    key={s}
                    disabled={!!pending}
                    aria-pressed={me.pickupStatus === s}
                    onClick={() => act(s, () => rides.updateMyStatus(ride, s))}
                    className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition disabled:opacity-50 ${me.pickupStatus === s ? 'border-teal bg-teal text-white' : 'border-line bg-white text-ink-2 hover:border-teal'}`}
                  >
                    <Icon className="size-4" aria-hidden /> {label}
                  </button>
                ))}
                <button
                  disabled={!!pending}
                  aria-expanded={showDelay}
                  onClick={() => setShowDelay((v) => !v)}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition ${me.pickupStatus === 'delayed' ? 'border-amber bg-amber text-white' : 'border-amber/40 bg-amber-soft text-amber'}`}
                >
                  <AlertTriangle className="size-4" aria-hidden /> I’m delayed
                </button>
              </div>
              {showDelay && (
                <div className="rise mt-3 flex items-center gap-2 rounded-2xl bg-amber-soft p-2.5">
                  <span className="pl-1 text-[13px] font-semibold text-amber">By about</span>
                  {[10, 20, 30].map((m) => (
                    <Button key={m} size="sm" variant="secondary" disabled={!!pending} onClick={() => { setShowDelay(false); act('delay', () => rides.updateMyStatus(ride, 'delayed', m)); }}>
                      {m} min
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {closed && (
          <section className="card rise p-5 text-center">
            {ride.status === 'departed' ? <PartyPopper className="mx-auto size-10 text-teal" aria-hidden /> : <LogOut className="mx-auto size-10 text-rose" aria-hidden />}
            <h2 className="mt-2 text-lg font-bold">{ride.status === 'departed' ? 'You’re on your way' : 'This ride was cancelled'}</h2>
            <p className="mt-1 text-[14px] text-mute">
              {ride.status === 'departed' ? `Your estimated share is ${formatINR(me.fareShare)}. Settle the split with your co-passengers.` : 'You can plan a new trip any time.'}
            </p>
            <div className="mt-4 grid gap-2">
              {ride.status === 'departed' && ride.option?.mapsUrl && (
                <a href={ride.option.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-line bg-white font-semibold">
                  <ExternalLink className="size-4" aria-hidden /> Open route in Maps
                </a>
              )}
              <Button onClick={startNew}><Plus className="size-4" aria-hidden /> Plan another trip</Button>
            </div>
          </section>
        )}
      </div>

      <Section title="The plan">
        <JourneySteps ride={ride} />
      </Section>

      <Section title={`Who’s riding (${ride.members.filter((m) => m.pickupStatus !== 'left').length})`}>
        <MemberList ride={ride} now={now} />
        {ride.option && (
          <div className="mt-2 rounded-2xl bg-white/60 px-4 py-3 text-[13px] text-ink-2">
            <p className="font-semibold text-ink">{ride.option.label} route</p>
            <p className="mt-0.5">{ride.routeSummary}</p>
            {ride.option.mapsUrl && (
              <a className="mt-1.5 inline-flex min-h-[36px] items-center gap-1.5 font-bold text-sky" href={ride.option.mapsUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" aria-hidden /> Route in Maps
              </a>
            )}
          </div>
        )}
      </Section>

      <Section title="Updates">
        {ride.updates.length ? <UpdatesFeed updates={ride.updates} now={now} /> : <p className="text-[13px] text-mute">No updates yet.</p>}
        {!IS_LIVE && <p className="mt-3 text-[12px] text-faint">Demo co-passengers only change when you use the demo controls below.</p>}
      </Section>

      <Section title="Testing tools">
        <button
          className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-dashed border-line px-4 text-[13px] font-semibold text-ink-2"
          aria-expanded={showTools}
          onClick={() => setShowTools((v) => !v)}
        >
          <span className="inline-flex items-center gap-2"><FlaskConical className="size-4 text-amber" aria-hidden /> Reminder test & demo controls</span>
          <ChevronDown className={`size-4 transition ${showTools ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {showTools && (
          <div className="card rise mt-2 grid gap-3 p-4 text-[13px]">
            <div>
              <p className="font-bold">Test the 2-minute reminder</p>
              <p className="mt-0.5 text-mute">Sets a real stored deadline. The reminder fires once when 2:00 remain — reloading won’t repeat it.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" disabled={closed || !!pending} onClick={() => act('t1', () => rides.setDeadlineFromNow(ride, 130))}>Deadline in 2:10</Button>
                <Button size="sm" variant="secondary" disabled={closed || !!pending} onClick={() => act('t2', () => rides.setDeadlineFromNow(ride, 20))}>Deadline in 0:20</Button>
              </div>
              <p className="mt-2 text-faint">
                Vibration API: {typeof navigator !== 'undefined' && 'vibrate' in navigator ? 'available (Android browsers usually honour it after you’ve tapped the page)' : 'not available in this browser — you’ll get the on-screen alert only'}. A web page can’t vibrate or notify while it’s closed or in the background.
              </p>
            </div>
            {!IS_LIVE && (
              <div className="border-t border-line/70 pt-3">
                <p className="font-bold">Simulate co-passengers (demo)</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" disabled={closed || !!pending || !others.some((m) => m.pickupStatus !== 'at_pickup')} onClick={() => act('sim', () => rides.simulateProgress(ride))}>
                    <PlaneLanding className="size-4" aria-hidden /> Advance someone
                  </Button>
                  <Button size="sm" variant="secondary" disabled={closed || !!pending || !others.some((m) => !['at_pickup', 'delayed'].includes(m.pickupStatus))} onClick={() => act('simd', () => rides.simulateDelay(ride))}>
                    <AlertTriangle className="size-4" aria-hidden /> Someone’s delayed
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {!closed && (
        <div className="mt-6 flex items-center justify-between gap-2">
          <Link to="/" className="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-mute">
            Trip details <ArrowRight className="size-4" aria-hidden />
          </Link>
          {confirmLeave ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>Keep ride</Button>
              <Button size="sm" variant="danger" loading={pending === 'leave'} onClick={() => act('leave', () => rides.leaveRide(ride))}>
                <LogOut className="size-4" aria-hidden /> Yes, leave
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="danger" disabled={!!pending} onClick={() => setConfirmLeave(true)}>
              <LogOut className="size-4" aria-hidden /> Leave this ride
            </Button>
          )}
        </div>
      )}
    </AppShell>
  );
}
