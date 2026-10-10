# Flight data in Sanchari

This document covers how Sanchari gets flight information for Cochin International Airport (COK): what was evaluated, what was built, how to run and test it, and its limits.

## 1. The FlightStats web-app endpoints: evaluated, not used

**Repository inspected:** [evilsaloon/flightstats-web-api](https://github.com/evilsaloon/flightstats-web-api), last commit `4eb13be`, 13 Aug 2022.

- It is an *unofficial, reverse-engineered* description of endpoints that the flightstats.com web app uses. It is not a FlightStats API.
- It documents three endpoints:
  - `GET /v2/api-next/flight-tracker/arr/{airport}/{y}/{m}/{d}/{startHour}?numHours={1–12}` for arrivals. Its "observed time period" is today ±3 days.
  - `GET /v2/api-next/flight-tracker/{carrier}/{number}/{y}/{m}/{d}` for status.
  - `GET /v2/api-next/flight-tracker/other-days/{carrier}/{number}` for other days.

**Live check (11 Oct 2026, ~03:45 IST).** I sent `GET https://www.flightstats.com/v2/api-next/flight-tracker/arr/COK/2026/10/11/0?numHours=12` through a web-fetch tool. The sandbox's own network allowlist blocks the host from the shell, with a proxy 403 that did not come from FlightStats.

The response was valid JSON:
- The header read `"(COK) Cochin International Airport Arrivals"`, date `11-Oct-2026`, time zone `Asia/Kolkata`.
- `data.flights` held **90 entries**, 46 of them codeshares, from 20 origin airports.
- The first entry was SQ 536 from SIN, arriving 00:05 IST (`sortTime 2026-10-10T18:35:00.000Z`).
- The last entry was 06:05Z = 11:35 IST.

So the endpoint worked without authentication on that date. Board records contain only scheduled clock times, carrier, origin and a `flightId` URL. They carry no live status, which would need one extra request per flight.

**Terms.** FlightStats' [Terms of Use](https://www.flightstats.com/company/legal/terms-of-use) (LNRS Data Services Inc, "Cirium") say you may not:

- §2.1.2 — "Resell, sublicense, **share**, copy or otherwise transfer any part of the Cirium Data … to any other third parties"
- §2.1.5 — "**Reverse engineer**, disassemble, or decompile the Services or Cirium Data …"
- §2.1.9 — "Abstract, download, store, reproduce, transmit, **display**, copy or use the Cirium Data other than as expressly permitted in the Agreement."
- §2.1.3 — cache or store Cirium Data for more than three days.

Serving that data to Sanchari users through reverse-engineered endpoints would conflict with §2.1.2, §2.1.5 and §2.1.9. Following the project brief ("if the intended usage is not permitted, stop using the restricted endpoint and report the limitation"), **Sanchari does not call these endpoints anywhere.** The `providers/` folder contains no client for them.

If you obtain written permission from Cirium, a provider for them can be added behind the same interface (see §7).

## 2. What was built

```
browser ──► /api/flights/*  (Sanchari server: Vite middleware locally, Vercel functions in production)
                │
                ├─ validation (airport, date range, hour windows, flight designators)
                ├─ FlightService: window splitting · TTL + stale cache · request de-duplication
                │                  · provider health · duplicate-update suppression
                └─ Provider adapter ──► Cirium FlightStats Flex API (licensed, appId/appKey)
                                     └─ "none": honest "not connected" errors, never sample flights
```

| File | Purpose |
|---|---|
| `server/flights/config.js` | Environment settings (server only) |
| `server/flights/time.js` | Time-zone conversion, airport "today", window splitting |
| `server/flights/validate.js` | Input validation; flight id `COK~6E~2178~2026-10-11` |
| `server/flights/httpClient.js` | Timeout, retries, exponential backoff with jitter, `Retry-After`, typed errors |
| `server/flights/cache.js` | TTL cache with stale fallback and in-flight de-duplication |
| `server/flights/model.js` | Normalized flight model, `bestArrival`, `hasLanded`, fingerprint |
| `server/flights/providers/flexProvider.js` | Flex client: `airport/status/{apt}/arr/{y}/{m}/{d}/{hour}` and `flight/status/{c}/{n}/arr/{y}/{m}/{d}` |
| `server/flights/providers/flexNormalize.js` | Flex JSON → normalized model |
| `server/flights/service.js` | Arrivals, search, by-id, provider health, update tracker |
| `server/http/*` | Router, handlers, auth, rate limit, Supabase access, Node adapter, Vite plugin |
| `api/**` | Thin Vercel function entry points |
| `src/pages/Arrivals.jsx`, `src/components/ArrivalsBoardView.jsx` | Arrivals board |
| `src/components/FlightPanel.jsx` | The user's own flight on the ride page |
| `src/utils/readiness.js` | Likely-ready time from best-known arrival plus baggage |

## 3. API

All responses are JSON. Errors always look like `{ "error": { "code", "message", "field?" } }`, and upstream details are never returned.

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/flights/arrivals?airport=COK&date=YYYY-MM-DD&from=0&to=24` | public, rate-limited | Splits into windows of ≤6 h (Flex limit, configurable). Returns `freshness`, `complete`, per-window state, `notice` and `flights[]`. |
| `GET /api/flights/search?number=6E2178&date=YYYY-MM-DD&airport=COK` | public, rate-limited | Matches codeshare numbers too. Returns 404 `flight_not_found` instead of guessing. |
| `GET /api/flights/{id}` | public, rate-limited | `id` = `COK~6E~2178~2026-10-11` |
| `GET /api/flights/provider-health` | public, rate-limited | Status `ok` / `degraded` / `down` / `unknown` / `not_configured`, last success and failure. No configuration values. |
| `GET /api/journeys/{id}/flight-status` | Supabase bearer token | Only the owner's journey (RLS). Others get 404. Unverified flights return a message and are never sent to the provider. |
| `POST /api/journeys/{id}/select-flight` `{number, date}` | Supabase bearer token | The server verifies with the provider, then writes the verified columns with the service role. |
| `GET/POST /api/cron/refresh-flights` | `Bearer CRON_SECRET` | Refreshes verified flights arriving between −6 h and +24 h. Skips unchanged ones and posts ride updates for changes. |

Common status codes: 400 invalid input · 401 no or invalid session · 404 not found (including "not yours") · 409 no flight linked · 429 rate limited (`Retry-After`) · 501 journeys need live mode · 502/504 provider error or timeout · 503 provider not configured.

## 4. Normalized flight fields

`id, providerFlightId, source, airline{code,name}, flightNumber, designator, codeshares[], origin{code,name,city}, destination{code,name}, departure{scheduled,estimated,actual}, arrival{scheduled,estimated,actual,actualKind}, localArrivalDate, status{raw,rawLabel,normalized}, terminal, gate, baggage, providerUpdatedAt, retrievedAt` plus `freshness` and `verification` in responses.

- Instants are UTC ISO strings and are displayed in IST (`Asia/Kolkata`). `localArrivalDate` is the airport-local date: a 00:05 IST arrival is "today" even though it is yesterday in UTC.
- Scheduled, estimated and actual times are never merged. Missing values are `null`.
- Normalized statuses: `SCHEDULED, EN_ROUTE, LANDED, CANCELLED, DIVERTED, NOT_OPERATIONAL, UNKNOWN`. Unrecognized provider codes keep `raw` and map to `UNKNOWN`.
- "Landed" comes only from status `L` or an observed arrival time, never from the clock.

## 5. Caching and freshness labels

- **Live:** fetched from the provider for this request.
- **Cached:** served from Sanchari's cache, younger than `FLIGHT_CACHE_TTL_SECONDS` (default 300 s). The age is shown.
- **Stale:** the provider failed after the TTL, so the last data is shown with a warning. Data older than `FLIGHT_CACHE_MAX_STALE_SECONDS` (default 6 h, hard cap 3 days) is dropped.
- **Unavailable:** nothing could be loaded. The board says so and offers manual entry.

Each window is cached separately, and concurrent identical requests share one upstream call. **The cache lives in memory per server process.** On Vercel each warm instance has its own cache. A shared cache (for example a Supabase table) can be added behind `TtlCache` if call volume needs it.

The scheduled refresh concentrates provider calls on flights linked to active journeys. Unchanged results are ignored using a fingerprint of status and the times passengers care about.

## 6. Flights in journeys and matching

- **Arrivals board → "Use this flight"**, or **type a number → "Check flight"**. Either path attaches a verified snapshot and fills the landing time from the best-known arrival.
- If the number cannot be resolved, or no provider is configured, the flight is saved as **unverified**. The passenger's own time is used and no automatic updates are promised.
- In live mode only the server can set verified fields. Column grants block passengers from writing them. A trigger resets verification if a passenger edits their flight number.
- **Matching** compares *likely-ready* times, not flight numbers. Ready time = actual, estimated or scheduled arrival (verified flights only) + baggage time (12 min with no checked bag, 18 min for one, +4 min per extra bag) + 5 min to walk. Being on the same flight never matches people on its own; destination, route, luggage, budget and preference rules still apply.
- **Unconfirmed groups:** when a flight update makes a selected co-passenger incompatible, they are removed from the selection with an on-screen explanation.
- **Confirmed rides are never changed silently.** If your flight makes you ready after the agreed departure, the ride page says so and offers "Move departure by N min". The server refresh only posts an update message to the ride.
- Readiness is always passenger-reported: Awaiting arrival → Flight landed → Collecting baggage → Walking to pickup → Ready for pickup, plus Needs more time and Unable to continue.

## 7. Adding or switching providers

Implement an object with `id`, `label`, `configured`, `maxWindowHours`, and:

- `arrivalsWindow({ airport, date, startHour, numHours })`
- `flightStatus({ carrier, number, date, airport })`

Both return `{ flights: NormalizedFlight[], retrievedAt }`. Register it in `server/flights/providers/index.js` and select it with `FLIGHT_DATA_PROVIDER`. Nothing else in the app reads provider JSON.

## 8. Running and testing

```bash
cp .env.example .env.local            # add FLIGHT_DATA_PROVIDER=flightstats_flex + Flex keys
npm install
npm run dev                           # site + /api on http://localhost:5173
curl "http://localhost:5173/api/flights/arrivals?airport=COK&date=$(TZ=Asia/Kolkata date +%F)&from=0&to=6"
curl "http://localhost:5173/api/flights/provider-health"
npm test                              # automated suite; the upstream is always mocked
npm run check:flights                 # MANUAL: real request to the configured provider; prints PASS/FAIL/NOT RUN
```

The Flex fixture in `server/flights/__fixtures__/` is **built from the published Flex schema**. It is not a recorded response, because no Flex credentials were available during development. Re-record it from a real response when you have keys, and remove any personal data.

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Board says "Live flight data not connected" | `FLIGHT_DATA_PROVIDER` is not `flightstats_flex`, or the keys are missing. Check `/api/flights/provider-health`. |
| `upstream_auth` | Flex rejected the appId or appKey, or the plan doesn't include Flight Status. |
| `upstream_rate_limited` | Plan limits were hit. Raise `FLIGHT_CACHE_TTL_SECONDS`. |
| Stale label persists | The provider has been unreachable for longer than the TTL. Look for `upstream_failed` in the server logs (secrets are redacted). |
| Journey endpoints return 501 | They need Supabase live mode. Demo journeys live in the browser. |
| `select-flight` returns 503 | Set `SUPABASE_SERVICE_ROLE_KEY` on the server. Never put it in a `VITE_` variable. |
| Scheduled refresh | Vercel Hobby only allows daily crons. Use Vercel Pro (add `"crons"` to `vercel.json`) or an external scheduler calling `/api/cron/refresh-flights` with `Authorization: Bearer $CRON_SECRET` every 5–10 min. |

## 10. Known limitations

- No live provider call has been verified, because no Flex credentials were available. Everything except the real network call is covered by automated tests and a browser walk-through against a local test double. `npm run check:flights` is the step that proves it works.
- Flex's own terms, pricing and permitted caching and display apply to your account. Read your Cirium agreement before going live.
- The arrivals board supports today −1 to +3 days (configurable). It shows only what the provider returns for those dates.
- The in-memory cache and rate limiter are per instance. The overlap guard on the refresh job is per process.
