#!/usr/bin/env python3
"""
Trim all geometry west of Jefferson Avenue.

Jefferson Ave runs diagonally matching the ~9° grid rotation.
Fitted centerline: x = -0.2102*z - 392.1
Western edge (half road width = 10m): x = -0.2102*z - 402.1

Everything with x < cutoff(z) is removed. Streets crossing the
boundary are clipped at the intersection point.
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')

# Jefferson Ave centerline fit from all segment points
SLOPE = -0.2102
INTERCEPT = -392.1
HALF_ROAD = 10  # primary road half-width


def x_cutoff(z):
    """Western edge of Jefferson Ave at a given z."""
    return SLOPE * z + INTERCEPT - HALF_ROAD


def is_west(x, z):
    return x < x_cutoff(z)


def interpolate_crossing(p_east, p_west):
    """Find the point where the segment crosses the Jefferson cutoff line.

    Solve: x = x_cutoff(z) along the line from p_east to p_west.
    x = xe + t*(xw - xe)
    z = ze + t*(zw - ze)
    x = SLOPE * z + INTERCEPT - HALF_ROAD

    Substituting:
    xe + t*dx = SLOPE*(ze + t*dz) + INTERCEPT - HALF_ROAD
    t*(dx - SLOPE*dz) = SLOPE*ze + INTERCEPT - HALF_ROAD - xe
    """
    xe, ze = p_east
    xw, zw = p_west
    dx = xw - xe
    dz = zw - ze

    denom = dx - SLOPE * dz
    if abs(denom) < 1e-9:
        # Parallel to cutoff line — return midpoint
        return [(xe + xw) / 2, (ze + zw) / 2]

    t = (SLOPE * ze + INTERCEPT - HALF_ROAD - xe) / denom
    t = max(0.0, min(1.0, t))

    nx = round(xe + t * dx, 1)
    nz = round(ze + t * dz, 1)
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
        if is_west(x, z):
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
        name = s.get('name', '')

        # Always keep Jefferson Ave segments
        if 'Jefferson' in name:
            kept.append(s)
            continue

        points = s['points']
        east_flags = [not is_west(p[0], p[1]) for p in points]

        # All points west — remove entirely
        if not any(east_flags):
            removed += 1
            continue

        # All points east — keep as-is
        if all(east_flags):
            kept.append(s)
            continue

        # Mixed — clip at boundary
        new_points = []
        for i in range(len(points)):
            if east_flags[i]:
                # If previous point was west, add the crossing point first
                if i > 0 and not east_flags[i - 1]:
                    crossing = interpolate_crossing(points[i], points[i - 1])
                    new_points.append(crossing)
                new_points.append(points[i])
            else:
                # This point is west; if previous was east, add crossing
                if i > 0 and east_flags[i - 1]:
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
        if not is_west(cx, cz):
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
    data['lamps'] = [l for l in data['lamps'] if not is_west(l['x'], l['z'])]
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

    min_x = bounds['minX']
    max_x = bounds['maxX']
    cell_size = (max_x - min_x) / width

    # Find the first column whose center x >= the cutoff at z=0
    # (terrain center). Use a conservative cutoff (z=0 middle of map).
    cutoff_at_center = x_cutoff(0)

    cols_to_trim = 0
    for col in range(width):
        col_center_x = min_x + (col + 0.5) * cell_size
        if col_center_x >= cutoff_at_center:
            break
        cols_to_trim += 1

    if cols_to_trim == 0:
        print("Terrain: no columns to trim")
        return

    new_width = width - cols_to_trim
    new_min_x = round(min_x + cols_to_trim * cell_size)

    # Rebuild elevation data (row-major: row * width + col)
    new_data = []
    for row in range(height):
        for col in range(cols_to_trim, width):
            new_data.append(elevations[row * width + col])

    data['width'] = new_width
    data['bounds']['minX'] = new_min_x
    data['data'] = new_data

    with open(path, 'w') as f:
        json.dump(data, f)

    print(f"Terrain: {width}x{height} → {new_width}x{height} (trimmed {cols_to_trim} western columns, new minX={new_min_x})")


if __name__ == '__main__':
    print("Trimming geometry west of Jefferson Avenue...\n")
    removed_bldg_ids = trim_buildings()
    trim_streets()
    trim_blocks()
    trim_lamps()
    trim_landmarks(removed_bldg_ids)
    trim_terrain()
    print("\nDone!")
