#!/usr/bin/env python3
"""
16-fetch-osm-ground.py

Fetch all ground-plane vector features from OSM for Lafayette Square:
  - highway=* (ALL types: service, footway, cycleway, path, pedestrian, steps, alley)
  - landuse=* (residential, commercial, grass, etc.)
  - leisure=* as areas (swimming_pool, garden, playground, pitch, park)
  - natural=* as areas (water, scrub, grassland)
  - amenity=parking as areas
  - barrier=* as ways (fences, walls, hedges)
  - man_made=* (bridges, etc.)

All geometry is output as WGS84 + local XZ coords, with full OSM tags preserved.

Outputs:
  raw/osm_ground.json
"""

import json
import subprocess
import sys

from config import BBOX, RAW_DIR, ensure_dirs, wgs84_to_local

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TIMEOUT = 120

OVERPASS_BBOX = (
    f"{BBOX['min_lat']},{BBOX['min_lon']},{BBOX['max_lat']},{BBOX['max_lon']}"
)


def overpass_query_curl(query_body):
    """Send a query to Overpass via curl (bypasses Python SSL issues)."""
    full_query = f"[out:json][timeout:{TIMEOUT}];{query_body}"
    print(f"  Sending Overpass query ({len(full_query)} chars)...")

    result = subprocess.run(
        [
            "curl",
            "-s",
            "--max-time",
            str(TIMEOUT + 30),
            "--data-urlencode",
            f"data={full_query}",
            OVERPASS_URL,
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"  ERROR: curl failed: {result.stderr}", file=sys.stderr)
        return {"elements": []}

    try:
        data = json.loads(result.stdout)
        n = len(data.get("elements", []))
        print(f"  Received {n} elements")
        return data
    except json.JSONDecodeError as e:
        print(f"  ERROR: Bad JSON: {e}", file=sys.stderr)
        print(f"  Response starts with: {result.stdout[:200]}", file=sys.stderr)
        return {"elements": []}


def resolve_geometry(elements):
    """Separate nodes from ways/relations, resolve way coords."""
    nodes = {}
    ways = []
    relations = []

    for el in elements:
        if el["type"] == "node":
            nodes[el["id"]] = (el["lon"], el["lat"])
        elif el["type"] == "way":
            ways.append(el)
        elif el["type"] == "relation":
            relations.append(el)

    return nodes, ways, relations


def way_to_feature(way, nodes):
    """Convert an OSM way to a feature dict with local coords."""
    tags = way.get("tags", {})
    node_ids = way.get("nodes", [])

    coords = []
    for nid in node_ids:
        if nid in nodes:
            lon, lat = nodes[nid]
            x, z = wgs84_to_local(lon, lat)
            coords.append({
                "lon": round(lon, 7),
                "lat": round(lat, 7),
                "x": round(x, 2),
                "z": round(z, 2),
            })

    if len(coords) < 2:
        return None

    # Determine if it's a closed polygon (first node == last node)
    is_closed = len(node_ids) >= 4 and node_ids[0] == node_ids[-1]

    return {
        "osm_id": way["id"],
        "tags": tags,
        "is_closed": is_closed,
        "coords": coords,
    }


def main():
    print("=" * 60)
    print("16-fetch-osm-ground.py — All ground-plane features from OSM")
    print("=" * 60)
    print(f"BBOX: {OVERPASS_BBOX}")

    ensure_dirs()

    # Single comprehensive query: all ways with relevant tags + their nodes
    query = f"""(
  way["highway"]({OVERPASS_BBOX});
  way["landuse"]({OVERPASS_BBOX});
  way["leisure"]({OVERPASS_BBOX});
  way["natural"]({OVERPASS_BBOX});
  way["amenity"="parking"]({OVERPASS_BBOX});
  way["amenity"="swimming_pool"]({OVERPASS_BBOX});
  way["barrier"]({OVERPASS_BBOX});
  way["man_made"]({OVERPASS_BBOX});
  way["waterway"]({OVERPASS_BBOX});
  way["surface"]({OVERPASS_BBOX});
  way["area:highway"]({OVERPASS_BBOX});
);
out body;>;out skel qt;"""

    data = overpass_query_curl(query)
    elements = data.get("elements", [])

    nodes, ways, _ = resolve_geometry(elements)
    print(f"  {len(nodes)} nodes, {len(ways)} ways")

    # Convert to features grouped by primary tag
    features = {}
    tag_priority = [
        "highway", "landuse", "leisure", "natural", "amenity",
        "barrier", "man_made", "waterway", "area:highway", "surface",
    ]

    for way in ways:
        tags = way.get("tags", {})
        if not tags:
            continue

        feat = way_to_feature(way, nodes)
        if not feat:
            continue

        # Categorize by primary tag
        category = "other"
        for tag in tag_priority:
            if tag in tags:
                category = tag
                break

        if category not in features:
            features[category] = []
        features[category].append(feat)

    # Print summary
    print("\n  Features by category:")
    total = 0
    for cat in sorted(features.keys()):
        n = len(features[cat])
        total += n

        # Show subcategory breakdown
        subcats = {}
        for f in features[cat]:
            val = f["tags"].get(cat, "?")
            subcats[val] = subcats.get(val, 0) + 1
        breakdown = ", ".join(f"{v}={c}" for v, c in sorted(subcats.items(), key=lambda x: -x[1])[:8])
        print(f"    {cat}: {n}  ({breakdown})")

    print(f"  Total: {total} features")

    # Save
    out_path = f"{RAW_DIR}/osm_ground.json"
    output = {
        "bbox": {
            "min_lat": BBOX["min_lat"],
            "max_lat": BBOX["max_lat"],
            "min_lon": BBOX["min_lon"],
            "max_lon": BBOX["max_lon"],
        },
        "features": features,
        "node_count": len(nodes),
        "way_count": len(ways),
    }

    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    size_kb = len(json.dumps(output)) / 1024
    print(f"\n  Saved {out_path} ({size_kb:.0f} KB)")
    print("=" * 60)


if __name__ == "__main__":
    main()
