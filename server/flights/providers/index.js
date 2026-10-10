import { createFlexProvider } from './flexProvider.js';
import { providerNotConfigured } from '../errors.js';

/**
 * Provider registry. Add a new adapter here (it must implement `arrivalsWindow` and
 * `flightStatus` returning NormalizedFlight records) and select it with FLIGHT_DATA_PROVIDER.
 *
 * Deliberately NOT included: the reverse-engineered flightstats.com web-app endpoints
 * (github.com/evilsaloon/flightstats-web-api). FlightStats' Terms of Use §2.1.2, §2.1.5 and
 * §2.1.9 prohibit sharing, reverse-engineering and re-displaying that data. See docs/FLIGHT_DATA.md.
 */
export function createProvider(cfg, deps) {
  if (cfg.provider === 'flightstats_flex') {
    const p = createFlexProvider(cfg, deps);
    return p.configured ? p : unconfigured('flightstats-flex', 'FLIGHTSTATS_APP_ID and FLIGHTSTATS_APP_KEY are not set.');
  }
  if (cfg.provider === 'none' || !cfg.provider) return unconfigured('none', 'No flight-data provider is selected (FLIGHT_DATA_PROVIDER=none).');
  return unconfigured(cfg.provider, `Unknown provider "${cfg.provider}".`);
}

function unconfigured(id, reason) {
  const fail = async () => {
    throw providerNotConfigured();
  };
  return { id, label: 'Not connected', configured: false, reason, maxWindowHours: 6, arrivalsWindow: fail, flightStatus: fail };
}
