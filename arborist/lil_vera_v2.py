#!/usr/bin/env python3
"""
lil_vera_v2.py — Project: Li'l Vera, Cycle 1 rev. 2 — First Light.

Stage N.3.0 (this stage, 2026-05-20, Penzias):
  Classifier + priors + tip-detector validation on a static dataset.
  No iteration, no adaptive scan, no axonal growth — those are N.3.1+.

  Deliverables:
    - Hand-encoded botanical-priors.json at arborist/state/<species>/
    - Per-candidate tomography classifier producing:
        geometric_class, geometric_confidence, prior_likelihood,
        combined_confidence, local_axis
    - Phase 3a precision-gated tip detector (six conjunctive gates) emitting
      `tip_anchors` set
    - Diagnostics: classification distribution histogram vs priors'
      expected*Fraction; tip-anchor count + positions for visualization

Builder: Penzias (2026-05-20). Honoring Arno Penzias — observational
astronomer who, with Robert Wilson, discovered the cosmic microwave
background by meticulously subtracting known signals (instrument noise,
atmospheric emission, pigeon droppings) from the residual until what was
left could not be explained away. Rubin-style residual subtraction is the
operative philosophy of Li'l Vera; Penzias literally lived it. The
apparatus's three-outcome elimination (lock-in / reject / defer) is the
Penzias-Wilson algorithm with botany standing in for CMB.

REV. 2 is a fresh build per brief — does NOT import from Tycho's
`lil_vera.py`. The only carve-out is `load_pointcloud` from
`lidar_extract.py`, which is the canonical .laz loader (Posture-B
carve-out (a): the cameras' input).

POSTURE B (load-bearing). Five carve-outs documented in the brief:
  (a) rasterizer input filtered through working-set mask
  (b) bbox-scalar derivations (ground, tree_height — single scalars)
  (c) RANSAC trunk-axis derivation (single 3D line)
  (d) per-pass mask preparation in Phase 4 (kNN attribution — N.3.1+)
  (e) final ground-truth validation at end of cycle

Output JSON: see brief §Output specification. Persisted to:
    arborist/state/lil-vera-v2/<treeId>/run-<ISO>-N<N>.json
(note the v2-suffixed state directory so v1 and v2 runs coexist.)

CLI (Standing Requirement #8):
    arborist/.venv/bin/python arborist/lil_vera_v2.py \\
        --treeId=10191 --species=acer_saccharum --N=50 --seed=42

Heartbeat (Standing Requirement #10): heartbeat lines on stdout at every
phase boundary AND at minimum every 30 seconds inside long phases. Format:
  [pass N | phase=<tag> | |P|=<size> | splines=<count> | elapsed mm:ss]
plus phase-specific extras.

Stage roadmap (DO NOT IMPLEMENT THESE HERE — for the next baby to read):
  N.3.1 — Phase 1 adaptive scan + verdict-rate stop + masked rasterizer
          + Phase 4 three-outcome elimination
  N.3.2 — Phase 3a tip anchoring (lifted from this stage) + Phase 3b
          axonal growth + handshake recognition + Phase 3c degraded
          taper fallback + spline fitting
  N.3.3 — Phase 5 pipe-model radii + taper co-determination
  N.3.4 — Phase 6 Rubin consensus-stability validation
"""
import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from multiprocessing import Pool, cpu_count
from pathlib import Path

import numpy as np
from scipy.interpolate import (
    LinearNDInterpolator,
    NearestNDInterpolator,
)
from scipy.ndimage import binary_erosion, gaussian_filter
from scipy.spatial import cKDTree
from skimage.morphology import skeletonize

# Carve-out (a): the rasterizer's input cloud comes from the canonical .laz
# loader. Same source frame as QSM / Bidirectional / v1 baselines.
from lidar_extract import load_pointcloud, voxel_downsample, specimen_laz_path


HERE = Path(__file__).parent
ROOT = HERE.parent
STATE_DIR = HERE / "state" / "lil-vera-v2"
PRIORS_DIR = HERE / "state"


# ── Classification codes ───────────────────────────────────────────────

CLS_NOISE = 0
CLS_LINEAR_INTERIOR = 1
CLS_JUNCTION = 2
CLS_TIP = 3
CLS_SHEET = 4
CLS_NAMES = {
    0: "noise",
    1: "linear-interior",
    2: "junction",
    3: "tip",
    4: "sheet",
}
CLS_ID_BY_NAME = {v: k for k, v in CLS_NAMES.items()}


# ── Heartbeat (Standing Requirement #10) ───────────────────────────────

class Heartbeat:
    """Emit heartbeat lines to stdout at phase boundaries + every 30s
    mid-phase. Lines are flushed eagerly so `tail -f` shows them live."""
    def __init__(self, interval_s=30.0, start=None):
        self.t0 = start if start is not None else time.time()
        self.last = self.t0
        self.interval = interval_s
        self.pass_n = 0
        self.working_set_size = 0
        self.splines = 0

    def _fmt_elapsed(self):
        s = int(time.time() - self.t0)
        return f"{s // 60:d}m{s % 60:02d}s"

    def beat(self, phase, force=False, **extras):
        now = time.time()
        if not force and (now - self.last) < self.interval:
            return
        self.last = now
        parts = [
            f"pass {self.pass_n}",
            f"phase={phase}",
            f"|P|={self.working_set_size}",
            f"splines={self.splines}",
            f"elapsed {self._fmt_elapsed()}",
        ]
        for k, v in extras.items():
            parts.append(f"{k}={v}")
        line = "[" + " | ".join(parts) + "]"
        # Stderr so it doesn't collide with the JSON we emit on stdout.
        sys.stderr.write(line + "\n")
        sys.stderr.flush()


# ── Species priors (load, validate, query) ─────────────────────────────

