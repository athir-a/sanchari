# Sanchari

**Find people landing when you do, compare ways home, and coordinate one shared cab.**

Sanchari is a mobile-first web app for travellers arriving at an airport. It matches you with passengers who land around the same time and are heading the same way. It compares a cheapest, a balanced and a direct shared journey, and it coordinates the meet-up at the pickup point after landing.

> This is a hackathon prototype. It does not book taxis, take payments or verify identities. Every fare and travel time is an **estimate**.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for matching, fares and validation
npm run build      # production build in dist/
```

Node 18+ required. With no `.env` file the app runs in **demo mode** straight away.

## Demo mode vs live mode

| | Demo mode (default) | Live mode |
|---|---|---|
| Turned on by | No Supabase variables set | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set |
| Co-passengers | Fictional demo passengers, placed around *your* arrival time | Real trips from other users of your Supabase project |
| Storage | This browser (`localStorage`). Survives reloads. | Supabase Postgres with Row Level Security |
| Status sync | Same browser, including across tabs | Supabase Realtime, with a 20 s poll as a fallback |
| Badge | Amber **Demo** pill in the header | Teal **Live** pill |

The two modes are never mixed: live mode never shows demo passengers.

## Live mode setup (Supabase)

1. Create a Supabase project.
2. In **Authentication → Providers**, turn on **Allow anonymous sign-ins**. Every visitor gets an anonymous user, and RLS uses that user to protect their data.
3. Open the **SQL editor**, paste `supabase/schema.sql` and run it. The script creates the tables, indexes, RLS policies and RPC functions, and adds the ride tables to Realtime.
4. Copy `.env.example` to `.env.local` and fill in the project URL and the **anon/publishable** key. Never use the `service_role` key here.
5. Run `npm run dev`.

**Privacy model**
- `trips` can be read only by their owner.
- Other travellers are found through `find_candidate_trips()`. It returns name, area, rounded coordinates (~1 km), bags and preference. It never returns the street address or the flight number.
- Ride groups are created only through `create_ride_group()`, which checks that the caller owns their trip.
- Members can read only their own ride. Each person can update only their own status row. Column grants block edits to fares and names.

The policies were tested on a local Postgres 16 with simulated users: a stranger saw nothing, a member couldn't edit someone else's status, and anon was denied. They have **not** been run against a hosted Supabase project yet.

## Deployment (Vercel)

1. Push the folder to a Git repo and import it in Vercel. The framework preset is **Vite**: build `npm run build`, output `dist`.
2. Optional for live mode: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
3. `vercel.json` already rewrites every route to `index.html`, so deep links like `/ride` keep working.

CLI alternative: `npx vercel` and then `npx vercel --prod`.

## How it works

### Matching (`src/utils/matching.js`)
`findCompatiblePassengers(currentTrip, candidateTrips)` first applies hard rules, then scores the trips that remain.

Hard rules (any one rejects the pair, and the reason is shown):
1. Same airport
2. Arrival within **±45 min** (configurable; the user can widen it to ±90)
3. Drop-offs within **7 km** in a straight line
4. Bags fit in one vehicle (sedan 4, SUV 6)
5. Compatible preferences: a *Direct* rider is never paired with a *Cheapest* rider
6. Estimated detour of 30 min or less

The weighted score uses time 35%, destination 30%, preference 15%, detour 12% and luggage 8%. All thresholds and weights are in `src/data/config.js`.

When you pick several people, `canJoinGroup()` checks every pair plus the capacity of the whole group.

**Honest limits:** distances are straight-line × 1.35 road factor, using curated area centres in `src/data/airports.js`. Matching two areas is not the same as checking a real road route, and no routing API is used.

### Fares (`src/utils/fareCalculation.js`)
The same assumptions apply to every option: ₹120 airport pickup + ₹100 base + ₹22/km, with an SUV at ×1.35. Metro or bus is ₹20 + ₹2.5/km, capped at ₹90. Auto is ₹30 for the first 2 km, then ₹15/km.

- **Cheapest:** shared cab to the zone's transit hub, then metro or bus. Not offered if anyone in the group chose Direct.
- **Balanced:** the cab makes **one** shared stop in one rider's area, chosen to minimise the group's total cost. Everyone else takes a short auto or walks.
- **Direct:** the cab drops each rider at their own address. Stops are ordered nearest-first.

Your share = cab fare ÷ riders + your own onward fare. Savings are measured against a solo door-to-door cab.

### Coordination
- Proposed departure = latest arrival in the group + 30 min. The waiting deadline is 10 min after that.
- The countdown is always worked out from the **stored** `waiting_deadline` timestamp, so a reload doesn't reset it.
- When 2 minutes are left, the app shows an in-app alert **once per deadline** and calls `navigator.vibrate()` once. The app records whether the browser vibrated, blocked the vibration or doesn't support it, and the alert says which one happened. Extending the deadline sets up a new reminder.
- Each status update is one tap. "I'm delayed" offers +10/20/30 min. Anyone in the ride can push departure back to cover a delay. All changes are logged in a short updates feed.

## Project structure

```
src/
  components/   AppShell, ui (Button/Field/Badge/Notice), PreferenceSelector,
                PassengerCard, FareCard, RideStatus (hero, steps, members, feed),
                Countdown (useNow, useDeadlineReminder, ReminderBanner), LiveInviteCheck
  pages/        ArrivalSetup, MatchResults, RideComparison, RideConfirmation, RideCoordination
  services/     supabaseClient, tripService, rideService, storage
  data/         airports (airports, zones, destinations), demoPassengers, config
  state/        AppState (shared, persisted journey state)
  utils/        matching, fareCalculation, geo, trip, validation, timeFormatting, notifications
  App.jsx, main.jsx, index.css
