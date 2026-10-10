import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-teal text-white hover:bg-teal-deep shadow-[0_8px_20px_-8px_rgba(12,107,92,.6)]',
  secondary: 'bg-white text-ink border border-line hover:border-ink-2/30',
  ghost: 'bg-transparent text-ink-2 hover:bg-ink/5',
  danger: 'bg-white text-rose border border-rose/30 hover:bg-rose-soft',
  amber: 'bg-amber text-white hover:brightness-95',
};

export function Button({ variant = 'primary', size = 'md', loading = false, className = '', children, disabled, ...rest }) {
  const sizes = { md: 'min-h-[52px] px-5 text-[15px]', sm: 'min-h-[40px] px-3.5 text-sm', lg: 'min-h-[58px] px-6 text-base' };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[.98] disabled:opacity-45 disabled:pointer-events-none ${VARIANTS[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({ variant = 'secondary', className = '', children, ...rest }) {
  return (
    <a
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition min-h-[44px] px-4 text-sm ${VARIANTS[variant]} ${className}`}
      target="_blank"
      rel="noreferrer"
      {...rest}
    >
      {children}
    </a>
  );
}

export function Field({ id, label, hint, error, optional, children }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} {optional && <span className="font-normal text-faint">· optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-[13px] text-rose" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-mute">{hint}</p>
      ) : null}
    </div>
  );
}

const TONES = {
  neutral: 'bg-ink/5 text-ink-2',
  teal: 'bg-teal-soft text-teal-deep',
  amber: 'bg-amber-soft text-amber',
  rose: 'bg-rose-soft text-rose',
  sky: 'bg-sky-soft text-sky',
};

export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}

export function Notice({ tone = 'neutral', icon: Icon, title, children, className = '' }) {
  return (
    <div className={`flex gap-3 rounded-2xl p-3.5 text-sm ${TONES[tone]} ${className}`} role={tone === 'rose' ? 'alert' : undefined}>
      {Icon && <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>
      </div>
    </div>
  );
}