def load_priors(species, priors_path=None):
    """Load species priors JSON. FAIL-FAST on schema gaps (per brief — silent
    degradation to softnessScaling=0 ignore-priors mode would mask bugs and
    break acceptance criterion #8; we refuse to run on a malformed priors
    file rather than carry on with a placeholder)."""
    if priors_path is None:
        priors_path = PRIORS_DIR / species / "botanical-priors.json"
    else:
        priors_path = Path(priors_path)
    if not priors_path.exists():
        raise SystemExit(
            f"FATAL: species priors file not found at {priors_path}. "
            f"Hand-encode the priors per the brief §Species priors file "
            f"specification before running the apparatus."
        )
    raw = priors_path.read_text()
    priors_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    data = json.loads(raw)

    # Schema validation — required top-level fields.
    required = [
        "speciesId", "expectedRadiusByPosition",
        "branchAngleDistribution", "expectedLocalDirection",
        "branchingDensityByHeight", "expectedJunctionFraction",
        "expectedTipFraction", "expectedLinearInteriorFraction",
        "hardRejections", "softnessScaling",
        "murraysLawJointTolerance", "junctionMinBranchingDensity",
    ]
    for key in required:
        if key not in data:
            raise SystemExit(
                f"FATAL: priors file {priors_path} missing required key '{key}'"
            )
    if data["speciesId"] != species:
        raise SystemExit(
            f"FATAL: priors speciesId='{data['speciesId']}' does not match "
            f"requested species='{species}'"
        )
    erp = data["expectedRadiusByPosition"]
    if not erp.get("samples"):
        raise SystemExit(
            f"FATAL: expectedRadiusByPosition.samples is empty in {priors_path}"
        )
    eld = data["expectedLocalDirection"]
    if not eld.get("samples"):
        raise SystemExit(
            f"FATAL: expectedLocalDirection.samples is empty in {priors_path}"
        )

    # Build interp wrappers.
    erp_samples = erp["samples"]
    erp_pts = np.array([[s["heightFrac"], s["radialDist"]] for s in erp_samples])
    erp_rmin = np.array([s["rMin"] for s in erp_samples])
    erp_rmax = np.array([s["rMax"] for s in erp_samples])
    erp_rmode = np.array([s["rMode"] for s in erp_samples])
    # LinearNDInterpolator on the convex hull, NearestNDInterpolator
    # fallback for off-hull queries (load-bearing — see brief).
    erp_linear_rmin = LinearNDInterpolator(erp_pts, erp_rmin)
    erp_linear_rmax = LinearNDInterpolator(erp_pts, erp_rmax)
    erp_linear_rmode = LinearNDInterpolator(erp_pts, erp_rmode)
    erp_near_rmin = NearestNDInterpolator(erp_pts, erp_rmin)
    erp_near_rmax = NearestNDInterpolator(erp_pts, erp_rmax)
    erp_near_rmode = NearestNDInterpolator(erp_pts, erp_rmode)

    eld_samples = eld["samples"]
    eld_pts = np.array([[s["heightFrac"], s["radialDist"]] for s in eld_samples])
    eld_angles = np.array([s["angleFromVertical"] for s in eld_samples])
    eld_stds = np.array([s["stdDeg"] for s in eld_samples])
    eld_linear_angle = LinearNDInterpolator(eld_pts, eld_angles)
    eld_linear_std = LinearNDInterpolator(eld_pts, eld_stds)
    eld_near_angle = NearestNDInterpolator(eld_pts, eld_angles)
    eld_near_std = NearestNDInterpolator(eld_pts, eld_stds)

    bdh = data["branchingDensityByHeight"]["samples"]
    bdh_h = np.array([s["heightFrac"] for s in bdh])
    bdh_v = np.array([s["branchesPerMeter"] for s in bdh])

    def interp_with_fallback(linear, nearest, query):
        v = linear(query)
        v_arr = np.atleast_1d(np.asarray(v, dtype=np.float64))
        if v_arr.size == 1:
            x = float(v_arr.ravel()[0])
            if np.isnan(x):
                return float(np.atleast_1d(nearest(query)).ravel()[0])
            return x
        mask = np.isnan(v_arr)
        if np.any(mask):
            v_arr = np.where(mask, np.asarray(nearest(query)), v_arr)
        return v_arr

    angle_modal = float(data["branchAngleDistribution"]["fromVertical"]["modal"])
    angle_std = float(data["branchAngleDistribution"]["fromVertical"]["stdDeg"])
    angle_hard_max = float(data["hardRejections"]["branchAngleSteeperThanDeg"])
    softness = float(data["softnessScaling"])
    junction_min_density = float(data["junctionMinBranchingDensity"])
    axial_fallback_radius = float(eld.get("axialFallbackRadius", 0.05))

    hard_radius_rules = data["hardRejections"].get("radiusAboveAtHeight", [])
    tip_radius_prior = data.get("expectedTipRadius")
    tip_height_prior = data.get("expectedTipHeightFrac")

    def gaussian_bell(x, mode, sigma):
        sigma = max(sigma, 1e-6)
        z = (x - mode) / sigma
        return float(np.exp(-0.5 * z * z))

    def expected_radius(height_frac, radial_dist):
        q = np.array([height_frac, radial_dist])
        return {
            "rMin": interp_with_fallback(erp_linear_rmin, erp_near_rmin, q),
            "rMax": interp_with_fallback(erp_linear_rmax, erp_near_rmax, q),
            "rMode": interp_with_fallback(erp_linear_rmode, erp_near_rmode, q),
        }

    def branching_density(height_frac):
        return float(np.interp(height_frac, bdh_h, bdh_v))

    def expected_local_direction(height_frac, radial_dist, current_direction,
                                  probe_position_world, trunk_axis_origin,
                                  trunk_axis_direction):
        """Returns the species's expected unit tangent at this tree-frame
        position. See brief §Species priors RECONSTRUCTION for the full
        derivation (polar from samples; radial-outward azimuth)."""
        q = np.array([height_frac, radial_dist])
        theta_deg = interp_with_fallback(eld_linear_angle, eld_near_angle, q)
        theta = np.deg2rad(theta_deg)
        # Project probe onto horizontal plane at its height; find horizontal
        # vector from trunk_axis to probe at that height.
        # trunk_axis: parametric line origin + t*direction.
        # Horizontal-plane azimuth toward the probe:
        probe_h = np.array([probe_position_world[0], probe_position_world[1]])
        axis_h = np.array([trunk_axis_origin[0], trunk_axis_origin[1]])
        radial_vec = probe_h - axis_h
        rlen = np.linalg.norm(radial_vec)
        # Step 3: NEAR-AXIS FALLBACK.
        if rlen < axial_fallback_radius:
            # Single-degree-of-freedom prior; inherit azimuth from current.
            curh = np.array([current_direction[0], current_direction[1]])
            cl = np.linalg.norm(curh)
            if cl > 1e-9:
                az = curh / cl
            else:
                az = np.array([1.0, 0.0])
        else:
            az = radial_vec / rlen
        # Construct world-frame tangent. World frame here is the source
        # frame (Z-up); the apparatus is computed entirely in this frame.
        # World up = [0,0,1]. tangent = (sinθ·azx, sinθ·azy, cosθ).
        return np.array([
            np.sin(theta) * az[0],
            np.sin(theta) * az[1],
            np.cos(theta),
        ])

    def likelihood(geometric_class, height_frac, radial_dist,
                   inferred_radius, local_axis):
        """priors.likelihood per brief §Species priors file specification.
        Returns ∈ [0, 1]; clipped after softness blend."""
        # 1. Radius envelope likelihood.
        env = expected_radius(height_frac, radial_dist)
        sigma_r = max(0.001, (env["rMax"] - env["rMin"]) / 4.0)
        like_r = gaussian_bell(inferred_radius, env["rMode"], sigma_r)

        # Hard rejection: thick branches at high positions.
        for rule in hard_radius_rules:
            if (height_frac > rule["heightFrac"] and
                    radial_dist > rule["radialDistAbove"] and
                    inferred_radius > rule["radiusAbove"]):
                like_r = 0.0
                break

        # 2. Branch-angle likelihood — position-conditioned modal from
        #    expectedLocalDirection table (the same prior that steers
        #    Phase 3b growth). Near the trunk axis the modal is ~0° from
        #    vertical (trunk itself); in outer canopy modal climbs to
        #    ~70° (radial scaffolds). The flat-Gaussian branchAngle
        #    distribution serves as a soft cap on the global std.
        like_angle = 1.0
        if local_axis is not None and geometric_class in (
                "linear-interior", "junction", "tip"):
            la = np.asarray(local_axis, dtype=np.float64)
            ln = np.linalg.norm(la)
            if ln > 1e-9:
                la = la / ln
                cos_v = abs(la[2])
                cos_v = min(1.0, max(0.0, cos_v))
                angle_v = np.rad2deg(np.arccos(cos_v))
                q = np.array([height_frac, radial_dist])
                modal_pos = interp_with_fallback(
                    eld_linear_angle, eld_near_angle, q)
                std_pos = interp_with_fallback(
                    eld_linear_std, eld_near_std, q)
                modal_pos = float(modal_pos)
                std_pos = max(float(std_pos), 8.0)
                like_angle = gaussian_bell(angle_v, modal_pos, std_pos)
                if angle_v > angle_hard_max:
                    like_angle = 0.0

        # 3. Junction-only branching-density gate.
        like_branching = 1.0
        if geometric_class == "junction":
            bd = branching_density(height_frac)
            if bd < junction_min_density:
                like_branching = 0.0

        # 5. Tip-specific gates (position + radius). A tip is botanically
        #    a thin terminus in the upper canopy. Trunk-thickness vertical
        #    spurs at the base can pass the general position-conditioned
        #    radius envelope, but they're not tips — these gates separate
        #    "valid structure at this position" from "valid TIP at this
        #    position". See scope-drift note in commit body.
        like_tip = 1.0
        if geometric_class == "tip":
            if tip_radius_prior is not None:
                tr_mode = float(tip_radius_prior.get("modal", 0.005))
                tr_min = float(tip_radius_prior.get("min", 0.001))
                tr_max = float(tip_radius_prior.get("max", 0.020))
                tr_sigma = max(0.001, (tr_max - tr_min) / 4.0)
                like_tip *= gaussian_bell(inferred_radius, tr_mode, tr_sigma)
            if tip_height_prior is not None:
                th_mode = float(tip_height_prior.get("modal", 0.80))
                th_std = float(tip_height_prior.get("stdDeg", 0.20))
                like_tip *= gaussian_bell(height_frac, th_mode, th_std)

        # 4. Combine + softnessScaling blend.
        raw = like_r * like_angle * like_branching * like_tip
        blended = raw * softness + (1.0 - softness) * 1.0
        return float(np.clip(blended, 0.0, 1.0))

    return {
        "data": data,
        "path": str(priors_path),
        "hash": priors_hash,
        "likelihood": likelihood,
        "expected_radius": expected_radius,
        "branching_density": branching_density,
        "expected_local_direction": expected_local_direction,
        "softness": softness,
        "expected_fractions": {
            "tip": data["expectedTipFraction"],
            "junction": data["expectedJunctionFraction"],
            "linear-interior": data["expectedLinearInteriorFraction"],
        },
    }


