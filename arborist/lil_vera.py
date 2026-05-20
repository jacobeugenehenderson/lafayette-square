#!/usr/bin/env python3
"""
lil_vera.py — Project: Li'l Vera, Cycle 1, Stage N.2.1
              (Evidence accumulation + orientation tomography).

Builder: Tycho (2026-05-20). Honoring Tycho Brahe — observational astronomer
whose meticulous, pre-interpretive logbooks gave Kepler the data to discover
the planetary laws. The Posture B discipline (observe before interpret) lives
in the same lineage as Vera Rubin, whose name this project carries forward.

Stage N.2.0 (apparatus base, landed 2026-05-20):
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
  - Multi-rig consolidation: voxel-bucket (visual gate). Real accumulation
    primitive arrives at N.2.1 below.

Stage N.2.1 (this stage, 2026-05-20):
  - Phase 2a — Multi-rig consensus deposit. After consolidation, project
    every candidate back into every rig's 3 cameras; look up the rendered
    silhouette+medial+edge masks; increment per-candidate M_obs channels
    (silhouette_count, medial_count, body_count, rigs_seen). Vectorised
    over candidates per camera, parallelised over rig chunks.
  - Phase 2b — Orientation tomography ("drag-a-stick-through-jelly").
    Build a Gaussian-smoothed candidate-density field. For each candidate
    and each of K_orient Fibonacci-on-hemisphere directions, drag a probe
    along the direction and score the (density-along-drag) /
    (density-along-drag + perp-residual + monotonicity-penalty +
    symmetry-penalty) ratio. Score distribution shape across orientations
    classifies the point: sharp unimodal → linear-interior; bimodal →
    junction; unimodal one-sided → tip; flat → noise.
  - Phase 2c — Patient iteration. Per-pass diagnostic curves persisted;
    termination on M_obs-delta < eps_memory across the dominant channels.
    Default 1 pass; --passes > 1 interleaves rig azimuths deterministically
    for monotonic M_obs growth.

POSTURE B (load-bearing): source 3D positions enter the apparatus exclusively
as input to the camera-projection raster step (the physical equivalent of
"the camera registered photons"). The extraction algorithm — silhouette,
medial axis, stereo correspondence, triangulation, mask re-lookup in 2a,
candidate-density field + probe-cone scoring in 2b — operates exclusively
on rendered 2D images / pixel-derived 3D positions + known camera
intrinsics/extrinsics. Source 3D coordinates are NEVER consulted as labels
by the extraction code. This discipline generalizes the apparatus to consume
iPhone photographs in future cycles.

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
from scipy.ndimage import binary_erosion, gaussian_filter
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
    #    (near_b, far_b). Kept as a Python A-loop with vectorised B-search:
    #    benchmarked faster than a full (Na × Nb × 2) tensor at our medial
    #    pixel counts (the short-circuit on no-match A-pixels matters). At
    #    N=500 per-rig observe is ~50s aggregate — well under the Phase 2b
    #    budget that dominates overnight runs.
    a = near_b
    b = far_b
    ab = b - a  # Nx2
    ab_len = np.linalg.norm(ab, axis=1) + 1e-12

    # All B-pixel coords as Mx2.
    Bxy = uv_b.astype(np.float64)

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
    # Render 3 silhouette masks. Retain silhouette + medial + R + t per
    # camera so Phase 2a can re-project consolidated candidates back through
    # the same rendered data (Posture-B-pure: 2a's classification reads come
    # from the masks, not source 3D).
    views = []
    for (pos, tgt, up) in cams:
        R, t = build_view_matrix(pos, tgt, up)
        mask = rasterize_silhouette(_RIG_PTS, R, t, _RIG_K, _RIG_IMAGE_W,
                                     _RIG_IMAGE_H, splat_radius=_RIG_SPLAT)
        medial = extract_medial(mask)
        # Silhouette edge = (mask) AND NOT (eroded mask). Pre-compute here
        # so 2a deposit doesn't pay morphology cost per candidate.
        eroded = binary_erosion(mask.astype(bool), iterations=1)
        edge = mask.astype(bool) & (~eroded)
        vs, us = medial_pixels(medial)
        uv = np.column_stack([us, vs])  # Nx2 in (u, v) order
        P = projection_matrix(R, t, _RIG_K, _RIG_IMAGE_H)
        views.append({
            "R": R, "t": t, "P": P,
            "mask": mask.astype(bool),
            "medial": medial.astype(bool),
            "edge": edge,
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
        "views": views,  # masks + R/t per camera — consumed by Phase 2a
        "view_stats": [{"mask": v["mask_sum"], "medial": v["medial_sum"]}
                       for v in views],
    }


# ── Multi-rig consolidation stub + chain emission ───────────────────────

def consolidate_to_chains(rig_outputs, voxel=0.05):
    """Voxel-bucket the per-rig stereo candidates into one node per occupied
    voxel; chain-link them in (rig, pair) emission order so the renderer can
    draw polylines. Memory channels are zero-initialised — Phase 2a does the
    real M_obs deposit via mask re-projection.

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
                            "medial_count": 0,
                            "body_count": 0,
                            "rigs_seen": 0,
                        },
                        "M_interp": {},
                        "classification": "unclassified",
                        "tomography": None,
                    },
                })
            prev_idx_in_chain[cand["pair"]] = node_idx
    stats = {
        "candidatesPreConsolidation": pre_consolidation,
        "nodesPostConsolidation": len(nodes),
        "consolidationVoxel": voxel,
    }
    return nodes, stats


