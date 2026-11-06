# API reference

Base URL: `http://localhost:5000/api` in development.
All responses are JSON unless noted.

## Authentication

Send the JWT from a login/register response:

```
Authorization: Bearer <token>
```

Tokens are role-scoped: `customer`, `rider`, `admin`. Using a token against
another role's routes returns `403`.

### Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Enter your name",
    "details": [{ "field": "name", "message": "Enter your name" }]
  }
}
```

Common codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `NO_ROAD_ROUTE`, `ROUTING_UNAVAILABLE`,
`OUTSIDE_SERVICE_AREA`, `RIDE_UNAVAILABLE`.

### Auth endpoints

| Method | Path | Body |
| --- | --- | --- |
| POST | `/auth/customer/register` | `{ name, mobile, password }` |
| POST | `/auth/customer/login` | `{ mobile, password }` |
| POST | `/auth/rider/register` | `{ name, mobile, password, vehicle: { type: "bike"\|"scooter", make, model, registrationNumber, color?, year? } }` |
| POST | `/auth/rider/login` | `{ mobile, password }` |
| POST | `/auth/admin/login` | `{ mobile, password }` |
| GET | `/auth/me` | — (returns role, profile, documents, vehicle) |

Registration and login return `{ token, role, user }`.

## Public

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | uptime, DB status, socket engine |
| GET | `/config` | app name, fare, service area summary, map URLs |
| GET | `/geo/service-area` | active boundary GeoJSON and availability |

## Customer (`role: customer`)

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/customer/profile` | — |
| PATCH | `/customer/profile` | `{ name?, photoUrl? }` |
| GET | `/customer/saved-locations` | — |
| POST | `/customer/saved-locations` | `{ label, address?, lat, lng }` |
| DELETE | `/customer/saved-locations/:id` | — |
| GET | `/customer/bookings/active` | — |
| POST | `/customer/bookings` | `{ pickup: Place, destination: Place, note? }` |
| GET | `/customer/bookings/:id` | — |
| POST | `/customer/bookings/:id/cancel` | `{ reason? }` |
| GET | `/customer/rides` | `?filter=all\|active\|completed\|cancelled&page&limit` |

`Place = { label, address?, lat, lng }`. Creating a booking checks the service
area, builds a real OSRM route, calculates the fare, and starts dispatch.
Cancelling may record a cancellation fee when a rider has already accepted.

## Rider (`role: rider`)

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/rider/profile` | — |
| PATCH | `/rider/profile` | `{ name?, photoUrl? }` |
| PUT | `/rider/vehicle` | `{ type, make, model, registrationNumber, color?, year? }` |
| POST | `/rider/documents` | `{ kind, number?, frontUrl, backUrl? }` |
| GET | `/rider/documents` | — |
| PATCH | `/rider/availability` | `{ isOnline: boolean, location?: { lat, lng } }` |
| PUT | `/rider/location` | `{ lat, lng, heading?, speed?, accuracy? }` |
| GET | `/rider/requests/current` | current offer (if any) |
| GET | `/rider/bookings/active` | — |
| POST | `/rider/bookings/:id/accept` | — |
| POST | `/rider/bookings/:id/reject` | `{ reason? }` |
| POST | `/rider/bookings/:id/arriving` | — |
| POST | `/rider/bookings/:id/arrive` | — |
| POST | `/rider/bookings/:id/start` | — |
| POST | `/rider/bookings/:id/complete` | — |
| POST | `/rider/bookings/:id/cancel` | `{ reason? }` |
| GET | `/rider/bookings/:id` | — |
| GET | `/rider/rides` | `?filter=all\|active\|completed\|cancelled` |
| GET | `/rider/earnings` | `?range=today\|week\|month` (IST buckets) |
| PATCH | `/rider/push-token` | `{ token }` |

Only approved riders (`status: "approved"`) can go online, receive offers, or
change ride state. Documents are `licence`, `aadhaar`, `rc`, `insurance`,
`permit`, `other`; each needs an uploaded image/PDF URL from `/uploads`.

## Geo

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/geo/search?q=` | any role | Nominatim proxy (min 2 chars), flagged `insideServiceArea` |
| GET | `/geo/reverse?lat&lng` | any role | reverse geocode |
| POST | `/geo/estimate` | any role | `{ pickup, destination }` → route + fare |
| GET | `/geo/nearby-riders?lat&lng` | any role | online approved riders within radius |

