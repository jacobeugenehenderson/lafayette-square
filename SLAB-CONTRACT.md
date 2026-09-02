# Slab Contract

The boundary spec between **cartograph** (producer) and **LS** (consumer).

The slab is everything under `public/baked/`. Cartograph publishes; LS reads. Neither side imports the other's source code. Anything in this doc is the contract; anything outside it is implementation detail of one side or the other.

⭐ **`public/baked/` IS THE PRODUCER'S PATH, NOT THE CONSUMER'S ADDRESS (2026-09-01).** The bake still
writes there, and every path in this contract is still correct as a *layout*. But the tree is
**gitignored and served from `https://assets.theward.online/baked/<look>/…`** — 516 MiB against a 1 GB
GitHub Pages limit, growing 100–400 MB per town. The consumer resolves it through
`src/lib/bakedUrl.js` (`ASSET_BASE`), **never `BASE_URL`**, which is where the *site* is deployed.
⛔ **So the contract now spans two copies**, and "the producer wrote it" no longer implies "the consumer
can read it" — the upload is the step in between, and it can fail. ▶ `node scripts/verify-baked-in-r2.mjs`
proves the bucket matches disk. Mechanics: `PUBLISH.md §6`.

This doc is owned by neither app — it lives at the repo root next to `PUBLISH.md` because it's the *interface*. Drift between sides is not allowed without revising this file.

Last verified: 2026-05-26 (L1.3 shipped — `buildings.json` → **version 2** render-scoped index; §0/§1/§6/§11 updated; `SlabBuildings` is the Preview+production consumer; `BakedBuildings` deleted). Prior full pass: 2026-05-12 against `cartograph-looks-pass-ab @ b39834b`. Cross-refs: [`cartograph/ARCHITECTURE.md`](cartograph/ARCHITECTURE.md) (producer architecture), [`ls/ARCHITECTURE.md`](ls/ARCHITECTURE.md) §2 (consumer architecture), [`ls/reference/INVENTORY-DATA.md`](ls/reference/INVENTORY-DATA.md) §A (consumer mount status).

---

## 0. Scope and version

**Slab version:** every manifest carries a `"version"`. Most are `1`; **`buildings.json` is `2`** (the render-scoped per-building index + footprints/roofOutlines `.bin` sections, added 2026-05-26 — see §6). A consumer MUST refuse to render manifests with a version it doesn't recognize. A producer that changes the binary layout, group semantics, or coordinate frame MUST bump this number. (Forward-compatible *additive* fields — like `roofOutlines` within v2 — do not require a bump; see §10 rule 5.)

**Coordinate frame:** all slab geometry is in **compass-frame world meters**, origin at the neighborhood center, equirectangular GPS→meters projection. No rotation applied. Y is up; XZ is the ground plane. See [`cartograph/ARCHITECTURE.md` §7 "Coordinate systems"](cartograph/ARCHITECTURE.md) for the canonical statement (the compass-only rule + the 9.2° firebreak) and the historical reasons.

**Look ID:** each slab is identified by a `look` string (e.g., `lafayette-square`). The look ID determines the directory under `public/baked/<look>/`. The consumer chooses which look to mount via a prop or store; the producer never picks for the consumer.

**Scene vs. Look:** a *scene* is a dataset (the neighborhood — `lafayette-square`, `toy`, future others). A *Look* is a styling snapshot keyed by scene. The slab artifacts are scene-keyed, not look-keyed: `public/baked/lafayette-square/` is the LS scene; `public/baked/toy/` is the toy scene; per-Look variation today is folded into the single set of artifacts for each scene via the active design.json.

**The slab is one of three payloads.** This contract governs the **slab** — the baked *render* (`public/baked/<look>/`). The consumer app is a generic player that reads two more the slab does not carry: **content** (names / listings / menus / roster / profile — a per-installation layer read *alongside* the slab, loaded by `INSTANCE.lookId`; the render↔content line is the §6.3 "C2 boundary" below) and the **installation config** (`src/instances/<look>.js`, selected by `?look=` — identity / geography / branding / legal + the module manifest; `ls/ARCHITECTURE.md §2` + §6). A slab consumer trusts the slab blindly; content and config resolve on the reader side and never reach back into the bake.

---

## 1. Directory layout

