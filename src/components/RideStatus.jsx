import { Check, Navigation, Users, Wallet, Clock, AlertTriangle } from 'lucide-react';
import { Avatar } from './PassengerCard.jsx';
import { Badge } from './ui.jsx';
import { STATUS_LABEL } from '../services/rideService.js';
import { formatINR } from '../utils/fareCalculation.js';
import { fmtCountdown, fmtTime, timeAgo } from '../utils/timeFormatting.js';
import { googleMapsSearchUrl } from '../utils/geo.js';
import { getAirport } from '../data/airports.js';

export function rideHeadline(ride, now) {
  const active = ride.members.filter((m) => m.pickupStatus !== 'left');
  const atPickup = active.filter((m) => m.pickupStatus === 'at_pickup').length;
  if (ride.status === 'departed') return { text: 'Departed', tone: 'teal' };
  if (ride.status === 'cancelled') return { text: 'Cancelled', tone: 'rose' };
  if (atPickup === active.length) return { text: 'Everyone’s at pickup', tone: 'teal' };
  if (new Date(ride.waitingDeadline).getTime() <= now) return { text: 'Waiting window over', tone: 'rose' };
  if (active.some((m) => m.pickupStatus === 'delayed')) return { text: 'Someone’s delayed', tone: 'amber' };
  if (active.every((m) => m.pickupStatus === 'not_landed')) return { text: 'Waiting for landings', tone: 'sky' };
  return { text: `Gathering · ${atPickup}/${active.length} at pickup`, tone: 'sky' };
}

const HERO_TONE = {
  teal: 'bg-teal-soft text-teal-deep',
  rose: 'bg-rose-soft text-rose',
  amber: 'bg-amber-soft text-amber',
  sky: 'bg-white/15 text-white',
};

