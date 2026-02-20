#!/usr/bin/env python3
"""Generate park lamp positions: OSM interior lamps + evenly spaced perimeter lamps.

Preserves 33 OSM-sourced lamps inside Lafayette Park.
Adds lamps evenly around the park perimeter rectangle (rotated -9.2°).
Street lamps are not generated — procedural placement was unreliable.

Output: src/data/street_lamps.json
"""

import json
import math
import os

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPTS_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, 'src', 'data')

GRID_ROTATION = 9.2 * math.pi / 180
PARK_HALF = 162  # right at park edge path (OSM lamps extend to ~159m)

def is_inside_park(x, z):
    c = math.cos(GRID_ROTATION)
    s = math.sin(GRID_ROTATION)
    rx = x * c + z * s
    rz = -x * s + z * c
    return abs(rx) < 160 and abs(rz) < 160


def generate_perimeter_lamps(spacing=25):
    """Place lamps evenly around the rotated park perimeter rectangle.
    spacing: meters between lamps along each side."""
    c = math.cos(GRID_ROTATION)
    s = math.sin(GRID_ROTATION)

    # 4 corners of the rotated rectangle (in local-axis order)
    h = PARK_HALF
    corners_local = [(-h, -h), (h, -h), (h, h), (-h, h)]

    # Rotate corners to world coords
    corners = [(cx * c - cz * s, cx * s + cz * c) for cx, cz in corners_local]

    lamps = []
    for i in range(4):
        ax, az = corners[i]
        bx, bz = corners[(i + 1) % 4]
        side_len = math.hypot(bx - ax, bz - az)
        n = max(1, round(side_len / spacing))

        for j in range(n):
            t = (j + 0.5) / n  # center each lamp in its segment
            x = ax + (bx - ax) * t
            z = az + (bz - az) * t
            lamps.append({'x': round(x, 1), 'z': round(z, 1), 'park': True})

    return lamps


def main():
    with open(os.path.join(DATA_DIR, 'street_lamps.json')) as f:
        existing = json.load(f)

    # Preserve OSM interior park lamps
    interior_lamps = []
    for lamp in existing['lamps']:
        if is_inside_park(lamp['x'], lamp['z']):
            interior_lamps.append({'x': lamp['x'], 'z': lamp['z'], 'park': True})

    perimeter_lamps = generate_perimeter_lamps(spacing=25)

    # Dedup: remove perimeter lamps too close to an interior lamp
    filtered_perimeter = []
    for p in perimeter_lamps:
        too_close = False
        for i in interior_lamps:
            if math.hypot(p['x'] - i['x'], p['z'] - i['z']) < 12:
                too_close = True
                break
        if not too_close:
            filtered_perimeter.append(p)

    all_lamps = interior_lamps + filtered_perimeter

    print(f'Interior (OSM): {len(interior_lamps)}')
    print(f'Perimeter:      {len(filtered_perimeter)}')
    print(f'Total:          {len(all_lamps)}')

    output = {
        'meta': {
            'source': 'OSM interior + procedural perimeter',
            'park_count': len(all_lamps),
            'street_count': 0,
            'total': len(all_lamps),
        },
        'lamps': all_lamps,
    }

    out_path = os.path.join(DATA_DIR, 'street_lamps.json')
    with open(out_path, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    print(f'Wrote {out_path}')


if __name__ == '__main__':
    main()
