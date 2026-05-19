#!/usr/bin/env python3
"""
lidar_extract.py — LiDAR point-cloud → QSM cylinder skeleton (extraction only).

Phase L Cycle 1 refactor: lifts the load → voxel → slab-cluster → parent-link
pipeline out of bake-tree.py so the LidarWorkstage can drive interactive
re-extraction without writing GLBs. bake-tree.py imports the same helpers
for its full bake. No algorithm change.

CLI (used by arborist/serve.js POST /lidar/specimen/:treeId/extract):
    .venv/bin/python lidar_extract.py --treeId=10184 \
        --voxelSize=0.03 --minRadius=0.005 --tipRadius=0.02

Emits JSON on stdout:
    {"treeId": "...", "nodes": [{"x","y","z","radius","parentIdx"}, ...],
     "stats": {"points": N, "downsampled": N, "edges": N, "tips": N}}
"""
import argparse
import json
import sys
import time
from pathlib import Path

import laspy
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree


HERE = Path(__file__).parent
ROOT = HERE.parent
DATASET_ROOT_DEFAULT = ROOT / "botanica"


# ── Pipeline (lifted from bake-tree.py 2026-04-27, unchanged) ──────────

def load_pointcloud(laz_path):
    """Load .laz, return Nx3 float64 array centered: XY median = 0, Z min = 0."""
    las = laspy.read(str(laz_path))
    pts = np.column_stack((las.x, las.y, las.z)).astype(np.float64)
    pts[:, 0] -= np.median(pts[:, 0])
    pts[:, 1] -= np.median(pts[:, 1])
    pts[:, 2] -= pts[:, 2].min()
    return pts


def voxel_downsample(pts, voxel):
    """Drop duplicate points within `voxel` (meters)."""
    keys = np.floor(pts / voxel).astype(np.int64)
    h = keys[:, 0] * 73856093 ^ keys[:, 1] * 19349663 ^ keys[:, 2] * 83492791
    order = np.argsort(h)
    pts_sorted = pts[order]
    h_sorted = h[order]
    diff = np.diff(h_sorted, prepend=h_sorted[0] - 1)
    boundaries = np.where(diff != 0)[0]
    boundaries = np.append(boundaries, len(h_sorted))
    centroids = []
    for i in range(len(boundaries) - 1):
        s, e = boundaries[i], boundaries[i + 1]
        centroids.append(pts_sorted[s:e].mean(axis=0))
    return np.array(centroids) if centroids else np.empty((0, 3))


def cluster_slab(xy, eps, min_samples):
    """Connected-components clustering in 2D (a single Z slab)."""
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
    """Z-slab clustering + parent linking → nodes + edges graph."""
    z_min, z_max = pts[:, 2].min(), pts[:, 2].max()
    n_slabs = max(2, int(np.ceil((z_max - z_min) / slab)))
    z_edges = np.linspace(z_min, z_max, n_slabs + 1)

    nodes = []
    slab_to_node_indices = []
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
            r = max(0.01, float(np.std(cluster_xy, axis=0).mean()))
            nodes.append({
                "pos": np.array([centroid[0], centroid[1], slab_z]),
                "radius": r,
                "slab": i,
            })
            idxs.append(len(nodes) - 1)
        slab_to_node_indices.append(idxs)

    edges = []
    for ci, node in enumerate(nodes):
        slab_i = node["slab"]
        if slab_i == 0:
            continue
        best_parent = -1
        best_d = link_max
        for sj in range(slab_i - 1, -1, -1):
            for pj in slab_to_node_indices[sj]:
                d = float(np.linalg.norm(nodes[pj]["pos"] - node["pos"]))
                if d < best_d:
                    best_d = d
                    best_parent = pj
            if best_parent >= 0 and sj == slab_i - 1:
                break
        if best_parent >= 0:
            edges.append((best_parent, ci))
    return nodes, edges


def specimen_laz_path(tree_id, dataset_root=DATASET_ROOT_DEFAULT):
    """Mirror serve.js specimenLazPath: botanica/dev/<treeId>.laz."""
    return Path(dataset_root) / "dev" / f"{tree_id}.laz"


def extract_cylinders(laz_path, voxel_size, min_radius, tip_radius):
    """One-shot LiDAR → cylinder graph. Returns dict:
        { nodes: [{x,y,z,radius,parentIdx}], stats: {...} }
    Cylinders are implicit: every node with parentIdx >= 0 is the child
    end of one cylinder (parent → child); radius is the smaller of the
    two endpoint cluster-std radii, clamped at min_radius."""
    pts_raw = load_pointcloud(laz_path)
    pts = voxel_downsample(pts_raw, voxel=voxel_size)
    nodes, edges = extract_skeleton(pts)
    parent_of = [-1] * len(nodes)
    for pi, ci in edges:
        parent_of[ci] = pi

    # Cylinder count: edges where min(parent.r, child.r) >= min_radius.
    cyl_edges = 0
    for pi, ci in edges:
        if min(nodes[pi]["radius"], nodes[ci]["radius"]) >= min_radius:
            cyl_edges += 1

    # Tip count — same rule as bake-tree.extract_tips.
    has_child = set(p for p, _ in edges)
    edge_radius_to = {}
    for pi, ci in edges:
        edge_radius_to[ci] = min(nodes[pi]["radius"], nodes[ci]["radius"])
    tip_count = 0
    trunk_count = 0
    branch_count = 0
    # Median radius for trunk/branch classification (preview only).
    radii = [edge_radius_to[ci] for ci in edge_radius_to]
    median_r = float(np.median(radii)) if radii else 0.0
    for ci in edge_radius_to:
        if ci in has_child:
            pass
        elif edge_radius_to[ci] <= tip_radius:
            tip_count += 1
    for ci, r in edge_radius_to.items():
        if r >= median_r:
            trunk_count += 1
        else:
            branch_count += 1

    out_nodes = []
    for i, n in enumerate(nodes):
        p = n["pos"]
        out_nodes.append({
            "x": float(p[0]),
            "y": float(p[1]),
            "z": float(p[2]),
            "radius": float(n["radius"]),
            "parentIdx": int(parent_of[i]),
        })

    return {
        "nodes": out_nodes,
        "stats": {
            "pointsRaw": int(len(pts_raw)),
            "pointsDownsampled": int(len(pts)),
            "nodes": len(nodes),
            "edges": len(edges),
            "cylinders": cyl_edges,
            "tips": tip_count,
            "trunkLike": trunk_count,
            "branchLike": branch_count,
            "medianRadius": median_r,
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--treeId", required=True)
    ap.add_argument("--voxelSize", type=float, default=0.03)
    ap.add_argument("--minRadius", type=float, default=0.005)
    ap.add_argument("--tipRadius", type=float, default=0.02)
    ap.add_argument("--datasetRoot", default=str(DATASET_ROOT_DEFAULT))
    args = ap.parse_args()

    laz_path = specimen_laz_path(args.treeId, args.datasetRoot)
    if not laz_path.exists():
        print(json.dumps({"error": "specimen not on disk", "treeId": args.treeId,
                          "lazPath": str(laz_path)}), file=sys.stdout)
        return 2

    t0 = time.time()
    result = extract_cylinders(
        laz_path,
        voxel_size=args.voxelSize,
        min_radius=args.minRadius,
        tip_radius=args.tipRadius,
    )
    result["treeId"] = args.treeId
    result["stats"]["elapsedMs"] = int((time.time() - t0) * 1000)
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
