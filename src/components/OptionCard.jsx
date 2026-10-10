import { CarFront, TrainFront, Bus, Footprints, Bike, Wallet, Scale, ExternalLink } from 'lucide-react';
import { Tag } from './ui.jsx';
import { formatINR } from '../utils/fareCalculation.js';
import { fmtDuration } from '../utils/timeFormatting.js';

const MODE_ICON = { 'Shared cab': CarFront, Metro: TrainFront, Bus, Auto: Bike, Walk: Footprints };
const MODE_LABEL = { Bus: 'KSRTC bus' };
const KIND_ICON = { cheapest: Wallet, balanced: Scale, direct: CarFront };

export function OptionCard({ option, selected, recommended, onSelect, riders }) {
  const o = option;
  const KindIcon = KIND_ICON[o.kind];
  const classes = ['card', o.available ? 'interactive' : 'is-unavailable', selected ? 'is-selected' : ''].join(' ');

  return (
    <article className={classes}>
      <div
        className="option-select"
        role="radio"
        aria-checked={selected}
        aria-disabled={!o.available}
        tabIndex={o.available ? 0 : -1}
        onClick={() => o.available && onSelect()}
        onKeyDown={(e) => {
          if (o.available && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onSelect();
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <span className={`icon-box${o.available ? '' : ' accent'}`}><KindIcon size={22} aria-hidden /></span>
          <div>
            <h3>{o.label}</h3>
            <div className="tags">
              {selected && <Tag tone="brand">Selected</Tag>}
              {recommended && <Tag tone="accent">Your preference</Tag>}
              {!o.available && <Tag tone="danger">Not available</Tag>}
            </div>
          </div>
        </div>

        {o.available ? (
          <div>
            <p className="price tabnum">{formatINR(o.perPerson)}</p>
            <p className="price-note">your estimated share</p>
          </div>
        ) : (
          <div>
            <p className="price" aria-hidden>—</p>
            <p className="price-note">not offered for this group</p>
          </div>
        )}

        <div className="modes">
          {o.modes.map((m, i) => {
            const Icon = MODE_ICON[m] || CarFront;
            return (
              <span key={m}>
                {i > 0 && <span className="arrow" aria-hidden>→</span>}
                <Icon size={16} aria-hidden /> {MODE_LABEL[m] || m}
              </span>
            );
          })}
        </div>

        {o.available ? (
          <>
            <p className="small">{o.dropArrangement}</p>
            <dl className="facts">
              <div><dt>Your trip</dt><dd>{fmtDuration(o.durationMinutes)}<small>{o.detourMinutes ? `+${o.detourMinutes} min detour` : 'no detour'}</small></dd></div>
              <div><dt>Transfers</dt><dd>{o.transfers}<small>{o.transfers ? 'after the cab' : 'door to door'}</small></dd></div>
              <div><dt>You save</dt><dd>{formatINR(Math.max(0, o.savings))}<small>vs {formatINR(o.soloFare)} solo</small></dd></div>
            </dl>
            <p className="small muted">
              Group total {formatINR(o.totalCost)} · cab {formatINR(o.cabFare)} for {riders} riders ({o.vehicle}), split by distance shared.
            </p>
          </>
        ) : (
          <p className="note accent">{o.unavailableReason}</p>
        )}
      </div>
      {o.available && (
        <a href={o.mapsUrl} target="_blank" rel="noreferrer" className="text-button" style={{ marginTop: '0.6rem' }}>
          <ExternalLink size={15} aria-hidden /> View cab route in Google Maps
        </a>
      )}
    </article>
  );
}
