/** Errors the flight layer raises. `code` is safe to show to clients; `detail` is for logs only. */
export class FlightDataError extends Error {
  constructor(code, message, { status = 502, detail, retryable = false } = {}) {
    super(message);
    this.name = 'FlightDataError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.retryable = retryable;
  }
}

export class ValidationError extends FlightDataError {
  constructor(message, field) {
    super('invalid_request', message, { status: 400 });
    this.field = field;
  }
}

export const providerNotConfigured = () =>
  new FlightDataError('provider_not_configured', 'Live flight data is not connected on this server.', { status: 503 });
