#!/usr/bin/env python3
"""
preview-laz.py — convert one FOR-species20K .laz file into a binary
little-endian PLY suitable for Three.js's PLYLoader to render as a
point cloud in the Arborist's Specimen Browser viewport.

Usage:
    arborist/.venv/bin/python arborist/preview-laz.py \
        --input  botanica/dev/10280.laz \
        --output arborist/_cache/preview/10280.ply \
        [--max-points 50000]

The endpoint /specimens/:treeId/preview.ply caches outputs under
arborist/_cache/preview/<treeId>.ply, so re-requesting the same
specimen never re-runs this script.
"""
import argparse
import os
import struct
import sys

import laspy
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input",  required=True, help="path to a .laz / .las file")
    ap.add_argument("--output", required=True, help="path to write the .ply")
    ap.add_argument(
        "--max-points", type=int, default=50_000,
        help="random-subsample the cloud down to this many points if larger; "
             "0 = keep all. Default 50k keeps PLYs small enough for fast "
             "browser load while preserving silhouette legibility.",
    )
    args = ap.parse_args()

    if not os.path.exists(args.input):
        print(f"input not found: {args.input}", file=sys.stderr)
        return 2

    las = laspy.read(args.input)
    pts = np.column_stack((las.x, las.y, las.z)).astype(np.float32)
    n_in = len(pts)

    # Stratified subsample: random indices, deterministic seed so the same
    # specimen always produces the same PLY (cache friendliness).
    if args.max_points and n_in > args.max_points:
        rng = np.random.default_rng(seed=42)
        idx = rng.choice(n_in, size=args.max_points, replace=False)
        idx.sort()  # keep file deterministic-ordered, helps gzip / diffs
        pts = pts[idx]

    # Center on XY median, drop Z floor to 0 — gives the browser an origin
    # that's predictable regardless of the source's coordinate system.
    pts[:, 0] -= np.median(pts[:, 0])
    pts[:, 1] -= np.median(pts[:, 1])
    pts[:, 2] -= pts[:, 2].min()

    n_out = len(pts)
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    # Binary little-endian PLY. Three.js's PLYLoader handles this.
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {n_out}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "end_header\n"
    ).encode("ascii")
    with open(args.output, "wb") as f:
        f.write(header)
        f.write(pts.tobytes(order="C"))

    sz = os.path.getsize(args.output)
    print(f"wrote {args.output}  ({n_out:,} of {n_in:,} pts, {sz:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
