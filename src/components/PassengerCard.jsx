import { Check, Luggage, MapPin, PlaneLanding, Plus } from 'lucide-react';
import { Badge } from './ui.jsx';
import { PREFERENCES } from '../data/config.js';
import { formatINR } from '../utils/fareCalculation.js';
import { fmtTime, relativeMinutes } from '../utils/timeFormatting.js';

function matchLabel(score) {
  if (score >= 75) return { text: 'Great match', tone: 'teal' };
  if (score >= 60) return { text: 'Good match', tone: 'sky' };
  return { text: 'Fair match', tone: 'neutral' };
}

export function Avatar({ name, tone = 'bg-sky-soft text-sky', size = 'size-11' }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full font-bold ${tone}`} aria-hidden>
      {name?.[0]?.toUpperCase() || '?'}
    </span>
  );
}

export function PassengerCard({ match, myArrival, selected, onToggle, disabledReason }) {
  const { trip, score, reasons, estimatedSavings } = match;
  const diff = relativeMinutes(myArrival, trip.arrivalTime);
  const label = matchLabel(score);
  const disabled = !selected && !!disabledReason;

  return (
    <article className={`card rise overflow-hidden transition ${selected ? 'border-teal ring-1 ring-teal' : ''} ${disabled ? 'opacity-70' : ''}`}>
      <div className="flex gap-3 p-4">
        <Avatar name={trip.displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[17px] font-bold">{trip.displayName}</h3>
            <Badge tone={label.tone}>{label.text}</Badge>
          </div>
          <dl className="mt-1.5 grid gap-1 text-[13px] text-ink-2">
            <div className="flex items-center gap-1.5">
              <PlaneLanding className="size-3.5 text-mute" aria-hidden />
              <dt className="sr-only">Arrival</dt>
              <dd>
                Lands {fmtTime(trip.arrivalTime)}{' '}
                <span className="text-mute">({diff === 0 ? 'same time as you' : `${Math.abs(diff)} min ${diff > 0 ? 'after' : 'before'} you`})</span>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-mute" aria-hidden />
              <dt className="sr-only">Destination</dt>
              <dd>{trip.destinationName}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Luggage className="size-3.5 text-mute" aria-hidden />
              <dt className="sr-only">Bags and preference</dt>
              <dd>{trip.luggageCount} {trip.luggageCount === 1 ? 'bag' : 'bags'} · prefers {PREFERENCES[trip.preference].label}</dd>
            </div>
          </dl>
        </div>
      </div>
      <ul className="grid gap-1 border-t border-line/70 px-4 py-3 text-[13px] text-ink-2">
        {reasons.map((r) => (
          <li key={r} className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-teal" aria-hidden />
            {r}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 bg-sand/60 px-4 py-3">
        <p className="text-[13px] leading-tight">
          <span className="font-bold text-teal-deep">Save ~{formatINR(estimatedSavings)}</span>
          <span className="block text-mute">vs. a solo cab · estimate</span>
        </p>
        <button
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={selected}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold transition disabled:cursor-not-allowed ${selected ? 'bg-teal text-white' : 'border border-line bg-white text-ink hover:border-teal'}`}
        >
          {selected ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {selected ? 'Added' : 'Ride together'}
        </button>
      </div>
      {disabled && <p className="bg-amber-soft px-4 py-2 text-[12.5px] text-amber">{disabledReason}</p>}
    </article>
  );
}
