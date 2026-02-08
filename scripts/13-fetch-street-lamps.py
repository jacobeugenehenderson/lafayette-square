#!/usr/bin/env python3
"""Process OSM street lamp data for Lafayette Square.

Input:  scripts/raw/osm_street_lamps.json (Overpass API export)
Output: src/data/street_lamps.json

Converts GPS coordinates to local meters.
"""

import json
from config import wgs84_to_local, DATA_DIR, RAW_DIR, ensure_dirs


def main():
    ensure_dirs()

    with open(f'{RAW_DIR}/osm_street_lamps.json') as f:
        data = json.load(f)

    elements = data.get('elements', [])
    print(f'Got {len(elements)} raw street lamp nodes')

    lamps = []
    for el in elements:
        if el.get('type') != 'node':
            continue
        lon = el['lon']
        lat = el['lat']
        x, z = wgs84_to_local(lon, lat)
        lamps.append({
            'x': round(x, 1),
            'z': round(z, 1),
        })

    output = {
        'meta': {
            'source': 'OpenStreetMap',
            'query': 'highway=street_lamp',
            'total': len(lamps),
        },
        'lamps': lamps,
    }

    out_path = f'{DATA_DIR}/street_lamps.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    print(f'Wrote {out_path} ({len(lamps)} lamps)')


if __name__ == '__main__':
    main()