export function RideHero({ ride, now }) {
  const me = ride.members.find((m) => m.isMe);
  const head = rideHeadline(ride, now);
  const remaining = new Date(ride.waitingDeadline).getTime() - now;
  const airport = getAirport(ride.airportCode);
  const closed = ride.status === 'departed' || ride.status === 'cancelled';
  const riders = ride.members.filter((m) => m.pickupStatus !== 'left').length;

  return (
    <section className="rise relative overflow-hidden rounded-[28px] bg-ink p-5 text-white shadow-[0_24px_50px_-24px_rgba(16,32,47,.7)]">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-teal/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-48 rounded-full bg-amber/25 blur-3xl" />
      <div className="relative">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${HERO_TONE[head.tone]}`} role="status">
          {head.text}
        </span>
        <p className="mt-4 text-[12px] font-bold uppercase tracking-wider text-white/60">Meet at</p>
        <h2 className="display mt-1 text-[26px] leading-tight">{ride.pickupPoint}</h2>
        <a
          href={googleMapsSearchUrl(`${airport?.name ?? ride.airportCode} arrivals cab pickup`)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/10 px-3 text-[13px] font-semibold hover:bg-white/15"
        >
          <Navigation className="size-4" aria-hidden /> Find it in Maps
        </a>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/60"><Clock className="size-3.5" aria-hidden /> Leave by</p>
            <p className="tabnum mt-1 text-xl font-bold">{fmtTime(ride.proposedDepartureTime)}</p>
            <p className="text-[12px] text-white/70">wait until {fmtTime(ride.waitingDeadline)}</p>
          </div>
          <div className={`rounded-2xl border p-3 backdrop-blur-md ${!closed && remaining <= 120000 ? 'border-amber/60 bg-amber/25' : 'border-white/15 bg-white/10'}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">Window ends in</p>
            <p className="tabnum mt-1 text-xl font-bold" aria-live="off">{closed ? '—' : remaining > 0 ? fmtCountdown(remaining) : 'Ended'}</p>
            <p className="text-[12px] text-white/70">from stored deadline</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4 text-[13px] text-white/80">
          <span className="inline-flex items-center gap-1.5"><Users className="size-4" aria-hidden /> {riders} riders</span>
          <span className="inline-flex items-center gap-1.5"><Wallet className="size-4" aria-hidden /> {formatINR(me?.fareShare)} each (est.)</span>
          {ride.option?.label && <span>{ride.option.label}</span>}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { id: 'luggage', title: 'Collect luggage' },
  { id: 'walk', title: 'Walk to the pickup point' },
  { id: 'meet', title: 'Meet the other passengers' },
  { id: 'depart', title: 'Depart together' },
];

export function JourneySteps({ ride }) {
  const me = ride.members.find((m) => m.isMe);
  const s = me.pickupStatus;
  const active = ride.members.filter((m) => m.pickupStatus !== 'left');
  const allHere = active.every((m) => ['at_pickup', 'departed'].includes(m.pickupStatus));
  const departed = ride.status === 'departed';
  const done = {
    luggage: ['walking', 'at_pickup', 'departed'].includes(s) || departed,
    walk: ['at_pickup', 'departed'].includes(s) || departed,
    meet: allHere || departed,
    depart: departed,
  };
  const currentIdx = STEPS.findIndex((st) => !done[st.id]);
  return (
    <ol className="card grid gap-0 p-2">
      {STEPS.map((st, i) => {
        const isDone = done[st.id];
        const isCurrent = i === currentIdx && ride.status !== 'cancelled';
        return (
          <li key={st.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${isCurrent ? 'bg-teal-soft' : ''}`} aria-current={isCurrent ? 'step' : undefined}>
            <span className={`tabnum grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${isDone ? 'bg-teal text-white' : isCurrent ? 'bg-white text-teal ring-2 ring-teal' : 'bg-sand text-mute'}`}>
              {isDone ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={`text-[15px] ${isDone ? 'text-mute line-through decoration-faint' : isCurrent ? 'font-bold text-ink' : 'text-ink-2'}`}>{st.title}</span>
            {isCurrent && <span className="ml-auto text-[12px] font-bold text-teal">Now</span>}
          </li>
        );
      })}
    </ol>
  );
}

const STATUS_TONE = { not_landed: 'neutral', collecting_luggage: 'sky', walking: 'sky', at_pickup: 'teal', delayed: 'amber', departed: 'teal', left: 'rose' };

export function MemberList({ ride, now }) {
  return (
    <ul className="card divide-y divide-line/70">
      {ride.members.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-4 py-3">
          <Avatar name={m.displayName} tone={m.isMe ? 'bg-teal text-white' : 'bg-sky-soft text-sky'} size="size-10" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {m.isMe ? 'You' : m.displayName}
              {m.isDemo && <span className="ml-1.5 text-[11px] font-semibold text-faint">demo</span>}
              {!m.confirmed && m.pickupStatus !== 'left' && <span className="ml-1.5 text-[11px] font-semibold text-amber">not confirmed</span>}
            </p>
            <p className="truncate text-[12.5px] text-mute">
              to {m.destinationName} · lands {fmtTime(m.arrivalTime)} · updated {timeAgo(m.updatedAt, now)}
            </p>
          </div>
          <Badge tone={STATUS_TONE[m.pickupStatus] || 'neutral'}>
            {m.pickupStatus === 'delayed' && <AlertTriangle className="size-3" aria-hidden />}
            {m.pickupStatus === 'delayed' ? `+${m.delayMinutes} min` : STATUS_LABEL[m.pickupStatus]}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

const FEED_DOT = { success: 'bg-teal', warning: 'bg-amber', info: 'bg-sky' };

export function UpdatesFeed({ updates, now }) {
  if (!updates.length) return null;
  return (
    <ul className="grid gap-2.5" aria-live="polite">
      {updates.slice(0, 8).map((u) => (
        <li key={u.id} className="flex gap-3 text-[13.5px]">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${FEED_DOT[u.kind] || 'bg-faint'}`} aria-hidden />
          <span className="min-w-0 flex-1 text-ink-2">{u.text}</span>
          <span className="shrink-0 text-[12px] text-faint">{timeAgo(u.at, now)}</span>
        </li>
      ))}
    </ul>
  );
}
