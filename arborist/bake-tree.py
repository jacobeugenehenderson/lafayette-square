#!/usr/bin/env python3
"""
bake-tree.py — bake one species' saved seedlings into runtime variants.

For each seedling in arborist/state/<species>/seedlings.json:
  1. Load .laz point cloud (laspy + lazrs).
  2. Voxel downsample (numpy histogram).
  3. Extract a skeleton via Z-slab DBSCAN-style clustering + parent linking.
  4. Build a cylinder graph (one cylinder per parent→child edge).
  5. Trim sub-threshold cylinders. Mesh cylinders → unified trimesh.
  6. Extract leaf-tip world positions.
  7. Export public/trees/<species>/skeleton-N.glb + tips-N.json.

After all seedlings bake, write public/trees/<species>/manifest.json and
update public/trees/index.json.

This is a SIMPLIFIED skeleton extraction — not full TreeQSM (Raumonen 2013).
It's tuned for "visually correct urban-park tree silhouettes," not
scientific accuracy. Acceptable for v1; swap a real QSM in later without
changing the artifact contract.

Usage:
    arborist/.venv/bin/python arborist/bake-tree.py --species=acer_saccharum
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import laspy
import numpy as np
import trimesh
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree


# ── Paths ────────────────────────────────────────────────────────────────
HERE = Path(__file__).parent
ROOT = HERE.parent
STATE_DIR = HERE / "state"
TREES_DIR = ROOT / "public" / "trees"
SPECIES_MAP = HERE / "species-map.json"
CONFIG_PATH = HERE / "config.json"


def log(*args):
    print(*args, flush=True)


# ── Pipeline ─────────────────────────────────────────────────────────────

def load_pointcloud(laz_path):
    """Load .laz, return Nx3 float64 array centered: XY median = 0, Z min = 0."""
    las = laspy.read(str(laz_path))
    pts = np.column_stack((las.x, las.y, las.z)).astype(np.float64)
    pts[:, 0] -= np.median(pts[:, 0])
    pts[:, 1] -= np.median(pts[:, 1])
    pts[:, 2] -= pts[:, 2].min()
    return pts


def voxel_downsample(pts, voxel):
    """Drop duplicate points within `voxel` (meters). Reduces ~80k pts → ~10–20k
    for a typical TLS tree at voxel=0.03. Each output point is the centroid of
    its source voxel."""
    keys = np.floor(pts / voxel).astype(np.int64)
    # Hash 3D voxel indices into a single int64 key for grouping.
    h = keys[:, 0] * 73856093 ^ keys[:, 1] * 19349663 ^ keys[:, 2] * 83492791
    order = np.argsort(h)
    pts_sorted = pts[order]
    h_sorted = h[order]
    # Find boundaries between voxels
    diff = np.diff(h_sorted, prepend=h_sorted[0] - 1)
    boundaries = np.where(diff != 0)[0]
    boundaries = np.append(boundaries, len(h_sorted))
    centroids = []
    for i in range(len(boundaries) - 1):
        s, e = boundaries[i], boundaries[i + 1]
        centroids.append(pts_sorted[s:e].mean(axis=0))
    return np.array(centroids) if centroids else np.empty((0, 3))


def cluster_slab(xy, eps, min_samples):
    """Connected-components clustering in 2D (a single Z slab). Returns
    labels (int per point); -1 = noise (component too small to be a branch).

    Equivalent to DBSCAN with min_samples but we don't need the
    core-point distinction — branch cross-sections are dense enough that
    full connected-components matches DBSCAN cluster boundaries."""
    if len(xy) < min_samples:
        return np.full(len(xy), -1)
    tree = cKDTree(xy)
    pairs = tree.query_pairs(r=eps, output_type='ndarray')
    if len(pairs) == 0:
        return np.full(len(xy), -1)
    n = len(xy)
    rows = np.concatenate([pairs[:, 0], pairs[:, 1]])
    cols = np.concatenate([pairs[:, 1], pairs[:, 0]])
    data = np.ones(len(rows))
    graph = csr_matrix((data, (rows, cols)), shape=(n, n))
    _, labels = connected_components(graph, directed=False)
    counts = np.bincount(labels)
    return np.where(counts[labels] >= min_samples, labels, -1)


def extract_skeleton(pts, slab=0.4, eps=0.10, min_samples=4, link_max=0.8):
    """Build a node-and-edge skeleton via Z-slab clustering + parent linking.

    For each Z slab:
      - cluster the slab's XY points
      - each cluster → a node at (cluster_xy_centroid, slab_z_mid),
        with radius = cluster's XY std-dev (cylinder cross section)

    Each node above the bottom slab finds its parent: the nearest node in
    any lower slab within `link_max` Euclidean distance. Nodes with no
    valid parent are dropped (orphan branches — usually scan noise).

    Returns:
      nodes: list of {pos: (x,y,z), radius: float, slab_idx: int}
      edges: list of (parent_idx, child_idx)
    """
    z_min, z_max = pts[:, 2].min(), pts[:, 2].max()
    n_slabs = max(2, int(np.ceil((z_max - z_min) / slab)))
    z_edges = np.linspace(z_min, z_max, n_slabs + 1)

    nodes = []
    slab_to_node_indices = []  # nodes[] indices grouped by slab
    for i in range(n_slabs):
        z0, z1 = z_edges[i], z_edges[i + 1]
        mask = (pts[:, 2] >= z0) & (pts[:, 2] < z1)
        slab_pts = pts[mask]
        if len(slab_pts) < min_samples:
            slab_to_node_indices.append([])
            continue
        labels = cluster_slab(slab_pts[:, :2], eps=eps, min_samples=min_samples)
        slab_z = (z0 + z1) / 2
        idxs = []
        for label in np.unique(labels):
            if label < 0:
                continue
            cmask = labels == label
            cluster_xy = slab_pts[cmask, :2]
            centroid = cluster_xy.mean(axis=0)
            # Branch-cross-section radius — half the larger XY std works
            # well as a proxy. Floor at 1cm so noise doesn't produce
            # zero-radius cylinders that crash trimesh.
            r = max(0.01, float(np.std(cluster_xy, axis=0).mean()))
            nodes.append({
                "pos": np.array([centroid[0], centroid[1], slab_z]),
                "radius": r,
                "slab": i,
            })
            idxs.append(len(nodes) - 1)
        slab_to_node_indices.append(idxs)

    # Parent linking: for each node, find nearest node in any LOWER slab
    # within link_max. Build edges.
    edges = []
    for ci, node in enumerate(nodes):
        slab_i = node["slab"]
        if slab_i == 0:
            # Bottom slab — no parent. Treat as trunk root candidate.
            continue
        # Search slabs from i-1 down to 0
        best_parent = -1
        best_d = link_max
        for sj in range(slab_i - 1, -1, -1):
            for pj in slab_to_node_indices[sj]:
                d = float(np.linalg.norm(nodes[pj]["pos"] - node["pos"]))
                if d < best_d:
                    best_d = d
                    best_parent = pj
            # Don't search lower slabs once we found a good parent in slab_i-1
            if best_parent >= 0 and sj == slab_i - 1:
                break
        if best_parent >= 0:
            edges.append((best_parent, ci))
    return nodes, edges


def build_cylinder_mesh(nodes, edges, min_radius=0.005, sections=6):
    """One tapered cylinder per edge. Merge into a single trimesh.

    Tapered means the cylinder transitions from parent.radius to child.radius
    along its length — gives a more believable branch shape than uniform
    cylinders. trimesh doesn't have native taper, so we build per-cylinder
    with the *child* radius (branches are mostly characterized by their
    child end at this resolution) and skip true taper as a v1 simplification.

    Drops cylinders whose radius is below min_radius (twigs that produce
    unstable mesh).
    """
    geos = []
    for parent_i, child_i in edges:
        p = nodes[parent_i]
        c = nodes[child_i]
        # Use the smaller of parent/child radius for the cylinder. The
        # parent end is normally fatter, but we want branches to taper
        # outward — cylinders that LOOK like the leaf end.
        radius = min(p["radius"], c["radius"])
        if radius < min_radius:
            continue
        axis = c["pos"] - p["pos"]
        length = float(np.linalg.norm(axis))
        if length < 1e-3:
            continue
        cyl = trimesh.creation.cylinder(
            radius=radius, height=length, sections=sections,
        )
        # cylinder is along +Z, centered at origin. Move + rotate so it
        # spans p.pos → c.pos.
        z_axis = np.array([0, 0, 1.0])
        target_axis = axis / length
        # Rodrigues-style rotation axis = z × target
        v = np.cross(z_axis, target_axis)
        s = float(np.linalg.norm(v))
        cdot = float(np.dot(z_axis, target_axis))
        if s < 1e-9:
            # Already aligned (target is +Z) or anti-aligned (-Z)
            R = np.eye(3) if cdot > 0 else np.diag([1.0, -1.0, -1.0])
        else:
            vx = np.array([
                [0, -v[2], v[1]],
                [v[2], 0, -v[0]],
                [-v[1], v[0], 0],
            ])
            R = np.eye(3) + vx + (vx @ vx) * ((1 - cdot) / (s * s))
        T = np.eye(4)
        T[:3, :3] = R
        T[:3, 3] = (p["pos"] + c["pos"]) / 2.0
        cyl.apply_transform(T)
        geos.append(cyl)
    if not geos:
        return None
    return trimesh.util.concatenate(geos)


def extract_tips(nodes, edges, tip_radius=0.03):
    """Branch endpoints — nodes that have a parent but no children, AND
    whose parent edge has radius below tip_radius. Returns Nx3 array of
    leaf-attachment positions."""
    has_child = set()
    has_parent_with_radius = {}
    for parent_i, child_i in edges:
        has_child.add(parent_i)
        cradius = min(nodes[parent_i]["radius"], nodes[child_i]["radius"])
        has_parent_with_radius[child_i] = cradius
    tips = []
    for ci, node in enumerate(nodes):
        if ci in has_child:
            continue  # not a tip — has at least one child
        if ci not in has_parent_with_radius:
            continue  # orphan — no parent, skip
        if has_parent_with_radius[ci] <= tip_radius:
            tips.append(node["pos"].tolist())
    return np.array(tips, dtype=np.float32) if tips else np.empty((0, 3), dtype=np.float32)


def bake_one(seedling, params, out_dir, variant_idx):
    """Run the full pipeline on one seedling. Writes skeleton-N.glb and
    tips-N.json. Returns a stats dict for the manifest."""
    src = ROOT / seedling["sourceFile"]
    if not src.exists():
        raise FileNotFoundError(f"source file missing: {src}")
    t0 = time.time()
    pts_raw = load_pointcloud(src)
    log(f"  [{seedling['treeId']}] loaded {len(pts_raw):,} pts")
    pts = voxel_downsample(pts_raw, voxel=params["voxelSize"])
    log(f"  [{seedling['treeId']}] downsampled to {len(pts):,} pts (voxel={params['voxelSize']}m)")
    nodes, edges = extract_skeleton(pts)
    log(f"  [{seedling['treeId']}] skeleton: {len(nodes)} nodes, {len(edges)} edges")
    mesh = build_cylinder_mesh(nodes, edges, min_radius=params["minRadius"])
    if mesh is None:
        raise RuntimeError(f"no cylinders survived min_radius={params['minRadius']}")
    log(f"  [{seedling['treeId']}] mesh: {len(mesh.vertices):,} verts, {len(mesh.faces):,} faces")
    tips = extract_tips(nodes, edges, tip_radius=params["tipRadius"])
    log(f"  [{seedling['treeId']}] tips: {len(tips):,}")
    glb_name = f"skeleton-{variant_idx}.glb"
    tips_name = f"tips-{variant_idx}.json"
    mesh.export(out_dir / glb_name, file_type="glb")
    with open(out_dir / tips_name, "w") as f:
        json.dump({
            "treeId": seedling["treeId"],
            "count": len(tips),
            "tips": tips.tolist(),
        }, f)
    elapsed = time.time() - t0
    log(f"  [{seedling['treeId']}] wrote {glb_name} + {tips_name} in {elapsed:.1f}s")
    return {
        "id": variant_idx,
        "treeId": seedling["treeId"],
        "treeH": seedling.get("treeH"),
        "sourceFile": seedling["sourceFile"],
        "skeleton": glb_name,
        "tips": tips_name,
        "tuneParams": params,
        "stats": {
            "nodes": len(nodes),
            "edges": len(edges),
            "verts": len(mesh.vertices),
            "faces": len(mesh.faces),
            "tipCount": int(len(tips)),
        },
    }


# ── CLI / orchestration ──────────────────────────────────────────────────

def update_index(species_id, decl, variant_count):
    """Add or update this species's row in public/trees/index.json."""
    idx_path = TREES_DIR / "index.json"
    idx = json.load(open(idx_path)) if idx_path.exists() else {"species": []}
    row = {
        "id": species_id,
        "label": decl["label"],
        "scientific": decl["scientific"],
        "tier": decl["tier"],
        "leafMorph": decl["leafMorph"],
        "barkMorph": decl.get("barkMorph"),
        "deciduous": decl.get("deciduous"),
        "hasFlowers": decl.get("hasFlowers"),
        "variants": variant_count,
        "bakedAt": int(time.time() * 1000),
    }
    others = [s for s in idx.get("species", []) if s.get("id") != species_id]
    idx["species"] = others + [row]
    idx["species"].sort(key=lambda s: s["label"])
    with open(idx_path, "w") as f:
        json.dump(idx, f, indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--species", required=True)
    args = ap.parse_args()

    species_map = json.load(open(SPECIES_MAP))["species"]
    decl = species_map.get(args.species)
    if not decl:
        log(f"unknown species: {args.species}")
        return 2

    seedlings_path = STATE_DIR / args.species / "seedlings.json"
    if not seedlings_path.exists():
        log(f"no seedlings saved for {args.species} — pick some in the workstage first")
        return 2
    seedlings = json.load(open(seedlings_path))["seedlings"]
    if not seedlings:
        log(f"empty seedling list for {args.species}")
        return 2

    config = json.load(open(CONFIG_PATH))
    default_tune = config.get("tuneDefaults", {})

    out_dir = TREES_DIR / args.species
    out_dir.mkdir(parents=True, exist_ok=True)

    log(f"baking {args.species} ({decl['label']}): {len(seedlings)} seedlings")
    variants_meta = []
    failures = []
    t_all = time.time()
    for s in seedlings:
        params = {**default_tune, **s.get("tuneParams", {})}
        try:
            variants_meta.append(bake_one(s, params, out_dir, s["id"]))
        except Exception as e:
            log(f"  [{s.get('treeId')}] FAILED: {type(e).__name__}: {e}")
            failures.append({"treeId": s.get("treeId"), "error": str(e)})

    if not variants_meta:
        log("all seedlings failed; not writing manifest")
        return 1

    manifest = {
        "species":    args.species,
        "label":      decl["label"],
        "scientific": decl["scientific"],
        "tier":       decl["tier"],
        "leafMorph":  decl["leafMorph"],
        "barkMorph":  decl.get("barkMorph"),
        "deciduous":  decl.get("deciduous"),
        "hasFlowers": decl.get("hasFlowers"),
        "tints":      decl.get("tints", {}),
        "variants":   variants_meta,
        "failures":   failures,
        "bakedAt":    int(time.time() * 1000),
    }
    with open(out_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    update_index(args.species, decl, len(variants_meta))
    log(f"wrote {out_dir}/manifest.json ({len(variants_meta)} variants, {len(failures)} failures)")
    log(f"total bake time: {time.time() - t_all:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
