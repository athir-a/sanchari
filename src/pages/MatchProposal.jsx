import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Check, X, Search, Pencil, Wallet, Scale, CarFront, TrainFront, Bus, Bike, Footprints, Sparkles } from 'lucide-react';
import { Button, Note, PageHeading, JourneySteps, Tag, TextButton, useDocumentTitle } from '../components/ui.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { RouteMap } from '../components/RouteMap.jsx';
import { useAppState } from '../state/AppState.jsx';
import { getCandidateTrips } from '../services/tripService.js';
import { IS_LIVE } from '../services/supabaseClient.js';
import * as rides from '../services/rideService.js';
import { proposeGroup } from '../utils/matching.js';
import { formatINR, soloDirect } from '../utils/fareCalculation.js';
import { fmtTime } from '../utils/timeFormatting.js';
import { PREFERENCES, RIDE_CONFIG } from '../data/config.js';
import { getAirport } from '../data/airports.js';

const KINDS = ['cheapest', 'balanced', 'direct'];
const KIND_ICON = { cheapest: Wallet, balanced: Scale, direct: CarFront };
const MODE_ICON = { Metro: TrainFront, Bus, Auto: Bike, Walk: Footprints };
const MODE_LABEL = { Bus: 'KSRTC bus' };

/** A proposal Sanchari worked out on this device (nobody has accepted yet). */
function fromLocal(trip, p) {
  const { proposed } = rides.planTimes([trip, ...p.others]);
  const o = p.option;
  return {
    source: 'local',
    riders: [trip, ...p.others].map((t) => ({ id: t.id, name: t.displayName, destination: t.destinationName, isMe: t.id === trip.id, confirmed: false, reasons: p.reasons[t.id] || [] })),
    kind: o.kind,
    myShare: o.perPerson,
    soloFare: o.soloFare,
    vehicle: o.vehicle,
    stops: o.stops,
    dropArrangement: o.dropArrangement,
    durationMinutes: o.durationMinutes,
    detourMinutes: o.detourMinutes,
    leaveAround: proposed,
    pickupPoint: o.pickupPoint,
    compare: KINDS.map((k) => {
      const x = p.options.find((y) => y.kind === k);
      return { kind: k, available: !!x?.available, cost: x?.perPerson ?? null, onward: x?.modes?.[1] ?? null, vehicle: x?.vehicle, reason: x?.unavailableReason };
    }),
  };
}

/** A proposal someone in the group already accepted (stored ride, status "proposed"). */
function fromStored(trip, ride) {
  const me = ride.members.find((m) => m.isMe);
  const compare = ride.option?.compare || {};
  return {
    source: 'stored',
    ride,
    riders: ride.members.filter((m) => m.pickupStatus !== 'left').map((m) => ({ id: m.tripId, name: m.displayName, destination: m.destinationName, isMe: m.isMe, confirmed: m.confirmed, reasons: [] })),
    kind: ride.selectedPreference,
    myShare: me?.fareShare,
    soloFare: soloDirect(trip).fare,
    vehicle: ride.option?.vehicle,
    stops: ride.option?.stops || [],
    dropArrangement: null,
    durationMinutes: null,
    detourMinutes: null,
    leaveAround: ride.proposedDepartureTime,
    pickupPoint: ride.pickupPoint,
    compare: KINDS.map((k) => ({
      kind: k, available: !!compare[k]?.available, cost: compare[k]?.shares?.[trip.id] ?? null,
      onward: compare[k]?.onward?.[trip.id] ?? null, vehicle: compare[k]?.vehicle,
    })),
  };
}

