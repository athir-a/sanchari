import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Minus, Plus, Wallet, Scale, CarFront, Route, Receipt, Timer, ArrowRight, CircleCheck, BadgeCheck, CircleHelp, PlaneLanding } from 'lucide-react';
import { Button, Field, Note, useDocumentTitle } from '../components/ui.jsx';
import { DestinationPicker } from '../components/DestinationPicker.jsx';
import { DISTRICTS, getDestination, districtStops } from '../data/airports.js';
import { DEMO_TRIP } from '../data/demoPassengers.js';
import { PREFERENCES, FARE_ASSUMPTIONS as F, RIDE_CONFIG } from '../data/config.js';
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
          <p className="eyebrow">Cochin Airport · Shared rides across Kerala</p>
          <h1>Land together. <em>Ride home</em> together.</h1>
          <p className="hero-copy">
            Tell Sanchari when you land and where you’re headed. It finds travellers landing around the same time and going your way,
            puts you in one cab, and splits the fare by the distance each of you rides.
          </p>
          <div className="button-row">
            <a className="button primary" href="#plan">Plan my ride <ArrowRight size={18} aria-hidden /></a>
            {!IS_LIVE && <Button variant="secondary" onClick={fillExample}>Fill in an example</Button>}
          </div>
        </div>
        <HeroIllustration />
      </section>

      <div className="journey-strip">
        <span><b>01</b> Tell us your flight and where you’re going</span>
        <span><b>02</b> We match you with travellers on your road</span>
        <span><b>03</b> Meet at pickup and share one cab</span>
      </div>

      {state.activeRideId && (
        <div className="quiet-note" style={{ marginBottom: '1.8rem' }}>
          <span className="icon-box"><CarFront size={22} aria-hidden /></span>
          <p>You have a shared ride coming up. <Link to="/ride">Open your ride</Link></p>
        </div>
      )}

      <section className="plan-card input-card" id="plan" style={{ scrollMarginTop: '1.5rem' }}>
        <h2>Plan your ride</h2>
        <p style={{ marginBottom: '1.8rem' }}>Other travellers only see your first name and drop-off area.</p>

        {errorCount > 0 && (
          <Note tone="danger" role="alert">
            Please fix {errorCount === 1 ? '1 field' : `${errorCount} fields`} below.
          </Note>
        )}

        <form ref={formRef} onSubmit={submit} noValidate className="form-grid" style={{ marginTop: errorCount ? '1.4rem' : 0 }}>
          <div className="form-section">
            <h3>Your flight</h3>
            <Field id="displayName" label="Your first name" error={errors.displayName}>
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
            {flightRef ? (
              <p className="verify-row small" aria-live="polite">
                <BadgeCheck size={18} color="var(--primary)" aria-hidden />
                <span><strong>{flightRef.designator}</strong> from {flightRef.origin} · {STATUS_TEXT[flightRef.status]} ·{' '}
                  {flightRef.actualArrival ? `landed ${fmtAirportTime(flightRef.actualArrival)}` : flightRef.estimatedArrival ? `expected ${fmtAirportTime(flightRef.estimatedArrival)}` : `due ${fmtAirportTime(flightRef.scheduledArrival)}`}
                </span>
              </p>
            ) : form.flightNumber ? (
              <div className="verify-row small" aria-live="polite">
                <CircleHelp size={18} aria-hidden />
                <span>{check?.status === 'error' ? check.error.message : 'Check your flight so your landing time stays up to date.'}</span>
                <Button variant="secondary" loading={check?.status === 'loading'} onClick={checkFlight}>Check flight</Button>
              </div>
            ) : (
              <p className="verify-row small muted">
                <PlaneLanding size={18} aria-hidden /> Don’t know your flight number? <Link to="/arrivals">See today’s arrivals</Link>
              </p>
            )}
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
            Find my ride <ArrowRight size={18} aria-hidden />
          </Button>
        </form>
      </section>

      <section className="section" aria-labelledby="why-heading">
        <div className="section-head">
          <p className="eyebrow">Why Sanchari</p>
          <h2 id="why-heading">The ride out of the airport, shared.</h2>
        </div>
        <div className="problem-grid">
          <article className="card interactive">
            <span className="icon-box"><Route size={22} aria-hidden /></span>
            <h3>Matched by route</h3>
            <p>Someone getting off at Chalakudy is a good match for someone going to Kozhikode. The cab passes them on the way.</p>
          </article>
          <article className="card interactive">
            <span className="icon-box"><Receipt size={22} aria-hidden /></span>
            <h3>A fare split that’s fair</h3>
            <p>Everyone shares the pickup charge. Each stretch of road is split between the people still in the cab.</p>
          </article>
          <article className="card interactive">
            <span className="icon-box"><Timer size={22} aria-hidden /></span>
            <h3>Thirty minutes to meet</h3>
            <p>Once the first of you lands, you all have {RIDE_CONFIG.pickupWindowMinutes} minutes to reach the pickup point. Sanchari shows where everyone is.</p>
          </article>
        </div>
      </section>

      <section className="section" aria-labelledby="faq-heading" id="faq">
        <div className="section-head">
          <p className="eyebrow">Questions</p>
          <h2 id="faq-heading">How it works.</h2>
        </div>
        <div className="accordion">
          <details className="disclosure">
            <summary>Who do I get matched with?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>Up to three other travellers who will be out of the airport within {RIDE_CONFIG.pickupWindowMinutes} minutes of you, whose drop-off is near yours or on your way, whose bags fit in the same cab, and who want the same kind of trip. You don’t pick anyone. Sanchari puts the ride together and you say yes or no.</p>
            </div>
          </details>
          <details className="disclosure">
            <summary>How is the fare split?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>The cab costs ₹{F.cab.airportPickupFee} airport pickup + ₹{F.cab.base} base + ₹{F.cab.perKm}/km. The pickup and base charges are shared equally. Each stretch of road is shared by the riders still aboard, so someone getting off earlier pays less. These are estimates, not quotes. You book the cab together at the pickup point and settle up between yourselves.</p>
            </div>
          </details>
          <details className="disclosure">
            <summary>What do Cheapest, Balanced and Direct mean?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <ul className="check-list">
                <li><strong>Cheapest</strong>: the shared cab takes you to a bus or metro hub such as Angamaly KSRTC or Vyttila Hub, and you continue by bus or metro.</li>
                <li><strong>Balanced</strong>: riders who live close together share one stop and finish by auto or on foot.</li>
                <li><strong>Direct</strong>: the cab drops everyone at their own address.</li>
              </ul>
            </div>
          </details>
          <details className="disclosure">
            <summary>What do other travellers see about me?<span className="plus" aria-hidden>+</span></summary>
            <div className="disclosure-body">
              <p>Your first name, roughly when you land, your drop-off area and how many bags you have. Your exact address is never shown to anyone.</p>
            </div>
          </details>
        </div>
      </section>
    </>
  );
}
