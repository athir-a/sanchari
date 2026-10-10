import { useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2, MapPin, Clock, Route, Wallet, Info, Users } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { Button, Notice } from '../components/ui.jsx';
import { useAppState } from '../state/AppState.jsx';
import { buildOption, formatINR } from '../utils/fareCalculation.js';
import { createRide, planTimes } from '../services/rideService.js';
import { fmtTime, fmtDateTime } from '../utils/timeFormatting.js';

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3 py-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden />
      <div className="min-w-0">
        <p className="text-[12px] font-bold uppercase tracking-wide text-mute">{label}</p>
        <div className="mt-0.5 text-[15px] text-ink">{children}</div>
      </div>
    </div>
  );
}

export default function RideConfirmation() {
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const { trip, selected, optionKind } = state;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const option = useMemo(
    () => (trip && selected.length && optionKind ? buildOption(optionKind, trip, selected) : null),
    [trip, selected, optionKind],
  );

  if (!trip) return <Navigate to="/" replace />;
  if (!option || !option.available) return <Navigate to="/compare" replace />;

  const times = planTimes([trip, ...selected].map((t) => t.arrivalTime));

  async function confirm() {
    if (inFlight.current) return; // guard against double taps
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const ride = await createRide({ me: trip, others: selected, option });
      update({ activeRideId: ride.id });
      navigate('/ride', { replace: true });
    } catch (e) {
      setError(e.message);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <AppShell
      step={3}
      back="/compare"
      title="Confirm shared ride"
      footer={
        <Button size="lg" className="w-full" onClick={confirm} loading={busy}>
          <CheckCircle2 className="size-5" aria-hidden /> {busy ? 'Confirming…' : 'Confirm I’m in'}
        </Button>
      }
    >
      <section className="card rise divide-y divide-line/70 px-4">
        <Row icon={Users} label={`${selected.length + 1} passengers`}>
          You, {selected.map((s) => s.displayName).join(', ')}
        </Row>
        <Row icon={MapPin} label="Meet at">
          {option.pickupPoint}
        </Row>
        <Row icon={Clock} label="Proposed departure">
          {fmtDateTime(times.proposed)}
          <p className="text-[13px] text-mute">Group waits until {fmtTime(times.deadline)}, then leaves with whoever is there.</p>
        </Row>
        <Row icon={Route} label={`${option.label} · drop-off order`}>
          <ol className="mt-1 grid gap-1 text-[14px]">
            {option.stops.map((s, i) => (
              <li key={s.name + i} className="flex gap-2">
                <span className="tabnum grid size-5 shrink-0 place-items-center rounded-full bg-sand text-[11px] font-bold">{i + 1}</span>
                <span>{s.name} <span className="text-mute">· {s.riders.map((r) => (r === trip.displayName ? 'you' : r)).join(', ')}</span></span>
              </li>
            ))}
          </ol>
          <p className="mt-1.5 text-[13px] text-mute">{option.dropArrangement}</p>
        </Row>
        <Row icon={Wallet} label="Your estimated share">
          <span className="display text-2xl">{formatINR(option.perPerson)}</span>
          <p className="text-[13px] text-mute">
            {option.detourMinutes ? `About ${option.detourMinutes} min of detour` : 'No detour for you'} · save ~{formatINR(Math.max(0, option.savings))} vs a solo cab
          </p>
        </Row>
      </section>

      <Notice tone="sky" icon={Info} className="mt-4" title="This is a proposal, not a booking">
        No taxi is booked and no payment is taken. One of you books the cab at the pickup point and you settle the split between yourselves.
      </Notice>

      {error && <Notice tone="rose" className="mt-4" title="Couldn’t confirm">{error}</Notice>}
    </AppShell>
  );
}
