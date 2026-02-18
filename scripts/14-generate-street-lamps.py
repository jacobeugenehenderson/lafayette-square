#!/usr/bin/env python3
"""Generate procedural street lamp positions along streets.

Reads block_shapes.json for street polylines (with measured ROW widths).
Preserves OSM-sourced park lamp positions from the existing data.
Tags each lamp with park=true/false so the renderer can style them differently.

Placement rules:
  - Primary/secondary (width >= 20m): both sides, 30m spacing
  - Standard residential (width 12-20m): staggered sides, 35m spacing
  - Narrow streets (width 8-12m): one side, 35m spacing
  - Alleys/paths (width < 8m): skipped

Output: src/data/street_lamps.json
"""

import json
import math
import os

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPTS_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, 'src', 'data')

# ── Park boundary (rotated rectangle matching the grid) ──────────────────────
GRID_ROTATION = 9.2 * math.pi / 180

def is_inside_park(x, z):
    c = math.cos(GRID_ROTATION)
    s = math.sin(GRID_ROTATION)
    rx = x * c + z * s
    rz = -x * s + z * c
    return abs(rx) < 160 and abs(rz) < 160


# ── Polyline walker ──────────────────────────────────────────────────────────

def walk_polyline(points, spacing):
    """Sample (x, z, perpX, perpZ) positions at regular intervals along a polyline.
    First lamp is placed at spacing/2 to avoid intersection clustering."""
    positions = []
    total_dist = 0.0
    next_emit = spacing * 0.5  # half-spacing offset from start

    for i in range(1, len(points)):
        ax, az = points[i - 1]
        bx, bz = points[i]
        seg_len = math.hypot(bx - ax, bz - az)
        if seg_len < 0.01:
            continue

        dx = (bx - ax) / seg_len
        dz = (bz - az) / seg_len
        px, pz = -dz, dx  # perpendicular (left of travel direction)

        seg_start = total_dist
        total_dist += seg_len

        while next_emit <= total_dist:
            t = next_emit - seg_start  # distance into this segment
            x = ax + dx * t
            z = az + dz * t
            positions.append((x, z, px, pz))
            next_emit += spacing

    return positions


# ── Deduplication ────────────────────────────────────────────────────────────

def deduplicate(lamps, min_dist=8.0):
    """Remove lamps that are too close to an already-accepted lamp."""
    kept = []
    for lamp in lamps:
        too_close = False
        for other in kept:
            d = math.hypot(lamp['x'] - other['x'], lamp['z'] - other['z'])
            if d < min_dist:
                too_close = True
                break
        if not too_close:
            kept.append(lamp)
    return kept


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    # Load street polylines (from block_shapes.json — has measured ROW widths)
    with open(os.path.join(DATA_DIR, 'block_shapes.json')) as f:
        block_data = json.load(f)

    # Load existing lamp data (for park lamp positions)
    with open(os.path.join(DATA_DIR, 'street_lamps.json')) as f:
        existing = json.load(f)

    # ── Preserve park lamps from OSM ─────────────────────────────────────
    park_lamps = []
    for lamp in existing['lamps']:
        if is_inside_park(lamp['x'], lamp['z']):
            park_lamps.append({'x': lamp['x'], 'z': lamp['z'], 'park': True})
    print(f'Preserved {len(park_lamps)} OSM park lamps')

    # ── Generate street lamps ────────────────────────────────────────────
    MIN_WIDTH = 8.0
    raw_street_lamps = []

    for street in block_data['streets']:
        width = street.get('width', 0)
        name = street.get('name', '(unnamed)')
        points = street.get('points', [])

        if width < MIN_WIDTH or len(points) < 2:
            continue

        half_row = width / 2.0
        offset_dist = half_row + 1.0  # 1m past curb onto sidewalk

        if width >= 20:
            # Primary/secondary — both sides, tighter spacing
            spacing = 30
            positions = walk_polyline(points, spacing)
            for x, z, px, pz in positions:
                raw_street_lamps.append({
                    'x': round(x + px * offset_dist, 1),
                    'z': round(z + pz * offset_dist, 1),
                    'park': False,
                })
                raw_street_lamps.append({
                    'x': round(x - px * offset_dist, 1),
                    'z': round(z - pz * offset_dist, 1),
                    'park': False,
                })
            side_label = 'both'

        elif width >= 12:
            # Standard residential — staggered sides
            spacing = 35
            positions = walk_polyline(points, spacing)
            for i, (x, z, px, pz) in enumerate(positions):
                side = 1 if i % 2 == 0 else -1
                raw_street_lamps.append({
                    'x': round(x + side * px * offset_dist, 1),
                    'z': round(z + side * pz * offset_dist, 1),
                    'park': False,
                })
            side_label = 'staggered'

        else:
            # Narrow — one side
            spacing = 35
            positions = walk_polyline(points, spacing)
            for x, z, px, pz in positions:
                raw_street_lamps.append({
                    'x': round(x + px * offset_dist, 1),
                    'z': round(z + pz * offset_dist, 1),
                    'park': False,
                })
            side_label = 'one-side'

        print(f'  {name:30s}  w={width:5.1f}  {side_label:10s}  → {len(positions)} positions')

    print(f'Generated {len(raw_street_lamps)} raw street lamp positions')

    # ── Filter: remove street lamps inside the park ──────────────────────
    outside_park = [l for l in raw_street_lamps if not is_inside_park(l['x'], l['z'])]
    print(f'After park filter: {len(outside_park)} street lamps')

    # ── Filter: remove street lamps too close to a park lamp ─────────────
    filtered = []
    for lamp in outside_park:
        too_close = False
        for p in park_lamps:
            if math.hypot(lamp['x'] - p['x'], lamp['z'] - p['z']) < 10:
                too_close = True
                break
        if not too_close:
            filtered.append(lamp)
    print(f'After park-proximity filter: {len(filtered)} street lamps')

    # ── Deduplicate street lamps near each other (intersections) ─────────
    deduped = deduplicate(filtered, min_dist=8.0)
    print(f'After dedup: {len(deduped)} street lamps')

    # ── Combine and write ────────────────────────────────────────────────
    all_lamps = park_lamps + deduped

    output = {
        'meta': {
            'source': 'procedural + OSM park',
            'park_count': len(park_lamps),
            'street_count': len(deduped),
            'total': len(all_lamps),
        },
        'lamps': all_lamps,
    }

    out_path = os.path.join(DATA_DIR, 'street_lamps.json')
    with open(out_path, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    print(f'\nWrote {out_path}')
    print(f'  Park lamps:   {len(park_lamps)}')
    print(f'  Street lamps: {len(deduped)}')
    print(f'  Total:        {len(all_lamps)}')


if __name__ == '__main__':
    main()
