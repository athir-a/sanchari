// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import fs from 'node:fs';
import { ArrivalsBoardView } from './ArrivalsBoardView.jsx';
import { normalizeFlexResponse } from '../../server/flights/providers/flexNormalize.js';

afterEach(cleanup);

const FIXTURE = JSON.parse(fs.readFileSync('server/flights/__fixtures__/flex-cok-arrivals.json', 'utf8'));
const flights = normalizeFlexResponse(FIXTURE, { retrievedAt: '2026-10-10T22:00:00.000Z', expectAirport: 'COK' }).flights;
const data = (over = {}) => ({
  airport: 'COK', date: '2026-10-11', timeZone: 'Asia/Kolkata', provider: { id: 'flightstats-flex', label: 'Cirium FlightStats Flex API', configured: true },
  freshness: 'live', complete: true, retrievedAt: '2026-10-10T22:00:00.000Z', ageSeconds: 0, notice: null, flights, ...over,
});
const props = (state, extra = {}) => ({ state, filter: '', onFilter: vi.fn(), onRefresh: vi.fn(), onSelect: vi.fn(), onLookup: vi.fn(), ...extra });

describe('ArrivalsBoardView', () => {
  it('shows a loading state', () => {
    render(<ArrivalsBoardView {...props({ status: 'loading', data: null })} />);
    expect(screen.getByLabelText('Loading arrivals').getAttribute('aria-busy')).toBe('true');
  });

  it('explains when no provider is connected and shows no flights', () => {
    render(<ArrivalsBoardView {...props({ status: 'error', data: null, error: { code: 'provider_not_configured', message: 'Live flight data is not connected on this server.' } })} />);
    expect(screen.getByText('No verified flight data right now.')).toBeTruthy();
    expect(screen.getByText(/never presents sample flights as real/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('offers a retry on provider failure', () => {
    const p = props({ status: 'error', data: null, error: { code: 'upstream_timeout', message: 'The flight-data provider took too long to respond.' } });
    render(<ArrivalsBoardView {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(p.onRefresh).toHaveBeenCalled();
  });

  it('renders flights with scheduled vs estimated vs actual clearly separated', () => {
    render(<ArrivalsBoardView {...props({ status: 'ready', data: data() })} />);
    const row = (code) => screen.getByText(code).closest('tr');
    expect(within(row('SQ 536')).getByText(/actual \(gate\)/)).toBeTruthy();
    expect(within(row('6E 2178')).getByText(/estimated · 20 min late/)).toBeTruthy();
    expect(within(row('EK 530')).getByText(/No live estimate — scheduled only/)).toBeTruthy();
    expect(within(row('QR 516')).getByText('Status unknown')).toBeTruthy();
    expect(within(row('SQ 536')).getByText(/T3 · Gate D4 · Belt 5/)).toBeTruthy();
    expect(screen.getByText('Live — just fetched')).toBeTruthy();
  });

  it('labels cached data with its age', () => {
    render(<ArrivalsBoardView {...props({ status: 'ready', data: data({ freshness: 'cached', ageSeconds: 180 }) })} />);
    expect(screen.getByText('Cached')).toBeTruthy();
    expect(screen.getByText(/3 min old/)).toBeTruthy();
  });

  it('warns loudly about stale data', () => {
    render(<ArrivalsBoardView {...props({ status: 'ready', data: data({ freshness: 'stale', ageSeconds: 1500, notice: 'The provider could not be reached; showing the last data Sanchari received.' }) })} />);
    expect(screen.getByRole('alert').textContent).toMatch(/may be out of date/);
    expect(screen.getByText(/Stale — provider unreachable/)).toBeTruthy();
  });

  it('shows partial-result notices', () => {
    render(<ArrivalsBoardView {...props({ status: 'ready', data: data({ complete: false, freshness: 'unavailable', notice: 'Some hours (06:00–12:00) could not be loaded.' }) })} />);
    expect(screen.getByRole('alert').textContent).toMatch(/06:00–12:00/);
  });

  it('shows an empty state and a direct lookup for flight numbers', () => {
    const p = props({ status: 'ready', data: data({ flights: [] }) }, { filter: '6E 9' });
    render(<ArrivalsBoardView {...p} />);
    expect(screen.getByText(/returned no arrivals/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Look up 6E 9 directly/ }));
    expect(p.onLookup).toHaveBeenCalledWith('6E 9');
  });

  it('filters by flight number including codeshares, and selects a flight', () => {
    const p = props({ status: 'ready', data: data() }, { filter: 'ai8298' });
    render(<ArrivalsBoardView {...p} />);
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + SQ 536
    fireEvent.click(screen.getByRole('button', { name: 'Use SQ 536 for my journey' }));
    expect(p.onSelect).toHaveBeenCalledWith(expect.objectContaining({ designator: 'SQ 536' }));
  });

  it('does not let a cancelled flight be selected', () => {
    render(<ArrivalsBoardView {...props({ status: 'ready', data: data() })} />);
    expect(screen.getByRole('button', { name: 'Use AI 507 for my journey' }).disabled).toBe(true);
  });

  it('keeps previous data visible if a refresh fails', () => {
    render(<ArrivalsBoardView {...props({ status: 'error', data: data(), error: { message: 'Timed out.' } })} />);
    expect(screen.getByText(/Refresh failed: Timed out\./)).toBeTruthy();
    expect(screen.getByText('SQ 536')).toBeTruthy();
  });
});
