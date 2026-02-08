#!/usr/bin/env python3
"""
Merge all pipeline enrichment sources into final frontend data files.

Combines Overture building footprints (primary geometry) with enrichment data
from OSM buildings, OSM POIs, STL Assessor parcels, and Mapillary street-view
imagery. Also enriches landmarks with POI metadata and building associations.

Usage: python scripts/11-merge-all.py

Inputs (base):
  src/data/buildings.json   — Overture building footprints (primary)
  src/data/landmarks.json   — POI landmarks

Inputs (enrichment, from scripts/raw/):
  osm_buildings.json        — OSM building tags
  osm_pois.json             — OSM POI metadata
  stl_parcels.json          — STL City Assessor parcel data
  mapillary_matches.json    — Mapillary street-view image matches

Outputs:
  src/data/buildings.json   — enriched building data
  src/data/landmarks.json   — enriched landmarks with building refs
"""

import json
import math
import os
import sys

from config import CENTER_LAT, CENTER_LON, BBOX, wgs84_to_local, ensure_dirs, RAW_DIR, DATA_DIR, BUILDING_COLORS


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def centroid_of_footprint(footprint):
    """Compute the centroid of a 2D polygon given as [[x,z], ...]."""
    if not footprint:
        return None, None
    xs = [p[0] for p in footprint]
    zs = [p[1] for p in footprint]
    return sum(xs) / len(xs), sum(zs) / len(zs)


def distance_2d(x1, z1, x2, z2):
    """Euclidean distance in the XZ plane (meters)."""
    return math.sqrt((x1 - x2) ** 2 + (z1 - z2) ** 2)


# ---------------------------------------------------------------------------
# File I/O helpers
# ---------------------------------------------------------------------------

def load_json(path, label):
    """Load a JSON file, returning None if it doesn't exist."""
    if not os.path.isfile(path):
        print(f"  [{label}] not found — skipping: {os.path.basename(path)}")
        return None
    with open(path, 'r') as f:
        data = json.load(f)
    count = len(data) if isinstance(data, list) else len(data.get(next(iter(data)), [])) if isinstance(data, dict) and data else 0
    print(f"  [{label}] loaded {count} records from {os.path.basename(path)}")
    return data


def write_json(path, data, label):
    """Write data to a JSON file with 2-space indent."""
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"  [{label}] written to {os.path.basename(path)}")


# ---------------------------------------------------------------------------
# Spatial index: build centroid lookup for enrichment sources
# ---------------------------------------------------------------------------

def build_centroid_index(records, coord_key='centroid'):
    """
    Build a list of (x, z, record) from enrichment records.

    Supports several centroid formats:
      - {"centroid": [x, z]}         — already in local coords
      - {"centroid": {"x": ..., "z": ...}}
      - {"lon": ..., "lat": ...}     — WGS84, will be converted
      - {"geometry": {"coordinates": [lon, lat]}} — GeoJSON point
    """
    indexed = []
    for rec in records:
        x, z = None, None

        # Already-converted local centroid
        if coord_key in rec:
            c = rec[coord_key]
            if isinstance(c, list) and len(c) >= 2:
                x, z = c[0], c[1]
            elif isinstance(c, dict):
                x, z = c.get('x'), c.get('z')

        # centroid_x / centroid_z (OSM buildings format)
        if x is None and 'centroid_x' in rec and 'centroid_z' in rec:
            try:
                x, z = float(rec['centroid_x']), float(rec['centroid_z'])
            except (TypeError, ValueError):
                pass

        # centroid_lon / centroid_lat
        if x is None and 'centroid_lon' in rec and 'centroid_lat' in rec:
            try:
                x, z = wgs84_to_local(float(rec['centroid_lon']), float(rec['centroid_lat']))
            except (TypeError, ValueError):
                pass

        # WGS84 lon/lat
        if x is None and 'lon' in rec and 'lat' in rec:
            try:
                x, z = wgs84_to_local(float(rec['lon']), float(rec['lat']))
            except (TypeError, ValueError):
                pass

        # GeoJSON point geometry
        if x is None and 'geometry' in rec:
            geom = rec['geometry']
            if isinstance(geom, dict) and 'coordinates' in geom:
                coords = geom['coordinates']
                if isinstance(coords, list) and len(coords) >= 2:
                    try:
                        x, z = wgs84_to_local(float(coords[0]), float(coords[1]))
                    except (TypeError, ValueError):
                        pass

        if x is not None and z is not None:
            indexed.append((x, z, rec))

    return indexed


