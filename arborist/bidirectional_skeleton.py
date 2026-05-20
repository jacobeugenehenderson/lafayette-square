#!/usr/bin/env python3
"""
bidirectional_skeleton.py — Phase N.1 (2026-05-19).

Bidirectional-growth tree-skeleton extraction from a LiDAR point cloud.
Sibling of lidar_extract.py; same JSON shape on stdout (source Z-up frame,
nodes: [{x,y,z,radius,parentIdx}, ...]). LidarWorkstage applies the load-time
Z→Y remap; the runtime/bake convention is canonical Y-up (see arborist/NOTES.md
2026-05-19 night, Baby Cedar).

Algorithm (Strategy A — geodesic Dijkstra on a KNN density-weighted graph):

  1. Load + center the .laz (same convention as lidar_extract.py).
  2. Voxel-downsample to a graph-scale point set (graph_voxel).
  3. Multi-view tip detection: project pts onto N viewpoints around the vertical
     axis (with `tilt_deg` down-tilt), take 2D convex-hull vertices of canopy
     points per view, cluster the corresponding 3D points across views, accept
     clusters seen by ≥ `min_views` viewpoints.
  4. Trunk axis fit: weighted PCA on the lower `lower_frac` of points; pick the
     eigenvector with the largest eigenvalue; orient +Z; project the centroid
     down to z_min for the base point.
  5. Density field: voxelized histogram of the raw cloud, Gaussian-smoothed
     (scipy.ndimage.gaussian_filter, sigma=`density_sigma` voxels). Per
     downsampled point, sample the density value at its voxel.
  6. Bidirectional growth (Strategy A): KNN graph over the downsampled point
     set (k = `k_nearest`); edge weight = euclidean_distance / sqrt(density_i *
     density_j + eps) (paths prefer high-density). Source node = nearest
     downsampled point to the trunk-base. Run csgraph.dijkstra from the source
     once; for each detected tip, find its nearest downsampled point and walk
     predecessors back to the source. Union of walks → skeleton tree.
  7. Cylinder graph: each visited downsampled point becomes a node; parent =
     predecessor; radius = median euclidean distance from the node to its `k`
     nearest raw points, capped at `radius_max`.

Determinism: scipy.spatial / scipy.sparse.csgraph / np.histogramdd are
deterministic. No stochastic step. Same .laz + same params → byte-identical
JSON.

CLI:
    .venv/bin/python bidirectional_skeleton.py --treeId=10186 \\
        --voxelSize=0.05 --kNearest=20 --viewCount=12

Emits JSON on stdout:
    {"treeId": "...", "nodes": [{x, y, z, radius, parentIdx}, ...],
     "stats": {"pointsRaw": N, "pointsDownsampled": N, "tips": N, "nodes": N,
               "elapsedMs": N, "viewCount": N, "kNearest": N}}
"""
import argparse
import json
import sys
import time
from pathlib import Path

import laspy
import numpy as np
from scipy.spatial import cKDTree, ConvexHull
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.ndimage import gaussian_filter


HERE = Path(__file__).parent
ROOT = HERE.parent
DATASET_ROOT_DEFAULT = ROOT / "botanica"


# ── Loading (mirrors lidar_extract.load_pointcloud) ─────────────────────

def load_pointcloud(laz_path):
    """Load .laz, return Nx3 float64 array centered: XY median = 0, Z min = 0."""
    las = laspy.read(str(laz_path))
    pts = np.column_stack((las.x, las.y, las.z)).astype(np.float64)
    pts[:, 0] -= np.median(pts[:, 0])
    pts[:, 1] -= np.median(pts[:, 1])
    pts[:, 2] -= pts[:, 2].min()
    return pts


def voxel_downsample(pts, voxel):
    """Centroid-per-voxel downsample (deterministic, mirrors lidar_extract)."""
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


# ── Multi-view tip detection ────────────────────────────────────────────