```
public/baked/
├── <look>/                          ← per-scene/look artifacts
│   ├── ground.json                  ← geometry manifest (face + material groups)
│   ├── ground.bin                   ← binary positions + indices (sibling of ground.json)
│   ├── ground.lightmap.png          ← baked AO PNG (building AO; aoMap)
│   ├── ground.poolmap.png           ← baked ground FX map — R: lamp pool · G: contact shadow (2026-06-22)
│   ├── ground.colormap.png          ← baked ground-albedo raster (trunk-base blend, 2026-06-22)
│   ├── scene.json                   ← look-side palette, layer colors, vis flags, lamp glow + lantern, arch lighting
│   ├── lamps.json                   ← lamp point cloud + scene-relative metadata
│   ├── sources.json                 ← this town's data credits + licences, and what is still owed one
│   ├── buildings.json               ← geometry manifest (foundation + wall + roof groups)
│   ├── buildings.bin                ← binary positions + colors + UVs + centroidY + indices
│   ├── trees-atlas.json             ← per-look tree material atlas manifest
│   ├── trees-atlas-bark-color.png   ← bark color atlas
│   ├── trees-atlas-bark-normal.png  ← bark normals
│   ├── trees-atlas-leaves-color.png ← leaf color atlas
│   ├── trees-atlas-leaves-normal.png← leaf normals
│   ├── trees/                       ← UV-rewritten GLB tree variants for this look
│   │   └── <species>/skeleton-N-lod2.glb
│   └── trees.json                   ← this NEIGHBORHOOD's tree placements (its own census;
│                                       never shared, never inherited — see §8)
```

**Cache-busting:** consumers MUST request manifests with `?t=<bakeLastMs>` where `bakeLastMs` is a unique-per-bake timestamp from the consumer's store. `BakedGround`, `BakedLamps`, `InstancedTrees`, `treeAtlasMaterial`, `LafayettePark`, `StageArch`, `SlabBuildings` all follow this pattern today. Reusing a stale `bakeLastMs` causes browser HTTP cache to serve last-bake artifacts. See [`cartograph/ARCHITECTURE.md` §8 "Bake chain"](cartograph/ARCHITECTURE.md) for the cache-bust rule + the historical bug.

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
| `renderOrder` | Three.js render order. Pure integers, increasing = later draw. The bake assigns these by paint priority — and (since 2026-06-17) **also drives the geometry: each group's vertices are baked at `Y = renderOrder × GROUND_Y_EPS`** (~2 mm/slot), the actual coplanar-z resolver under the log-depth canvas. The runtime terrain lift is additive, so this micro-Y survives. `ARCHITECTURE §8`. |
| `polygonOffsetUnits` | Three.js `polygonOffsetUnits`. **Retained for back-compat / the mobile linear-depth path, but INERT under the log-depth canvases** (gl_FragDepth bypasses `GL_POLYGON_OFFSET_FILL`) — the consumer (`BakedGround.jsx`) no longer applies it. The per-group baked Y (see `renderOrder`) is the resolver. |
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

