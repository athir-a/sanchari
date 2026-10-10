import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { Button } from '../components/ui.jsx';
import { FareCard } from '../components/FareCard.jsx';
import { Avatar } from '../components/PassengerCard.jsx';
import { useAppState } from '../state/AppState.jsx';
import { buildRideOptions } from '../utils/fareCalculation.js';

export default function RideComparison() {
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const { trip, selected } = state;

  const options = useMemo(() => (trip && selected.length ? buildRideOptions(trip, selected) : []), [trip, selected]);

  if (!trip) return <Navigate to="/" replace />;
  if (!selected.length) return <Navigate to="/matches" replace />;

  const fallback = options.find((o) => o.id === trip.preference && o.available) || options.find((o) => o.available);
  const current = options.find((o) => o.id === state.optionKind && o.available) || fallback;

  return (
    <AppShell
      step={2}
      back="/matches"
      title="Compare journeys"
      footer={
        <Button size="lg" className="w-full" disabled={!current} onClick={() => { update({ optionKind: current.id }); navigate('/confirm'); }}>
          {current ? `Continue with ${current.label}` : 'No option fits this group'} {current && <ArrowRight className="size-5" aria-hidden />}
        </Button>
      }
    >
      <section className="mb-4 flex items-center gap-3">
        <div className="flex -space-x-2">
          <Avatar name={trip.displayName} tone="bg-teal text-white ring-2 ring-sand" size="size-10" />
          {selected.map((s) => <Avatar key={s.id} name={s.displayName} tone="bg-sky-soft text-sky ring-2 ring-sand" size="size-10" />)}
        </div>
        <p className="text-[14px] leading-snug text-ink-2">
          You{selected.map((s, i) => (i === selected.length - 1 ? ` & ${s.displayName}` : `, ${s.displayName}`))}
          <span className="block text-mute">{selected.length + 1} riders from {trip.airportCode}</span>
        </p>
      </section>

      <div role="radiogroup" aria-label="Journey options" className="grid gap-3">
        {options.map((o) => (
          <FareCard
            key={o.id}
            option={o}
            riders={selected.length + 1}
            selected={current?.id === o.id}
            recommended={o.id === trip.preference}
            onSelect={() => update({ optionKind: o.id })}
          />
        ))}
      </div>

      <p className="mt-4 flex gap-2 text-[12.5px] leading-snug text-mute">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        All fares and times are estimates from fixed assumptions (₹22/km cab, metro & auto tariffs) and straight-line distances — not live quotes or traffic.
      </p>
    </AppShell>
  );
}
