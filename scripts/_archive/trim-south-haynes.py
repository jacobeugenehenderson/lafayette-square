#!/usr/bin/env python3
"""
Clean up the southern edge using Officer David Haynes Memorial Highway
as the hard boundary. Remove the highway itself, all ramps, South 13th St nub,
and trim terrain/lamps/buildings south of the boundary.

The boundary follows the Haynes north edge from x=-142 eastward,
then extends flat at z=300 westward to meet Jefferson.
East of x=69 (where Haynes ends), the line continues at the same slope.
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')

# Haynes north edge fit: z = 0.3465*x + 354.1
HAYNES_SLOPE = 0.3465
HAYNES_INTERCEPT = 354.1
HAYNES_WEST_X = -142.3
FLAT_Z_WEST = 300.0

# Streets to explicitly remove (ramps, highway, nubs) regardless of boundary
EXPLICIT_REMOVE = {
    # Haynes highway itself
    'st-0824', 'st-0825',
    # Ramps connecting Jefferson to Haynes (unnamed primary west of Haynes)
    'st-0839', 'st-0841',
    # Highway ramps continuing east from Haynes
    'st-0873',  # unnamed primary, curves east from Haynes endpoint
    'st-0874',  # unnamed primary, curves south off Lafayette/18th
    # Far-south ramps
    'st-0919',  # unnamed primary, goes far south near Tucker
    'st-0970',  # unnamed primary, far south loop
    # Ramps off Lafayette near Walgreens area
    'st-0909',  # unnamed primary ramp
    'st-0910',  # unnamed primary ramp
    # South 13th Street nub
    'st-0543',
    # South 18th Street (runs south into highway area)
    'st-0876',
    # Service/residential streets in the ramp area east of Haynes
    'st-0542',  # unnamed residential, far SE
    'st-0545',  # unnamed service, ramp area
    'st-0546',  # unnamed residential, ramp area
    'st-0547',  # unnamed service, ramp area
    'st-0548',  # unnamed service, ramp area
    'st-0550',  # unnamed residential, ramp area
    'st-0912',  # unnamed service, ramp area
    # Small streets/service roads in the Haynes zone
    'st-0843',  # unnamed service south of Missouri
    'st-0848',  # unnamed service dot
    'st-0849',  # unnamed residential south of Missouri
    'st-0842',  # Missouri Ave stub south of boundary
}


def z_boundary(x):
    """Southern boundary: Haynes north edge, flat west of Haynes."""
    if x < HAYNES_WEST_X:
        return FLAT_Z_WEST
    return HAYNES_SLOPE * x + HAYNES_INTERCEPT - 5  # 5m north of Haynes center


def is_south(x, z):
    return z > z_boundary(x)


def interpolate_crossing(p_inside, p_outside):
    """Find the point where segment crosses the boundary."""
    xi, zi = p_inside
    xo, zo = p_outside
    dx = xo - xi
    dz = zo - zi

    # For the flat portion (x < HAYNES_WEST_X): z = FLAT_Z_WEST
    # For the sloped portion: z = HAYNES_SLOPE*x + HAYNES_INTERCEPT - 5
    # Use midpoint x to decide which regime
    mid_x = (xi + xo) / 2

    if mid_x < HAYNES_WEST_X:
        # z = FLAT_Z_WEST
        if abs(dz) < 1e-9:
            return [(xi + xo) / 2, (zi + zo) / 2]
        t = (FLAT_Z_WEST - zi) / dz
    else:
        # z = HAYNES_SLOPE*x + HAYNES_INTERCEPT - 5
        # zi + t*dz = HAYNES_SLOPE*(xi + t*dx) + HAYNES_INTERCEPT - 5
        # t*(dz - HAYNES_SLOPE*dx) = HAYNES_SLOPE*xi + HAYNES_INTERCEPT - 5 - zi
        denom = dz - HAYNES_SLOPE * dx
        if abs(denom) < 1e-9:
            return [(xi + xo) / 2, (zi + zo) / 2]
        t = (HAYNES_SLOPE * xi + HAYNES_INTERCEPT - 5 - zi) / denom

    t = max(0.0, min(1.0, t))
    return [round(xi + t * dx, 1), round(zi + t * dz, 1)]


def trim_streets():
    path = os.path.join(DATA_DIR, 'streets.json')
    with open(path) as f:
        data = json.load(f)

    before = len(data['streets'])
    kept = []
    removed = 0
    clipped = 0

    for s in data['streets']:
        # Explicit removal list
        if s['id'] in EXPLICIT_REMOVE:
            removed += 1
            continue

        points = s['points']
        north_flags = [not is_south(p[0], p[1]) for p in points]

        if not any(north_flags):
            removed += 1
            continue

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

    min_z = bounds['minZ']
    max_z = bounds['maxZ']
    cell_size_z = (max_z - min_z) / height

    # Trim rows south of boundary at x=0 (center)
    cutoff_z = z_boundary(0)
    rows_to_keep = height
    for row in range(height):
        row_center_z = min_z + (row + 0.5) * cell_size_z
        if row_center_z > cutoff_z:
            rows_to_keep = row
            break

    if rows_to_keep == height:
        print("Terrain: no rows to trim")
        return

    rows_trimmed = height - rows_to_keep
    new_height = rows_to_keep
    new_max_z = round(min_z + rows_to_keep * cell_size_z)

    data['height'] = new_height
    data['bounds']['maxZ'] = new_max_z
    data['data'] = data['data'][:rows_to_keep * width]

    with open(path, 'w') as f:
        json.dump(data, f)

    print(f"Terrain: {width}x{height} → {width}x{new_height} (trimmed {rows_trimmed} rows, new maxZ={new_max_z})")


if __name__ == '__main__':
    print("Cleaning up south edge using Haynes Highway boundary...\n")
    removed_bldg_ids = trim_buildings()
    trim_streets()
    trim_blocks()
    trim_lamps()
    trim_landmarks(removed_bldg_ids)
    trim_terrain()
    print("\nDone!")
