# Slab Contract

The boundary spec between **cartograph** (producer) and **LS** (consumer).

The slab is everything under `public/baked/`. Cartograph publishes; LS reads. Neither side imports the other's source code. Anything in this doc is the contract; anything outside it is implementation detail of one side or the other.

This doc is owned by neither app — it lives at the repo root next to `PUBLISH.md` because it's the *interface*. Drift between sides is not allowed without revising this file.

Last verified: 2026-05-12 against `cartograph-looks-pass-ab @ b39834b`. Cross-refs: [`cartograph/ARCHITECTURE.md`](cartograph/ARCHITECTURE.md) (producer architecture), [`ls/ARCHITECTURE.md`](ls/ARCHITECTURE.md) §2 (consumer architecture), [`ls/reference/INVENTORY-DATA.md`](ls/reference/INVENTORY-DATA.md) §A (consumer mount status).

---

## 0. Scope and version

**Slab version:** every manifest carries `"version": 1`. A consumer MUST refuse to render manifests with a version it doesn't recognize. A producer that changes the binary layout, group semantics, or coordinate frame MUST bump this number.

**Coordinate frame:** all slab geometry is in **compass-frame world meters**, origin at the neighborhood center, equirectangular GPS→meters projection. No rotation applied. Y is up; XZ is the ground plane. See [`cartograph/FEATURES.md` §"Frame discipline"](cartograph/FEATURES.md) for the canonical statement and the historical reasons.

**Look ID:** each slab is identified by a `look` string (e.g., `lafayette-square`). The look ID determines the directory under `public/baked/<look>/`. The consumer chooses which look to mount via a prop or store; the producer never picks for the consumer.

**Scene vs. Look:** a *scene* is a dataset (the neighborhood — `lafayette-square`, `toy`, future others). A *Look* is a styling snapshot keyed by scene. The slab artifacts are scene-keyed, not look-keyed: `public/baked/lafayette-square/` is the LS scene; `public/baked/toy/` is the toy scene; per-Look variation today is folded into the single set of artifacts for each scene via the active design.json.

---

## 1. Directory layout

```
public/baked/
├── <look>/                          ← per-scene/look artifacts
│   ├── ground.json                  ← geometry manifest (face + material groups)
│   ├── ground.bin                   ← binary positions + indices (sibling of ground.json)
│   ├── ground.lightmap.png          ← baked AO PNG
│   ├── scene.json                   ← look-side palette, layer colors, vis flags, lamp glow
│   ├── lamps.json                   ← lamp point cloud + scene-relative metadata
│   ├── buildings.json               ← geometry manifest (foundation + wall + roof groups)
│   ├── buildings.bin                ← binary positions + colors + UVs + centroidY + indices
│   ├── trees-atlas.json             ← per-look tree material atlas manifest
│   ├── trees-atlas-bark-color.png   ← bark color atlas
│   ├── trees-atlas-bark-normal.png  ← bark normals
│   ├── trees-atlas-leaves-color.png ← leaf color atlas
│   ├── trees-atlas-leaves-normal.png← leaf normals
│   └── trees/                       ← UV-rewritten GLB tree variants for this look
│       └── <species>/skeleton-N-lod2.glb
├── default.json                     ← arborist tree placements (one canonical placement,
│                                       shared across all looks; styling varies via atlas)
└── <look>.json                      ← (some looks) tree placement override pointer
```

**Cache-busting:** consumers MUST request manifests with `?t=<bakeLastMs>` where `bakeLastMs` is a unique-per-bake timestamp from the consumer's store. `BakedGround`, `BakedLamps`, `InstancedTrees`, `treeAtlasMaterial`, `LafayettePark`, `StageArch`, `BakedBuildings` all follow this pattern today. Reusing a stale `bakeLastMs` causes browser HTTP cache to serve last-bake artifacts. See [`cartograph/FEATURES.md` §"Bake artifacts are browser-cached"](cartograph/FEATURES.md) for the historical bug.

