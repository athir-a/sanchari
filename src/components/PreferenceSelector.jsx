import { Wallet, Scale, CarFront, Check } from 'lucide-react';
import { PREFERENCES } from '../data/config.js';

const ICONS = { cheapest: Wallet, balanced: Scale, direct: CarFront };

export function PreferenceSelector({ value, onChange, error }) {
  return (
    <fieldset>
      <legend className="label">How do you want to travel?</legend>
      <div role="radiogroup" className="grid gap-2">
        {Object.values(PREFERENCES).map((p) => {
          const Icon = ICONS[p.id];
          const active = value === p.id;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={active}
              key={p.id}
              onClick={() => onChange(p.id)}
              className={`flex min-h-[64px] items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-teal bg-teal-soft/70 ring-1 ring-teal' : 'border-line bg-white hover:border-ink-2/30'}`}
            >
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-teal text-white' : 'bg-sand text-ink-2'}`}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{p.label}</span>
                <span className="block text-[13px] leading-snug text-mute">{p.short}</span>
              </span>
              {active && <Check className="size-5 text-teal" aria-hidden />}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[13px] text-rose" role="alert">{error}</p>}
    </fieldset>
  );
}
