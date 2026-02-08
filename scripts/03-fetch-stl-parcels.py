#!/usr/bin/env python3
"""
Fetch parcel data from St. Louis Open Data ArcGIS REST API for Lafayette Square.

Queries the City of St. Louis parcel layer, extracts property attributes
(year built, stories, sqft, appraised value, land use), and converts
polygon geometries to local coordinates.

Usage: python scripts/03-fetch-stl-parcels.py

Output: scripts/raw/stl_parcels.json
"""

import json
import sys
import time

try:
    import requests
except ImportError:
    print("Missing requests. Install with: pip install requests")
    sys.exit(1)

from config import (
    CENTER_LAT, CENTER_LON, BBOX,
    LON_TO_METERS, LAT_TO_METERS,
    wgs84_to_local, ensure_dirs, RAW_DIR,
)

# ArcGIS REST endpoints to try (in order of preference)
PARCEL_ENDPOINTS = [
    "https://maps8.stlouis-mo.gov/arcgis/rest/services/ASSESSOR/Assessor_Public_Parcels/MapServer/11/query",
]

# Fields to request from the parcel layer
OUT_FIELDS = ",".join([
    "Handle",
    "SITEADDR",
    "OwnerName",
    "NbrOfApts",
    "NbrOfUnits",
    "VacantLot",
    "Nbrhd",
    "AsrLandUse1",
    "Zoning",
    "FirstYearBuilt",
    "LastYearBuilt",
    "SQFT",
    "LandArea",
    "NbrOfBldgsRes",
    "NbrOfBldgsCom",
    "AprResImprove",
    "AprComImprove",
    "NatHistDist",
    "LocalHistDist",
    "CertLocalHistDist",
])

PAGE_SIZE = 2000


