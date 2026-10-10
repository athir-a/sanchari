import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Minus, Plus, Sparkles, CarFront, ArrowRight } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';
import { Button, Field, Notice } from '../components/ui.jsx';
import { PreferenceSelector } from '../components/PreferenceSelector.jsx';
import { AIRPORTS, ZONES, destinationsForAirport } from '../data/airports.js';
import { DEMO_TRIP } from '../data/demoPassengers.js';
import { useAppState } from '../state/AppState.jsx';
import { validateArrival } from '../utils/validation.js';
import { tripFromForm } from '../utils/trip.js';
import { toLocalInput } from '../utils/timeFormatting.js';
import { saveTrip } from '../services/tripService.js';
import { IS_LIVE } from '../services/supabaseClient.js';

const ORDER = ['displayName', 'flightNumber', 'airportCode', 'arrivalLocal', 'destinationId', 'dropoffAddress', 'luggageCount', 'preference'];

export default function ArrivalSetup() {
  const { state, update } = useAppState();
  const navigate = useNavigate();
  const form = state.form;
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const formRef = useRef(null);

  const set = (k, v) => {
    update((s) => {
      const next = { ...s.form, [k]: v };
      if (k === 'airportCode' && next.destinationId && !next.destinationId.startsWith(v.toLowerCase())) next.destinationId = '';
      return { form: next };
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const fillDemo = () => {
    const arrival = new Date(Date.now() + 75 * 60000);
    arrival.setMinutes(Math.ceil(arrival.getMinutes() / 5) * 5, 0, 0);
    update({ form: { ...DEMO_TRIP, arrivalLocal: toLocalInput(arrival) } });
    setErrors({});
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
      const saved = await saveTrip(tripFromForm(form), state.trip?.id);
      update({ trip: saved, selected: [], optionKind: null });
      navigate('/matches');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dests = destinationsForAirport(form.airportCode);
  const zonesHere = [...new Set(dests.map((d) => d.zone))];
  const inv = (k) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});

  return (
    <AppShell
      step={0}
      footer={
        <Button type="submit" form="arrival-form" size="lg" className="w-full" loading={saving}>
          Find my ride <ArrowRight className="size-5" aria-hidden />
        </Button>
      }
    >
      <section className="rise mb-5">
        <p className="eyebrow">Before you fly</p>
        <h1 className="display mt-1 text-[30px] leading-[1.1] text-ink">Share the ride home from the airport.</h1>
        <p className="mt-2 text-[15px] text-mute">Tell us when you land and where you’re going. We’ll find travellers heading your way.</p>
      </section>

      {state.activeRideId && (
        <Notice tone="teal" icon={CarFront} className="mb-4" title="You have a ride in progress">
          <Link to="/ride" className="font-semibold underline underline-offset-2">Open your ride</Link> — or plan a new trip below.
        </Notice>
      )}

      {!IS_LIVE && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-amber/40 bg-amber-soft/50 p-3">
          <p className="text-[13px] leading-snug text-ink-2">Demo mode: co-passengers are fictional.</p>
          <Button type="button" variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={fillDemo}>
            <Sparkles className="size-4 text-amber" aria-hidden /> Fill demo trip
          </Button>
        </div>
      )}

      <form id="arrival-form" ref={formRef} onSubmit={submit} noValidate className="grid gap-5">
        <div className="card grid gap-4 p-4">
          <Field id="displayName" label="Your first name" hint="Shown to co-passengers so they can find you." error={errors.displayName}>
            <input id="displayName" name="displayName" className="field" autoComplete="given-name" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} {...inv('displayName')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="flightNumber" label="Flight" optional error={errors.flightNumber}>
              <input id="flightNumber" name="flightNumber" className="field uppercase" placeholder="6E 2178" value={form.flightNumber} onChange={(e) => set('flightNumber', e.target.value)} {...inv('flightNumber')} />
            </Field>
            <Field id="airportCode" label="Landing at" error={errors.airportCode}>
              <select id="airportCode" name="airportCode" className="field" value={form.airportCode} onChange={(e) => set('airportCode', e.target.value)} {...inv('airportCode')}>
                {Object.values(AIRPORTS).map((a) => (
                  <option key={a.code} value={a.code}>{a.code} · {a.city}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="arrivalLocal" label="Expected landing time" error={errors.arrivalLocal}>
            <input id="arrivalLocal" name="arrivalLocal" type="datetime-local" className="field" value={form.arrivalLocal} onChange={(e) => set('arrivalLocal', e.target.value)} {...inv('arrivalLocal')} />
          </Field>
        </div>

        <div className="card grid gap-4 p-4">
          <Field id="destinationId" label="Where are you heading?" error={errors.destinationId}>
            <select id="destinationId" name="destinationId" className="field" value={form.destinationId} onChange={(e) => set('destinationId', e.target.value)} {...inv('destinationId')}>
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
            <input id="dropoffAddress" name="dropoffAddress" className="field" placeholder="Building, street or landmark" autoComplete="street-address" value={form.dropoffAddress} onChange={(e) => set('dropoffAddress', e.target.value)} {...inv('dropoffAddress')} />
          </Field>
          <Field id="luggageCount" label="Bags" error={errors.luggageCount}>
            <div className="flex items-center gap-3">
              <button type="button" className="grid size-12 place-items-center rounded-2xl border border-line bg-white disabled:opacity-40" onClick={() => set('luggageCount', Math.max(0, Number(form.luggageCount) - 1))} disabled={Number(form.luggageCount) <= 0} aria-label="Fewer bags">
                <Minus className="size-5" />
              </button>
              <output id="luggageCount" name="luggageCount" aria-live="polite" className="tabnum min-w-[3ch] text-center text-2xl font-bold">{form.luggageCount}</output>
              <button type="button" className="grid size-12 place-items-center rounded-2xl border border-line bg-white disabled:opacity-40" onClick={() => set('luggageCount', Math.min(6, Number(form.luggageCount) + 1))} disabled={Number(form.luggageCount) >= 6} aria-label="More bags">
                <Plus className="size-5" />
              </button>
              <span className="text-[13px] text-mute">Checked + large cabin bags</span>
            </div>
          </Field>
        </div>

        <PreferenceSelector value={form.preference} onChange={(v) => set('preference', v)} error={errors.preference} />

        {saveError && <Notice tone="rose" title="Couldn’t save your trip">{saveError}</Notice>}
      </form>
    </AppShell>
  );
}
