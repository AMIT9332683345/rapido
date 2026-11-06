#!/usr/bin/env bash
# Build a PMTiles archive for the service area from an OpenStreetMap extract.
# Requires: Java 17+, curl. Planetiler is downloaded on first run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${CACHE_DIR:-$ROOT/.cache}"
REGION_URL="${REGION_PBF_URL:-https://download.geofabrik.de/asia/india/west-bengal-latest.osm.pbf}"
OUT="${OUT:-$ROOT/gosaba.pmtiles}"
JAR="$CACHE/planetiler.jar"
PBF="$CACHE/region.osm.pbf"

mkdir -p "$CACHE"

command -v java >/dev/null 2>&1 || {
  echo "Java 17+ is required (https://adoptium.net)." >&2
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  echo "curl is required." >&2
  exit 1
}

if [ ! -f "$JAR" ]; then
  echo "Downloading Planetiler…"
  curl -fL --retry 3 -o "$JAR" \
    https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar
fi

if [ ! -f "$PBF" ]; then
  echo "Downloading OSM extract: $REGION_URL"
  curl -fL --retry 3 -o "$PBF" "$REGION_URL"
fi

echo "Building $OUT (this can take several minutes)…"
java -Xmx4g -jar "$JAR" \
  --osm-path="$PBF" \
  --output="$OUT" \
  --force

ls -lh "$OUT"
echo
echo "Upload the archive to a host with HTTP Range support + CORS, then set:"
echo "  VITE_MAP_PMTILES_URL=https://your-host/path/gosaba.pmtiles"
