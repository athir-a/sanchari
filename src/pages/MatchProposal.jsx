import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, X, Search, Pencil } from 'lucide-react';
import { Button, Note, PageHeading, TextButton, useDocumentTitle } from '../components/ui.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { useAppState } from '../state/AppState.jsx';
import { getCandidateTrips } from '../services/tripService.js';
import { IS_LIVE } from '../services/supabaseClient.js';
import * as rides from '../services/rideService.js';
import { proposeGroup } from '../utils/matching.js';
import { formatINR, soloDirect } from '../utils/fareCalculation.js';
import { readyAt } from '../utils/readiness.js';
import { fmtTime } from '../utils/timeFormatting.js';
import { PREFERENCES } from '../data/config.js';
import { getAirport } from '../data/airports.js';

const KINDS = ['cheapest', 'balanced', 'direct'];

/** A proposal Sanchari worked out on this device (nobody has accepted yet). */
function fromLocal(trip, p) {
  const { proposed } = rides.planTimes([trip, ...p.others]);
  return {
    source: 'local',
    riders: [trip, ...p.others].map((t) => ({ id: t.id, name: t.displayName, destination: t.destinationName, isMe: t.id === trip.id, readyAt: readyAt(t), confirmed: false })),
    kind: p.option.kind,
    myShare: p.option.perPerson,
    soloFare: p.option.soloFare,
    vehicle: p.option.vehicle,
    stops: p.option.stops,
    leaveAround: proposed,
    pickupPoint: p.option.pickupPoint,
    compare: KINDS.map((k) => {
      const o = p.options.find((x) => x.kind === k);
      return { kind: k, available: !!o?.available, cost: o?.perPerson ?? null };
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
    riders: ride.members.filter((m) => m.pickupStatus !== 'left').map((m) => ({ id: m.tripId, name: m.displayName, destination: m.destinationName, isMe: m.isMe, readyAt: null, confirmed: m.confirmed })),
    kind: ride.selectedPreference,
    myShare: me?.fareShare,
    soloFare: soloDirect(trip).fare,
    vehicle: ride.option?.vehicle,
    stops: ride.option?.stops || [],
    leaveAround: ride.proposedDepartureTime,
    pickupPoint: ride.pickupPoint,
    compare: KINDS.map((k) => ({ kind: k, available: !!compare[k]?.available, cost: compare[k]?.shares?.[trip.id] ?? null })),
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
      <div className="narrow">
        <PageHeading eyebrow="Finding your ride" title={<>Looking for travellers <em>on your road</em>.</>}>
          Nobody landing around {fmtTime(trip.arrivalTime)} is heading towards {trip.destinationName} yet.
          {IS_LIVE ? ' Keep this page open. Your ride appears here as soon as someone matches.' : ''}
        </PageHeading>
        {error && <Note tone="danger" role="alert">{error}</Note>}
        <div className="result-card empty">
          <span className="icon-box"><Search size={22} aria-hidden /></span>
          <p>You’ll be matched with people who are out of the airport within 30 minutes of you and going the same way.</p>
          <Button variant="secondary" onClick={() => navigate('/#plan')}><Pencil size={18} aria-hidden /> Change my trip</Button>
        </div>
      </div>
    );
  }

  const others = view.riders.filter((r) => !r.isMe);
  const names = others.map((r) => r.name);
  const nameList = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  const savings = view.soloFare != null && view.myShare != null ? Math.max(0, view.soloFare - view.myShare) : 0;
  const alternatives = view.compare.filter((c) => c.kind !== view.kind);

  return (
    <div className="narrow">
      <PageHeading eyebrow="Your shared ride" title={<>Ride with <em>{nameList}</em>.</>}>
        {others.length === 1 ? 'They land' : 'They all land'} around your time and are going your way.
      </PageHeading>

      <section className="result-card proposal" aria-labelledby="share-title">
        <ul className="rider-row">
          {view.riders.map((r) => (
            <li key={r.id}>
              <Avatar name={r.name} me={r.isMe} />
              <span>
                <strong>{r.isMe ? 'You' : r.name}</strong>
                <span className="muted small d-block">to {r.destination}{!r.isMe && r.confirmed ? ' · in' : ''}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="share-line">
          <div>
            <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>{PREFERENCES[view.kind]?.label ?? 'Shared'} · your share</p>
            <p id="share-title" className="price tabnum">{formatINR(view.myShare)}</p>
            {savings > 0 && <p className="price-note">{formatINR(savings)} less than a cab on your own</p>}
          </div>
        </div>

        <dl className="ride-facts">
          <div><dt>Meet at</dt><dd>{view.pickupPoint}</dd></div>
          <div><dt>Leave around</dt><dd className="tabnum">{fmtTime(view.leaveAround)}</dd></div>
          <div>
            <dt>Route</dt>
            <dd>
              <ol className="mini-route">
                <li>{getAirport(trip.airportCode)?.code ?? 'COK'}</li>
                {view.stops.map((s, i) => (
                  <li key={s.name + i}>{s.name} <span className="muted">· {s.riders.map((n) => (n === trip.displayName ? 'you' : n)).join(', ')}</span></li>
                ))}
              </ol>
            </dd>
          </div>
        </dl>

        <details className="disclosure compare">
          <summary>Compare fares<span className="plus" aria-hidden>+</span></summary>
          <div className="disclosure-body">
            <ul className="compare-list">
              {alternatives.map((c) => (
                <li key={c.kind}>
                  <span>{PREFERENCES[c.kind].label}</span>
                  <span className="tabnum">{c.available && c.cost != null ? formatINR(c.cost) : 'Not possible for this group'}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>

        {error && <Note tone="danger" role="alert">{error}</Note>}

        <div className="decision">
          <Button loading={busy === 'accept'} disabled={!!busy} onClick={accept}><Check size={18} aria-hidden /> I’m in</Button>
          <Button variant="secondary" loading={busy === 'decline'} disabled={!!busy} onClick={decline}><X size={18} aria-hidden /> Not for me</Button>
        </div>
        <p className="small muted">No cab is booked and nothing is paid here. You book together at the pickup point.</p>
      </section>

      <TextButton onClick={() => navigate('/#plan')}><Pencil size={15} aria-hidden /> Change my trip</TextButton>
    </div>
  );
}
