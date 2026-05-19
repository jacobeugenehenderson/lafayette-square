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

import numpy as np
import trimesh

# Pipeline helpers (Phase L Cycle 1 refactor 2026-05-19) live in lidar_extract.py
# so the LidarWorkstage can drive interactive re-extraction via the same
# load → voxel → slab-cluster → parent-link path. Algorithm unchanged.
from lidar_extract import (
    load_pointcloud,
    voxel_downsample,
    extract_skeleton,
    specimen_laz_path,
)


# ── Paths ────────────────────────────────────────────────────────────────
HERE = Path(__file__).parent
ROOT = HERE.parent
STATE_DIR = HERE / "state"
TREES_DIR = ROOT / "public" / "trees"
SPECIES_MAP = HERE / "species-map.json"
CONFIG_PATH = HERE / "config.json"


def log(*args):
    print(*args, flush=True)


# ── Pipeline (cylinder meshing + tips + GLB export retained here;
#    load / voxel / skeleton extraction moved to lidar_extract.py) ────────

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
    # sourceFile is a snapshot field that older /species/:id/seedlings POSTs
    # omitted (the serve.js POST schema doesn't accept it; the value is
    # always derivable from treeId via specimenLazPath). Fall back to that
    # derivation. Keeps old seedling files baking.
    if "sourceFile" in seedling and seedling["sourceFile"]:
        src = ROOT / seedling["sourceFile"]
    else:
        src = specimen_laz_path(seedling["treeId"])
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
        "sourceFile": seedling.get("sourceFile") or f"botanica/dev/{seedling['treeId']}.laz",
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
