#!/usr/bin/env python3
"""Process City of St. Louis tree inventory data for Lafayette Park.

Input:  scripts/raw/lafayette_park_trees.json (ArcGIS REST API export)
Output: src/data/park_trees.json

Converts GPS coordinates to local meters (un-rotated, relative to park center).
The LafayettePark.jsx group rotation handles alignment with the scene.
"""

import json
import sys

CENTER_LON = -90.2161
CENTER_LAT = 38.6160
LON_TO_METERS = 86774
LAT_TO_METERS = 111000

# Shape archetypes for rendering
SHAPE_MAP = {
    # Broad spreading deciduous
    'Maple, Sugar': 'broad', 'Maple, Silver': 'broad', 'Maple, Red': 'broad',
    "Maple, Red 'October Glory'": 'broad', 'Maple, Norway': 'broad',
    'Maple, Hedge': 'broad', 'Maple, Amur': 'broad',
    'Oak, Pin': 'broad', 'oak, northern red': 'broad', 'oak, bur': 'broad',
    'Oak, English': 'broad', 'Oak, Swamp White': 'broad', 'Oak, White': 'broad',
    'oak, shingle': 'broad', 'Oak, Sawtooth': 'broad', 'Oak, Willow': 'broad',
    'oak, water': 'broad',
    'Ash, Green': 'broad', 'Ash, Blue': 'broad',
    'sycamore, American': 'broad', 'Sweetgum (undesirable)': 'broad',
    'Sweetgum': 'broad',
    'Tuliptree': 'broad', 'Hackberry': 'broad', 'Walnut, Black': 'broad',
    'Linden, American': 'broad', 'Linden, Littleleaf': 'broad',
    'Cottonwood, Eastern': 'broad', 'Catalpa, Southern': 'broad',
    'Elm, American': 'broad', 'Elm, American (undesirable)': 'broad',
    'Elm, Siberian': 'broad', 'Birch': 'broad',
    'Buckeye, Ohio': 'broad', 'locust, black': 'broad',
    'honeylocust, thornless': 'broad', 'Honeylocust': 'broad',
    'Blackgum': 'broad', 'mulberry, red': 'broad', 'pecan': 'broad',
    'persimmon, common': 'broad', 'Amur corktree': 'broad',
    'Zelkova, Japanese': 'broad', 'Tree of Heaven': 'broad',
    'royal paulownia': 'broad', 'Coffeetree, Kentucky': 'broad',
    'Chestnut, Chinese': 'broad',

    # Conifers
    'Pine, Austrian': 'conifer', 'Pine, White': 'conifer',
    'Pine, Scotch': 'conifer', 'pine, loblolly': 'conifer',
    'Spruce, Colorado': 'conifer', 'Spruce, Norway': 'conifer',
    'juniper, Chinese': 'conifer', 'redcedar, eastern': 'conifer',
    'Holly, American': 'conifer',

    # Small ornamental
    'Crabapple, Flowering': 'ornamental', 'Redbud': 'ornamental',
    'Dogwood, Flowering': 'ornamental', 'Dogwood, Kousa': 'ornamental',
    'Dogwood, Cornelian-cherry': 'ornamental', 'Pagoda Dogwood': 'ornamental',
    'serviceberry, downy': 'ornamental', "Serviceberry 'Autumn Brilliance'": 'ornamental',
    'downy serviceberry': 'ornamental',
    'Cherry, Japanese Flowering': 'ornamental', 'Cherry, Yoshino': 'ornamental',
    'hawthorn, Washington': 'ornamental', 'Pear, Callery': 'ornamental',
    'magnolia, saucer': 'ornamental', 'magnolia, star': 'ornamental',
    'maple, Japanese': 'ornamental', 'goldenraintree': 'ornamental',
    'plum, cherry': 'ornamental', 'possumhaw': 'ornamental',
    'smoketree, American': 'ornamental', 'lilac, Japanese tree': 'ornamental',
    'filbert, American': 'ornamental', 'Witch-hazel': 'ornamental',

    # Columnar / distinctive
    'Cypress, Bald': 'columnar', 'Ginkgo': 'columnar',

    # Weeping
    'Willow, Weeping': 'weeping', 'willow, corkscrew': 'weeping',
}


def get_shape(common_name):
    """Get rendering shape for a species, with fuzzy fallback."""
    if common_name in SHAPE_MAP:
        return SHAPE_MAP[common_name]
    # Fuzzy match
    lower = common_name.lower()
    if 'oak' in lower: return 'broad'
    if 'maple' in lower: return 'broad'
    if 'elm' in lower: return 'broad'
    if 'pine' in lower or 'spruce' in lower or 'cedar' in lower: return 'conifer'
    if 'juniper' in lower: return 'conifer'
    if any(w in lower for w in ['dogwood', 'cherry', 'crab', 'redbud',
                                 'serviceberry', 'hawthorn', 'magnolia']): return 'ornamental'
    if 'cypress' in lower: return 'columnar'
    if 'willow' in lower: return 'weeping'
    return 'broad'  # default


def main():
    with open('scripts/raw/lafayette_park_trees.json') as f:
        data = json.load(f)

    trees = []
    skipped = {'dead': 0, 'stump': 0, 'no_geom': 0}

    for feat in data['features']:
        attrs = feat['attributes']
        geom = feat.get('geometry')

        if not geom or geom.get('x') is None:
            skipped['no_geom'] += 1
            continue

        condition = (attrs.get('CONDITION') or '').strip()
        if condition in ('Dead', 'Stump'):
            skipped[condition.lower()] += 1
            continue

        lon = geom['x']
        lat = geom['y']
        x = (lon - CENTER_LON) * LON_TO_METERS
        z = (CENTER_LAT - lat) * LAT_TO_METERS

        # Skip trees outside park bounds (street trees along perimeter)
        if abs(x) > 175 or abs(z) > 175:
            skipped['outside_park'] = skipped.get('outside_park', 0) + 1
            continue

        common = (attrs.get('COMMON') or 'Unknown').strip()
        dbh = attrs.get('DBH') or 1
        shape = get_shape(common)

        trees.append({
            'x': round(x, 1),
            'z': round(z, 1),
            'species': common,
            'shape': shape,
            'dbh': dbh,
            'condition': condition,
        })

    print(f"Processed {len(trees)} trees ({skipped} skipped)")

    # Shape distribution
    from collections import Counter
    shapes = Counter(t['shape'] for t in trees)
    print(f"Shapes: {dict(shapes)}")

    output = {
        'meta': {
            'source': 'City of St. Louis Forestry Division',
            'url': 'https://maps6.stlouis-mo.gov/arcgis/rest/services/FORESTRY/FORESTRY_TREES/MapServer',
            'center': {'lat': CENTER_LAT, 'lon': CENTER_LON},
            'total': len(trees),
            'coordinate_system': 'Local meters, un-rotated. Park group rotation aligns to scene.',
        },
        'trees': trees,
    }

    with open('src/data/park_trees.json', 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    print(f"Wrote src/data/park_trees.json ({len(trees)} trees)")


if __name__ == '__main__':
    main()