`POST /geo/estimate` returns `{ route: { distanceMeters, durationSeconds, geometry, provider, isEstimate }, fare, currency, paymentMethod }`.
Destinations outside the service polygon are rejected.

## Uploads and files

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/uploads` | multipart field `file`; JPG/PNG/WebP/PDF, max 5 MB |
| GET | `/files/:name` | authenticated file stream (documents are not public) |

## Notifications

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications` | latest notifications for the signed-in user |
| POST | `/notifications/read-all` | mark all read |
| POST | `/notifications/device-token` | `{ token }` for FCM (customer/rider) |
| DELETE | `/notifications/device-token` | `{ token }` |

## Admin (`role: admin`)

### Riders and customers

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/stats` | dashboard counters and revenue |
| GET | `/admin/riders` | `?status&search&page&limit` |
| GET | `/admin/riders/:id` | profile, vehicle, documents, recent rides |
| PATCH | `/admin/riders/:id/status` | `{ status: "approved"\|"rejected"\|"suspended", reason? }` |
| PATCH | `/admin/riders/:riderId/documents/:docId` | `{ status: "approved"\|"rejected", note? }` |
| GET | `/admin/customers` | `?search&blocked&page&limit` |
| PATCH | `/admin/customers/:id/block` | `{ blocked: boolean }` |

### Bookings and live operations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/bookings` | `?status=CANCELLED,EXPIRED&from&to&search&page&limit` |
| GET | `/admin/bookings/export.csv` | same filters, CSV download |
| GET | `/admin/bookings/:id` | booking + activity log |
| POST | `/admin/bookings/:id/cancel` | `{ reason? }` |
| GET | `/admin/live` | active rides + online rider locations |

### Configuration

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/fare-config` | active fare |
| PUT | `/admin/fare-config` | `{ name?, baseFare, perKm, perMinute, minimumFare, waitingFreeMinutes, waitingPerMinute, cancellationFee, platformFee }` |
| GET | `/admin/service-area` | boundary, centre, availability |
| PUT | `/admin/service-area` | `{ name?, description?, boundary?, center?, isAvailable?, unavailableMessage? }` |
| GET | `/admin/reports?days=30` | daily bookings, completed, cancelled, revenue, distance (IST) |

`PUT /admin/service-area` validates GeoJSON rings (longitude first) and requires
the centre to lie inside the polygon. Changes apply to new bookings immediately.

### Map notes (local road/landmark data)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/map-notes` | `?type=landmark\|road\|closure\|other&search` |
| POST | `/admin/map-notes` | `{ label, description?, type?, lat, lng, isActive? }` |
| PATCH | `/admin/map-notes/:id` | any subset; send `lat` and `lng` together |
| DELETE | `/admin/map-notes/:id` | — |

Notes are stored as GeoJSON points with a `2dsphere` index and are meant for
landmarks, local roads and closures missing from OpenStreetMap. They never
modify OSM data or the routing graph.

## Socket.IO

Connect to the API origin with the same JWT:

```js
io(SOCKET_URL, { auth: { token } });
```

The server joins the socket to `user:<id>`, `rider:<id>` (riders), or `admins`.

| Event | Direction | Payload |
| --- | --- | --- |
| `connected` | server → client | `{ role, id }` |
| `booking:new` | server → rider | current offer |
| `booking:update` | server → customer/rider/admins | role-aware booking |
| `ride:request:closed` | server → rider | offer withdrawn |
| `rider:location` | server → customer/booking room | `{ bookingId, lat, lng, heading, speed, at }` |
| `admin:rider-location` | server → admins | rider GPS |
| `admin:booking` | server → admins | `{ id, status }` |
| `admin:rider-availability` | server → admins | online/offline changes |
| `notification` | server → user | in-app notification |

## Rate limits

| Scope | Limit |
| --- | --- |
| Global `/api` | 1200 requests / 15 min / IP |
| Auth | 30 requests / 15 min / IP |
| Booking creation | 20 requests / 10 min |
| Geo lookups | 100 requests / 5 min |

Limits are intentionally strict for a small service area; adjust
`backend/src/middleware/rateLimit.ts` for larger deployments.
