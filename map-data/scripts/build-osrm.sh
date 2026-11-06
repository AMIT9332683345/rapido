#!/usr/bin/env bash
# Build an OSRM road graph for the service area using Docker.
# Requires: Docker, curl.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${CACHE_DIR:-$ROOT/.cache}"
PBF="$CACHE/region.osm.pbf"
OSRM_DIR="$ROOT/osrm"
REGION_URL="${REGION_PBF_URL:-https://download.geofabrik.de/asia/india/west-bengal-latest.osm.pbf}"
PROFILE_IN_CONTAINER="${OSRM_PROFILE:-/opt/car.lua}"

mkdir -p "$CACHE" "$OSRM_DIR"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required. On a server you can also install osrm-backend natively." >&2
  exit 1
}

if [ ! -f "$PBF" ]; then
  echo "Downloading OSM extract: $REGION_URL"
  curl -fL --retry 3 -o "$PBF" "$REGION_URL"
fi

run() {
  docker run --rm -t -v "$ROOT:/data" -w /data \
    osrm/osrm-backend "$@"
}

echo "Extracting… (use a no-ferry profile if needed; see map-data/README.md)"
run osrm-extract -p "$PROFILE_IN_CONTAINER" /data/.cache/region.osm.pbf

echo "Partitioning…"
run osrm-partition /data/.cache/region.osrm

echo "Customizing…"
run osrm-customize /data/.cache/region.osrm

echo
echo "Graph files are in $CACHE. Start the router with:"
echo "  docker run -t -i -p 5001:5000 -v \"$CACHE:/data\" osrm/osrm-backend \\"
echo "    osrm-routed --algorithm mld /data/region.osrm"
echo
echo "Then set OSRM_BASE_URL=http://127.0.0.1:5001 on the API."
