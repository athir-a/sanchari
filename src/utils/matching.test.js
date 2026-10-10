import { describe, it, expect } from 'vitest';
import { findCompatiblePassengers, canJoinGroup, evaluatePair } from './matching.js';
import { buildRideOptions, buildOption, soloDirect, cabFare } from './fareCalculation.js';
import { buildDemoCandidates, DEMO_TRIP } from '../data/demoPassengers.js';
import { validateArrival } from './validation.js';
import { tripFromForm } from './trip.js';
import { FARE_ASSUMPTIONS } from '../data/config.js';

const ARRIVAL = '2026-10-11T14:00';
const me = tripFromForm({ ...DEMO_TRIP, arrivalLocal: ARRIVAL });
const candidates = buildDemoCandidates(me.arrivalTime);
const byName = (list, name) => list.find((x) => x.trip.displayName === name);

describe('findCompatiblePassengers', () => {
  const { matches, rejected } = findCompatiblePassengers(me, candidates);

  it('returns the compatible demo passengers', () => {
    const names = matches.map((m) => m.trip.displayName).sort();
    expect(names).toEqual(['Ananya', 'Arjun', 'Joseph', 'Meera', 'Priya', 'Rohan']);
  });

  it('ranks matches by score, best first', () => {
    for (let i = 1; i < matches.length; i++) expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
  });

  it('rejects Kabir on arrival time', () => expect(byName(rejected, 'Kabir').code).toBe('time'));
  it('rejects Farah on destination', () => expect(byName(rejected, 'Farah').code).toBe('destination'));
  it('rejects Vikram on luggage', () => expect(byName(rejected, 'Vikram').code).toBe('luggage'));
  it('rejects Ishaan on airport', () => expect(byName(rejected, 'Ishaan').code).toBe('airport'));
  it('matches riders whose drop-off lies along the route', () => {
    const r = byName(matches, 'Rohan');
    expect(r.metrics.gapKm).toBeGreaterThan(20);
    expect(r.reasons).toContain('Chalakudy is on your way');
  });
  it('honours a stricter detour limit', () => {
    const strict = findCompatiblePassengers({ ...me, maxDetourMinutes: 10 }, candidates);
    expect(strict.matches.length).toBeLessThanOrEqual(matches.length);
    strict.matches.forEach((m) => expect(m.metrics.detour).toBeLessThanOrEqual(10));
  });

  it('respects a configurable time window', () => {
    const wide = findCompatiblePassengers(me, candidates, { arrivalWindowMinutes: 120 });
    expect(wide.matches.map((m) => m.trip.displayName)).toContain('Kabir');
  });

  it('never pairs direct-only with cheapest riders', () => {
    const direct = { ...me, preference: 'direct' };
    const res = findCompatiblePassengers(direct, candidates);
    expect(byName(res.rejected, 'Rohan').code).toBe('preference');
  });

  it('explains each match', () => {
    const a = byName(matches, 'Ananya');
    expect(a.reasons[0]).toBe('Arriving 12 min apart');
    expect(a.estimatedSavings).toBeGreaterThan(0);
  });
});

describe('canJoinGroup', () => {
  const t = (n) => candidates.find((c) => c.displayName === n);
  it('blocks a direct rider joining a cheapest rider', () => {
    expect(canJoinGroup(me, [t('Rohan')], t('Meera')).ok).toBe(false);
  });
  it('allows compatible riders together', () => {
    expect(canJoinGroup(me, [t('Ananya')], t('Meera')).ok).toBe(true);
  });
  it('limits group size', () => {
    expect(canJoinGroup(me, [t('Ananya'), t('Meera'), t('Joseph')], t('Rohan')).ok).toBe(false);
  });
});

describe('fares', () => {
  const ananya = candidates.find((c) => c.displayName === 'Ananya');
  const meera = candidates.find((c) => c.displayName === 'Meera');

  it('splits the cab proportionately: shares add up and the shorter ride pays less', () => {
    const rohan = candidates.find((c) => c.displayName === 'Rohan');
    const opt = buildOption('direct', me, [rohan]);
    const [mine, his] = opt.members;
    expect(Math.abs(mine.cost + his.cost - opt.cabFare)).toBeLessThanOrEqual(1);
    expect(his.cost).toBeLessThan(mine.cost);
    expect(opt.transfers).toBe(0);
  });

  it('balanced never strands a rider with a long auto ride', () => {
    const rohan = candidates.find((c) => c.displayName === 'Rohan');
    const opt = buildOption('balanced', me, [rohan]);
    expect(opt.stops.length).toBe(2);
  });

  it('adds public transport separately for the cheapest option', () => {
    const opt = buildOption('cheapest', me, [ananya]);
    const mine = opt.members[0];
    expect(opt.modes).toContain('Bus');
    expect(mine.cost).toBeGreaterThan(Math.round(opt.cabFare / 2));
    expect(opt.totalCost).toBeGreaterThan(opt.cabFare);
  });

  it('cheapest is the lowest-cost option for the user', () => {
    const [c, b, d] = buildRideOptions(me, [ananya]);
    expect(c.perPerson).toBeLessThan(b.perPerson);
    expect(c.perPerson).toBeLessThan(d.perPerson);
    expect(d.savings).toBeGreaterThan(0);
  });

  it('marks cheapest unavailable when a co-passenger is direct-only', () => {
    const [c] = buildRideOptions(me, [meera]);
    expect(c.available).toBe(false);
    expect(c.unavailableReason).toMatch(/Meera/);
  });

  it('uses an SUV when bags exceed a sedan', () => {
    const heavy = { ...me, luggageCount: 4 };
    const opt = buildOption('direct', heavy, [ananya]);
    expect(opt.vehicle).toBe('SUV');
  });

  it('solo fare follows the fare formula', () => {
    const s = soloDirect(me);
    expect(s.fare).toBe(cabFare(s.km));
    expect(cabFare(10)).toBe(FARE_ASSUMPTIONS.cab.airportPickupFee + FARE_ASSUMPTIONS.cab.base + 220);
  });
});

describe('validateArrival', () => {
  const now = new Date('2026-10-11T10:00').getTime();
  it('accepts the demo trip', () => {
    expect(validateArrival({ ...DEMO_TRIP, arrivalLocal: ARRIVAL }, now)).toEqual({});
  });
  it('flags missing fields', () => {
    const e = validateArrival({ displayName: '', airportCode: '', arrivalLocal: '', destinationId: '', luggageCount: 1, preference: '', maxDetourMinutes: 25 }, now);
    expect(Object.keys(e).sort()).toEqual(['airportCode', 'arrivalLocal', 'destinationId', 'displayName', 'preference']);
  });
  it('only accepts the served airport', () => {
    const e = validateArrival({ ...DEMO_TRIP, airportCode: 'TRV', arrivalLocal: ARRIVAL }, now);
    expect(e.airportCode).toBeTruthy();
    expect(e.destinationId).toBeTruthy();
  });
});

describe('evaluatePair', () => {
  it('is symmetric on compatibility for time', () => {
    const k = candidates.find((c) => c.displayName === 'Kabir');
    expect(evaluatePair(me, k).ok).toBe(false);
    expect(evaluatePair(k, me).ok).toBe(false);
  });
});
