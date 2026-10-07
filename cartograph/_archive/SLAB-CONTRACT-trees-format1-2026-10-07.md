# SLAB-CONTRACT §8 — trees.json FORMAT 1 (retired 2026-10-07)

Superseded by format 2 (`SLAB-CONTRACT.md §8`, `arborist/treesFormat.mjs`). Kept for the record: format 1 was written
pretty-printed, carried a `tiles.instancesByTile` copy of every placement (the runtime read only `tiles.cols/rows`, for a
log; its per-tile split was retired 2026-06-27), and `lods` on every placement. Measured on huron: 27.8 MB, of which 9.7 MB
whitespace and 9.06 MB the tiles copy. A reader tells it from format 2 by the absent `format`.

```jsonc
{
  "generatedAt": 1778618272484,
  "scene": "lafayette-square",
  "lod": "lod2",
  "activeStyles": ["realistic"],
  "count": 745,
  "unmatched": 0,
  "uniqueVariants": 25,
  "tiles": {
    "cols": 4, "rows": 4,
    "minX": -203.2, "minZ": -200.4,
    "tileW": 102.85, "tileD": 101.25,
    "instancesByTile": [
      {
        "tileX": 0, "tileZ": 0,
        "instances": [
          {
            "x": -116.5, "y": 0, "z": -184.6,
            "url": "/trees/magnolia_sp/skeleton-2-lod2.glb",
            "rotY": -0.5479,
            "species": "magnolia_sp",
            "variantId": 2,
            "category": "broadleaf",
            "lampGlow": 1.4777
          },
          …
        ]
      }
    ]
  }
}
```

| Field | Meaning |
|---|---|
| `count` | Total instance count across all tiles |
| `unmatched` | Instances whose species couldn't match a roster entry (should be 0 in production) |
| `uniqueVariants` | Number of distinct GLB skeletons referenced |
| `tiles` | Spatial bin index — consumers can frustum-cull at the tile level |
| `instances[].url` | Path to a GLB at `/trees/<species>/skeleton-N-lod2.glb`, served from `public/trees/` |
| `instances[].lampGlow` | Per-tree multiplier evaluated by `bake-trees.js` against `street_lamps.json` (gaussian falloff); drives the warm-glow blend |
| `instances[].rotY` | Y-axis rotation in radians |
