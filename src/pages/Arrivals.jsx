import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeading, Field, useDocumentTitle } from '../components/ui.jsx';
import { ArrivalsBoardView } from '../components/ArrivalsBoardView.jsx';
import { getArrivals, searchFlight, flightSnapshot } from '../services/flightApi.js';
import { useAppState } from '../state/AppState.jsx';
import { airportDate, fmtAirportDate, isoToLocalInput } from '../utils/timeFormatting.js';

const WINDOWS = [
  { id: 'day', label: 'Whole day', from: 0, to: 24 },
  { id: 'night', label: '00:00–06:00', from: 0, to: 6 },
  { id: 'morning', label: '06:00–12:00', from: 6, to: 12 },
  { id: 'afternoon', label: '12:00–18:00', from: 12, to: 18 },
  { id: 'evening', label: '18:00–24:00', from: 18, to: 24 },
];

export default function Arrivals() {
  useDocumentTitle('COK arrivals');
  const navigate = useNavigate();
  const { state, update } = useAppState();
  const [date, setDate] = useState(() => airportDate(0));
  const [windowId, setWindowId] = useState('day');
  const [filter, setFilter] = useState('');
  const [board, setBoard] = useState({ status: 'loading', data: null, error: null });
  const [lookup, setLookup] = useState(null);
  const reqId = useRef(0);

  const dates = [-1, 0, 1, 2, 3].map((d) => airportDate(d));
  const win = WINDOWS.find((w) => w.id === windowId);

  // One request per user action / filter change — never on every render.
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setBoard((b) => ({ ...b, status: 'loading' }));
    const r = await getArrivals({ date, from: win.from, to: win.to });
    if (id !== reqId.current) return;
    setBoard((b) => (r.ok ? { status: 'ready', data: r.data, error: null } : { status: 'error', data: b.data && b.data.date === date ? b.data : null, error: r.error }));
  }, [date, win.from, win.to]);

  useEffect(() => {
    load();
  }, [load]);

  const choose = (f) => {
    const best = f.arrival.actual || f.arrival.estimated || f.arrival.scheduled;
    update((s) => ({
      form: { ...s.form, flightNumber: f.designator, arrivalLocal: best ? isoToLocalInput(best) : s.form.arrivalLocal, flightRef: flightSnapshot(f, f.freshness) },
    }));
    navigate('/#plan');
  };

  const doLookup = async (text) => {
    setLookup({ status: 'loading' });
    const r = await searchFlight({ number: text, date });
    if (r.ok) {
      setLookup(null);
      setBoard((b) => ({ ...b, data: { ...b.data, flights: [r.data.flight, ...(b.data?.flights || []).filter((x) => x.id !== r.data.flight.id)] } }));
      setFilter(r.data.flight.designator);
    } else setLookup({ status: 'error', error: r.error });
  };

  return (
    <>
      <PageHeading eyebrow="Cochin International Airport · Arrivals" title={<>Find <em>your</em> flight.</>}>
        Pick your arriving flight so Sanchari can plan around its real arrival time. Data comes from Sanchari’s server and the licensed provider configured there — times are shown in IST.
      </PageHeading>

      <div className="controls-row" style={{ marginBottom: '1.6rem' }}>
        <Field id="arr-date" label="Date">
          <select id="arr-date" className="select input" value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d, i) => (
              <option key={d} value={d}>{fmtAirportDate(d)}{i === 1 ? ' (today)' : ''}</option>
            ))}
          </select>
        </Field>
        <Field id="arr-window" label="Arriving between (IST)">
          <select id="arr-window" className="select input" value={windowId} onChange={(e) => setWindowId(e.target.value)}>
            {WINDOWS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </Field>
      </div>

      <ArrivalsBoardView
        state={board}
        filter={filter}
        onFilter={(v) => { setFilter(v); setLookup(null); }}
        onRefresh={load}
        onSelect={choose}
        onLookup={doLookup}
        lookup={lookup}
        selectedId={state.form.flightRef?.id}
      />
    </>
  );
}
