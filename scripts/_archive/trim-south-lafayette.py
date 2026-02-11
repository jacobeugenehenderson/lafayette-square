#!/usr/bin/env python3
"""
Trim geometry south of Lafayette Avenue (+ buffer).

Lafayette Ave runs diagonally matching the ~9° grid rotation.
Fitted centerline: z = 0.1585*x + 196.1
Southern edge with buffer: z = 0.1585*x + 196.1 + 180

Everything with z > cutoff(x) is removed. Streets crossing the
boundary are clipped at the intersection point. Jefferson Ave
segments south of the cutoff are removed (not kept like the
west trim — those are highway-distance segments).
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')

# Lafayette Ave centerline fit
SLOPE = 0.1585
INTERCEPT = 196.1
BUFFER = 180  # meters south of Lafayette centerline


def z_cutoff(x):
    """Southern boundary at a given x."""
    return SLOPE * x + INTERCEPT + BUFFER


def is_south(x, z):
    return z > z_cutoff(x)


def interpolate_crossing(p_inside, p_outside):
    """Find the point where the segment crosses the southern cutoff line.

    Solve: z = z_cutoff(x) along the line from p_inside to p_outside.
    x = xi + t*(xo - xi)
    z = zi + t*(zo - zi)
    z = SLOPE * x + INTERCEPT + BUFFER

    Substituting:
    zi + t*dz = SLOPE*(xi + t*dx) + INTERCEPT + BUFFER
    t*(dz - SLOPE*dx) = SLOPE*xi + INTERCEPT + BUFFER - zi
    """
    xi, zi = p_inside
    xo, zo = p_outside
    dx = xo - xi
    dz = zo - zi

    denom = dz - SLOPE * dx
    if abs(denom) < 1e-9:
        return [(xi + xo) / 2, (zi + zo) / 2]

    t = (SLOPE * xi + INTERCEPT + BUFFER - zi) / denom
    t = max(0.0, min(1.0, t))

    nx = round(xi + t * dx, 1)
    nz = round(zi + t * dz, 1)
    return [nx, nz]


def trim_buildings():
    path = os.path.join(DATA_DIR, 'buildings.json')
    with open(path) as f:
        data = json.load(f)

    before = len(data['buildings'])
    kept = []
    removed_ids = set()
    for b in data['buildings']:
        x, z = b['position'][0], b['position'][2]
        if is_south(x, z):
            removed_ids.add(b['id'])
        else:
            kept.append(b)

    data['buildings'] = kept
    with open(path, 'w') as f:
        json.dump(data, f)

    print(f"Buildings: {before} → {len(kept)} (removed {before - len(kept)})")
    return removed_ids


def trim_streets():
    path = os.path.join(DATA_DIR, 'streets.json')
    with open(path) as f:
        data = json.load(f)

    before = len(data['streets'])
    kept = []
    removed = 0
    clipped = 0

    for s in data['streets']:
        points = s['points']
        north_flags = [not is_south(p[0], p[1]) for p in points]

        # All points south — remove entirely
        if not any(north_flags):
            removed += 1
            continue

        # All points north — keep as-is
        if all(north_flags):
            kept.append(s)
            continue

        # Mixed — clip at boundary
        new_points = []
        for i in range(len(points)):
            if north_flags[i]:
                if i > 0 and not north_flags[i - 1]:
                    crossing = interpolate_crossing(points[i], points[i - 1])
                    new_points.append(crossing)
                new_points.append(points[i])
            else:
                if i > 0 and north_flags[i - 1]:
                    crossing = interpolate_crossing(points[i - 1], points[i])
                    new_points.append(crossing)

        if len(new_points) >= 2:
            s['points'] = new_points
            kept.append(s)
            clipped += 1
        else:
            removed += 1

    data['streets'] = kept
    with open(path, 'w') as f:
        json.dump(data, f)

    print(f"Streets: {before} → {len(kept)} (removed {removed}, clipped {clipped})")


def trim_blocks():
    path = os.path.join(DATA_DIR, 'blocks.json')
    with open(path) as f:
        data = json.load(f)

    before = len(data['blocks'])
    kept = []
    for b in data['blocks']:
        pts = b['points']
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        if not is_south(cx, cz):
            kept.append(b)

    data['blocks'] = kept
    with open(path, 'w') as f:
        json.dump(data, f)

    print(f"Blocks: {before} → {len(kept)} (removed {before - len(kept)})")


def trim_lamps():
    path = os.path.join(DATA_DIR, 'street_lamps.json')
    with open(path) as f:
        data = json.load(f)

    before = len(data['lamps'])
    data['lamps'] = [l for l in data['lamps'] if not is_south(l['x'], l['z'])]
    after = len(data['lamps'])

    with open(path, 'w') as f:
        json.dump(data, f)

    print(f"Lamps: {before} → {after} (removed {before - after})")


def trim_landmarks(removed_building_ids):
    path = os.path.join(DATA_DIR, 'landmarks.json')
    with open(path) as f:
        data = json.load(f)

    before = len(data['landmarks'])
    data['landmarks'] = [
        lm for lm in data['landmarks']
        if lm.get('building_id') not in removed_building_ids
    ]
    after = len(data['landmarks'])

    with open(path, 'w') as f:
        json.dump(data, f)

    print(f"Landmarks: {before} → {after} (removed {before - after})")


def trim_terrain():
    path = os.path.join(DATA_DIR, 'terrain.json')
    with open(path) as f:
        data = json.load(f)

    width = data['width']
    height = data['height']
    bounds = data['bounds']
    elevations = data['data']

    min_z = bounds['minZ']
    max_z = bounds['maxZ']
    cell_size_z = (max_z - min_z) / height

    # Find the last row whose center z <= the cutoff at x=0 (map center)
    cutoff_at_center = z_cutoff(0)

    rows_to_keep = height
    for row in range(height):
        row_center_z = min_z + (row + 0.5) * cell_size_z
        if row_center_z > cutoff_at_center:
            rows_to_keep = row
            break

    if rows_to_keep == height:
        print("Terrain: no rows to trim")
        return

    rows_trimmed = height - rows_to_keep
    new_height = rows_to_keep
    new_max_z = round(min_z + rows_to_keep * cell_size_z)

    # Keep only the first rows_to_keep rows (row-major)
    new_data = elevations[:rows_to_keep * width]

    data['height'] = new_height
    data['bounds']['maxZ'] = new_max_z
    data['data'] = new_data

    with open(path, 'w') as f:
        json.dump(data, f)

    print(f"Terrain: {width}x{height} → {width}x{new_height} (trimmed {rows_trimmed} southern rows, new maxZ={new_max_z})")


if __name__ == '__main__':
    print("Trimming geometry south of Lafayette Avenue...\n")
    removed_bldg_ids = trim_buildings()
    trim_streets()
    trim_blocks()
    trim_lamps()
    trim_landmarks(removed_bldg_ids)
    trim_terrain()
    print("\nDone!")
