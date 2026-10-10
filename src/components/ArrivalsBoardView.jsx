import { RefreshCw, Search, PlaneLanding, CircleAlert, Clock } from 'lucide-react';
import { Button, Tag, Note } from './ui.jsx';
import { FRESHNESS_LABEL, STATUS_TEXT } from '../services/flightApi.js';
import { fmtAirportTime, fmtAirportDate, ageText } from '../utils/timeFormatting.js';

const STATUS_TONE = { LANDED: 'brand', EN_ROUTE: '', SCHEDULED: 'plain', CANCELLED: 'danger', DIVERTED: 'accent', NOT_OPERATIONAL: 'danger', UNKNOWN: 'plain' };

function minutesDiff(a, b) {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60000);
}

/** Latest known arrival, labelled honestly as actual, estimated or scheduled-only. */
export function LatestArrival({ f }) {
  if (f.arrival.actual) {
    return <span><strong>{fmtAirportTime(f.arrival.actual)}</strong> <span className="muted small">actual ({f.arrival.actualKind || 'arrival'})</span></span>;
  }
  if (f.arrival.estimated) {
    const d = f.arrival.scheduled ? minutesDiff(f.arrival.estimated, f.arrival.scheduled) : 0;
    return (
      <span>
        <strong>{fmtAirportTime(f.arrival.estimated)}</strong> <span className="muted small">estimated{d ? ` · ${d > 0 ? `${d} min late` : `${-d} min early`}` : ''}</span>
      </span>
    );
  }
  return <span className="muted small">No live estimate — scheduled only</span>;
}

const isLiveInfo = (f) => !!(f.arrival.estimated || f.arrival.actual || ['EN_ROUTE', 'LANDED', 'CANCELLED', 'DIVERTED'].includes(f.status.normalized));

export function FreshnessBar({ data, loading }) {
  const state = data.freshness;
  const tone = state === 'live' ? 'brand' : state === 'cached' ? '' : 'accent';
  return (
    <div className="stack-sm" aria-live="polite">
      <div className="tags" style={{ alignItems: 'center' }}>
        <Tag tone={tone}>{FRESHNESS_LABEL[state] || state}</Tag>
        <span className="small muted">
          Source: {data.provider.label}
          {data.retrievedAt && <> · retrieved {fmtAirportTime(data.retrievedAt)} IST{state !== 'live' && data.ageSeconds != null ? ` (${ageText(data.ageSeconds)})` : ''}</>}
          {loading && ' · refreshing…'}
        </span>
      </div>
      {state === 'stale' && <Note tone="accent" role="alert"><strong>These times may be out of date.</strong> {data.notice || 'Sanchari couldn’t reach the flight-data provider and is showing the last data it received.'}</Note>}
      {!data.complete && state !== 'stale' && <Note tone="accent" role="alert">{data.notice}</Note>}
    </div>
  );
}