**Carries:** building AO (raycast) only. *(Contact shadows — tree + lamp bases — moved to the FX map's G channel, §3.1, because `aoMap` only dims **ambient** and so is near-invisible in daytime sun; the FX-map shadow darkens the ground albedo directly.)*

## 3.1. `ground.poolmap.png` — baked ground FX map (R: pool · G: contact shadow) (2026-06-22)

A two-channel "ground-contact" map produced by `bake-ground-ao.js`, sampled **once** at world-XZ by the grass + ground (`FadeMesh`) shaders. Meta in `ground.json#/poolmap` `{ image, size, min:[x,z], span:[w,h], scale }`; bbox = union of lamp + tree extents + margin (≈0.5 m/texel).
- **R — lamp light pool:** each lamp's pool profile (dark center → bright soft ring → 0) **summed** over lamps (overlaps build up), `× scale` then × the **lantern's output** (`StreetLights` writes `poolUniform = Lantern Brightness × the dusk→night ramp` — the pool *is* the lantern's light on the ground, so one control + off by day), tinted by the **lamp colour** (`scene.layerColors.lamp`, via the shared `lampGlow.colorUniform`). Drapes over terrain/curbs, no z-fighting (replaced the retired floating disc).
- **G — contact shadow:** soft dark rings at every **tree base + lamp base**, summed/clamped. The shaders **multiply** it into the diffuse directly (`× (1 − G·strength)`) so the ring reads in **daytime** (unlike `aoMap`). Constant strength — at night the dark ground + the additive pool naturally swallow it (no night-gate). Replaced the floating `baseMat` disc *and* the day-faint AO-lightmap rings.

`null` when a Look has no lamps **and** no trees.

## 3.2. `ground.colormap.png` — baked ground-albedo raster (2026-06-22)

Per-Look raster of the ground color (each ground group's triangles filled with its color, paint order). Meta in `ground.json#/colormap` `{ image, size, min, span }`. Sampled at world-XZ by the **tree trunk** shader (`treeAtlasMaterial`) so the lowest ~1.5 m of each trunk blends toward the ACTUAL ground beneath it. Published into the runtime via `BakedGround` → `groundColorState`; the Arborist Salon (no `BakedGround`) leaves it unset → trunk blend off.

---

## 4. `scene.json` — look-side styling carried into runtime

Per-look styling metadata. Consumed alongside `ground.json` (and `lamps.json`, `buildings.json`) to set live material colors, layer visibility, and the lamp glow palette.

```jsonc
{
  "version": 1,
  "look": "lafayette-square",
  "bakedAt":          1778644947675,
  "palette":          [ "#dcdcdc", "#a0522d", … ],
  "materialPhysics":  { … },
  "materialColors":   { … },
  "layerColors":      { "street": "#4A4A48", "curb": "#A8826A", … },
  "luColors":         { "residential": "#5A8A3A", "commercial": "#A87D3E", … },
  "layerVis":         { "street": true, "edgeline": false, … },
  "lampGlow":         { … },
  "neon":             { "values": { "core": 1, "tube": 1, "bleed": 1 } },
  "shotLooks":        { "browse": { "exposure": { … }, "bloom": { … } } }   // optional, sparse
}
```

`bakedAt` is the bake's completion timestamp (epoch ms) written by `cartograph/bake-scene.js`. Consumer-side: this is the canonical `?t=<bakedAt>` cache-bust seed for production fetches of slab artifacts, decoupling production from the in-memory `useCartographStore.bakeLastMs`. Authoring contexts may continue to use the store's value; both should agree by construction (store seeds itself from `Date.now()` on bake completion; the bake writes the same epoch into `scene.json`). Per couplers plan CC.7.

`neon` carries the per-Look neon-pipeline curve. Today: `{values: {core, tube, bleed}}` — three static 0-1 floats per the HANDOFF-neon Path B render model. The `NeonBands` shader's three Gaussian masks (`uCore`, `uTube`, `uBleed`) read these values once at mount. Future TOD-animated curves will replace `values` with a TOD-keyed structure parallel to `lampGlow`'s animated mode.

`shotLooks` (optional, **sparse**) carries **per-shot LOOK overrides** — the channel-variant cascade (`HANDOFF-channel-variant-cascade.md`). Keyed by shot (`browse` / `street`; Hero IS the base, i.e. the top-level channels), each value is a partial map `{ <channel>: <channel-def> }` of just the channels that shot overrides; every un-overridden channel inherits base. **Present only where a shot diverges → a Look with no per-shot looks omits the key entirely and is byte-identical to a pre-cascade slab** (no migration, no 3× bloat). Each `<channel-def>` is the SAME shape as the base channel (flat `{values:{…}}` or `{animated:'tod', values:{slot:…}}`). Resolution is a single channel-wise merge — `effectiveScene = {...base, ...shotLooks[shot]}` — done at ONE point per surface: production resolves off the camera `viewMode` inside the shared `useSceneJson` adapter (`src/lib/shotScene.js`), so every render consumer reads `scene.<channel>` unchanged. **Not overridable per shot:** shape/geometry (frozen), framing (shots/hero*/arch/horizon/browseHeading), and building material (`materialColors`/`materialPhysics`/`palette` — `SlabBuildings` fetches `scene.json` directly and bypasses `useSceneJson`, so they can't fork per shot until that read is firmed).

| Field | Meaning |
|---|---|
| `palette` | Building-palette colors (foundation + walls + roofs). |
| `materialPhysics` | Per-material PBR overrides (roughness, metalness, emissive intensity). Today: usually empty; cartograph plumbs through but rarely authors. |
| `materialColors` | Per-material color overrides outside of layer scope. |
| `layerColors` | Map of layer name → hex. The bake reads these to color `mat`-kind groups; they ALSO travel in `scene.json` so consumers can re-color outline strokes / wireframes live. |
| `luColors` | Map of land-use category → hex. |
| `layerVis` | Map of layer name → bool. Layers set false do not get baked into `ground.json` groups, so this is redundant on the slab side; it's surfaced for Designer-side inspection and reference. |
| `lampGlow` | Lamp emission / bloom parameters (color, intensity, attenuation). Consumed by `BakedLamps` and `StreetLights`. |
| `shotLooks` | *(optional, sparse)* Per-shot LOOK overrides — `{ browse?: {<channel>: <channel-def>}, street?: … }`. Resolved `{...base, ...shotLooks[shot]}` at the `useSceneJson` adapter off the camera shot. Absent = no per-shot looks (byte-identical to a pre-cascade slab). See the paragraph above + `HANDOFF-channel-variant-cascade.md`. |

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

Consumer: `src/components/BakedLamps.jsx` — Stage, Preview, *and* production (L1.1 shipped; production `Scene.jsx` mounts `<BakedLamps />`, mobile via `DeferredStreetLights`). The live `StreetLights` component is now toy-only.

---

## 6. `buildings.json` — building geometry manifest

The merged-mesh buildings slab. Same shape as `ground.json` but with per-vertex color + UV + centroid-Y attributes for shading, **plus a render-scoped per-building index** (`buildings`) and **footprints / roofOutlines `.bin` sections** so the runtime resolves per-building identity (click / hover / neon / selection) against the slab instead of `src/data/buildings`. **This manifest is `version: 2`.**

```jsonc
{
  "version": 2,
  "look": "lafayette-square",
  "bbox": { … },
  "bin": "buildings.bin",
  "positionFormat": "float32",
  "colorFormat": "float32",
  "uvFormat": "float32",
  "centroidYFormat": "float32",
  "indexFormat": "uint32",
  "footprintFormat": "float32",
  "componentsPerVertex": 3,
  "colorsPerVertex": 3,
  "uvsPerVertex": 2,
  "centroidYsPerVertex": 1,
  "footprintComponentsPerPoint": 2,
  "footprintByteOffset":    <byte>,   // start of the footprints section in .bin
  "footprintPointCount":    <n>,      // total [x,z] points across all buildings
  "roofOutlineByteOffset":  <byte>,   // start of the roofOutlines section (additive)
  "roofOutlinePointCount":  <n>,
  "buildingCount":          1082,     // source count (= buildings.length); drifts per survey
  "renderedBuildingCount":  1082,     // entries actually emitted (skips <3pt footprints)
  "buildings": [ … ],                 // the render-scoped per-building index; see §6.3
  "groups": [ … ]                     // material groups; see §6.1
}
```

The consumer is `src/components/SlabBuildings.jsx` — Preview *and* production (L1.3 cutover, 2026-05-26). It draws the ~9 group meshes and publishes the parsed index to `useSlabBuildingIndex`, which `SceneNeon` + selection read. It **refuses any version ≠ 2**.

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
| positions    (float32 × 3)  |  ← per-vertex, sliced by per-group byte offsets
| colors       (float32 × 3)  |
| uvs          (float32 × 2)  |
| centroidYs   (float32 × 1)  |
| indices      (uint32)       |  ← absolute into the position array
| footprints   (float32 × 2)  |  ← per-building [x,z] rings, concatenated (v2)
| roofOutlines (float32 × 2)  |  ← per-building rooftop-edge rings (v2, additive)
```

The four per-vertex attributes are sliced by per-group byte offsets, then indices follow. The `footprints` and `roofOutlines` sections are appended last (their starts are `footprintByteOffset` / `roofOutlineByteOffset`), so the per-group offsets are unaffected by their presence. Both index in **point units** (`× 8` bytes) via the per-building ranges in §6.3.

### 6.3. Per-building render index (`buildings`)

The render-scoped per-building index. One entry per *rendered* building (skips `<3`-point footprints), carrying only what the 3D render + neon + click-identity path needs — **not** the LS content record (name / address / architect / historic_status / sqft / style / lot_acres → those stay in the content layer; see the C2 boundary below). The numeric building id used by the consumer = the entry's position in this array (stamped per-vertex as `aBuildingId`).

```jsonc
{
  "id": "bldg-0019",
  "footprintRange":   [ptStart, ptCount],   // into the .bin footprints section (point units)
  "roofOutlineRange": [ptStart, ptCount],    // into the .bin roofOutlines section (point units)
  "centroidY": 15.21,                        // mean footprint-corner raw elevation (= neon groundYRaw)
  "baseY": 11.8,                             // rooftop world Y; = getFoundationHeight + size[1] + getRoofPeakHeight + 0.3
  "wallMaterial": "brick_red",
  "roofMaterial": "flat",
  "zoning": "F",                             // drives neon's default category for non-listing buildings
  "ranges": {                                // GROUP-LOCAL [startVert, count] into the building's group
    "wall":       [v0, n],
    "roof":       [v0, n],
    "foundation": [v0, n]                    // omitted when a building has no foundation geometry
  }
}
```

- **Range convention** is `[start, count]` (NOT `[start, end]`) everywhere — `ranges.*`, `footprintRange`, `roofOutlineRange`. `ranges.*` are **group-local** vertex indices; per-building ranges tile each group with no gaps/overlaps (asserted at bake).
- **`footprint`** is the building outline (world XZ). **`roofOutline`** is the actual rooftop-edge ring of the baked roof — `= footprint` for flat roofs, the inset cap ring for mansard, and a **degenerate 1–2 point** ridge/apex for hip (a hip has no closed top ring). Consumers of `roofOutline` MUST handle `ptCount < 3`. `roofOutline` is additive within v2 — nothing in the slab consumer reads it yet; the neon-roof-depth brief is its consumer.
- **`zoning`** is carried verbatim (including compound codes like `"BC"`, which fall to the residential default under the same `_NEON_ZONING_CATEGORY` lookup the runtime uses). Listing `hours`/`category` are NOT here — they live in the separate `useListings` content store.

**C2 boundary (why the index is render-scoped, not a full per-building record):** `buildings.json` (source) does two jobs — a *geometry/render* record (footprint, materials, zoning, anchors), which belongs in the slab, and a *content* record (name, address, architect, historic_status…), which is LS app content. The slab doctrine ("production trusts the slab, never reaches into source") is about the **3D render** trusting baked geometry/optics; it never required dissolving the content DB into the bake. So the render path resolves `raycast → id` against the slab, and the content layer resolves `id → record` via `buildingMap` / `useListings`. Relocating the content DB off `src/data/buildings` is a *separate future brief*, not part of L1.3.

### 6.4. Consumer status — RESOLVED (L1.3, 2026-05-26)

**Hybrid shipped.** `src/components/SlabBuildings.jsx` is the single buildings consumer for **Preview and production**: it draws the merged mesh (matching the live `Building`/`Foundations` material exactly) and resolves per-building identity against the §6.3 index. `SceneNeon` sources neon geometry/anchors from the index when it's published (production + Preview), falling back to live `src/data/buildings` where it isn't (Stage authoring). `src/preview/BakedBuildings.jsx` is **deleted**. **Stage keeps its live `LafayetteScene` mount** (authoring needs live retint via `paletteOverride`/`materialPhysicsOverride`), so the `import` of `src/data/buildings` remains in the shared `LafayetteScene`/`SceneNeon` files for that path + the content layer — production no longer *renders* live building geometry, which is the render-path gate. (L1.3 shipped 2026-05-26; brief landed → `_archive/handoffs/`.)

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

## 8. `<scene>/trees.json` — tree placements (per NEIGHBORHOOD, isolated)

Produced by `arborist/bake-trees.js` → `public/baked/<scene>/trees.json`. **One neighborhood's own census.** Where the trees stand and which species they are is a fact about the *place*, not about the Look — species do not change because the sky does. A Look decides how the trees are *lit* (its atlas, its hero tiering), never which trees exist.

> ⛔ **No neighborhood may ever read another's census.** Two hoods can be clone Groves — LS and HiPointe-DeMun share a species palette because they are the same city, drawn from the same St. Louis Forestry inventory — but they are **not connected, not the same census, and must never infect one another. If one disappears tomorrow, the other must not notice at all** (Jacob, 2026-07-15). There is no global placements file and no fallback: a scene with no census renders **no trees** (the Arborist ships it a blank grove), which is the honest answer. A fallback that quietly hands one hood another's trees is a bug that hides a bug.
>
> 🗄️ **Retired 2026-07-15 — `default.json`.** LS's placements used to ship as `public/baked/default.json`, and this section used to call them "cross-look." They never were. The file was LS's census named after `public/looks/index.json`'s opening `"default": "lafayette-square"` pointer — its mother map under a fossil name — and "cross-look" was that fossil rationalized after the fact. It was invisible only because every Look's `scene` equals its `id` today (history, not a constraint). The fossil is what let the Grove's Bake→Slab write to a phantom for months. Full trail: `HANDOFF-grove-neighborhood-axis.md`.

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

Consumers: `src/components/InstancedTrees.jsx` (production + Stage + Preview, same path) · `cartograph/bake-ground-ao.js` (tree contact shadows) · `cartograph/bake-tree-anchors.js` (the per-look ground anchor, index-parallel to `instances` — it MUST read this same file, or the two arrays desynchronize and the runtime discards every anchor).

**The two axes, so nobody re-conflates them:** `scene` picks the census (this file). `heroLook` picks whose camera tracks decide each placement's `heroTier` role — tracks are authored per Look. `bake-trees.js` takes both. They look interchangeable today only because scene ≡ look id; the day a second Look sits over one neighborhood (a winter LS), one census cannot carry two Looks' tiering and the role tag has to ride the Look axis on its own.

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
2. **Cache-bust with `?t=<bakeLastMs>`.** Use a unique-per-bake timestamp from your store, not the bake's *duration*. See [`cartograph/ARCHITECTURE.md` §8 "Bake chain"](cartograph/ARCHITECTURE.md) (cache-bust rule + historical bug).
3. **Refuse unknown versions.** A `version` you don't recognize is a failed fetch, not a best-effort render.
4. **Branch on `stencil: null`.** Skip the radial-fade shader cleanly; don't synthesize a fake stencil.
5. **Don't infer schema beyond this doc.** If a field appears in a manifest that isn't listed here, ignore it. The producer is allowed to add forward-compatible fields without bumping `version`; the consumer must tolerate them.
6. **Route slab fetches through `import.meta.env.BASE_URL`.** Never hardcode root-absolute paths. The same consumer build deploys to root (`lafayette-square.com`) or any subpath (e.g., `jacobeugenehenderson.github.io/lafayette-square-staging/`) without code changes; the Vite `--base` flag at build time sets the value. Pattern: `` fetch(`${import.meta.env.BASE_URL}baked/${look}/ground.json?t=${t}`) ``. Anti-pattern: `` fetch(`/baked/${look}/ground.json?t=${t}`) `` (resolves to deploy-host root, not subpath). See memory `project_kit_deploy_path_agnostic`.

---

## 11. Pending boundary work (cross-listed in `ls/BACKLOG.md`)

- ~~**L1.1** Production `Scene.jsx` mounts `BakedLamps` (consumes §5) instead of live `StreetLights`.~~ **SHIPPED** — production mounts `BakedLamps`.
- **L1.2** `LafayettePark` park water + park paths are already in §2's ground groups; remove the parallel live imports from `LafayettePark.jsx`.
- ~~**L1.3** Buildings strategy — hybrid (slab mesh + per-building index sidecar; version 2).~~ **SHIPPED** (2026-05-26, render-scoped) — `SlabBuildings` consumes the merged mesh + §6.3 index in Preview *and* production; `SceneNeon` + selection resolve identity against the slab; `BakedBuildings` deleted. The render path no longer renders live building geometry. Remaining (separate future brief, NOT L1.3): relocating the *content* DB (name/address/architect…) off `src/data/buildings` — the content importers (`SidePanel`, `GlassSearch`, `useListings`, `CheckinPage`, `PlaceCard`) intentionally still read it as source.
- **Meteorologist clouds.** `public/clouds/{presets,almanac}.json` are *not* part of this slab contract — they're a separate publish-loop artifact. They exist on disk but have no runtime consumer today. Either wire `CloudDome` to consume them, or remove the artifacts. (Not slab; mentioned here only for completeness.)

---

## 12. Pointers

- [`cartograph/ARCHITECTURE.md`](cartograph/ARCHITECTURE.md) — producer architecture (bake chain, dirty-checks, Looks model)
- [`cartograph/FEATURES.md`](cartograph/FEATURES.md) — producer product orientation (Designer / Stage / Preview / bake)
- [`ls/ARCHITECTURE.md`](ls/ARCHITECTURE.md) §2 — consumer side of the slab boundary
- [`ls/reference/INVENTORY-DATA.md`](ls/reference/INVENTORY-DATA.md) §A — consumer mount status per artifact
- [`PUBLISH.md`](PUBLISH.md) — deploy, DNS, secrets (orthogonal to this contract)
