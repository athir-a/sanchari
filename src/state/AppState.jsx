import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { readJSON, writeJSON } from '../services/storage.js';
import { MATCHING_CONFIG } from '../data/config.js';

export const EMPTY_FORM = {
  displayName: '',
  flightNumber: '',
  airportCode: 'COK',
  arrivalLocal: '',
  destinationId: '',
  dropoffAddress: '',
  luggageCount: 1,
  preference: 'balanced',
  maxDetourMinutes: 25,
  maxBudget: '',
  flightRef: null,
};

const INITIAL = {
  form: EMPTY_FORM,
  trip: null, // saved trip (has id)
  arrivalWindow: MATCHING_CONFIG.arrivalWindowMinutes,
  selected: [], // selected co-passenger trips
  optionKind: null,
  activeRideId: null,
};

const Ctx = createContext(null);

export function AppStateProvider({ children }) {
  const [state, setState] = useState(() => ({ ...INITIAL, ...readJSON('app', {}) }));

  useEffect(() => {
    writeJSON('app', state);
  }, [state]);

  const update = useCallback((patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);

  const resetJourney = useCallback(
    (keepForm = true) => setState((s) => ({ ...INITIAL, form: keepForm ? s.form : EMPTY_FORM })),
    [],
  );

  const value = useMemo(() => ({ state, update, resetJourney }), [state, update, resetJourney]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
