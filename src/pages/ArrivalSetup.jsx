import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Minus, Plus, Wallet, Scale, CarFront, Route, Receipt, BellRing, ArrowRight, Sparkles, CircleCheck, BadgeCheck, CircleHelp, PlaneLanding } from 'lucide-react';
import { Button, Field, Note, useDocumentTitle } from '../components/ui.jsx';
import { AIRPORTS, ZONES, CORRIDOR, destinationsForAirport } from '../data/airports.js';
import { DEMO_TRIP } from '../data/demoPassengers.js';
import { MATCHING_CONFIG, PREFERENCES, FARE_ASSUMPTIONS as F, RIDE_CONFIG } from '../data/config.js';
import { useAppState } from '../state/AppState.jsx';
import { validateArrival } from '../utils/validation.js';
import { tripFromForm } from '../utils/trip.js';
import { toLocalInput, fmtAirportTime, isoToLocalInput, airportDate } from '../utils/timeFormatting.js';
import { searchFlight, flightSnapshot, selectFlightForJourney, STATUS_TEXT } from '../services/flightApi.js';
import { READINESS_CONFIG } from '../utils/readiness.js';
import { saveTrip } from '../services/tripService.js';
import { IS_LIVE } from '../services/supabaseClient.js';

const ORDER = ['displayName', 'flightNumber', 'airportCode', 'arrivalLocal', 'destinationId', 'dropoffAddress', 'luggageCount', 'maxDetourMinutes', 'maxBudget', 'preference'];
const norm = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '');
const PREF_ICON = { cheapest: Wallet, balanced: Scale, direct: CarFront };

function HeroIllustration() {
  return (
    <div className="hero-illustration" aria-hidden="true">
      <div className="orbit o1" />
      <div className="orbit o2" />
      <div className="orbit o3" />
      <div className="paper-card">
        <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>Shared ride</p>
        <p className="route">COK → Thrissur</p>
        <dl>
          <div><dt>Riders</dt><dd>3 travellers</dd></div>
          <div><dt>Leaves</dt><dd>14:40</dd></div>
          <div><dt>Via</dt><dd>Chalakudy</dd></div>
          <div><dt>Your share</dt><dd>₹640 est.</dd></div>
        </dl>
        <div className="perforation" />
      </div>
      <div className="wax-seal">Fair<br />split</div>
      <div className="floating-tag"><b>Arrives</b>6E 2178 · 14:05</div>
    </div>
  );
}

