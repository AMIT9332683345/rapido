# Amit — bike taxi for Gosaba

A production-oriented bike-taxi platform for **Chhoto Mollakhali, Gosaba**
(South 24 Parganas, West Bengal). Three experiences share one API:

- **Customers** book a bike, watch the rider approach on a live map, and pay cash.
- **Riders** submit documents, go online, accept offers, and complete rides.
- **Admins** approve riders, manage fares and the service boundary, watch live
  rides, export reports, and record local map knowledge.

Maps use OpenStreetMap + MapLibre GL JS with optional self-hosted PMTiles.
Routing uses a self-hosted OSRM graph. There are no Google or Mapbox API keys.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS v4, MapLibre GL 5, PMTiles, Socket.IO client, PWA |
| Backend | Node 20+, Express 4, TypeScript, Mongoose 8, Socket.IO 4, JWT, bcrypt, zod |
| Database | MongoDB Atlas, GeoJSON (longitude first) with `2dsphere` indexes |
| Routing | Self-hosted OSRM (`driving` profile) |
| Maps | OpenFreeMap / OpenStreetMap vector tiles or your own PMTiles archive |

## Repository layout

```
backend/            Express API, Socket.IO, dispatch engine, MongoDB models
  src/
  tests/            End-to-end integration suite
frontend/           React PWA (customer, rider, admin)
map-data/           PMTiles and OSRM build scripts + hosting notes
docs/               API, environment, deployment, testing
scripts/            Developer utilities
```

## Quick start

Prerequisites: Node.js 20+, a MongoDB Atlas connection string, and either the
public OSRM demo server (development only) or your own OSRM instance.

### Backend

```bash
cd backend
cp .env.example .env
# Fill MONGODB_URI, JWT_SECRET, ADMIN_MOBILE, ADMIN_PASSWORD, OSRM_BASE_URL
npm install
npm run dev
```

The server listens on `http://localhost:5000`. On first start it creates the
default fare configuration, the Gosaba service boundary from OpenStreetMap
relation 10372784, and an admin account **only if** `ADMIN_MOBILE` and
`ADMIN_PASSWORD` are set. There is no built-in default password.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. Sign in as the admin you bootstrapped, then:

1. Approve riders after reviewing their documents.
2. Check **Fare config** and **Service area**.
3. Add local roads and landmarks in **Map notes**.

For a two-browser demo, register a customer in one profile and a rider in
another. The rider needs approval before going online.

### Production build

```bash
cd backend && npm run build && npm start
cd frontend && npm run build      # emits frontend/dist with the PWA service worker
```

## How a ride works

```
SEARCHING → REQUESTED → ACCEPTED → RIDER_ARRIVING → RIDER_ARRIVED
          → IN_PROGRESS → COMPLETED
                     ↘ CANCELLED / EXPIRED
```

- A booking is created only when both points fall inside the active service
  polygon and OSRM returns a real road route.
- Nearby approved, online riders are found with a `2dsphere` `$near` query.
- Offers expire (`BOOKING_OFFER_SECONDS`); a sweeper re-offers every 10 seconds
  up to `RIDE_REQUEST_MAX_ROUNDS`, then expires the ride.
- Accepting a ride is atomic (`findOneAndUpdate` guarded by rider and status), so
  two riders can never win the same booking.
- Customers, riders, and admins receive `booking:update` over Socket.IO.
  Rider GPS is streamed as `rider:location` (customer) and
  `admin:rider-location` (operations map).
- Fares are calculated and re-calculated **on the server**
  (`base + distance + time`, minimum fare, waiting and cancellation fees).
- Completion writes a cash payment record idempotently.

Day boundaries and report buckets use **Asia/Kolkata (IST)**.

## Security notes

- Passwords are hashed with bcrypt (cost 11–12). JWTs are signed with
  `JWT_SECRET`; socket connections authenticate with the same token.
- Role middleware separates customer, rider, and admin APIs.
- Zod validates request bodies; rate limiters protect auth, booking, and geo
  routes.
- Rider documents and uploaded files are served only through an authenticated
  endpoint, never as public static files.
- CORS is limited to configured origins. Helmet sets standard headers.
- Secrets live in `.env` files that are git-ignored. Never commit them.

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for every variable.

## Documentation

- [API reference](docs/API.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Deployment (Vercel + Render)](docs/DEPLOYMENT.md)
- [Testing](docs/TESTING.md)
- [Map data: PMTiles and OSRM](map-data/README.md)

## Changing the brand

Set `APP_NAME` (backend) and `VITE_APP_NAME` (frontend). The PWA name and
shortcuts live in `frontend/vite.config.ts`; icons are generated with
`node frontend/scripts/make-icons.mjs`. The wordmark component is
`frontend/src/components/ui.tsx`.

## License and attribution

Application code is private. Map data is © OpenStreetMap contributors, available
under the ODbL. Keep map attribution visible in the UI and in any distributed
tile archive.
