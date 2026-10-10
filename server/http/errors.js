import { FlightDataError } from '../flights/errors.js';
import { logger } from '../flights/logger.js';

export const json = (status, body, headers = {}) => ({ status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }, body });

/** Consistent error envelope: { error: { code, message, field? } }. Upstream details never leak. */
export function errorResponse(e) {
  if (e instanceof FlightDataError) {
    const body = { error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } };
    if (e.provider) body.provider = e.provider;
    if (e.extra) Object.assign(body, e.extra);
    return json(e.status || 502, body);
  }
  logger.error('unhandled', { message: e?.message });
  return json(500, { error: { code: 'internal_error', message: 'Something went wrong on the server.' } });
}

export const httpError = (status, code, message) => new FlightDataError(code, message, { status });
