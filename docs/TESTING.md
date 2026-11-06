# Testing

Two layers are used: an API integration suite that exercises the whole ride
lifecycle against a running server, and a manual two-session browser pass for
the real-time UI. Nothing in this repository claims a feature is verified unless
it has been run here.

## Prerequisites

- Backend dependencies installed and `backend/.env` configured (see
  [ENVIRONMENT.md](ENVIRONMENT.md)). The suite reads `.env` from `backend/`.
- `ADMIN_MOBILE` and `ADMIN_PASSWORD` set, because approval, reports, and
  cancellation require an admin session.
- `MONGODB_URI` set if you want the suite to delete its own test records.
- OSRM reachable through `OSRM_BASE_URL` with `ROUTING_ALLOW_ESTIMATE=false`.
  Booking tests need a real road route between the pickup and drop points.
- The API running on port 5000 (`npm run dev`), and `npm run db:fix-indexes`
  already executed once against the target database.

## API integration suite

```bash
cd backend
npm test
```

Useful overrides:

```bash
API_URL=http://127.0.0.1:5001 npm test
ADMIN_MOBILE=... ADMIN_PASSWORD=... npm test
```

The script registers a timestamped customer and rider, approves the rider
through the admin API, places a real booking at the service-area centre,
drives every ride status, and then removes its own users and ride records. It
never prints tokens or passwords.

Covered checks:

| Area | What is asserted |
| --- | --- |
| Public config | Active service area with boundary and centre |
| Auth | Admin login; customer and rider registration issue tokens |
| Rider approval | Admin sets `approved`; rider can go online with GPS |
| Booking | Created in `SEARCHING` with a server-calculated fare |
| Lifecycle | accept → arriving → arrived → start → complete |
| Fare | Final fare is positive after completion |
| Atomic assignment | Second accept on the same booking is rejected |
| Customer view | Completed ride is visible; rider mobile is exposed only after assignment |
| Admin | Stats, booking list/detail, activity log, CSV export, live snapshot, 7-day IST report series, fare read/write, service-area read, customer search |
| Map notes | Create, list, patch, and delete a local landmark through `/admin/map-notes` |
| Blocking | Blocked customer cannot sign in; unblock restores access |
| Document privacy | Anonymous request → 401, customer → 403, owning rider → 200 |

If a run fails partway, the cleanup block still removes users matching the
run's mobile numbers and their bookings, payments, vehicle, documents, ride
locations, activity, and notifications. It also removes map notes whose label
starts with `Integration note <suffix>`.

### Rate limits during repeated runs

Auth endpoints allow 30 requests per 15 minutes per IP and booking creation
allows 20 per 10 minutes. Normal runs stay well below both. If you loop the
suite many times during development, either wait, restart the API (in-memory
limiter), or raise the limits temporarily in `backend/src/middleware/rateLimit.ts`.
Do not weaken them in production.

## Manual two-session test

Use two separate browser profiles or one normal and one private window. Both
sessions must hit the same API and database.

1. **Admin bootstrap** — start the backend once with `ADMIN_MOBILE` and
   `ADMIN_PASSWORD` set. Sign in at `/login` as admin.
2. **Rider registration** — in session B, register a rider at `/register`, add
   the bike details, upload licence and any required document images, and
   submit for approval.
3. **Approval** — in session A, open **Riders**, inspect the documents in the
   authenticated viewer, and approve.
4. **Go online** — in session B, allow location access and switch online. The
   rider should appear on **Live map** within a few seconds.
5. **Book** — in session C (customer), pick a pickup and destination inside
   Gosaba, drag the pins, check the estimate, and confirm the cash booking.
6. **Accept** — the rider receives the offer and accepts. Both sides must move
   to `ACCEPTED` / `RIDER_ARRIVING` without a refresh.
7. **Approach and start** — rider taps Arriving, Arrived, then Start. The
   customer map must show the rider marker moving as GPS updates arrive.
8. **Complete** — rider completes the ride. The customer sees the final fare,
   the rider sees it under **Earnings**, and the admin booking detail shows the
   full activity log. A cash `payment` record exists with status `paid`.
9. **Cancel** — book again and cancel from the customer side; the rider screen
   clears and the cancellation fee (if configured) is reflected.
10. **Local map notes** — in **Admin → Map notes**, click the map to place a
    pin, add a label such as a ghat or lane, save, then confirm the marker
    appears on the admin map. Edit it, hide it, and delete it.

Reset a stuck browser session by clearing local storage key `amit.session.v1`,
then reload.

## Routing and boundary checks

- **Outside the polygon:** set a pickup outside Gosaba. The API returns 400
  with `OUTSIDE_SERVICE_AREA`; no booking is created.
- **No road route:** choose two points separated by a river or an area absent
  from the OSRM graph. With a real OSRM graph the API returns 400 with
  `NO_ROAD_ROUTE`; it must not invent a straight line across water.
  The straight-line fallback only exists when `ROUTING_ALLOW_ESTIMATE=true`,
  which must stay `false` in production.
- **OSRM down:** with estimates disabled, booking returns 503
  `ROUTING_UNAVAILABLE` rather than pricing an unsafe ride.
- **Paused area:** set the service area unavailable in admin. New bookings
  return 409 `SERVICE_PAUSED` with the configured message.

## IST and reporting

All day bucketing and displayed times use `Asia/Kolkata` (UTC+05:30, no DST):

- A ride completed at 00:30 IST must count on that IST date, not the previous
  UTC date.
- The **Reports** screen returns exactly one point per requested day, including
  zero-value days, in IST order.
- CSV export uses IST timestamps.

## PWA and offline shell

```bash
cd frontend
npm run build
npm run preview
```

Then:

- Load the preview URL once, confirm the install prompt/manifest, and install.
- Reload with DevTools set to offline. The app shell should load; live data
  commands fail with the offline banner visible.
- Service worker updates appear after a reload; `/sw.js` is served with
  `Cache-Control: no-cache` by the included Vercel/SPA configuration.
- Background push notifications require `FCM_*` on the backend and
  `VITE_FIREBASE_*` at frontend build time. They are optional and are not
  covered by the automated suite.

## Known limits

- The integration suite does not drive browsers, so map rendering, gestures,
  and the service worker are verified manually.
- Real-time delivery is assumed healthy when the UI updates live; there is no
  synthetic socket chaos test.
- Live tracking depends on the rider sending location updates; stationary
  devices will show a stationary marker.
- The public OSRM demo server is rate-limited and unsuitable for load tests or
  production.
