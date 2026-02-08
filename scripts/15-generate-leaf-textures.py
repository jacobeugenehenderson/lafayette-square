#!/usr/bin/env python3
"""Generate leaf cluster billboard textures for 14 morphology groups.

Each texture is a 1024x1024 RGBA PNG showing a branch cluster with
species-appropriate leaf shapes on a transparent background. These get
applied to crossed-plane billboard geometry in the 3D renderer.

Output: public/textures/leaves/<type>.png
"""

import json
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(PROJECT_DIR, 'public', 'textures', 'leaves')
SIZE = 1024
CENTER = SIZE // 2
RADIUS = SIZE // 2 - 40  # cluster radius


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def vary_color(rgb, amount=20):
    """Add random variation to an RGB color."""
    return tuple(max(0, min(255, c + random.randint(-amount, amount))) for c in rgb)


def rotate_point(x, y, cx, cy, angle):
    """Rotate point (x,y) around (cx,cy) by angle radians."""
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    dx, dy = x - cx, y - cy
    return cx + dx * cos_a - dy * sin_a, cy + dx * sin_a + dy * cos_a


def rotate_poly(points, cx, cy, angle):
    """Rotate a list of (x,y) points."""
    return [rotate_point(x, y, cx, cy, angle) for x, y in points]


def draw_branch(draw, x0, y0, x1, y1, width=3, color=(80, 55, 35)):
    """Draw a tapered branch segment."""
    draw.line([(x0, y0), (x1, y1)], fill=color + (255,), width=width)


def make_leaf_maple(cx, cy, size, angle=0):
    """5-lobed palmate maple leaf polygon."""
    pts = []
    for i in range(5):
        lobe_angle = (i / 5) * 2 * math.pi - math.pi / 2
        # Lobe tip
        lobe_r = size * (0.9 if i % 2 == 0 else 0.6)
        tx = cx + math.cos(lobe_angle) * lobe_r
        ty = cy + math.sin(lobe_angle) * lobe_r
        pts.append((tx, ty))
        # Sinus between lobes
        sinus_angle = lobe_angle + math.pi / 5
        sinus_r = size * 0.3
        sx = cx + math.cos(sinus_angle) * sinus_r
        sy = cy + math.sin(sinus_angle) * sinus_r
        pts.append((sx, sy))
    # Add stem
    pts.append((cx, cy + size * 0.4))
    if angle != 0:
        pts = rotate_poly(pts, cx, cy, angle)
    return pts


def make_leaf_oak(cx, cy, size, angle=0):
    """Lobed oak leaf — elongated with rounded lobes."""
    pts = []
    num_lobes = 4
    leaf_len = size * 1.3
    leaf_w = size * 0.7
    for i in range(num_lobes * 2 + 1):
        t = i / (num_lobes * 2)
        y = cy - leaf_len / 2 + t * leaf_len
        if i % 2 == 0:
            # Lobe tip (wide)
            x_off = leaf_w / 2 * (1 - abs(t - 0.5) * 1.5)
            x_off = max(x_off, size * 0.15)
            pts.append((cx + x_off, y))
        else:
            # Sinus (narrow)
            x_off = leaf_w / 2 * 0.4 * (1 - abs(t - 0.5) * 1.2)
            x_off = max(x_off, size * 0.08)
            pts.append((cx + x_off, y))
    # Return along the other side
    for i in range(num_lobes * 2, -1, -1):
        t = i / (num_lobes * 2)
        y = cy - leaf_len / 2 + t * leaf_len
        if i % 2 == 0:
            x_off = leaf_w / 2 * (1 - abs(t - 0.5) * 1.5)
            x_off = max(x_off, size * 0.15)
            pts.append((cx - x_off, y))
        else:
            x_off = leaf_w / 2 * 0.4 * (1 - abs(t - 0.5) * 1.2)
            x_off = max(x_off, size * 0.08)
            pts.append((cx - x_off, y))
    if angle != 0:
        pts = rotate_poly(pts, cx, cy, angle)
    return pts


