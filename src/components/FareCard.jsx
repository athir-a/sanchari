import { CarFront, TrainFront, Footprints, Bike, Check, ExternalLink, Ban } from 'lucide-react';
import { Badge } from './ui.jsx';
import { formatINR } from '../utils/fareCalculation.js';
import { fmtDuration } from '../utils/timeFormatting.js';

const MODE_ICON = { 'Shared cab': CarFront, Metro: TrainFront, 'Metro + Bus': TrainFront, Bus: TrainFront, 'Local train': TrainFront, Auto: Bike, Walk: Footprints };

function Stat({ label, value, sub }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-mute">{label}</dt>
      <dd className="tabnum mt-0.5 text-[15px] font-bold text-ink">{value}</dd>
      {sub && <dd className="text-[12px] text-mute">{sub}</dd>}
    </div>
  );
}

export function FareCard({ option, selected, recommended, onSelect, riders }) {
  const o = option;
  return (
    <article
      className={`card rise relative overflow-hidden transition ${selected ? 'border-teal ring-2 ring-teal' : ''} ${o.available ? '' : 'opacity-75'}`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={!o.available}
        onClick={onSelect}
        className="block w-full p-4 text-left disabled:cursor-not-allowed"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">{o.label}</h3>
              {selected && <Badge tone="teal"><Check className="size-3" aria-hidden /> Selected</Badge>}
              {recommended && o.available && !selected && <Badge tone="sky">Your preference</Badge>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
              {o.modes.map((m, i) => {
                const Icon = MODE_ICON[m] || CarFront;
                return (
                  <span key={m} className="inline-flex items-center gap-1">
                    {i > 0 && <span className="text-faint">→</span>}
                    <Icon className="size-4 text-mute" aria-hidden /> {m}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="text-right">
            <p className="tabnum display text-[26px] leading-none text-ink">{formatINR(o.perPerson)}</p>
            <p className="mt-1 text-[12px] text-mute">your share · est.</p>
          </div>
        </div>

        {o.available ? (
          <>
            <p className="mt-3 text-[13.5px] leading-snug text-ink-2">{o.dropArrangement}</p>
            <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-line/70 pt-3">
              <Stat label="Your trip" value={fmtDuration(o.durationMinutes)} sub={o.detourMinutes ? `+${o.detourMinutes} min detour` : 'No detour'} />
              <Stat label="Transfers" value={o.transfers} sub={o.transfers ? 'after the cab' : 'door to door'} />
              <Stat label="You save" value={formatINR(Math.max(0, o.savings))} sub={`vs ${formatINR(o.soloFare)} solo`} />
            </dl>
            <p className="mt-3 text-[12px] text-mute">
              Group total {formatINR(o.totalCost)} · cab {formatINR(o.cabFare)} ÷ {riders} ({o.vehicle}) + onward fares · pickup at {o.pickupPoint}
            </p>
          </>
        ) : (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-soft p-2.5 text-[13px] text-amber">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden /> {o.unavailableReason}
          </p>
        )}
      </button>
      {o.available && (
        <a
          href={o.mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[44px] items-center gap-1.5 border-t border-line/70 px-4 text-[13px] font-bold text-sky hover:bg-sky-soft/50"
        >
          <ExternalLink className="size-4" aria-hidden /> View cab route in Maps
        </a>
      )}
    </article>
  );
}
