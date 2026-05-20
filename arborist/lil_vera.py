#!/usr/bin/env python3
"""
lil_vera.py — Project: Li'l Vera, Cycle 1, Stage N.2.2
              (Skeleton extraction: ridge + reach + taper).

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

Stage N.2.1 (landed 2026-05-20):
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

Stage N.2.2 (this stage, 2026-05-20):
  - Phase 3a — Ridge extraction. Compute 3D Hessian on the smoothed M_obs
    scalar field; per-voxel eigendecomposition (np.linalg.eigh on a batched
    (..., 3, 3) array). Ridge voxels: tube-ratio |λ_along| / |λ_perp_avg|
    below threshold AND λ_max strongly negative (concave high-density
    tube) AND M_obs above the ridge percentile. Trace from tomography-
    classified tip seeds + a trunk-base seed; follow v_axis in voxel-
    fractional steps until exit of the ridge mask.
  - Phase 3b — Axonal glimpse-reach. For each ridge-fragment endpoint,
    spawn a confidence-cone probe along the chain's last-segment axis;
    sample M_obs at probe steps; absorb glimpses where M_obs ≥
    glimpse_threshold (below ridge_threshold per the brief). Mutual
    recognition: connect fragments A and B only when A's probe trail
    converges within `mutual_distance` of B's endpoint AND B's reciprocal
    probe converges to A. Absorbed positions deposit into the
    M_interp.absorption_count channel — separate from M_obs to safeguard
    against positive-feedback hallucination.
  - Phase 3c — Taper-projected tip extrapolation. For each unconnected
    endpoint, estimate local taper τ = |dr/ds| from radii sampled by
    M_obs cross-section at perpendicular offsets along the last few
    chain segments. Project a tip at arc-length r/τ along the last
    axial direction; otherwise flag uncertain.
  - Phase 3d — Interleaved per-pass iteration of 3a→3b→3c. M_obs frozen
    (3b writes M_interp); iteration terminates when no new connections,
    no new absorptions, no new tip projections in a full pass.

NOT YET IMPLEMENTED (later stages, do not add here):
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
        return nodes, {"tomographyCandidates": 0}, None

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
    }, (grid, origin, voxel)


# ── Phase 2c — patient iteration helpers ────────────────────────────────

def m_obs_total(nodes):
    """Sum of dominant M_obs channels across all nodes — used for
    termination criterion (M_obs delta < eps_memory across passes)."""
    total = 0
    for n in nodes:
        m = n["memory"]["M_obs"]
        total += m["medial_count"] + m["silhouette_count"] + m["body_count"]
    return total


# ── Phase 3a — Hessian ridge tracing ───────────────────────────────────

def compute_hessian_eigh(grid, voxel):
    """3D Hessian via central differences on the smoothed M_obs grid; per
    voxel symmetric eigendecomposition via np.linalg.eigh.

    Returns:
        eigvals: (nx, ny, nz, 3) — eigenvalues ascending
        eigvecs: (nx, ny, nz, 3, 3) — corresponding eigenvectors as columns
        M:       (nx, ny, nz)      — local |λ_smallest| / |λ_largest| ratio
                                       and tubularity flags can be derived
                                       by callers from eigvals.

    Vectorised; the eigh call dominates wall time. For an N=500 tree the
    candidate-density grid is ~150×150×400 voxels = 9M cells; eigh on a
    batched (9M, 3, 3) input is ~10s. Mitigation: callers should mask to
    M_obs > threshold before this call.
    """
    # First derivatives.
    gx, gy, gz = np.gradient(grid, voxel)
    # Second derivatives.
    gxx, gxy, gxz = np.gradient(gx, voxel)
    _, gyy, gyz = np.gradient(gy, voxel)
    _, _, gzz = np.gradient(gz, voxel)
    nx, ny, nz = grid.shape
    H = np.zeros((nx, ny, nz, 3, 3), dtype=np.float64)
    H[..., 0, 0] = gxx
    H[..., 0, 1] = gxy
    H[..., 0, 2] = gxz
    H[..., 1, 0] = gxy
    H[..., 1, 1] = gyy
    H[..., 1, 2] = gyz
    H[..., 2, 0] = gxz
    H[..., 2, 1] = gyz
    H[..., 2, 2] = gzz
    eigvals, eigvecs = np.linalg.eigh(H)
    return eigvals, eigvecs


def detect_ridge_mask(grid, eigvals, eigvecs, m_obs_threshold,
                       tube_ratio_threshold=0.35):
    """A voxel is ridge-like if:
      - M_obs above threshold (mask: structure-bearing region)
      - |λ_2|, |λ_3| << |λ_1| (where λ_1 is largest-|λ| — the cross-section
        principal curvature dominates; tube cross-sectional curvature is
        much larger than along-axis curvature)
      - the axis direction is the eigenvector with the smallest |eigenvalue|
        (perpendicular to the dominant curvature plane)

    np.linalg.eigh returns eigenvalues in ascending order, so:
      eigvals[..., 0] is λ_min (signed), eigvals[..., 2] is λ_max.
      The axis (along-tube) direction = eigvec for the eigenvalue with the
      smallest absolute value among the three.

    Tube condition (high-density tube → all 3 eigvals negative; |λ_min_abs|
    is much smaller than |λ_max_abs|):
        |λ_along| / |λ_perp_avg| < tube_ratio_threshold
    Returns: ridge_mask (bool), v_axis (..., 3) — the along-tube unit vector
    per voxel.
    """
    abs_eig = np.abs(eigvals)
    # Sort indices by |λ| ascending per voxel so [..., 0] is along-tube.
    order = np.argsort(abs_eig, axis=-1)
    abs_sorted = np.take_along_axis(abs_eig, order, axis=-1)
    # Tube ratio: smallest / mean of larger two.
    perp_mean = 0.5 * (abs_sorted[..., 1] + abs_sorted[..., 2]) + 1e-12
    tube_ratio = abs_sorted[..., 0] / perp_mean
    # Axis eigenvector index.
    axis_idx = order[..., 0]
    # gather eigvecs[..., :, axis_idx] → axis vector per voxel.
    # eigvecs has shape (..., 3, 3); column k is the k-th eigenvector.
    # We take the column indexed by axis_idx per voxel.
    iax = axis_idx[..., None, None]
    v_axis = np.take_along_axis(eigvecs, iax.repeat(3, axis=-2), axis=-1).squeeze(-1)
    # Tubularity also requires high-density (concave) — at least one λ
    # strongly negative.
    lambda_max_neg = eigvals[..., 0]  # smallest signed eigenvalue (most neg)
    is_tubelike = (tube_ratio < tube_ratio_threshold) & (lambda_max_neg < 0)
    above_obs = grid > m_obs_threshold
    ridge_mask = is_tubelike & above_obs
    return ridge_mask, v_axis


def world_to_voxel(p, origin, voxel):
    """Vectorised world→voxel index conversion. p: (..., 3); origin: (3,)."""
    return np.floor((p - origin) / voxel).astype(np.int64)


def sample_grid_nearest(grid, origin, voxel, p):
    """Single-point nearest-voxel grid sample. Returns 0.0 if out of bounds."""
    nx, ny, nz = grid.shape
    ijk = np.floor((p - origin) / voxel).astype(np.int64)
    if (ijk[0] < 0 or ijk[0] >= nx or
        ijk[1] < 0 or ijk[1] >= ny or
        ijk[2] < 0 or ijk[2] >= nz):
        return 0.0
    return float(grid[ijk[0], ijk[1], ijk[2]])


def trace_ridge_from_seed(seed_world, ridge_mask, v_axis_field, grid, origin,
                            voxel, max_steps=300, step_factor=0.5,
                            m_obs_threshold=0.0):
    """Walk along v_axis from `seed_world` (3D point) in both directions
    until exit of ridge_mask OR M_obs falls below threshold. Returns
    polyline (N, 3) — concatenation of the backward-walk reversed + forward-walk.
    """
    nx, ny, nz = ridge_mask.shape
    step = voxel * step_factor

    def in_bounds(ijk):
        return (0 <= ijk[0] < nx and 0 <= ijk[1] < ny and 0 <= ijk[2] < nz)

    seed_ijk = world_to_voxel(np.asarray(seed_world), origin, voxel)
    if not in_bounds(seed_ijk) or not ridge_mask[tuple(seed_ijk)]:
        # Try a small neighbourhood for a ridge voxel near the seed.
        found = None
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                for dz in range(-2, 3):
                    nb = seed_ijk + np.array([dx, dy, dz])
                    if in_bounds(nb) and ridge_mask[tuple(nb)]:
                        found = nb
                        break
                if found is not None:
                    break
            if found is not None:
                break
        if found is None:
            return None
        seed_ijk = found

    # Initial axis from seed voxel.
    axis_init = v_axis_field[tuple(seed_ijk)]
    if np.linalg.norm(axis_init) < 1e-9:
        return None

    def walk(direction):
        path = []
        cur = origin + (seed_ijk + 0.5) * voxel
        axis = axis_init * direction
        for _ in range(max_steps):
            nxt = cur + step * axis
            ijk = world_to_voxel(nxt, origin, voxel)
            if not in_bounds(ijk):
                break
            if not ridge_mask[tuple(ijk)]:
                break
            if grid[tuple(ijk)] < m_obs_threshold:
                break
            new_axis = v_axis_field[tuple(ijk)]
            # Preserve direction sign — eigh's axis flip-ambiguity needs
            # alignment to current axis.
            if new_axis @ axis < 0:
                new_axis = -new_axis
            axis = new_axis / (np.linalg.norm(new_axis) + 1e-12)
            cur = nxt
            path.append(cur.copy())
        return path

    forward = walk(+1.0)
    backward = walk(-1.0)
    # Concatenate: backward reversed + seed + forward.
    seed_pt = origin + (seed_ijk + 0.5) * voxel
    polyline = list(reversed(backward)) + [seed_pt] + forward
    if len(polyline) < 3:
        return None
    return np.array(polyline)


def ridge_extraction(nodes, density_grid_tuple, m_obs_threshold,
                       tube_ratio_threshold=0.35, max_trace_steps=300,
                       trace_step_factor=0.5, seed_min_confidence=0.0,
                       dedupe_voxel_factor=2.0):
    """Phase 3a end-to-end. Returns:
        fragments: list of polylines (each (N, 3) array)
        stats dict
    """
    grid, origin, voxel = density_grid_tuple
    t0 = time.time()
    eigvals, eigvecs = compute_hessian_eigh(grid, voxel)
    ridge_mask, v_axis = detect_ridge_mask(grid, eigvals, eigvecs,
                                             m_obs_threshold, tube_ratio_threshold)
    t_hessian = time.time() - t0
    # Seeds = tomography-classified tips above min confidence + the lowest
    # candidate (trunk-base seeding so the trunk gets traced too).
    tip_seeds = []
    for n in nodes:
        tomo = n["memory"].get("tomography")
        if not tomo:
            continue
        if tomo["classification"] == "tip" and tomo["confidence"] >= seed_min_confidence:
            tip_seeds.append([n["x"], n["y"], n["z"]])
    # Trunk-base seed: lowest-z node with high rigs_seen.
    sorted_by_z = sorted(nodes, key=lambda n: n["z"])
    for n in sorted_by_z[:50]:
        if n["memory"]["M_obs"]["rigs_seen"] > 5:
            tip_seeds.append([n["x"], n["y"], n["z"]])
            break

    fragments = []
    seed_polylines_voxels = set()
    dedupe_voxel = voxel * dedupe_voxel_factor
    for seed in tip_seeds:
        polyline = trace_ridge_from_seed(np.asarray(seed), ridge_mask, v_axis,
                                            grid, origin, voxel,
                                            max_steps=max_trace_steps,
                                            step_factor=trace_step_factor,
                                            m_obs_threshold=m_obs_threshold)
        if polyline is None or len(polyline) < 3:
            continue
        # Dedupe near-identical fragments (same seed area produces same
        # polyline through different tip seeds in a junction).
        head_vox = tuple(np.floor(polyline[0] / dedupe_voxel).astype(int))
        tail_vox = tuple(np.floor(polyline[-1] / dedupe_voxel).astype(int))
        key = (head_vox, tail_vox) if head_vox < tail_vox else (tail_vox, head_vox)
        if key in seed_polylines_voxels:
            continue
        seed_polylines_voxels.add(key)
        fragments.append(polyline)

    return fragments, {
        "ridgeHessianMs": int(t_hessian * 1000),
        "ridgeMaskVoxels": int(ridge_mask.sum()),
        "ridgeSeeds": int(len(tip_seeds)),
        "ridgeFragments": int(len(fragments)),
    }


# ── Phase 3b — Axonal glimpse-reach ────────────────────────────────────

def reach_endpoint(endpoint, axial_dir, grid, origin, voxel,
                    glimpse_threshold, step_size, max_failures=5, max_steps=40):
    """March a confidence cone forward from `endpoint` along `axial_dir`.
    At each step sample M_obs at centre; if above glimpse_threshold, absorb;
    else increment fail counter. Returns list of absorbed positions."""
    absorbed = []
    fails = 0
    cur = endpoint.copy()
    axis = axial_dir / (np.linalg.norm(axial_dir) + 1e-12)
    for _ in range(max_steps):
        cur = cur + step_size * axis
        m = sample_grid_nearest(grid, origin, voxel, cur)
        if m >= glimpse_threshold:
            absorbed.append(cur.copy())
            fails = 0
        else:
            fails += 1
            if fails >= max_failures:
                break
    return absorbed


def axonal_glimpse_reach(fragments, density_grid_tuple, glimpse_threshold,
                           step_size=0.05, max_failures=5, max_steps=40,
                           mutual_distance=0.10):
    """Phase 3b: for each fragment endpoint, probe forward with confidence
    cone; absorb glimpses where M_obs ≥ glimpse_threshold. Mutual recognition:
    when A's probe trajectory ends within mutual_distance of B's endpoint
    AND B's reciprocal probe ends within mutual_distance of A's endpoint,
    record a connection.

    Returns:
      extended_fragments: list of polylines extended by absorbed glimpses
      connections: list of (frag_a_idx, end_a, frag_b_idx, end_b) tuples
        end ∈ {"head", "tail"}
      m_interp_deposits: list of (xyz, count) tuples for M_interp population
    """
    grid, origin, voxel = density_grid_tuple
    extended = [f.copy() for f in fragments]
    # Per-fragment per-endpoint absorbed trajectories.
    head_abs = [None] * len(fragments)
    tail_abs = [None] * len(fragments)
    head_axis = [None] * len(fragments)
    tail_axis = [None] * len(fragments)

    for i, frag in enumerate(fragments):
        if len(frag) < 2:
            continue
        # Tail = end-of-chain endpoint.
        tail = frag[-1]
        tail_dir = frag[-1] - frag[-2]
        tail_axis[i] = tail_dir
        tail_abs[i] = reach_endpoint(tail, tail_dir, grid, origin, voxel,
                                       glimpse_threshold, step_size,
                                       max_failures, max_steps)
        head = frag[0]
        head_dir = frag[0] - frag[1]
        head_axis[i] = head_dir
        head_abs[i] = reach_endpoint(head, head_dir, grid, origin, voxel,
                                       glimpse_threshold, step_size,
                                       max_failures, max_steps)

    # Extend fragments with absorbed glimpses.
    for i, frag in enumerate(fragments):
        if tail_abs[i]:
            extended[i] = np.vstack([extended[i], tail_abs[i]])
        if head_abs[i]:
            extended[i] = np.vstack([head_abs[i][::-1], extended[i]])

    # Mutual recognition (strict): both probe trails converge to each
    # other's endpoint. High-confidence connection.
    endpoints = []  # list of (frag_idx, "head"/"tail", position, trajectory)
    for i in range(len(fragments)):
        if len(fragments[i]) < 2:
            continue
        endpoints.append((i, "head", fragments[i][0], head_abs[i] or []))
        endpoints.append((i, "tail", fragments[i][-1], tail_abs[i] or []))

    connections = []
    seen_pairs = set()
    connected_frag_endpoints = set()  # (frag_idx, end_label) already connected
    for a_idx, a in enumerate(endpoints):
        i_a, end_a, pos_a, traj_a = a
        if not traj_a:
            continue
        trail_a_end = traj_a[-1]
        for b_idx, b in enumerate(endpoints):
            if a_idx == b_idx:
                continue
            i_b, end_b, pos_b, traj_b = b
            if i_a == i_b:
                continue
            d_ab = np.linalg.norm(trail_a_end - pos_b)
            if d_ab > mutual_distance:
                continue
            if not traj_b:
                continue
            d_ba = np.linalg.norm(traj_b[-1] - pos_a)
            if d_ba > mutual_distance:
                continue
            key = tuple(sorted([(i_a, end_a), (i_b, end_b)]))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            connections.append((i_a, end_a, i_b, end_b))
            connected_frag_endpoints.add((i_a, end_a))
            connected_frag_endpoints.add((i_b, end_b))

    # Proximity-merge fallback. For each still-unconnected endpoint, find
    # the nearest still-unconnected endpoint on a DIFFERENT fragment within
    # `proximity_merge_radius` (= 2× mutual_distance — the soft connector
    # — operator gate requires a single connected graph). Greedy by
    # ascending distance so the closest pairs join first. Without this,
    # ridge-tracing produces clean but disconnected fragments at every
    # branch-point divergence.
    from scipy.spatial import cKDTree as _ckd
    if endpoints:
        endpoint_pts = np.array([e[2] for e in endpoints])
        tree = _ckd(endpoint_pts)
        proximity_radius = 2.0 * mutual_distance
        # All-pairs within radius, sorted ascending.
        pairs = []
        for i, e in enumerate(endpoints):
            for j in tree.query_ball_point(e[2], r=proximity_radius):
                if j <= i:
                    continue
                if endpoints[i][0] == endpoints[j][0]:
                    continue
                d = np.linalg.norm(endpoint_pts[i] - endpoint_pts[j])
                pairs.append((d, i, j))
        pairs.sort()
        # Union-find over fragment indices to keep one connected component
        # per merged group (avoid daisy-chained cycles).
        parent = {i: i for i in range(len(fragments))}
        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for d, i, j in pairs:
            i_a, end_a, pos_a, _ = endpoints[i]
            i_b, end_b, pos_b, _ = endpoints[j]
            if (i_a, end_a) in connected_frag_endpoints:
                continue
            if (i_b, end_b) in connected_frag_endpoints:
                continue
            ra, rb = find(i_a), find(i_b)
            if ra == rb:
                continue
            parent[ra] = rb
            connections.append((i_a, end_a, i_b, end_b))
            connected_frag_endpoints.add((i_a, end_a))
            connected_frag_endpoints.add((i_b, end_b))

        # Minimum-spanning-forest closure. Acceptance criterion #3 requires
        # one connected component: "every node reachable from the trunk-base
        # ridge node via parent/child edges". When the proximity merge
        # leaves disjoint components (canopy branches with gaps wider than
        # the radius), link each component to its nearest neighbour-
        # component endpoint regardless of distance. Greedy by ascending
        # distance is the natural MST step.
        components_now = {}
        for i in range(len(fragments)):
            r = find(i)
            components_now.setdefault(r, []).append(i)
        if len(components_now) > 1:
            # Precompute per-component endpoint list.
            comp_ids = list(components_now.keys())
            comp_eps = {}  # comp_id → list of (endpoint_idx_in_endpoints)
            for ei, e in enumerate(endpoints):
                comp_eps.setdefault(find(e[0]), []).append(ei)
            while True:
                # Find current components.
                comp_set = set(find(i) for i in range(len(fragments)))
                if len(comp_set) <= 1:
                    break
                # For each component, find nearest endpoint in any other
                # component. Pick the closest cross-component pair overall.
                best = None
                for c in comp_set:
                    eps_c = [endpoint_pts[ei] for ei in comp_eps.get(c, [])]
                    if not eps_c:
                        continue
                    eps_c = np.array(eps_c)
                    for c2 in comp_set:
                        if c2 == c:
                            continue
                        eps_c2 = [endpoint_pts[ei] for ei in comp_eps.get(c2, [])]
                        if not eps_c2:
                            continue
                        eps_c2 = np.array(eps_c2)
                        # Pairwise distances.
                        diff = eps_c[:, None, :] - eps_c2[None, :, :]
                        dist = np.linalg.norm(diff, axis=2)
                        mi, mj = np.unravel_index(np.argmin(dist), dist.shape)
                        dval = float(dist[mi, mj])
                        if best is None or dval < best[0]:
                            ei_a = comp_eps[c][mi]
                            ei_b = comp_eps[c2][mj]
                            best = (dval, ei_a, ei_b)
                if best is None:
                    break
                _, ei_a, ei_b = best
                e_a = endpoints[ei_a]
                e_b = endpoints[ei_b]
                connections.append((e_a[0], e_a[1], e_b[0], e_b[1]))
                ra, rb = find(e_a[0]), find(e_b[0])
                if ra != rb:
                    parent[ra] = rb
                # Refresh comp_eps mapping.
                merged_to = find(e_a[0])
                if ra in comp_eps and rb in comp_eps and ra != rb:
                    src = ra if merged_to == rb else rb
                    dst = rb if merged_to == rb else ra
                    comp_eps.setdefault(dst, []).extend(comp_eps.pop(src, []))

    # M_interp deposits: every absorbed position is a commitment record.
    deposits = []
    for traj in head_abs + tail_abs:
        if traj:
            for p in traj:
                deposits.append((p, 1))

    return extended, connections, deposits, {
        "reachEndpointsProbed": int(2 * sum(1 for f in fragments if len(f) >= 2)),
        "reachAbsorptions": int(len(deposits)),
        "reachConnections": int(len(connections)),
    }


# ── Phase 3c — Taper-projected tip extrapolation ───────────────────────

def estimate_local_radius(point, axis, grid, origin, voxel, max_radius=0.20,
                            n_radial=12, n_az=8):
    """Estimate the local tube radius at `point` perpendicular to `axis` by
    sampling M_obs at increasing radial offsets in a ring around the axis;
    return the offset where M_obs falls below 50% of the centre value."""
    centre = sample_grid_nearest(grid, origin, voxel, point)
    if centre < 1e-9:
        return 0.01
    half = 0.5 * centre
    # Orthonormal frame.
    a = axis / (np.linalg.norm(axis) + 1e-12)
    if abs(a[2]) < 0.999:
        ref = np.array([0.0, 0.0, 1.0])
    else:
        ref = np.array([1.0, 0.0, 0.0])
    e1 = np.cross(a, ref)
    e1 = e1 / (np.linalg.norm(e1) + 1e-12)
    e2 = np.cross(a, e1)
    radii = np.linspace(voxel, max_radius, n_radial)
    az = np.linspace(0, 2 * np.pi, n_az, endpoint=False)
    for r in radii:
        ring_avg = 0.0
        for theta in az:
            offset = r * (np.cos(theta) * e1 + np.sin(theta) * e2)
            ring_avg += sample_grid_nearest(grid, origin, voxel, point + offset)
        ring_avg /= n_az
        if ring_avg < half:
            return float(r)
    return float(max_radius)


def taper_project_tips(fragments, connections, density_grid_tuple,
                         min_segments=3, max_extension=1.0,
                         min_taper=0.01):
    """For each unconnected endpoint (not in `connections`), estimate taper
    rate τ from the last `min_segments` segments + project a tip at
    arc-length r/τ along the last axial direction. Returns extended
    fragments + per-fragment tip annotations."""
    grid, origin, voxel = density_grid_tuple
    connected = set()
    for (i_a, end_a, i_b, end_b) in connections:
        connected.add((i_a, end_a))
        connected.add((i_b, end_b))

    extended = [f.copy() for f in fragments]
    tip_annotations = []
    for i, frag in enumerate(fragments):
        if len(frag) < min_segments + 1:
            continue
        for end_label, slc, axial_sign in [
            ("tail", slice(-min_segments - 1, None), +1),
            ("head", slice(None, min_segments + 1), -1),
        ]:
            if (i, end_label) in connected:
                continue
            seg = frag[slc]
            # Axial direction.
            axis = (seg[-1] - seg[0]) * axial_sign
            length = np.linalg.norm(axis)
            if length < 1e-6:
                continue
            axis = axis / length
            # Local radii at each segment midpoint.
            radii = []
            for j in range(len(seg) - 1):
                mid = 0.5 * (seg[j] + seg[j + 1])
                r = estimate_local_radius(mid, seg[j + 1] - seg[j],
                                           grid, origin, voxel)
                radii.append(r)
            if len(radii) < 2:
                continue
            radii = np.array(radii)
            # Linear taper τ = -d radius / d arc-length, signed toward
            # smaller radius along axial direction.
            arc = np.linalg.norm(np.diff(seg, axis=0), axis=1).cumsum()
            arc = np.concatenate([[0.0], arc])
            if axial_sign > 0:
                # Tail end: arc increases along axis; taper should be (r[0]-r[-1])/arc[-1].
                tau = (radii[0] - radii[-1]) / max(arc[-1], 1e-6)
                tip_r = radii[-1]
                base_pos = seg[-1]
            else:
                tau = (radii[-1] - radii[0]) / max(arc[-1], 1e-6)
                tip_r = radii[0]
                base_pos = seg[0]
            if tau < min_taper:
                continue  # No discernible taper → uncertain; skip projection
            extension_len = min(max_extension, tip_r / max(tau, 1e-6))
            tip_pos = base_pos + extension_len * axis
            if end_label == "tail":
                extended[i] = np.vstack([extended[i], tip_pos[None, :]])
            else:
                extended[i] = np.vstack([tip_pos[None, :], extended[i]])
            tip_annotations.append({
                "fragmentIdx": i,
                "end": end_label,
                "extensionLen": float(extension_len),
                "tipRadius": float(tip_r),
                "taper": float(tau),
            })

    return extended, tip_annotations, {
        "taperProjectedTips": int(len(tip_annotations)),
    }


# ── Phase 3d — Interleaved iteration to convergence ────────────────────

def fragments_to_skeleton_nodes(fragments, connections, nodes_for_classification,
                                 density_grid_tuple, m_obs_for_radius=True):
    """Convert ridge fragments + connections into a parent-linked
    {x,y,z,radius,parentIdx} skeleton node list.

    Algorithm: build an UNDIRECTED graph (intra-fragment edges + connection
    edges between fragment-endpoint pairs), then BFS from the trunk-base
    root (lowest-z node) to assign directed parent pointers. This avoids
    the head/tail bookkeeping problem where a tail-side connection would
    otherwise overwrite the fragment's internal parent linkage.

    Provisional radius proxy from local M_obs (Phase 4 / N.2.3 fills proper
    pipe-model radii).
    """
    grid, origin, voxel = density_grid_tuple
    skel_nodes = []
    frag_start = []
    m_max = max(1e-9, float(grid.max()))

    # First pass: emit nodes with provisional radius; parentIdx left at -1
    # for now (filled in by BFS below).
    for frag in fragments:
        frag_start.append(len(skel_nodes))
        for j, p in enumerate(frag):
            m = sample_grid_nearest(grid, origin, voxel, p) if m_obs_for_radius else 0.5 * m_max
            r_proxy = 0.005 + 0.045 * min(1.0, m / m_max)
            skel_nodes.append({
                "x": float(p[0]), "y": float(p[1]), "z": float(p[2]),
                "radius": float(r_proxy),
                "parentIdx": -1,
            })

    # Undirected adjacency.
    adj = [[] for _ in range(len(skel_nodes))]
    # Intra-fragment edges.
    for fi, frag in enumerate(fragments):
        start = frag_start[fi]
        for j in range(len(frag) - 1):
            a = start + j
            b = start + j + 1
            adj[a].append(b)
            adj[b].append(a)
    # Inter-fragment connection edges.
    for (i_a, end_a, i_b, end_b) in connections:
        node_a = frag_start[i_a] + (len(fragments[i_a]) - 1 if end_a == "tail" else 0)
        node_b = frag_start[i_b] + (len(fragments[i_b]) - 1 if end_b == "tail" else 0)
        if node_a == node_b:
            continue
        adj[node_a].append(node_b)
        adj[node_b].append(node_a)

    # BFS from trunk-base seed (lowest-z node). Per CC, BFS independently
    # so disconnected components get root parentIdx=-1.
    n = len(skel_nodes)
    visited = [False] * n
    z_order = sorted(range(n), key=lambda i: skel_nodes[i]["z"])
    from collections import deque
    for root in z_order:
        if visited[root]:
            continue
        visited[root] = True
        skel_nodes[root]["parentIdx"] = -1
        q = deque([root])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if visited[v]:
                    continue
                visited[v] = True
                skel_nodes[v]["parentIdx"] = u
                q.append(v)

    return skel_nodes


def extract_skeleton_phase3(nodes, density_grid_tuple, m_obs_threshold,
                              glimpse_threshold, reach_step_size=0.05,
                              reach_max_failures=5, reach_max_steps=40,
                              mutual_distance=0.10, tube_ratio_threshold=0.35,
                              max_passes=4):
    """Phase 3 top-level orchestrator. 3a → 3b → 3c → iterate. M_obs is
    frozen (3b's deposits go to M_interp via the return tuple; the caller
    attaches them to the consolidated candidate cloud)."""
    t0 = time.time()
    # 3a — initial ridge extraction (one-shot since M_obs is frozen).
    fragments, ridge_stats = ridge_extraction(
        nodes, density_grid_tuple, m_obs_threshold,
        tube_ratio_threshold=tube_ratio_threshold)

    # 3b + 3c iterate; 3a re-runs are no-ops because M_obs doesn't grow.
    all_connections = []
    all_deposits = []
    reach_stats = {"reachConnections": 0, "reachAbsorptions": 0,
                    "reachEndpointsProbed": 0}
    taper_stats = {"taperProjectedTips": 0}
    for pass_idx in range(max_passes):
        pass_t = time.time()
        # 3b — glimpse reach.
        fragments, conns, deposits, rstats = axonal_glimpse_reach(
            fragments, density_grid_tuple, glimpse_threshold,
            step_size=reach_step_size, max_failures=reach_max_failures,
            max_steps=reach_max_steps, mutual_distance=mutual_distance)
        for k in reach_stats:
            reach_stats[k] += rstats[k]
        all_connections.extend(conns)
        all_deposits.extend(deposits)
        # 3c — taper projection (only on remaining unconnected endpoints).
        fragments, tip_anns, tstats = taper_project_tips(
            fragments, all_connections, density_grid_tuple)
        for k in taper_stats:
            taper_stats[k] += tstats[k]
        # Convergence: if 3b made no new connections AND no new absorptions
        # AND 3c made no new tip projections, stop.
        if rstats["reachConnections"] == 0 and rstats["reachAbsorptions"] == 0 \
                and tstats["taperProjectedTips"] == 0:
            break

    skel_nodes = fragments_to_skeleton_nodes(
        fragments, all_connections, nodes, density_grid_tuple)
    t_total = time.time() - t0

    # Attach M_interp absorption_count to nearest consolidated candidate
    # (Posture-B: M_interp lives on the observational node cloud, separate
    # channel from M_obs).
    if all_deposits and nodes:
        cand_pts = np.array([[n["x"], n["y"], n["z"]] for n in nodes])
        from scipy.spatial import cKDTree
        tree = cKDTree(cand_pts)
        deposit_pts = np.array([d[0] for d in all_deposits])
        _, nearest_idx = tree.query(deposit_pts)
        for ni in nearest_idx:
            mi = nodes[ni]["memory"]["M_interp"]
            mi["absorption_count"] = mi.get("absorption_count", 0) + 1

    return skel_nodes, {
        "phase3TotalMs": int(t_total * 1000),
        "phase3MObsThreshold": float(m_obs_threshold),
        "phase3GlimpseThreshold": float(glimpse_threshold),
        "ridge": ridge_stats,
        "reach": reach_stats,
        "taper": taper_stats,
        "skeletonNodes": int(len(skel_nodes)),
        "skeletonRoots": int(sum(1 for n in skel_nodes if n["parentIdx"] < 0)),
        "skeletonEdges": int(sum(1 for n in skel_nodes if n["parentIdx"] >= 0)),
        "skeletonFragments": int(len([f for f in fragments if len(f) >= 2])),
        "phase3Passes": pass_idx + 1,
    }


# ── Top-level pipeline ──────────────────────────────────────────────────

def run_lil_vera(laz_path, n_rigs, k_orient, pitch_ratio, voxel_size,
                  image_w=384, image_h=288, splat_radius=1,
                  consolidation_voxel=0.05, n_workers=None,
                  passes=1, eps_memory=0.005,
                  probe_length=0.10, perp_offset=0.04,
                  density_voxel=0.05, density_sigma_voxels=2.0,
                  ridge_threshold_percentile=75.0,
                  glimpse_threshold_percentile=45.0,
                  reach_step_size=0.05,
                  mutual_distance=0.25,
                  tube_ratio_threshold=0.35,
                  phase3_max_passes=4):
    """Stage N.2.2 end-to-end: Phase 1 + Phase 2 (a + b + c patient
    iteration) + Phase 3 (a + b + c interleaved per 3d). M_obs frozen
    once Phase 2 terminates; Phase 3's deposits write M_interp only."""
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
        nodes, tomo_stats, _density_grid_ret = orientation_tomography(
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

    # ── Phase 3 — skeleton extraction (ridge + reach + taper) ─────────
    # Posture-B-pure: operates on the density grid built from candidate
    # positions (rendered-pixel-recovered) + the per-candidate tomography
    # classification (also rendered-derived). No source-3D label reads.
    # M_obs is frozen; 3b's deposits go to M_interp (separate channel).
    phase3_stats = {}
    skeleton_nodes = []
    if _density_grid_ret is not None:
        t5 = time.time()
        # Pick thresholds relative to the current M_obs scalar field — the
        # ridge tracer wants "high-density tube" voxels, the glimpse reach
        # wants "evidence-bearing but below ridge" voxels.
        _grid_for_thresh = _density_grid_ret[0]
        ridge_thresh = float(np.percentile(_grid_for_thresh[_grid_for_thresh > 0],
                                            ridge_threshold_percentile))
        glimpse_thresh = float(np.percentile(_grid_for_thresh[_grid_for_thresh > 0],
                                               glimpse_threshold_percentile))
        skeleton_nodes, phase3_stats = extract_skeleton_phase3(
            nodes, _density_grid_ret,
            m_obs_threshold=ridge_thresh,
            glimpse_threshold=glimpse_thresh,
            reach_step_size=reach_step_size,
            mutual_distance=mutual_distance,
            tube_ratio_threshold=tube_ratio_threshold,
            max_passes=phase3_max_passes,
        )
        phase3_stats["phase3WallMs"] = int((time.time() - t5) * 1000)

    # Memory-cloud wire nodes — the consolidated candidate set with M_obs
    # + tomography channels, consumed by the LidarWorkstage M_obs heatmap
    # layer (renamed `memoryNodes` at N.2.2; was `nodes` at N.2.1).
    memory_nodes = []
    classifications = {name: 0 for name in CLS_NAMES.values()}
    classifications["unclassified"] = 0
    for n in nodes:
        m = n["memory"]["M_obs"]
        tomo = n["memory"]["tomography"]
        mi = n["memory"]["M_interp"]
        memory_nodes.append({
            "x": n["x"], "y": n["y"], "z": n["z"],
            "radius": n["radius"], "parentIdx": n["parentIdx"],
            "classification": n["memory"]["classification"],
            "silhouetteCount": m["silhouette_count"],
            "medialCount": m["medial_count"],
            "bodyCount": m["body_count"],
            "rigsSeen": m["rigs_seen"],
            "absorptionCount": mi.get("absorption_count", 0),
            "tomoAxis": tomo["axis"] if tomo else None,
            "tomoConfidence": tomo["confidence"] if tomo else 0.0,
            "tomoTop2Ratio": tomo["top2_ratio"] if tomo else 0.0,
        })
        c = n["memory"]["classification"]
        classifications[c] = classifications.get(c, 0) + 1

    # Wire `nodes` now carries the Phase 3 skeleton — the CylinderSkeleton
    # consumer renders this. Falls back to memory_nodes if Phase 3 produced
    # nothing (e.g., M_obs grid uninitialised — pathological case).
    wire_nodes = skeleton_nodes if skeleton_nodes else memory_nodes

    median_r = 0.02
    # Best-effort median radius from skeleton-node provisional radii so the
    # trunk/branch InstancedMesh split in CylinderSkeleton has a usable
    # divider at the visual gate (Phase 4 / N.2.3 will replace with proper
    # pipe-model radii).
    if skeleton_nodes:
        median_r = float(np.median([n["radius"] for n in skeleton_nodes]))
    result = {
        "nodes": wire_nodes,
        "memoryNodes": memory_nodes,
        "skeletonNodes": skeleton_nodes,
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
            "memoryNodeCount": len(memory_nodes),
            "skeletonNodeCount": len(skeleton_nodes),
            "cylinders": sum(1 for n in wire_nodes if n["parentIdx"] >= 0),
            "trunkLike": sum(1 for n in wire_nodes if n.get("radius", 0) >= median_r),
            "branchLike": sum(1 for n in wire_nodes if n.get("radius", 0) < median_r),
            "medianRadius": median_r,
            "classifications": classifications,
            "tomography": tomo_stats,
            "deposit": deposit_stats_aggregate,
            "phase3": phase3_stats,
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
            "ridgeThresholdPercentile": float(ridge_threshold_percentile),
            "glimpseThresholdPercentile": float(glimpse_threshold_percentile),
            "reachStepSize": float(reach_step_size),
            "mutualDistance": float(mutual_distance),
            "tubeRatioThreshold": float(tube_ratio_threshold),
            "phase3MaxPasses": int(phase3_max_passes),
            "stage": "N.2.2",
        },
        "memoryScaffold": {
            "channels": ["M_obs.silhouette_count", "M_obs.medial_count",
                         "M_obs.body_count", "M_obs.rigs_seen",
                         "tomography.classification", "tomography.axis",
                         "tomography.confidence", "tomography.top2_ratio",
                         "M_interp.absorption_count"],
            "perPointCount": len(memory_nodes),
            "note": ("M_obs from Phase 2a + 2b is frozen at the Phase 2 "
                     "termination snapshot. Phase 3b's axonal glimpse-reach "
                     "deposits commitment-records into M_interp.absorption_count "
                     "(separate channel — safeguard against positive-feedback "
                     "hallucination, per the brief's M_obs/M_interp distinction)."),
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
    ap.add_argument("--ridgeThresholdPercentile", type=float, default=75.0,
                    help="Phase 3a M_obs percentile above which a voxel is ridge-eligible")
    ap.add_argument("--glimpseThresholdPercentile", type=float, default=45.0,
                    help="Phase 3b M_obs percentile above which axonal reach can absorb")
    ap.add_argument("--reachStepSize", type=float, default=0.05,
                    help="Phase 3b probe-cone step size (m)")
    ap.add_argument("--mutualDistance", type=float, default=0.25,
                    help="Phase 3b mutual-recognition convergence radius (m); proximity-merge radius is 2x this")
    ap.add_argument("--tubeRatioThreshold", type=float, default=0.35,
                    help="Phase 3a tube-ratio threshold |λ_along| / |λ_perp_avg|")
    ap.add_argument("--phase3MaxPasses", type=int, default=4,
                    help="Phase 3d max interleave iterations")
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
        ridge_threshold_percentile=args.ridgeThresholdPercentile,
        glimpse_threshold_percentile=args.glimpseThresholdPercentile,
        reach_step_size=args.reachStepSize,
        mutual_distance=args.mutualDistance,
        tube_ratio_threshold=args.tubeRatioThreshold,
        phase3_max_passes=args.phase3MaxPasses,
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