def find_nearest(bx, bz, index, threshold):
    """Find the nearest record in index within threshold meters. Returns record or None."""
    best_dist = threshold
    best_rec = None
    for x, z, rec in index:
        d = distance_2d(bx, bz, x, z)
        if d < best_dist:
            best_dist = d
            best_rec = rec
    return best_rec


# ---------------------------------------------------------------------------
# Material normalization
# ---------------------------------------------------------------------------

MATERIAL_MAP = {
    'brick': 'brick',
    'bricks': 'brick',
    'clay_brick': 'brick',
    'stone': 'stone',
    'limestone': 'stone',
    'sandstone': 'stone',
    'granite': 'stone',
    'marble': 'stone',
    'wood': 'wood',
    'timber': 'wood',
    'timber_framing': 'wood',
    'wood_frame': 'wood',
    'concrete': 'concrete',
    'concrete_block': 'concrete',
    'cement_block': 'concrete',
    'reinforced_concrete': 'concrete',
    'metal': 'metal',
    'steel': 'metal',
    'aluminium': 'metal',
    'aluminum': 'metal',
    'glass': 'glass',
    'stucco': 'stucco',
    'plaster': 'stucco',
    'render': 'stucco',
    'vinyl': 'vinyl',
    'vinyl_siding': 'vinyl',
}


def normalize_material(raw):
    """Normalize a building:material tag to a canonical value."""
    if not raw:
        return None
    key = raw.strip().lower().replace(' ', '_').replace('-', '_')
    return MATERIAL_MAP.get(key, key)


# ---------------------------------------------------------------------------
# Enrichment logic
# ---------------------------------------------------------------------------

