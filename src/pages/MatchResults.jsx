import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, MapPinned, RefreshCw, SearchX, Sparkles } from 'lucide-react';
import { Button, Note, PageHeading, JourneySteps, TextButton, useDocumentTitle } from '../components/ui.jsx';
import { PassengerCard, Avatar } from '../components/PassengerCard.jsx';
import { useAppState } from '../state/AppState.jsx';
import { getCandidateTrips, saveTrip } from '../services/tripService.js';
import { IS_LIVE } from '../services/supabaseClient.js';
import { findCompatiblePassengers, canJoinGroup } from '../utils/matching.js';
import { MATCHING_CONFIG, PREFERENCES } from '../data/config.js';
import { DEMO_TRIP } from '../data/demoPassengers.js';
import { tripFromForm } from '../utils/trip.js';
import { fmtDateTime } from '../utils/timeFormatting.js';

export default function MatchResults() {
  useDocumentTitle('Travellers on your route');
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const { trip, arrivalWindow, selected } = state;
  const [candidates, setCandidates] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!trip) return;
    setError('');
    setCandidates(null);
    try {
      setCandidates(await getCandidateTrips(trip, arrivalWindow));
    } catch (e) {
      setError(e.message);
    }
  }, [trip, arrivalWindow]);

  useEffect(() => {
    load();
  }, [load]);

  const result = useMemo(
    () => (candidates && trip ? findCompatiblePassengers(trip, candidates, { arrivalWindowMinutes: arrivalWindow }) : null),
    [candidates, trip, arrivalWindow],
  );

  // Drop selections that are no longer valid matches (e.g. after narrowing the window).
  useEffect(() => {
    if (!result) return;
    const ids = new Set(result.matches.map((m) => m.trip.id));
    if (selected.some((s) => !ids.has(s.id))) update({ selected: selected.filter((s) => ids.has(s.id)) });
  }, [result, selected, update]);

  if (!trip) return <Navigate to="/" replace />;

  const toggle = (t) => {
    const isSel = selected.some((s) => s.id === t.id);
    update({ selected: isSel ? selected.filter((s) => s.id !== t.id) : [...selected, t], optionKind: null });
  };

  const widened = arrivalWindow > MATCHING_CONFIG.arrivalWindowMinutes;
  const setWindow = (w) => update({ arrivalWindow: w, optionKind: null });

  const loadDemoTrip = async () => {
    const form = { ...DEMO_TRIP, arrivalLocal: state.form.arrivalLocal };
    const saved = await saveTrip(tripFromForm(form), trip.id);
    update({ form, trip: saved, selected: [], arrivalWindow: MATCHING_CONFIG.arrivalWindowMinutes });
  };

  const sameAirportRejected = result?.rejected.filter((r) => r.code !== 'airport') ?? [];
  const otherAirport = result ? result.rejected.length - sameAirportRejected.length : 0;
  const count = result?.matches.length ?? 0;

  return (
    <>
      <PageHeading eyebrow="Step 02 · Matches" title={<>Travellers on <em>your</em> route.</>}>
        People landing at {trip.airportCode} within ±{arrivalWindow} minutes of you whose drop-off is near yours or along the way to {trip.destinationName}.
      </PageHeading>
      <JourneySteps current={1} />

      <section className="workspace">
        <div className="stack" aria-live="polite">
          {error && (
            <Note tone="danger" title="Couldn’t load travellers" role="alert">
              {error} <TextButton onClick={load}>Try again</TextButton>
            </Note>
          )}

          {!result && !error && (
            <div className="stack" aria-busy="true" aria-label="Finding travellers">
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          )}

          {result && count > 0 && (
            <>
              <p style={{ color: 'var(--ink)' }}>
                <strong>{count} {count === 1 ? 'traveller fits' : 'travellers fit'}</strong> your route, best match first. Add one or more.
              </p>
              {result.matches.map((m) => {
                const isSel = selected.some((s) => s.id === m.trip.id);
                const others = selected.filter((s) => s.id !== m.trip.id);
                const check = isSel ? { ok: true } : canJoinGroup(trip, others, m.trip);
                return (
                  <PassengerCard
                    key={m.trip.id}
                    match={m}
                    myArrival={trip.arrivalTime}
                    selected={isSel}
                    onToggle={() => toggle(m.trip)}
                    disabledReason={check.ok ? null : check.reason}
                  />
                );
              })}
            </>
          )}

          {result && count === 0 && (
            <div className="result-card empty">
              <span className="icon-box accent"><SearchX size={22} aria-hidden /></span>
              <h2>No one fits your route yet.</h2>
              <p>Travellers need to land within ±{arrivalWindow} minutes of you and be heading towards {trip.destinationName} or along the way.</p>
              <div className="button-row">
                {!widened && (
                  <Button onClick={() => setWindow(MATCHING_CONFIG.widenedArrivalWindowMinutes)}>
                    <RefreshCw size={18} aria-hidden /> Widen to ±{MATCHING_CONFIG.widenedArrivalWindowMinutes} min
                  </Button>
                )}
                <Button variant="secondary" onClick={() => navigate('/')}>
                  <MapPinned size={18} aria-hidden /> Change destination
                </Button>
                {!IS_LIVE && (
                  <Button variant="secondary" onClick={loadDemoTrip}>
                    <Sparkles size={18} aria-hidden /> View demo matches
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="quick-panel" aria-label="Your trip and selection">
          <div>
            <p className="eyebrow">Your trip</p>
            <h3>{trip.airportCode} → {trip.destinationName}</h3>
            <p className="small">Lands {fmtDateTime(trip.arrivalTime)} · {trip.luggageCount} bags · {PREFERENCES[trip.preference].label} · up to {trip.maxDetourMinutes} min detour</p>
            <TextButton onClick={() => navigate('/')}>Edit trip details</TextButton>
          </div>
          <div className="divider" />
          <div>
            <h3>Arrival window</h3>
            <p className="small">Showing travellers landing within ±{arrivalWindow} minutes of you.</p>
            <TextButton onClick={() => setWindow(widened ? MATCHING_CONFIG.arrivalWindowMinutes : MATCHING_CONFIG.widenedArrivalWindowMinutes)}>
              {widened ? `Narrow back to ±${MATCHING_CONFIG.arrivalWindowMinutes} min` : `Widen to ±${MATCHING_CONFIG.widenedArrivalWindowMinutes} min`}
            </TextButton>
          </div>
          <div className="divider" />
          <div className="stack-sm">
            <h3>Your ride so far</h3>
            {selected.length ? (
              <ul className="member-list">
                <li><Avatar name={trip.displayName} me small /><span className="who"><span className="name">You</span><p>to {trip.destinationName}</p></span></li>
                {selected.map((s) => (
                  <li key={s.id}><Avatar name={s.displayName} small /><span className="who"><span className="name">{s.displayName}</span><p>to {s.destinationName}</p></span></li>
                ))}
              </ul>
            ) : (
              <p className="small">Choose “Ride together” on anyone you’d like to share with.</p>
            )}
            <Button block disabled={!selected.length} onClick={() => navigate('/compare')}>
              Compare fare options <ArrowRight size={18} aria-hidden />
            </Button>
          </div>

          {result && sameAirportRejected.length > 0 && (
            <details className="disclosure">
              <summary>Not matched ({sameAirportRejected.length}) — see why<span className="plus" aria-hidden>+</span></summary>
              <div className="disclosure-body">
                <ul className="feed">
                  {sameAirportRejected.map((r) => (
                    <li key={r.trip.id} style={{ gridTemplateColumns: '5.5rem 1fr' }}>
                      <strong>{r.trip.displayName}</strong>
                      <span className="muted">{r.reason}</span>
                    </li>
                  ))}
                </ul>
                {otherAirport > 0 && <p className="small">{otherAirport} more {otherAirport === 1 ? 'traveller lands' : 'travellers land'} at other airports.</p>}
              </div>
            </details>
          )}
        </aside>
      </section>
    </>
  );
}
