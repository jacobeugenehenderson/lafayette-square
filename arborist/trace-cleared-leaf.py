#!/usr/bin/env python3
"""trace-cleared-leaf.py — TRACE a real leaf's vein network. Measure; never interpret.

Input: a photograph of a cleared, stained leaf (assets/cleared-leaves/<Genus_species>/*.jpg —
Wilf et al. 2021, CC BY 4.0). Every step is a fixed image operation, the same image in → the same
graph out:
  1. LEAF — the stain separates tissue from slide: per pixel, the channel contrast that best
     splits the image in two (Otsu), largest connected piece, holes filled.
  2. VEINS — ridges of the stain inside the leaf (Sato ridge filter over a range of widths),
     thresholded, cleaned of specks, thinned to a one-pixel SKELETON.
  3. WIDTH — at every skeleton pixel, twice its distance to the nearest non-vein pixel.
  4. GRAPH — skeleton pixels with ≠2 neighbours are NODES (junctions, ends); the pixel runs
     between them are EDGES, each with its length and width profile.
  5. BASE — the stalk end: the graph end-node with the widest vein.
  6. SCALE — the ruler, if the frame carries one: a long straight dark line with evenly spaced
     ticks; tick spacing = 1 cm. ⛔ Not found ⇒ px_per_cm is null and the report says so.
Output (next to --out): <name>.trace.png (the image with the trace over it, for the eye) and
<name>.trace.json (outline, nodes, edges with widths, base, scale, and measured statistics).

  arborist/.venv/bin/python arborist/trace-cleared-leaf.py assets/cleared-leaves/Acer_rubrum/*.jpg --out scratch/leaf-trace
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import filters, morphology, measure

Image.MAX_IMAGE_PIXELS = None


def load(path, max_side):
    im = Image.open(path).convert('RGB')
    s = min(1.0, max_side / max(im.size))
    if s < 1: im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0, s


def leaf_mask(rgb):
    """The feature that splits the image most cleanly into two classes wins; the leaf is the
    largest connected piece of the stained class, holes filled."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    feats = {'saturation': (mx - mn) / (mx + 1e-6), 'redness': r - (g + b) / 2, 'darkness': 1 - (r + g + b) / 3}
    best = None
    for name, f in feats.items():
        t = filters.threshold_otsu(f)
        a, b_ = f[f <= t], f[f > t]
        if len(a) == 0 or len(b_) == 0: continue
        sep = (a.mean() - b_.mean()) ** 2 * len(a) * len(b_) / f.size ** 2 / (f.var() + 1e-9)
        if best is None or sep > best[0]: best = (sep, name, f, t)
    _, name, f, t = best
    m = f > t
    m = morphology.binary_opening(m, morphology.disk(2))
    lab = measure.label(m)
    if lab.max() == 0: raise SystemExit('⛔ no leaf found')
    # the leaf is the biggest piece that does not touch the image border (the slide frame does)
    props = sorted(measure.regionprops(lab), key=lambda p: -p.area)
    H, W = m.shape
    pick = next((p for p in props if p.bbox[0] > 0 and p.bbox[1] > 0 and p.bbox[2] < H and p.bbox[3] < W), props[0])
    leaf = ndi.binary_fill_holes(lab == pick.label)
    leaf = morphology.binary_closing(leaf, morphology.disk(3))
    return ndi.binary_fill_holes(leaf), name, f


def veins(rgb, leaf, feat):
    """Ridges of the stain inside the leaf: the veins are narrow lines MORE stained than the
    tissue between them."""
    inside = np.where(leaf, feat, np.median(feat[leaf]))
    sig = inside - ndi.uniform_filter(inside, 41)            # local contrast, not the leaf's overall tone
    ridge = filters.sato(sig, sigmas=[0.7, 1, 1.5, 2, 3, 5, 8], black_ridges=False)
    ridge[~morphology.binary_erosion(leaf, morphology.disk(3))] = 0
    # HYSTERESIS: strong ridges seed the network; a weaker ridge counts only if it CONNECTS to it —
    # a vein is a vein because it is part of the supply network (the functional rule, measured)
    hi = filters.threshold_otsu(ridge[leaf])
    lo = np.percentile(ridge[leaf], 40)
    v = filters.apply_hysteresis_threshold(ridge, min(lo, hi * 0.9), hi)
    v = morphology.remove_small_objects(v, 64)
    return v, ridge