# ── Phase 2a — Multi-rig consensus deposit (Posture-B mask re-lookup) ──

def multi_rig_consensus_deposit(nodes, rig_outputs, K, image_w, image_h):
    """For each consolidated candidate, project into every rig's 3 cameras
    using the per-camera R/t retained from Phase 1; look up the rendered
    silhouette/medial/edge masks; deposit per-channel counts into the
    node's M_obs vector.

    Channels:
      - medial_count   += 1 per camera-view where projection lands on the
                         medial-axis skeleton pixel
      - silhouette_count += 1 per camera-view where projection lands on the
                         silhouette boundary (mask edge, not skeleton)
      - body_count     += 1 per camera-view where projection lands on the
                         body interior (mask, not skeleton, not edge)
      - rigs_seen      += 1 per rig where ≥1 of 3 cameras' projection lands
                         on any silhouette pixel

    Vectorised over candidates per camera. Returns the updated nodes list
    in-place + a stats dict.
    """
    if not nodes:
        return nodes, {"depositCameras": 0, "depositRigs": 0}

    # Stack candidate world positions once.
    Pc = np.array([[n["x"], n["y"], n["z"]] for n in nodes], dtype=np.float64)
    Nc = len(Pc)
    sil = np.zeros(Nc, dtype=np.int32)
    med = np.zeros(Nc, dtype=np.int32)
    body = np.zeros(Nc, dtype=np.int32)
    rigs_seen = np.zeros(Nc, dtype=np.int32)
    cam_count = 0

    for ro in rig_outputs:
        # Per-rig: OR-reduce silhouette hits across 3 cameras for rigs_seen.
        seen_this_rig = np.zeros(Nc, dtype=bool)
        for v in ro["views"]:
            cam_count += 1
            uv, _depth, in_frame = project_points(Pc, v["R"], v["t"], K,
                                                    image_w, image_h)
            if not np.any(in_frame):
                continue
            u_int = np.clip(uv[:, 0].astype(np.int32), 0, image_w - 1)
            v_int = np.clip(uv[:, 1].astype(np.int32), 0, image_h - 1)
            mask_hit = in_frame & v["mask"][v_int, u_int]
            medial_hit = mask_hit & v["medial"][v_int, u_int]
            edge_hit = mask_hit & ~medial_hit & v["edge"][v_int, u_int]
            body_hit = mask_hit & ~medial_hit & ~edge_hit
            med += medial_hit.astype(np.int32)
            sil += edge_hit.astype(np.int32)
            body += body_hit.astype(np.int32)
            seen_this_rig |= mask_hit
        rigs_seen += seen_this_rig.astype(np.int32)

    # Write back into the node dicts.
    for i, n in enumerate(nodes):
        m = n["memory"]["M_obs"]
        m["medial_count"]    += int(med[i])
        m["silhouette_count"] += int(sil[i])
        m["body_count"]       += int(body[i])
        m["rigs_seen"]        += int(rigs_seen[i])

    return nodes, {
        "depositCameras": int(cam_count),
        "depositRigs": int(len(rig_outputs)),
        "totalMedialDeposits": int(med.sum()),
        "totalSilhouetteDeposits": int(sil.sum()),
        "totalBodyDeposits": int(body.sum()),
        "meanRigsSeen": float(rigs_seen.mean()) if Nc else 0.0,
    }


