import { useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Info } from 'lucide-react';
import { Button, Note, PageHeading, JourneySteps, useDocumentTitle } from '../components/ui.jsx';
import { useAppState } from '../state/AppState.jsx';
import { buildOption, formatINR } from '../utils/fareCalculation.js';
import { createRide, planTimes } from '../services/rideService.js';
import { fmtTime, fmtDateTime } from '../utils/timeFormatting.js';

export default function RideConfirmation() {
  useDocumentTitle('Confirm your shared ride');
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

  const times = planTimes([trip, ...selected]);

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
    <>
      <PageHeading eyebrow="Step 04 · Confirm" title={<>Review your <em>shared</em> ride.</>}>
        Check the details below. Confirming tells your co-passengers you’re in — it doesn’t book a taxi or take payment.
      </PageHeading>
      <JourneySteps current={3} />

      <section className="workspace">
        <div className="result-card">
          <p className="eyebrow">{option.label} · {selected.length + 1} riders</p>
          <dl className="summary-list">
            <div><dt>Passengers</dt><dd>You, {selected.map((s) => s.displayName).join(', ')}</dd></div>
            <div><dt>Meet at</dt><dd>{option.pickupPoint}<p>Cochin International Airport</p></dd></div>
            <div>
              <dt>Proposed departure</dt>
              <dd>{fmtDateTime(times.proposed)}<p>The group waits until {fmtTime(times.deadline)}, then leaves with whoever is there.</p></dd>
            </div>
            <div>
              <dt>Drop-off order</dt>
              <dd>
                <ol className="stop-list">
                  {option.stops.map((s, i) => (
                    <li key={s.name + i}>
                      <span className="step-num">{i + 1}</span>
                      <span>{s.name} <span className="muted">· {s.riders.map((r) => (r === trip.displayName ? 'you' : r)).join(', ')}</span></span>
                    </li>
                  ))}
                </ol>
                <p style={{ marginTop: '0.5rem' }}>{option.dropArrangement}</p>
              </dd>
            </div>
            <div>
              <dt>Your estimated share</dt>
              <dd>
                <span className="price tabnum">{formatINR(option.perPerson)}</span>
                <p style={{ marginTop: '0.4rem' }}>
                  {option.detourMinutes ? `About ${option.detourMinutes} min of detour` : 'No detour for you'} · save ~{formatINR(Math.max(0, option.savings))} vs a solo cab
                </p>
              </dd>
            </div>
            <div>
              <dt>Everyone’s share</dt>
              <dd>
                <ul className="check-list compact">
                  {option.members.map((m) => (
                    <li key={m.tripId}>{m.tripId === trip.id ? 'You' : m.displayName}: {formatINR(m.cost)}{m.onward ? ` incl. ${m.onward === 'Bus' ? 'KSRTC bus' : m.onward.toLowerCase()}` : ''}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </div>

        <aside className="quick-panel" aria-label="Confirm">
          <div>
            <p className="eyebrow">Before you confirm</p>
            <h3>This is a proposal, not a booking</h3>
            <p className="small">No taxi is booked and no payment is taken. One of you books the cab at the pickup point and you settle the split between yourselves.</p>
          </div>
          {error && <Note tone="danger" title="Couldn’t confirm" role="alert">{error}</Note>}
          <Button block onClick={confirm} loading={busy}>
            <CheckCircle2 size={18} aria-hidden /> {busy ? 'Confirming…' : 'Confirm I’m in'}
          </Button>
          <Button block variant="secondary" onClick={() => navigate('/compare')}>
            <ArrowLeft size={18} aria-hidden /> Change option
          </Button>
          <div className="note"><Info size={16} aria-hidden style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />After confirming you’ll get a live page for landing: status updates, the waiting window and a 2-minute reminder.</div>
        </aside>
      </section>
    </>
  );
}
