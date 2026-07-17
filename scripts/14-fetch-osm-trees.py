#!/usr/bin/env python3
"""Fetch OSM `natural=tree` as the County-side (DeMun) tree floor for a scene.

The City Forestry census (13-fetch-city-trees.py) covers only in-city-limits
trees, so it stops at the City/County line — the whole DeMun (St. Louis County /
Clayton) half of the scene gets nothing from it. OSM's `natural=tree` nodes are
jurisdiction-blind and dense here (~16k in the bbox), so they're the honest
floor for DeMun until (if ever) Clayton's Davey 2022/23 inventory endpoint is
sourced.

⭐ DEDUP BY PROXIMITY, not by jurisdiction (2026-07-15).

This used to keep only nodes WEST of the City/County divide, so the OSM layer
could not double-count the City census on the Hi-Pointe side. Clean idea, ruinous
trade — MEASURED against the real data: of 2,491 OSM trees inside the disc, only
**55** sit within 3 m of a City tree. The divide cull was discarding **1,621 real
surveyed positions** to dodge a 55-tree collision, and the canopy fill then
invented thousands of fake trees to backfill the hole it left.

So: union both layers and drop only the OSM nodes that ACTUALLY coincide with a
City tree (DEDUP_M). Same disjointness guarantee, ~1,600 more real trees. The
divide survives only as the fallback when no City census exists at all.

We keep the census literal wherever we can get it and place it — an invented tree
is a last resort, never a substitute for one somebody actually recorded.

OSM caveats (it's a floor, not a survey): species is sparse and often a Latin
binomial rather than the Forestry `COMMON` vocabulary, so `shape` mostly falls
back to 'broad'; there's no DBH/condition. The Arborist's canonicalization is the
real species resolver downstream — here we just want honest POSITIONS.

Scene-aware via CARTOGRAPH_SCENE. Same park_trees.json schema, written to a
SEPARATE file so it composes with (never clobbers) the City census.

Usage:  CARTOGRAPH_SCENE=hipointe-demun python3 scripts/14-fetch-osm-trees.py
        …            --reuse-raw   re-derive from the raw well already on disk
                                   (no Overpass hit — the fetch is rate-limited
                                   and the raw nodes don't change hourly)

Output: cartograph/data/<scene>/clean/osm_trees.json   (the OSM census layer)
        cartograph/data/<scene>/raw/osm_trees_raw.json  (raw Overpass elements)
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

OVERPASS = "https://overpass-api.de/api/interpreter"
# Overpass 406s the default python-requests / empty User-Agent; identify honestly.
UA = "lafayette-square-cartograph/1.0 (neighborhood tree census)"


def scene_path(name):
    return os.path.join(PROJECT_DIR, 'cartograph', 'data', SCENE, name)


def load_boundary_ring():
    """Scene disc/boundary ring in local x/z (see 13-fetch-city-trees.py)."""
    path = scene_path('neighborhood_boundary.json')
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


def load_divide():
    """City/County divide as an x=f(z) table (sorted by z, z-deduped).

    Returns the vertex list, or None if the boundary file is absent (then we
    keep the whole disc — over-inclusive on the Hi-Pointe side, but DeMun still
    gets its trees rather than none).
    """
    path = scene_path('raw/admin_boundaries.json')
    if not os.path.exists(path):
        return None
    with open(path) as f:
        a = json.load(f)
    pts = [(c['x'], c['z']) for seg in a.get('segments', []) for c in seg['coords']]
    if len(pts) < 2:
        return None
    pts.sort(key=lambda p: p[1])
    deduped = []
    for x, z in pts:
        if deduped and z == deduped[-1][1]:
            continue  # drop duplicate-z (keep first) so x=f(z) is single-valued
        deduped.append((x, z))
    return deduped


def divide_x_at(z, divide):
    """Interpolated divide x at latitude z, clamped beyond the line's ends."""
    if z <= divide[0][1]:
        return divide[0][0]
    if z >= divide[-1][1]:
        return divide[-1][0]
    for i in range(1, len(divide)):
        x1, z1 = divide[i]
        if z1 >= z:
            x0, z0 = divide[i - 1]
            t = (z - z0) / (z1 - z0)
            return x0 + t * (x1 - x0)
    return divide[-1][0]


def osm_species(tags):
    """Best available species label from OSM tags (sparse; may be Latin)."""
    for k in ("species:en", "species", "genus:en", "genus"):
        v = (tags.get(k) or "").strip()
        if v:
            return v
    return "Unknown"


def fetch_overpass(ring_bbox):
    q = (f'[out:json][timeout:90];'
         f'node["natural"="tree"]'
         f'({ring_bbox["min_lat"]},{ring_bbox["min_lon"]},'
         f'{ring_bbox["max_lat"]},{ring_bbox["max_lon"]});out;')
    for attempt in range(3):
        print(f"  Overpass query (attempt {attempt + 1})...")
        resp = requests.post(OVERPASS, data={"data": q},
                             headers={"User-Agent": UA}, timeout=120)
        if resp.status_code == 200:
            return resp.json().get("elements", [])
        print(f"  HTTP {resp.status_code}; backing off...")
        time.sleep(5 * (attempt + 1))  # Overpass rate-limits; be patient
    raise RuntimeError("Overpass failed after 3 attempts")


