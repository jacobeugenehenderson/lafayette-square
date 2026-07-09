#!/usr/bin/env python3
"""
Fetch parcel data from the St. Louis COUNTY assessor (ArcGIS REST) for the
active scene's extent.

St. Louis City is an independent city; its assessor (03-fetch-stl-parcels.py)
holds ONLY City parcels. A neighborhood that straddles the City limit — like
HiPointe-DeMun, where DeMun is in St. Louis County / City of Clayton — needs
this SECOND well for the County side. Output is normalized to the SAME schema
as the City parcels so downstream consumes both uniformly, tagged
`jurisdiction: "county"`.

Scene-aware: set CARTOGRAPH_SCENE so config.py resolves the extent + RAW_DIR
(e.g. CARTOGRAPH_SCENE=hipointe-demun python scripts/03b-fetch-stlco-parcels.py).

Output: <scene>/raw/stlco_parcels.json
Source: maps.stlouisco.com OpenData FeatureServer/7 (Tax Parcels)
"""

import json
import os
import sys
import time

try:
    import requests
except ImportError:
    print("Missing requests. Install with: pip install requests")
    sys.exit(1)

from config import BBOX, wgs84_to_local, ensure_dirs, RAW_DIR, SCENE

ENDPOINT = "https://maps.stlouisco.com/hosting/rest/services/OpenData/OpenData/FeatureServer/7/query"

OUT_FIELDS = ",".join([
    "LOCATOR", "OWNER_NAME", "PROP_ADRNUM", "PROP_ADD", "MUNICIPALITY",
    "YEARBLT", "RESQFT", "ACRES", "APPIMPVAL", "APPLANDVAL", "TOTAPVAL",
    "LUC", "LUCODE", "LANDUSE2", "ZONING", "MUNI_ZONING", "NBHD", "LIVUNIT",
    "PROPCLASS",
])

PAGE_SIZE = 2000


def build_params(offset=0):
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
    all_features = []
    offset = 0
    while True:
        print(f"  Fetching offset {offset}...")
        resp = requests.get(ENDPOINT, params=build_params(offset), timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            err = data["error"]
            raise RuntimeError(f"ArcGIS error {err.get('code')}: {err.get('message')}")
        feats = data.get("features", [])
        if not feats:
            break
        all_features.extend(feats)
        print(f"  Got {len(feats)} (total: {len(all_features)})")
        exceeded = data.get("exceededTransferLimit", False)
        if not exceeded and len(feats) < PAGE_SIZE:
            break
        offset += len(feats)
        time.sleep(0.5)
    return all_features


def polygon_centroid(rings):
    tx = ty = 0.0
    n = 0
    for ring in rings:
        for pt in ring:
            tx += pt[0]; ty += pt[1]; n += 1
    return (tx / n, ty / n) if n else (0.0, 0.0)


def rings_to_local(rings):
    out = []
    for ring in rings:
        out.append([[round(x, 2), round(z, 2)]
                    for x, z in (wgs84_to_local(pt[0], pt[1]) for pt in ring)])
    return out


def extract(feature):
    a = feature.get("attributes", {})
    geom = feature.get("geometry", {})
    if not geom or "rings" not in geom:
        return None
    rings = geom["rings"]
    clon, clat = polygon_centroid(rings)
    cx, cz = wgs84_to_local(clon, clat)

    # Address: number + street (County splits them).
    num = str(a.get("PROP_ADRNUM") or "").strip()
    street = (a.get("PROP_ADD") or "").strip()
    address = f"{num} {street}".strip()

    # Appraised value: prefer improvement (matches City AprResImprove semantics),
    # fall back to total appraised.
    appraised = a.get("APPIMPVAL") or a.get("TOTAPVAL") or 0

    acres = a.get("ACRES") or 0

    return {
        "handle": a.get("LOCATOR", "") or "",
        "address": address,
        "owner": a.get("OWNER_NAME", "") or "",
        "year_built": a.get("YEARBLT") or 0,
        "last_year_built": a.get("YEARBLT") or 0,
        "building_sqft": a.get("RESQFT") or 0,
        "land_area": round(acres * 43560.0, 1),  # acres -> sqft (City uses sqft)
        "appraised_value": appraised,
        "land_use_code": a.get("LUC") or a.get("LUCODE") or 0,
        "zoning": a.get("ZONING") or a.get("MUNI_ZONING") or "",
        "neighborhood_code": a.get("NBHD") or 0,
        "units": a.get("LIVUNIT") or 0,
        "num_buildings": 0,  # not published by the County layer
        "vacant": False,     # County layer has no clean vacant flag
        "historic_district": {"national": False, "local": False, "certified_local": False},
        "municipality": a.get("MUNICIPALITY", "") or "",
        "jurisdiction": "county",
        "centroid": [round(cx, 2), round(cz, 2)],
        # WGS84 ground truth (frame-independent) so reproject-raw.js can
        # re-derive centroid/rings on any re-center (see 03-fetch note).
        "centroid_ll": [round(clon, 7), round(clat, 7)],
        "rings": rings_to_local(rings),
        "rings_ll": [[[round(pt[0], 7), round(pt[1], 7)] for pt in ring] for ring in rings],
    }


def main():
    ensure_dirs()
    print("=" * 60)
    print(f"Fetching St. Louis COUNTY parcels for scene: {SCENE}")
    print(f"Bounding box: {BBOX}")
    print("=" * 60)

    raw = fetch_all()
    if not raw:
        print("No features fetched. Exiting.")
        sys.exit(1)

    parcels, skipped = [], 0
    for f in raw:
        p = extract(f)
        if p:
            parcels.append(p)
        else:
            skipped += 1

    print(f"\nProcessed {len(parcels)} parcels ({skipped} skipped, no geometry)")
    with_year = sum(1 for p in parcels if p["year_built"] and p["year_built"] > 0)
    with_val = sum(1 for p in parcels if p["appraised_value"])
    munis = {}
    for p in parcels:
        m = p["municipality"] or "unincorporated"
        munis[m] = munis.get(m, 0) + 1
    print(f"  With year built:      {with_year}")
    print(f"  With appraised value: {with_val}")
    years = [p["year_built"] for p in parcels if p["year_built"] and p["year_built"] > 1700]
    if years:
        print(f"  Year range:           {min(years)} - {max(years)}")
    print("  By municipality:")
    for m, c in sorted(munis.items(), key=lambda x: -x[1]):
        print(f"    {m}: {c}")

    out_path = os.path.join(RAW_DIR, "stlco_parcels.json")
    with open(out_path, "w") as f:
        json.dump({
            "parcels": parcels,
            "count": len(parcels),
            "bbox": BBOX,
            "jurisdiction": "county",
            "source": "St. Louis County OpenData FeatureServer/7 (Tax Parcels)",
        }, f, indent=2)
    print(f"\nSaved {len(parcels)} county parcels to {out_path}")


if __name__ == "__main__":
    main()