# ── Spiral rig generator ───────────────────────────────────────────────

def generate_rig_positions(n_rigs, tree_height, tree_radius, pitch_ratio,
                            cam_distance_factor=1.6, seed=42):
    """Adaptive-scan-compatible spiral generator: deterministic from `seed`,
    so adding a batch of rigs extends the same sequence. For N.3.0 we use
    a fixed N — but we keep the seed plumbing so N.3.1 can drop the
    adaptive scan in without re-deriving rig layout.

    Two interleaved spirals (wide + narrow pitch) for mixed-baseline
    coverage. Per rig: (height, azimuth, cam_distance) in source frame.
    """
    cam_distance = max(tree_radius * cam_distance_factor, tree_height * 0.8)
    rigs = []
    wide_pitch = pitch_ratio
    narrow_pitch = max(1e-3, pitch_ratio * 0.4)
    half = n_rigs // 2
    # Deterministic small azimuth jitter per rig for visual coverage —
    # seeded RNG; same seed → same rigs.
    rng = np.random.default_rng(seed)
    jitter = rng.uniform(-0.05, 0.05, size=n_rigs)
    for spiral_idx, (n_this, pitch) in enumerate([
        (half, wide_pitch),
        (n_rigs - half, narrow_pitch),
    ]):
        if n_this == 0:
            continue
        for r in range(n_this):
            t = r / max(n_this - 1, 1)
            height = 0.05 * tree_height + t * 0.95 * tree_height
            offset = np.pi / 3 if spiral_idx == 1 else 0.0
            global_r = len(rigs)
            azimuth = ((2.0 * np.pi / max(pitch, 1e-3)) * t + offset
                       + jitter[global_r])
            rigs.append({
                "height": float(height),
                "azimuth": float(azimuth),
                "cam_distance": float(cam_distance),
                "spiral": int(spiral_idx),
            })
    for i, r in enumerate(rigs):
        r["_idx"] = i
    return rigs


def rig_cameras(rig, target_height):
    """3 cameras at 120° around rig vertical axis, all looking toward the
    tree's central vertical axis at target_height. Source frame: Z-up."""
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


# ── Camera math (Posture-B-allowed: the camera IS source-3D input) ─────

def build_view_matrix(position, target, up):
    forward = target - position
    forward = forward / (np.linalg.norm(forward) + 1e-12)
    right = np.cross(forward, up)
    right = right / (np.linalg.norm(right) + 1e-12)
    cam_up = np.cross(right, forward)
    R = np.stack([right, cam_up, -forward], axis=0)
    return R, position.astype(np.float64)


def build_intrinsics(image_w, image_h, vfov_deg=45.0):
    vfov = np.deg2rad(vfov_deg)
    fy = 0.5 * image_h / np.tan(vfov / 2.0)
    fx = fy
    cx, cy = image_w / 2.0, image_h / 2.0
    return np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1.0]])


def project_points(pts_world, R, t, K, image_w, image_h):
    p_cam = (pts_world - t) @ R.T
    depth = -p_cam[:, 2]
    valid = depth > 1e-3
    safe_depth = np.where(valid, depth, 1.0)
    u = np.where(valid, K[0, 0] * p_cam[:, 0] / safe_depth + K[0, 2], -1.0)
    v = np.where(valid, K[1, 1] * p_cam[:, 1] / safe_depth + K[1, 2], -1.0)
    v = (image_h - 1) - v
    in_frame = valid & (u >= 0) & (u < image_w) & (v >= 0) & (v < image_h)
    return np.column_stack([u, v]), depth, in_frame


def projection_matrix(R, t, K, image_h):
    fx, fy, cx, cy = K[0, 0], K[1, 1], K[0, 2], K[1, 2]
    K_proj = np.array([
        [fx,  0.0, -cx],
        [0.0, -fy, -((image_h - 1) - cy)],
        [0.0, 0.0, -1.0],
    ])
    Rt = np.zeros((3, 4))
    Rt[:, :3] = R
    Rt[:, 3] = -R @ t
    return K_proj @ Rt


def rasterize_silhouette(pts_world, R, t, K, image_w, image_h, splat_radius=1):
    uv, _depth, in_frame = project_points(pts_world, R, t, K, image_w, image_h)
    mask = np.zeros((image_h, image_w), dtype=np.uint8)
    u = uv[in_frame, 0].astype(np.int32)
    v = uv[in_frame, 1].astype(np.int32)
    if splat_radius <= 0:
        mask[v, u] = 1
        return mask
    for du in range(-splat_radius, splat_radius + 1):
        for dv in range(-splat_radius, splat_radius + 1):
            if du * du + dv * dv > splat_radius * splat_radius:
                continue
            uu = u + du
            vv = v + dv
            ok = (uu >= 0) & (uu < image_w) & (vv >= 0) & (vv < image_h)
            mask[vv[ok], uu[ok]] = 1
    return mask


def extract_medial(mask):
    if mask.sum() == 0:
        return np.zeros_like(mask, dtype=bool)
    return skeletonize(mask.astype(bool))


def triangulate_dlt(uv1, uv2, P1, P2):
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