export default function ArrivalSetup() {
  useDocumentTitle('Plan your arrival');
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const form = state.form;
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const formRef = useRef(null);
  const [check, setCheck] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (location.hash === '#plan') document.getElementById('plan')?.scrollIntoView({ block: 'start' });
  }, [location.hash]);

  const set = (k, v) => {
    update((s) => {
      const next = { ...s.form, [k]: v };
      // A verified flight only stays attached while the number still matches it.
      if (k === 'flightNumber' && s.form.flightRef && norm(v) !== norm(s.form.flightRef.designator)) next.flightRef = null;
      return { form: next };
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
    if (k === 'flightNumber') setCheck(null);
  };

  const flightRef = form.flightRef && norm(form.flightRef.designator) === norm(form.flightNumber) ? form.flightRef : null;

  async function checkFlight() {
    const date = form.arrivalLocal ? form.arrivalLocal.slice(0, 10) : airportDate(0);
    setCheck({ status: 'loading' });
    const r = await searchFlight({ number: form.flightNumber, date, airport: form.airportCode });
    if (!r.ok) {
      setCheck({ status: 'error', error: r.error });
      return;
    }
    const f = r.data.flight;
    const best = f.arrival.actual || f.arrival.estimated || f.arrival.scheduled;
    update((s) => ({ form: { ...s.form, flightNumber: f.designator, arrivalLocal: best ? isoToLocalInput(best) : s.form.arrivalLocal, flightRef: flightSnapshot(f, r.data.freshness) } }));
    setErrors((e) => ({ ...e, flightNumber: undefined, arrivalLocal: undefined }));
    setCheck({ status: 'ok' });
  }

  const fillDemo = () => {
    const arrival = new Date(Date.now() + 75 * 60000);
    arrival.setMinutes(Math.ceil(arrival.getMinutes() / 5) * 5, 0, 0);
    update({ form: { ...DEMO_TRIP, arrivalLocal: toLocalInput(arrival) } });
    setErrors({});
    document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function submit(e) {
    e.preventDefault();
    const errs = validateArrival(form);
    setErrors(errs);
    const first = ORDER.find((k) => errs[k]);
    if (first) {
      formRef.current?.querySelector(`[name="${first}"]`)?.focus();
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      let saved = await saveTrip(tripFromForm(form), state.trip?.id);
      if (IS_LIVE && flightRef) {
        // In live mode only the server may mark a flight verified.
        const r = await selectFlightForJourney(saved.id, { number: flightRef.designator, date: flightRef.flightDate });
        saved = r.ok
          ? { ...saved, flight: { ...flightRef, ...r.data.flight, verification: r.data.flight.verification } }
          : { ...saved, flight: { designator: form.flightNumber, verification: 'unverified' } };
      }
      update({ trip: saved, selected: [], optionKind: null });
      navigate('/matches');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dests = destinationsForAirport(form.airportCode);
  const zonesHere = [...new Set(dests.map((d) => d.zone))].sort((a, b) => ZONES[a].order - ZONES[b].order);
  const inv = (k) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Cochin Airport → Thrissur · Shared arrivals</p>
          <h1>Land together. <em>Ride</em> together. Pay less.</h1>
          <p className="hero-copy">
            Sanchari finds travellers landing at Cochin International Airport around your time and heading your way —
            along Aluva, Angamaly and Chalakudy to Thrissur — then plans one shared cab and splits the fare by the road each person actually travels.
          </p>
          <div className="button-row">
            <a className="button primary" href="#plan">Plan my arrival <ArrowRight size={18} aria-hidden /></a>
            {!IS_LIVE && (
              <Button variant="secondary" onClick={fillDemo}>
                <Sparkles size={18} aria-hidden /> Try a demo trip
              </Button>
            )}
          </div>
        </div>
        <HeroIllustration />
      </section>

      <div className="journey-strip">
        <span><b>01</b> Tell us when you land and where you’re going</span>
        <span><b>02</b> Pick travellers whose route overlaps yours</span>
        <span><b>03</b> Meet at the pickup point and split the fare fairly</span>
      </div>

      {state.activeRideId && (
        <div className="quiet-note" style={{ marginBottom: '1.8rem' }}>
          <span className="icon-box"><CarFront size={22} aria-hidden /></span>
          <p>You have a shared ride in progress. <Link to="/ride">Open your ride</Link> or plan a new trip below.</p>
        </div>
      )}

      <section className="workspace" id="plan" style={{ scrollMarginTop: '1.5rem' }}>
        <div className="input-card">
          <p className="eyebrow">Step 01 · Your arrival</p>
          <h2>Plan your arrival</h2>
          <p style={{ marginBottom: '1.8rem' }}>Takes under a minute. Only your first name and area are shown to other travellers.</p>

          {errorCount > 0 && (
            <Note tone="danger" className="" role="alert">
              Please fix {errorCount === 1 ? '1 field' : `${errorCount} fields`} below.
            </Note>
          )}

          <form ref={formRef} onSubmit={submit} noValidate className="form-grid" style={{ marginTop: errorCount ? '1.4rem' : 0 }}>
            <div className="form-section">
              <h3>You and your flight</h3>
              <Field id="displayName" label="Your first name" hint="Shown to co-passengers so they can find you at pickup." error={errors.displayName}>
                <input id="displayName" name="displayName" className="input" autoComplete="given-name" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} {...inv('displayName')} />
              </Field>
              <div className="field-row">
                <Field id="flightNumber" label="Flight number" optional error={errors.flightNumber}>
                  <input id="flightNumber" name="flightNumber" className="input" placeholder="e.g. 6E 2178" value={form.flightNumber} onChange={(e) => set('flightNumber', e.target.value.toUpperCase())} {...inv('flightNumber')} />
                </Field>
                <Field id="airportCode" label="Arriving at" error={errors.airportCode}>
                  <select id="airportCode" name="airportCode" className="select input" value={form.airportCode} onChange={(e) => set('airportCode', e.target.value)} {...inv('airportCode')}>
                    {Object.values(AIRPORTS).map((a) => (
                      <option key={a.code} value={a.code}>{a.name} ({a.code})</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field id="arrivalLocal" label="Expected landing time" hint={flightRef ? 'Filled from your verified flight. You can still adjust it.' : 'Use the scheduled arrival on your ticket.'} error={errors.arrivalLocal}>
                <input id="arrivalLocal" name="arrivalLocal" type="datetime-local" className="input" value={form.arrivalLocal} onChange={(e) => set('arrivalLocal', e.target.value)} {...inv('arrivalLocal')} />
              </Field>
              <div className={`note${flightRef ? '' : check?.status === 'error' ? ' accent' : ''}`} aria-live="polite">
                {flightRef ? (
                  <div className="stack-sm">
                    <span className="verify-row">
                      <BadgeCheck size={18} aria-hidden /> <strong>{flightRef.designator} verified</strong>
                      <span className="tag">{STATUS_TEXT[flightRef.status]}</span>
                    </span>
                    <span className="small">
                      From {flightRef.origin} · scheduled {fmtAirportTime(flightRef.scheduledArrival)}
                      {flightRef.estimatedArrival && ` · estimated ${fmtAirportTime(flightRef.estimatedArrival)}`}
                      {flightRef.actualArrival && ` · landed ${fmtAirportTime(flightRef.actualArrival)}`} IST. Sanchari will use live times for matching.
                    </span>
                  </div>
                ) : form.flightNumber ? (
                  <div className="stack-sm">
                    <span className="verify-row">
                      <CircleHelp size={18} aria-hidden /> <strong>{form.flightNumber} is not verified</strong>
                      <Button variant="secondary" loading={check?.status === 'loading'} onClick={checkFlight}>Check flight</Button>
                    </span>
                    <span className="small">
                      {check?.status === 'error'
                        ? `${check.error.message} We’ll use the landing time you entered, and the flight won’t update automatically.`
                        : 'Check it against live arrivals, or keep it as entered — unverified flights don’t get automatic updates.'}
                    </span>
                  </div>
                ) : (
                  <span className="verify-row small">
                    <PlaneLanding size={18} aria-hidden /> No flight number? <Link to="/arrivals">Browse today’s COK arrivals</Link> or just enter your landing time.
                  </span>
                )}
              </div>
            </div>

            <div className="form-section">
              <h3>Where you’re going</h3>
              <Field id="destinationId" label="Destination area" error={errors.destinationId}>
                <select id="destinationId" name="destinationId" className="select input" value={form.destinationId} onChange={(e) => set('destinationId', e.target.value)} {...inv('destinationId')}>
                  <option value="">Choose an area</option>
                  {zonesHere.map((z) => (
                    <optgroup key={z} label={ZONES[z].name}>
                      {dests.filter((d) => d.zone === z).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field id="dropoffAddress" label="Exact drop-off" optional hint="Only you see this. Leave blank to use the area centre." error={errors.dropoffAddress}>
                <input id="dropoffAddress" name="dropoffAddress" className="input" placeholder="Building, street or landmark" autoComplete="street-address" value={form.dropoffAddress} onChange={(e) => set('dropoffAddress', e.target.value)} {...inv('dropoffAddress')} />
              </Field>
              <div className="field-row">
                <div className="field">
                  <span className="label" id="bags-label">Bags</span>
                  <div className="stepper" role="group" aria-labelledby="bags-label">
                    <Button variant="secondary" onClick={() => set('luggageCount', Math.max(0, Number(form.luggageCount) - 1))} disabled={Number(form.luggageCount) <= 0} aria-label="Fewer bags">
                      <Minus size={18} aria-hidden />
                    </Button>
                    <output name="luggageCount" aria-live="polite" className="tabnum">{form.luggageCount}</output>
                    <Button variant="secondary" onClick={() => set('luggageCount', Math.min(6, Number(form.luggageCount) + 1))} disabled={Number(form.luggageCount) >= 6} aria-label="More bags">
                      <Plus size={18} aria-hidden />
                    </Button>
                  </div>
                  <p className="hint">Checked and large cabin bags.</p>
                  {errors.luggageCount && <p className="error" role="alert">{errors.luggageCount}</p>}
                </div>
                <div className="field">
                  <span className="label" id="detour-label">Extra time you’ll accept</span>
                  <div className="segmented" role="radiogroup" aria-labelledby="detour-label">
                    {MATCHING_CONFIG.detourChoices.map((m) => (
                      <Button
                        key={m}
                        variant="secondary"
                        role="radio"
                        name="maxDetourMinutes"
                        aria-checked={Number(form.maxDetourMinutes) === m}
                        onClick={() => set('maxDetourMinutes', m)}
                      >
                        {m} min
                      </Button>
                    ))}
                  </div>
                  <p className="hint">For drop-offs before yours.</p>
                  {errors.maxDetourMinutes && <p className="error" role="alert">{errors.maxDetourMinutes}</p>}
                </div>
              </div>
              <Field id="maxBudget" label="Most you’d pay for your share (₹)" optional hint="Leave blank for no limit. We won’t pair you where every option costs more." error={errors.maxBudget}>
                <input id="maxBudget" name="maxBudget" className="input" inputMode="numeric" placeholder="e.g. 900" value={form.maxBudget ?? ''} onChange={(e) => set('maxBudget', e.target.value.replace(/[^\d]/g, ''))} {...inv('maxBudget')} />
              </Field>
            </div>

            <div className="form-section">
              <h3 id="pref-label">How would you like to travel?</h3>
              <div className="choice-list" role="radiogroup" aria-labelledby="pref-label">
                {Object.values(PREFERENCES).map((p) => {
                  const Icon = PREF_ICON[p.id];
                  const active = form.preference === p.id;
                  return (
                    <button type="button" role="radio" name="preference" aria-checked={active} key={p.id} className="choice" onClick={() => set('preference', p.id)}>
                      <span className="icon-box"><Icon size={20} aria-hidden /></span>
                      <span className="choice-body">
                        <span className="choice-title">{p.label}</span>
                        <p>{p.short}</p>
                      </span>
                      {active && <CircleCheck size={20} color="var(--primary)" aria-hidden />}
                    </button>
                  );
                })}
              </div>
              {errors.preference && <p className="error" role="alert">{errors.preference}</p>}
            </div>

            {saveError && <Note tone="danger" title="Couldn’t save your trip" role="alert">{saveError}</Note>}

            <Button type="submit" block loading={saving}>
              Find travellers on my route <ArrowRight size={18} aria-hidden />
            </Button>
          </form>
        </div>

        <aside className="quick-panel" aria-label="About the service area">
          <div>
            <p className="eyebrow">Service area</p>
            <h3>The corridor we serve</h3>
            <p className="small" style={{ marginBottom: '1rem' }}>Shared rides start at the airport and follow NH 544 north. Kochi suburbs and Aluva are served too.</p>
            <ol className="corridor">
              {CORRIDOR.map((c) => <li key={c}>{c}</li>)}
            </ol>
          </div>
          <div className="divider" />
          <div>
            <h3>How we match you</h3>
            <ul className="check-list compact">
              <li>Likely ready within ±{MATCHING_CONFIG.arrivalWindowMinutes} minutes of each other — using live flight times when your flight is verified</li>
              <li>Same flight alone is never enough to match</li>
              <li>Drop-offs close together, or one on the other’s way</li>
              <li>Bags fit one cab (sedan 4, SUV 6)</li>
              <li>Door-to-door riders never sent to a bus stand</li>
              <li>Detour within the limit each rider sets</li>
            </ul>
          </div>
          <div className="note">All fares and times are estimates from fixed assumptions — not live quotes. No taxi is booked automatically.</div>
        </aside>
      </section>

      <section className="section" aria-labelledby="why-heading">
        <div className="section-head">
          <p className="eyebrow">Why Sanchari</p>
          <h2 id="why-heading">Built for the ride out of the airport.</h2>
        </div>
        <div className="problem-grid">
          <article className="card interactive">
            <span className="icon-box"><Route size={22} aria-hidden /></span>
            <h3>Route overlap, not just destination</h3>
            <p>A traveller getting off at Chalakudy is a good match for someone going to Thrissur — the cab passes them on the way.</p>
          </article>
          <article className="card interactive">
            <span className="icon-box"><Receipt size={22} aria-hidden /></span>
            <h3>Fares split by distance shared</h3>
            <p>Everyone shares the pickup charge. Each stretch of road is split only between the people still in the cab.</p>
          </article>
          <article className="card interactive">
            <span className="icon-box"><BellRing size={22} aria-hidden /></span>
            <h3>Arrival-aware coordination</h3>
            <p>One-tap status updates after landing, a shared waiting window and a reminder two minutes before it closes.</p>
          </article>
        </div>
      </section>

      <section className="section" aria-labelledby="method-heading" id="method">
        <div className="section-head">
          <p className="eyebrow">How Sanchari decides</p>
          <h2 id="method-heading">Every match and fare is explainable.</h2>
        </div>
        <div className="accordion">
          <details className="disclosure">
            <summary>How are fares calculated?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>Cab estimate: ₹{F.cab.airportPickupFee} airport pickup + ₹{F.cab.base} base + ₹{F.cab.perKm}/km (SUV ×{F.vehicles.suv.multiplier}). Road distance is estimated as straight-line distance × {F.roadFactor}.</p>
              <p>The pickup and base charges are shared equally. Each stretch between drop-offs is shared by the riders still aboard, so someone leaving at Angamaly pays less than someone going to Thrissur.</p>
              <p>Onward legs are added per person: KSRTC bus or metro ₹{F.transit.base} + ₹{F.transit.perKm}/km (capped at ₹{F.transit.cap}); auto ₹{F.auto.base} for the first {F.auto.includedKm} km, then ₹{F.auto.perKm}/km.</p>
            </div>
          </details>
          <details className="disclosure">
            <summary>What do Cheapest, Balanced and Direct mean?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <ul className="check-list">
                <li><strong>Cheapest</strong> — shared cab to a transit hub such as Angamaly KSRTC Bus Terminal or Aluva Metro, then bus or metro.</li>
                <li><strong>Balanced</strong> — riders within {F.balancedClusterKm} km of each other share one stop in one of their areas and finish by auto or on foot.</li>
                <li><strong>Direct</strong> — the cab drops everyone at their own address, nearest first.</li>
              </ul>
            </div>
          </details>
          <details className="disclosure">
            <summary>What do other travellers see about me?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>While matching: your first name, likely-ready time, destination area, bags and preference. Your flight number is shared only with co-passengers once you’re in a ride together, and your exact drop-off address is never shown to anyone else.</p>
            </div>
          </details>
          <details className="disclosure">
            <summary>How does the waiting window work?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>Sanchari estimates when each person is ready — {READINESS_CONFIG.noBagMinutes} minutes after landing with only a cabin bag, {READINESS_CONFIG.baggageBaseMinutes} with one checked bag plus {READINESS_CONFIG.perExtraBagMinutes} per extra bag, then a {READINESS_CONFIG.walkToPickupMinutes}-minute walk — using the live estimated or actual landing time when your flight is verified. Departure is proposed when the last person is likely ready, and the group waits up to {RIDE_CONFIG.waitAfterDepartureMinutes} more minutes. Two minutes before the window ends, Sanchari shows a reminder and vibrates once where the browser allows. A web page can’t alert you while it’s closed.</p>
            </div>
          </details>
        </div>
      </section>

      <section className="learning-banner">
        <span className="icon-box accent"><CarFront size={22} aria-hidden /></span>
        <div>
          <p className="eyebrow">Landing soon?</p>
          <h2>Share the ride home from COK.</h2>
          <p>Plan now and see who’s landing around your time.</p>
        </div>
        <a className="button secondary" href="#plan">Plan my arrival →</a>
      </section>
    </>
  );
}
