import { createRouter } from './router.js';

let router;
const getRouter = () => (router ||= createRouter());

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? safeJson(req.body) : req.body;
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 16 * 1024) throw Object.assign(new Error('too large'), { tooLarge: true });
    chunks.push(c);
  }
  return chunks.length ? safeJson(Buffer.concat(chunks).toString('utf8')) : undefined;
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return { __invalid: true };
  }
}

/** Node (req, res) adapter — used by Vercel functions and the Vite middleware. */
export async function nodeHandler(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 413;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: { code: 'payload_too_large', message: 'Request body is too large.' } }));
  }
  if (body?.__invalid) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: { code: 'invalid_json', message: 'Request body must be JSON.' } }));
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  let url = req.originalUrl || req.url;
  // Some hosts hand dynamic functions the file pattern ("/api/flights/[id]") plus ?id=…
  if (url.includes('[id]') && req.query?.id) url = url.replace('[id]', encodeURIComponent(req.query.id));
  const out = await getRouter()({ method: req.method, url, headers: req.headers, body, ip });
  res.statusCode = out.status;
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  res.end(JSON.stringify(out.body));
}

export default nodeHandler;
