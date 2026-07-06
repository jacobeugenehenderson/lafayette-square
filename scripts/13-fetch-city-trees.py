#!/usr/bin/env python3
"""Fetch the City of St. Louis Forestry street-tree census for a poured scene.

Mirrors the LS tree provenance (`src/data/park_trees.json`) but for a whole
neighborhood instead of a single park. The City's Forestry inventory moved off
the retired `maps6/FORESTRY_TREES` service (what the LS export used) to
`maps9`, now serving the FULL managed inventory (street + park), not the
park-clipped subset. Layer 1 = CITY_TREES (real trees; layer 0 also includes
vacant planting sites). Fields COMMON/DBH/STEMS/CONDITION == the LS roster
schema, so this writes the same `park_trees.json` shape the bake already reads.

Scope: this is the CITY (Hi-Pointe) side only. The City server holds only
in-city-limits trees, so clipping to the scene boundary naturally yields the
Hi-Pointe portion; the DeMun (St. Louis County / Clayton) side gets nothing
here and is covered by OSM `natural=tree` (see
HANDOFF-hipointe-trees-lamps-fetch.md).

Scene-aware via CARTOGRAPH_SCENE (scripts/config.py). Boundary + output paths
redirect into cartograph/data/<scene>/. Intended for poured neighborhood scenes
(needs cartograph/data/<scene>/neighborhood_boundary.json); LS keeps its own
park-clipped 12-process-park-trees.py.

Usage:  CARTOGRAPH_SCENE=hipointe-demun python3 scripts/13-fetch-city-trees.py

Output: cartograph/data/<scene>/clean/park_trees.json  (the scene census)
        cartograph/data/<scene>/raw/city_trees_raw.json (raw ArcGIS features)
"""

import json
import os
import sys
import time
from collections import Counter

try:
    import requests
except ImportError:
    print("Missing requests. Install with: pip install requests")
    sys.exit(1)

from config import (
    CENTER_LAT, CENTER_LON, BBOX,
    wgs84_to_local, ensure_dirs,
    RAW_DIR, DATA_DIR, SCENE, PROJECT_DIR, DEFAULT_SCENE,
)
from tree_shape import get_shape

# City of St. Louis Forestry — FeatureServer moved maps6 (retired) -> maps9.
# Layer 1 = CITY_TREES (trees only). Layer 0 (CITY_TREES_ALL_SITES) also
# includes vacant planting sites; use 1 for a census of actual trees.
ENDPOINT = ("https://maps9.stlouis-mo.gov/arcgis/rest/services/"
            "FORESTRY/FORESTRY_TREES/MapServer/1/query")

OUT_FIELDS = ",".join([
    "OBJECTID", "COMMON", "DBH", "STEMS", "CONDITION", "ON_", "STREET", "ADDRESS",
])

PAGE_SIZE = 2000
SKIP_CONDITIONS = {"Dead", "Stump"}


def load_boundary_ring():
    """Load the scene boundary polygon (local x/z) to clip trees against.

    cartograph/data/<scene>/neighborhood_boundary.json ['boundary'] is a ring of
    [x, z] pairs in the same local frame wgs84_to_local() projects into (origin
    = scene centroid). Point-in-ring is orientation-exact, so it also holds if
    the boundary later becomes a non-circular street polygon.
    """
    if SCENE == DEFAULT_SCENE:
        print("This script targets poured neighborhood scenes. For LS use "
              "scripts/12-process-park-trees.py (park-clipped).")
        sys.exit(1)
    path = os.path.join(PROJECT_DIR, 'cartograph', 'data', SCENE,
                        'neighborhood_boundary.json')
    if not os.path.exists(path):
        print(f"No boundary polygon at {path}; run the scene prebake first.")
        sys.exit(1)
    with open(path) as f:
        b = json.load(f)
    ring = b.get('boundary')
    if not ring:
        raise RuntimeError(f"No 'boundary' ring in {path}")
    return [(pt[0], pt[1]) for pt in ring]