def detect_tips_multiview(pts, view_count=12, tilt_deg=30.0,
                          canopy_z_min_frac=0.3, cluster_tol=0.20,
                          min_views=3):
    """Project pts onto N tilted viewpoints; take convex-hull vertices of
    canopy-elevated pts; cluster their 3D positions; accept ≥ min_views
    clusters. Returns Mx3 array of tip positions."""
    if len(pts) < 10:
        return np.empty((0, 3))
    z_min, z_max = pts[:, 2].min(), pts[:, 2].max()
    z_cut = z_min + canopy_z_min_frac * (z_max - z_min)
    canopy_mask = pts[:, 2] >= z_cut
    canopy = pts[canopy_mask]
    if len(canopy) < 4:
        return np.empty((0, 3))

    tilt = np.deg2rad(tilt_deg)
    azimuths = np.linspace(0.0, 2.0 * np.pi, view_count, endpoint=False)
    cands = []
    views = []
    for vi, az in enumerate(azimuths):
        d = np.array([np.cos(az) * np.cos(tilt),
                      np.sin(az) * np.cos(tilt),
                      -np.sin(tilt)])
        u = np.array([-np.sin(az), np.cos(az), 0.0])
        v = np.cross(d, u)
        proj = np.column_stack([canopy @ u, canopy @ v])
        try:
            hull = ConvexHull(proj)
        except Exception:
            continue
        for idx in hull.vertices:
            cands.append(canopy[idx])
            views.append(vi)

    if len(cands) == 0:
        return np.empty((0, 3))
    cands = np.asarray(cands)
    views = np.asarray(views)

    # Greedy 3D clustering — highest-z first so canopy tips get priority over
    # lower-hanging side extrema.
    tree = cKDTree(cands)
    visited = np.zeros(len(cands), dtype=bool)
    order = np.argsort(-cands[:, 2])
    tips = []
    for i in order:
        if visited[i]:
            continue
        idxs = tree.query_ball_point(cands[i], r=cluster_tol)
        if not idxs:
            visited[i] = True
            continue
        view_set = set(views[idxs].tolist())
        if len(view_set) >= min_views:
            tips.append(cands[idxs].mean(axis=0))
        for j in idxs:
            visited[j] = True
    return np.asarray(tips) if tips else np.empty((0, 3))


# ── Trunk axis + base ───────────────────────────────────────────────────

