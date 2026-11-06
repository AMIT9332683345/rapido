# Deployment

Recommended topology:

```
Vercel (React PWA)  ──HTTPS──▶  Render (Express API + Socket.IO)
                                      │
                                      ├──▶ MongoDB Atlas
                                      ├──▶ OSRM (self-hosted, private)
                                      └──▶ PMTiles host (Range + CORS)
```

Never deploy with the public OSRM demo server or with `ROUTING_ALLOW_ESTIMATE=true`.

## 1. MongoDB Atlas

1. Create a database user with read/write access to one database.
2. Allow the Render egress IPs (or `0.0.0.0/0` if you accept the risk; IP
   allow-listing is strongly preferred).
3. Copy the connection string and append the database name, for example
   `.../amit?retryWrites=true&w=majority`.
4. The app creates its indexes on first use. If the database was previously used
   by another application and has a conflicting unique index on
   `payments.providerOrderId`, run the one-off migration from `backend/`:

```bash
npm run db:fix-indexes -- --dry-run   # inspect
npm run db:fix-indexes                # drop the legacy index
```

The script only drops that index when it is unique and non-sparse, and never
prints the connection string.

## 2. Backend on Render

A blueprint is included at the repository root (`render.yaml`). It creates a web
service with a persistent disk for uploads.

Manual setup:

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Runtime | Node 20+ |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check | `/api/health` |
| Persistent disk | mount `/var/data` (1 GB is plenty) |

Environment:

```dotenv
NODE_ENV=production
PORT=10000                 # Render sets PORT; do not hard-code locally
APP_NAME=Amit
MONGODB_URI=<Atlas URI>
JWT_SECRET=<48-byte random string>
FRONTEND_URL=https://your-app.vercel.app
FRONTEND_URLS=https://your-domain.example
ADMIN_NAME=Amit Admin
ADMIN_MOBILE=<10-digit mobile>
ADMIN_PASSWORD=<strong first-run password>
OSRM_BASE_URL=https://osrm.internal.example
ROUTING_ALLOW_ESTIMATE=false
UPLOAD_DIR=/var/data/uploads
SUPPORT_PHONE=<number>
SUPPORT_EMAIL=<email>
```

Notes:

- `ADMIN_PASSWORD` is only used when the admin account does not exist. Remove it
  after the first successful boot if your platform supports secret removal.
- Uploads must live on a persistent disk. Without one, rider documents disappear
  on every deploy.
- Socket.IO works over Render's HTTP service; sticky sessions are not required
  because the app uses a single instance. If you scale horizontally, add sticky
  sessions or a Socket.IO adapter.
- The server seeds the default fare and the Gosaba boundary on first start. It
  also warns if OSRM still points at the public demo server.

## 3. Frontend on Vercel

1. Import the repository and set **Root Directory** to `frontend`.
2. Framework preset: Vite. Build: `npm run build`. Output: `dist`.
3. Add build-time environment variables:

```dotenv
VITE_API_URL=https://amit-api.onrender.com/api
VITE_SOCKET_URL=https://amit-api.onrender.com
VITE_APP_NAME=Amit
VITE_APP_TAGLINE=Bike rides across Gosaba
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
# or, when self-hosting tiles:
# VITE_MAP_PMTILES_URL=https://cdn.example.com/maps/gosaba.pmtiles
VITE_CENTER_LAT=22.2167
VITE_CENTER_LNG=88.9000
```

`frontend/vercel.json` rewrites unknown paths to `index.html` so deep links such
as `/app/ride/<id>` and `/admin/reports` work. The PWA service worker and
manifest are generated at build time.

## 4. Routing service (OSRM)

OSRM is CPU- and RAM-hungry while building, then mostly RAM-hungry while
serving. A 2 GB VPS is enough for the West Bengal extract for this app.

```bash
cd map-data
./scripts/build-osrm.sh
docker compose -f docker-compose.osrm.yml up -d
```

Expose it over a private network or HTTPS with an allow-list. The API needs only
`GET /route/v1/driving/...`. Do not expose the router publicly.

See `map-data/README.md` for ferry exclusion and the no-river-crossings check.

## 5. Map tiles

Either keep `VITE_MAP_STYLE_URL` on OpenFreeMap, or build and host PMTiles:

```bash
cd map-data
./scripts/build-pmtiles.sh
```

Upload `gosaba.pmtiles` to a host with **Range support** and CORS (R2, S3,
nginx). Then set `VITE_MAP_PMTILES_URL` and rebuild the frontend.

## 6. HTTPS and CORS

- Vercel and Render provide TLS. Use HTTPS for both, otherwise the browser
  blocks geolocation and service workers.
- Set `FRONTEND_URL` to the exact Vercel origin (no trailing slash) and add
  preview domains to `FRONTEND_URLS`.
- Socket.IO uses the same origin list; a mismatched origin fails the handshake.

## 7. Post-deploy smoke test

1. Open the site on a phone; install the PWA when prompted.
2. Sign in as admin. Confirm the dashboard loads and `/api/health` reports the
   database as connected.
3. Approve a test rider and set them online at the service-area centre.
4. Register a customer in a second browser, book a short ride inside the
   polygon, and verify the rider receives the offer in real time.
5. Walk the ride through arriving → arrived → started → completed. Confirm the
   customer sees live GPS and IST timestamps.
6. Try a destination across a river and confirm the API refuses with
   `NO_ROAD_ROUTE` (or returns a real road route) instead of drawing a line over
   water.
7. Export a CSV and open **Reports** to confirm IST day buckets.

## Backups

Enable Atlas automated backups before onboarding real riders. Keep the upload
disk on a platform snapshot schedule; documents are not reproducible from the
database alone.