export function ArrivalsBoardView({ state, filter, onFilter, onRefresh, onSelect, onLookup, lookup, selectedId }) {
  const { status, data, error } = state;

  if (status === 'loading' && !data) {
    return (
      <div className="stack" aria-busy="true" aria-label="Loading arrivals">
        <div className="skeleton" style={{ height: 70 }} />
        <div className="skeleton" />
      </div>
    );
  }

  if (status === 'error' && !data) {
    const notConnected = error?.code === 'provider_not_configured';
    return (
      <section className="result-card alert" role="alert">
        <p className="eyebrow">{notConnected ? 'Live flight data not connected' : 'Couldn’t load arrivals'}</p>
        <h2>{notConnected ? 'No verified flight data right now.' : 'The arrivals board is unavailable.'}</h2>
        <p style={{ marginTop: '0.5rem' }}>{error?.message}</p>
        <p style={{ marginTop: '0.5rem' }}>
          {notConnected
            ? 'Sanchari only shows flights from a licensed data provider — it never fills this board with sample flights. You can still plan your ride by typing your flight and landing time; it will be marked unverified.'
            : 'You can retry, or plan your ride with your own landing time (marked unverified).'}
        </p>
        <div className="button-row" style={{ marginTop: '1.2rem' }}>
          {!notConnected && <Button onClick={onRefresh}><RefreshCw size={18} aria-hidden /> Try again</Button>}
          <a className={`button ${notConnected ? 'primary' : 'secondary'}`} href="/#plan">Enter my flight manually</a>
        </div>
      </section>
    );
  }

  const q = filter.trim().toUpperCase().replace(/\s+/g, '');
  const flights = (data?.flights || []).filter((f) => {
    if (!q) return true;
    const hay = [f.designator, ...f.codeshares].map((d) => d.replace(/\s+/g, '')).join('|') + `|${f.origin.code}|${(f.origin.city || '').toUpperCase()}`;
    return hay.includes(q);
  });
  const looksLikeFlight = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(q);

  return (
    <div className="stack">
      <div className="arrivals-tools">
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="flight-filter" className="label">Find your flight</label>
          <div className="input-with-icon">
            <Search size={18} aria-hidden />
            <input id="flight-filter" className="input" placeholder="Flight number or origin, e.g. 6E 2178 or Dubai" value={filter} onChange={(e) => onFilter(e.target.value)} />
          </div>
        </div>
        <Button variant="secondary" onClick={onRefresh} loading={status === 'loading'} aria-label="Refresh arrivals">
          {status !== 'loading' && <RefreshCw size={18} aria-hidden />} Refresh
        </Button>
      </div>

      {data && <FreshnessBar data={data} loading={status === 'loading'} />}
      {status === 'error' && data && <Note tone="danger" role="alert">Refresh failed: {error?.message} Showing the previous result.</Note>}

      {flights.length === 0 ? (
        <div className="quiet-note">
          <span className="icon-box"><PlaneLanding size={22} aria-hidden /></span>
          <div className="stack-sm">
            <p>
              {data?.flights.length
                ? `No arrivals match “${filter}” in this window.`
                : `The provider returned no arrivals for ${data ? fmtAirportDate(data.date) : 'this date'} in this time window.`}
            </p>
            {looksLikeFlight && onLookup && (
              <div className="button-row">
                <Button variant="secondary" loading={lookup?.status === 'loading'} onClick={() => onLookup(filter)}>Look up {filter.toUpperCase()} directly</Button>
              </div>
            )}
            {lookup?.status === 'error' && <p className="error">{lookup.error.message}</p>}
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="arrivals-table">
            <caption className="sr-only">Arrivals at {data.airport} on {data.date}, times in IST</caption>
            <thead>
              <tr>
                <th scope="col">Flight</th>
                <th scope="col">From</th>
                <th scope="col">Scheduled</th>
                <th scope="col">Latest</th>
                <th scope="col">Status</th>
                <th scope="col">Terminal · gate · belt</th>
                <th scope="col"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => (
                <tr key={f.providerFlightId || f.id} className={selectedId === f.id ? 'is-selected' : ''}>
                  <th scope="row" data-label="Flight">
                    <span className="flight-code">{f.designator}</span>
                    <span className="muted small d-block">{f.airline.name || f.airline.code}</span>
                    {f.codeshares.length > 0 && <span className="muted small d-block">also {f.codeshares.join(', ')}</span>}
                  </th>
                  <td data-label="From">{f.origin.city || f.origin.code} <span className="muted small">({f.origin.code})</span></td>
                  <td data-label="Scheduled" className="tabnum">{fmtAirportTime(f.arrival.scheduled)}</td>
                  <td data-label="Latest" className="tabnum"><LatestArrival f={f} /></td>
                  <td data-label="Status">
                    <span title={f.status.raw ? `Provider status: ${f.status.rawLabel || f.status.raw}` : undefined}>
                      <Tag tone={STATUS_TONE[f.status.normalized]}>{STATUS_TEXT[f.status.normalized]}</Tag>
                    </span>
                    {!isLiveInfo(f) && <span className="muted small d-block">schedule data</span>}
                  </td>
                  <td data-label="Terminal · gate · belt" className="small">
                    {[f.terminal && `T${f.terminal}`, f.gate && `Gate ${f.gate}`, f.baggage && `Belt ${f.baggage}`].filter(Boolean).join(' · ') || <span className="muted">Not provided</span>}
                    {f.providerUpdatedAt && <span className="muted small d-block"><Clock size={12} aria-hidden style={{ display: 'inline', verticalAlign: '-1px' }} /> updated {fmtAirportTime(f.providerUpdatedAt)}</span>}
                  </td>
                  <td>
                    <Button variant={selectedId === f.id ? 'primary' : 'secondary'} disabled={f.status.normalized === 'CANCELLED'} onClick={() => onSelect(f)} aria-label={`Use ${f.designator} for my journey`}>
                      {selectedId === f.id ? 'Selected' : 'Use this flight'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted"><CircleAlert size={13} aria-hidden style={{ display: 'inline', verticalAlign: '-2px' }} /> Times are airport-local (IST). “Scheduled only” means the provider has no live estimate yet — Sanchari never assumes a flight has landed.</p>
    </div>
  );
}
