#!/usr/bin/env python3
"""
Match wikimedia facade photos to specific buildings.

Strategy: year-first matching
1. For each street, group images and buildings by year_built
2. Within each year group, match by geographic proximity (position along street)
3. Unmatched images get assigned to nearest unmatched building
4. Output facade_mapping.json with building_id -> image + front edge geometry
"""
import json, re, math, os
from collections import defaultdict

with open('public/photos/lafayette-square/attribution.json') as f:
    attrs = json.load(f)
with open('src/data/buildings.json') as f:
    buildings = json.load(f)['buildings']
with open('src/data/streets.json') as f:
    streets_data = json.load(f)['streets']

WIKI_TO_ADDR = {
    'lafayette-ave': 'LAFAYETTE AV',
    'mississippi-ave': 'MISSISSIPPI AV',
    'park-ave': 'PARK AV',
    'missouri-ave': 'MISSOURI AV',
    'benton-place': 'BENTON PL',
    'whittemore-place': 'WHITTEMORE PL',
    'dolman-st': 'DOLMAN ST',
    'park-and-vail': 'VAIL PL',
}

WIKI_TO_STREET_NAME = {
    'lafayette-ave': 'Lafayette',
    'mississippi-ave': 'Mississippi',
    'park-ave': 'Park',
    'missouri-ave': 'Missouri',
    'benton-place': 'Benton',
    'whittemore-place': 'Whittemore',
    'dolman-st': 'Dolman',
    'park-and-vail': 'Vail',
}


def get_image_year(desc):
    m = re.search(r'Built in (\d{4})', desc or '')
    return int(m.group(1)) if m else None


def get_street_axis(wiki_street):
    """Get the primary direction vector for a street."""
    name_pattern = WIKI_TO_STREET_NAME.get(wiki_street, '')
    segs = [s for s in streets_data if name_pattern.lower() in s.get('name', '').lower()]
    if not segs:
        return None
    dx_total, dz_total = 0, 0
    for seg in segs:
        pts = seg['points']
        for i in range(len(pts) - 1):
            dx = pts[i + 1][0] - pts[i][0]
            dz = pts[i + 1][1] - pts[i][1]
            dx_total += dx
            dz_total += dz
    mag = math.sqrt(dx_total ** 2 + dz_total ** 2)
    return (dx_total / mag, dz_total / mag) if mag > 0 else None


def project_along(bldg, axis):
    """Project building position onto street axis."""
    pos = bldg.get('position', [0, 0, 0])
    return pos[0] * axis[0] + pos[2] * axis[1]


def year_distance(y1, y2):
    """How far apart two years are. None = large penalty."""
    if y1 is None or y2 is None:
        return 50  # unknown = moderate penalty
    return abs(y1 - y2)


def match_street(wiki_street):
    """Match images to buildings using year-first, position-second."""
    addr_pattern = WIKI_TO_ADDR.get(wiki_street)
    if not addr_pattern:
        return {}

    # Images sorted by filename (walking order)
    imgs = sorted(
        [a for a in attrs if a['street'] == wiki_street],
        key=lambda a: a['file']
    )
    # Only include images that actually exist on disk
    imgs = [a for a in imgs if os.path.exists(a['file'].lstrip('/'))]

    # Buildings on this street with position data
    street_bldgs = [b for b in buildings
                    if addr_pattern in b.get('address', '') and b.get('position')]

    if not street_bldgs or not imgs:
        return {}

    # Sort buildings by position along street
    axis = get_street_axis(wiki_street)
    if axis:
        for b in street_bldgs:
            b['_proj'] = project_along(b, axis)
        street_bldgs.sort(key=lambda b: b['_proj'])

    # Extract years
    for img in imgs:
        img['_year'] = get_image_year(img.get('description', ''))

    # === Year-first matching ===
    # For each building, find best image by year match
    # Track which images are claimed
    claimed_imgs = set()
    bldg_to_img = {}

    # Pass 1: exact year matches
    for b in street_bldgs:
        b_year = b.get('year_built')
        if b_year is None:
            continue
        best_img = None
        best_dist = 999
        for i, img in enumerate(imgs):
            if i in claimed_imgs:
                continue
            dist = year_distance(img['_year'], b_year)
            if dist <= 2 and dist < best_dist:
                best_dist = dist
                best_img = i
        if best_img is not None:
            claimed_imgs.add(best_img)
            bldg_to_img[b['id']] = (best_img, best_dist)

    # Pass 2: close year matches (within 5 years)
    for b in street_bldgs:
        if b['id'] in bldg_to_img:
            continue
        b_year = b.get('year_built')
        best_img = None
        best_dist = 999
        for i, img in enumerate(imgs):
            if i in claimed_imgs:
                continue
            dist = year_distance(img['_year'], b_year)
            if dist <= 5 and dist < best_dist:
                best_dist = dist
                best_img = i
        if best_img is not None:
            claimed_imgs.add(best_img)
            bldg_to_img[b['id']] = (best_img, best_dist)

    # Pass 3: remaining buildings get nearest unclaimed image by position
    if axis:
        unclaimed = sorted(
            [i for i in range(len(imgs)) if i not in claimed_imgs],
            key=lambda i: i  # keep walking order
        )
        unmatched_bldgs = [b for b in street_bldgs if b['id'] not in bldg_to_img]

        for b in unmatched_bldgs:
            if not unclaimed:
                break
            # Find nearest unclaimed image by index (proxy for position)
            b_idx = street_bldgs.index(b)
            # Estimate where in the image sequence this building would be
            expected_img_idx = int(b_idx * len(imgs) / len(street_bldgs))
            best_i = min(unclaimed, key=lambda i: abs(i - expected_img_idx))
            unclaimed.remove(best_i)
            claimed_imgs.add(best_i)
            dist = year_distance(imgs[best_i]['_year'], b.get('year_built'))
            bldg_to_img[b['id']] = (best_i, dist)

    # Build results
    results = {}
    for bid, (img_idx, yr_dist) in bldg_to_img.items():
        img = imgs[img_idx]
        bldg = next(b for b in street_bldgs if b['id'] == bid)

        confidence = 1.0 if yr_dist == 0 else 0.9 if yr_dist <= 2 else 0.7 if yr_dist <= 5 else 0.4 if yr_dist <= 10 else 0.2
        if img['_year'] is None or bldg.get('year_built') is None:
            confidence = 0.5  # unknown

        results[bid] = {
            'image': img['file'],
            'image_year': img['_year'],
            'building_year': bldg.get('year_built'),
            'confidence': confidence,
            'description': img.get('description', '')[:300],
            'address': bldg.get('address', ''),
        }

    return results