# A tree recorded by BOTH the City and OSM is the same trunk twice. Measured on
# hipointe-demun: 43 pairs within 2 m, 55 within 3 m, 67 within 5 m — a flat tail,
# so 3 m sits comfortably past the real coincidences without eating neighbours
# (street trees are planted ~7 m apart; MIN_DIST in the canopy fill).
DEDUP_M = 3.0


def load_city_census():
    """The City Forestry census in local x/z, or None if this town has none."""
    path = scene_path('clean/park_trees.json')
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f).get('trees', [])


def make_dedup(city_trees):
    """Spatial hash → 'is there a City tree on this exact trunk?' in O(1)."""
    cell = DEDUP_M
    grid = {}
    for t in city_trees:
        k = (int(t['x'] // cell), int(t['z'] // cell))
        grid.setdefault(k, []).append((t['x'], t['z']))

    def coincides(x, z):
        gx, gz = int(x // cell), int(z // cell)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for (cx, cz) in grid.get((gx + dx, gz + dz), ()):
                    if (cx - x) ** 2 + (cz - z) ** 2 < DEDUP_M ** 2:
                        return True
        return False
    return coincides


def main():
    ensure_dirs()
    ring = load_boundary_ring()
    city = load_city_census()
    divide = None
    coincides = None
    if city:
        coincides = make_dedup(city)
        print(f"Dedup: {len(city)} City census trees loaded; dropping OSM nodes "
              f"within {DEDUP_M} m of one (the same trunk, recorded twice).")
    else:
        # No City census to collide with → nothing to dedup against. Fall back to
        # the old jurisdictional cull so a town with a divide still stays honest.
        divide = load_divide()
        if divide is None:
            print("No City census and no City/County divide — keeping the WHOLE disc.")
        else:
            print("No City census found — falling back to the City/County divide cull.")

    print("=" * 60)
    print(f"Fetching OSM natural=tree for scene '{SCENE}' (County/DeMun floor)")
    print(f"Bbox: {BBOX}")
    print("=" * 60)

    raw_path = os.path.join(SCENE_RAW_DIR, "osm_trees_raw.json")
    reuse = "--reuse-raw" in sys.argv and os.path.exists(raw_path)
    if reuse:
        with open(raw_path) as f:
            elements = json.load(f).get("elements", [])
        print(f"  Reusing {len(elements)} raw nodes from {raw_path} (no Overpass hit)")
    else:
        elements = fetch_overpass(BBOX)
        print(f"  Got {len(elements)} raw tree nodes")
    if not elements:
        print("No trees fetched. Exiting.")
        sys.exit(1)

    if not reuse:
        with open(raw_path, "w") as f:
            json.dump({"elements": elements, "endpoint": OVERPASS, "bbox": BBOX},
                      f, separators=(",", ":"))
        print(f"\nWrote {len(elements)} raw nodes -> {raw_path}")

    trees = []
    skipped = Counter()
    for el in elements:
        lat, lon = el.get("lat"), el.get("lon")
        if lat is None or lon is None:
            skipped["no_geom"] += 1
            continue
        x, z = wgs84_to_local(lon, lat)
        if not point_in_ring(x, z, ring):
            skipped["outside_disc"] += 1
            continue
        # Drop only the trunks the City already recorded — never a whole side of
        # the map. (`divide` is the no-City-census fallback.)
        if coincides is not None and coincides(x, z):
            skipped["duplicate_of_city_tree"] += 1
            continue
        if divide is not None and x >= divide_x_at(z, divide):
            skipped["city_side"] += 1
            continue
        species = osm_species(el.get("tags", {}))
        trees.append({
            "x": round(x, 1),
            "z": round(z, 1),
            "species": species,
            "shape": get_shape(species),
            "dbh": 1,           # OSM has no reliable DBH; floor value
            "condition": "",    # OSM has no condition; unknown
        })

    print(f"\nKept {len(trees)} County-side trees ({dict(skipped)} skipped)")
    print(f"Shapes: {dict(Counter(t['shape'] for t in trees))}")
    named = sum(1 for t in trees if t["species"] != "Unknown")
    print(f"With a species tag: {named}/{len(trees)}")

    output = {
        "meta": {
            "source": "OpenStreetMap (natural=tree, Overpass)",
            "url": OVERPASS,
            "scene": SCENE,
            "side": "County (DeMun) only — West of the City/County divide",
            "center": {"lat": CENTER_LAT, "lon": CENTER_LON},
            "total": len(trees),
            "license": "ODbL — OpenStreetMap contributors",
            "coordinate_system": ("Local meters, compass-aligned (unrotated "
                                  "equirectangular about scene center)."),
        },
        "trees": trees,
    }
    out_path = os.path.join(SCENE_CLEAN_DIR, "osm_trees.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    print(f"\nWrote {len(trees)} trees -> {out_path}")


if __name__ == "__main__":
    main()