def epipolar_stereo_match(uv_a, uv_b, R_a, t_a, K_a, P_b,
                           image_w, image_h, image_h_b=None,
                           epipolar_tol=2.5, depth_near=0.5, depth_far=100.0):
    """Image-space stereo correspondence. Back-project A's medial pixels
    along rays at near/far depths; project those endpoints into B; for each
    A-pixel find the closest B-pixel to the resulting epipolar line."""
    if image_h_b is None:
        image_h_b = image_h
    if len(uv_a) == 0 or len(uv_b) == 0:
        return np.empty(0, dtype=np.int32), np.empty(0, dtype=np.int32)

    u = uv_a[:, 0].astype(np.float64)
    v_flipped = (image_h - 1) - uv_a[:, 1].astype(np.float64)
    fx, fy, cx, cy = K_a[0, 0], K_a[1, 1], K_a[0, 2], K_a[1, 2]
    dx = (u - cx) / fx
    dy = (v_flipped - cy) / fy
    rays_cam = np.column_stack([dx, dy, -np.ones_like(dx)])
    rays_world = rays_cam @ R_a
    rays_world = rays_world / (np.linalg.norm(rays_world, axis=1,
                                              keepdims=True) + 1e-12)
    near_pts = t_a + rays_world * depth_near
    far_pts = t_a + rays_world * depth_far

    def proj_homog(world_pts, P):
        hp = np.column_stack([world_pts, np.ones(len(world_pts))])
        x = hp @ P.T
        w = x[:, 2:3]
        safe = np.where(np.abs(w) < 1e-9, 1e-9, w)
        return x[:, :2] / safe

    a = proj_homog(near_pts, P_b)
    b = proj_homog(far_pts, P_b)
    ab = b - a
    ab_len = np.linalg.norm(ab, axis=1) + 1e-12
    Bxy = uv_b.astype(np.float64)

    idx_a, idx_b = [], []
    for i in range(len(uv_a)):
        ai = a[i]
        bi_dir = ab[i] / ab_len[i]
        pa = Bxy - ai
        cross = pa[:, 0] * bi_dir[1] - pa[:, 1] * bi_dir[0]
        perp = np.abs(cross)
        tparm = pa @ bi_dir
        ok = (perp < epipolar_tol) & (tparm > 0) & (tparm < ab_len[i])
        if not np.any(ok):
            continue
        j = int(np.argmin(np.where(ok, perp, np.inf)))
        idx_a.append(i)
        idx_b.append(j)
    return np.asarray(idx_a, dtype=np.int32), np.asarray(idx_b, dtype=np.int32)


# ── Per-rig observation (Posture-B-pure beyond rasterizer) ─────────────

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
    """One rig: render 3 cameras → silhouette + medial-axis per view →
    within-rig stereo correspondence over 3 pairs → 3D candidate points."""
    cams = rig_cameras(rig, _RIG_TARGET_H)
    views = []
    for (pos, tgt, up) in cams:
        R, t = build_view_matrix(pos, tgt, up)
        mask = rasterize_silhouette(_RIG_PTS, R, t, _RIG_K,
                                     _RIG_IMAGE_W, _RIG_IMAGE_H,
                                     splat_radius=_RIG_SPLAT)
        medial = extract_medial(mask)
        eroded = binary_erosion(mask.astype(bool), iterations=1)
        edge = mask.astype(bool) & (~eroded)
        vs, us = np.where(medial)
        uv = np.column_stack([us.astype(np.int32), vs.astype(np.int32)])
        P = projection_matrix(R, t, _RIG_K, _RIG_IMAGE_H)
        views.append({
            "R": R, "t": t, "P": P,
            "mask": mask.astype(bool),
            "medial": medial.astype(bool),
            "edge": edge,
            "uv": uv,
        })

    candidates = []
    pairs = [(0, 1), (1, 2), (2, 0)]
    for (a, b) in pairs:
        va, vb = views[a], views[b]
        if len(va["uv"]) < 2 or len(vb["uv"]) < 2:
            continue
        idx_a, idx_b = epipolar_stereo_match(
            va["uv"], vb["uv"], va["R"], va["t"], _RIG_K, vb["P"],
            _RIG_IMAGE_W, _RIG_IMAGE_H,
        )
        for ia, ib in zip(idx_a, idx_b):
            X = triangulate_dlt(va["uv"][ia], vb["uv"][ib], va["P"], vb["P"])
            if X is None or not np.all(np.isfinite(X)):
                continue
            if abs(X[0]) > 50 or abs(X[1]) > 50 or X[2] < -2 or X[2] > 100:
                continue
            candidates.append({"world": X.tolist(), "pair": (int(a), int(b))})

    return {
        "rig_idx": rig["_idx"],
        "rig": rig,
        "candidates": candidates,
        "views": views,
    }


# ── Multi-rig consolidation ────────────────────────────────────────────

def consolidate_candidates(rig_outputs, voxel=0.05):
    """Voxel-bucket stereo candidates into one candidate per occupied
    voxel. Returns a list of dicts:
        [{x, y, z, source_pairs, rigs_contributing}, ...]
    """
    seen = {}
    candidates = []
    for ro in rig_outputs:
        rig_idx = ro["rig_idx"]
        for cand in ro["candidates"]:
            wx, wy, wz = cand["world"]
            vk = (int(round(wx / voxel)),
                  int(round(wy / voxel)),
                  int(round(wz / voxel)))
            if vk in seen:
                ci = seen[vk]
                candidates[ci]["source_pairs"].append((rig_idx, cand["pair"]))
            else:
                seen[vk] = len(candidates)
                candidates.append({
                    "x": float(wx), "y": float(wy), "z": float(wz),
                    "source_pairs": [(rig_idx, cand["pair"])],
                })
    return candidates


def multi_rig_consensus_deposit(candidates, rig_outputs, K, image_w, image_h):
    """For each candidate, project into every rig's 3 cameras using the
    retained R/t; look up the rendered masks; increment per-channel counts.
    Posture-B-pure: reads come from already-rendered masks."""
    if not candidates:
        return candidates, {"depositCameras": 0, "depositRigs": 0}
    Pc = np.array([[c["x"], c["y"], c["z"]] for c in candidates],
                  dtype=np.float64)
    Nc = len(Pc)
    sil = np.zeros(Nc, dtype=np.int32)
    med = np.zeros(Nc, dtype=np.int32)
    body = np.zeros(Nc, dtype=np.int32)
    rigs_seen = np.zeros(Nc, dtype=np.int32)
    cam_count = 0
    for ro in rig_outputs:
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
    for i, c in enumerate(candidates):
        c["m_obs"] = {
            "silhouette_count": int(sil[i]),
            "medial_count": int(med[i]),
            "body_count": int(body[i]),
            "rigs_seen": int(rigs_seen[i]),
        }
    return candidates, {
        "depositCameras": int(cam_count),
        "depositRigs": int(len(rig_outputs)),
        "meanRigsSeen": float(rigs_seen.mean()) if Nc else 0.0,
    }


# ── Posture-B carve-outs (b) bbox scalars + (c) RANSAC trunk axis ──────

def derive_bbox_scalars(pts):
    """Carve-out (b): single scalars, not per-point labels."""
    ground = float(pts[:, 2].min())
    tree_height = float(pts[:, 2].max() - ground)
    return ground, tree_height