def enrich_buildings(buildings, osm_bldgs, osm_pois, parcels, mapillary):
    """Apply enrichment data to base building list. Returns enriched list."""

    # Build spatial indices for each enrichment source
    osm_bldg_idx = build_centroid_index(osm_bldgs) if osm_bldgs else []
    osm_poi_idx = build_centroid_index(osm_pois) if osm_pois else []
    parcel_idx = build_centroid_index(parcels) if parcels else []

    # Mapillary matches are keyed by building_id, not spatial
    mapillary_by_id = {}
    if mapillary:
        for m in mapillary:
            bid = m.get('building_id')
            if bid:
                mapillary_by_id[bid] = m

    print(f"\n  Spatial indices: osm_bldg={len(osm_bldg_idx)}, "
          f"osm_poi={len(osm_poi_idx)}, parcel={len(parcel_idx)}, "
          f"mapillary_by_id={len(mapillary_by_id)}")

    stats = {
        'year_built': 0,
        'address': 0,
        'facade_image': 0,
        'material': 0,
        'stories_enriched': 0,
        'architect': 0,
        'historic': 0,
        'assessed': 0,
    }

    for i, bldg in enumerate(buildings):
        if i % 200 == 0:
            print(f"  Enriching building {i}/{len(buildings)}...")

        # Building centroid from footprint or position
        bx, bz = centroid_of_footprint(bldg.get('footprint', []))
        if bx is None:
            pos = bldg.get('position', [0, 0, 0])
            bx, bz = pos[0], pos[2]

        # --- Find nearest matches ---
        osm_match = find_nearest(bx, bz, osm_bldg_idx, 25) if osm_bldg_idx else None
        poi_match = find_nearest(bx, bz, osm_poi_idx, 25) if osm_poi_idx else None
        parcel_match = find_nearest(bx, bz, parcel_idx, 30) if parcel_idx else None
        mapillary_match = mapillary_by_id.get(bldg.get('id')) if mapillary_by_id else None

        # --- year_built: STL parcel > OSM start_date > None ---
        year_built = None
        if parcel_match:
            raw = parcel_match.get('RESYRBLT') or parcel_match.get('year_built')
            if raw:
                try:
                    yr = int(raw)
                    if 1700 <= yr <= 2030:
                        year_built = yr
                except (ValueError, TypeError):
                    pass
        if year_built is None and osm_match:
            raw = osm_match.get('start_date') or osm_match.get('tags', {}).get('start_date')
            if raw:
                try:
                    yr = int(str(raw)[:4])
                    if 1700 <= yr <= 2030:
                        year_built = yr
                except (ValueError, TypeError):
                    pass
        if year_built is not None:
            bldg['year_built'] = year_built
            stats['year_built'] += 1

        # --- stories: STL parcel > OSM building:levels > height / 3.5 ---
        stories = None
        if parcel_match:
            raw = parcel_match.get('stories') or parcel_match.get('STORIES')
            if raw:
                try:
                    stories = int(float(raw))
                except (ValueError, TypeError):
                    pass
        if stories is None and osm_match:
            raw = (osm_match.get('building:levels')
                   or osm_match.get('levels')
                   or (osm_match.get('tags', {}).get('building:levels')))
            if raw:
                try:
                    stories = int(float(raw))
                except (ValueError, TypeError):
                    pass
        if stories is None:
            height = bldg.get('size', [0, 0, 0])[1] if len(bldg.get('size', [])) > 1 else 0
            if height > 0:
                stories = max(1, round(height / 3.5))
        if stories is not None:
            bldg['stories'] = stories
            stats['stories_enriched'] += 1

        # --- address: STL parcel SITEADDR > OSM addr > "" ---
        address = None
        if parcel_match:
            raw = parcel_match.get('SITEADDR') or parcel_match.get('address')
            if raw and str(raw).strip():
                address = str(raw).strip()
        if not address and osm_match:
            tags = osm_match.get('tags', {}) if isinstance(osm_match.get('tags'), dict) else {}
            street = (osm_match.get('addr:street') or tags.get('addr:street') or '').strip()
            number = (osm_match.get('addr:housenumber') or tags.get('addr:housenumber') or '').strip()
            if street:
                address = f"{number} {street}".strip() if number else street
        if not address and poi_match:
            raw = poi_match.get('address')
            if raw and str(raw).strip():
                address = str(raw).strip()
        if address:
            bldg['address'] = address
            stats['address'] += 1

        # --- construction_material: from OSM building:material ---
        if osm_match:
            raw = (osm_match.get('building:material')
                   or osm_match.get('material')
                   or osm_match.get('tags', {}).get('building:material'))
            mat = normalize_material(raw)
            if mat:
                bldg['construction_material'] = mat
                stats['material'] += 1

        # --- roof_shape: from OSM roof:shape ---
        if osm_match:
            raw = (osm_match.get('roof:shape')
                   or osm_match.get('roof_shape')
                   or osm_match.get('tags', {}).get('roof:shape'))
            if raw and str(raw).strip():
                bldg['roof_shape'] = str(raw).strip().lower()

        # --- color: OSM building:colour overrides existing ---
        if osm_match:
            raw = (osm_match.get('building:colour')
                   or osm_match.get('colour')
                   or osm_match.get('tags', {}).get('building:colour'))
            if raw and str(raw).strip():
                color = str(raw).strip()
                # Normalize common color names to hex
                if not color.startswith('#'):
                    color = color.lower()
                bldg['color'] = color

        # --- architect: from OSM ---
        if osm_match:
            raw = (osm_match.get('architect')
                   or osm_match.get('tags', {}).get('architect'))
            if raw and str(raw).strip():
                bldg['architect'] = str(raw).strip()
                stats['architect'] += 1

        # --- historic_status: STL parcel historic district > OSM heritage tag ---
        if parcel_match:
            hd = parcel_match.get('historic_district', {})
            if isinstance(hd, dict) and (hd.get('national') or hd.get('local') or hd.get('certified_local')):
                bldg['historic_status'] = 'contributing'
                stats['historic'] += 1
        if not bldg.get('historic_status') and osm_match:
            raw = (osm_match.get('heritage')
                   or osm_match.get('tags', {}).get('heritage'))
            if raw:
                raw_str = str(raw).strip().lower()
                if raw_str in ('yes', '1', '2', 'contributing'):
                    bldg['historic_status'] = 'contributing'
                elif raw_str in ('no', 'non-contributing', 'noncontributing'):
                    bldg['historic_status'] = 'non-contributing'
                else:
                    bldg['historic_status'] = raw_str
                stats['historic'] += 1

        # --- zoning: from STL parcel ---
        if parcel_match:
            raw = parcel_match.get('zoning')
            if raw and str(raw).strip():
                bldg['zoning'] = str(raw).strip()

        # --- assessed_value: from STL parcel ---
        if parcel_match:
            raw = parcel_match.get('APPRAISE') or parcel_match.get('appraised_value')
            if raw:
                try:
                    val = int(float(raw))
                    if val > 0:
                        bldg['assessed_value'] = val
                        stats['assessed'] += 1
                except (ValueError, TypeError):
                    pass

        # --- building_sqft: from STL parcel ---
        if parcel_match:
            raw = parcel_match.get('building_sqft') or parcel_match.get('SQFT')
            if raw:
                try:
                    val = int(float(raw))
                    if val > 0:
                        bldg['building_sqft'] = val
                except (ValueError, TypeError):
                    pass

        # --- facade_image: from Mapillary match ---
        if mapillary_match:
            thumb_256 = mapillary_match.get('thumb_256_url') or mapillary_match.get('thumb_256')
            thumb_1024 = mapillary_match.get('thumb_1024_url') or mapillary_match.get('thumb_1024')
            thumb_2048 = mapillary_match.get('thumb_2048_url') or mapillary_match.get('thumb_2048')
            if thumb_256 or thumb_1024:
                facade = {}
                if thumb_256:
                    facade['thumb_256'] = thumb_256
                if thumb_1024:
                    facade['thumb_1024'] = thumb_1024
                if thumb_2048:
                    facade['thumb_2048'] = thumb_2048
                bldg['facade_image'] = facade
                stats['facade_image'] += 1

        # --- Name from POI if building has no name ---
        if not bldg.get('name') and poi_match:
            poi_name = poi_match.get('name')
            if poi_name and str(poi_name).strip():
                bldg['name'] = str(poi_name).strip()

    return buildings, stats


