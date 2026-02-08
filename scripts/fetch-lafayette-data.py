#!/usr/bin/env python3
"""
Fetch Lafayette Square GIS data from Overture Maps / OSM.

Fetches building footprints, street network, and land use polygons.
Converts WGS84 -> local meters (origin at Lafayette Park center).

Usage: python scripts/fetch-lafayette-data.py

Outputs:
  src/data/buildings.json
  src/data/streets.json
  src/data/landuse.json
"""

import json
import os
import sys
import uuid

try:
    import duckdb
    import geopandas as gpd
    from shapely.geometry import shape, mapping
    from pyproj import Transformer
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install -r scripts/requirements.txt")
    sys.exit(1)

# Lafayette Square center point
CENTER_LAT = 38.6160
CENTER_LON = -90.2161

# Bounding box (N: Chouteau Ave, S: I-44, W: Jefferson Ave, E: Dolman St)
BBOX = {
    'min_lat': 38.6090,
    'max_lat': 38.6250,
    'min_lon': -90.2225,
    'max_lon': -90.2070,
}

# Conversion constants at this latitude
LON_TO_METERS = 86774
LAT_TO_METERS = 111000

# Victorian brick palette
BUILDING_COLORS = [
    '#8B4513', '#A0522D', '#CD853F',  # warm browns
    '#8B2500', '#A52A2A', '#B22222',  # brick reds
    '#808080', '#696969', '#778899',  # stone grays
    '#DCDCDC', '#D2B48C', '#F5DEB3',  # cream/painted
]

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'data')


def wgs84_to_local(lon, lat):
    """Convert WGS84 to local meters centered on Lafayette Park."""
    x = (lon - CENTER_LON) * LON_TO_METERS
    z = (CENTER_LAT - lat) * LAT_TO_METERS  # Z = south (+)
    return x, z


def fetch_buildings():
    """Fetch building footprints from Overture Maps via DuckDB."""
    print("Fetching building footprints...")

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("INSTALL httpfs; LOAD httpfs;")

    query = f"""
    SELECT
        id,
        names,
        height,
        num_floors,
        ST_AsGeoJSON(geometry) as geojson
    FROM read_parquet('s3://overturemaps-us-west-2/release/2026-01-21.0/theme=buildings/type=building/*')
    WHERE bbox.xmin >= {BBOX['min_lon']}
      AND bbox.xmax <= {BBOX['max_lon']}
      AND bbox.ymin >= {BBOX['min_lat']}
      AND bbox.ymax <= {BBOX['max_lat']}
    """

    try:
        results = con.execute(query).fetchall()
    except Exception as e:
        print(f"Overture query failed: {e}")
        print("Using placeholder data instead.")
        return None

    buildings = []
    for row in results:
        bid, names, height, num_floors, geojson = row
        geom = shape(json.loads(geojson))

        # Get centroid in local coords
        cx, cz = wgs84_to_local(geom.centroid.x, geom.centroid.y)

        # Convert footprint to local coords
        footprint = []
        if geom.geom_type == 'Polygon':
            for lon, lat in geom.exterior.coords[:-1]:
                x, z = wgs84_to_local(lon, lat)
                footprint.append([round(x, 1), round(z, 1)])

        # Determine height
        if height:
            h = float(height)
        elif num_floors:
            h = float(num_floors) * 3.5
        else:
            h = 10  # default

        # Bounding box for size
        minx = min(p[0] for p in footprint)
        maxx = max(p[0] for p in footprint)
        minz = min(p[1] for p in footprint)
        maxz = max(p[1] for p in footprint)

        name = ''
        if names and isinstance(names, dict):
            name = names.get('primary', '')

        color = BUILDING_COLORS[len(buildings) % len(BUILDING_COLORS)]

        buildings.append({
            'id': f'bldg-{len(buildings):04d}',
            'name': name,
            'footprint': footprint,
            'position': [round(cx, 1), 0, round(cz, 1)],
            'size': [round(maxx - minx, 1), round(h, 1), round(maxz - minz, 1)],
            'color': color,
        })

    return buildings


def fetch_streets():
    """Fetch street network from Overture Maps."""
    print("Fetching street network...")

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("INSTALL httpfs; LOAD httpfs;")

    query = f"""
    SELECT
        id,
        names,
        class,
        ST_AsGeoJSON(geometry) as geojson
    FROM read_parquet('s3://overturemaps-us-west-2/release/2026-01-21.0/theme=transportation/type=segment/*')
    WHERE bbox.xmin >= {BBOX['min_lon']}
      AND bbox.xmax <= {BBOX['max_lon']}
      AND bbox.ymin >= {BBOX['min_lat']}
      AND bbox.ymax <= {BBOX['max_lat']}
      AND subtype = 'road'
    """

    try:
        results = con.execute(query).fetchall()
    except Exception as e:
        print(f"Overture query failed: {e}")
        return None

    streets = []
    for row in results:
        sid, names, road_class, geojson = row
        geom = shape(json.loads(geojson))

        points = []
        if geom.geom_type == 'LineString':
            for lon, lat in geom.coords:
                x, z = wgs84_to_local(lon, lat)
                points.append([round(x, 1), round(z, 1)])

        # Map Overture class to our types
        type_map = {
            'motorway': 'primary',
            'trunk': 'primary',
            'primary': 'primary',
            'secondary': 'secondary',
            'tertiary': 'tertiary',
            'residential': 'residential',
            'service': 'service',
        }
        street_type = type_map.get(road_class, 'residential')

        name = ''
        if names and isinstance(names, dict):
            name = names.get('primary', '')

        streets.append({
            'id': f'st-{len(streets):04d}',
            'name': name,
            'type': street_type,
            'points': points,
        })

    return streets


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    buildings = fetch_buildings()
    if buildings:
        with open(os.path.join(DATA_DIR, 'buildings.json'), 'w') as f:
            json.dump({'buildings': buildings}, f, indent=2)
        print(f"Saved {len(buildings)} buildings")

    streets = fetch_streets()
    if streets:
        with open(os.path.join(DATA_DIR, 'streets.json'), 'w') as f:
            json.dump({'streets': streets}, f, indent=2)
        print(f"Saved {len(streets)} streets")

    print("Done! Run process-dem.py next for terrain data.")


if __name__ == '__main__':
    main()
