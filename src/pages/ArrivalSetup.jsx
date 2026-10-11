import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Minus, Plus, Wallet, Scale, CarFront, Route, Receipt, BellRing, ArrowRight, CircleCheck, BadgeCheck, CircleHelp, PlaneLanding } from 'lucide-react';
import { Button, Field, Note, useDocumentTitle } from '../components/ui.jsx';
import { DestinationPicker } from '../components/DestinationPicker.jsx';
import { DISTRICTS, getDestination, districtStops } from '../data/airports.js';
import { DEMO_TRIP } from '../data/demoPassengers.js';
import { PREFERENCES, FARE_ASSUMPTIONS as F, RIDE_CONFIG, MATCHING_CONFIG } from '../data/config.js';
import { READINESS_CONFIG } from '../utils/readiness.js';
import { useAppState } from '../state/AppState.jsx';
import { validateArrival } from '../utils/validation.js';
import { tripFromForm } from '../utils/trip.js';
import { toLocalInput, fmtAirportTime, isoToLocalInput, airportDate } from '../utils/timeFormatting.js';
import { searchFlight, flightSnapshot, selectFlightForJourney, STATUS_TEXT } from '../services/flightApi.js';
import { saveTrip } from '../services/tripService.js';
import { IS_LIVE } from '../services/supabaseClient.js';

const ORDER = ['displayName', 'flightNumber', 'arrivalLocal', 'destinationId', 'dropoffAddress', 'luggageCount', 'maxBudget', 'preference'];
const norm = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '');
const PREF_ICON = { cheapest: Wallet, balanced: Scale, direct: CarFront };

function HeroIllustration() {
  return (
    <div className="hero-illustration" aria-hidden="true">
      <div className="orbit o1" />
      <div className="orbit o2" />
      <div className="orbit o3" />
      <div className="paper-card">
        <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>Your shared ride</p>
        <p className="route">COK → Kozhikode</p>
        <dl>
          <div><dt>Riders</dt><dd>3 travellers</dd></div>
          <div><dt>Leaves</dt><dd>14:40</dd></div>
          <div><dt>Via</dt><dd>Thrissur</dd></div>
          <div><dt>Your share</dt><dd>₹1,180</dd></div>
        </dl>
        <div className="perforation" />
      </div>
      <div className="wax-seal">Fair<br />split</div>
      <div className="floating-tag"><b>Lands</b>6E 2178 · 14:05</div>
    </div>
  );
}