def compute_front_edge(building):
    """Compute the street-facing edge of a building footprint."""
    fp = building.get('footprint')
    if not fp or len(fp) < 3:
        # Fallback: use building size to create a synthetic edge
        size = building.get('size', [8, 8, 8])
        return {
            'width': size[0],
            'mid_x': building['position'][0],
            'mid_z': building['position'][2],
            'nx': 0,
            'nz': 1,
            'angle': 0,
        }

    addr = building.get('address', '').upper()

    # Classify street direction
    ew_streets = ['LAFAYETTE', 'PARK', 'CHOUTEAU', 'HICKORY', 'RUTGER', 'CARROLL',
                  'BENTON', 'WHITTEMORE', 'ALBION', 'MACKAY', 'KENNETT']
    ns_streets = ['MISSISSIPPI', 'MISSOURI', 'DOLMAN', '18TH', 'LASALLE', 'VAIL',
                  'JEFFERSON', '17TH', '19TH']

    is_ew = any(s in addr for s in ew_streets)
    is_ns = any(s in addr for s in ns_streets)
    if not is_ew and not is_ns:
        is_ew = True  # default

    best_edge = None
    best_score = -1

    for i in range(len(fp)):
        p1 = fp[i]
        p2 = fp[(i + 1) % len(fp)]
        dx = p2[0] - p1[0]
        dz = p2[1] - p1[1]
        length = math.sqrt(dx ** 2 + dz ** 2)
        if length < 0.5:
            continue

        nx, nz = -dz / length, dx / length

        # Front face has normal pointing toward the street
        # E-W streets: front face normal has large |Z| component
        # N-S streets: front face normal has large |X| component
        score = abs(nz) if is_ew else abs(nx)

        # Prefer wider edges (the actual front, not a narrow side)
        score *= (1 + length * 0.05)

        if score > best_score:
            best_score = score
            mid_x = (p1[0] + p2[0]) / 2
            mid_z = (p1[1] + p2[1]) / 2
            best_edge = {
                'width': round(length, 2),
                'mid_x': round(mid_x, 2),
                'mid_z': round(mid_z, 2),
                'nx': round(nx, 3),
                'nz': round(nz, 3),
                'angle': round(math.atan2(nx, nz), 4),
            }

    return best_edge


# ============================================================
# Run matching
# ============================================================
all_results = {}
total_imgs = 0
total_matched = 0
total_high = 0

print("Facade Matching Results")
print("=" * 60)

for wiki_street in WIKI_TO_ADDR:
    results = match_street(wiki_street)
    all_results.update(results)

    n_imgs = len([a for a in attrs if a['street'] == wiki_street
                  and os.path.exists(a['file'].lstrip('/'))])
    matched = len(results)
    high = sum(1 for r in results.values() if r['confidence'] >= 0.7)
    med = sum(1 for r in results.values() if 0.4 <= r['confidence'] < 0.7)
    low = sum(1 for r in results.values() if r['confidence'] < 0.4)

    total_imgs += n_imgs
    total_matched += matched
    total_high += high

    print(f"\n{wiki_street:20s}  imgs={n_imgs:3d}  matched={matched:3d}  "
          f"high={high:3d}  med={med:3d}  low={low:3d}")

    # Show samples
    for bid, r in sorted(results.items(), key=lambda x: -x[1]['confidence'])[:3]:
        sym = "✓" if r['confidence'] >= 0.7 else "~" if r['confidence'] >= 0.4 else "✗"
        fname = r['image'].split('/')[-1]
        print(f"  {sym} {fname} -> {bid:10s} ({r['address']:25s}) "
              f"img={r['image_year'] or '?':>5} bldg={r['building_year'] or '?':>5} "
              f"conf={r['confidence']:.1f}")

print(f"\n{'=' * 60}")
print(f"TOTAL: {total_imgs} images, {total_matched} matched, {total_high} high-confidence")

# ============================================================
# Build facade_mapping.json with front edge geometry
# ============================================================
facade_mapping = {}

for bid, match in all_results.items():
    bldg = next((b for b in buildings if b['id'] == bid), None)
    if not bldg:
        continue

    edge = compute_front_edge(bldg)
    if not edge:
        continue

    facade_mapping[bid] = {
        'image': match['image'],
        'confidence': match['confidence'],
        'description': match['description'],
        'wall_height': bldg.get('size', [0, 0, 0])[1],
        'front_edge': edge,
    }

with open('src/data/facade_mapping.json', 'w') as f:
    json.dump(facade_mapping, f, indent=2)

print(f"\nWritten {len(facade_mapping)} entries to src/data/facade_mapping.json")
