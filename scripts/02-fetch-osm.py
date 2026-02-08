#!/usr/bin/env python3
"""
02-fetch-osm.py

Fetch building enrichment data and POIs from OpenStreetMap's Overpass API
for Lafayette Square, St. Louis, MO.

Outputs:
  raw/osm_buildings.json  - Building footprints with tags (levels, material, heritage, etc.)
  raw/osm_pois.json       - Points of interest (amenity, shop, tourism, historic, etc.)
"""

import json
import sys
import time

import requests

from config import (
    BBOX,
    CENTER_LAT,
    CENTER_LON,
    LAT_TO_METERS,
    LON_TO_METERS,
    RAW_DIR,
    ensure_dirs,
    wgs84_to_local,
)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TIMEOUT = 60

# Overpass bbox format: (min_lat, min_lon, max_lat, max_lon)
OVERPASS_BBOX = (
    f"{BBOX['min_lat']},{BBOX['min_lon']},{BBOX['max_lat']},{BBOX['max_lon']}"
)


def overpass_query(query_body):
    """Send a query to the Overpass API and return the JSON response."""
    full_query = f"[out:json][timeout:{TIMEOUT}];{query_body}"
    print(f"  Sending Overpass query ({len(full_query)} chars)...")
    try:
        resp = requests.post(
            OVERPASS_URL,
            data={"data": full_query},
            timeout=TIMEOUT + 30,
        )
        resp.raise_for_status()
        data = resp.json()
        n_elements = len(data.get("elements", []))
        print(f"  Received {n_elements} elements")
        return data
    except requests.exceptions.Timeout:
        print("  WARNING: Overpass request timed out", file=sys.stderr)
        return {"elements": []}
    except requests.exceptions.HTTPError as e:
        print(f"  WARNING: Overpass HTTP error: {e}", file=sys.stderr)
        return {"elements": []}
    except requests.exceptions.RequestException as e:
        print(f"  WARNING: Overpass request failed: {e}", file=sys.stderr)
        return {"elements": []}
    except json.JSONDecodeError as e:
        print(f"  WARNING: Failed to parse Overpass response: {e}", file=sys.stderr)
        return {"elements": []}


def compute_centroid(coords):
    """Compute the centroid of a list of (lon, lat) coordinate pairs."""
    if not coords:
        return None, None
    avg_lon = sum(c[0] for c in coords) / len(coords)
    avg_lat = sum(c[1] for c in coords) / len(coords)
    return avg_lon, avg_lat


def fetch_buildings():
    """Fetch building ways from OSM with enrichment tags."""
    print("\n=== Fetching OSM buildings ===")

    query = (
        f"("
        f'way["building"]({OVERPASS_BBOX});'
        f");"
        f"out body;>;out skel qt;"
    )
    data = overpass_query(query)
    elements = data.get("elements", [])

    # Separate nodes from ways - we need the nodes to resolve way geometry
    nodes = {}
    ways = []
    for el in elements:
        if el["type"] == "node":
            nodes[el["id"]] = (el["lon"], el["lat"])
        elif el["type"] == "way":
            ways.append(el)

    print(f"  Resolved {len(nodes)} nodes, {len(ways)} building ways")

    # Tags we want to extract from buildings
    building_tag_keys = [
        "building",
        "building:levels",
        "height",
        "roof:shape",
        "building:material",
        "building:colour",
        "start_date",
        "architect",
        "heritage",
        "addr:housenumber",
        "addr:street",
        "name",
    ]

    buildings = []
    for way in ways:
        tags = way.get("tags", {})
        node_ids = way.get("nodes", [])

        # Resolve footprint polygon coordinates
        footprint = []
        for nid in node_ids:
            if nid in nodes:
                lon, lat = nodes[nid]
                lx, lz = wgs84_to_local(lon, lat)
                footprint.append({"lon": lon, "lat": lat, "x": round(lx, 2), "z": round(lz, 2)})
            else:
                print(f"  WARNING: Node {nid} not found for way {way['id']}", file=sys.stderr)

        # Compute centroid from resolved coordinates
        if footprint:
            coords = [(pt["lon"], pt["lat"]) for pt in footprint]
            clon, clat = compute_centroid(coords)
            cx, cz = wgs84_to_local(clon, clat)
        else:
            clon, clat = None, None
            cx, cz = None, None

        # Extract relevant tags
        extracted_tags = {}
        for key in building_tag_keys:
            if key in tags:
                extracted_tags[key] = tags[key]

        building_record = {
            "osm_id": way["id"],
            "centroid_lon": round(clon, 7) if clon is not None else None,
            "centroid_lat": round(clat, 7) if clat is not None else None,
            "centroid_x": round(cx, 2) if cx is not None else None,
            "centroid_z": round(cz, 2) if cz is not None else None,
            "tags": extracted_tags,
            "footprint": footprint,
        }
        buildings.append(building_record)

    print(f"  Processed {len(buildings)} buildings")

    # Summary of tag coverage
    tag_counts = {}
    for b in buildings:
        for key in b["tags"]:
            tag_counts[key] = tag_counts.get(key, 0) + 1
    if tag_counts:
        print("  Tag coverage:")
        for key in sorted(tag_counts, key=tag_counts.get, reverse=True):
            print(f"    {key}: {tag_counts[key]}/{len(buildings)}")

    return buildings