def graph(skel, width):
    """Nodes = skeleton pixels with ≠2 neighbours (8-connected); edges = pixel runs between them."""
    K = np.ones((3, 3), int); K[1, 1] = 0
    nb = ndi.convolve(skel.astype(int), K, mode='constant') * skel
    nodes_mask = skel & (nb != 2)
    nlab, nn = ndi.label(nodes_mask, structure=np.ones((3, 3)))
    ys, xs = np.nonzero(skel)
    index = {(y, x): i for i, (y, x) in enumerate(zip(ys, xs))}
    nodes = []
    for k, sl in enumerate(ndi.find_objects(nlab), start=1):
        yy, xx = np.nonzero(nlab[sl] == k)
        nodes.append({'y': float(yy.mean() + sl[0].start), 'x': float(xx.mean() + sl[1].start),
                      'deg': 0, 'width': float(width[yy + sl[0].start, xx + sl[1].start].max())})
    visited = np.zeros(skel.shape, bool)
    edges = []
    offs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    H, W = skel.shape
    for y0, x0 in zip(*np.nonzero(nodes_mask)):
        y0, x0 = int(y0), int(x0)
        for dy, dx in offs:
            y, x = y0 + dy, x0 + dx
            if not (0 <= y < H and 0 <= x < W) or not skel[y, x] or nodes_mask[y, x] or visited[y, x]: continue
            path = [(y0, x0), (y, x)]; visited[y, x] = True; py, px = y0, x0
            while True:
                nxt = None
                for ey, ex in offs:
                    qy, qx = y + ey, x + ex
                    if (qy, qx) == (py, px) or not (0 <= qy < H and 0 <= qx < W) or not skel[qy, qx]: continue
                    if nodes_mask[qy, qx] and (qy, qx) != (y0, x0) or (nodes_mask[qy, qx] and len(path) > 2):
                        nxt = (qy, qx, True); break
                    if not visited[qy, qx] and not nodes_mask[qy, qx]:
                        nxt = (qy, qx, False)
                if nxt is None: break
                py, px, (y, x) = y, x, (int(nxt[0]), int(nxt[1]))
                path.append((y, x))
                if nxt[2]: break
                visited[y, x] = True
            a, b = nlab[path[0]], nlab[path[-1]]
            if b == 0: continue
            pts = np.array(path, float)
            ln = float(np.sum(np.hypot(*np.diff(pts, axis=0).T)))
            ws = [float(width[p]) for p in path]
            edges.append({'a': int(a) - 1, 'b': int(b) - 1, 'length': ln, 'width': float(np.median(ws)),
                          'pts': [[float(p[1]), float(p[0])] for p in path[:: max(1, len(path) // 24)]] + [[float(path[-1][1]), float(path[-1][0])]]})
    for e in edges:
        nodes[e['a']]['deg'] += 1; nodes[e['b']]['deg'] += 1
    return nodes, edges


def scale_bar(rgb, leaf):
    """The ruler: a long, thin, straight dark line (not the slide's thick frame) crossed by short
    ticks at an even spacing. Tick spacing in px = one centimetre. Returns (px_per_cm, where) or
    (None, why)."""
    lum = rgb.mean(-1)
    dark = (lum < 0.55) & ~ndi.binary_dilation(leaf, morphology.disk(25))
    # the slide's frame is a broad dark band; a ruler's line is at most ~2 dozen px across
    thick = ndi.binary_opening(dark, np.ones((25, 25)))
    dark &= ~ndi.binary_dilation(thick, np.ones((5, 5)))
    H, W = dark.shape
    L = max(150, min(H, W) // 6)
    best = None
    for vertical in (True, False):
        lines = ndi.binary_opening(dark, np.ones((L, 1)) if vertical else np.ones((1, L)))
        lab, n = ndi.label(lines)
        for k, sl in enumerate(ndi.find_objects(lab), start=1):
            span = (sl[0].stop - sl[0].start) if vertical else (sl[1].stop - sl[1].start)
            thickness = (sl[1].stop - sl[1].start) if vertical else (sl[0].stop - sl[0].start)
            if thickness > 24: continue
            c = (sl[1].start + sl[1].stop) // 2 if vertical else (sl[0].start + sl[0].stop) // 2
            a0, a1 = (sl[0].start, sl[0].stop) if vertical else (sl[1].start, sl[1].stop)
            # tick rows: a perpendicular dark run of ≥ 10 px leaving the line, either side
            ticks = []
            for t in range(a0, a1):
                for sgn in (1, -1):
                    run = 0
                    for o in range(thickness + 2, 60):
                        q = c + sgn * o
                        if not (0 <= q < (W if vertical else H)): break
                        if (dark[t, q] if vertical else dark[q, t]): run += 1
                        elif run: break
                    if run >= 10: ticks.append(t); break
            if len(ticks) < 3: continue
            groups = [[ticks[0]]]
            for t in ticks[1:]:
                (groups[-1].append(t) if t - groups[-1][-1] <= 3 else groups.append([t]))
            centers = np.array([np.mean(g) for g in groups])
            if len(centers) < 3: continue
            gaps = np.diff(centers)
            cv = gaps.std() / gaps.mean()
            if cv > 0.15: continue
            score = len(centers) * span
            if best is None or score > best[0]:
                best = (score, float(np.median(gaps)), ('column' if vertical else 'row', int(c), int(a0), int(a1)), len(centers))
    return (best[1], best[2]) if best else (None, 'no thin ruler with ≥3 evenly spaced ticks')

def trace(path, out, max_side):
    rgb, s = load(path, max_side)
    leaf, feat_name, feat = leaf_mask(rgb)
    v, ridge = veins(rgb, leaf, feat)
    width = 2 * ndi.distance_transform_edt(v)
    skel = morphology.skeletonize(v)
    skel = morphology.remove_small_objects(skel, 12, connectivity=2)
    nodes, edges = graph(skel, width)
    ends = [i for i, n in enumerate(nodes) if n['deg'] == 1]
    # the stalk: the leaf's THIN ARM — what a round brush the size of a small fraction of the leaf
    # cannot reach (an opening) — its largest piece; the tip is its point farthest from the blade
    r = max(6, int(0.04 * np.sqrt(leaf.sum())))
    blade = ndi.binary_opening(leaf, morphology.disk(r))
    arms, na = ndi.label(leaf & ~blade)
    if na == 0: raise SystemExit('⛔ no stalk found — the leaf has no thin arm')
    arm = arms == (np.argmax(np.bincount(arms.ravel())[1:]) + 1)
    dblade = ndi.distance_transform_edt(~blade)
    by, bx = np.unravel_index(np.argmax(np.where(arm, dblade, -1)), dblade.shape)
    base_px = [float(bx), float(by)]
    base = min(range(len(nodes)), key=lambda i: (nodes[i]['x'] - bx) ** 2 + (nodes[i]['y'] - by) ** 2) if nodes else None
    px_cm, where = scale_bar(rgb, leaf)
    area_px = float(leaf.sum())
    vlen = float(skel.sum())
    areoles = int(measure.label(leaf & ~ndi.binary_dilation(v, morphology.disk(1))).max())
    contour = max(measure.find_contours(leaf.astype(float), 0.5), key=len)
    outline = [[round(float(p[1]), 1), round(float(p[0]), 1)] for p in contour[:: max(1, len(contour) // 600)]]
    stats = {
        'leaf_area_px': area_px, 'vein_length_px': vlen,
        'vein_density_per_px': vlen / area_px,
        'nodes': len(nodes), 'junctions': sum(1 for n in nodes if n['deg'] >= 3), 'ends': len(ends), 'edges': len(edges),
        'areoles': areoles,
    }
    if px_cm:
        stats.update({'leaf_area_cm2': area_px / px_cm ** 2, 'vein_density_mm_per_mm2': (vlen / px_cm * 10) / (area_px / px_cm ** 2 * 100)})
    name = os.path.splitext(os.path.basename(path))[0]
    rec = {'source': path, 'downscale': s, 'leaf_feature': feat_name, 'px_per_cm': px_cm,
           'scale': where if px_cm else None, 'scale_missing_because': None if px_cm else where,
           'base_node': base, 'base_px': base_px, 'stats': stats, 'outline': outline, 'nodes': nodes, 'edges': edges}
    os.makedirs(out, exist_ok=True)
    json.dump(rec, open(os.path.join(out, name + '.trace.json'), 'w'))
    # the picture for the eye: faded original, outline in cyan, veins drawn at their measured width
    im = Image.fromarray((rgb * 255 * 0.45 + 255 * 0.55).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.line([tuple(p) for p in outline] + [tuple(outline[0])], fill=(0, 170, 200), width=2)
    wmax = max((e['width'] for e in edges), default=1)
    for e in sorted(edges, key=lambda e: e['width']):
        t = min(1, e['width'] / wmax)
        col = (int(40 + 180 * t), int(90 * (1 - t)), int(160 * (1 - t)))
        d.line([tuple(p) for p in e['pts']], fill=col, width=max(1, round(e['width'])))
    d.ellipse([base_px[0] - 16, base_px[1] - 16, base_px[0] + 16, base_px[1] + 16], outline=(0, 160, 0), width=5)
    if px_cm:
        kind, idx, lo, hi = where
        seg = [(idx, lo), (idx, hi)] if kind == 'column' else [(lo, idx), (hi, idx)]
        d.line(seg, fill=(240, 150, 0), width=5)
    im.save(os.path.join(out, name + '.trace.png'))
    return name, rec


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('images', nargs='+')
    ap.add_argument('--out', required=True)
    ap.add_argument('--max-side', type=int, default=5000)
    a = ap.parse_args()
    for p in a.images:
        name, rec = trace(p, a.out, a.max_side)
        st = rec['stats']
        print(f"{name}: leaf by {rec['leaf_feature']} · {st['junctions']} junctions · {st['ends']} ends · {st['areoles']} areoles · "
              + (f"{rec['px_per_cm']:.1f} px/cm · {st['leaf_area_cm2']:.1f} cm² · veins {st['vein_density_mm_per_mm2']:.2f} mm/mm²" if rec['px_per_cm'] else f"⛔ no scale — {rec['scale_missing_because']}"))
