# Sanchari

**Land together. Ride home together.**

Sanchari is a flight-aware ride-sharing app for people landing at Cochin International Airport. You enter your flight and where you're headed in any of Kerala's 14 districts. Sanchari finds travellers who land around the same time and are going the same way, and puts you in one shared cab. It splits the fare by the distance each person rides, and helps everyone meet at the pickup point within a 30-minute window.

> This is a hackathon prototype. It does not book taxis, take payments or verify identities. Every fare and travel time is an **estimate**.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 99 automated tests: matching, fares, flight data layer, API, UI states
npm run check:flights  # manual: one real request to the configured flight-data provider
npm run build      # production build in dist/
```

Node 18+ required. With no `.env` file the app runs in **demo mode** straight away.

## Flight data

Sanchari has a backend flight-data layer (`/api/flights/*`). It includes an arrivals board, flight verification for journeys, and matching on *likely-ready* times built from estimated and actual arrivals.

- **Provider:** the Cirium FlightStats **Flex API** (licensed). Set `FLIGHT_DATA_PROVIDER=flightstats_flex`, `FLIGHTSTATS_APP_ID` and `FLIGHTSTATS_APP_KEY` on the server.
- **For demos:** set `FLIGHT_DATA_PROVIDER=demo` to get clearly labelled sample arrivals (flight numbers 9xxx).
- **Without keys:** the board says live data isn't connected. Passengers enter their own time, and those flights are marked *unverified*. No sample flights are ever shown as real.
- **Not used:** the reverse-engineered flightstats.com web endpoints from `evilsaloon/flightstats-web-api`. They responded on 11 Oct 2026 with 90 real COK arrivals, but FlightStats' Terms of Use §2.1.2, §2.1.5 and §2.1.9 forbid this use.

Full details are in **[docs/FLIGHT_DATA.md](docs/FLIGHT_DATA.md)**: endpoints, fields, caching, freshness labels, time zones, testing, troubleshooting and adding providers.

## Local mode vs database mode

| | Local mode (default) | Database mode |
|---|---|---|
| Turned on by | No Supabase variables set | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set |
| Co-passengers | Fictional travellers, placed around *your* arrival time | Real trips from other users of your Supabase project |
| Storage | This browser (`localStorage`). Survives reloads. | Supabase Postgres with Row Level Security |
| Status sync | Same browser, including across tabs | Supabase Realtime, with a 20 s poll as a fallback |

The two modes are never mixed, and the interface doesn't label which one is running. Use database mode for anything shown to real users.

## Live mode setup (Supabase)

1. Create a Supabase project.
2. In **Authentication → Providers**, turn on **Allow anonymous sign-ins**. Every visitor gets an anonymous user, and RLS uses that user to protect their data.
3. Open the **SQL editor**, paste `supabase/schema.sql` and run it. The script creates the tables, indexes, RLS policies and RPC functions, and adds the ride tables to Realtime.
4. Copy `.env.example` to `.env.local` and fill in the project URL and the **anon/publishable** key. Never use the `service_role` key here.
5. Run `npm run dev`.

**Privacy model**
- `trips` can be read only by their owner.
- Other travellers are found through `find_candidate_trips()`. It returns name, area, rounded coordinates (~1 km), bags and preference. It never returns the street address or the flight number. For verified flights it returns only the best-known arrival time and its kind (actual, estimated or scheduled), so readiness can be matched.
- Ride groups are created only through `create_ride_group()`, which checks that the caller owns their trip.
- Members can read only their own ride. Each person can update only their own status row. Column grants block edits to fares and names.

The policies were tested on a local Postgres 16 with simulated users: a stranger saw nothing, a member couldn't edit someone else's status, and anon was denied. They have **not** been run against a hosted Supabase project yet.

## Deployment (Vercel)

1. Push the folder to a Git repo and import it in Vercel. The framework preset is **Vite**: build `npm run build`, output `dist`.
2. Optional for live mode: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
3. `vercel.json` already rewrites every route to `index.html`, so deep links like `/ride` keep working.

CLI alternative: `npx vercel` and then `npx vercel --prod`.

## How it works

### Design system (`src/styles.css`)
The UI is plain CSS with no framework, following the Sanchari editorial design system. It uses Libre Caslon Display for display headings and DM Sans for body text. The layout patterns are the utility bar, site header, hero, journey strip, workspace with an input card and a quick panel, result card, problem grid, accordion, learning banner and footer. The utility bar has a larger-text toggle and a high-contrast mode, both remembered per browser.

The palette is built around the brand cyan **#4EC6D6**:

| Token | Value | Use |
|---|---|---|
| `--brand` | `#4ec6d6` | Logo, wax seal, result-card stripe, "selected" tags, nav counter |
| `--primary` | `#0e6e7c` | Buttons, links, active nav. A deep teal of the same hue: white on #4EC6D6 is only ~2:1 contrast, while white on this is ~6:1 |
| `--primary-hover` | `#0a5763` | Primary hover |
| `--ink` / `--muted` | `#0f3a42` / `#4f6b70` | Headings / body copy |
| `--bg` / `--paper` / `--soft` | `#f4f8f8` / `#fdfefe` / `#e1f4f6` | Page / cards / tints and icon boxes |
| `--line` | `#d3e3e5` | 1px borders |
| `--accent` / `--accent-soft` | `#b04a2f` / `#fbe8e1` | Coral complement: eyebrows, step numbers, warnings |

### Matching (`src/utils/matching.js`)
`findCompatiblePassengers(currentTrip, candidateTrips)` first applies hard rules, then scores the trips that remain.

Hard rules (any one rejects the pair, and the reason is shown):
1. Same airport
2. Likely ready within **30 min** of each other (the length of the pickup window)
3. Drop-offs within **7 km** of each other, **or** one drop-off on the other's way (a Chalakudy rider fits a Thrissur trip)
4. Bags fit in one vehicle (sedan 4, SUV 6)
5. Compatible preferences: a *Direct* rider is never paired with a *Cheapest* rider
6. Estimated detour of at most 25 min

The weighted score uses time 35%, destination 30%, preference 15%, detour 12% and luggage 8%. All thresholds and weights are in `src/data/config.js`.

Nobody picks co-riders by hand. `proposeGroup()` takes the best-scoring travellers in order and adds each one if they fit with everyone already in the group (`canJoinGroup()`) and the shared fare is still lower than a solo cab **for every rider**. The group gets one option: the shared preference, or Balanced when preferences differ. Each rider answers **I'm in** or **Not for me**. In live mode the first acceptance creates a `proposed` ride, and it becomes `confirmed` once everyone has accepted (trigger `ride_members_sync`). A decline cancels the proposal, everyone goes back to searching, and those travellers aren't proposed together again.

**Honest limits:** distances are straight-line × 1.35 road factor, using curated area centres in `src/data/airports.js`. Matching two areas is not the same as checking a real road route, and no routing API is used.

### Fares (`src/utils/fareCalculation.js`)
The same assumptions apply to every option: ₹120 airport pickup + ₹100 base + ₹22/km, with an SUV at ×1.35. Metro or bus is ₹20 + ₹1.2/km, capped at ₹650. Auto is ₹30 for the first 2 km, then ₹15/km.

- **Cheapest:** shared cab to a transit hub (Angamaly KSRTC for the north, Vyttila Hub for the south, Perumbavoor KSRTC for the east, Aluva Metro for Kochi), then KSRTC bus or metro. Not offered if anyone in the group chose Direct.
- **Balanced:** riders within 4 km of each other share one stop in one of their areas and finish by auto or on foot. Riders further along the corridor get their own stop, so nobody is left with a long auto ride.
- **Direct:** the cab drops each rider at their own address. Stops are ordered nearest-first.

**Proportionate split:** the pickup fee and base fare are shared equally. Each stretch of road is split only among the riders still in the cab, so someone getting off at Chalakudy pays less than someone going to Thrissur. Each rider's own onward fare is added to their share. Savings are measured against a solo door-to-door cab.

### Coordination
- The pickup window is always **30 minutes**. It starts when the first rider taps **I've landed** (`ride_groups.pickup_window_started_at`).
- The meet page shows the countdown, a schematic airport map with each rider placed by their status (in the air → arrival gate → baggage hall → walkway → pickup), and one-tap "what are you doing now" updates. Riders can report a flight delay before landing.
- The countdown is always worked out from the **stored** `waiting_deadline` timestamp, so a reload doesn't reset it.
- When 2 minutes are left, the app shows an in-app alert **once per deadline** and calls `navigator.vibrate()` once. The app records whether the browser vibrated, blocked the vibration or doesn't support it, and the alert says which one happened. Extending the deadline sets up a new reminder.
- When time's up, the group chooses **Leave with who's here** or **Wait 10 more min**. Testing tools appear when you add `?tools=1` to the meet page URL.

## Project structure

```
api/                 Vercel function entry points → server/http
server/flights/      provider interface, Flex adapter, cache, HTTP client, validation, time zones
server/http/         router, handlers, auth, rate limit, Supabase access, Vite dev middleware
docs/FLIGHT_DATA.md  flight-data integration guide
scripts/live-check.mjs  manual real-provider check
```


```
src/
  components/   SiteLayout, ui (Button, Field, Tag, Note, PageHeading), Avatar, DestinationPicker,
                AirportMap, Countdown (useNow, useDeadlineReminder, ReminderBanner), LiveInviteCheck,
                ArrivalsBoardView
  pages/        ArrivalSetup (/), Arrivals (/arrivals), MatchProposal (/match), RideCoordination (/ride)
  services/     supabaseClient, tripService, rideService, storage
  data/         airports (14 districts, their roads from COK, places, hubs), demoPassengers, config
  state/        AppState (shared, persisted journey state)
  utils/        matching, fareCalculation, geo, trip, validation, timeFormatting, notifications
  App.jsx, main.jsx, styles.css (design system)
supabase/schema.sql
.env.example, vercel.json
```

## Walkthrough (about 3 minutes, two phones)

1. **Phone A:** plan a ride. Choose **Thrissur**: the road from the airport appears (Angamaly → Karukutty → Koratty → Chalakudy → Pudukkad → Ollur → Thrissur), and you can be dropped anywhere along it. Tap **Find my ride**. Nobody matches yet, so the page keeps looking.
2. **Phone B:** plan a ride landing within 30 minutes of A, to Chalakudy. Sanchari proposes a ride with A: who's riding, the route, your share, and **Compare fares** for the other options. Tap **I'm in**.
3. **Phone A** switches to the same proposal on its own. Tap **I'm in**. Both phones open **Meet your co-passengers**.
4. Tap **I've landed** on one phone: the 30-minute countdown starts for both, and the map moves that rider to the arrival gate. Pick **Collecting baggage**, **Walking to pickup** or **At the pickup point**. The other phone updates live.
5. Use **Flight delayed?** on the phone that hasn't landed. Add `?tools=1` to the URL to jump the window to 0:20 and show the time's-up choice.

## Implemented

Editorial design system with larger-text and high-contrast modes · all 14 Kerala districts with the road from the airport and stops on the way · automatic grouping with accept or decline · compare fares across three options · 30-minute pickup window that starts on first landing · schematic airport map of where everyone is · one-tap statuses and flight-delay reporting · countdown from a stored timestamp · a single 2-minute reminder with an honest vibration report · testable deadlines · demo mode · Supabase live mode with RLS, RPCs and Realtime · arrivals board with freshness labels · verified or unverified flights on journeys · readiness-based matching with budgets · flight changes surfaced with consent-only departure moves · 111 automated tests.

## Limitations and not built

- No ticket upload or OCR, no live flight tracking, no live taxi or transit prices, no routing API, no payments, no identity verification, no chat.
- Only COK is served. Destinations are a curated list of about 90 towns across the 14 districts, with approximate coordinates. The exact address is free text and isn't geocoded.
- Route overlap is estimated from straight-line distances, not a routing API. Driver assignment, group chat and WebSockets beyond Supabase Realtime are not built. Live flight data needs licensed Flex credentials, and no real Flex call has been verified yet (see docs/FLIGHT_DATA.md §10).
- Reminders only work while the page is open. Browsers can't vibrate or notify from a closed or background tab, and iOS Safari has no Vibration API.
- Live mode has passed its RLS test on local Postgres but hasn't been exercised end to end on a hosted Supabase project.
- The airport map is a diagram driven by what riders report, not GPS.
