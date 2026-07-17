#!/usr/bin/env python3
"""Fetch the Forest Park Forestry tree inventory (FORESTRY_TREES layer 4) for a scene.

The City Forestry service (13-fetch-city-trees.py) reads layer **1** (CITY_TREES,
street trees). Layer **4** (FOREST_PARK_TREES) is a SEPARATE, far richer managed
inventory on the SAME trusted endpoint — Scientific_Name / Genus / Family / DBH /
Condition / Height / Crown_Spread / Native — that we'd been ignoring. For a scene
that borders Forest Park (hipointe-demun), a big block of its trees fall inside the
boundary, real and species-bearing. This is the "free win" from the census
recovery (HANDOFF-tree-spokes-and-census.md §Ranked sources #2).

Written to a SEPARATE well (`clean/forest_park_trees.json`) so it composes with —
never clobbers — the City (layer 1) census and OSM. Real → meta.kind:'census'
(bake-trees nudges, never drops). Deduped against the other real wells at bake.

Usage:  CARTOGRAPH_SCENE=hipointe-demun python3 scripts/18-fetch-forest-park-trees.py
Output: cartograph/data/<scene>/clean/forest_park_trees.json
        cartograph/data/<scene>/raw/forest_park_trees_raw.json
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
    SCENE_RAW_DIR, SCENE_CLEAN_DIR, SCENE, PROJECT_DIR,
)
from tree_shape import get_shape

ENDPOINT = ("https://maps9.stlouis-mo.gov/arcgis/rest/services/"
            "FORESTRY/FORESTRY_TREES/MapServer/4/query")
OUT_FIELDS = ",".join([
    "OBJECTID", "Common_Names", "Scientific_Name", "Genus", "DBH", "Condition", "Status",
])
PAGE_SIZE = 2000
# Only living, standing trees. Layer 4's Status vocabulary; anything not clearly a
# live tree (removed / stump / vacant / planting site) is dropped.
KEEP_STATUS = None  # None = keep all non-empty; refined below by SKIP_STATUS
SKIP_STATUS = {"Removed", "Dead", "Stump", "Vacant", "Planting Site", "Removed Stump"}


def load_boundary_ring():
    path = os.path.join(PROJECT_DIR, 'cartograph', 'data', SCENE, 'neighborhood_boundary.json')
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
    n = len(ring); j = n - 1
    for i in range(n):
        xi, zi = ring[i]; xj, zj = ring[j]
        if (zi > pz) != (zj > pz) and px < (xj - xi) * (pz - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def build_params(offset):
    geom = json.dumps({
        "xmin": BBOX["min_lon"], "ymin": BBOX["min_lat"],
        "xmax": BBOX["max_lon"], "ymax": BBOX["max_lat"],
    })
    return {
        "where": "1=1", "geometry": geom, "geometryType": "esriGeometryEnvelope",
        "inSR": "4326", "outSR": "4326", "spatialRel": "esriSpatialRelIntersects",
        "outFields": OUT_FIELDS, "returnGeometry": "true", "f": "json",
        "resultRecordCount": PAGE_SIZE, "resultOffset": offset,
    }


def fetch_all():
    out = []
    offset = 0
    while True:
        print(f"  Fetching offset {offset}...")
        r = requests.get(ENDPOINT, params=build_params(offset), timeout=90)
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise RuntimeError(f"ArcGIS error: {data['error']}")
        feats = data.get("features", [])
        if not feats:
            break
        out.extend(feats)
        print(f"  Got {len(feats)} (total: {len(out)})")
        if not data.get("exceededTransferLimit", False) and len(feats) < PAGE_SIZE:
            break
        offset += len(feats)
        time.sleep(0.5)
    return out


def main():
    ensure_dirs()
    ring = load_boundary_ring()
    print("=" * 60)
    print(f"Fetching Forest Park Forestry (layer 4) for scene '{SCENE}'")
    print("=" * 60)
    raw = fetch_all()
    if not raw:
        print("No features fetched. Exiting.")
        sys.exit(1)
    raw_path = os.path.join(SCENE_RAW_DIR, "forest_park_trees_raw.json")
    with open(raw_path, "w") as f:
        json.dump({"features": raw, "endpoint": ENDPOINT, "bbox": BBOX}, f, separators=(",", ":"))
    print(f"\nWrote {len(raw)} raw features -> {raw_path}")

    trees = []
    skipped = Counter()
    for feat in raw:
        a = feat.get("attributes", {})
        g = feat.get("geometry")
        if not g or g.get("x") is None:
            skipped["no_geom"] += 1
            continue
        status = (a.get("Status") or "").strip()
        if status in SKIP_STATUS:
            skipped[status or "no_status"] += 1
            continue
        x, z = wgs84_to_local(g["x"], g["y"])
        if not point_in_ring(x, z, ring):
            skipped["outside_boundary"] += 1
            continue
        common = (a.get("Common_Names") or a.get("Scientific_Name") or "Unknown").strip()
        trees.append({
            "x": round(x, 1), "z": round(z, 1),
            "species": common, "shape": get_shape(common),
            "dbh": a.get("DBH") or 1, "condition": (a.get("Condition") or "").strip(),
        })

    print(f"\nInside boundary: {len(trees)} trees ({dict(skipped)} skipped)")
    print(f"Shapes: {dict(Counter(t['shape'] for t in trees))}")
    top = Counter(t["species"] for t in trees).most_common(12)
    print("Top species: " + ", ".join(f"{s} ({n})" for s, n in top))

    output = {
        "meta": {
            "source": "City of St. Louis Forestry — Forest Park inventory (FORESTRY_TREES layer 4)",
            "url": ENDPOINT, "scene": SCENE,
            "kind": "census", "well": "forest-park",
            "center": {"lat": CENTER_LAT, "lon": CENTER_LON},
            "total": len(trees),
            "coordinate_system": "Local meters, compass-aligned (unrotated equirectangular about scene center).",
        },
        "trees": trees,
    }
    out_path = os.path.join(SCENE_CLEAN_DIR, "forest_park_trees.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    print(f"\nWrote {len(trees)} trees -> {out_path}")


if __name__ == "__main__":
    main()
