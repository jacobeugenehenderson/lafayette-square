#!/bin/bash
# Fetch park footways/paths/cycleways from OSM Overpass API
# Tighter bbox around Lafayette Park only (not the full neighborhood)
# Output: scripts/raw/osm_park_paths.json

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RAW_DIR="$SCRIPT_DIR/raw"
mkdir -p "$RAW_DIR"

# Park bbox: slightly larger than the park fence line
# Park center: 38.6160, -90.2161 — roughly 175m in each direction
# ~175m lat ≈ 0.00158°, ~175m lon ≈ 0.00202°
MIN_LAT=38.6143
MAX_LAT=38.6177
MIN_LON=-90.2182
MAX_LON=-90.2140

QUERY="[out:json][timeout:30];
(
  way[\"highway\"=\"footway\"](${MIN_LAT},${MIN_LON},${MAX_LAT},${MAX_LON});
  way[\"highway\"=\"path\"](${MIN_LAT},${MIN_LON},${MAX_LAT},${MAX_LON});
  way[\"highway\"=\"cycleway\"](${MIN_LAT},${MIN_LON},${MAX_LAT},${MAX_LON});
);
out body;
>;
out skel qt;"

echo "Fetching park paths from Overpass API..."
curl -s -X POST "https://overpass-api.de/api/interpreter" \
  --data-urlencode "data=${QUERY}" \
  -o "$RAW_DIR/osm_park_paths.json"

echo "Saved to $RAW_DIR/osm_park_paths.json"
NODE_COUNT=$(python3 -c "import json; d=json.load(open('$RAW_DIR/osm_park_paths.json')); print(len([e for e in d['elements'] if e['type']=='node']))" 2>/dev/null || echo "?")
WAY_COUNT=$(python3 -c "import json; d=json.load(open('$RAW_DIR/osm_park_paths.json')); print(len([e for e in d['elements'] if e['type']=='way']))" 2>/dev/null || echo "?")
echo "  $WAY_COUNT ways, $NODE_COUNT nodes"