def point_in_ring(px, pz, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, zi = ring[i]
        xj, zj = ring[j]
        if (zi > pz) != (zj > pz) and px < (xj - xi) * (pz - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def build_query_params(offset=0):
    geometry = json.dumps({
        "xmin": BBOX["min_lon"], "ymin": BBOX["min_lat"],
        "xmax": BBOX["max_lon"], "ymax": BBOX["max_lat"],
    })
    return {
        "where": "1=1",
        "geometry": geometry,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": OUT_FIELDS,
        "returnGeometry": "true",
        "f": "json",
        "resultRecordCount": PAGE_SIZE,
        "resultOffset": offset,
    }


def fetch_all():
    """Fetch all tree features in the bbox, handling ArcGIS pagination."""
    all_features = []
    offset = 0
    while True:
        print(f"  Fetching offset {offset}...")
        resp = requests.get(ENDPOINT, params=build_query_params(offset), timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            err = data["error"]
            raise RuntimeError(f"ArcGIS error {err.get('code', '?')}: "
                               f"{err.get('message', 'Unknown')}")
        features = data.get("features", [])
        if not features:
            break
        all_features.extend(features)
        print(f"  Got {len(features)} (total: {len(all_features)})")
        exceeded = data.get("exceededTransferLimit", False)
        if not exceeded and len(features) < PAGE_SIZE:
            break
        offset += len(features)
        time.sleep(0.5)  # polite
    return all_features


def main():
    ensure_dirs()
    ring = load_boundary_ring()

    print("=" * 60)
    print(f"Fetching City Forestry trees for scene '{SCENE}'")
    print(f"Endpoint: {ENDPOINT}")
    print(f"Bbox: {BBOX}")
    print("=" * 60)

    raw_features = fetch_all()
    if not raw_features:
        print("No features fetched (server down or empty bbox). Exiting.")
        sys.exit(1)

    # Persist raw for provenance / re-processing without a re-fetch.
    raw_path = os.path.join(RAW_DIR, "city_trees_raw.json")
    with open(raw_path, "w") as f:
        json.dump({"features": raw_features, "endpoint": ENDPOINT, "bbox": BBOX},
                  f, separators=(",", ":"))
    print(f"\nWrote {len(raw_features)} raw features -> {raw_path}")

    trees = []
    skipped = Counter()
    for feat in raw_features:
        attrs = feat.get("attributes", {})
        geom = feat.get("geometry")
        if not geom or geom.get("x") is None:
            skipped["no_geom"] += 1
            continue
        condition = (attrs.get("CONDITION") or "").strip()
        if condition in SKIP_CONDITIONS:
            skipped[condition.lower()] += 1
            continue

        x, z = wgs84_to_local(geom["x"], geom["y"])
        # Clip to the scene boundary (City server also returns trees east of the
        # neighborhood that fall in the bbox); disc/fade drops anything beyond.
        if not point_in_ring(x, z, ring):
            skipped["outside_boundary"] += 1
            continue

        common = (attrs.get("COMMON") or "Unknown").strip()
        trees.append({
            "x": round(x, 1),
            "z": round(z, 1),
            "species": common,
            "shape": get_shape(common),
            "dbh": attrs.get("DBH") or 1,
            "condition": condition,
        })

    print(f"\nProcessed {len(trees)} trees ({dict(skipped)} skipped)")
    print(f"Shapes: {dict(Counter(t['shape'] for t in trees))}")
    top = Counter(t["species"] for t in trees).most_common(12)
    print("Top species: " + ", ".join(f"{s} ({n})" for s, n in top))

    output = {
        "meta": {
            "source": "City of St. Louis Forestry Division",
            "url": ENDPOINT,
            "scene": SCENE,
            "side": "City (Hi-Pointe) only; DeMun/County via OSM",
            "center": {"lat": CENTER_LAT, "lon": CENTER_LON},
            "total": len(trees),
            "coordinate_system": ("Local meters, compass-aligned (unrotated "
                                  "equirectangular about scene center)."),
        },
        "trees": trees,
    }
    out_path = os.path.join(DATA_DIR, "park_trees.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    print(f"\nWrote {len(trees)} trees -> {out_path}")


if __name__ == "__main__":
    main()