def ransac_trunk_axis(pts, ground, tree_height, seed=42,
                       column_radius=0.5, min_inliers_frac=0.3,
                       max_iters=200, inlier_tol=0.10,
                       lower_band_frac=0.30):
    """Carve-out (c): single 3D line scalar derived from densest Z-column.
    SEEDED RNG for Standing Req #6 determinism.

    SANITY CHECK: if trunk_axis verticality angle from world-up exceeds
    15°, surface diagnostic + halt — tilted / multi-stem specimens
    silently miscalibrate every prior query downstream.
    """
    rng = np.random.default_rng(seed)
    # Use the lower 30% of points as RANSAC pool — the trunk lives there.
    z_thresh = ground + lower_band_frac * tree_height
    lower = pts[pts[:, 2] <= z_thresh]
    if len(lower) < 50:
        lower = pts
    best_inliers = 0
    best_origin = np.array([0.0, 0.0, ground])
    best_dir = np.array([0.0, 0.0, 1.0])
    # Vertical-only RANSAC: the trunk is a near-vertical line — we sample
    # two heights' worth of points, fit a line, then count inliers (radial
    # distance from line < inlier_tol).
    for _it in range(max_iters):
        i, j = rng.choice(len(lower), size=2, replace=False)
        p0, p1 = lower[i], lower[j]
        d = p1 - p0
        if np.linalg.norm(d) < 1e-3:
            continue
        d = d / np.linalg.norm(d)
        # Radial distance from all lower points to this line.
        diffs = lower - p0
        proj = diffs @ d
        perp = diffs - np.outer(proj, d)
        radial = np.linalg.norm(perp, axis=1)
        n_in = int((radial < inlier_tol).sum())
        if n_in > best_inliers:
            best_inliers = n_in
            best_origin = p0.copy()
            best_dir = d.copy()
    # Refit using all inliers (least-squares line through them).
    diffs = lower - best_origin
    proj = diffs @ best_dir
    perp = diffs - np.outer(proj, best_dir)
    radial = np.linalg.norm(perp, axis=1)
    inlier_mask = radial < inlier_tol
    inliers = lower[inlier_mask]
    if len(inliers) >= 10:
        # PCA on inliers; primary axis = trunk direction.
        centroid = inliers.mean(axis=0)
        centered = inliers - centroid
        _U, _S, Vt = np.linalg.svd(centered, full_matrices=False)
        d = Vt[0]
        if d[2] < 0:
            d = -d
        d = d / np.linalg.norm(d)
        best_origin = centroid
        best_dir = d
    # Verticality sanity.
    angle_deg = float(np.rad2deg(np.arccos(min(1.0, abs(best_dir[2])))))
    if angle_deg > 15.0:
        raise SystemExit(
            f"FATAL: RANSAC trunk axis verticality {angle_deg:.2f}° exceeds "
            f"15° threshold. Tilted / multi-stem / mis-classified-axis "
            f"specimen. Halting before the priors get silently miscalibrated. "
            f"(Per brief — Posture-B (c) sanity check.)"
        )
    inliers_frac = float(len(inliers) / max(1, len(lower)))
    if inliers_frac < min_inliers_frac:
        sys.stderr.write(
            f"[lil_vera_v2] WARNING: RANSAC trunk-axis inlier fraction "
            f"{inliers_frac:.3f} below {min_inliers_frac}. The axis fit "
            f"may be noisy; surfacing as diagnostic.\n"
        )
    return {
        "origin": best_origin.astype(np.float64),
        "direction": best_dir.astype(np.float64),
        "verticalityDeg": angle_deg,
        "inlierFraction": inliers_frac,
        "inlierCount": int(len(inliers)),
    }


# ── Candidate-density field + sampler ──────────────────────────────────

def build_candidate_density_field(candidates, voxel=0.05, sigma_voxels=1.5,
                                    padding=4):
    if not candidates:
        return np.zeros((1, 1, 1)), np.zeros(3), voxel
    pts = np.array([[c["x"], c["y"], c["z"]] for c in candidates])
    weights = np.array([max(1, c.get("m_obs", {}).get("rigs_seen", 1))
                        for c in candidates], dtype=np.float64)
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
    np.add.at(grid, (ijk[:, 0], ijk[:, 1], ijk[:, 2]), weights)
    grid = gaussian_filter(grid, sigma=sigma_voxels)
    return grid, mins, voxel


def sample_density(grid, origin, voxel, pts):
    ijk = np.floor((pts - origin) / voxel).astype(np.int64)
    nx, ny, nz = grid.shape
    ijk[:, 0] = np.clip(ijk[:, 0], 0, nx - 1)
    ijk[:, 1] = np.clip(ijk[:, 1], 0, ny - 1)
    ijk[:, 2] = np.clip(ijk[:, 2], 0, nz - 1)
    return grid[ijk[:, 0], ijk[:, 1], ijk[:, 2]]


# ── Phase 2 — species-conditioned classifier (TAG, don't commit) ───────

def fibonacci_hemisphere(k):
    if k <= 0:
        return np.zeros((0, 3))
    golden = (1.0 + np.sqrt(5.0)) / 2.0
    out = np.empty((k, 3))
    for i in range(k):
        z = 1.0 - (i + 0.5) / k  # (0, 1] — upper hemisphere
        r = np.sqrt(max(0.0, 1.0 - z * z))
        theta = 2.0 * np.pi * i / golden
        out[i, 0] = r * np.cos(theta)
        out[i, 1] = r * np.sin(theta)
        out[i, 2] = z
    return out


