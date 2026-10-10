import { Check, Luggage, MapPin, PlaneLanding, Plus } from 'lucide-react';
import { Button, Tag } from './ui.jsx';
import { PREFERENCES } from '../data/config.js';
import { formatINR } from '../utils/fareCalculation.js';
import { fmtTime, relativeMinutes } from '../utils/timeFormatting.js';

function matchLabel(score) {
  if (score >= 75) return { text: 'Strong match', tone: '' };
  if (score >= 60) return { text: 'Good match', tone: 'plain' };
  return { text: 'Possible match', tone: 'plain' };
}

export function Avatar({ name, me = false, small = false }) {
  return (
    <span className={`avatar${me ? ' me' : ''}${small ? ' sm' : ''}`} aria-hidden>
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
    <article className={`card passenger${disabled ? ' is-unavailable' : ' interactive'}${selected ? ' is-selected' : ''}`} aria-label={`${trip.displayName}, ${label.text}`}>
      <div className="passenger-head">
        <Avatar name={trip.displayName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tags" style={{ alignItems: 'center' }}>
            <h3 style={{ marginRight: '0.3rem' }}>{trip.displayName}</h3>
            <Tag tone={label.tone}>{label.text}</Tag>
            <Tag tone="plain">Prefers {PREFERENCES[trip.preference].label}</Tag>
          </div>
          <div className="meta">
            <span><PlaneLanding size={15} aria-hidden /> Lands {fmtTime(trip.arrivalTime)} · {diff === 0 ? 'same time as you' : `${Math.abs(diff)} min ${diff > 0 ? 'after' : 'before'} you`}</span>
            <span><MapPin size={15} aria-hidden /> {trip.destinationName}</span>
            <span><Luggage size={15} aria-hidden /> {trip.luggageCount} {trip.luggageCount === 1 ? 'bag' : 'bags'}</span>
          </div>
        </div>
      </div>
      <ul className="check-list compact">
        {reasons.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <div className="passenger-foot">
        <p className="saving">
          <strong>Save ~{formatINR(estimatedSavings)}</strong>
          vs. a solo cab · estimate
        </p>
        <Button variant={selected ? 'primary' : 'secondary'} onClick={onToggle} disabled={disabled} aria-pressed={selected}>
          {selected ? <Check size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
          {selected ? 'Added to your ride' : 'Ride together'}
        </Button>
      </div>
      {disabled && <p className="note accent" style={{ fontSize: '0.86rem' }}>{disabledReason}</p>}
    </article>
  );
}
