#!/usr/bin/env python3
"""
Fetch street-level facade imagery from Mapillary API v4 for Lafayette Square buildings.

Queries the Mapillary image search endpoint for all street-level photos within the
Lafayette Square bounding box, then matches each building to its nearest facade image.

Usage: python scripts/10-fetch-mapillary.py

Requires:
  - MAPILLARY_ACCESS_TOKEN environment variable
  - src/data/buildings.json (from earlier pipeline steps)

Outputs:
  scripts/raw/mapillary_images.json   (all images with local coords)
  scripts/raw/mapillary_matches.json  (building-to-image matches)
"""

import json
import math
import sys
import time

try:
    import requests
except ImportError:
    print("Missing 'requests' library. Install with:")
    print("  pip install requests")
    sys.exit(1)

from config import (
    CENTER_LAT,
    CENTER_LON,
    BBOX,
    LON_TO_METERS,
    LAT_TO_METERS,
    wgs84_to_local,
    ensure_dirs,
    RAW_DIR,
    DATA_DIR,
    MAPILLARY_TOKEN,
)

MAPILLARY_API_URL = "https://graph.mapillary.com/images"
IMAGE_FIELDS = "id,captured_at,compass_angle,geometry,thumb_256_url,thumb_1024_url,thumb_2048_url"
MAX_MATCH_DISTANCE = 30.0  # meters
PAGE_DELAY = 0.5  # seconds between paginated requests


def fetch_mapillary_images():
    """
    Fetch all Mapillary images within the BBOX.
    Handles pagination automatically.
    Returns a list of image dicts from the API.
    """
    bbox_str = f"{BBOX['min_lon']},{BBOX['min_lat']},{BBOX['max_lon']},{BBOX['max_lat']}"
    headers = {"Authorization": "OAuth " + MAPILLARY_TOKEN}
    params = {
        "fields": IMAGE_FIELDS,
        "bbox": bbox_str,
        "limit": 2000,
    }

    all_images = []
    page = 1
    url = MAPILLARY_API_URL

    while url:
        print(f"  Fetching page {page}...")
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=30)
            resp.raise_for_status()
        except requests.exceptions.HTTPError as e:
            if resp.status_code == 429:
                print("  Rate limited. Waiting 10s...")
                time.sleep(10)
                continue
            print(f"  HTTP error: {e}")
            break
        except requests.exceptions.RequestException as e:
            print(f"  Request error: {e}")
            break

        data = resp.json()
        images = data.get("data", [])
        all_images.extend(images)
        print(f"  Got {len(images)} images (total: {len(all_images)})")

        # Check for next page
        next_url = data.get("paging", {}).get("next")
        if next_url:
            url = next_url
            params = None  # params are encoded in the next URL
            page += 1
            time.sleep(PAGE_DELAY)
        else:
            url = None

    return all_images


def enrich_images_with_local_coords(images):
    """
    Convert each image's WGS84 geometry to local coordinates and add to dict.
    Returns a list of enriched image dicts.
    """
    enriched = []
    for img in images:
        geom = img.get("geometry", {})
        coords = geom.get("coordinates", [])
        if len(coords) < 2:
            continue

        lon, lat = coords[0], coords[1]
        x, z = wgs84_to_local(lon, lat)

        enriched.append({
            "image_id": str(img["id"]),
            "captured_at": img.get("captured_at"),
            "compass_angle": img.get("compass_angle"),
            "lon": lon,
            "lat": lat,
            "local_x": round(x, 1),
            "local_z": round(z, 1),
            "thumb_256_url": img.get("thumb_256_url", ""),
            "thumb_1024_url": img.get("thumb_1024_url", ""),
            "thumb_2048_url": img.get("thumb_2048_url", ""),
        })

    return enriched


def angle_between(x1, z1, x2, z2):
    """
    Compute the bearing angle (in degrees, 0=N, 90=E, 180=S, 270=W)
    from point (x1,z1) to point (x2,z2) in local coordinates.
    Note: local coords have X=east, Z=south.
    """
    dx = x2 - x1
    dz = z2 - z1
    # Convert to compass bearing: atan2 gives angle from east, we want from north
    # North in local coords is -Z direction
    angle_rad = math.atan2(dx, -dz)
    angle_deg = math.degrees(angle_rad) % 360
    return angle_deg


def angle_diff(a, b):
    """Return the smallest angular difference between two angles in degrees."""
    diff = abs(a - b) % 360
    if diff > 180:
        diff = 360 - diff
    return diff


