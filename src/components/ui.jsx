import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

/** variant: primary | secondary | warning */
export function Button({ variant = 'primary', block = false, loading = false, className = '', children, disabled, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={`button ${variant}${block ? ' block' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 size={16} className="spin" aria-hidden />}
      {children}
    </button>
  );
}

export function TextButton({ danger = false, className = '', children, ...rest }) {
  return (
    <button type="button" className={`text-button${danger ? ' danger' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({ id, label, hint, error, optional, children }) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label} {optional && <span className="optional">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="error" role="alert">{error}</p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Tag({ tone = '', children }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function Note({ tone = '', title, children, className = '', role }) {
  return (
    <div className={`note ${tone} ${className}`} role={role}>
      {title && <strong style={{ display: 'block', marginBottom: '0.2rem' }}>{title}</strong>}
      {children}
    </div>
  );
}

export function PageHeading({ eyebrow, title, children }) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <p className="lead">{children}</p>}
    </header>
  );
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = `${title} | Sanchari`;
  }, [title]);
}

const STEPS = ['Plan your arrival', 'Choose co-passengers', 'Compare fares', 'Confirm the ride'];

/** Journey strip showing where the user is in the booking flow. */
export function JourneySteps({ current }) {
  return (
    <ol className="journey-strip four steps-progress" aria-label="Journey progress">
      {STEPS.map((s, i) => {
        const state = i < current ? 'is-done' : i === current ? 'is-current' : 'is-upcoming';
        return (
          <li key={s} className={state} aria-current={i === current ? 'step' : undefined}>
            <b>{String(i + 1).padStart(2, '0')}</b> {s}
            {i < current && <span className="sr-only"> (done)</span>}
          </li>
        );
      })}
    </ol>
  );
}
