import { Navigation, Users, Wallet, Route } from 'lucide-react';
import { Avatar } from './PassengerCard.jsx';
import { Tag } from './ui.jsx';
import { STATUS_LABEL } from '../services/rideService.js';
import { formatINR } from '../utils/fareCalculation.js';
import { fmtCountdown, fmtTime, timeAgo, fmtAirportTime } from '../utils/timeFormatting.js';
import { googleMapsSearchUrl } from '../utils/geo.js';
import { getAirport } from '../data/airports.js';

export function rideHeadline(ride, now) {
  const active = ride.members.filter((m) => m.pickupStatus !== 'left');
  const atPickup = active.filter((m) => m.pickupStatus === 'at_pickup').length;
  if (ride.status === 'departed') return { text: 'Departed', tone: 'brand' };
  if (ride.status === 'cancelled') return { text: 'Cancelled', tone: 'danger' };
  if (atPickup === active.length) return { text: 'Everyone is at pickup', tone: 'brand' };
  if (new Date(ride.waitingDeadline).getTime() <= now) return { text: 'Waiting window over', tone: 'danger' };
  if (active.some((m) => m.pickupStatus === 'delayed')) return { text: 'Someone is delayed', tone: 'accent' };
  if (active.every((m) => m.pickupStatus === 'not_landed')) return { text: 'Waiting for landings', tone: '' };
  return { text: `Gathering · ${atPickup} of ${active.length} at pickup`, tone: '' };
}

export function RideStatusCard({ ride, now }) {
  const me = ride.members.find((m) => m.isMe);
  const head = rideHeadline(ride, now);
  const remaining = new Date(ride.waitingDeadline).getTime() - now;
  const airport = getAirport(ride.airportCode);
  const closed = ride.status === 'departed' || ride.status === 'cancelled';
  const riders = ride.members.filter((m) => m.pickupStatus !== 'left').length;
  const warn = !closed && remaining <= 120000;

  return (
    <section className={`result-card${warn ? ' alert' : ''}`} style={{ maxWidth: 'none' }} aria-labelledby="ride-status-title">
      <div className="tags" style={{ marginBottom: '0.9rem' }}>
        <span role="status"><Tag tone={head.tone}>{head.text}</Tag></span>
        {ride.option?.label && <Tag tone="plain">{ride.option.label}</Tag>}
      </div>
      <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>Meet at</p>
      <h2 id="ride-status-title">{ride.pickupPoint}</h2>
      <a className="text-button" href={googleMapsSearchUrl(`${airport?.name ?? ride.airportCode} arrivals taxi pickup`)} target="_blank" rel="noreferrer">
        <Navigation size={15} aria-hidden /> Find it in Google Maps
      </a>

      <dl className="status-board">
        <div>
          <dt>Waiting window ends in</dt>
          <dd className={`big-value tabnum${warn ? ' warn' : ''}`}>{closed ? '—' : remaining > 0 ? fmtCountdown(remaining) : 'Ended'}</dd>
        </div>
        <div>
          <dt>Leave by</dt>
          <dd className="big-value tabnum" style={{ fontSize: '1.9rem' }}>{fmtTime(ride.proposedDepartureTime)}</dd>
        </div>
        <div>
          <dt>Wait until</dt>
          <dd className="big-value tabnum" style={{ fontSize: '1.9rem' }}>{fmtTime(ride.waitingDeadline)}</dd>
        </div>
      </dl>

      <div className="status-meta">
        <span><Users size={17} aria-hidden /> {riders} riders</span>
        <span><Wallet size={17} aria-hidden /> Your share {formatINR(me?.fareShare)} (est.)</span>
        {ride.option?.mapsUrl && (
          <a className="text-button" style={{ minHeight: 0 }} href={ride.option.mapsUrl} target="_blank" rel="noreferrer">
            <Route size={15} aria-hidden /> Cab route
          </a>
        )}
      </div>
    </section>
  );
}

const STEPS = [
  { id: 'land', title: 'Land at Cochin' },
  { id: 'luggage', title: 'Collect your baggage' },
  { id: 'walk', title: 'Walk to the pickup point' },
  { id: 'meet', title: 'Meet the other passengers' },
  { id: 'depart', title: 'Depart together' },
];

export function JourneyChecklist({ ride }) {
  const me = ride.members.find((m) => m.isMe);
  const s = me.pickupStatus;
  const active = ride.members.filter((m) => m.pickupStatus !== 'left');
  const allHere = active.every((m) => ['at_pickup', 'departed'].includes(m.pickupStatus));
  const departed = ride.status === 'departed';
  const done = {
    land: s !== 'not_landed' || departed,
    luggage: ['walking', 'at_pickup', 'departed'].includes(s) || departed,
    walk: ['at_pickup', 'departed'].includes(s) || departed,
    meet: allHere || departed,
    depart: departed,
  };
  const currentIdx = STEPS.findIndex((st) => !done[st.id]);
  return (
    <ol className="steps-list">
      {STEPS.map((st, i) => {
        const isDone = done[st.id];
        const isCurrent = i === currentIdx && ride.status !== 'cancelled';
        return (
          <li key={st.id} className={isDone ? 'is-done' : isCurrent ? 'is-current' : ''} aria-current={isCurrent ? 'step' : undefined}>
            <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
            <span>{st.title}{isDone && <span className="sr-only"> (done)</span>}</span>
            {isCurrent && <span className="now"><Tag tone="accent">Now</Tag></span>}
          </li>
        );
      })}
    </ol>
  );
}

const STATUS_TONE = { not_landed: 'plain', landed: '', collecting_luggage: '', walking: '', at_pickup: 'brand', delayed: 'accent', departed: 'brand', left: 'danger' };

export function MemberList({ ride, now }) {
  return (
    <ul className="member-list">
      {ride.members.map((m) => (
        <li key={m.id}>
          <Avatar name={m.displayName} me={m.isMe} small />
          <div className="who">
            <span className="name">
              {m.isMe ? 'You' : m.displayName}
              {m.isDemo && <span className="muted" style={{ fontWeight: 400, fontSize: '0.75rem' }}> · demo</span>}
              {!m.confirmed && m.pickupStatus !== 'left' && <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.75rem' }}> · not confirmed</span>}
            </span>
            <p>to {m.destinationName} · {timeAgo(m.updatedAt, now)}</p>
            <p>
              {m.flightDesignator ? `${m.flightDesignator} · ` : ''}
              {m.flightVerification === 'verified' && m.flightBestArrival
                ? `${m.flightBestKind === 'actual' ? 'landed' : m.flightBestKind === 'estimated' ? 'est.' : 'sched.'} ${fmtAirportTime(m.flightBestArrival)} · verified`
                : `lands ${fmtAirportTime(m.arrivalTime)}${m.flightDesignator ? ' · unverified' : ' · own time'}`}
            </p>
          </div>
          <Tag tone={STATUS_TONE[m.pickupStatus] ?? 'plain'}>
            {m.pickupStatus === 'delayed' ? `Delayed +${m.delayMinutes} min` : STATUS_LABEL[m.pickupStatus]}
          </Tag>
        </li>
      ))}
    </ul>
  );
}

export function UpdatesFeed({ updates, now }) {
  if (!updates.length) return <p className="small">No updates yet.</p>;
  return (
    <ul className="feed" aria-live="polite">
      {updates.slice(0, 8).map((u) => (
        <li key={u.id}>
          <span className={`dot ${u.kind}`} aria-hidden />
          <span>{u.text}</span>
          <time dateTime={u.at}>{timeAgo(u.at, now)}</time>
        </li>
      ))}
    </ul>
  );
}