def fit_trunk_axis(pts, lower_frac=0.3):
    """Weighted PCA on the lower `lower_frac` of points. Returns (axis, base)
    where axis is +Z-oriented unit vector and base is on axis at z = z_min."""
    z_min, z_max = pts[:, 2].min(), pts[:, 2].max()
    z_cut = z_min + lower_frac * (z_max - z_min)
    lower = pts[pts[:, 2] < z_cut]
    if len(lower) < 10:
        lower = pts
    centroid = lower.mean(axis=0)
    cov = np.cov((lower - centroid).T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    axis = eigvecs[:, -1]  # largest eigenvalue
    if axis[2] < 0:
        axis = -axis
    # Project centroid down to z = z_min along axis.
    if abs(axis[2]) < 1e-6:
        base = np.array([centroid[0], centroid[1], z_min])
    else:
        t = (z_min - centroid[2]) / axis[2]
        base = centroid + axis * t
    return axis, base


# ── Density field ───────────────────────────────────────────────────────

def build_density_field(raw_pts, voxel, sigma_voxels=2.0, padding=2):
    """Voxelize raw_pts (count histogram), Gaussian-smooth, return
    (density_grid, origin, voxel)."""
    mins = raw_pts.min(axis=0) - voxel * padding
    maxs = raw_pts.max(axis=0) + voxel * padding
    nx = int(np.ceil((maxs[0] - mins[0]) / voxel)) + 1
    ny = int(np.ceil((maxs[1] - mins[1]) / voxel)) + 1
    nz = int(np.ceil((maxs[2] - mins[2]) / voxel)) + 1
    edges = [
        mins[0] + np.arange(nx + 1) * voxel,
        mins[1] + np.arange(ny + 1) * voxel,
        mins[2] + np.arange(nz + 1) * voxel,
    ]
    grid, _ = np.histogramdd(raw_pts, bins=edges)
    grid = gaussian_filter(grid.astype(np.float64), sigma=sigma_voxels)
    return grid, mins, voxel


def sample_density(grid, origin, voxel, pts):
    """Trilinear-nearest density at pts. Returns N-vector."""
    ijk = np.floor((pts - origin) / voxel).astype(np.int64)
    nx, ny, nz = grid.shape
    ijk[:, 0] = np.clip(ijk[:, 0], 0, nx - 1)
    ijk[:, 1] = np.clip(ijk[:, 1], 0, ny - 1)
    ijk[:, 2] = np.clip(ijk[:, 2], 0, nz - 1)
    return grid[ijk[:, 0], ijk[:, 1], ijk[:, 2]]


# ── KNN graph + Dijkstra ────────────────────────────────────────────────

def build_density_weighted_knn(pts, density, k=20, eps=1e-3):
    """Symmetric KNN graph; weight = dist / sqrt(d_i * d_j + eps). Returns
    CSR sparse matrix + the kdtree (so callers can do further nearest queries
    without rebuilding)."""
    tree = cKDTree(pts)
    dists, nbrs = tree.query(pts, k=k + 1)
    n = len(pts)
    rows = np.repeat(np.arange(n), k)
    cols = nbrs[:, 1:].ravel()
    d = dists[:, 1:].ravel()
    di = density[rows]
    dj = density[cols]
    w = d / (np.sqrt(di * dj) + eps)
    # Symmetrize: union of (i→j) and (j→i) — csgraph.dijkstra reads directed
    # by default; we duplicate to enforce undirected behaviour.
    rows_s = np.concatenate([rows, cols])
    cols_s = np.concatenate([cols, rows])
    w_s = np.concatenate([w, w])
    graph = csr_matrix((w_s, (rows_s, cols_s)), shape=(n, n))
    return graph, tree


def grow_skeleton(graph, tree, pts, tips, base_xyz):
    """Dijkstra from the downsampled node nearest to base_xyz. For each tip,
    find the nearest downsampled node and trace predecessors back to source.
    Returns: visited node indices (set), predecessor dict {child: parent},
    source_idx, tip_to_node {tip_idx: node_idx}."""
    if len(tips) == 0:
        # Degenerate: no tips → just emit the trunk axis as a single chain.
        return set(), {}, -1, {}

    _, src_idx = tree.query(base_xyz, k=1)
    src_idx = int(src_idx)
    _dist, pred = dijkstra(graph, indices=src_idx, return_predecessors=True,
                           directed=False)
    # Map each tip to its nearest downsampled node.
    _td, tip_nodes = tree.query(tips, k=1)

    visited = set([src_idx])
    parent_of = {}
    tip_map = {}
    for ti, tn in enumerate(tip_nodes):
        tn = int(tn)
        tip_map[ti] = tn
        cur = tn
        while cur != src_idx and cur >= 0 and not np.isinf(_dist[cur]):
            if cur in visited:
                break
            visited.add(cur)
            p = int(pred[cur])
            if p < 0:
                break
            parent_of[cur] = p
            cur = p
    return visited, parent_of, src_idx, tip_map


# ── Radius estimation ───────────────────────────────────────────────────

def estimate_radii(skeleton_nodes_xyz, raw_pts, k=20, radius_max=0.35):
    """Per-node radius = median euclidean distance from the node to its k
    nearest raw points, capped at `radius_max`. Mirrors lidar_extract's
    cluster-std radius spirit (local cross-section proxy)."""
    if len(skeleton_nodes_xyz) == 0:
        return np.zeros(0)
    raw_tree = cKDTree(raw_pts)
    dists, _ = raw_tree.query(skeleton_nodes_xyz, k=k)
    r = np.median(dists, axis=1)
    return np.clip(r, 0.0, radius_max)


# ── Top-level pipeline ──────────────────────────────────────────────────

def extract_cylinders(laz_path, voxel_size, k_nearest, view_count,
                      min_radius=0.005, tilt_deg=30.0,
                      density_sigma=2.0, cluster_tol=0.20,
                      radius_max=0.35):
    """Run the full pipeline; returns dict {nodes, stats} matching
    lidar_extract.extract_cylinders' output shape."""
    raw_pts = load_pointcloud(laz_path)
    pts = voxel_downsample(raw_pts, voxel=voxel_size)
    if len(pts) < 8:
        return {"nodes": [], "stats": {
            "pointsRaw": int(len(raw_pts)), "pointsDownsampled": int(len(pts)),
            "tips": 0, "nodes": 0, "cylinders": 0, "trunkLike": 0,
            "branchLike": 0, "medianRadius": 0.0,
            "viewCount": view_count, "kNearest": k_nearest,
        }}

    tips = detect_tips_multiview(pts, view_count=view_count, tilt_deg=tilt_deg,
                                 cluster_tol=cluster_tol)
    axis, base = fit_trunk_axis(pts)
    grid, origin, vox = build_density_field(raw_pts, voxel=voxel_size,
                                            sigma_voxels=density_sigma)
    density = sample_density(grid, origin, vox, pts)
    density = np.maximum(density, 1e-6)
    graph, tree = build_density_weighted_knn(pts, density, k=k_nearest)
    visited, parent_of, src_idx, _tip_map = grow_skeleton(
        graph, tree, pts, tips, base)

    # Compact node list — root first, then BFS order so parentIdx < childIdx
    # holds (matches the lidar_extract emission convention).
    if src_idx < 0:
        return {"nodes": [], "stats": {
            "pointsRaw": int(len(raw_pts)), "pointsDownsampled": int(len(pts)),
            "tips": int(len(tips)), "nodes": 0, "cylinders": 0,
            "trunkLike": 0, "branchLike": 0, "medianRadius": 0.0,
            "viewCount": view_count, "kNearest": k_nearest,
        }}
    children_of = {}
    for c, p in parent_of.items():
        children_of.setdefault(p, []).append(c)
    order = []
    stack = [src_idx]
    seen = set()
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        order.append(cur)
        for ch in children_of.get(cur, []):
            stack.append(ch)
    remap = {old: i for i, old in enumerate(order)}
    skeleton_xyz = pts[order]
    radii = estimate_radii(skeleton_xyz, raw_pts, radius_max=radius_max)
    radii = np.maximum(radii, min_radius)

    out_nodes = []
    for i, old_idx in enumerate(order):
        p = skeleton_xyz[i]
        if old_idx == src_idx:
            parent = -1
        else:
            parent = remap.get(parent_of.get(old_idx, -1), -1)
        out_nodes.append({
            "x": float(p[0]),
            "y": float(p[1]),
            "z": float(p[2]),
            "radius": float(radii[i]),
            "parentIdx": int(parent),
        })

    cyl_edges = sum(1 for n in out_nodes if n["parentIdx"] >= 0)
    median_r = float(np.median(radii)) if len(radii) else 0.0
    trunk_count = sum(1 for n in out_nodes if n["radius"] >= median_r)
    branch_count = len(out_nodes) - trunk_count

    return {
        "nodes": out_nodes,
        "stats": {
            "pointsRaw": int(len(raw_pts)),
            "pointsDownsampled": int(len(pts)),
            "tips": int(len(tips)),
            "nodes": len(out_nodes),
            "cylinders": int(cyl_edges),
            "trunkLike": int(trunk_count),
            "branchLike": int(branch_count),
            "medianRadius": median_r,
            "viewCount": int(view_count),
            "kNearest": int(k_nearest),
            "trunkAxis": [float(axis[0]), float(axis[1]), float(axis[2])],
            "trunkBase": [float(base[0]), float(base[1]), float(base[2])],
        },
    }


def specimen_laz_path(tree_id, dataset_root=DATASET_ROOT_DEFAULT):
    return Path(dataset_root) / "dev" / f"{tree_id}.laz"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--treeId", required=True)
    ap.add_argument("--voxelSize", type=float, default=0.05)
    ap.add_argument("--kNearest", type=int, default=20)
    ap.add_argument("--viewCount", type=int, default=12)
    ap.add_argument("--minRadius", type=float, default=0.005)
    ap.add_argument("--datasetRoot", default=str(DATASET_ROOT_DEFAULT))
    args = ap.parse_args()

    laz_path = specimen_laz_path(args.treeId, args.datasetRoot)
    if not laz_path.exists():
        print(json.dumps({"error": "specimen not on disk", "treeId": args.treeId,
                          "lazPath": str(laz_path)}))
        return 2

    t0 = time.time()
    result = extract_cylinders(
        laz_path,
        voxel_size=args.voxelSize,
        k_nearest=args.kNearest,
        view_count=args.viewCount,
        min_radius=args.minRadius,
    )
    result["treeId"] = args.treeId
    result["stats"]["elapsedMs"] = int((time.time() - t0) * 1000)
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
