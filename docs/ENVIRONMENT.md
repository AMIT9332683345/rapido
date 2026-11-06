# Environment variables

Start from the committed examples. Never commit a real `.env`.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`.gitignore` excludes `.env`, `.env.local`, `.env.production`, and `*.local`.
`backend/.env.example` and `frontend/.env.example` contain placeholders only.

## Backend (`backend/.env`)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development`, `test`, or `production` |
| `PORT` | no | `5000` | Render supplies its own port |
| `APP_NAME` | no | `Amit` | Shown in API metadata; editable brand |
| `MONGODB_URI` | **yes** | — | Atlas connection string including the database name |
| `JWT_SECRET` | **yes** | — | At least 32 characters. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_EXPIRES_IN` | no | `7d` | Any `jsonwebtoken` duration |
| `FRONTEND_URL` | no | `http://localhost:5173` | Primary allowed CORS origin |
| `FRONTEND_URLS` | no | — | Comma-separated extra origins (previews, custom domain) |
| `PUBLIC_BASE_URL` | no | — | External URL of the API if absolute URLs are needed |
| `ADMIN_NAME` | no | `Amit Admin` | Used only when bootstrapping |
| `ADMIN_MOBILE` | no | — | Bootstrap admin mobile (10 digits, starts 6–9) |
| `ADMIN_PASSWORD` | no | — | Bootstrap password, min 8 chars. No default password exists |
| `OSRM_BASE_URL` | no | public demo | Must be your self-hosted OSRM in production |
| `ROUTING_ALLOW_ESTIMATE` | no | `false` | `true` labels straight-line fallback routes; keep `false` in production |
| `RIDE_REQUEST_RADIUS_KM` | no | `6` | Nearby rider search radius (capped at 10 in the nearby endpoint) |
| `BOOKING_OFFER_SECONDS` | no | `60` | Time a rider has to accept an offer |
| `BOOKING_SEARCH_MINUTES` | no | `4` | Total dispatch window before expiry |
| `RIDE_REQUEST_MAX_ROUNDS` | no | `6` | Re-offer rounds |
| `OSM_USER_AGENT` | no | `AmitRide/1.0` | Nominatim requires a descriptive UA |
| `SUPPORT_PHONE` | no | — | Shown in the apps |
| `SUPPORT_EMAIL` | no | `support@amitride.local` | Shown in the apps |
| `UPLOAD_DIR` | no | `uploads` | Relative to the process cwd, or absolute (Render disk) |
| `MAP_PMTILES_URL` | no | — | Reported by `/api/config`; the frontend build uses `VITE_MAP_PMTILES_URL` |
| `MAP_STYLE_URL` | no | — | Reported by `/api/config` |
| `FCM_PROJECT_ID` | no | — | Firebase Cloud Messaging HTTP v1 |
| `FCM_CLIENT_EMAIL` | no | — | Service-account email |
| `FCM_PRIVATE_KEY` | no | — | Service-account private key with `\n` escapes preserved |

### Admin bootstrap

`ADMIN_MOBILE` **and** `ADMIN_PASSWORD` must both be set on first start. The
server creates the admin once and never overwrites an existing account or
password. After the first successful start you may remove `ADMIN_PASSWORD` from
the environment, but keep the database account.

### Upload storage

`UPLOAD_DIR` is resolved against the process working directory. On Render,
mount a persistent disk (for example `/var/data`) and set:

```dotenv
UPLOAD_DIR=/var/data/uploads
```

Uploaded rider documents are only served through the authenticated
`GET /api/files/:name` endpoint.

### Firebase push (optional)

In-app notifications and Socket.IO updates work without Firebase. To enable
background web push:

1. Create a Firebase project and a Web app.
2. Generate a service account; copy project id, client email and private key to
   `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.
3. Copy the Web app config plus a Web Push VAPID key to the frontend variables
   below.

## Frontend (`frontend/.env`)

Vite embeds these at **build time**. Rebuild after changing any value.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `VITE_API_URL` | no | `http://localhost:5000/api` | Full API base including `/api` |
| `VITE_SOCKET_URL` | no | `http://localhost:5000` | API origin for Socket.IO |
| `VITE_APP_NAME` | no | `Amit` | Editable brand |
| `VITE_APP_TAGLINE` | no | `Bike taxi for the islands` | Landing page tagline |
| `VITE_MAP_STYLE_URL` | no | OpenFreeMap Liberty | No API key required |
| `VITE_MAP_PMTILES_URL` | no | — | When set, overrides the style with a self-hosted PMTiles archive |
| `VITE_MAP_GLYPHS_URL` | no | `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` | Font endpoint for self-hosted styles |
| `VITE_CENTER_LAT` | no | `22.2167` | Initial map centre |
| `VITE_CENTER_LNG` | no | `88.9000` | Initial map centre |
| `VITE_FIREBASE_API_KEY` | no | — | Firebase Web SDK |
| `VITE_FIREBASE_AUTH_DOMAIN` | no | — | Firebase Web SDK |
| `VITE_FIREBASE_PROJECT_ID` | no | — | Firebase Web SDK |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | no | — | Firebase Web SDK |
| `VITE_FIREBASE_APP_ID` | no | — | Firebase Web SDK |
| `VITE_FIREBASE_VAPID_KEY` | no | — | Web Push certificate key pair |

## Rotating secrets

1. Generate a new `JWT_SECRET` and update the backend environment.
2. Deploy/restart the API. Existing tokens become invalid and users sign in
   again.
3. Rotate `ADMIN_PASSWORD` by updating the admin document with a new bcrypt hash
   (there is no password-reset endpoint by design). If you have a trusted Node
   shell:

```bash
node -e "const b=require('bcryptjs');console.log(b.hashSync(process.argv[1],12))" 'new-password'
# update Admins.passwordHash in Atlas with the printed hash
```

Never paste production secrets into chat, logs, tickets, or git.
