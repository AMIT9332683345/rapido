# Map data for Gosaba

The app never calls Google or Mapbox. Maps use OpenStreetMap data rendered with
MapLibre GL JS, and routing uses a self-hosted OSRM instance built from the same
OSM extract. This folder contains the reproducible scripts for both.

## What you get

| Asset | Script | Purpose |
| --- | --- | --- |
| `gosaba.pmtiles` | `scripts/build-pmtiles.sh` | Vector tiles for the browser (roads, water, buildings, labels) |
| `osrm/` | `scripts/build-osrm.sh` | Road graph used for distance, duration and geometry |

Both scripts read the same Geofabrik extract (West Bengal by default), so the
map and the router agree about which roads exist.

> **Reality check:** OSM coverage in the Sundarbans is thin. Do not invent roads,
> bridges or river crossings to make a route appear. If a route does not exist,
> OSRM returns `NoRoute` and the API refuses to price the ride. Use
> **Admin → Map notes** to record local landmarks, roads and closures that OSM
> does not know about.

## 1. Build the vector tiles (PMTiles)

Requirements: Java 17+ and `curl`. Planetiler downloads its own dependencies.

```bash
cd map-data
./scripts/build-pmtiles.sh
```

The script downloads `planetiler.jar` and `west-bengal-latest.osm.pbf` into
`map-data/.cache/` (git-ignored), then writes `map-data/gosaba.pmtiles`.

Use a different extract with:

```bash
REGION_PBF_URL=https://download.geofabrik.de/asia/india-latest.osm.pbf \
  ./scripts/build-pmtiles.sh
```

### Host the archive

PMTiles needs a host that supports **HTTP Range requests** and CORS. Good
options: Cloudflare R2, S3, a small nginx box, or a Render disk served by the
backend. Vercel's static host is fine for a small file but check its size and
range support first.

Then point the frontend at the archive at build time:

```dotenv
VITE_MAP_PMTILES_URL=https://cdn.example.com/maps/gosaba.pmtiles
```

`frontend/src/lib/mapStyle.ts` builds an OpenMapTiles-compatible style around
that URL. If the variable is empty, the app falls back to
`VITE_MAP_STYLE_URL` (the free OpenFreeMap Liberty style).

## 2. Build the OSRM router

The recommended path is Docker:

```bash
cd map-data
./scripts/build-osrm.sh
```

It runs `osrm-extract`, `osrm-partition` and `osrm-customize` with the **car**
profile and writes the graph to `map-data/osrm/`. Start the server with:

```bash
docker run -t -i -p 5001:5000 -v "$PWD/osrm:/data" \
  osrm/osrm-backend osrm-routed --algorithm mld /data/west-bengal.osrm
```

Then set on the API:

```dotenv
OSRM_BASE_URL=http://127.0.0.1:5001
ROUTING_ALLOW_ESTIMATE=false
```

In production keep `ROUTING_ALLOW_ESTIMATE=false`. A straight-line estimate must
never be used to price a real ride in a river delta.

### Exclude ferries

The car profile can follow `route=ferry` ways. This platform uses bikes on
roads, not boats, so exclude ferries before extracting. In a copy of
`profiles/car.lua`, add this at the top of `process_way`:

```lua
if way:get_value_by_key("route") == "ferry" then
  return
end
```

Pass the patched profile with `-p /data/car-no-ferry.lua` (Docker) or
`-p /path/to/car-no-ferry.lua` (native install).

### Verify before launch

Pick two points on opposite banks of a river and call the API:

```bash
curl -s -X POST http://localhost:5000/api/geo/estimate \
  -H "Authorization: Bearer <customer-token>" \
  -H "Content-Type: application/json" \
  -d '{"pickup":{"lat":22.2167,"lng":88.9},"destination":{"lat":22.20,"lng":88.95}}'
```

The expected answer is an error with code `NO_ROAD_ROUTE`, or a real road route
that stays on land. If the response draws a line across water, stop and fix the
OSM data or the profile before accepting live bookings.

## 3. Keep local data honest

- Edit the boundary only with survey/OSM data in **Admin → Service area**.
- Record ferry ghats, seasonal roads and closures in **Admin → Map notes**.
- Never edit the OSM extract outside the normal OSM editing tools. Local changes
  belong in Map notes or in OpenStreetMap itself.

## Licensing

OpenStreetMap data is © OpenStreetMap contributors and is available under the
Open Data Commons Open Database License (ODbL). Keep the attribution visible in
the app and in any published tile archive.