supabase/schema.sql
.env.example, vercel.json
```

## Demo script for judges (about 3 minutes)

1. **Arrival:** tap **Find my ride** on the empty form to show validation. Then tap **Fill demo trip** (Aditi, BLR → Indiranagar, 2 bags, Balanced) and **Find my ride**.
2. **Matches:** Meera, Ananya, Rohan and Zoya appear, ranked, each with reasons and an estimated saving. Open **Not matched** to see the rejections: Kabir (95 min apart), Farah (Whitefield, 12 km away) and Vikram (7 bags together).
3. Add **Meera**, then **Ananya**. Point out that Rohan is now blocked: *Meera wants Direct and Rohan wants Cheapest*. Tap **Compare options**.
4. **Compare:** Cheapest is unavailable because Meera asked for a door-to-door drop. Balanced and Direct show your share, duration, detour, transfers and savings. Open **View cab route in Maps**. Continue with Balanced.
5. **Confirm:** review the summary and the "proposal, not a booking" note. Tap **Confirm I'm in**; double taps are ignored.
6. **After landing:** tap **I've landed · collecting luggage**, then **I'm walking to pickup**. **Reload the page** to show that status and countdown persist.
7. Open **Testing tools** and tap **Deadline in 2:10**. After about 10 s the reminder appears and says whether the phone vibrated. Reload: it doesn't fire again.
8. Tap **Someone's delayed**, then **Push departure +15 min**. Tap **Deadline in 0:20**. When the window ends, tap **Leave with who's here** to finish.

Tip: open the app in two tabs. Status changes in one tab show up in the other.

## Implemented

Arrival form with validation and persisted input · rules-based matching with explained reasons and rejections · adjustable time window · empty state (widen window / change destination / demo matches) · multi-rider groups with pairwise checks · three journey options with consistent fare maths · Maps links · double-tap-safe confirmation · persistent ride state · one-tap statuses · delays and departure shifts · updates feed · countdown from a stored timestamp · a single 2-minute reminder with an honest vibration report · testable deadlines · demo mode · Supabase live mode with RLS, RPCs and Realtime · 22 unit tests.

## Limitations and not built

- No ticket upload or OCR, no live flight tracking, no live taxi or transit prices, no routing API, no payments, no identity verification, no chat.
- Destinations come from a curated area list for BLR, DEL and BOM. The exact address is free text and isn't geocoded.
- Reminders only work while the page is open. Browsers can't vibrate or notify from a closed or background tab, and iOS Safari has no Vibration API.
- Live mode has passed its RLS test on local Postgres but hasn't been exercised end to end on a hosted Supabase project.
- Demo co-passengers move forward only when you use the demo controls, so nothing about their arrival is ever assumed.