export default function ArrivalSetup() {
  useDocumentTitle('Share your ride from Cochin Airport');
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const form = state.form;
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const formRef = useRef(null);
  const [check, setCheck] = useState(null);
  const location = useLocation();
  const district = form.district || getDestination(form.destinationId)?.district || '';

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

  const chooseDistrict = (id) => {
    const { route } = districtStops(id);
    // Default to the district's main town (the end of the road); the rider can pick a stop on the way.
    update((s) => ({ form: { ...s.form, district: id, destinationId: route.length ? route[route.length - 1].id : '' } }));
    setErrors((e) => ({ ...e, destinationId: undefined }));
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

  const fillExample = () => {
    const arrival = new Date(Date.now() + 75 * 60000);
    arrival.setMinutes(Math.ceil(arrival.getMinutes() / 5) * 5, 0, 0);
    update({ form: { ...form, ...DEMO_TRIP, arrivalLocal: toLocalInput(arrival), flightRef: null } });
    setErrors({});
    document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function submit(e) {
    e.preventDefault();
    const errs = validateArrival({ ...form, district });
    setErrors(errs);
    const first = ORDER.find((k) => errs[k]);
    if (first) {
      formRef.current?.querySelector(`[name="${first === 'destinationId' && !district ? 'district' : first}"]`)?.focus();
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      let saved = await saveTrip(tripFromForm(form), state.trip?.id);
      if (IS_LIVE && flightRef) {
        // Only the server may mark a flight verified.
        const r = await selectFlightForJourney(saved.id, { number: flightRef.designator, date: flightRef.flightDate });
        saved = r.ok
          ? { ...saved, flight: { ...flightRef, ...r.data.flight, verification: r.data.flight.verification } }
          : { ...saved, flight: { designator: form.flightNumber, verification: 'unverified' } };
      }
      update({ trip: saved, activeRideId: null });
      navigate('/match');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inv = (k) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Cochin Airport → All of Kerala · Shared arrivals</p>
          <h1>Land together. <em>Ride</em> together. Pay less.</h1>
          <p className="hero-copy">
            Tell Sanchari when you land and where you’re headed. It finds travellers landing around the same time and going your way,
            puts you in one cab, and splits the fare by the distance each of you rides.
          </p>
          <div className="button-row">
            <a className="button primary" href="#plan">Plan my arrival <ArrowRight size={18} aria-hidden /></a>
            {!IS_LIVE && <Button variant="secondary" onClick={fillExample}>Fill in an example</Button>}
          </div>
        </div>
        <HeroIllustration />
      </section>

      <div className="journey-strip">
        <span><b>01</b> Tell us when you land and where you’re going</span>
        <span><b>02</b> Sanchari matches you with travellers on your route</span>
        <span><b>03</b> Meet at the pickup point and split the fare fairly</span>
      </div>

      {state.activeRideId && (
        <div className="quiet-note" style={{ marginBottom: '1.8rem' }}>
          <span className="icon-box"><CarFront size={22} aria-hidden /></span>
          <p>You have a shared ride coming up. <Link to="/ride">Open your ride</Link></p>
        </div>
      )}

      <section className="workspace" id="plan" style={{ scrollMarginTop: '1.5rem' }}>
      <div className="input-card">
        <p className="eyebrow">Step 01 · Your arrival</p>
        <h2>Plan your arrival</h2>
        <p style={{ marginBottom: '1.8rem' }}>Takes under a minute. Only your first name and area are shown to other travellers.</p>

        {errorCount > 0 && (
          <Note tone="danger" role="alert">
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
              <Field id="arrivalLocal" label="Landing at Cochin (COK)" error={errors.arrivalLocal}>
                <input id="arrivalLocal" name="arrivalLocal" type="datetime-local" className="input" value={form.arrivalLocal} onChange={(e) => set('arrivalLocal', e.target.value)} {...inv('arrivalLocal')} />
              </Field>
            </div>
            <div className={`note${!flightRef && check?.status === 'error' ? ' accent' : ''}`} aria-live="polite">
            {flightRef ? (
              <p className="verify-row small">
                <BadgeCheck size={18} color="var(--primary)" aria-hidden />
                <span><strong>{flightRef.designator}</strong> from {flightRef.origin} · {STATUS_TEXT[flightRef.status]} ·{' '}
                  {flightRef.actualArrival ? `landed ${fmtAirportTime(flightRef.actualArrival)}` : flightRef.estimatedArrival ? `expected ${fmtAirportTime(flightRef.estimatedArrival)}` : `due ${fmtAirportTime(flightRef.scheduledArrival)}`}
                </span>
              </p>
            ) : form.flightNumber ? (
              <div className="verify-row small">
                <CircleHelp size={18} aria-hidden />
                <span>{check?.status === 'error' ? check.error.message : 'Check your flight so your landing time stays up to date.'}</span>
                <Button variant="secondary" loading={check?.status === 'loading'} onClick={checkFlight}>Check flight</Button>
              </div>
            ) : (
              <p className="verify-row small">
                <PlaneLanding size={18} aria-hidden /> No flight number? <Link to="/arrivals">Browse today’s COK arrivals</Link> or just enter your landing time.
              </p>
            )}
            </div>
          </div>

          <div className="form-section">
            <h3>Where you’re going</h3>
            <Field id="district" label="District" error={!district ? errors.destinationId : undefined}>
              <select id="district" name="district" className="select input" value={district} onChange={(e) => chooseDistrict(e.target.value)} {...(!district ? inv('destinationId') : {})}>
                <option value="">Choose a district</option>
                {DISTRICTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            {district && (
              <>
                <DestinationPicker district={district} value={form.destinationId} onChange={(id) => set('destinationId', id)} />
                {errors.destinationId && <p className="error" role="alert">{errors.destinationId}</p>}
                <Field id="dropoffAddress" label="Exact address" optional hint="Only you see this." error={errors.dropoffAddress}>
                  <input id="dropoffAddress" name="dropoffAddress" className="input" placeholder="Building, street or landmark" autoComplete="street-address" value={form.dropoffAddress} onChange={(e) => set('dropoffAddress', e.target.value)} {...inv('dropoffAddress')} />
                </Field>
              </>
            )}
          </div>

          <div className="form-section">
            <h3 id="pref-label">How you’d like to travel</h3>
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
                {errors.luggageCount && <p className="error" role="alert">{errors.luggageCount}</p>}
              </div>
              <Field id="maxBudget" label="Most you’d pay (₹)" optional error={errors.maxBudget}>
                <input id="maxBudget" name="maxBudget" className="input" inputMode="numeric" placeholder="No limit" value={form.maxBudget ?? ''} onChange={(e) => set('maxBudget', e.target.value.replace(/[^\d]/g, ''))} {...inv('maxBudget')} />
              </Field>
            </div>
          </div>

          {saveError && <Note tone="danger" title="Couldn’t save your trip" role="alert">{saveError}</Note>}

          <Button type="submit" block loading={saving}>
            Find travellers on my route <ArrowRight size={18} aria-hidden />
          </Button>
        </form>
      </div>

      <aside className="quick-panel" aria-label="How we match you">
        <div>
          <p className="eyebrow">How it works</p>
          <h3>How we match you</h3>
          <ul className="check-list compact" style={{ marginTop: '0.8rem' }}>
            <li>Likely ready within {MATCHING_CONFIG.arrivalWindowMinutes} minutes of each other, using live flight times when your flight is checked</li>
            <li>Same flight alone is never enough to match</li>
            <li>Drop-offs close together, or one on the other’s way</li>
            <li>Bags fit one cab (sedan 4, SUV 6)</li>
            <li>Door-to-door riders never sent to a bus stand</li>
            <li>Detour of at most {MATCHING_CONFIG.maxDetourMinutes} minutes for anyone</li>
            <li>Everyone pays less than a cab on their own</li>
          </ul>
        </div>
        <div className="divider" />
        <div>
          <h3>After you land</h3>
          <ul className="check-list compact" style={{ marginTop: '0.8rem' }}>
            <li>Your group gets {RIDE_CONFIG.pickupWindowMinutes} minutes to meet, starting when the first of you lands</li>
            <li>See where everyone is, from the gate to the pickup point</li>
            <li>A reminder two minutes before time runs out</li>
          </ul>
        </div>
        <div className="note">All fares and times are estimates from fixed assumptions, not live quotes. No taxi is booked automatically.</div>
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
            <p>A traveller getting off at Chalakudy is a good match for someone going to Kozhikode. The cab passes them on the way.</p>
          </article>
          <article className="card interactive">
            <span className="icon-box"><Receipt size={22} aria-hidden /></span>
            <h3>Fares split by distance shared</h3>
            <p>Everyone shares the pickup charge. Each stretch of road is split only between the people still in the cab.</p>
          </article>
          <article className="card interactive">
            <span className="icon-box"><BellRing size={22} aria-hidden /></span>
            <h3>Arrival-aware coordination</h3>
            <p>One-tap updates after landing, a shared {RIDE_CONFIG.pickupWindowMinutes}-minute window, a map of where everyone is and a reminder two minutes before it closes.</p>
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
            <summary>Who do I get matched with?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>Up to three other travellers who will be out of the airport within {MATCHING_CONFIG.arrivalWindowMinutes} minutes of you, whose drop-off is near yours or on your way, whose bags fit in the same cab, and who want a compatible kind of trip. You don’t pick anyone: Sanchari puts the ride together and each of you says <strong>I’m in</strong> or <strong>Not for me</strong>. If you say no, you won’t be grouped with those people again.</p>
            </div>
          </details>
          <details className="disclosure">
            <summary>How are fares calculated?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>Cab estimate: ₹{F.cab.airportPickupFee} airport pickup + ₹{F.cab.base} base + ₹{F.cab.perKm}/km (SUV ×{F.vehicles.suv.multiplier}). Road distance is estimated as straight-line distance × {F.roadFactor}.</p>
              <p>The pickup and base charges are shared equally. Each stretch between drop-offs is shared by the riders still aboard, so someone leaving at Angamaly pays less than someone going to Kozhikode.</p>
              <p>Onward legs are added per person: KSRTC bus or metro ₹{F.transit.base} + ₹{F.transit.perKm}/km (capped at ₹{F.transit.cap}); auto ₹{F.auto.base} for the first {F.auto.includedKm} km, then ₹{F.auto.perKm}/km.</p>
            </div>
          </details>
          <details className="disclosure">
            <summary>What do Cheapest, Balanced and Direct mean?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <ul className="check-list">
                <li><strong>Cheapest</strong>: shared cab to a transit hub (Angamaly KSRTC for the north, Vyttila Hub for the south, Perumbavoor KSRTC for the east, Aluva Metro for Kochi), then bus or metro.</li>
                <li><strong>Balanced</strong>: riders within {F.balancedClusterKm} km of each other share one stop in one of their areas and finish by auto or on foot.</li>
                <li><strong>Direct</strong>: the cab drops everyone at their own address, nearest first.</li>
              </ul>
              <p>When riders in a group chose differently, the ride uses Balanced, the middle ground. You can always compare what the other options would have cost.</p>
            </div>
          </details>
          <details className="disclosure">
            <summary>What do other travellers see about me?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>While matching: your first name, likely-ready time, drop-off area, bags and preference. Your flight number is shared only with co-passengers once you’re in a ride together, and your exact drop-off address is never shown to anyone else.</p>
            </div>
          </details>
          <details className="disclosure">
            <summary>How does the {RIDE_CONFIG.pickupWindowMinutes}-minute window work?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>Sanchari estimates when each person is ready: {READINESS_CONFIG.noBagMinutes} minutes after landing with only a cabin bag, {READINESS_CONFIG.baggageBaseMinutes} with one checked bag plus {READINESS_CONFIG.perExtraBagMinutes} per extra bag, then a {READINESS_CONFIG.walkToPickupMinutes}-minute walk. It uses the live estimated or actual landing time when your flight is checked. The {RIDE_CONFIG.pickupWindowMinutes}-minute window starts when the first of you taps <strong>I’ve landed</strong>. Two minutes before it ends, Sanchari shows a reminder and vibrates once where the browser allows. When time’s up, the group decides whether to leave with who’s there or wait {RIDE_CONFIG.extendByMinutes} more minutes. A web page can’t alert you while it’s closed.</p>
            </div>
          </details>
        </div>
      </section>

      <section className="learning-banner">
        <span className="icon-box accent"><CarFront size={22} aria-hidden /></span>
        <div>
          <p className="eyebrow">Landing soon?</p>
          <h2>Share the ride home from COK.</h2>
          <p>Plan now and Sanchari will find who’s landing around your time and going your way.</p>
        </div>
        <a className="button secondary" href="#plan">Plan my arrival →</a>
      </section>
    </>
  );
}
