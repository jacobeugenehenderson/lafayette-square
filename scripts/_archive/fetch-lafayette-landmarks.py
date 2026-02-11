#!/usr/bin/env python3
"""
Fetch Lafayette Square landmarks/POIs from OSM Overpass API.

Queries for restaurants, shops, historic sites, churches, etc.
Maps POIs to nearest building IDs.

Usage: python scripts/fetch-lafayette-landmarks.py

Output: src/data/landmarks.json
"""

import json
import math
import os
import sys

try:
    import requests
except ImportError:
    print("Missing requests. Install with: pip install requests")
    sys.exit(1)

CENTER_LAT = 38.6160
CENTER_LON = -90.2161
LON_TO_METERS = 86774
LAT_TO_METERS = 111000

BBOX = {
    'min_lat': 38.6090,
    'max_lat': 38.6250,
    'min_lon': -90.2225,
    'max_lon': -90.2070,
}

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'data')

# OSM tag -> our category/subcategory mapping
TAG_MAP = {
    'restaurant': ('dining', 'restaurants'),
    'cafe': ('dining', 'cafes'),
    'bar': ('dining', 'bars'),
    'pub': ('dining', 'bars'),
    'fast_food': ('dining', 'restaurants'),
    'place_of_worship': ('community', 'churches'),
    'school': ('community', 'schools'),
    'community_centre': ('community', 'organizations'),
    'gallery': ('arts', 'galleries'),
    'museum': ('arts', 'galleries'),
    'theatre': ('arts', 'venues'),
    'arts_centre': ('arts', 'studios'),
    'park': ('parks', 'parks'),
    'garden': ('parks', 'gardens'),
    'playground': ('parks', 'playgrounds'),
    'shop': ('shopping', 'boutiques'),
    'clothes': ('shopping', 'boutiques'),
    'antiques': ('shopping', 'antiques'),
    'doctor': ('services', 'medical'),
    'dentist': ('services', 'medical'),
    'pharmacy': ('services', 'medical'),
    'lawyer': ('services', 'legal'),
    'bank': ('services', 'financial'),
    'hairdresser': ('services', 'beauty'),
    'beauty': ('services', 'beauty'),
    'historic': ('historic', 'landmarks'),
    'memorial': ('historic', 'markers'),
    'monument': ('historic', 'markers'),
}


def wgs84_to_local(lon, lat):
    x = (lon - CENTER_LON) * LON_TO_METERS
    z = (CENTER_LAT - lat) * LAT_TO_METERS
    return x, z


def fetch_osm_pois():
    """Fetch POIs from OSM Overpass API."""
    print("Fetching POIs from OpenStreetMap...")

    bbox_str = f"{BBOX['min_lat']},{BBOX['min_lon']},{BBOX['max_lat']},{BBOX['max_lon']}"

    query = f"""
    [out:json][timeout:30];
    (
      node["amenity"~"restaurant|cafe|bar|pub|fast_food|place_of_worship|school|community_centre|theatre|arts_centre"]({bbox_str});
      node["tourism"~"museum|gallery"]({bbox_str});
      node["shop"]({bbox_str});
      node["leisure"~"park|garden|playground"]({bbox_str});
      node["healthcare"]({bbox_str});
      node["historic"]({bbox_str});
      way["amenity"~"restaurant|cafe|bar|pub|place_of_worship|school"]({bbox_str});
      way["historic"]({bbox_str});
    );
    out center;
    """

    try:
        resp = requests.post(
            'https://overpass-api.de/api/interpreter',
            data={'data': query},
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get('elements', [])
    except Exception as e:
        print(f"Overpass query failed: {e}")
        return []


def find_nearest_building(x, z, buildings):
    """Find the nearest building to the given local coordinates."""
    best_id = None
    best_dist = float('inf')

    for b in buildings:
        dx = b['position'][0] - x
        dz = b['position'][2] - z
        dist = math.sqrt(dx * dx + dz * dz)
        if dist < best_dist:
            best_dist = dist
            best_id = b['id']

    return best_id if best_dist < 30 else None


def classify_poi(element):
    """Classify an OSM element into our category system."""
    tags = element.get('tags', {})

    # Check amenity first
    amenity = tags.get('amenity', '')
    if amenity in TAG_MAP:
        return TAG_MAP[amenity]

    # Check tourism
    tourism = tags.get('tourism', '')
    if tourism in TAG_MAP:
        return TAG_MAP[tourism]

    # Check shop
    shop = tags.get('shop', '')
    if shop in TAG_MAP:
        return TAG_MAP[shop]
    if shop:
        return ('shopping', 'boutiques')

    # Check leisure
    leisure = tags.get('leisure', '')
    if leisure in TAG_MAP:
        return TAG_MAP[leisure]

    # Check healthcare
    if tags.get('healthcare'):
        return ('services', 'medical')

    # Check historic
    historic = tags.get('historic', '')
    if historic in TAG_MAP:
        return TAG_MAP[historic]
    if historic:
        return ('historic', 'landmarks')

    return ('community', 'organizations')


def main():
    # Load buildings for matching
    buildings_path = os.path.join(DATA_DIR, 'buildings.json')
    with open(buildings_path) as f:
        buildings = json.load(f)['buildings']

    # Fetch POIs
    elements = fetch_osm_pois()
    print(f"Found {len(elements)} POIs from OSM")

    landmarks = []
    for element in elements:
        tags = element.get('tags', {})
        name = tags.get('name', '')
        if not name:
            continue

        # Get coordinates
        if element['type'] == 'node':
            lon = element['lon']
            lat = element['lat']
        elif 'center' in element:
            lon = element['center']['lon']
            lat = element['center']['lat']
        else:
            continue

        x, z = wgs84_to_local(lon, lat)
        building_id = find_nearest_building(x, z, buildings)

        if not building_id:
            continue

        category, subcategory = classify_poi(element)

        landmark = {
            'id': building_id,
            'name': name,
            'address': tags.get('addr:street', ''),
            'phone': tags.get('phone', ''),
            'website': tags.get('website', ''),
            'category': category,
            'subcategory': subcategory,
        }

        # Add opening hours if available
        if 'opening_hours' in tags:
            landmark['opening_hours_raw'] = tags['opening_hours']

        landmarks.append(landmark)

    # Save
    output_path = os.path.join(DATA_DIR, 'landmarks.json')
    with open(output_path, 'w') as f:
        json.dump({'landmarks': landmarks}, f, indent=2)

    print(f"Saved {len(landmarks)} landmarks to {output_path}")

    # Category summary
    categories = {}
    for l in landmarks:
        cat = l['category']
        categories[cat] = categories.get(cat, 0) + 1
    for cat, count in sorted(categories.items()):
        print(f"  {cat}: {count}")


if __name__ == '__main__':
    main()