# ---------------------------------------------------------------------------
# Landmark enrichment
# ---------------------------------------------------------------------------

def enrich_landmarks(landmarks, buildings, osm_pois):
    """
    Enrich landmarks with OSM POI data and associate each with its nearest
    building. Returns (enriched_landmarks, matched_count).
    """
    # Build centroid lookup for buildings by id -> (x, z)
    bldg_centroids = {}
    for bldg in buildings:
        bx, bz = centroid_of_footprint(bldg.get('footprint', []))
        if bx is None:
            pos = bldg.get('position', [0, 0, 0])
            bx, bz = pos[0], pos[2]
        bldg_centroids[bldg['id']] = (bx, bz)

    # Build a simple list of (x, z, bldg_id) for nearest-building search
    bldg_spatial = [(cx, cz, bid) for bid, (cx, cz) in bldg_centroids.items()]

    # Build POI index for name-matching
    poi_by_name = {}
    if osm_pois:
        for poi in osm_pois:
            name = (poi.get('name') or '').strip().lower()
            if name:
                poi_by_name.setdefault(name, []).append(poi)

    poi_idx = build_centroid_index(osm_pois) if osm_pois else []

    matched_count = 0

    for lm in landmarks:
        # If the landmark already has a building id, use that centroid
        lm_x, lm_z = None, None
        existing_id = lm.get('id') or lm.get('building_id')

        if existing_id and existing_id in bldg_centroids:
            lm_x, lm_z = bldg_centroids[existing_id]

        # Try to enrich from OSM POIs by name match
        lm_name = (lm.get('name') or '').strip().lower()
        poi_match = None

        if lm_name and lm_name in poi_by_name:
            # Exact name match
            poi_match = poi_by_name[lm_name][0]
        elif lm_x is not None and poi_idx:
            # Proximity-based match
            poi_match = find_nearest(lm_x, lm_z, poi_idx, 25)

        # Apply POI enrichment
        if poi_match:
            for field in ('phone', 'website', 'opening_hours', 'opening_hours_raw', 'hours'):
                val = poi_match.get(field)
                if val and str(val).strip() and not lm.get(field):
                    lm[field] = str(val).strip()
            # Copy category/subcategory if missing
            if not lm.get('category') and poi_match.get('category'):
                lm['category'] = poi_match['category']
            if not lm.get('subcategory') and poi_match.get('subcategory'):
                lm['subcategory'] = poi_match['subcategory']

        # Match landmark to nearest building
        if lm_x is not None and lm_z is not None:
            best_dist = 30
            best_bid = existing_id
            for bx, bz, bid in bldg_spatial:
                d = distance_2d(lm_x, lm_z, bx, bz)
                if d < best_dist:
                    best_dist = d
                    best_bid = bid
            if best_bid:
                lm['building_id'] = best_bid
                matched_count += 1
        elif existing_id:
            lm['building_id'] = existing_id
            matched_count += 1

    return landmarks, matched_count


