import { FlightDataError } from './errors.js';
import { logger } from './logger.js';

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON with a timeout, limited retries and exponential backoff (with jitter).
 * Retries: network errors, timeouts, HTTP 429 (honouring Retry-After) and 5xx.
 * Never retries 4xx other than 429. Errors carry a client-safe `code`.
 */
export async function fetchJson(url, { timeoutMs = 8000, maxRetries = 2, backoffBaseMs = 400, fetchImpl = globalThis.fetch, sleep = sleepReal, logLabel = 'upstream', random = Math.random } = {}) {
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    let failure;
    try {
      res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    } catch (e) {
      failure = e?.name === 'AbortError'
        ? new FlightDataError('upstream_timeout', 'The flight-data provider took too long to respond.', { retryable: true, status: 504 })
        : new FlightDataError('upstream_unreachable', 'The flight-data provider could not be reached.', { retryable: true, detail: e?.message });
    } finally {
      clearTimeout(timer);
    }

    let retryAfterMs = null;
    if (res && !failure) {
      if (res.status === 429) {
        const ra = Number(res.headers?.get?.('retry-after'));
        retryAfterMs = Number.isFinite(ra) ? Math.min(ra * 1000, 30000) : null;
        failure = new FlightDataError('upstream_rate_limited', 'The flight-data provider is rate-limiting requests. Try again shortly.', { retryable: true, status: 503 });
      } else if (res.status === 401 || res.status === 403) {
        failure = new FlightDataError('upstream_auth', 'The flight-data provider rejected Sanchari’s credentials.', { status: 502 });
      } else if (res.status >= 500) {
        failure = new FlightDataError('upstream_error', 'The flight-data provider returned an error.', { retryable: true, detail: `HTTP ${res.status}` });
      } else if (res.status >= 400) {
        failure = new FlightDataError('upstream_bad_request', 'The flight-data provider could not handle this request.', { detail: `HTTP ${res.status}` });
      }
    }

    if (!failure) {
      const type = res.headers?.get?.('content-type') || '';
      const text = await res.text();
      if (!/json/i.test(type) && !/^\s*[{[]/.test(text)) {
        throw new FlightDataError('upstream_invalid', 'The flight-data provider returned something that is not JSON.', { detail: `content-type ${type}` });
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new FlightDataError('upstream_invalid', 'The flight-data provider returned malformed JSON.');
      }
    }

    if (!failure.retryable || attempt >= maxRetries) {
      logger.warn('upstream_failed', { label: logLabel, code: failure.code, detail: failure.detail, attempts: attempt + 1 });
      throw failure;
    }
    const backoff = retryAfterMs ?? Math.round(backoffBaseMs * 2 ** attempt * (0.75 + random() * 0.5));
    logger.info('upstream_retry', { label: logLabel, code: failure.code, attempt: attempt + 1, waitMs: backoff });
    await sleep(backoff);
    attempt += 1;
  }
}
