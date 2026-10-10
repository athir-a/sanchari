import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { Button, PageHeading, JourneySteps, useDocumentTitle } from '../components/ui.jsx';
import { OptionCard } from '../components/OptionCard.jsx';
import { useAppState } from '../state/AppState.jsx';
import { buildRideOptions } from '../utils/fareCalculation.js';

export default function RideComparison() {
  useDocumentTitle('Compare fare options');
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const { trip, selected } = state;

  const options = useMemo(() => (trip && selected.length ? buildRideOptions(trip, selected) : []), [trip, selected]);

  if (!trip) return <Navigate to="/" replace />;
  if (!selected.length) return <Navigate to="/matches" replace />;

  const fallback = options.find((o) => o.id === trip.preference && o.available) || options.find((o) => o.available);
  const current = options.find((o) => o.id === state.optionKind && o.available) || fallback;
  const names = selected.map((s) => s.displayName);

  return (
    <>
      <PageHeading eyebrow="Step 03 · Fare options" title={<>Three ways to <em>share</em> the ride.</>}>
        For you, {names.slice(0, -1).join(', ')}{names.length > 1 ? ' and ' : ''}{names[names.length - 1]} from {trip.airportCode}. Each fare is your share,
        with the cab split by the distance each rider travels.
      </PageHeading>
      <JourneySteps current={2} />

      <div className="problem-grid" role="radiogroup" aria-label="Journey options">
        {options.map((o) => (
          <OptionCard
            key={o.id}
            option={o}
            riders={selected.length + 1}
            selected={current?.id === o.id}
            recommended={o.id === trip.preference}
            onSelect={() => update({ optionKind: o.id })}
          />
        ))}
      </div>

      <div className="quiet-note" style={{ marginTop: '1.8rem' }}>
        <span className="icon-box"><Info size={22} aria-hidden /></span>
        <p>Fares and times are estimates from fixed assumptions and straight-line distances × 1.35 — not live taxi quotes, bus timetables or traffic.</p>
      </div>

      <div className="button-row" style={{ marginTop: '1.8rem', justifyContent: 'space-between' }}>
        <Button variant="secondary" onClick={() => navigate('/matches')}>
          <ArrowLeft size={18} aria-hidden /> Back to matches
        </Button>
        <Button disabled={!current} onClick={() => { update({ optionKind: current.id }); navigate('/confirm'); }}>
          {current ? `Continue with ${current.label}` : 'No option fits this group'} {current && <ArrowRight size={18} aria-hidden />}
        </Button>
      </div>
    </>
  );
}