def fetch_pois():
    """Fetch points of interest from OSM."""
    print("\n=== Fetching OSM POIs ===")

    # Query for multiple POI categories
    poi_filters = [
        'node["amenity"]',
        'way["amenity"]',
        'node["shop"]',
        'way["shop"]',
        'node["tourism"]',
        'way["tourism"]',
        'node["historic"]',
        'way["historic"]',
        'node["leisure"]',
        'way["leisure"]',
        'node["healthcare"]',
        'way["healthcare"]',
    ]

    filter_str = "".join(f"{f}({OVERPASS_BBOX});" for f in poi_filters)
    query = f"({filter_str});out body;>;out skel qt;"

    data = overpass_query(query)
    elements = data.get("elements", [])

    # Separate nodes from ways
    node_coords = {}
    raw_nodes = []
    raw_ways = []
    for el in elements:
        if el["type"] == "node":
            node_coords[el["id"]] = (el["lon"], el["lat"])
            # Nodes with tags are POIs themselves
            if el.get("tags"):
                raw_nodes.append(el)
        elif el["type"] == "way":
            raw_ways.append(el)

    print(f"  Found {len(raw_nodes)} POI nodes, {len(raw_ways)} POI ways")

    # Tags we want to extract from POIs
    poi_tag_keys = [
        "name",
        "amenity",
        "shop",
        "tourism",
        "historic",
        "leisure",
        "healthcare",
        "opening_hours",
        "phone",
        "website",
        "cuisine",
        "denomination",
        "addr:housenumber",
        "addr:street",
    ]

    pois = []

    # Process POI nodes
    for node in raw_nodes:
        tags = node.get("tags", {})
        lon, lat = node["lon"], node["lat"]
        lx, lz = wgs84_to_local(lon, lat)

        extracted_tags = {}
        for key in poi_tag_keys:
            if key in tags:
                extracted_tags[key] = tags[key]

        # Determine POI category
        category = None
        for cat in ["amenity", "shop", "tourism", "historic", "leisure", "healthcare"]:
            if cat in tags:
                category = cat
                break

        poi_record = {
            "osm_id": node["id"],
            "type": "node",
            "category": category,
            "subcategory": tags.get(category, "") if category else "",
            "name": tags.get("name", ""),
            "lon": round(lon, 7),
            "lat": round(lat, 7),
            "x": round(lx, 2),
            "z": round(lz, 2),
            "tags": extracted_tags,
        }
        pois.append(poi_record)

    # Process POI ways (use centroid for position)
    for way in raw_ways:
        tags = way.get("tags", {})
        node_ids = way.get("nodes", [])

        coords = []
        for nid in node_ids:
            if nid in node_coords:
                coords.append(node_coords[nid])

        if coords:
            clon, clat = compute_centroid(coords)
            lx, lz = wgs84_to_local(clon, clat)
        else:
            clon, clat = None, None
            lx, lz = None, None

        extracted_tags = {}
        for key in poi_tag_keys:
            if key in tags:
                extracted_tags[key] = tags[key]

        category = None
        for cat in ["amenity", "shop", "tourism", "historic", "leisure", "healthcare"]:
            if cat in tags:
                category = cat
                break

        poi_record = {
            "osm_id": way["id"],
            "type": "way",
            "category": category,
            "subcategory": tags.get(category, "") if category else "",
            "name": tags.get("name", ""),
            "lon": round(clon, 7) if clon is not None else None,
            "lat": round(clat, 7) if clat is not None else None,
            "x": round(lx, 2) if lx is not None else None,
            "z": round(lz, 2) if lz is not None else None,
            "tags": extracted_tags,
        }
        pois.append(poi_record)

    # Filter out POIs without a name (optional, but keeps data cleaner)
    named_pois = [p for p in pois if p["name"]]
    unnamed_count = len(pois) - len(named_pois)
    print(f"  {len(named_pois)} named POIs, {unnamed_count} unnamed (keeping all)")

    # Summary by category
    cat_counts = {}
    for p in pois:
        cat = p.get("category", "unknown")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    if cat_counts:
        print("  POI categories:")
        for cat in sorted(cat_counts, key=cat_counts.get, reverse=True):
            print(f"    {cat}: {cat_counts[cat]}")

    return pois


def main():
    print("=" * 60)
    print("02-fetch-osm.py - OpenStreetMap data for Lafayette Square")
    print("=" * 60)
    print(f"Center: {CENTER_LAT}, {CENTER_LON}")
    print(f"BBOX: {BBOX['min_lat']},{BBOX['min_lon']} -> {BBOX['max_lat']},{BBOX['max_lon']}")

    ensure_dirs()

    # Fetch buildings
    buildings = fetch_buildings()

    buildings_path = f"{RAW_DIR}/osm_buildings.json"
    with open(buildings_path, "w") as f:
        json.dump(buildings, f, indent=2)
    print(f"\nSaved {len(buildings)} buildings to {buildings_path}")

    # Brief pause to be polite to the Overpass API
    print("\nWaiting 5 seconds before next query (Overpass rate limit)...")
    time.sleep(5)

    # Fetch POIs
    pois = fetch_pois()

    pois_path = f"{RAW_DIR}/osm_pois.json"
    with open(pois_path, "w") as f:
        json.dump(pois, f, indent=2)
    print(f"\nSaved {len(pois)} POIs to {pois_path}")

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