# ---------------------------------------------------------------------------
# Summary statistics
# ---------------------------------------------------------------------------

def print_summary(buildings, landmarks, stats, landmark_matched):
    """Print enrichment summary statistics."""
    total = len(buildings)
    print("\n" + "=" * 60)
    print("  MERGE SUMMARY")
    print("=" * 60)
    print(f"  Total buildings:            {total}")
    print(f"  With year_built:            {stats['year_built']:>5}  "
          f"({100 * stats['year_built'] / total:.1f}%)" if total else "")
    print(f"  With address:               {stats['address']:>5}  "
          f"({100 * stats['address'] / total:.1f}%)" if total else "")
    print(f"  With facade image:          {stats['facade_image']:>5}  "
          f"({100 * stats['facade_image'] / total:.1f}%)" if total else "")
    print(f"  With material info:         {stats['material']:>5}  "
          f"({100 * stats['material'] / total:.1f}%)" if total else "")
    print(f"  With architect:             {stats['architect']:>5}  "
          f"({100 * stats['architect'] / total:.1f}%)" if total else "")
    print(f"  With historic status:       {stats['historic']:>5}  "
          f"({100 * stats['historic'] / total:.1f}%)" if total else "")
    print(f"  With assessed value:        {stats['assessed']:>5}  "
          f"({100 * stats['assessed'] / total:.1f}%)" if total else "")
    print(f"  Stories enriched:           {stats['stories_enriched']:>5}  "
          f"({100 * stats['stories_enriched'] / total:.1f}%)" if total else "")
    print(f"\n  Total landmarks:            {len(landmarks)}")
    print(f"  Landmarks matched to bldg:  {landmark_matched}")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  11-merge-all: Merging pipeline data sources")
    print("=" * 60)

    ensure_dirs()

    # ------------------------------------------------------------------
    # 1. Load base data
    # ------------------------------------------------------------------
    print("\n[1] Loading base data...")

    buildings_path = os.path.join(DATA_DIR, 'buildings.json')
    landmarks_path = os.path.join(DATA_DIR, 'landmarks.json')

    if not os.path.isfile(buildings_path):
        print(f"  ERROR: Base buildings file not found: {buildings_path}")
        print("  Run the Overture fetch pipeline first.")
        sys.exit(1)

    with open(buildings_path, 'r') as f:
        buildings_data = json.load(f)

    # Handle both {"buildings": [...]} and [...] formats
    if isinstance(buildings_data, dict) and 'buildings' in buildings_data:
        buildings = buildings_data['buildings']
    elif isinstance(buildings_data, list):
        buildings = buildings_data
    else:
        print("  ERROR: Unexpected buildings.json format")
        sys.exit(1)

    print(f"  Loaded {len(buildings)} base buildings")

    landmarks = []
    if os.path.isfile(landmarks_path):
        with open(landmarks_path, 'r') as f:
            landmarks_data = json.load(f)
        if isinstance(landmarks_data, dict) and 'landmarks' in landmarks_data:
            landmarks = landmarks_data['landmarks']
        elif isinstance(landmarks_data, list):
            landmarks = landmarks_data
        print(f"  Loaded {len(landmarks)} landmarks")
    else:
        print("  No landmarks.json found — skipping landmark enrichment")

    # ------------------------------------------------------------------
    # 2. Load enrichment sources (skip gracefully if missing)
    # ------------------------------------------------------------------
    print("\n[2] Loading enrichment sources...")

    osm_bldgs_raw = load_json(os.path.join(RAW_DIR, 'osm_buildings.json'), 'OSM Buildings')
    osm_pois_raw = load_json(os.path.join(RAW_DIR, 'osm_pois.json'), 'OSM POIs')
    parcels_raw = load_json(os.path.join(RAW_DIR, 'stl_parcels.json'), 'STL Parcels')
    mapillary_raw = load_json(os.path.join(RAW_DIR, 'mapillary_matches.json'), 'Mapillary')

    # Normalize: enrichment files may be {"items": [...]} or [...]
    def unwrap(data):
        if data is None:
            return None
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # Try common wrapper keys
            for key in ('buildings', 'features', 'items', 'pois', 'parcels',
                        'matches', 'elements', 'results'):
                if key in data and isinstance(data[key], list):
                    return data[key]
            # If dict has centroid-like keys, it might be a single record
            if 'centroid' in data or 'lon' in data:
                return [data]
        return None

    osm_bldgs = unwrap(osm_bldgs_raw)
    osm_pois = unwrap(osm_pois_raw)
    parcels = unwrap(parcels_raw)
    mapillary = unwrap(mapillary_raw)

    has_any = any(x is not None for x in [osm_bldgs, osm_pois, parcels, mapillary])
    if not has_any:
        print("\n  No enrichment sources found. Output will contain base data only.")

    # ------------------------------------------------------------------
    # 3. Enrich buildings
    # ------------------------------------------------------------------
    print("\n[3] Enriching buildings...")
    buildings, stats = enrich_buildings(buildings, osm_bldgs, osm_pois, parcels, mapillary)

    # ------------------------------------------------------------------
    # 4. Enrich landmarks
    # ------------------------------------------------------------------
    print("\n[4] Enriching landmarks...")
    landmark_matched = 0
    if landmarks:
        landmarks, landmark_matched = enrich_landmarks(landmarks, buildings, osm_pois)
        print(f"  Matched {landmark_matched}/{len(landmarks)} landmarks to buildings")
    else:
        print("  No landmarks to enrich")

    # ------------------------------------------------------------------
    # 5. Write output files
    # ------------------------------------------------------------------
    print("\n[5] Writing output files...")

    write_json(buildings_path, {"buildings": buildings}, 'buildings.json')

    if landmarks:
        write_json(landmarks_path, {"landmarks": landmarks}, 'landmarks.json')

    # ------------------------------------------------------------------
    # 6. Summary
    # ------------------------------------------------------------------
    print_summary(buildings, landmarks, stats, landmark_matched)

    print("\nDone.")


if __name__ == '__main__':
    main()