def match_buildings_to_images(buildings, images):
    """
    For each building, find the closest Mapillary image within MAX_MATCH_DISTANCE.
    Prefer images whose compass_angle points roughly toward the building.

    Returns a list of match dicts.
    """
    matches = []

    for bldg in buildings:
        bldg_id = bldg["id"]
        # Building centroid in local coords: position is [x, y, z]
        bx = bldg["position"][0]
        bz = bldg["position"][2]

        best_match = None
        best_score = float("inf")

        for img in images:
            ix = img["local_x"]
            iz = img["local_z"]

            dist = math.sqrt((bx - ix) ** 2 + (bz - iz) ** 2)
            if dist > MAX_MATCH_DISTANCE:
                continue

            # Compute bearing from image to building
            bearing_to_bldg = angle_between(ix, iz, bx, bz)

            # Compare with image compass_angle (direction camera is facing)
            compass = img.get("compass_angle")
            if compass is not None:
                facing_diff = angle_diff(compass, bearing_to_bldg)
            else:
                # No compass data; treat as neutral (90 degrees off)
                facing_diff = 90.0

            # Score: weighted combination of distance and facing angle.
            # Lower is better. Distance matters most, facing is a tiebreaker.
            # facing_diff ranges 0..180; normalize to 0..1 and weight at 0.3x distance
            score = dist + (facing_diff / 180.0) * 10.0

            if score < best_score:
                best_score = score
                best_match = {
                    "building_id": bldg_id,
                    "image_id": img["image_id"],
                    "thumb_256_url": img["thumb_256_url"],
                    "thumb_1024_url": img["thumb_1024_url"],
                    "thumb_2048_url": img["thumb_2048_url"],
                    "captured_at": img["captured_at"],
                    "compass_angle": img.get("compass_angle"),
                    "distance": round(dist, 1),
                }

        if best_match:
            matches.append(best_match)

    return matches


def main():
    # 1. Check for Mapillary token
    if not MAPILLARY_TOKEN:
        print("Error: MAPILLARY_ACCESS_TOKEN environment variable is not set.")
        print()
        print("To get a token:")
        print("  1. Go to https://www.mapillary.com/developer/api-documentation")
        print("  2. Create an application or use your client token")
        print("  3. Export it:  export MAPILLARY_ACCESS_TOKEN='MLY|...'")
        sys.exit(1)

    ensure_dirs()

    # 2. Load existing buildings
    buildings_path = f"{DATA_DIR}/buildings.json"
    print(f"Loading buildings from {buildings_path}...")
    try:
        with open(buildings_path, "r") as f:
            buildings_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: {buildings_path} not found.")
        print("Run the building fetch pipeline first.")
        sys.exit(1)

    buildings = buildings_data.get("buildings", [])
    print(f"  Loaded {len(buildings)} buildings.")

    # 3. Fetch Mapillary images
    print(f"\nFetching Mapillary images for BBOX "
          f"[{BBOX['min_lon']}, {BBOX['min_lat']}, {BBOX['max_lon']}, {BBOX['max_lat']}]...")
    raw_images = fetch_mapillary_images()
    print(f"\nTotal images fetched: {len(raw_images)}")

    if not raw_images:
        print("No images found in the area. Check your BBOX or token.")
        sys.exit(0)

    # 4. Enrich with local coordinates
    print("\nConverting image coordinates to local space...")
    enriched_images = enrich_images_with_local_coords(raw_images)
    print(f"  {len(enriched_images)} images with valid coordinates.")

    # 5. Save raw images
    raw_images_path = f"{RAW_DIR}/mapillary_images.json"
    print(f"\nSaving all images to {raw_images_path}...")
    with open(raw_images_path, "w") as f:
        json.dump({"images": enriched_images, "count": len(enriched_images)}, f, indent=2)
    print(f"  Saved {len(enriched_images)} images.")

    # 6. Match buildings to images
    print("\nMatching buildings to nearest facade images...")
    matches = match_buildings_to_images(buildings, enriched_images)

    matches_path = f"{RAW_DIR}/mapillary_matches.json"
    print(f"Saving matches to {matches_path}...")
    with open(matches_path, "w") as f:
        json.dump({"matches": matches}, f, indent=2)

    # 7. Summary
    total_buildings = len(buildings)
    matched_buildings = len(matches)
    coverage = (matched_buildings / total_buildings * 100) if total_buildings > 0 else 0

    print("\n" + "=" * 50)
    print("Mapillary Fetch Summary")
    print("=" * 50)
    print(f"  Total images found:     {len(enriched_images)}")
    print(f"  Buildings in dataset:    {total_buildings}")
    print(f"  Buildings matched:       {matched_buildings}")
    print(f"  Coverage:                {coverage:.1f}%")
    print(f"  Max match distance:      {MAX_MATCH_DISTANCE}m")
    print("=" * 50)


if __name__ == "__main__":
    main()