def build_query_params(offset=0):
    """Build the ArcGIS REST query parameters."""
    geometry = json.dumps({
        "xmin": BBOX["min_lon"],
        "ymin": BBOX["min_lat"],
        "xmax": BBOX["max_lon"],
        "ymax": BBOX["max_lat"],
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


def fetch_page(endpoint, offset=0):
    """Fetch a single page of results from the ArcGIS endpoint."""
    params = build_query_params(offset)

    resp = requests.get(endpoint, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    # Check for ArcGIS-level errors
    if "error" in data:
        err = data["error"]
        raise RuntimeError(
            f"ArcGIS error {err.get('code', '?')}: {err.get('message', 'Unknown')}"
        )

    return data


def fetch_all_parcels():
    """
    Fetch all parcel features, trying each endpoint and handling pagination.

    Returns list of raw ArcGIS feature dicts, or empty list on failure.
    """
    for endpoint in PARCEL_ENDPOINTS:
        print(f"Trying endpoint: {endpoint}")
        try:
            all_features = []
            offset = 0

            while True:
                print(f"  Fetching offset {offset}...")
                data = fetch_page(endpoint, offset)

                features = data.get("features", [])
                if not features:
                    break

                all_features.extend(features)
                print(f"  Got {len(features)} features (total: {len(all_features)})")

                # Check if there are more results
                # ArcGIS signals "more pages" via exceededTransferLimit
                exceeded = data.get("exceededTransferLimit", False)
                if not exceeded and len(features) < PAGE_SIZE:
                    break

                offset += len(features)

                # Brief pause to be polite to the server
                time.sleep(0.5)

            print(f"Fetched {len(all_features)} total parcels from {endpoint}")
            return all_features

        except Exception as e:
            print(f"  Failed: {e}")
            continue

    print("All endpoints failed. No parcel data fetched.")
    return []


def polygon_centroid(rings):
    """
    Compute a simple centroid (average of all vertices) from ArcGIS rings.

    rings: list of rings, each ring is a list of [lon, lat] pairs.
    Returns (lon, lat) tuple.
    """
    total_x = 0.0
    total_y = 0.0
    count = 0

    for ring in rings:
        for pt in ring:
            total_x += pt[0]
            total_y += pt[1]
            count += 1

    if count == 0:
        return 0.0, 0.0

    return total_x / count, total_y / count


def convert_rings_to_local(rings):
    """
    Convert ArcGIS geometry rings from WGS84 to local coordinates.

    Returns list of rings, each ring a list of [x, z] pairs (rounded).
    """
    local_rings = []
    for ring in rings:
        local_ring = []
        for pt in ring:
            x, z = wgs84_to_local(pt[0], pt[1])
            local_ring.append([round(x, 2), round(z, 2)])
        local_rings.append(local_ring)
    return local_rings


def extract_parcel(feature):
    """
    Extract a clean parcel record from a raw ArcGIS feature.

    Returns a dict with normalized fields, or None if geometry is missing.
    """
    attrs = feature.get("attributes", {})
    geometry = feature.get("geometry", {})

    if not geometry or "rings" not in geometry:
        return None

    rings = geometry["rings"]

    # Centroid in WGS84
    clon, clat = polygon_centroid(rings)
    cx, cz = wgs84_to_local(clon, clat)

    # Convert polygon rings to local coords
    local_rings = convert_rings_to_local(rings)

    # Appraised improvement value: prefer residential, fall back to commercial
    res_apr = attrs.get("AprResImprove") or 0
    com_apr = attrs.get("AprComImprove") or 0
    appraised_value = res_apr if res_apr else com_apr

    # Year built: prefer first (original construction)
    first_year = attrs.get("FirstYearBuilt") or 0
    last_year = attrs.get("LastYearBuilt") or 0
    year_built = first_year if first_year else last_year

    return {
        "handle": attrs.get("Handle", ""),
        "address": attrs.get("SITEADDR", "") or "",
        "owner": attrs.get("OwnerName", "") or "",
        "year_built": year_built,
        "last_year_built": last_year,
        "building_sqft": attrs.get("SQFT") or 0,
        "land_area": attrs.get("LandArea") or 0,
        "appraised_value": appraised_value,
        "land_use_code": attrs.get("AsrLandUse1") or 0,
        "zoning": attrs.get("Zoning", "") or "",
        "neighborhood_code": attrs.get("Nbrhd") or 0,
        "units": (attrs.get("NbrOfUnits") or 0) + (attrs.get("NbrOfApts") or 0),
        "num_buildings": (attrs.get("NbrOfBldgsRes") or 0) + (attrs.get("NbrOfBldgsCom") or 0),
        "vacant": bool(attrs.get("VacantLot")),
        "historic_district": {
            "national": bool(attrs.get("NatHistDist")),
            "local": bool(attrs.get("LocalHistDist")),
            "certified_local": bool(attrs.get("CertLocalHistDist")),
        },
        "centroid": [round(cx, 2), round(cz, 2)],
        "rings": local_rings,
    }


def main():
    ensure_dirs()

    print("=" * 60)
    print("Fetching St. Louis parcel data for Lafayette Square")
    print(f"Bounding box: {BBOX}")
    print("=" * 60)

    raw_features = fetch_all_parcels()
    if not raw_features:
        print("No features fetched. Exiting.")
        sys.exit(1)

    # Process each feature
    parcels = []
    skipped = 0
    for feature in raw_features:
        parcel = extract_parcel(feature)
        if parcel:
            parcels.append(parcel)
        else:
            skipped += 1

    print(f"\nProcessed {len(parcels)} parcels ({skipped} skipped, no geometry)")

    # Summary statistics
    with_year = sum(1 for p in parcels if p["year_built"] > 0)
    with_sqft = sum(1 for p in parcels if p["building_sqft"] > 0)
    with_value = sum(1 for p in parcels if p["appraised_value"] > 0)
    with_historic = sum(1 for p in parcels if p["historic_district"]["national"] or p["historic_district"]["local"])
    vacant = sum(1 for p in parcels if p["vacant"])

    print(f"  With year built:       {with_year}")
    print(f"  With building sqft:    {with_sqft}")
    print(f"  With appraised value:  {with_value}")
    print(f"  In historic district:  {with_historic}")
    print(f"  Vacant lots:           {vacant}")

    # Year range
    years = [p["year_built"] for p in parcels if p["year_built"] > 1700]
    if years:
        print(f"  Year range:            {min(years)} - {max(years)}")

    # Zoning breakdown
    zones = {}
    for p in parcels:
        z = p["zoning"] or "unknown"
        zones[z] = zones.get(z, 0) + 1
    print("\nZoning:")
    for z, count in sorted(zones.items(), key=lambda x: -x[1]):
        print(f"  {z}: {count}")

    # Save
    import os
    output_path = os.path.join(RAW_DIR, "stl_parcels.json")
    with open(output_path, "w") as f:
        json.dump({
            "parcels": parcels,
            "count": len(parcels),
            "bbox": BBOX,
            "source": "St. Louis Open Data ArcGIS REST API",
        }, f, indent=2)

    print(f"\nSaved {len(parcels)} parcels to {output_path}")


if __name__ == "__main__":
    main()