---

## 2. `ground.json` — ground geometry manifest

The single-mesh ground slab. One JSON manifest + one binary buffer.

### Top-level fields

```jsonc
{
  "version": 1,
  "look": "lafayette-square",
  "bbox": { "min": [x, 0, z], "max": [x, 0, z] },
  "stencil": { … } | null,
  "bin": "ground.bin",
  "positionFormat": "float32",
  "indexFormat": "uint32",
  "componentsPerVertex": 3,
  "groups": [ … ]
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `version` | number | ✅ | Slab format version (1) |
| `look` | string | ✅ | Identifier; must match the directory name |
| `bbox` | `{min:[x,y,z], max:[x,y,z]}` | ✅ | World-meters bounding box of all ground vertices. `y` typically 0. |
| `stencil` | object \| `null` | ✅ | Radial-fade silhouette parameters; **MAY be `null`** for scenes with no soft-circle silhouette (toy). Consumers MUST skip the radial-fade shader when null. |
| `bin` | string | ✅ | Filename of the binary buffer, relative to this manifest |
| `positionFormat` | `"float32"` | ✅ | |
| `indexFormat` | `"uint32"` | ✅ | |
| `componentsPerVertex` | `3` | ✅ | XYZ |
| `groups` | array | ✅ | One entry per drawable subset of the buffer; see §2.2 |

### 2.1. Stencil shape (when non-null)

```jsonc
{
  "center": [x, z],
  "radius": <meters>,
  "fade":       { "inner": <m>, "outer": <m> },
  "streetFade": { "inner": <m>, "outer": <m> }
}
```

`center` is in world-meters (XZ); `radius` is the hard silhouette radius. `fade` controls non-street layers' alpha falloff (block fills, parcels). `streetFade` controls roadway alpha falloff (typically extends further than `fade`). When `stencil` is null, the consumer renders all groups full-alpha.

### 2.2. Group entries

Each group describes a contiguous slice of `ground.bin`:

```jsonc
{
  "kind": "face" | "mat",
  "id": "residential" | "commercial" | "street" | "highway" | "curb" | ... ,
  "color": "#5A8A3A",
  "renderOrder": 0,
  "polygonOffsetUnits": -1,
  "vertexCount": 3631,
  "vertexByteOffset": 0,
  "indexCount": 10533,
  "indexByteOffset": 937212
}
```

| Field | Meaning |
|---|---|
| `kind` | `"face"` for land-use polygons (residential, commercial, parking, recreation, …) or `"mat"` for layered overlays (street, curb, sidewalk, treelawn, stripe, bikelane, building footprints, paths, alleys, water, …) |
| `id` | Group identity. For `face` groups: a land-use category. For `mat` groups: a layer name from the cartograph design palette. |
| `color` | Hex string. Resolution: bake reads the active Look's `design.json` `layerColors` / `luColors` and bakes the color into the group, so swapping looks = re-bake (not a runtime palette swap). |
| `renderOrder` | Three.js render order. Pure integers, increasing = later draw. The bake assigns these based on layer priority. |
| `polygonOffsetUnits` | Three.js `polygonOffsetUnits`. Negative = pulled toward camera. Used to resolve coplanar z-fighting at the slab. |
| `vertexCount`, `vertexByteOffset` | Position buffer slice |
| `indexCount`, `indexByteOffset` | Index buffer slice |

### 2.3. Binary layout (`ground.bin`)

A single buffer. The manifest's `vertexByteOffset` + `indexByteOffset` per group describe how to slice it. Format:

```
| float32 positions for group 0 |
| float32 positions for group 1 |
| … all positions for all groups …  ← total = sum(vertexCount) × 12 bytes
| uint32 indices  for group 0   |
| uint32 indices  for group 1   |
| … all indices for all groups …
```

Vertices are XYZ triples in world-meters. Indices are absolute into the same buffer's position array (not group-relative). The first 4 floats of the LS slab as of this writing: `[-273.6, 0, 239.7, -272.5]` — i.e., world XZ with Y=0 on the ground plane.

### 2.4. Group kinds in production

LS slab today (44 groups): 10 `face` (land-use) + 34 `mat` (layered overlays).

`face` IDs observed: `residential`, `commercial`, `vacant`, `vacant-commercial`, `parking`, `institutional`, `recreation`, `industrial`, `park`, `water`.

`mat` IDs observed: `street`, `highway`, `stripe`, `edgeline`, `bikelane`, `lot`, `curb`, `sidewalk`, `treelawn`, `building`, `parking_lot`, `garden`, `playground`, `swimming_pool`, `pitch`, `sports_centre`, `wood`, `scrub`, `tree_row`, `alley`, `footway`, `cycleway`, `steps`, `path`, `tree`, `lamp`, `fence`, `wall`, `retaining_wall`, `hedge`, `labels`. (Set depends on what the look enables in `layerVis`.)

---

## 3. `ground.lightmap.png` — baked AO

PNG lightmap, produced by `cartograph/bake-ground-ao.js`. Sampled by `BakedGround` via UVs derived from the ground bbox. Single channel of meaningful data (luminance); other channels typically duplicated or zero.

Resolution and format are producer's choice; consumer reads via standard Three.js `TextureLoader`. The lightmap MUST be valid for the manifest's bbox — re-bake of the ground geometry without re-baking AO results in misaligned occlusion.

---

## 4. `scene.json` — look-side styling carried into runtime

Per-look styling metadata. Consumed alongside `ground.json` (and `lamps.json`, `buildings.json`) to set live material colors, layer visibility, and the lamp glow palette.

```jsonc
{
  "version": 1,
  "look": "lafayette-square",
  "palette":          [ "#dcdcdc", "#a0522d", … ],
  "materialPhysics":  { … },
  "materialColors":   { … },
  "layerColors":      { "street": "#4A4A48", "curb": "#A8826A", … },
  "luColors":         { "residential": "#5A8A3A", "commercial": "#A87D3E", … },
  "layerVis":         { "street": true, "edgeline": false, … },
  "lampGlow":         { … }
}
```

| Field | Meaning |
|---|---|
| `palette` | Building-palette colors (foundation + walls + roofs). |
| `materialPhysics` | Per-material PBR overrides (roughness, metalness, emissive intensity). Today: usually empty; cartograph plumbs through but rarely authors. |
| `materialColors` | Per-material color overrides outside of layer scope. |
| `layerColors` | Map of layer name → hex. The bake reads these to color `mat`-kind groups; they ALSO travel in `scene.json` so consumers can re-color outline strokes / wireframes live. |
| `luColors` | Map of land-use category → hex. |
| `layerVis` | Map of layer name → bool. Layers set false do not get baked into `ground.json` groups, so this is redundant on the slab side; it's surfaced for Designer-side inspection and reference. |
| `lampGlow` | Lamp emission / bloom parameters (color, intensity, attenuation). Consumed by `BakedLamps` and `StreetLights`. |

---

## 5. `lamps.json` — lamp point cloud

```jsonc
{
  "version": 1,
  "look": "lafayette-square",
  "count": 80,
  "lamps": [
    { "x": -76.5, "z": 144.3, "park": true },
    { "x": 61.0, "z": -79.4, "park": true },
    …
  ]
}
```

| Field | Meaning |
|---|---|
| `count` | Length of `lamps` array. |
| `lamps[].x`, `lamps[].z` | World-meters position. Y is computed at runtime from terrain. |
| `lamps[].park` | Bool: park-style lamp (vs street-style). Drives lamp model + glow params. |

Consumer: `src/components/BakedLamps.jsx` (Stage + Preview today; production still mounts the live `StreetLights` component pending L1.1 in the LS backlog).

---

## 6. `buildings.json` — building geometry manifest

The merged-mesh buildings slab. Same shape as `ground.json` but with per-vertex color + UV + centroid-Y attributes for shading.

```jsonc
{
  "version": 1,
  "look": "lafayette-square",
  "bbox": { … },
  "bin": "buildings.bin",
  "positionFormat": "float32",
  "colorFormat": "float32",
  "uvFormat": "float32",
  "centroidYFormat": "float32",
  "indexFormat": "uint32",
  "componentsPerVertex": 3,
  "colorsPerVertex": 3,
  "uvsPerVertex": 2,
  "centroidYsPerVertex": 1,
  "buildingCount": 1056,
  "groups": [ … ]
}
```

### 6.1. Group entry

```jsonc
{
  "kind": "foundation" | "wall" | "roof",
  "id": "foundation" | "brick_red" | "brick_weathered" | … ,
  "color": "#B8A88A",
  "roughness": 0.95,
  "metalness": 0,
  "textureScale": 1,
  "textureStrength": 0.4,
  "emissive": "#000000",
  "emissiveIntensity": 0,
  "renderOrder": 0,
  "vertexCount":   25832,
  "vertexByteOffset":      0,
  "colorByteOffset":  762132,
  "uvByteOffset":    1524264,
  "centroidYByteOffset": 2032352,
  "indexCount":    38748,
  "indexByteOffset": 2286396
}
```

### 6.2. Binary layout

```
| positions  (float32 × 3)   |
| colors     (float32 × 3)   |
| uvs        (float32 × 2)   |
| centroidYs (float32 × 1)   |
| indices    (uint32)        |
```

All four per-vertex attributes are sliced by per-group byte offsets, then indices follow.

### 6.3. Consumer status

LS production today **does NOT mount this artifact.** It exists for `src/preview/BakedBuildings.jsx` (Preview) to prove perf characteristics. Production `LafayetteScene` reads live `src/data/buildings.json` for per-id interactivity (click handlers, neon, place state — see [`cartograph/FEATURES.md`](cartograph/FEATURES.md) "Buildings on Stage stay live"). Resolution: keep, retire, or hybrid is a v1 punchlist decision (LS backlog L1.3).

---

## 7. `trees-atlas.json` + atlas PNGs

Per-look tree material atlas. Produced by `arborist/bake-trees.js` as part of the tree pipeline; consumed by `src/components/treeAtlasMaterial.js`.

```jsonc
{
  "generatedAt": "2026-05-03T21:23:16.967Z",
  "lookName": "lafayette-square",
  "rosterSize": 14,
  "materialDefaults": { … },
  "atlas":             { … },
  "tiles":             [ … 21 entries … ],
  "tilesByKey":        { … }
}
```

Atlas PNGs (`trees-atlas-{bark,leaves}-{color,normal}.png`) are referenced by the `atlas` field via filename. Tiles describe where each species' bark and leaves live in the atlas.

This artifact is per-look because LOOK styling can swap the *atlas* (different bark color, different leaf hue) without changing tree placements. See [`cartograph/FEATURES.md`](cartograph/FEATURES.md) "Arborist is the only tree-placement authority".

---

## 8. `default.json` — tree placements (cross-look)

Produced by `arborist/bake-trees.js`. **Look-independent placements** — the same trees stand at the same XZ across every look; only the atlas varies per look.

```jsonc
{
  "generatedAt": 1778618272484,
  "look": "default",
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

Consumer: `src/components/InstancedTrees.jsx` (production + Stage + Preview, same path).

---

## 9. Producer contract (what cartograph MUST guarantee)

1. **One bake = one consistent snapshot.** All artifacts under `public/baked/<look>/` must be coherent. A consumer reading `ground.json` and `scene.json` after the same bake MUST get matching layer colors / vis / palette. The `bake` button orchestrates this; manual invocation of one step must not leave the slab inconsistent.
2. **Stencil null is a real value, not "TODO".** When a scene has no soft-circle silhouette, the producer writes `"stencil": null`, not an empty object or a 0-radius circle. Consumers branch on null.
3. **`bin` paths are relative to the manifest.** Never absolute, never URL-style. The consumer resolves against the manifest's own URL.
4. **Compass frame, no exceptions.** No look or scene may inject a rotation constant into geometry. Cosmetic screen orientation is the consumer's `camera.up` concern.
5. **Version bumps are explicit.** Any binary layout change, group-kind addition, or required-field addition is a `version` bump. Older consumers MUST fail loudly, not render garbage.
6. **mtime-touch on no-op writes.** `writeIfChanged` MUST `utimesSync` even when the file content is byte-identical, so downstream dirty-checks don't cascade. See [`cartograph/FEATURES.md`](cartograph/FEATURES.md) and the `project_writeifchanged_touches_mtime` memory entry.

## 10. Consumer contract (what LS MUST guarantee)

1. **Treat the slab as immutable.** The runtime never writes under `public/baked/`. If you find yourself wanting to, the bug is upstream.
2. **Cache-bust with `?t=<bakeLastMs>`.** Use a unique-per-bake timestamp from your store, not the bake's *duration*. See [`cartograph/FEATURES.md`](cartograph/FEATURES.md) "Bake artifacts are browser-cached".
3. **Refuse unknown versions.** A `version` you don't recognize is a failed fetch, not a best-effort render.
4. **Branch on `stencil: null`.** Skip the radial-fade shader cleanly; don't synthesize a fake stencil.
5. **Don't infer schema beyond this doc.** If a field appears in a manifest that isn't listed here, ignore it. The producer is allowed to add forward-compatible fields without bumping `version`; the consumer must tolerate them.
6. **Route slab fetches through `import.meta.env.BASE_URL`.** Never hardcode root-absolute paths. The same consumer build deploys to root (`lafayette-square.com`) or any subpath (e.g., `jacobeugenehenderson.github.io/lafayette-square-staging/`) without code changes; the Vite `--base` flag at build time sets the value. Pattern: `` fetch(`${import.meta.env.BASE_URL}baked/${look}/ground.json?t=${t}`) ``. Anti-pattern: `` fetch(`/baked/${look}/ground.json?t=${t}`) `` (resolves to deploy-host root, not subpath). See memory `project_kit_deploy_path_agnostic`.

---

## 11. Pending boundary work (cross-listed in `ls/BACKLOG.md`)

- **L1.1** Production `Scene.jsx` mounts `BakedLamps` (consumes §5) instead of live `StreetLights`. Stage + Preview already do; production hasn't moved.
- **L1.2** `LafayettePark` park water + park paths are already in §2's ground groups; remove the parallel live imports from `LafayettePark.jsx`.
- **L1.3** Decide buildings strategy: keep live (per-id interactivity), bake (§6), or hybrid (slab mesh + per-id index).
- **Meteorologist clouds.** `public/clouds/{presets,almanac}.json` are *not* part of this slab contract — they're a separate publish-loop artifact. They exist on disk but have no runtime consumer today. Either wire `CloudDome` to consume them, or remove the artifacts. (Not slab; mentioned here only for completeness.)

---

## 12. Pointers

- [`cartograph/ARCHITECTURE.md`](cartograph/ARCHITECTURE.md) — producer architecture (bake chain, dirty-checks, Looks model)
- [`cartograph/FEATURES.md`](cartograph/FEATURES.md) — producer product orientation (Designer / Stage / Preview / bake)
- [`ls/ARCHITECTURE.md`](ls/ARCHITECTURE.md) §2 — consumer side of the slab boundary
- [`ls/reference/INVENTORY-DATA.md`](ls/reference/INVENTORY-DATA.md) §A — consumer mount status per artifact
- [`PUBLISH.md`](PUBLISH.md) — deploy, DNS, secrets (orthogonal to this contract)
