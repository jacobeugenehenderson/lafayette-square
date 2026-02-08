#!/usr/bin/env python3
"""Process OSM park path data for Lafayette Square.

Input:  scripts/raw/osm_park_paths.json (Overpass API export)
Output: src/data/park_paths.json

Converts GPS coordinates to local meters via wgs84_to_local.
"""

import json
from config import wgs84_to_local, DATA_DIR, RAW_DIR, ensure_dirs


def main():
    ensure_dirs()

    with open(f'{RAW_DIR}/osm_park_paths.json') as f:
        data = json.load(f)

    elements = data.get('elements', [])

    # Build node lookup: id -> (lon, lat)
    nodes = {}
    for el in elements:
        if el.get('type') == 'node':
            nodes[el['id']] = (el['lon'], el['lat'])

    # Process ways
    paths = []
    for el in elements:
        if el.get('type') != 'way':
            continue

        tags = el.get('tags', {})
        highway = tags.get('highway', 'path')
        node_ids = el.get('nodes', [])

        points = []
        for nid in node_ids:
            if nid in nodes:
                lon, lat = nodes[nid]
                x, z = wgs84_to_local(lon, lat)
                points.append([round(x, 2), round(z, 2)])

        if len(points) >= 2:
            paths.append({
                'osm_id': el['id'],
                'highway': highway,
                'points': points,
            })

    output = {
        'meta': {
            'source': 'OpenStreetMap',
            'query': 'highway=footway|path|cycleway within Lafayette Park',
            'total': len(paths),
        },
        'paths': paths,
    }

    out_path = f'{DATA_DIR}/park_paths.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f'Wrote {out_path} ({len(paths)} path segments)')
    for p in paths:
        print(f'  {p["osm_id"]}: {p["highway"]} ({len(p["points"])} points)')


if __name__ == '__main__':
    main()
