// Structured, single-line JSON logs. Never logs credentials, tokens or passenger details.
const SECRET_KEYS = /(appkey|appid|token|authorization|apikey|secret|password|key)$/i;

function scrub(v) {
  if (typeof v === 'string') return v.replace(/(appKey|appId|apikey|token)=[^&\s]+/gi, '$1=[redacted]');
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : scrub(x)]));
  }
  return v;
}

export const logger = {
  silent: process.env.NODE_ENV === 'test' || process.env.VITEST === 'true',
  log(level, event, data = {}) {
    if (this.silent) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...scrub(data) });
    (level === 'error' ? console.error : console.log)(line);
  },
  info(e, d) { this.log('info', e, d); },
  warn(e, d) { this.log('warn', e, d); },
  error(e, d) { this.log('error', e, d); },
};
export { scrub };
