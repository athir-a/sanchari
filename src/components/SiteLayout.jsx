import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IS_LIVE } from '../services/supabaseClient.js';
import { useAppState } from '../state/AppState.jsx';
import { readJSON, writeJSON } from '../services/storage.js';

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 17c3-6 9-9 15-8.5" strokeDasharray="1.5 3.5" />
        <circle cx="4" cy="17" r="2.4" fill="currentColor" stroke="none" />
        <circle cx="19" cy="8.5" r="2.4" />
      </svg>
    </span>
  );
}

function useDisplayPrefs() {
  const [prefs, setPrefs] = useState(() => readJSON('display', { largeText: false, highContrast: false }));
  useEffect(() => {
    writeJSON('display', prefs);
    document.documentElement.classList.toggle('text-large', prefs.largeText);
  }, [prefs]);
  return [prefs, (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }))];
}

export function SiteLayout({ children }) {
  const { state } = useAppState();
  const [prefs, toggle] = useDisplayPrefs();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const links = [
    { to: '/', label: 'Plan trip', enabled: true, match: ['/'] },
    { to: '/arrivals', label: 'Arrivals', enabled: true, match: ['/arrivals'] },
    { to: '/matches', label: 'Matches', enabled: !!state.trip, match: ['/matches'], count: state.selected.length || null },
    { to: '/compare', label: 'Fare options', enabled: !!state.trip && state.selected.length > 0, match: ['/compare', '/confirm'] },
    { to: '/ride', label: 'Your ride', enabled: !!state.activeRideId, match: ['/ride'] },
  ];

  return (
    <div className={`app${prefs.highContrast ? ' high-contrast' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>

      <div className="utility-bar">
        <div className="container utility-inner">
          <p role="status">
            <span className={`mode-dot${IS_LIVE ? ' live' : ''}`} aria-hidden />
            {IS_LIVE
              ? 'Live mode · trips and rides are shared with matched travellers'
              : 'Demo mode · co-passengers are fictional and data stays in this browser'}
          </p>
          <div className="utility-controls" aria-label="Display settings">
            <button className="utility-toggle" aria-pressed={prefs.largeText} onClick={() => toggle('largeText')}>
              A+ Larger text
            </button>
            <button className="utility-toggle" aria-pressed={prefs.highContrast} onClick={() => toggle('highContrast')}>
              ◐ High contrast
            </button>
          </div>
        </div>
      </div>

      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <BrandMark /> Sanchari
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            <ul>
              {links.map((l) => {
                const active = l.match.includes(pathname);
                return (
                  <li key={l.to}>
                    {l.enabled ? (
                      <Link to={l.to} className="nav-link" aria-current={active ? 'page' : undefined}>
                        {l.label}
                        {l.count ? <span className="nav-count" aria-label={`${l.count} selected`}>{l.count}</span> : null}
                      </Link>
                    ) : (
                      <span className="nav-link" aria-disabled="true" title="Available after the previous step">
                        {l.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <main className="container" id="main" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <p>Sanchari · Shared rides from Cochin International Airport (COK) to Thrissur via Aluva, Angamaly and Chalakudy.</p>
          <p>Fares and times are estimates, not quotes. No taxi is booked and no payment is taken.</p>
        </div>
      </footer>
    </div>
  );
}
