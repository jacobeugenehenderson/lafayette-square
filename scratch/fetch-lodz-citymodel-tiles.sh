#!/bin/bash
# fetch-lodz-citymodel-tiles.sh — pull the Łódź municipal LOD2 makieta tiles that
# cover the Księży Młyn pour, keeping ONLY the buildings layer.
#
# Each tile ships as a 0.2–1.4 GB zip that is mostly orthophoto TIFs and a ~540 MB
# tree layer we don't want (we already have a real tree census). The buildings FBX
# inside is ~5 MB. So: download → extract buildings.fbx + .pos → convert to GLB →
# DELETE the zip. Peak disk stays ~1.5 GB instead of ~5 GB.
#
# Source: Urząd Miasta Łodzi / Łódzki Ośrodek Geodezji (capture MGGP Aero 2012/13).
# Attribution required; see public/baked/ksi-y-m-yn/citymodel/citymodel.json.
#
#   bash scratch/fetch-lodz-citymodel-tiles.sh
set -u
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
WORK=/tmp/lodz3d/tiles
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/baked/ksi-y-m-yn/citymodel"
mkdir -p "$WORK" "$OUT"

# tile:sharepoint-token  (tokens read from the ArcGIS LINK field)
while IFS=$'\t' read -r NR TOKEN; do
  [ -z "${NR:-}" ] && continue
  GLB="$OUT/O${NR}_buildings.glb"
  if [ -f "$GLB" ]; then echo "[$NR] already have GLB — skip"; continue; fi
  ZIP="$WORK/O${NR}_makieta.zip"
  echo "[$NR] downloading…"
  curl -sL -C - -A "$UA" -o "$ZIP" \
    "https://umllodzpl-my.sharepoint.com/personal/rewitalizacja_office_uml_lodz_pl/_layouts/15/download.aspx?share=$TOKEN"
  if ! unzip -tq "$ZIP" >/dev/null 2>&1; then echo "[$NR] ⛔ bad/incomplete zip — keeping for resume"; continue; fi
  echo "[$NR] extracting buildings layer…"
  unzip -o -q "$ZIP" "O${NR}_makieta/fbx/O${NR}_buildings.fbx" "O${NR}_makieta/fbx/O${NR}_buildings.pos" -d "$WORK" 2>/dev/null
  FBX="$WORK/O${NR}_makieta/fbx/O${NR}_buildings.fbx"
  if [ ! -f "$FBX" ]; then echo "[$NR] ⛔ no buildings fbx inside"; rm -f "$ZIP"; continue; fi
  assimp export "$FBX" "$GLB" -f glb2 >/dev/null 2>&1 \
    && echo "[$NR] ✅ $(du -h "$GLB" | cut -f1) GLB" || echo "[$NR] ⛔ assimp failed"
  cp "$WORK/O${NR}_makieta/fbx/O${NR}_buildings.pos" "$OUT/O${NR}_buildings.pos" 2>/dev/null
  rm -f "$ZIP"                      # the whole point — don't hoard gigabytes
done < "$(dirname "$0")/lodz-tile-tokens.tsv"
echo "ALL TILES DONE"