export default function MatchProposal() {
  useDocumentTitle('Your shared ride');
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const { trip, declined } = state;
  const [view, setView] = useState(undefined); // undefined loading · null nobody yet · object proposal
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const proposal = useRef(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#fares' && view) document.getElementById('fares')?.scrollIntoView({ block: 'start' });
  }, [hash, view]);
  const acting = useRef(false);

  const load = useCallback(async () => {
    if (!trip || acting.current) return;
    try {
      // Someone may already have put us in a ride.
      const existing = await rides.findRideForTrip(trip.id);
      if (existing) {
        if (existing.confirmed) {
          update({ activeRideId: existing.id });
          navigate('/ride', { replace: true });
          return;
        }
        const ride = await rides.getRide(existing.id, trip.id);
        if (ride) {
          proposal.current = null;
          setView(fromStored(trip, ride));
          setError('');
          return;
        }
      }
      const candidates = await getCandidateTrips(trip, 30);
      const p = proposeGroup(trip, candidates, { exclude: declined });
      proposal.current = p;
      setView(p ? fromLocal(trip, p) : null);
      setError('');
    } catch (e) {
      setError(e.message);
      setView((v) => (v === undefined ? null : v));
    }
  }, [trip, declined, update, navigate]);

  useEffect(() => {
    load();
    if (!IS_LIVE) return undefined;
    // Other travellers can join or accept at any moment.
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  const riderIds = useMemo(() => (view ? view.riders.filter((r) => !r.isMe).map((r) => r.id) : []), [view]);

  if (!trip) return <Navigate to="/" replace />;

  async function accept() {
    if (acting.current || !view) return;
    acting.current = true;
    setBusy('accept');
    setError('');
    try {
      const ride = view.source === 'stored'
        ? await rides.confirmMembership(view.ride)
        : await rides.createRide({ me: trip, others: proposal.current.others, option: proposal.current.option, options: proposal.current.options });
      update({ activeRideId: ride.id });
      navigate('/ride', { replace: true });
    } catch (e) {
      setError(e.message);
      acting.current = false;
      setBusy(null);
      load();
    }
  }

  async function decline() {
    if (acting.current || !view) return;
    acting.current = true;
    setBusy('decline');
    try {
      if (view.source === 'stored') await rides.leaveRide(view.ride);
      update((s) => ({ declined: [...new Set([...(s.declined || []), ...riderIds])] }));
      setView(undefined);
    } catch (e) {
      setError(e.message);
    } finally {
      acting.current = false;
      setBusy(null);
    }
  }

  if (view === undefined) {
    return (
      <div className="stack narrow" style={{ paddingTop: '3rem' }} aria-busy="true" aria-label="Finding your ride">
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  if (view === null) {
    return (
      <div>
        <PageHeading eyebrow="Step 02 · Matches" title={<>Travellers on <em>your</em> route.</>}>
          People landing at {trip.airportCode} around {fmtTime(trip.arrivalTime)} whose drop-off is near yours or along the way to {trip.destinationName}. Sanchari groups you automatically.
        </PageHeading>
        <JourneySteps current={1} />
        {error && <Note tone="danger" role="alert">{error}</Note>}
        <div className="result-card empty">
          <span className="icon-box accent"><Search size={22} aria-hidden /></span>
          <h2>No one fits your route yet.</h2>
          <p>Travellers need to be out of the airport within 30 minutes of you and heading towards {trip.destinationName} or along the way.</p>
          {IS_LIVE && <p className="small" role="status">Sanchari checks for new travellers every 10 seconds and will show your ride here.</p>}
          <div className="button-row">
            <Button variant="secondary" onClick={() => navigate('/#plan')}><Pencil size={18} aria-hidden /> Change destination</Button>
          </div>
        </div>
      </div>
    );
  }

  const others = view.riders.filter((r) => !r.isMe);
  const names = others.map((r) => r.name);
  const nameList = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  const savings = view.soloFare != null && view.myShare != null ? Math.max(0, view.soloFare - view.myShare) : 0;
  const airport = getAirport(trip.airportCode);
  const myStop = view.stops.find((s) => s.riders.includes(trip.displayName)) || null;
  const myDestination = trip.destinationLat != null ? { lat: trip.destinationLat, lng: trip.destinationLng } : null;
  const KindIcon = KIND_ICON[view.kind] || CarFront;

  return (
    <>
      <PageHeading eyebrow="Step 02 · Your matched ride" title={<>Ride with <em>{nameList}</em>.</>}>
        {others.length === 1 ? 'They land' : 'They all land'} around your time and {others.length === 1 ? 'is' : 'are'} going your way. Sanchari put this ride together for you. Have a look and say if you’re in.
      </PageHeading>
      <JourneySteps current={1} />

      <section className="workspace">
        <div className="stack">
          <div className="result-card proposal" style={{ maxWidth: 'none' }}>
            <div className="tags">
              <Tag tone="brand"><KindIcon size={13} aria-hidden style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />{PREFERENCES[view.kind]?.label ?? 'Shared'} ride</Tag>
              <Tag tone="plain">{view.riders.length} riders{view.vehicle ? ` · ${view.vehicle}` : ''}</Tag>
              {view.kind === trip.preference && <Tag tone="accent">Your preference</Tag>}
            </div>
            <dl className="summary-list">
              <div>
                <dt>Riders</dt>
                <dd>
                  <ul className="rider-row">
                    {view.riders.map((r) => (
                      <li key={r.id}>
                        <Avatar name={r.name} me={r.isMe} small />
                        <span>
                          <strong>{r.isMe ? 'You' : r.name}</strong>
                          <span className="muted small d-block">to {r.destination}{!r.isMe && r.confirmed ? ' · said yes' : ''}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt>Meet at</dt>
                <dd>{view.pickupPoint}<p>{airport?.name}</p></dd>
              </div>
              <div>
                <dt>Leave around</dt>
                <dd className="tabnum">{fmtTime(view.leaveAround)}<p>Your {RIDE_CONFIG.pickupWindowMinutes}-minute pickup window starts when the first of you lands.</p></dd>
              </div>
              <div>
                <dt>Drop-off order</dt>
                <dd>
                  <ol className="stop-list">
                    {view.stops.map((s, i) => (
                      <li key={s.name + i}>
                        <span className="step-num">{i + 1}</span>
                        <span>{s.name} <span className="muted">· {s.riders.map((n) => (n === trip.displayName ? 'you' : n)).join(', ')}</span></span>
                      </li>
                    ))}
                  </ol>
                  {view.dropArrangement && <p style={{ marginTop: '0.5rem' }}>{view.dropArrangement}</p>}
                </dd>
              </div>
              <div>
                <dt>Your share</dt>
                <dd>
                  <span className="price tabnum">{formatINR(view.myShare)}</span>
                  <p style={{ marginTop: '0.4rem' }}>
                    {savings > 0 ? `${formatINR(savings)} less than a cab on your own (${formatINR(view.soloFare)})` : 'About the same as a cab on your own'}
                  </p>
                </dd>
              </div>
            </dl>

            {error && <Note tone="danger" role="alert">{error}</Note>}

            <div className="decision">
              <Button loading={busy === 'accept'} disabled={!!busy} onClick={accept}><Check size={18} aria-hidden /> I’m in</Button>
              <Button variant="secondary" loading={busy === 'decline'} disabled={!!busy} onClick={decline}><X size={18} aria-hidden /> Not for me</Button>
            </div>
            <p className="small muted">No cab is booked and nothing is paid here. You book together at the pickup point and split it as shown.</p>
          </div>

          <section id="fares" aria-labelledby="compare-heading" style={{ scrollMarginTop: '1.5rem' }}>
            <h3 id="compare-heading" style={{ marginBottom: '0.8rem' }}>Compare fares</h3>
            <div className="compare-grid">
              {view.compare.map((c) => {
                const Icon = KIND_ICON[c.kind];
                const Onward = c.onward ? MODE_ICON[c.onward] : null;
                const chosen = c.kind === view.kind;
                return (
                  <article key={c.kind} className={`card compare-card${chosen ? ' is-selected' : ''}${c.available ? '' : ' is-unavailable'}`}>
                    <div className="compare-head">
                      <span className={`icon-box${c.available ? '' : ' accent'}`}><Icon size={20} aria-hidden /></span>
                      <div>
                        <h3>{PREFERENCES[c.kind].label}</h3>
                        {chosen && <Tag tone="brand">This ride</Tag>}
                      </div>
                    </div>
                    <p className="price tabnum" style={{ fontSize: '1.9rem' }}>{c.available && c.cost != null ? formatINR(c.cost) : '—'}</p>
                    <p className="modes small">
                      <CarFront size={15} aria-hidden /> Shared cab
                      {Onward && <><span className="arrow" aria-hidden>→</span><Onward size={15} aria-hidden /> {MODE_LABEL[c.onward] || c.onward}</>}
                    </p>
                    <p className="small muted">{c.available ? PREFERENCES[c.kind].short : (c.reason || 'Not possible for this group.')}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="quick-panel" aria-label="Your trip and route">
          <div>
            <p className="eyebrow">Your trip</p>
            <h3>{trip.airportCode} → {trip.destinationName}</h3>
            <p className="small">
              {trip.flight?.designator ? `${trip.flight.designator} · ` : ''}lands {fmtTime(trip.arrivalTime)} IST
            </p>
            <p className="small">{trip.luggageCount} {trip.luggageCount === 1 ? 'bag' : 'bags'} · {PREFERENCES[trip.preference].label}{trip.maxBudget ? ` · up to ${formatINR(trip.maxBudget)}` : ''}</p>
            <TextButton onClick={() => navigate('/#plan')}>Edit trip details</TextButton>
          </div>
          <div className="divider" />
          <div>
            <p className="eyebrow">The route</p>
            <h3 style={{ marginBottom: '0.9rem' }}>{airport?.code ?? 'COK'} → {view.stops.map((s) => s.name).join(' → ')}</h3>
            <RouteMap airport={airport} stops={view.stops} myStop={myStop} myDestination={myDestination} />
          </div>
          {others.some((r) => r.reasons.length) && (
            <>
              <div className="divider" />
              <div>
                <h3 style={{ marginBottom: '0.6rem' }}><Sparkles size={16} aria-hidden style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Why this group</h3>
                <ul className="check-list compact">
                  {others.map((r) => r.reasons.length > 0 && (
                    <li key={r.id}><strong>{r.name}</strong>: {r.reasons.slice(0, 3).join(' · ')}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
          <div className="divider" />
          <div className="note">Fares and times are estimates from fixed assumptions and straight-line distances × 1.35, not live taxi quotes.</div>
        </aside>
      </section>
    </>
  );
}