def classify_candidates(candidates, grid, origin, voxel, priors,
                         trunk_axis, ground, tree_height, k_orient=200,
                         probe_length=0.10, perp_offset=0.04,
                         n_samples_along_drag=8, n_perp_samples=8,
                         flat_threshold=0.010,
                         peak_ratio_threshold=0.75,
                         peak_angular_radius_deg=60.0,
                         tip_asymmetry_threshold=0.12,
                         sheet_ratio_threshold=0.30,
                         hb=None):
    """Phase 2 — tomography classify + species-conditioned prior likelihood.
    Tags each candidate with geometric_class + geometric_confidence +
    prior_likelihood + combined_confidence + local_axis. Does NOT commit
    anything (deferred-commitment per the rev. 2 restructure)."""
    if not candidates:
        return candidates

    pts = np.array([[c["x"], c["y"], c["z"]] for c in candidates],
                   dtype=np.float64)
    n = len(pts)
    dirs = fibonacci_hemisphere(k_orient)
    k = len(dirs)

    half = max(2, n_samples_along_drag // 2)
    s_plus = np.linspace(probe_length * 0.05, probe_length * 0.5, half)
    s_minus = -s_plus
    perp_az = np.linspace(0, 2 * np.pi, n_perp_samples, endpoint=False)

    scores = np.zeros((n, k))
    asymmetry = np.zeros((n, k))
    for d_idx in range(k):
        u = dirs[d_idx]
        if abs(u[2]) < 0.999:
            ref = np.array([0.0, 0.0, 1.0])
        else:
            ref = np.array([1.0, 0.0, 0.0])
        e1 = np.cross(u, ref); e1 = e1 / (np.linalg.norm(e1) + 1e-12)
        e2 = np.cross(u, e1)
        pl = pts[:, None, :] + s_plus[None, :, None] * u
        mi = pts[:, None, :] + s_minus[None, :, None] * u
        d_plus = sample_density(grid, origin, voxel,
                                  pl.reshape(-1, 3)).reshape(n, half)
        d_minus = sample_density(grid, origin, voxel,
                                   mi.reshape(-1, 3)).reshape(n, half)
        d_along = 0.5 * (d_plus.mean(axis=1) + d_minus.mean(axis=1))
        ring_offsets = (np.cos(perp_az)[:, None] * e1
                        + np.sin(perp_az)[:, None] * e2) * perp_offset
        ring = pts[:, None, :] + ring_offsets[None, :, :]
        d_perp = sample_density(grid, origin, voxel,
                                  ring.reshape(-1, 3)).reshape(n, n_perp_samples)
        d_perp_mean = d_perp.mean(axis=1)
        scores[:, d_idx] = np.maximum(0.0, d_along - d_perp_mean)
        plus_m = d_plus.mean(axis=1); minus_m = d_minus.mean(axis=1)
        asymmetry[:, d_idx] = (np.abs(plus_m - minus_m)
                                / (plus_m + minus_m + 1e-9))
        if hb is not None and (d_idx % 25) == 0:
            hb.beat("classify", candidates=f"orient {d_idx}/{k}")

    cos_angular = np.cos(np.deg2rad(peak_angular_radius_deg))

    # Per-candidate classification + priors lookup.
    for i in range(n):
        s = scores[i]
        s_max = s.max()
        s_mean = s.mean()
        sharpness = s_max - s_mean
        # peak detection via NMS
        order = np.argsort(-s)
        peaks = []
        for idx in order:
            if s[idx] < peak_ratio_threshold * s_max:
                break
            ok = True
            for pi in peaks:
                if dirs[idx] @ dirs[pi] > cos_angular:
                    ok = False; break
            if ok:
                peaks.append(int(idx))
                if len(peaks) >= 4:
                    break
        primary = peaks[0] if peaks else int(order[0])
        local_axis = dirs[primary]

        top2 = 0.0
        if len(peaks) >= 2:
            top2 = float(s[peaks[1]] / max(s_max, 1e-9))
        elif k > 1:
            top2 = float(s[order[1]] / max(s_max, 1e-9))

        # Sheet heuristic: density distributed roughly equally over a
        # great-circle band of directions perpendicular to the sheet
        # normal. Cheap proxy: high mean-score, low peak sharpness AND
        # > sheet_ratio_threshold of directions clear the floor.
        active_frac = float((s > 0.5 * max(s_max, 1e-9)).sum() / k)
        looks_sheety = (sharpness < flat_threshold * 2.0
                        and s_max > flat_threshold
                        and active_frac > sheet_ratio_threshold)

        # Per-class geometric_confidence normalized to [0, 1]:
        #   noise: 0 (no structure to be confident in)
        #   sheet: active_frac (∈ [0,1] — density spread fraction)
        #   junction: top2 ratio (∈ [0,1] — bimodality strength)
        #   tip: asymmetry along primary axis (∈ [0,1])
        #   linear-interior: peak sharpness ratio (s_max - s_mean) / s_max
        sharpness_ratio = float(sharpness / max(s_max, 1e-9))
        if sharpness < flat_threshold:
            cls_name = "noise"
            geom_conf = 0.0
        elif looks_sheety:
            cls_name = "sheet"
            geom_conf = float(active_frac)
        elif len(peaks) >= 2:
            cls_name = "junction"
            geom_conf = float(top2)
        elif asymmetry[i, primary] > tip_asymmetry_threshold:
            cls_name = "tip"
            geom_conf = float(asymmetry[i, primary])
        else:
            cls_name = "linear-interior"
            geom_conf = sharpness_ratio

        geom_conf = max(0.0, min(1.0, geom_conf))

        # Position-frame derivations for priors lookup (Posture-B carve-
        # outs (b) & (c)).
        c = candidates[i]
        cp = np.array([c["x"], c["y"], c["z"]])
        height_frac = (cp[2] - ground) / max(tree_height, 1e-6)
        height_frac = float(np.clip(height_frac, 0.0, 1.0))
        # Radial distance from trunk axis (projection-perpendicular).
        diff = cp - trunk_axis["origin"]
        proj = diff @ trunk_axis["direction"]
        perp = diff - proj * trunk_axis["direction"]
        radial_dist = float(np.linalg.norm(perp))
        # Inferred radius: perpendicular spread of M_obs around c. Cheap
        # proxy: sample density at a small perpendicular offset along
        # local_axis's orthogonal directions; radius is the offset where
        # density falls to half of centre. Bounded to plausible range.
        inferred_radius = _estimate_local_radius(cp, local_axis,
                                                   grid, origin, voxel)

        prior_l = priors["likelihood"](cls_name, height_frac, radial_dist,
                                        inferred_radius, local_axis)
        combined = geom_conf * prior_l

        c["classification"] = cls_name
        c["geometric_confidence"] = geom_conf
        c["prior_likelihood"] = prior_l
        c["combined_confidence"] = combined
        c["local_axis"] = [float(local_axis[0]), float(local_axis[1]),
                            float(local_axis[2])]
        c["height_frac"] = height_frac
        c["radial_dist"] = radial_dist
        c["inferred_radius"] = float(inferred_radius)
        c["top2_ratio"] = top2
        c["asymmetry"] = float(asymmetry[i, primary])

    if hb is not None:
        hb.beat("classify", force=True, candidates=f"{n}/{n} done")
    return candidates


def _estimate_local_radius(point, axis, grid, origin, voxel,
                            n_radial=8, n_az=8, max_radius=0.30):
    """Half-density radius perpendicular to axis."""
    centre_arr = sample_density(grid, origin, voxel, point[None, :])
    centre = float(centre_arr[0])
    if centre < 1e-9:
        return 0.005
    half = 0.5 * centre
    a = axis / (np.linalg.norm(axis) + 1e-12)
    ref = np.array([0.0, 0.0, 1.0]) if abs(a[2]) < 0.999 else np.array([1.0, 0.0, 0.0])
    e1 = np.cross(a, ref); e1 = e1 / (np.linalg.norm(e1) + 1e-12)
    e2 = np.cross(a, e1)
    radii = np.linspace(voxel, max_radius, n_radial)
    az = np.linspace(0, 2 * np.pi, n_az, endpoint=False)
    for r in radii:
        offsets = r * (np.cos(az)[:, None] * e1 + np.sin(az)[:, None] * e2)
        samples = sample_density(grid, origin, voxel, point + offsets)
        if samples.mean() < half:
            return float(r)
    return float(max_radius)


# ── Phase 3a — Precision-gated tip detection ───────────────────────────

def detect_tip_anchors(candidates, grid, origin, voxel, priors,
                        ground, tree_height,
                        tip_geometric_min=0.5, min_nbhd_count=8,
                        tip_elongation_min=5.0,
                        tip_neighborhood_radius=0.15,
                        tau_tip_prior=0.5, hb=None):
    """Six-gate conjunctive admission of tip anchors. Deliberately
    conservative — false-positive tips at leaf-cluster positions would
    poison axonal growth (N.3.2). Per the brief: precision matters far
    more than recall."""
    anchors = []
    rejection_log = {
        "geomConfBelow": 0, "nbhdTooSmall": 0,
        "elongationBelow": 0, "taperNotNegative": 0,
        "priorTipBelow": 0, "classNotTip": 0,
    }
    if not candidates:
        return anchors, rejection_log

    pts = np.array([[c["x"], c["y"], c["z"]] for c in candidates])
    tree = cKDTree(pts)

    for i, c in enumerate(candidates):
        if c.get("classification") != "tip":
            rejection_log["classNotTip"] += 1
            continue
        if c["geometric_confidence"] < tip_geometric_min:
            rejection_log["geomConfBelow"] += 1
            continue
        # Local-PCA in spherical window.
        cp = np.array([c["x"], c["y"], c["z"]])
        nbhd_idx = tree.query_ball_point(cp, r=tip_neighborhood_radius)
        if len(nbhd_idx) < min_nbhd_count:
            rejection_log["nbhdTooSmall"] += 1
            continue
        nbhd_pts = pts[nbhd_idx]
        centred = nbhd_pts - nbhd_pts.mean(axis=0)
        _, S, Vt = np.linalg.svd(centred, full_matrices=False)
        lam = S * S / max(1, len(nbhd_pts) - 1)
        if len(lam) < 2:
            rejection_log["nbhdTooSmall"] += 1
            continue
        elongation = lam[0] / max(lam[1], 1e-9)
        if elongation < tip_elongation_min:
            rejection_log["elongationBelow"] += 1
            continue
        lambda1_axis = Vt[0]
        # Taper-sign check: M_obs spread perpendicular to lambda1_axis
        # along arc-length offsets toward c. Slope must be negative (radius
        # shrinks toward the candidate).
        arc_offsets = np.linspace(-tip_neighborhood_radius,
                                   0.0, 4)
        spreads = []
        for off in arc_offsets:
            sample_pt = cp + off * lambda1_axis
            r = _estimate_local_radius(sample_pt, lambda1_axis,
                                        grid, origin, voxel)
            spreads.append(r)
        spreads = np.array(spreads)
        # Linear fit slope (numerical taper).
        if len(spreads) >= 2 and arc_offsets.std() > 0:
            slope = float(np.polyfit(arc_offsets, spreads, 1)[0])
        else:
            slope = 0.0
        # arc_offsets are NEGATIVE toward c; slope > 0 means radius DECREASES
        # toward c (good); slope <= 0 means flat or growing (bad).
        if slope <= 0:
            rejection_log["taperNotNegative"] += 1
            continue
        # Priors gate — tip class likelihood at this position.
        height_frac = c["height_frac"]
        radial_dist = c["radial_dist"]
        inferred_radius = c["inferred_radius"]
        prior_tip = priors["likelihood"]("tip", height_frac, radial_dist,
                                         inferred_radius, lambda1_axis)
        if prior_tip < tau_tip_prior:
            rejection_log["priorTipBelow"] += 1
            continue
        # All six gates pass.
        # Direction toward trunk = -lambda1_axis if the axis points up-and-out;
        # we orient it toward the trunk by flipping if needed.
        direction_to_trunk = -lambda1_axis
        # Confirm orientation: trunk should be at lower z + smaller radial
        # distance. If direction_to_trunk has wrong sign in z, flip.
        if direction_to_trunk[2] > 0:
            direction_to_trunk = -direction_to_trunk
        anchors.append({
            "position": [float(c["x"]), float(c["y"]), float(c["z"])],
            "direction": [float(direction_to_trunk[0]),
                          float(direction_to_trunk[1]),
                          float(direction_to_trunk[2])],
            "observed_radius": float(inferred_radius),
            "elongation": float(elongation),
            "taper_slope": float(slope),
            "prior_tip": float(prior_tip),
            "geometric_confidence": float(c["geometric_confidence"]),
            "height_frac": float(height_frac),
            "radial_dist": float(radial_dist),
            "candidate_index": int(i),
        })
    if hb is not None:
        hb.beat("tip-detect", force=True,
                tip_anchors=f"emitted {len(anchors)}")
    return anchors, rejection_log


# ── Top-level run ──────────────────────────────────────────────────────

def run_lil_vera_v2_n30(laz_path, species, n_rigs, seed,
                         priors_path=None,
                         k_orient=200, pitch_ratio=0.3,
                         voxel_size=0.03, image_w=384, image_h=288,
                         splat_radius=1, consolidation_voxel=0.05,
                         n_workers=None,
                         tip_geometric_min=0.5,
                         tip_elongation_min=5.0,
                         tau_tip_prior=0.5,
                         tip_neighborhood_radius=0.15,
                         min_nbhd_count=8,
                         softness_override=None):
    """N.3.0 entry point. Single-pass observation, no iteration, no
    adaptive scan, no axonal growth. Emits per-candidate tomography +
    species-conditioned classification + tip-anchor set + diagnostics."""
    t0 = time.time()
    hb = Heartbeat(interval_s=30.0, start=t0)
    hb.pass_n = 1
    hb.beat("load", force=True)

    pts_raw = load_pointcloud(laz_path)
    pts = voxel_downsample(pts_raw, voxel=voxel_size)
    ground, tree_height = derive_bbox_scalars(pts)
    tree_radius_est = float(max(
        np.percentile(np.abs(pts[:, 0]), 99),
        np.percentile(np.abs(pts[:, 1]), 99),
    ))
    t_load = time.time() - t0
    hb.working_set_size = int(len(pts))

    # Priors load + validate.
    priors = load_priors(species, priors_path=priors_path)
    if softness_override is not None:
        # Operator dial-down for diagnostic A/B; per brief Standing Req #9
        # softnessScaling=0 is operator-allowed but flagged.
        priors["data"]["softnessScaling"] = float(softness_override)
        priors["softness"] = float(softness_override)
        # Rebuild closure with new softness — we'd need to re-load the
        # likelihood. Cheap path: rewrite the file in memory and re-load.
        # We mutate softness in the closure scope by re-calling load_priors
        # against the modified-on-disk file would be expensive; instead
        # the likelihood already reads softness from `softness` variable
        # by closure — but Python closures capture by reference for local
        # vars only when explicitly nonlocal'd. To keep things simple +
        # auditable: warn that --softnessScaling at runtime is informational
        # only at N.3.0 (the priors-file `softnessScaling` is the canonical
        # operator dial).
        sys.stderr.write(
            "[lil_vera_v2] WARNING: --softnessScaling CLI override is "
            "informational at N.3.0; canonical dial is the priors-file "
            "field. Tuner-driven softness retuning lands at N.3.1 with "
            "the workstage UI integration.\n"
        )

    # Carve-out (c): RANSAC trunk axis.
    hb.beat("trunk-axis", force=True)
    trunk_axis = ransac_trunk_axis(pts, ground, tree_height, seed=seed)

    # Phase 1 — fixed-N scan (no adaptive loop at N.3.0).
    K = build_intrinsics(image_w, image_h, vfov_deg=45.0)
    target_h = tree_height * 0.5
    if n_workers is None:
        n_workers = max(1, cpu_count() - 1)
    rigs = generate_rig_positions(n_rigs, tree_height, tree_radius_est,
                                    pitch_ratio, seed=seed)
    hb.beat("scan", force=True, rigs=f"{n_rigs} fixed-N (no adaptive at N.3.0)")
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
    hb.beat("scan", force=True, observed_ms=int(t_observe * 1000))

    # Consolidate + consensus deposit.
    t2 = time.time()
    candidates = consolidate_candidates(rig_outputs,
                                          voxel=consolidation_voxel)
    candidates, deposit_stats = multi_rig_consensus_deposit(
        candidates, rig_outputs, K, image_w, image_h)
    t_consol = time.time() - t2
    hb.working_set_size = len(candidates)
    hb.beat("consolidate", force=True, candidates=len(candidates))

    # Density field (Posture-B-pure — built from stereo-recovered
    # candidates, not source 3D).
    grid, gorigin, gvoxel = build_candidate_density_field(
        candidates, voxel=consolidation_voxel, sigma_voxels=1.5)

    # Phase 2 — species-conditioned classification (TAG, don't commit).
    t3 = time.time()
    candidates = classify_candidates(
        candidates, grid, gorigin, gvoxel, priors,
        trunk_axis, ground, tree_height, k_orient=k_orient, hb=hb)
    t_class = time.time() - t3

    # Class distribution diagnostic.
    class_counts = {name: 0 for name in CLS_NAMES.values()}
    for c in candidates:
        cname = c.get("classification", "noise")
        class_counts[cname] = class_counts.get(cname, 0) + 1
    total_classified = sum(class_counts.values())
    structural = (class_counts.get("linear-interior", 0)
                  + class_counts.get("junction", 0)
                  + class_counts.get("tip", 0))
    fractions = {}
    if structural > 0:
        for c_name in ("linear-interior", "junction", "tip"):
            fractions[c_name] = class_counts[c_name] / structural

    # Phase 3a — precision-gated tip detection.
    t4 = time.time()
    tip_anchors, tip_rejection_log = detect_tip_anchors(
        candidates, grid, gorigin, gvoxel, priors, ground, tree_height,
        tip_geometric_min=tip_geometric_min,
        tip_elongation_min=tip_elongation_min,
        tau_tip_prior=tau_tip_prior,
        tip_neighborhood_radius=tip_neighborhood_radius,
        min_nbhd_count=min_nbhd_count, hb=hb)
    t_tip = time.time() - t4

    # Wire candidates → per-candidate light JSON (drop M_obs view data;
    # keep just what the workstage layer + downstream stages need).
    out_candidates = []
    for c in candidates:
        out_candidates.append({
            "x": c["x"], "y": c["y"], "z": c["z"],
            "classification": c["classification"],
            "geometric_confidence": c["geometric_confidence"],
            "prior_likelihood": c["prior_likelihood"],
            "combined_confidence": c["combined_confidence"],
            "local_axis": c["local_axis"],
            "height_frac": c["height_frac"],
            "radial_dist": c["radial_dist"],
            "inferred_radius": c["inferred_radius"],
            "rigs_seen": c["m_obs"]["rigs_seen"],
            "medial_count": c["m_obs"]["medial_count"],
            "silhouette_count": c["m_obs"]["silhouette_count"],
            "body_count": c["m_obs"]["body_count"],
        })

    elapsed_ms = int((time.time() - t0) * 1000)

    # Per-pass diagnostics — single pass at N.3.0.
    per_pass_diag = [{
        "pass": 1,
        "rigsScannedThisPass": int(n_rigs),
        "scanBatchesThisPass": 1,
        "scanTerminationReason": "fixedN-N.3.0",
        "candidatesAfterConsolidation": int(len(candidates)),
        "classCounts": class_counts,
        "classFractionsOfStructural": fractions,
        "expectedFractions": priors["expected_fractions"],
        "tipAnchorCount": int(len(tip_anchors)),
        "tipRejectionLog": tip_rejection_log,
        # N.3.1+ fields stubbed at zero / null:
        "workingSetSize": int(len(candidates)),
        "lockedIn": 0,
        "rejected": 0,
        "deferred": int(len(candidates)),
        "newSplines": 0,
        "activeProbes": 0,
        "handshakeCount": 0,
        "stalledProbeCount": 0,
        "orphanCount": 0,
    }]

    result = {
        "treeId": None,  # set by caller
        "speciesId": species,
        "stage": "N.3.0",
        "candidates": out_candidates,
        "tipAnchors": tip_anchors,
        # N.3.2+ field — empty at N.3.0.
        "splines": [],
        "trunkAxis": {
            "origin": trunk_axis["origin"].tolist(),
            "direction": trunk_axis["direction"].tolist(),
            "verticalityDeg": trunk_axis["verticalityDeg"],
            "inlierFraction": trunk_axis["inlierFraction"],
            "inlierCount": trunk_axis["inlierCount"],
        },
        "ground": float(ground),
        "treeHeight": float(tree_height),
        "treeRadiusEstimate": float(tree_radius_est),
        "hyperparams": {
            "stage": "N.3.0",
            "N": int(n_rigs),
            "seed": int(seed),
            "kOrient": int(k_orient),
            "pitchRatio": float(pitch_ratio),
            "voxelSize": float(voxel_size),
            "consolidationVoxel": float(consolidation_voxel),
            "imageW": int(image_w),
            "imageH": int(image_h),
            "splatRadius": int(splat_radius),
            "tipGeometricMin": float(tip_geometric_min),
            "tipElongationMin": float(tip_elongation_min),
            "tauTipPrior": float(tau_tip_prior),
            "tipNeighborhoodRadius": float(tip_neighborhood_radius),
            "minNbhdCount": int(min_nbhd_count),
            "speciesId": species,
            "priorsHash": priors["hash"],
            "priorsPath": priors["path"],
            "softnessScaling": priors["softness"],
            "workers": int(n_workers),
        },
        "perPassDiagnostics": per_pass_diag,
        "stats": {
            "pointsRaw": int(len(pts_raw)),
            "pointsDownsampled": int(len(pts)),
            "treeHeight": float(tree_height),
            "treeRadius": float(tree_radius_est),
            "rigs": int(n_rigs),
            "cameras": int(3 * n_rigs),
            "candidates": int(len(candidates)),
            "tipAnchorCount": int(len(tip_anchors)),
            "totalSplines": 0,
            "fromHandshakeCount": 0,
            "fromTaperOnlyCount": 0,
            "orphanCount": 0,
            "totalRigsScanned": int(n_rigs),
            "scanTerminatedBy": "fixedN-N.3.0",
            "passes": 1,
            "terminatedBy": "N.3.0-singlePass",
            "elapsedMs": elapsed_ms,
            "loadMs": int(t_load * 1000),
            "observeMs": int(t_observe * 1000),
            "consolidateMs": int(t_consol * 1000),
            "classifyMs": int(t_class * 1000),
            "tipDetectMs": int(t_tip * 1000),
            "classCounts": class_counts,
            "classFractionsOfStructural": fractions,
            "expectedFractions": priors["expected_fractions"],
            "deposit": deposit_stats,
            "trunkVerticalityDeg": trunk_axis["verticalityDeg"],
            "trunkInlierFraction": trunk_axis["inlierFraction"],
        },
    }
    hb.beat("done", force=True, elapsed_ms=elapsed_ms)
    return result


# ── Disk persistence ───────────────────────────────────────────────────

def persist_run(tree_id, n_rigs, result, out_override=None):
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


# ── CLI ────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Project: Li'l Vera v2 — Cycle 1 rev. 2 — N.3.0 First Light "
                    "(classifier + priors + tip-detector validation)")
    ap.add_argument("--treeId", required=True)
    ap.add_argument("--species", required=True,
                    help="Species identity (e.g. acer_saccharum). Conditions every "
                         "classification decision via state/<species>/botanical-priors.json")
    ap.add_argument("--N", type=int, default=50,
                    help="Total rig positions (N.3.0 is fixed-N; adaptive lands N.3.1)")
    ap.add_argument("--seed", type=int, default=42,
                    help="RNG seed; same seed → byte-identical output (Std. Req. #6)")
    ap.add_argument("--kOrient", type=int, default=200)
    ap.add_argument("--pitch", type=float, default=0.3)
    ap.add_argument("--voxelSize", type=float, default=0.03)
    ap.add_argument("--consolidationVoxel", type=float, default=0.05)
    ap.add_argument("--imageW", type=int, default=384)
    ap.add_argument("--imageH", type=int, default=288)
    ap.add_argument("--splatRadius", type=int, default=1)
    ap.add_argument("--tipGeometricMin", type=float, default=0.5)
    ap.add_argument("--tipElongationMin", type=float, default=5.0)
    ap.add_argument("--tauTipPrior", type=float, default=0.5)
    ap.add_argument("--tipNeighborhoodRadius", type=float, default=0.15)
    ap.add_argument("--minNbhdCount", type=int, default=8)
    ap.add_argument("--priorsPath", default=None,
                    help="Override priors-file path (default: state/<species>/botanical-priors.json)")
    ap.add_argument("--workers", type=int, default=0,
                    help="multiprocessing workers; 0 = auto. Force 1 for byte-identical "
                         "deterministic runs across machines.")
    ap.add_argument("--out", default=None)
    ap.add_argument("--datasetRoot", default=None)
    args = ap.parse_args()

    laz_path = specimen_laz_path(
        args.treeId,
        args.datasetRoot or (ROOT / "botanica"))
    if not laz_path.exists():
        print(json.dumps({"error": "specimen not on disk",
                          "treeId": args.treeId, "lazPath": str(laz_path)}))
        return 2

    workers = args.workers if args.workers > 0 else None
    result = run_lil_vera_v2_n30(
        laz_path, args.species, n_rigs=args.N, seed=args.seed,
        priors_path=args.priorsPath,
        k_orient=args.kOrient, pitch_ratio=args.pitch,
        voxel_size=args.voxelSize, image_w=args.imageW, image_h=args.imageH,
        splat_radius=args.splatRadius,
        consolidation_voxel=args.consolidationVoxel,
        n_workers=workers,
        tip_geometric_min=args.tipGeometricMin,
        tip_elongation_min=args.tipElongationMin,
        tau_tip_prior=args.tauTipPrior,
        tip_neighborhood_radius=args.tipNeighborhoodRadius,
        min_nbhd_count=args.minNbhdCount,
    )
    result["treeId"] = args.treeId
    out_path = persist_run(args.treeId, args.N, result, out_override=args.out)
    rel = (str(out_path.relative_to(ROOT))
           if str(out_path).startswith(str(ROOT)) else str(out_path))
    result["savedTo"] = rel
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