def make_leaf_ovate(cx, cy, size, angle=0, elongation=1.0):
    """Simple ovate leaf — elliptical with pointed tip."""
    pts = []
    n = 16
    w = size * 0.5
    h = size * elongation
    for i in range(n):
        t = i / n
        a = t * 2 * math.pi
        # Modified ellipse with pointed tip (top)
        rx = w * math.sin(a)
        # Sharpen the tip by squaring the cosine for the top half
        if a < math.pi:
            ry = -h * (math.cos(a / 2) ** 1.5)
        else:
            ry = h * 0.4 * (1 - math.cos(a))
        pts.append((cx + rx, cy + ry))
    if angle != 0:
        pts = rotate_poly(pts, cx, cy, angle)
    return pts


def make_leaf_heart(cx, cy, size, angle=0):
    """Heart-shaped leaf (redbud, catalpa)."""
    pts = []
    n = 20
    for i in range(n):
        t = i / n * 2 * math.pi
        # Heart curve parametric
        r = size * 0.5
        x = r * 16 * math.sin(t) ** 3 / 16
        y = -r * (13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)) / 16
        pts.append((cx + x, cy + y * 0.8))
    if angle != 0:
        pts = rotate_poly(pts, cx, cy, angle)
    return pts


def make_leaf_tulip(cx, cy, size, angle=0):
    """Tulip-shaped leaf — 4 lobes with flat/notched tip."""
    pts = []
    # Left side up
    pts.append((cx, cy + size * 0.5))  # base
    pts.append((cx - size * 0.35, cy + size * 0.2))
    pts.append((cx - size * 0.45, cy - size * 0.1))
    pts.append((cx - size * 0.35, cy - size * 0.35))
    # Notched top
    pts.append((cx - size * 0.15, cy - size * 0.42))
    pts.append((cx, cy - size * 0.32))  # notch center
    pts.append((cx + size * 0.15, cy - size * 0.42))
    # Right side down
    pts.append((cx + size * 0.35, cy - size * 0.35))
    pts.append((cx + size * 0.45, cy - size * 0.1))
    pts.append((cx + size * 0.35, cy + size * 0.2))
    pts.append((cx, cy + size * 0.5))
    if angle != 0:
        pts = rotate_poly(pts, cx, cy, angle)
    return pts


def make_leaf_fan(cx, cy, size, angle=0):
    """Fan-shaped ginkgo leaf."""
    pts = []
    # Fan arc
    n = 14
    for i in range(n + 1):
        t = i / n
        a = math.pi * 0.15 + t * math.pi * 0.7
        r = size * 0.5
        pts.append((cx + math.cos(a) * r, cy - math.sin(a) * r))
    # Notch at top center
    mid = len(pts) // 2
    if mid < len(pts):
        pts[mid] = (pts[mid][0], pts[mid][1] + size * 0.12)
    # Stem base
    pts.append((cx, cy + size * 0.15))
    if angle != 0:
        pts = rotate_poly(pts, cx, cy, angle)
    return pts


def make_leaf_needle(cx, cy, length, angle=0):
    """Single pine needle — very thin elongated shape."""
    hw = max(1.5, length * 0.03)
    pts = [
        (cx - hw, cy + length * 0.5),
        (cx, cy - length * 0.5),
        (cx + hw, cy + length * 0.5),
    ]
    if angle != 0:
        pts = rotate_poly(pts, cx, cy, angle)
    return pts


def make_needle_bundle(cx, cy, length, count=3, angle=0):
    """Bundle of pine needles from a single fascicle point."""
    polys = []
    spread = 0.15
    base_angle = angle
    for i in range(count):
        a = base_angle + (i - count / 2) * spread
        polys.append(make_leaf_needle(cx, cy - length * 0.3, length, a))
    return polys