# ── Phase 2b — Orientation tomography ("drag-a-stick-through-jelly") ───

def fibonacci_hemisphere(k):
    """Deterministic k unit vectors on the +Z hemisphere (orientation has
    axial symmetry — u and -u are the same axis). Golden-angle spiral; for
    k=200 the angular separation is ~10° (sufficient for peak detection).
    Returns (k, 3) float array."""
    if k <= 0:
        return np.zeros((0, 3))
    golden = (1.0 + np.sqrt(5.0)) / 2.0
    out = np.empty((k, 3))
    for i in range(k):
        # z in (0, 1] — upper hemisphere only.
        z = 1.0 - (i + 0.5) / k
        r = np.sqrt(max(0.0, 1.0 - z * z))
        theta = 2.0 * np.pi * i / golden
        out[i, 0] = r * np.cos(theta)
        out[i, 1] = r * np.sin(theta)
        out[i, 2] = z
    return out


def build_candidate_density_field(nodes, voxel=0.05, sigma_voxels=2.0,
                                    padding=4):
    """Voxelise the candidate cloud's M_obs-weighted positions into a
    scalar density field; Gaussian-smooth. Returns (grid, origin, voxel).

    Each candidate contributes weight = max(1, rigs_seen) — points the
    apparatus saw from many rigs deposit stronger. This is the field
    Phase 2b's probe cone slides through.
    """
    if not nodes:
        return np.zeros((1, 1, 1)), np.zeros(3), voxel
    pts = np.array([[n["x"], n["y"], n["z"]] for n in nodes])
    weights = np.array([max(1, n["memory"]["M_obs"]["rigs_seen"])
                        for n in nodes], dtype=np.float64)
    mins = pts.min(axis=0) - voxel * padding
    maxs = pts.max(axis=0) + voxel * padding
    nx = int(np.ceil((maxs[0] - mins[0]) / voxel)) + 1
    ny = int(np.ceil((maxs[1] - mins[1]) / voxel)) + 1
    nz = int(np.ceil((maxs[2] - mins[2]) / voxel)) + 1
    grid = np.zeros((nx, ny, nz), dtype=np.float64)
    ijk = np.floor((pts - mins) / voxel).astype(np.int64)
    ijk[:, 0] = np.clip(ijk[:, 0], 0, nx - 1)
    ijk[:, 1] = np.clip(ijk[:, 1], 0, ny - 1)
    ijk[:, 2] = np.clip(ijk[:, 2], 0, nz - 1)
    # Accumulate weighted deposits (np.add.at handles repeated indices).
    np.add.at(grid, (ijk[:, 0], ijk[:, 1], ijk[:, 2]), weights)
    grid = gaussian_filter(grid, sigma=sigma_voxels)
    return grid, mins, voxel


def sample_density_trilinear(grid, origin, voxel, pts):
    """Vectorised trilinear-nearest density sampler. pts: (N, 3). Returns
    (N,) float."""
    ijk = np.floor((pts - origin) / voxel).astype(np.int64)
    nx, ny, nz = grid.shape
    ijk[:, 0] = np.clip(ijk[:, 0], 0, nx - 1)
    ijk[:, 1] = np.clip(ijk[:, 1], 0, ny - 1)
    ijk[:, 2] = np.clip(ijk[:, 2], 0, nz - 1)
    return grid[ijk[:, 0], ijk[:, 1], ijk[:, 2]]


# Module globals for the Phase 2b worker pool (avoid repickling the
# density field per candidate chunk).
_TOMO_GRID = None
_TOMO_ORIGIN = None
_TOMO_VOXEL = None
_TOMO_DIRS = None
_TOMO_PARAMS = None


def _tomo_pool_init(grid, origin, voxel, directions, params):
    global _TOMO_GRID, _TOMO_ORIGIN, _TOMO_VOXEL, _TOMO_DIRS, _TOMO_PARAMS
    _TOMO_GRID = grid
    _TOMO_ORIGIN = origin
    _TOMO_VOXEL = voxel
    _TOMO_DIRS = directions
    _TOMO_PARAMS = params


