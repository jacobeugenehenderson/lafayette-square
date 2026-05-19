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

def _emit_cylinder(p, c, radius, sections):
    """Build one tapered-style cylinder spanning node p → node c."""
    axis = c["pos"] - p["pos"]
    length = float(np.linalg.norm(axis))
    if length < 1e-3:
        return None
    cyl = trimesh.creation.cylinder(radius=radius, height=length, sections=sections)
    z_axis = np.array([0, 0, 1.0])
    target_axis = axis / length
    v = np.cross(z_axis, target_axis)
    s = float(np.linalg.norm(v))
    cdot = float(np.dot(z_axis, target_axis))
    if s < 1e-9:
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
    return cyl


def build_region_meshes(nodes, edges, min_radius=0.005, region_threshold=None):
    """Partition cylinders by radius into trunk (≥ threshold) and branch
    (< threshold) sub-meshes. Returns (trunk_mesh, branch_mesh, threshold_used,
    counts).

    Phase L Cycle 2 (per-region bark binding): the published GLB carries the
    classification via two named primitives. bake-look + InstancedTrees gate
    per-region uniforms off the primitive identity downstream — preserves
    Bloom's single shader program (variation lives in uniforms, not branched
    shaders).

    Trunk cylinders use 8 radial sections (smoother bark wraps at LS Hero);
    branch cylinders use 6 (tri-budget). Matches the lod0Tris estimate in
    LidarWorkstage.jsx.

    region_threshold=None → auto-compute as median of all surviving cylinder
    radii. Operator can override via tuneParams.regionThreshold.
    """
    # Per-cylinder radius (smaller of parent/child — child end characterizes
    # branch taper) + survives min_radius filter.
    cyls = []  # list of (parent, child, radius)
    for parent_i, child_i in edges:
        p = nodes[parent_i]
        c = nodes[child_i]
        radius = min(p["radius"], c["radius"])
        if radius < min_radius:
            continue
        cyls.append((p, c, radius))
    if not cyls:
        return None, None, None, {"trunkCount": 0, "branchCount": 0}

    if region_threshold is None:
        region_threshold = float(np.median([r for _, _, r in cyls]))

    trunk_geos, branch_geos = [], []
    for p, c, radius in cyls:
        if radius >= region_threshold:
            cyl = _emit_cylinder(p, c, radius, sections=8)
            if cyl is not None:
                trunk_geos.append(cyl)
        else:
            cyl = _emit_cylinder(p, c, radius, sections=6)
            if cyl is not None:
                branch_geos.append(cyl)

    trunk_mesh = trimesh.util.concatenate(trunk_geos) if trunk_geos else None
    branch_mesh = trimesh.util.concatenate(branch_geos) if branch_geos else None
    counts = {"trunkCount": len(trunk_geos), "branchCount": len(branch_geos)}
    return trunk_mesh, branch_mesh, region_threshold, counts


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
    region_threshold = params.get("regionThreshold")
    trunk_mesh, branch_mesh, threshold_used, counts = build_region_meshes(
        nodes, edges,
        min_radius=params["minRadius"],
        region_threshold=region_threshold,
    )
    if trunk_mesh is None and branch_mesh is None:
        raise RuntimeError(f"no cylinders survived min_radius={params['minRadius']}")
    # Per-region: assign each sub-mesh a distinct material with a region-named
    # `material.name`. The geometry NAME and MATERIAL NAME both survive
    # gltf-transform's atlas pass; bake-look reads mesh name to stamp
    # extras.barkRegion, which InstancedTrees then gates on at runtime.
    scene = trimesh.Scene()
    trunk_verts = trunk_faces = 0
    branch_verts = branch_faces = 0
    if trunk_mesh is not None:
        trunk_mat = trimesh.visual.material.PBRMaterial(name="trunkBark")
        trunk_mesh.visual = trimesh.visual.TextureVisuals(material=trunk_mat)
        scene.add_geometry(trunk_mesh, geom_name="trunkBark", node_name="trunkBark")
        trunk_verts = len(trunk_mesh.vertices)
        trunk_faces = len(trunk_mesh.faces)
    if branch_mesh is not None:
        branch_mat = trimesh.visual.material.PBRMaterial(name="branchBark")
        branch_mesh.visual = trimesh.visual.TextureVisuals(material=branch_mat)
        scene.add_geometry(branch_mesh, geom_name="branchBark", node_name="branchBark")
        branch_verts = len(branch_mesh.vertices)
        branch_faces = len(branch_mesh.faces)
    total_verts = trunk_verts + branch_verts
    total_faces = trunk_faces + branch_faces
    log(f"  [{seedling['treeId']}] regions: trunk {counts['trunkCount']}c/{trunk_faces}f, "
        f"branch {counts['branchCount']}c/{branch_faces}f, threshold={threshold_used:.4f}m")
    tips = extract_tips(nodes, edges, tip_radius=params["tipRadius"])
    log(f"  [{seedling['treeId']}] tips: {len(tips):,}")
    glb_name = f"skeleton-{variant_idx}.glb"
    tips_name = f"tips-{variant_idx}.json"
    scene.export(out_dir / glb_name, file_type="glb")
    with open(out_dir / tips_name, "w") as f:
        json.dump({
            "treeId": seedling["treeId"],
            "count": len(tips),
            "tips": tips.tolist(),
        }, f)
    elapsed = time.time() - t0
    log(f"  [{seedling['treeId']}] wrote {glb_name} + {tips_name} in {elapsed:.1f}s")
    # Persist the auto-computed threshold back into the variant record so
    # subsequent bakes (and the runtime manifest's bark.regionThreshold)
    # stay deterministic across re-publishes.
    persisted_params = {**params, "regionThreshold": float(threshold_used)}
    return {
        "id": variant_idx,
        "treeId": seedling["treeId"],
        "treeH": seedling.get("treeH"),
        "sourceFile": seedling.get("sourceFile") or f"botanica/dev/{seedling['treeId']}.laz",
        "skeleton": glb_name,
        "tips": tips_name,
        "tuneParams": persisted_params,
        "stats": {
            "nodes": len(nodes),
            "edges": len(edges),
            "verts": total_verts,
            "faces": total_faces,
            "trunkCylinders": counts["trunkCount"],
            "branchCylinders": counts["branchCount"],
            "regionThreshold": float(threshold_used),
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

    # Hero-species routing (Phase L Cycle 2): the scan-source species
    # (acer_saccharum) provides seedlings + bark spec + heroSpecies pointer;
    # the BAKED ARTIFACT lives under the hero species id (acer_saccharum_procedural)
    # so park_species_map's preferred-species lottery picks the LiDAR-baked
    # variants under the same id procedural variants will eventually share.
    # If no heroSpecies set, output stays under the scan id (legacy behavior).
    hero_species = decl.get("heroSpecies") or args.species
    out_dir = TREES_DIR / hero_species
    out_dir.mkdir(parents=True, exist_ok=True)

    log(f"baking {args.species} → {hero_species} ({decl['label']}): {len(seedlings)} seedlings")
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

    # Per-region bark spec (Phase L Cycle 2). decl.bark may carry:
    #   {trunk: {...}, branch: {...}}        — per-region (new)
    #   {materialRef, uvScale, tintBase, …} — single-spec (legacy procedural)
    # Manifest mirrors whichever shape is on disk. The runtime resolves both
    # in InstancedTrees via barkBySpecies[<id>].trunk / .branch fallback.
    bark_spec = decl.get("bark")
    bark_manifest = None
    if bark_spec:
        if "trunk" in bark_spec or "branch" in bark_spec:
            # Use the first variant's threshold (variants of same species share
            # the same skeleton-extraction defaults; if operators tune per-variant
            # the per-variant stats.regionThreshold is also stamped).
            shared_threshold = variants_meta[0]["stats"].get("regionThreshold")
            bark_manifest = {
                "trunk": bark_spec.get("trunk"),
                "branch": bark_spec.get("branch"),
                "regionThreshold": shared_threshold,
            }
        else:
            bark_manifest = bark_spec

    manifest = {
        "species":    hero_species,
        "sourceSpecies": args.species,
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
    if bark_manifest is not None:
        manifest["bark"] = bark_manifest
    if decl.get("qualityOverride") is not None:
        manifest["qualityOverride"] = decl["qualityOverride"]
    with open(out_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    update_index(hero_species, decl, len(variants_meta))
    log(f"wrote {out_dir}/manifest.json ({len(variants_meta)} variants, {len(failures)} failures)")
    log(f"total bake time: {time.time() - t_all:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