def make_leaf_narrow(cx, cy, size, angle=0):
    """Narrow elongated leaf (willow)."""
    pts = []
    n = 12
    w = size * 0.12
    h = size * 0.9
    for i in range(n):
        t = i / n * 2 * math.pi
        rx = w * math.sin(t)
        ry = h * math.cos(t)
        pts.append((cx + rx, cy + ry))
    if angle != 0:
        pts = rotate_poly(pts, cx, cy, angle)
    return pts


def scatter_leaves_on_branches(num_leaves, spread=0.85):
    """Generate (x, y, angle) positions for leaves along organic branches."""
    positions = []
    # 2-3 main branches radiating from center
    num_branches = random.randint(2, 3)
    for b in range(num_branches):
        branch_angle = (b / num_branches) * 2 * math.pi + random.uniform(-0.3, 0.3)
        branch_len = RADIUS * random.uniform(0.6, spread)
        n_on_branch = num_leaves // num_branches + random.randint(-2, 2)
        for i in range(max(1, n_on_branch)):
            t = (i + 0.3) / max(1, n_on_branch)
            # Position along branch with jitter
            bx = CENTER + math.cos(branch_angle) * branch_len * t
            by = CENTER + math.sin(branch_angle) * branch_len * t
            bx += random.gauss(0, RADIUS * 0.12)
            by += random.gauss(0, RADIUS * 0.12)
            leaf_angle = branch_angle + random.uniform(-0.8, 0.8)
            positions.append((bx, by, leaf_angle))
    # Fill center cluster
    for _ in range(num_leaves // 4):
        a = random.uniform(0, 2 * math.pi)
        r = random.gauss(0, RADIUS * 0.25)
        positions.append((CENTER + math.cos(a) * r, CENTER + math.sin(a) * r,
                         random.uniform(0, 2 * math.pi)))
    return positions


def draw_leaves(draw, positions, leaf_func, colors, size_range=(30, 55)):
    """Draw leaves at given positions using the specified shape function."""
    for x, y, angle in positions:
        sz = random.randint(*size_range)
        color = vary_color(hex_to_rgb(random.choice(colors)), 15)
        pts = leaf_func(x, y, sz, angle)
        if len(pts) >= 3:
            draw.polygon(pts, fill=color + (230 + random.randint(-20, 25),))
            # Subtle darker edge on some leaves
            if random.random() < 0.3:
                darker = tuple(max(0, c - 25) for c in color)
                draw.polygon(pts, outline=darker + (120,))


def draw_compound_leaf(draw, cx, cy, angle, num_leaflets, leaflet_size, colors):
    """Draw a compound pinnate leaf (paired leaflets along a rachis)."""
    rachis_len = leaflet_size * num_leaflets * 0.7
    cos_a, sin_a = math.cos(angle), math.sin(angle)

    # Draw rachis
    x0 = cx - cos_a * rachis_len * 0.1
    y0 = cy - sin_a * rachis_len * 0.1
    x1 = cx + cos_a * rachis_len
    y1 = cy + sin_a * rachis_len
    draw.line([(x0, y0), (x1, y1)], fill=(60, 80, 40, 200), width=2)

    # Draw leaflets
    perp_x, perp_y = -sin_a, cos_a
    for i in range(num_leaflets):
        t = (i + 0.5) / num_leaflets
        lx = cx + cos_a * rachis_len * t
        ly = cy + sin_a * rachis_len * t
        for side in [-1, 1]:
            off = leaflet_size * 0.4 * side
            lx2 = lx + perp_x * off
            ly2 = ly + perp_y * off
            leaflet_angle = angle + side * 0.6
            sz = leaflet_size * (0.6 + 0.4 * (1 - abs(t - 0.5) * 2))
            color = vary_color(hex_to_rgb(random.choice(colors)), 15)
            pts = make_leaf_ovate(lx2, ly2, sz, leaflet_angle, elongation=0.8)
            if len(pts) >= 3:
                draw.polygon(pts, fill=color + (230,))
    # Terminal leaflet
    tx = cx + cos_a * rachis_len
    ty = cy + sin_a * rachis_len
    color = vary_color(hex_to_rgb(random.choice(colors)), 15)
    pts = make_leaf_ovate(tx, ty, leaflet_size * 0.8, angle, elongation=0.9)
    if len(pts) >= 3:
        draw.polygon(pts, fill=color + (230,))


def draw_scale_cluster(draw, cx, cy, size, angle, colors):
    """Draw scale-like foliage (juniper/cypress) — dense tiny overlapping scales."""
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    # Draw a spray of tiny scales along a branchlet
    spray_len = size
    for i in range(int(spray_len / 4)):
        t = i / (spray_len / 4)
        bx = cx + cos_a * spray_len * t
        by = cy + sin_a * spray_len * t
        # Tiny triangular scales on both sides
        for side in [-1, 1]:
            perp_x, perp_y = -sin_a * side, cos_a * side
            sc = 4 + random.randint(0, 3)
            sx = bx + perp_x * sc
            sy = by + perp_y * sc
            color = vary_color(hex_to_rgb(random.choice(colors)), 12)
            pts = [
                (sx, sy),
                (sx + cos_a * sc, sy + sin_a * sc),
                (sx + perp_x * sc * 0.5 + cos_a * sc * 0.5,
                 sy + perp_y * sc * 0.5 + sin_a * sc * 0.5),
            ]
            draw.polygon(pts, fill=color + (220,))


def draw_fine_compound_leaf(draw, cx, cy, angle, size, colors):
    """Draw very fine compound leaf (honeylocust) — tiny leaflets creating lacy texture."""
    rachis_len = size * 1.2
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    perp_x, perp_y = -sin_a, cos_a

    # Draw rachis
    x0 = cx
    y0 = cy
    x1 = cx + cos_a * rachis_len
    y1 = cy + sin_a * rachis_len
    draw.line([(x0, y0), (x1, y1)], fill=(70, 85, 45, 180), width=1)

    # Many tiny leaflets
    num = int(rachis_len / 6)
    for i in range(num):
        t = (i + 0.5) / num
        lx = cx + cos_a * rachis_len * t
        ly = cy + sin_a * rachis_len * t
        for side in [-1, 1]:
            off = 5 * side
            lx2 = lx + perp_x * off
            ly2 = ly + perp_y * off
            color = vary_color(hex_to_rgb(random.choice(colors)), 15)
            # Tiny ellipses
            sz = random.randint(3, 6)
            bbox = [lx2 - sz, ly2 - sz * 0.6, lx2 + sz, ly2 + sz * 0.6]
            draw.ellipse(bbox, fill=color + (210,))


def apply_radial_fade(img):
    """Apply radial alpha fade to make edges blend smoothly on billboards."""
    pixels = img.load()
    for y in range(SIZE):
        for x in range(SIZE):
            dx = (x - CENTER) / RADIUS
            dy = (y - CENTER) / RADIUS
            d = math.sqrt(dx * dx + dy * dy)
            if d > 0.75:
                fade = max(0, 1.0 - (d - 0.75) / 0.25)
                r, g, b, a = pixels[x, y]
                pixels[x, y] = (r, g, b, int(a * fade))
    return img


def generate_texture(leaf_type, colors):
    """Generate a leaf cluster texture for the given type."""
    random.seed(hash(leaf_type) + 42)  # Deterministic per type

    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw thin branches first (behind leaves)
    branch_color = (75, 55, 38, 180)
    num_branches = random.randint(3, 5)
    for b in range(num_branches):
        angle = (b / num_branches) * 2 * math.pi + random.uniform(-0.3, 0.3)
        length = RADIUS * random.uniform(0.5, 0.85)
        # Organic curve via midpoint displacement
        x0, y0 = CENTER, CENTER
        x1 = CENTER + math.cos(angle) * length
        y1 = CENTER + math.sin(angle) * length
        mx = (x0 + x1) / 2 + random.gauss(0, length * 0.1)
        my = (y0 + y1) / 2 + random.gauss(0, length * 0.1)
        draw.line([(x0, y0), (mx, my), (x1, y1)], fill=branch_color, width=3)
        # Sub-branches
        for s in range(random.randint(1, 3)):
            t = random.uniform(0.3, 0.8)
            sx = x0 + (x1 - x0) * t + random.gauss(0, 10)
            sy = y0 + (y1 - y0) * t + random.gauss(0, 10)
            sub_angle = angle + random.uniform(-0.8, 0.8)
            sub_len = length * random.uniform(0.2, 0.4)
            ex = sx + math.cos(sub_angle) * sub_len
            ey = sy + math.sin(sub_angle) * sub_len
            draw.line([(sx, sy), (ex, ey)], fill=branch_color, width=2)

    # Draw leaves based on type
    if leaf_type == 'palmate':
        positions = scatter_leaves_on_branches(22, 0.82)
        draw_leaves(draw, positions, make_leaf_maple, colors, (28, 48))

    elif leaf_type == 'lobed':
        positions = scatter_leaves_on_branches(18, 0.80)
        draw_leaves(draw, positions, make_leaf_oak, colors, (32, 52))

    elif leaf_type == 'compound':
        # Compound leaves: fewer but each is a multi-leaflet structure
        for _ in range(10):
            a = random.uniform(0, 2 * math.pi)
            r = random.gauss(0, RADIUS * 0.4)
            cx = CENTER + math.cos(a) * abs(r)
            cy = CENTER + math.sin(a) * abs(r)
            angle = a + random.uniform(-0.5, 0.5)
            draw_compound_leaf(draw, cx, cy, angle, random.randint(5, 9),
                             random.randint(14, 22), colors)

    elif leaf_type == 'ovate_large':
        positions = scatter_leaves_on_branches(24, 0.82)
        draw_leaves(draw, positions, lambda cx, cy, sz, a: make_leaf_ovate(cx, cy, sz, a, 1.1),
                   colors, (30, 50))

    elif leaf_type == 'ovate_small':
        positions = scatter_leaves_on_branches(40, 0.85)
        draw_leaves(draw, positions, lambda cx, cy, sz, a: make_leaf_ovate(cx, cy, sz, a, 0.9),
                   colors, (16, 30))

    elif leaf_type == 'heart':
        positions = scatter_leaves_on_branches(20, 0.80)
        draw_leaves(draw, positions, make_leaf_heart, colors, (28, 45))

    elif leaf_type == 'tulip':
        positions = scatter_leaves_on_branches(20, 0.80)
        draw_leaves(draw, positions, make_leaf_tulip, colors, (30, 50))

    elif leaf_type == 'fan':
        positions = scatter_leaves_on_branches(28, 0.82)
        draw_leaves(draw, positions, make_leaf_fan, colors, (24, 42))

    elif leaf_type == 'palmate_compound':
        # Palmate compound: 5-7 leaflets radiating from a point
        for _ in range(14):
            a = random.uniform(0, 2 * math.pi)
            r = random.gauss(0, RADIUS * 0.35)
            cx = CENTER + math.cos(a) * abs(r)
            cy = CENTER + math.sin(a) * abs(r)
            base_angle = random.uniform(0, 2 * math.pi)
            num_leaflets = random.randint(5, 7)
            for j in range(num_leaflets):
                la = base_angle + (j / num_leaflets) * math.pi - math.pi / 2
                dist = random.randint(15, 25)
                lx = cx + math.cos(la) * dist
                ly = cy + math.sin(la) * dist
                color = vary_color(hex_to_rgb(random.choice(colors)), 15)
                sz = random.randint(18, 28)
                pts = make_leaf_ovate(lx, ly, sz, la, 1.2)
                if len(pts) >= 3:
                    draw.polygon(pts, fill=color + (230,))

    elif leaf_type == 'long_needle':
        # Pine: bundles of needles
        for _ in range(35):
            a = random.uniform(0, 2 * math.pi)
            r = abs(random.gauss(0, RADIUS * 0.4))
            cx = CENTER + math.cos(a) * r
            cy = CENTER + math.sin(a) * r
            bundle_angle = a + random.uniform(-0.5, 0.5)
            bundles = make_needle_bundle(cx, cy, random.randint(35, 60),
                                        count=random.randint(2, 5), angle=bundle_angle)
            for needle_pts in bundles:
                color = vary_color(hex_to_rgb(random.choice(colors)), 12)
                draw.polygon(needle_pts, fill=color + (220,))

    elif leaf_type == 'short_needle':
        # Spruce: flat sprays of short needles along twigs
        for _ in range(18):
            a = random.uniform(0, 2 * math.pi)
            r = abs(random.gauss(0, RADIUS * 0.4))
            cx = CENTER + math.cos(a) * r
            cy = CENTER + math.sin(a) * r
            spray_angle = a + random.uniform(-0.3, 0.3)
            cos_s, sin_s = math.cos(spray_angle), math.sin(spray_angle)
            spray_len = random.randint(40, 70)
            # Draw twig
            draw.line([(cx, cy), (cx + cos_s * spray_len, cy + sin_s * spray_len)],
                     fill=(60, 70, 40, 180), width=2)
            # Needles perpendicular to twig
            for i in range(int(spray_len / 4)):
                t = i / (spray_len / 4)
                nx = cx + cos_s * spray_len * t
                ny = cy + sin_s * spray_len * t
                needle_len = random.randint(8, 16)
                for side in [-1, 1]:
                    perp_angle = spray_angle + math.pi / 2 * side + random.uniform(-0.2, 0.2)
                    ex = nx + math.cos(perp_angle) * needle_len
                    ey = ny + math.sin(perp_angle) * needle_len
                    color = vary_color(hex_to_rgb(random.choice(colors)), 10)
                    draw.line([(nx, ny), (ex, ey)], fill=color + (210,), width=2)

    elif leaf_type == 'scale':
        # Dense scale-like foliage
        for _ in range(25):
            a = random.uniform(0, 2 * math.pi)
            r = abs(random.gauss(0, RADIUS * 0.4))
            cx = CENTER + math.cos(a) * r
            cy = CENTER + math.sin(a) * r
            spray_angle = a + random.uniform(-0.5, 0.5)
            draw_scale_cluster(draw, cx, cy, random.randint(30, 55), spray_angle, colors)

    elif leaf_type == 'narrow':
        # Willow: many narrow hanging leaves
        positions = scatter_leaves_on_branches(55, 0.85)
        draw_leaves(draw, positions, make_leaf_narrow, colors, (25, 45))

    elif leaf_type == 'fine_compound':
        # Very fine compound foliage
        for _ in range(16):
            a = random.uniform(0, 2 * math.pi)
            r = abs(random.gauss(0, RADIUS * 0.4))
            cx = CENTER + math.cos(a) * r
            cy = CENTER + math.sin(a) * r
            angle = a + random.uniform(-0.5, 0.5)
            draw_fine_compound_leaf(draw, cx, cy, angle, random.randint(40, 65), colors)

    # Apply radial fade and slight blur for softer edges
    img = apply_radial_fade(img)
    img = img.filter(ImageFilter.GaussianBlur(radius=1.0))

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(os.path.join(PROJECT_DIR, 'src', 'data', 'leafTypes.json')) as f:
        data = json.load(f)

    for lt in data['types']:
        type_id = lt['id']
        colors = lt['colors']
        filename = lt['texture']

        print(f'Generating {filename}...')
        img = generate_texture(type_id, colors)

        out_path = os.path.join(OUT_DIR, filename)
        img.save(out_path, 'PNG')
        print(f'  Saved {out_path} ({img.size[0]}x{img.size[1]})')

    print(f'\nDone! Generated {len(data["types"])} leaf textures in {OUT_DIR}')


if __name__ == '__main__':
    main()