def tomography_chunk(args):
    """Worker entrypoint. args = (chunk_idx, pts_chunk).
    Returns chunk_idx + per-candidate (scores, classification_idx, axis,
    confidence, top2_ratio)."""
    chunk_idx, pts_chunk = args
    grid = _TOMO_GRID
    origin = _TOMO_ORIGIN
    voxel = _TOMO_VOXEL
    dirs = _TOMO_DIRS
    p = _TOMO_PARAMS
    n_pts = len(pts_chunk)
    k = len(dirs)
    if n_pts == 0:
        return chunk_idx, np.zeros((0, k)), np.zeros(0, dtype=np.int8), \
               np.zeros((0, 3)), np.zeros(0), np.zeros(0)

    probe_len = p["probe_length"]
    n_samples = p["n_samples_along_drag"]
    perp_offset = p["perp_offset"]
    n_perp = p["n_perp_samples"]

    # Sample positions along drag — split into forward (+u, n/2 samples) and
    # backward (-u) halves so we can measure asymmetry per direction (tip
    # distinguisher: probe along axis sees structure forward but not back).
    half = max(2, n_samples // 2)
    s_plus = np.linspace(probe_len * 0.05, probe_len * 0.5, half)
    s_minus = -s_plus
    perp_az = np.linspace(0, 2 * np.pi, n_perp, endpoint=False)

    scores = np.zeros((n_pts, k), dtype=np.float64)
    asymmetry = np.zeros((n_pts, k), dtype=np.float64)
    for d_idx in range(k):
        u = dirs[d_idx]
        if abs(u[2]) < 0.999:
            ref = np.array([0.0, 0.0, 1.0])
        else:
            ref = np.array([1.0, 0.0, 0.0])
        e1 = np.cross(u, ref)
        e1 = e1 / (np.linalg.norm(e1) + 1e-12)
        e2 = np.cross(u, e1)

        # Forward / backward density-along.
        pl = pts_chunk[:, None, :] + s_plus[None, :, None] * u
        mi = pts_chunk[:, None, :] + s_minus[None, :, None] * u
        d_plus = sample_density_trilinear(grid, origin, voxel,
                                            pl.reshape(-1, 3)).reshape(n_pts, half)
        d_minus = sample_density_trilinear(grid, origin, voxel,
                                             mi.reshape(-1, 3)).reshape(n_pts, half)
        d_along_mean = 0.5 * (d_plus.mean(axis=1) + d_minus.mean(axis=1))

        # Perpendicular ring at probe centre (s=0) at radius perp_offset.
        ring_offsets = (np.cos(perp_az)[:, None] * e1 +
                        np.sin(perp_az)[:, None] * e2) * perp_offset
        ring = pts_chunk[:, None, :] + ring_offsets[None, :, :]
        d_perp = sample_density_trilinear(grid, origin, voxel,
                                            ring.reshape(-1, 3)).reshape(n_pts, n_perp)
        d_perp_mean = d_perp.mean(axis=1)

        # Tubularity score = max(0, d_along - d_perp). Raw difference
        # preserves dynamic range across directions — ratio normalisation
        # collapsed to ~constant across directions in dev runs because the
        # candidate cloud's overall density swamped the directional gradient.
        scores[:, d_idx] = np.maximum(0.0, d_along_mean - d_perp_mean)
        # Asymmetry: |forward - backward| / total. High asymmetry + peaked
        # score on this axis = tip; low asymmetry + peaked score = linear.
        plus_mean = d_plus.mean(axis=1)
        minus_mean = d_minus.mean(axis=1)
        asymmetry[:, d_idx] = (np.abs(plus_mean - minus_mean) /
                                (plus_mean + minus_mean + 1e-9))

    # Per-point classification via greedy non-maximum-suppression on the
    # hemisphere (top peak, plus any peak ≥ peak_ratio of top and angularly
    # separated by ≥ peak_angular_radius).
    classifications = np.zeros(n_pts, dtype=np.int8)
    axes = np.zeros((n_pts, 3))
    confidences = np.zeros(n_pts)
    top2 = np.zeros(n_pts)
    flat_thresh = p["flat_threshold"]
    peak_ratio = p["peak_ratio_threshold"]
    cos_angular = np.cos(p["peak_angular_radius_rad"])
    tip_asym = p["tip_asymmetry_threshold"]
    junction_min_peak = p["junction_min_peak_score"]

    for i in range(n_pts):
        s = scores[i]
        s_max = s.max()
        s_mean = s.mean()
        sharpness = s_max - s_mean
        order = np.argsort(-s)
        # Greedy NMS — collect peaks.
        peaks = []
        for idx in order:
            if s[idx] < peak_ratio * s_max:
                break
            if s[idx] < junction_min_peak:
                # Below the per-peak floor — only the very-top can pass.
                if peaks:
                    continue
            ok = True
            for pi in peaks:
                if dirs[idx] @ dirs[pi] > cos_angular:
                    ok = False
                    break
            if ok:
                peaks.append(idx)
                if len(peaks) >= 4:
                    break
        primary = peaks[0] if peaks else int(order[0])
        axes[i] = dirs[primary]
        confidences[i] = sharpness
        # top2_ratio uses second-NMS peak if any, else 2nd order.
        if len(peaks) >= 2:
            top2[i] = s[peaks[1]] / max(s_max, 1e-9)
        elif k > 1:
            top2[i] = s[order[1]] / max(s_max, 1e-9)

        if sharpness < flat_thresh:
            classifications[i] = CLS_NOISE
        elif len(peaks) >= 2:
            classifications[i] = CLS_JUNCTION
        elif asymmetry[i, primary] > tip_asym:
            classifications[i] = CLS_TIP
        else:
            classifications[i] = CLS_LINEAR_INTERIOR

    return chunk_idx, scores, classifications, axes, confidences, top2


# Classification codes (int8 for compact wire transfer).
CLS_NOISE = 0
CLS_LINEAR_INTERIOR = 1
CLS_JUNCTION = 2
CLS_TIP = 3
CLS_NAMES = {0: "noise", 1: "linear-interior", 2: "junction", 3: "tip"}


def orientation_tomography(nodes, k_orient=200, probe_length=0.10,
                            perp_offset=0.04, n_samples_along_drag=8,
                            n_perp_samples=8, flat_threshold=0.010,
                            peak_ratio_threshold=0.75,
                            peak_angular_radius_deg=60.0,
                            tip_asymmetry_threshold=0.18,
                            junction_min_peak_score=0.0,
                            density_voxel=0.03,
                            density_sigma_voxels=1.0,
                            n_workers=None, chunk_size=512):
    """Phase 2b end-to-end: build candidate-density field, sample K_orient
    Fibonacci-on-hemisphere directions per candidate, classify by
    score-distribution shape. Updates nodes in-place + returns stats dict.

    Posture-B-pure: the density field is built from the 3D candidate
    positions recovered in Phase 1 (themselves derived from rendered
    pixels). No source 3D label lookups.
    """
    if not nodes:
        return nodes, {"tomographyCandidates": 0}

    t0 = time.time()
    grid, origin, voxel = build_candidate_density_field(
        nodes, voxel=density_voxel, sigma_voxels=density_sigma_voxels)
    t_grid = time.time() - t0

    dirs = fibonacci_hemisphere(k_orient)
    pts = np.array([[n["x"], n["y"], n["z"]] for n in nodes])

    params = {
        "probe_length": probe_length,
        "perp_offset": perp_offset,
        "n_samples_along_drag": n_samples_along_drag,
        "n_perp_samples": n_perp_samples,
        "flat_threshold": flat_threshold,
        "peak_ratio_threshold": peak_ratio_threshold,
        "peak_angular_radius_rad": np.deg2rad(peak_angular_radius_deg),
        "tip_asymmetry_threshold": tip_asymmetry_threshold,
        "junction_min_peak_score": junction_min_peak_score,
    }

    if n_workers is None:
        n_workers = max(1, cpu_count() - 1)

    # Slice candidates into chunks for parallel processing.
    chunks = [(i, pts[i:i + chunk_size])
              for i in range(0, len(pts), chunk_size)]

    t1 = time.time()
    if n_workers == 1 or len(chunks) <= 2:
        _tomo_pool_init(grid, origin, voxel, dirs, params)
        chunk_results = [tomography_chunk(c) for c in chunks]
    else:
        with Pool(processes=n_workers,
                  initializer=_tomo_pool_init,
                  initargs=(grid, origin, voxel, dirs, params)) as pool:
            chunk_results = pool.map(tomography_chunk, chunks)
    t_score = time.time() - t1

    # Stitch chunk outputs back into nodes in order.
    chunk_results.sort(key=lambda r: r[0])
    cursor = 0
    class_counts = {name: 0 for name in CLS_NAMES.values()}
    for (_idx, _scores, cls, axes, confs, top2) in chunk_results:
        for j in range(len(cls)):
            n = nodes[cursor + j]
            cname = CLS_NAMES[int(cls[j])]
            n["memory"]["tomography"] = {
                "classification": cname,
                "axis": [float(axes[j, 0]), float(axes[j, 1]),
                         float(axes[j, 2])],
                "confidence": float(confs[j]),
                "top2_ratio": float(top2[j]),
            }
            n["memory"]["classification"] = cname
            class_counts[cname] += 1
        cursor += len(cls)

    return nodes, {
        "tomographyCandidates": int(len(nodes)),
        "tomographyKOrient": int(k_orient),
        "tomographyClassCounts": class_counts,
        "tomographyGridMs": int(t_grid * 1000),
        "tomographyScoreMs": int(t_score * 1000),
        "densityGridShape": list(grid.shape),
    }


# ── Phase 2c — patient iteration helpers ────────────────────────────────

def m_obs_total(nodes):
    """Sum of dominant M_obs channels across all nodes — used for
    termination criterion (M_obs delta < eps_memory across passes)."""
    total = 0
    for n in nodes:
        m = n["memory"]["M_obs"]
        total += m["medial_count"] + m["silhouette_count"] + m["body_count"]
    return total


# ── Top-level pipeline ──────────────────────────────────────────────────

def run_lil_vera(laz_path, n_rigs, k_orient, pitch_ratio, voxel_size,
                  image_w=384, image_h=288, splat_radius=1,
                  consolidation_voxel=0.05, n_workers=None,
                  passes=1, eps_memory=0.005,
                  probe_length=0.10, perp_offset=0.04,
                  density_voxel=0.05, density_sigma_voxels=2.0):
    """Stage N.2.1 end-to-end: Phase 1 + Phase 2a + Phase 2b, looped over
    `passes` with monotone M_obs growth and stability-based termination."""
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

    # Intrinsics (shared across rigs).
    K = build_intrinsics(image_w, image_h, vfov_deg=45.0)
    target_h = tree_height * 0.5

    if n_workers is None:
        n_workers = max(1, cpu_count() - 1)

    # State accumulated across passes.
    nodes = []
    seen_voxels = {}
    pre_consolidation_total = 0
    deposit_stats_aggregate = {"depositCameras": 0, "depositRigs": 0,
                                "totalMedialDeposits": 0,
                                "totalSilhouetteDeposits": 0,
                                "totalBodyDeposits": 0}
    per_pass = []
    prev_m_obs = 0
    tomo_stats = {}
    total_mask_pixels = 0
    total_medial_pixels = 0
    t_observe_total = 0.0
    t_deposit_total = 0.0
    t_tomo_total = 0.0
    t_consolidate_total = 0.0

    for pass_idx in range(passes):
        pass_t0 = time.time()
        # Deterministic per-pass azimuth offset for interleaved coverage
        # across multi-pass runs (per Phase 2c: monotone M_obs growth).
        pass_offset = pass_idx * (2.0 * np.pi / max(1, passes * n_rigs))
        rigs = generate_rig_positions(n_rigs, tree_height, tree_radius,
                                       pitch_ratio)
        for i, r in enumerate(rigs):
            r["_idx"] = i
            r["azimuth"] = r["azimuth"] + pass_offset

        # Phase 1 — per-rig observation in parallel.
        t1 = time.time()
        if n_workers == 1 or len(rigs) < 4:
            _pool_init(pts, K, target_h, image_w, image_h, splat_radius)
            rig_outputs = [observe_rig(r) for r in rigs]
        else:
            with Pool(processes=n_workers,
                      initializer=_pool_init,
                      initargs=(pts, K, target_h, image_w, image_h, splat_radius)) as pool:
                rig_outputs = pool.map(observe_rig, rigs)
        t_observe = time.time() - t1
        t_observe_total += t_observe

        # Consolidate this pass's candidates into the rolling node set.
        t2 = time.time()
        if pass_idx == 0:
            nodes, consol_stats = consolidate_to_chains(
                rig_outputs, voxel=consolidation_voxel)
            seen_voxels = {(int(round(n["x"] / consolidation_voxel)),
                            int(round(n["y"] / consolidation_voxel)),
                            int(round(n["z"] / consolidation_voxel))): i
                           for i, n in enumerate(nodes)}
            pre_consolidation_total = consol_stats["candidatesPreConsolidation"]
        else:
            # Merge new pass candidates into the existing node set,
            # preserving voxel identity. Chain-links use the new (pair) per
            # rig within the pass.
            add_count = 0
            for ro in rig_outputs:
                prev_idx_in_chain = {}
                for cand in ro["candidates"]:
                    pre_consolidation_total += 1
                    wx, wy, wz = cand["world"]
                    vk = (int(round(wx / consolidation_voxel)),
                          int(round(wy / consolidation_voxel)),
                          int(round(wz / consolidation_voxel)))
                    if vk in seen_voxels:
                        node_idx = seen_voxels[vk]
                    else:
                        node_idx = len(nodes)
                        seen_voxels[vk] = node_idx
                        parent = prev_idx_in_chain.get(cand["pair"], -1)
                        nodes.append({
                            "x": float(wx), "y": float(wy), "z": float(wz),
                            "radius": 0.02,
                            "parentIdx": int(parent),
                            "memory": {
                                "M_obs": {"silhouette_count": 0,
                                          "medial_count": 0,
                                          "body_count": 0, "rigs_seen": 0},
                                "M_interp": {},
                                "classification": "unclassified",
                                "tomography": None,
                            },
                        })
                        add_count += 1
                    prev_idx_in_chain[cand["pair"]] = node_idx
            consol_stats = {"candidatesPreConsolidation": pre_consolidation_total,
                            "nodesPostConsolidation": len(nodes),
                            "consolidationVoxel": consolidation_voxel,
                            "nodesAddedThisPass": add_count}
        t_consolidate_total += time.time() - t2

        # Per-rig view stats summary (accumulated for reporting).
        for ro in rig_outputs:
            for vs in ro["view_stats"]:
                total_mask_pixels += vs["mask"]
                total_medial_pixels += vs["medial"]

        # Phase 2a — multi-rig consensus deposit (mask re-lookup).
        t3 = time.time()
        nodes, deposit_stats = multi_rig_consensus_deposit(
            nodes, rig_outputs, K, image_w, image_h)
        for k_, v_ in deposit_stats.items():
            if isinstance(v_, (int, float)):
                deposit_stats_aggregate[k_] = (
                    deposit_stats_aggregate.get(k_, 0) + v_)
        t_deposit_total += time.time() - t3

        # Drop the heavy per-rig view masks now that 2a has read them —
        # frees memory before the tomography step (which builds its own
        # voxel grid).
        for ro in rig_outputs:
            ro["views"] = None

        # Phase 2b — orientation tomography (rebuilt density field each
        # pass since the candidate set grew).
        t4 = time.time()
        nodes, tomo_stats = orientation_tomography(
            nodes, k_orient=k_orient,
            probe_length=probe_length,
            perp_offset=perp_offset,
            density_voxel=density_voxel,
            density_sigma_voxels=density_sigma_voxels,
            n_workers=n_workers,
        )
        t_tomo_total += time.time() - t4

        # Per-pass diagnostic snapshot.
        m_obs_now = m_obs_total(nodes)
        m_obs_delta = ((m_obs_now - prev_m_obs) / max(m_obs_now, 1)
                        if prev_m_obs > 0 else 1.0)
        per_pass.append({
            "passIdx": pass_idx,
            "rigsInPass": len(rigs),
            "nodesAfter": len(nodes),
            "candidatesPreConsolidationCum": pre_consolidation_total,
            "mObsTotal": int(m_obs_now),
            "mObsDelta": float(m_obs_delta),
            "tomoClassCounts": tomo_stats.get("tomographyClassCounts", {}),
            "passMs": int((time.time() - pass_t0) * 1000),
        })
        prev_m_obs = m_obs_now

        # Termination: M_obs accumulation flattened across passes (only
        # after pass 1, since pass 0 sets the baseline).
        if pass_idx > 0 and m_obs_delta < eps_memory:
            break

    # Wire-node assembly: carry the M_obs channels + tomography classification
    # + axis so the LidarWorkstage heatmap layer can color by channel without
    # a second round-trip.
    wire_nodes = []
    classifications = {name: 0 for name in CLS_NAMES.values()}
    classifications["unclassified"] = 0
    for n in nodes:
        m = n["memory"]["M_obs"]
        tomo = n["memory"]["tomography"]
        wire_nodes.append({
            "x": n["x"], "y": n["y"], "z": n["z"],
            "radius": n["radius"], "parentIdx": n["parentIdx"],
            "classification": n["memory"]["classification"],
            "silhouetteCount": m["silhouette_count"],
            "medialCount": m["medial_count"],
            "bodyCount": m["body_count"],
            "rigsSeen": m["rigs_seen"],
            "tomoAxis": tomo["axis"] if tomo else None,
            "tomoConfidence": tomo["confidence"] if tomo else 0.0,
            "tomoTop2Ratio": tomo["top2_ratio"] if tomo else 0.0,
        })
        c = n["memory"]["classification"]
        classifications[c] = classifications.get(c, 0) + 1

    median_r = 0.02
    result = {
        "nodes": wire_nodes,
        "stats": {
            "pointsRaw": int(len(pts_raw)),
            "pointsDownsampled": int(len(pts)),
            "treeHeight": tree_height,
            "treeRadius": tree_radius,
            "rigs": n_rigs,
            "rigsPerPass": n_rigs,
            "passes": len(per_pass),
            "passesRequested": passes,
            "cameras": 3 * n_rigs * len(per_pass),
            "totalSilhouettePixels": int(total_mask_pixels),
            "totalMedialPixels": int(total_medial_pixels),
            "candidatesPreConsolidation": int(pre_consolidation_total),
            "nodes": len(wire_nodes),
            "cylinders": sum(1 for n in wire_nodes if n["parentIdx"] >= 0),
            "trunkLike": 0,
            "branchLike": len(wire_nodes),
            "medianRadius": median_r,
            "classifications": classifications,
            "tomography": tomo_stats,
            "deposit": deposit_stats_aggregate,
            "elapsedMs": int((time.time() - t0) * 1000),
            "loadMs": int(t_load * 1000),
            "observeMs": int(t_observe_total * 1000),
            "depositMs": int(t_deposit_total * 1000),
            "tomographyMs": int(t_tomo_total * 1000),
            "consolidateMs": int(t_consolidate_total * 1000),
            "workers": int(n_workers),
            "terminatedByMObsStability": (len(per_pass) < passes),
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
            "passes": int(passes),
            "epsMemory": float(eps_memory),
            "probeLength": float(probe_length),
            "perpOffset": float(perp_offset),
            "densityVoxel": float(density_voxel),
            "densitySigmaVoxels": float(density_sigma_voxels),
            "stage": "N.2.1",
        },
        "memoryScaffold": {
            "channels": ["M_obs.silhouette_count", "M_obs.medial_count",
                         "M_obs.body_count", "M_obs.rigs_seen",
                         "tomography.classification", "tomography.axis",
                         "tomography.confidence", "tomography.top2_ratio",
                         "M_interp.*"],
            "perPointCount": len(wire_nodes),
            "note": ("M_obs populated by Phase 2a mask re-lookup + Phase 2b "
                     "tomography. M_interp still empty (Phase 3 / N.2.2)."),
        },
        "perPassDiagnostics": per_pass,
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
    ap = argparse.ArgumentParser(description="Project: Li'l Vera, Stage N.2.1 — evidence accumulation + orientation tomography")
    ap.add_argument("--treeId", required=True)
    ap.add_argument("--N", type=int, default=50,
                    help="Total rig positions (dev: 50; overnight load-bearing: 500)")
    ap.add_argument("--kOrient", type=int, default=200,
                    help="Orientation tomography samples per point (Fibonacci-on-hemisphere)")
    ap.add_argument("--passes", type=int, default=1,
                    help="Patient-iteration passes; M_obs additive across passes with deterministic azimuth interleave")
    ap.add_argument("--epsMemory", type=float, default=0.005,
                    help="Per-pass M_obs delta termination threshold (passes>1)")
    ap.add_argument("--probeLength", type=float, default=0.10,
                    help="Phase 2b probe-cone length along drag (m)")
    ap.add_argument("--perpOffset", type=float, default=0.04,
                    help="Phase 2b perpendicular sampling radius around axis (m)")
    ap.add_argument("--densityVoxel", type=float, default=0.05,
                    help="Phase 2b candidate-density field voxel size (m)")
    ap.add_argument("--densitySigmaVoxels", type=float, default=2.0,
                    help="Phase 2b Gaussian smoothing sigma in voxel units")
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
        passes=args.passes,
        eps_memory=args.epsMemory,
        probe_length=args.probeLength,
        perp_offset=args.perpOffset,
        density_voxel=args.densityVoxel,
        density_sigma_voxels=args.densitySigmaVoxels,
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
