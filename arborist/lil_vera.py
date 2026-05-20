#!/usr/bin/env python3
"""
lil_vera.py — Project: Li'l Vera, Cycle 1, Stage N.2.0 (Apparatus base).

Builder: Tycho (2026-05-20). Honoring Tycho Brahe — observational astronomer
whose meticulous, pre-interpretive logbooks gave Kepler the data to discover
the planetary laws. The Posture B discipline (observe before interpret) lives
in the same lineage as Vera Rubin, whose name this project carries forward.

Stage N.2.0 — Phase 1 end-to-end ONLY. Apparatus base:
  - Spiral rig generator: N rig positions around tree's vertical axis, two
    superimposed pitches (wide + narrow baseline) for mixed-baseline coverage.
  - Per-rig 3-camera tripod at 120° azimuthal separation around the rig's
    vertical axis, all looking inward toward the tree's symmetry axis at the
    rig's elevation. Per construction: complete silhouette coverage + universal
    within-rig stereo (every visible point sees ≥ 2 of 3 cameras).
  - Per-camera CPU rasterization of the source point cloud to a binary
    silhouette mask + scikit-image skeletonize → medial-axis chain pixels.
  - Within-rig stereo correspondence: per camera-pair, match medial-axis
    pixels via epipolar constraint; triangulate (linear DLT) to 3D candidates.
  - Per-point memory vector scaffold (M_obs / M_interp channels) — STRUCTURAL
    only at N.2.0; orientation tomography (N.2.1) fills M_obs proper.
  - Multi-rig consolidation: voxel-bucket stub for visual gate. Real
    accumulation primitive is N.2.1.

POSTURE B (load-bearing): source 3D positions enter the apparatus exclusively
as input to the camera-projection raster step (the physical equivalent of
"the camera registered photons"). The extraction algorithm — silhouette,
medial axis, stereo correspondence, triangulation — operates on the rendered
2D images + known camera intrinsics/extrinsics. Source 3D coordinates are
NEVER consulted as labels by the extraction code. This discipline generalizes
the apparatus to consume iPhone photographs in future cycles.

Output JSON (same shape as lidar_extract.py / bidirectional_skeleton.py so
the LidarWorkstage cylinder renderer ingests it interchangeably):
    {
      "treeId": "...",
      "nodes": [{"x","y","z","radius","parentIdx"}, ...],
      "stats": {...},
      "hyperparams": {...},
      "memoryScaffold": { "channels": [...], "perPointCount": N }
    }

Persisted to: arborist/state/lil-vera/<treeId>/run-<ISO>-N<N>.json

CLI:
    .venv/bin/python lil_vera.py --treeId=10184 --N=50 --pitch=0.3

NOT YET IMPLEMENTED (later stages, do not add here):
  - N.2.1: Phase 2a multi-rig consensus deposit; Phase 2b orientation tomography
  - N.2.2: Phase 3 ridge extraction + axonal glimpse-reach + taper projection
  - N.2.3: Phase 4 pipe-model radius accumulation
  - N.2.4: Phase 5 Rubin consensus-stability validation
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from multiprocessing import Pool, cpu_count
from pathlib import Path

import numpy as np
from skimage.morphology import skeletonize

# Reuse the canonical .laz loader so the source frame is identical to QSM /
# Bidirectional baselines. This is the ONE Posture-B-allowed touch of source
# 3D — the cloud is what the cameras observe.
from lidar_extract import load_pointcloud, voxel_downsample, specimen_laz_path


HERE = Path(__file__).parent
ROOT = HERE.parent
STATE_DIR = HERE / "state" / "lil-vera"


# ── Spiral rig generator ────────────────────────────────────────────────

def generate_rig_positions(n_rigs, tree_height, tree_radius, pitch_ratio,
                            cam_distance_factor=1.6):
    """Two superimposed spirals around the tree's vertical axis (world Z-up).

    Splits N evenly between a wide-pitch and a narrow-pitch spiral so the rig
    set has both wide-baseline (global topology) and narrow-baseline (local
    connectivity) coverage without complicated mixed-distribution math.

    Per rig: (rig_height, rig_azimuth, cam_distance). The 3 cameras per rig
    are placed equilaterally around the rig's vertical axis at radius
    cam_distance from world Z-axis, at the rig's elevation.

    Returns: list of dicts [{height, azimuth, cam_distance}, ...].
    """
    cam_distance = max(tree_radius * cam_distance_factor, tree_height * 0.8)
    rigs = []
    # Two spirals: wide pitch (few orbits, large vertical step) +
    # narrow pitch (many orbits, small vertical step).
    wide_pitch = pitch_ratio
    narrow_pitch = pitch_ratio * 0.4
    half = n_rigs // 2
    for spiral_idx, (n_this, pitch) in enumerate([
        (half, wide_pitch),
        (n_rigs - half, narrow_pitch),
    ]):
        if n_this == 0:
            continue
        # Number of full vertical sweeps = 1 (climb from base to top once);
        # azimuthal orbits-per-climb = 1 / pitch.
        for r in range(n_this):
            t = r / max(n_this - 1, 1)
            height = 0.05 * tree_height + t * 0.95 * tree_height
            # Offset the narrow-spiral's azimuth by 60° so it doesn't shadow
            # the wide-spiral viewpoints.
            offset = np.pi / 3 if spiral_idx == 1 else 0.0
            azimuth = (2.0 * np.pi / max(pitch, 1e-3)) * t + offset
            rigs.append({
                "height": float(height),
                "azimuth": float(azimuth),
                "cam_distance": float(cam_distance),
                "spiral": spiral_idx,
            })
    return rigs


def rig_cameras(rig, target_height):
    """3 cameras at 120° around the rig's vertical axis, all looking toward
    the tree's central vertical axis at target_height. Returns list of
    (position, target, up) tuples in world frame (Z-up source convention)."""
    cams = []
    for k in range(3):
        az = rig["azimuth"] + k * (2.0 * np.pi / 3.0)
        pos = np.array([
            rig["cam_distance"] * np.cos(az),
            rig["cam_distance"] * np.sin(az),
            rig["height"],
        ])
        target = np.array([0.0, 0.0, target_height])
        up = np.array([0.0, 0.0, 1.0])
        cams.append((pos, target, up))
    return cams


# ── Camera math (rendering input — Posture-B-allowed) ───────────────────

def build_view_matrix(position, target, up):
    """Right-handed view matrix. Camera looks toward -z in camera frame.
    Returns (R, t) such that p_cam = R @ (p_world - position)."""
    forward = target - position
    forward = forward / (np.linalg.norm(forward) + 1e-12)
    right = np.cross(forward, up)
    right = right / (np.linalg.norm(right) + 1e-12)
    cam_up = np.cross(right, forward)
    R = np.stack([right, cam_up, -forward], axis=0)  # 3x3
    return R, position.astype(np.float64)


def build_intrinsics(image_w, image_h, vfov_deg=45.0):
    """Pinhole intrinsics K (3x3) with principal point at image center."""
    vfov = np.deg2rad(vfov_deg)
    fy = 0.5 * image_h / np.tan(vfov / 2.0)
    fx = fy  # square pixels
    cx = image_w / 2.0
    cy = image_h / 2.0
    K = np.array([
        [fx, 0.0, cx],
        [0.0, fy, cy],
        [0.0, 0.0, 1.0],
    ])
    return K


def project_points(pts_world, R, t, K, image_w, image_h):
    """Project Nx3 world points to (u, v, depth). Returns:
        uv: Nx2 float (image coords)
        depth: N float (positive in front of camera)
        in_frame: N bool (depth > 0 AND uv inside [0,W)x[0,H))."""
    p_cam = (pts_world - t) @ R.T  # Nx3 in camera frame
    # In our convention camera looks toward -z, so points in front have z<0.
    depth = -p_cam[:, 2]
    valid = depth > 1e-3
    u = np.where(valid, K[0, 0] * p_cam[:, 0] / np.where(valid, depth, 1.0) + K[0, 2], -1.0)
    v = np.where(valid, K[1, 1] * p_cam[:, 1] / np.where(valid, depth, 1.0) + K[1, 2], -1.0)
    # OpenCV-style: v increases downward → flip y.
    v = (image_h - 1) - v
    in_frame = valid & (u >= 0) & (u < image_w) & (v >= 0) & (v < image_h)
    return np.column_stack([u, v]), depth, in_frame


def rasterize_silhouette(pts_world, R, t, K, image_w, image_h, splat_radius=1):
    """CPU splat rasterizer → binary silhouette mask (HxW uint8 {0,1}). No
    z-buffer needed for silhouette — any covering point fills the pixel."""
    uv, _depth, in_frame = project_points(pts_world, R, t, K, image_w, image_h)
    mask = np.zeros((image_h, image_w), dtype=np.uint8)
    u = uv[in_frame, 0].astype(np.int32)
    v = uv[in_frame, 1].astype(np.int32)
    if splat_radius <= 0:
        mask[v, u] = 1
        return mask
    # Disc splat — small kernel for crisp silhouettes.
    for du in range(-splat_radius, splat_radius + 1):
        for dv in range(-splat_radius, splat_radius + 1):
            if du * du + dv * dv > splat_radius * splat_radius:
                continue
            uu = u + du
            vv = v + dv
            ok = (uu >= 0) & (uu < image_w) & (vv >= 0) & (vv < image_h)
            mask[vv[ok], uu[ok]] = 1
    return mask


# ── Per-view medial axis extraction (Posture-B-pure: operates on mask) ──

def extract_medial(mask):
    """Binary mask → boolean medial-axis image (HxW). Wraps scikit-image's
    Zhang-Suen skeletonize for deterministic, well-tested behaviour."""
    if mask.sum() == 0:
        return np.zeros_like(mask, dtype=bool)
    return skeletonize(mask.astype(bool))


def medial_pixels(medial_img):
    """Returns (v, u) integer arrays of medial-axis pixel coordinates."""
    vs, us = np.where(medial_img)
    return vs.astype(np.int32), us.astype(np.int32)


# ── Within-rig stereo correspondence (Posture-B-pure: image space) ──────

def triangulate_dlt(uv1, uv2, P1, P2):
    """Linear DLT triangulation of corresponding image points (in pixel
    coordinates). uv1, uv2: (2,) arrays; P1, P2: 3x4 camera projection
    matrices. Returns (3,) world point. Standard Hartley & Zisserman."""
    u1, v1 = uv1
    u2, v2 = uv2
    A = np.array([
        u1 * P1[2] - P1[0],
        v1 * P1[2] - P1[1],
        u2 * P2[2] - P2[0],
        v2 * P2[2] - P2[1],
    ])
    _u, _s, vh = np.linalg.svd(A)
    X = vh[-1]
    if abs(X[3]) < 1e-12:
        return None
    return X[:3] / X[3]


def projection_matrix(R, t, K, image_h):
    """Compose 3x4 projection matrix P consistent with `project_points`.

    Derivation: in our camera frame R has row 2 = -forward, so for a visible
    world point P, cam_z = -forward · (P - t) is NEGATIVE. project_points
    uses depth = -cam_z (positive) and emits
        u = fx * cam_x / depth + cx
        v_screen = (H-1) - (fy * cam_y / depth + cy)
    To make (u, v_screen, 1) ~ P_DLT @ (X, 1), we need a K_proj whose
    third row is [0, 0, -1] (so the divisor is -cam_z = depth) and whose
    first two rows produce the above numerators when divided by depth.
    """
    fx = K[0, 0]
    fy = K[1, 1]
    cx = K[0, 2]
    cy = K[1, 2]
    K_proj = np.array([
        [fx,  0.0, -cx],
        [0.0, -fy, -((image_h - 1) - cy)],
        [0.0, 0.0, -1.0],
    ])
    Rt = np.zeros((3, 4))
    Rt[:, :3] = R
    Rt[:, 3] = -R @ t
    return K_proj @ Rt


def epipolar_stereo_match(uv_a, uv_b, P_a, P_b, image_w, image_h,
                           epipolar_tol=2.0, max_disparity_px=None):
    """Match each medial pixel in image A to its nearest medial pixel in
    image B along A's epipolar line. Returns Nx2 index array (idx_a, idx_b).

    Uses fundamental-matrix-free formulation: project A's ray (back-project
    uv_a through camera A at two depths) into image B; the projected line
    segment IS the epipolar line. For each A-pixel we sweep B-pixels within
    epipolar_tol pixels perpendicular to that line and take the closest.
    """
    if len(uv_a) == 0 or len(uv_b) == 0:
        return np.empty((0, 2), dtype=np.int32)

    # Back-project each A pixel to two world points at near/far depths.
    # P = K[R|-Rt]; pseudo-inverse trick: solve for X in homog s.t. P @ X = lambda * (u,v,1).
    # Cheaper: sample two depths along the ray we know we want.
    # Reconstruct (R_a, t_a) from P_a via pinv on intrinsics.
    # ...but we already have R, t, K in caller; pass them in via closure-style.
    raise NotImplementedError("use epipolar_stereo_match_full")


def epipolar_stereo_match_full(uv_a, uv_b, R_a, t_a, K_a, P_b,
                                image_w, image_h, image_h_b=None,
                                epipolar_tol=2.5, depth_near=0.5, depth_far=100.0):
    """Back-project A's pixels along their rays at near/far depths; project
    those endpoints into image B via P_b; for each A-pixel, find the closest
    B-pixel to the resulting epipolar line segment. Returns (idx_a, idx_b)."""
    if image_h_b is None:
        image_h_b = image_h
    if len(uv_a) == 0 or len(uv_b) == 0:
        return np.empty(0, dtype=np.int32), np.empty(0, dtype=np.int32)

    # 1. Back-project A pixels at two depths to world space.
    # In A's pixel convention `project_points` flipped v, so undo for the
    # back-projection: v_cam = (H-1) - v_pixel.
    u = uv_a[:, 0].astype(np.float64)
    v_flipped = (image_h - 1) - uv_a[:, 1].astype(np.float64)
    fx, fy, cx, cy = K_a[0, 0], K_a[1, 1], K_a[0, 2], K_a[1, 2]
    # Direction in camera frame (camera looks -z).
    dx = (u - cx) / fx
    dy = (v_flipped - cy) / fy
    # Camera-frame ray direction: (dx, dy, -1).
    rays_cam = np.column_stack([dx, dy, -np.ones_like(dx)])
    # Rotate to world.
    rays_world = rays_cam @ R_a  # since p_cam = R @ (p_world - t), p_world = R^T @ p_cam + t
    rays_world = rays_world / (np.linalg.norm(rays_world, axis=1, keepdims=True) + 1e-12)
    near_pts = t_a + rays_world * depth_near
    far_pts = t_a + rays_world * depth_far

    # 2. Project near/far into image B.
    def proj_homog(world_pts, P):
        hp = np.column_stack([world_pts, np.ones(len(world_pts))])
        x = hp @ P.T  # Nx3
        w = x[:, 2:3]
        safe = np.where(np.abs(w) < 1e-9, 1e-9, w)
        return x[:, :2] / safe

    near_b = proj_homog(near_pts, P_b)
    far_b = proj_homog(far_pts, P_b)

    # 3. For each A-pixel, find the B-pixel closest to the line through
    #    (near_b, far_b). Limit candidates to those within epipolar_tol.
    # Distance from point p to line through a→b: |(b-a)×(p-a)| / |b-a|.
    a = near_b
    b = far_b
    ab = b - a  # Nx2
    ab_len = np.linalg.norm(ab, axis=1) + 1e-12

    # All B-pixel coords as Mx2.
    Bxy = uv_b.astype(np.float64)

    # We'll iterate A-pixels (typically a few thousand) — vectorise the
    # B-search per A.
    idx_a_list = []
    idx_b_list = []
    for i in range(len(uv_a)):
        ai = a[i]
        bi_dir = ab[i] / ab_len[i]  # unit direction
        # Perpendicular distances from each Bxy to line.
        pa = Bxy - ai  # Mx2
        # 2D cross product magnitude.
        cross = pa[:, 0] * bi_dir[1] - pa[:, 1] * bi_dir[0]
        perp = np.abs(cross)
        # Project parameter t along the line.
        tparm = pa @ bi_dir
        # Keep only those within tolerance perpendicular distance AND within
        # plausible depth bracket on the line (0..ab_len).
        ok = (perp < epipolar_tol) & (tparm > 0) & (tparm < ab_len[i])
        if not np.any(ok):
            continue
        # Among candidates, pick the one with smallest perp distance.
        j = np.argmin(np.where(ok, perp, np.inf))
        idx_a_list.append(i)
        idx_b_list.append(int(j))

    return np.asarray(idx_a_list, dtype=np.int32), np.asarray(idx_b_list, dtype=np.int32)


# ── Per-rig observation (worker for multiprocessing) ────────────────────

# Module-level globals populated by Pool initializer so each worker process
# doesn't re-pickle the (potentially large) point cloud per task.
_RIG_PTS = None
_RIG_K = None
_RIG_TARGET_H = None
_RIG_IMAGE_W = None
_RIG_IMAGE_H = None
_RIG_SPLAT = None


def _pool_init(pts, K, target_h, image_w, image_h, splat):
    global _RIG_PTS, _RIG_K, _RIG_TARGET_H, _RIG_IMAGE_W, _RIG_IMAGE_H, _RIG_SPLAT
    _RIG_PTS = pts
    _RIG_K = K
    _RIG_TARGET_H = target_h
    _RIG_IMAGE_W = image_w
    _RIG_IMAGE_H = image_h
    _RIG_SPLAT = splat


def observe_rig(rig):
    """Per-rig: render 3 cameras → silhouette + medial-axis per view →
    within-rig stereo correspondence over 3 pairs → 3D candidate points.

    Posture B: this function operates on (R, t, K) + the rendered masks. The
    only source-3D read is the `rasterize_silhouette` call (the "camera").
    Extraction logic below works exclusively on images + camera matrices.

    Returns dict { rig_idx, candidates: [{world: [x,y,z], chain_label,
                   classification, confidence, source_pair}, ...] }.
    """
    cams = rig_cameras(rig, _RIG_TARGET_H)
    # Render 3 silhouette masks.
    views = []
    for (pos, tgt, up) in cams:
        R, t = build_view_matrix(pos, tgt, up)
        mask = rasterize_silhouette(_RIG_PTS, R, t, _RIG_K, _RIG_IMAGE_W,
                                     _RIG_IMAGE_H, splat_radius=_RIG_SPLAT)
        medial = extract_medial(mask)
        vs, us = medial_pixels(medial)
        uv = np.column_stack([us, vs])  # Nx2 in (u, v) order
        P = projection_matrix(R, t, _RIG_K, _RIG_IMAGE_H)
        views.append({
            "R": R, "t": t, "P": P,
            "mask_sum": int(mask.sum()),
            "medial_sum": int(medial.sum()),
            "uv": uv,
        })

    # Triangulate over all 3 camera pairs.
    candidates = []
    pairs = [(0, 1), (1, 2), (2, 0)]
    for (a, b) in pairs:
        va = views[a]
        vb = views[b]
        if len(va["uv"]) < 2 or len(vb["uv"]) < 2:
            continue
        idx_a, idx_b = epipolar_stereo_match_full(
            va["uv"], vb["uv"], va["R"], va["t"], _RIG_K, vb["P"],
            _RIG_IMAGE_W, _RIG_IMAGE_H,
        )
        for ia, ib in zip(idx_a, idx_b):
            X = triangulate_dlt(va["uv"][ia], vb["uv"][ib],
                                va["P"], vb["P"])
            if X is None:
                continue
            # Reject obvious bad triangulations (behind cameras, far outside
            # the tree's reasonable bounding region).
            if not np.all(np.isfinite(X)):
                continue
            if abs(X[0]) > 50 or abs(X[1]) > 50 or X[2] < -2 or X[2] > 100:
                continue
            candidates.append({
                "world": X.tolist(),
                "pair": (a, b),
                "classification": "medial-axis-interior",
                "confidence": 1.0,
            })

    return {
        "rig_idx": rig["_idx"],
        "rig": rig,
        "candidates": candidates,
        "view_stats": [{"mask": v["mask_sum"], "medial": v["medial_sum"]}
                       for v in views],
    }


# ── Multi-rig consolidation stub + chain emission ───────────────────────

def consolidate_to_chains(rig_outputs, voxel=0.05):
    """N.2.0 stub: voxel-bucket the candidates into one point per occupied
    voxel; emit a parent-linked path per rig (raster order). Real
    accumulation primitive is N.2.1.

    Returns: list of node dicts [{x,y,z,radius,parentIdx,memory}, ...]
    and stats dict.
    """
    nodes = []
    seen_voxels = {}  # voxel_key → existing node index (for reuse)
    pre_consolidation = 0
    for ro in rig_outputs:
        prev_idx_in_chain = {}  # (pair) → last emitted node index
        for cand in ro["candidates"]:
            pre_consolidation += 1
            wx, wy, wz = cand["world"]
            vk = (int(round(wx / voxel)),
                  int(round(wy / voxel)),
                  int(round(wz / voxel)))
            if vk in seen_voxels:
                node_idx = seen_voxels[vk]
                # Increment memory channel for the existing node.
                nodes[node_idx]["memory"]["M_obs"]["medial_count"] += 1
                nodes[node_idx]["memory"]["M_obs"]["rigs_seen"] += 1
            else:
                node_idx = len(nodes)
                seen_voxels[vk] = node_idx
                pair = cand["pair"]
                parent = prev_idx_in_chain.get(pair, -1)
                nodes.append({
                    "x": float(wx),
                    "y": float(wy),
                    "z": float(wz),
                    "radius": 0.02,  # Phase 4 (N.2.3) fills real radii
                    "parentIdx": int(parent),
                    "memory": {
                        "M_obs": {
                            "silhouette_count": 0,
                            "medial_count": 1,
                            "body_count": 0,
                            "rigs_seen": 1,
                        },
                        "M_interp": {},
                        "classification": cand["classification"],
                    },
                })
            prev_idx_in_chain[cand["pair"]] = node_idx
    stats = {
        "candidatesPreConsolidation": pre_consolidation,
        "nodesPostConsolidation": len(nodes),
        "consolidationVoxel": voxel,
    }
    return nodes, stats


# ── Top-level pipeline ──────────────────────────────────────────────────

def run_lil_vera(laz_path, n_rigs, k_orient, pitch_ratio, voxel_size,
                  image_w=384, image_h=288, splat_radius=1,
                  consolidation_voxel=0.05, n_workers=None):
    """Stage N.2.0 end-to-end. Returns full result dict."""
    t0 = time.time()
    # Load + center cloud (Z-up source frame, mirrors lidar_extract).
    pts_raw = load_pointcloud(laz_path)
    pts = voxel_downsample(pts_raw, voxel=voxel_size)
    tree_height = float(pts[:, 2].max() - pts[:, 2].min())
    tree_radius = float(max(
        np.percentile(np.abs(pts[:, 0]), 99),
        np.percentile(np.abs(pts[:, 1]), 99),
    ))
    t_load = time.time() - t0

    # Spiral rig set.
    rigs = generate_rig_positions(n_rigs, tree_height, tree_radius, pitch_ratio)
    for i, r in enumerate(rigs):
        r["_idx"] = i

    # Intrinsics (shared across rigs).
    K = build_intrinsics(image_w, image_h, vfov_deg=45.0)
    target_h = tree_height * 0.5

    # Per-rig observation in parallel.
    t1 = time.time()
    if n_workers is None:
        n_workers = max(1, cpu_count() - 1)
    if n_workers == 1 or len(rigs) < 4:
        # Serial path (easier for debugging + small N).
        _pool_init(pts, K, target_h, image_w, image_h, splat_radius)
        rig_outputs = [observe_rig(r) for r in rigs]
    else:
        with Pool(processes=n_workers,
                  initializer=_pool_init,
                  initargs=(pts, K, target_h, image_w, image_h, splat_radius)) as pool:
            rig_outputs = pool.map(observe_rig, rigs)
    t_observe = time.time() - t1

    # Consolidation + chain emission.
    t2 = time.time()
    nodes, consol_stats = consolidate_to_chains(rig_outputs,
                                                voxel=consolidation_voxel)
    t_consolidate = time.time() - t2

    # Strip the heavy memory dict from the nodes that go on the wire — the
    # scaffold lives in `memoryScaffold.perPointCount`; per-node detail is
    # not consumed by the LidarWorkstage's CylinderSkeleton (renders
    # x/y/z/radius/parentIdx). Keep classification on the node for debugging.
    wire_nodes = []
    classifications = {}
    for n in nodes:
        wire_nodes.append({
            "x": n["x"], "y": n["y"], "z": n["z"],
            "radius": n["radius"], "parentIdx": n["parentIdx"],
            "classification": n["memory"]["classification"],
            "medialCount": n["memory"]["M_obs"]["medial_count"],
            "rigsSeen": n["memory"]["M_obs"]["rigs_seen"],
        })
        c = n["memory"]["classification"]
        classifications[c] = classifications.get(c, 0) + 1

    # Per-rig view stats summary.
    total_medial_pixels = sum(
        sum(vs["medial"] for vs in ro["view_stats"]) for ro in rig_outputs)
    total_mask_pixels = sum(
        sum(vs["mask"] for vs in ro["view_stats"]) for ro in rig_outputs)

    median_r = 0.02  # Phase 4 will fill; placeholder for renderer.
    result = {
        "nodes": wire_nodes,
        "stats": {
            "pointsRaw": int(len(pts_raw)),
            "pointsDownsampled": int(len(pts)),
            "treeHeight": tree_height,
            "treeRadius": tree_radius,
            "rigs": len(rigs),
            "cameras": 3 * len(rigs),
            "totalSilhouettePixels": int(total_mask_pixels),
            "totalMedialPixels": int(total_medial_pixels),
            "candidatesPreConsolidation": consol_stats["candidatesPreConsolidation"],
            "nodes": len(wire_nodes),
            "cylinders": sum(1 for n in wire_nodes if n["parentIdx"] >= 0),
            "trunkLike": 0,
            "branchLike": len(wire_nodes),
            "medianRadius": median_r,
            "classifications": classifications,
            "elapsedMs": int((time.time() - t0) * 1000),
            "loadMs": int(t_load * 1000),
            "observeMs": int(t_observe * 1000),
            "consolidateMs": int(t_consolidate * 1000),
            "workers": int(n_workers),
        },
        "hyperparams": {
            "N": int(n_rigs),
            "kOrient": int(k_orient),
            "pitchRatio": float(pitch_ratio),
            "voxelSize": float(voxel_size),
            "imageW": int(image_w),
            "imageH": int(image_h),
            "splatRadius": int(splat_radius),
            "consolidationVoxel": float(consolidation_voxel),
            "stage": "N.2.0",
        },
        "memoryScaffold": {
            "channels": ["M_obs.silhouette_count", "M_obs.medial_count",
                         "M_obs.body_count", "M_obs.rigs_seen",
                         "M_interp.*"],
            "perPointCount": len(wire_nodes),
            "note": "Scaffold only at N.2.0; orientation tomography (N.2.1) fills M_obs proper.",
        },
    }
    return result


# ── Disk persistence ────────────────────────────────────────────────────

def persist_run(tree_id, n_rigs, result, out_override=None):
    """Write result JSON to arborist/state/lil-vera/<treeId>/run-<ISO>-N<N>.json
    (or to --out override). Returns the resolved Path."""
    if out_override:
        out_path = Path(out_override)
    else:
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out_dir = STATE_DIR / str(tree_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"run-{ts}-N{n_rigs}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    return out_path


# ── CLI ─────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Project: Li'l Vera, Stage N.2.0 apparatus base")
    ap.add_argument("--treeId", required=True)
    ap.add_argument("--N", type=int, default=50,
                    help="Total rig positions (dev: 50; overnight load-bearing: 500)")
    ap.add_argument("--kOrient", type=int, default=200,
                    help="Orientation tomography samples per point (structural at N.2.0; used at N.2.1)")
    ap.add_argument("--pitch", type=float, default=0.3,
                    help="Spiral pitch ratio (vertical-rise-per-orbit / tree height)")
    ap.add_argument("--voxelSize", type=float, default=0.03,
                    help="Source point-cloud downsample voxel (m)")
    ap.add_argument("--imageW", type=int, default=384)
    ap.add_argument("--imageH", type=int, default=288)
    ap.add_argument("--splatRadius", type=int, default=1)
    ap.add_argument("--consolidationVoxel", type=float, default=0.05,
                    help="Output-side voxel bucketing for multi-rig candidate "
                         "consolidation (m). Controls visible chain density / "
                         "smoothing — operator-facing 'Voxel size' knob.")
    ap.add_argument("--workers", type=int, default=0,
                    help="multiprocessing workers; 0 = auto (cpu_count - 1)")
    ap.add_argument("--out", default=None,
                    help="Override result JSON path; default arborist/state/lil-vera/<treeId>/run-<ts>-N<N>.json")
    ap.add_argument("--datasetRoot", default=None)
    args = ap.parse_args()

    laz_path = specimen_laz_path(args.treeId,
                                  args.datasetRoot or (ROOT / "botanica"))
    if not laz_path.exists():
        print(json.dumps({"error": "specimen not on disk", "treeId": args.treeId,
                          "lazPath": str(laz_path)}))
        return 2

    workers = args.workers if args.workers > 0 else None
    result = run_lil_vera(
        laz_path,
        n_rigs=args.N,
        k_orient=args.kOrient,
        pitch_ratio=args.pitch,
        voxel_size=args.voxelSize,
        image_w=args.imageW,
        image_h=args.imageH,
        splat_radius=args.splatRadius,
        consolidation_voxel=args.consolidationVoxel,
        n_workers=workers,
    )
    result["treeId"] = args.treeId
    out_path = persist_run(args.treeId, args.N, result, out_override=args.out)
    result["savedTo"] = str(out_path.relative_to(ROOT)) \
        if str(out_path).startswith(str(ROOT)) else str(out_path)
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
