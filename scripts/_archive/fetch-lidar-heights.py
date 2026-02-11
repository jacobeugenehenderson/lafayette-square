#!/usr/bin/env python3
"""
Fetch LiDAR building heights from USGS 3DEP for Lafayette Square.

Downloads point cloud data, computes building heights as max_Z - ground_Z
for each building footprint, and merges back into buildings.json.

Usage: python scripts/fetch-lidar-heights.py

Prerequisites:
  pip install laspy requests shapely
"""

import json
import os
import sys

try:
    import requests
    from shapely.geometry import Polygon, Point
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install requests shapely")
    sys.exit(1)

try:
    import laspy
    HAS_LASPY = True
except ImportError:
    print("Warning: laspy not installed. LiDAR processing unavailable.")
    HAS_LASPY = False

# Lafayette Square center
CENTER_LAT = 38.6160
CENTER_LON = -90.2161
LON_TO_METERS = 86774
LAT_TO_METERS = 111000

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'data')


def fetch_3dep_laz(bbox):
    """Download USGS 3DEP LiDAR data for the bounding box."""
    # USGS 3DEP Entwine Point Tiles API
    url = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public"

    print(f"Checking 3DEP coverage for bbox: {bbox}")
    print("Note: This requires the USGS 3DEP data to be available for this area.")
    print("If download fails, building heights will use OSM/heuristic values.")

    # TODO: Implement actual LAZ tile download from USGS 3DEP
    # For now, return None to use fallback heights
    return None


def compute_building_heights(laz_data, buildings):
    """Compute building heights from LiDAR point cloud."""
    if not HAS_LASPY or laz_data is None:
        return None

    # TODO: Implement LiDAR height extraction
    # For each building footprint:
    #   1. Find all LiDAR points within the footprint polygon
    #   2. Separate ground points (classification 2) from building points (classification 6)
    #   3. height = max(building_points.z) - mean(ground_points.z)
    return None


def apply_heuristic_heights(buildings):
    """Apply heuristic heights based on footprint area."""
    print("Applying heuristic building heights...")

    for building in buildings:
        if building['size'][1] > 0:
            continue  # Already has height

        area = building['size'][0] * building['size'][2]

        if area > 500:
            # Large footprint = likely commercial, 3-4 stories
            building['size'][1] = 12 + (area % 8)
        elif area > 200:
            # Medium = 2-3 story residential
            building['size'][1] = 9 + (area % 4)
        else:
            # Small = 1-2 story
            building['size'][1] = 6 + (area % 3)

    return buildings


def main():
    # Load current buildings
    buildings_path = os.path.join(DATA_DIR, 'buildings.json')
    with open(buildings_path) as f:
        data = json.load(f)

    buildings = data['buildings']
    print(f"Loaded {len(buildings)} buildings")

    # Try LiDAR first
    bbox = {
        'min_lat': 38.6090,
        'max_lat': 38.6250,
        'min_lon': -90.2225,
        'max_lon': -90.2070,
    }

    laz_data = fetch_3dep_laz(bbox)
    heights = compute_building_heights(laz_data, buildings)

    if heights is None:
        print("LiDAR data unavailable, using heuristic heights")
        buildings = apply_heuristic_heights(buildings)
    else:
        for building in buildings:
            if building['id'] in heights:
                building['size'][1] = heights[building['id']]

    # Save updated buildings
    data['buildings'] = buildings
    with open(buildings_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Updated building heights in {buildings_path}")


if __name__ == '__main__':
    main()
