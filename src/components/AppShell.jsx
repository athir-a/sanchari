import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Radio, CarFront, X } from 'lucide-react';
import { IS_LIVE } from '../services/supabaseClient.js';
import { useAppState } from '../state/AppState.jsx';

const STEPS = ['Arrival', 'Matches', 'Options', 'Confirm'];

function ModeBadge() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-bold ${IS_LIVE ? 'bg-teal-soft text-teal-deep' : 'bg-amber-soft text-amber'}`}
      >
        {IS_LIVE ? <Radio className="size-3.5" aria-hidden /> : <FlaskConical className="size-3.5" aria-hidden />}
        {IS_LIVE ? 'Live' : 'Demo'}
      </button>
      {open && (
        <div className="glass rise absolute right-0 top-11 z-30 w-72 rounded-2xl p-4 text-sm text-ink-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-bold text-ink">{IS_LIVE ? 'Live mode' : 'Demo mode'}</p>
            <button onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full hover:bg-ink/5" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {IS_LIVE ? (
            <p>Trips and rides are stored in Supabase and shared with the travellers you match. Statuses sync in real time.</p>
          ) : (
            <p>Co-passengers are fictional and placed around your arrival time. Everything is saved in this browser only. Fares and times are estimates.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({ step, title, back, children, footer }) {
  const navigate = useNavigate();
  const { state } = useAppState();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <header className="glass sticky top-0 z-20 rounded-b-3xl px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex h-11 items-center gap-2">
          {back ? (
            <button
              onClick={() => navigate(back)}
              className="-ml-1 grid size-11 place-items-center rounded-full hover:bg-ink/5"
              aria-label="Back"
            >
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <Link to="/" className="flex items-center gap-2 font-bold tracking-tight" aria-label="Sanchari home">
              <img src="/favicon.svg" alt="" className="size-7" />
              <span className="display text-xl">Sanchari</span>
            </Link>
          )}
          {back && <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold">{title}</h1>}
          <div className="ml-auto flex items-center gap-2">
            {state.activeRideId && step != null && (
              <Link to="/ride" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-bold text-white">
                <CarFront className="size-3.5" aria-hidden /> Your ride
              </Link>
            )}
            <ModeBadge />
          </div>
        </div>
        {step != null && (
          <div className="mt-2" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-teal' : 'bg-ink/10'}`} />
              ))}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-mute">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </p>
          </div>
        )}
      </header>
      <main className="flex-1 px-4 pb-6 pt-5">{children}</main>
      {footer && (
        <div className="sticky bottom-0 z-20 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
          <div className="glass rounded-3xl p-2.5">{footer}</div>
        </div>
      )}
    </div>
  );
}
