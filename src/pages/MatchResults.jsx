import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, MapPinned, RefreshCw, SearchX, Sparkles, ChevronDown } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { Button, Notice } from '../components/ui.jsx';
import { PassengerCard } from '../components/PassengerCard.jsx';
import { useAppState } from '../state/AppState.jsx';
import { getCandidateTrips, saveTrip } from '../services/tripService.js';
import { IS_LIVE } from '../services/supabaseClient.js';
import { findCompatiblePassengers, canJoinGroup } from '../utils/matching.js';
import { MATCHING_CONFIG, PREFERENCES } from '../data/config.js';
import { DEMO_TRIP } from '../data/demoPassengers.js';
import { tripFromForm } from '../utils/trip.js';
import { fmtDateTime } from '../utils/timeFormatting.js';

export default function MatchResults() {
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const { trip, arrivalWindow, selected } = state;
  const [candidates, setCandidates] = useState(null);
  const [error, setError] = useState('');
  const [showRejected, setShowRejected] = useState(false);

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

  return (
    <AppShell
      step={1}
      back="/"
      title="Travellers near you"
      footer={
        <Button size="lg" className="w-full" disabled={!selected.length} onClick={() => navigate('/compare')}>
          {selected.length ? `Compare options · ${selected.length + 1} riders` : 'Add someone to ride with'}
          {selected.length > 0 && <ArrowRight className="size-5" aria-hidden />}
        </Button>
      }
    >
      <section className="card mb-4 flex items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1 text-[13px] leading-snug">
          <p className="font-bold text-ink">{trip.airportCode} → {trip.destinationName}</p>
          <p className="text-mute">
            Lands {fmtDateTime(trip.arrivalTime)} · {trip.luggageCount} bags · {PREFERENCES[trip.preference].label}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate('/')}>Edit</Button>
      </section>

      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
          <Clock className="size-4 text-mute" aria-hidden /> Landing within ±{arrivalWindow} min
        </p>
        <button
          className="min-h-[40px] rounded-xl px-3 text-[13px] font-bold text-teal hover:bg-teal-soft"
          onClick={() => setWindow(widened ? MATCHING_CONFIG.arrivalWindowMinutes : MATCHING_CONFIG.widenedArrivalWindowMinutes)}
        >
          {widened ? `Back to ±${MATCHING_CONFIG.arrivalWindowMinutes}` : `Widen to ±${MATCHING_CONFIG.widenedArrivalWindowMinutes}`}
        </button>
      </div>

      {error && (
        <Notice tone="rose" title="Couldn’t load travellers" className="mb-4">
          {error}{' '}
          <button className="font-bold underline" onClick={load}>Try again</button>
        </Notice>
      )}

      {!result && !error && (
        <div className="grid gap-3" aria-busy="true" aria-label="Finding travellers">
          {[0, 1].map((i) => <div key={i} className="card h-40 animate-pulse bg-white/60" />)}
        </div>
      )}

      {result && result.matches.length > 0 && (
        <>
          <p className="mb-3 text-[15px] text-ink-2">
            <span className="font-bold text-ink">{result.matches.length} {result.matches.length === 1 ? 'traveller fits' : 'travellers fit'}</span> your route. Add one or more.
          </p>
          <div className="grid gap-3">
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
          </div>
        </>
      )}

      {result && result.matches.length === 0 && (
        <div className="card rise p-6 text-center">
          <SearchX className="mx-auto size-10 text-faint" aria-hidden />
          <h2 className="mt-3 text-lg font-bold">No one fits your route yet</h2>
          <p className="mt-1 text-[14px] text-mute">Travellers need to land within ±{arrivalWindow} min and head near {trip.destinationName}.</p>
          <div className="mt-5 grid gap-2">
            {!widened && (
              <Button variant="primary" onClick={() => setWindow(MATCHING_CONFIG.widenedArrivalWindowMinutes)}>
                <RefreshCw className="size-4" aria-hidden /> Widen to ±{MATCHING_CONFIG.widenedArrivalWindowMinutes} min
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/')}>
              <MapPinned className="size-4" aria-hidden /> Change destination
            </Button>
            {!IS_LIVE && (
              <Button variant="ghost" onClick={loadDemoTrip}>
                <Sparkles className="size-4 text-amber" aria-hidden /> View demo matches
              </Button>
            )}
          </div>
        </div>
      )}

      {result && sameAirportRejected.length > 0 && (
        <section className="mt-6">
          <button
            className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-1 text-left text-[13px] font-bold text-mute"
            onClick={() => setShowRejected((v) => !v)}
            aria-expanded={showRejected}
          >
            Not matched ({sameAirportRejected.length}) — see why
            <ChevronDown className={`size-4 transition ${showRejected ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {showRejected && (
            <ul className="card mt-1 divide-y divide-line/70 text-[13px]">
              {sameAirportRejected.map((r) => (
                <li key={r.trip.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="font-semibold">{r.trip.displayName}</span>
                  <span className="text-right text-mute">{r.reason}</span>
                </li>
              ))}
              {otherAirport > 0 && <li className="px-4 py-2.5 text-mute">{otherAirport} more land at other airports.</li>}
            </ul>
          )}
        </section>
      )}
    </AppShell>
  );
}
