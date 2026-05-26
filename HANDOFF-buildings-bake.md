# Handoff — Hybrid Buildings Bake (slab mesh + per-building index)

> Dispatch-ready brief. Resolves LS punchlist **L1.3** in the *hybrid* direction:
> bake the merged building geometry for draw-call perf **plus a per-building index
> sidecar** so the runtime resolves identity (click / neon / place state) against the
> slab instead of rebuilding from `src/data/buildings.json` at runtime.

**You are the dispatched agent. Name yourself** — pick it independently, from your own
read of the work; the only constraints are that it be novel and NOT already used in this
project (check the claimed roster in `NOTES.md` / `BACKLOG.md` / commits before you choose).
No suggested themes — the name is yours. You own this end-to-end across the phases below. This is a *load-bearing, multi-file* migration
touching the producer, a new consumer, the neon path, and the production cutover — so
it is **strictly sub-phased**. Do **not** bundle producer geometry changes with the
consumer swap; that hides which layer broke what (the D.3 bundling lesson).

---

## Why this exists (prior context — don't re-derive)

A parity session (branch `cartograph-looks-pass-ab`) wired four authored channels into
production — `InstancedTrees`, `StageFog`, `LampGlowDriver`, and the hero camera now
consumes authored `heroKeyframes` via `heroKeyframeAnim` — and switched **Preview** from
the baked merged-mesh (`BakedBuildings`) to the **live `LafayetteScene`** so Preview
emulates what production actually ships.

Net effect: production renders buildings live from `src/data/buildings.json` at runtime,
and the baked `buildings.json` merged mesh now has **zero consumers** (`BakedBuildings`
was its last reader). That violates the slab doctrine ("production trusts the slab
unconditionally, never reaches into source") and leaves `bake-buildings.js` producing
dead output.

**The blocker that kept buildings live** (`SLAB-CONTRACT.md §6.3`, `ls/FEATURES.md:83`):
the merged mesh is sliced by *material group* (foundation / wall / roof), not by
building, so it throws away per-building identity — and the LS app is built on that
identity (click-to-select, neon open-by-hours, place state, place cards). A flat mesh
can't answer "which building did the user tap?"

## The shape of the fix

Bake the merged geometry for draw-call perf **plus a per-building index sidecar** so the
runtime resolves identity against the slab. Production *and* Preview then consume one
`SlabBuildings` consumer; nobody imports the buildings source at runtime.

---

## Phase 0 — Artifact inspection (mandatory first; geometry-brief rule)

Before writing levers, dump and read the real artifacts:

- `public/baked/lafayette-square/buildings.json` group structure + `.bin` section offsets.
- The `for (const b of buildings)` loop in `cartograph/bake-buildings.js` (~530): confirm
  exactly where each building's wall / foundation / roof verts append into the
  per-material buckets — that append site is where you record per-building
  `[startVert, vertCount]` per group. Manifest write ~731; `buildingCount` ~745.
- `src/components/LafayetteScene.jsx`: `Building` (~596) material (roughness 0.9 /
  metalness 0.05 / palette albedo / **night color shift** / textures / emissive-on-select),
  `Foundations` (~342), the exported `getFoundationHeight` / `getRoofPeakHeight`.
- `src/components/SceneNeon.jsx`: `useNeonLookup` + `openPlaces` (needs per-building
  `baseY`, `groundYRaw`, `category`).
- `src/preview/BakedBuildings.jsx`: the existing merged-mesh material — model the new
  consumer's *geometry loading* on it, but **match the live material**, not BakedBuildings'
  simplified vertex-color path.

Write a 10-line findings note in this brief's status before starting Phase A.
**Surface anything here that contradicts this brief.**

## Status — Plat (2026-05-26)

**Phase 0 findings (artifacts read; 2 contradictions flagged — holding before Phase A):**

1. **Artifacts:** `buildings.json` **v1**, 9 groups (foundation + 5 wall mats + 3 roof mats),
   1082 buildings, `.bin` = `[pos][col][uv][centroidY][idx]` 2.69 MB. Per-building append site
   is `bake-buildings.js:577-610`: each group's local range = `[bucket.vCount, +vAdded)`
   recorded **before** `bucket.vCount += vAdded`. Building → exactly one wall group (its
   `wall_material`), one roof group (its `roof_material`), one foundation group.
2. **Anchor math confirmed identical:** `baseY = periodPedestalFor + size[1] + getRoofPeakHeight + 0.3`;
   `centroidY` = mean-of-footprint-corner `getElevationRaw` = baked `aCentroidY` = neon's
   `groundYRaw` (one number, three names). `getRoofPeakHeight` is faithfully replicable in the
   bake — `classifyRoofFor`, `isConvex`, `len>8`/convex guards all already mirror the runtime —
   **must use raw `building.stories`** (not `||1`) in the 2.5/2.0/1.8/1.5 switch to match.
3. **Phase-B material parity gaps** (BakedBuildings vs live `Building`): night color shift
   (per-building `nightColor` lerp + `uDarkFactor*0.75` roof darken), `applyWeatherToShader`,
   dominant-axis wall triplanar (BakedBuildings only does the X·Y branch), metalness 0.05,
   roof `DoubleSide` — all MISSING in BakedBuildings. SlabBuildings must add them.
4. **⚠ CONTRADICTION 1 — footprint placement.** Brief schema shows `footprint` as JSON arrays
   (~106 KB across 1082 bldgs). That violates the kit `.bin`-for-bulk-numerics doctrine
   (`~5× inflation`). Footprint IS needed at runtime (neon tube outline, selection ring, search) —
   **recommend packing a `footprints` section into `buildings.bin`** + per-building `[ptStart,ptCount]`,
   not JSON floats.
5. **⚠ CONTRADICTION 2 — Phase E "bundle no longer contains the buildings module" needs the
   slim schema widened.** The buildings data module has **8 production importers**
   (`Controls`, `LafayetteScene`, `SceneNeon`, `SidePanel`, `GlassSearch`, `useListings`,
   `CheckinPage`, `CartographApp`), and `PlaceCard` reads rich metadata **absent from the brief's
   slim index** (`architecture`, `year_renovated`, `historic_status`, `building_sqft`, `style`,
   `architect`, `lot_acres`, `name`, `address`). The slim schema feeds render + neon + identity only;
   it cannot satisfy the Phase-E bundle gate. **Decision needed at this seam** (see below).

**Schema decision — RESOLVED (Boz, 2026-05-26). Both contradictions adjudicated:**

- **C1 — footprint → `.bin`. CONFIRMED.** Footprints are bulk runtime numerics → kit `.bin`
  pattern (`metadata.json` + `data.bin`, never JSON-text floats). Pack a `footprints` section
  into `buildings.bin` with per-building `footprintRange: [ptStart, ptCount]`. Do NOT emit
  footprint as JSON arrays.

- **C2 — index is RENDER-SCOPED, not a full per-building record. Phase E gate is being corrected
  (it was wrong, not the schema).** Rationale: `buildings.json` does **two unrelated jobs** under
  one import — (1) a *geometry/render* record (footprint, size, stories, materials, zoning,
  anchors) authored in cartograph → belongs in the slab; (2) a *content* record (name, address,
  architect, historic_status, sqft, style, lot_acres…) that is **LS app content, not a cartograph
  authored product** → stays in a content layer. Proof the boundary already exists: neon's
  `hours`/`category` live in a **separate** `useListings` store, never in the slab, and the
  per-building neon default derives from `zoning` (already in the render index). The slab doctrine
  ("production trusts the slab, never reaches into source") is about the **3D render** trusting
  baked *geometry/optics* — it never required dissolving the content DB into the geometry bake.
  A bake step that copies `historic_status` through unchanged isn't baking (no flatten/fortify/
  optimize); it just relocates content and couples listing edits to geometry re-bakes. And folding
  the 8-importer content migration into this render/consumer swap is exactly the **D.3 bundling
  anti-pattern** this brief's own header forbids.
  - **Click-to-place-card still works:** slab resolves `raycast → building id` (the identity it
    must carry); the content layer resolves `id → record` via `buildingMap`. Slab owns *spatial
    identity*; content owns *what to display*. No need to bake the record to open the card.
  - **If "LS imports nothing from `src/data`" is wanted**, that's a *separate future brief*
    (split `buildings.json` → geometry-source + a deploy-bundled content sidecar). Zero GPU
    benefit, different edit cadence, different domain — it does **not** gate or ride in this one.

---

## Status — Alidade (2026-05-26)

**Phase 0 re-verification (warm continuation; confirmed Plat's findings against live source, no new contradictions):**

1. **Append site (`bake-buildings.js:577-610`):** each material bucket → exactly one `emitGroup` call,
   so the `base = bucket.vCount` captured *before* `bucket.vCount += vAdded` is the **group-local**
   vertex start. That's the per-building, per-group range directly. Each building → 1 wall group
   (`wall_material`), 1 roof group (`roof_material`), 1 foundation group — foundation appended only
   `if (foundPositions.length)`, so a building's `foundation` range may legitimately be absent.
2. **`baseY` parity:** runtime neon uses `getFoundationHeight(b) + b.size[1] + getRoofPeakHeight(b) + 0.3`
   (`SceneNeon.jsx:124`). `getFoundationHeight` = `periodPedestalFor` = bake's `foundationHeightFor` (same
   import). `getRoofPeakHeight` (`LafayetteScene.jsx:324`) replicable in-bake: `classifyRoofFor`≡runtime
   `classifyRoof`, bake `isConvex`≡runtime `isConvex`, `getLocalPts` is translation-only (convexity +
   `length>8` invariant) → run against `b.footprint`. **Uses RAW `b.stories`** in the 2.5/2.0/1.8/1.5
   switch (NOT `||1`) — matched. `centroidY` already computed (`:573-575`) = neon `groundYRaw`.
3. **`zoning`** lives on each building record and is the only field needed for the neon zoning-default
   category (`_NEON_ZONING_CATEGORY`). Listing `hours`/`category` come from the separate `useListings`
   store — confirmed untouched-by-slab (C2 boundary holds).
4. **Footprint → `.bin` (C1):** packing a `footprints` section (Float32 [x,z] pairs, all buildings
   concatenated) + per-building `footprintRange: [ptStart, ptCount]`. Appending it AFTER `indices` so
   existing section offsets are undisturbed; indices stay absolute into the position array only.
5. **Count caveat:** `buildingCount` = `buildings.length` (source count, includes any `fp.length<3`
   skips which emit no geometry AND no index entry). The render-scoped `buildings[]` index length =
   *rendered* count. Real gate is the tiling check (ranges cover each group with no gaps/overlaps), which
   I assert in-bake. Will report both counts; if they differ, the skips are the reason (expected ~0).

Proceeding to Phase A (no Jacob check-in needed pre-A; the A→B seam is the schema-review gate).

**Phase A — COMPLETE & VERIFIED (commit lands this phase). As-built v2 schema:**

- Manifest gains: `version: 2`, `footprintFormat`, `footprintComponentsPerPoint: 2`,
  `footprintByteOffset` (section start), `footprintPointCount`, `renderedBuildingCount`,
  and `buildings: [ … ]` (the render-scoped index). `.bin` layout is now
  `[pos][col][uv][centroidY][indices][footprints]` — footprints appended LAST so every
  existing per-group offset is byte-for-byte unchanged.
- Per-building entry (as-built): `{ id, footprintRange: [ptStart, ptCount], centroidY,
  baseY, wallMaterial, roofMaterial, zoning, ranges: { wall:[start,count], roof:[start,count],
  foundation:[start,count]? } }`. **Convention note:** all ranges + footprintRange are
  `[start, count]` (NOT `[start, end]`) — chosen for consistency with `footprintRange`'s
  `[ptStart, ptCount]`. `ranges` are GROUP-LOCAL vertex indices (into the building's
  wall/roof/foundation group). `foundation` is omitted when a building has no foundation
  geometry. `zoning` is carried verbatim (compound codes like "BC" fall to the residential
  default under the same `_NEON_ZONING_CATEGORY` lookup the runtime uses).
- **Verification (all green):** tiling asserted in-bake (1082 buildings tile 9 groups, no
  gaps/overlaps, no non-emitted-group refs); bin size matches declared sections to the byte;
  footprint round-trip 1082/1082 vs source; `baseY` 0 mismatches vs an independent
  runtime-faithful `periodPedestalFor + size[1] + getRoofPeakHeight + 0.3` recompute (peaks
  fire: 47×2.0, 166×2.5 mansard; 110×1.8, 49×1.5 hip; 710 flat); re-bake byte-identical
  (idempotent). Counts: `buildingCount` 1082 == `renderedBuildingCount` 1082 (0 skipped).
- **Scope guard honored:** `SLAB-CONTRACT §0` version-refusal applies to the buildings
  consumer only; the tree path stays version-agnostic and was not touched.

✅ **A→B seam — schema reviewed & GREEN-LIT by Jacob (2026-05-26).** Proceeding to Phase B.

**Phase B — code-complete (commit lands this phase). Awaiting Jacob's visual A/B in Preview.**

- New shared consumer `src/components/SlabBuildings.jsx` + a shared identity store
  `src/hooks/useSlabBuildingIndex.js` (the seam Phases C/D read instead of `src/data/buildings`).
- **Refuses `version !== 2`** (SLAB-CONTRACT §0/§10.3).
- **Material parity port (vs the live `Building`/`Foundations`, not BakedBuildings):**
  albedo from baked per-vertex color **sRGB→linear** (matches `new THREE.Color(hex)` under
  ColorManagement; the flat-roof `[0.04,0.04,0.045]` constant stays raw-linear); walls+roofs
  **0.9/0.05**, foundation **0.95/0** (live roof is a Y-branch of the building material, NOT
  the slab's per-group slate/metal PBR — that was BakedBuildings divergence); night: walls
  lerp to an exact HSL-shifted `aNightColor` attribute, roofs ×(1−darkFactor·0.75), foundation
  lerp tan→#3d3530; desktop dominant-axis triplanar wall texture + roof texture overlay,
  mobile untextured; `applyWeatherToShader` on walls+roofs (NOT foundation, matching live);
  terrain lift via baked `aCentroidY × uExag`; texture UV anchored to UN-lifted world pos
  (matches live so textures don't swim with exag).
- **Identity:** per-vertex `aBuildingId` stamped from the index ranges (numeric id = position
  in `manifest.buildings`); in-shader selection/hover emissive via `uSelectedId`/`uHoveredId`
  (0x333 selected / 0x222 hover, selected wins); raycast→id via the `aBuildingId` attribute at
  the hit face. (SelectionRing + place card stay for Phase D.)
- **Preview A/B:** new layer toggle **“Buildings → Slab (A/B)”** (default off). On → live
  buildings+foundations hidden, `SlabBuildings` renders them off the slab beside the live mount.
- **Verified:** full module graph transforms clean (`vite build` reaches asset-copy; only a
  pre-existing broken `public/photos/.../other` symlink stops it — unrelated). GLSL chunk
  strings audited against three 0.160. **Runtime GLSL-compile + visual parity + draw-call drop
  → Jacob's eyeball in Preview (checklist in handoff message).**
- **Stage-convergence decision (Phase-B finding):** the consumer reads `scene.materialPhysics`
  and gates on `scene.layerVis.building`, but does NOT yet take live `paletteOverride`/
  `materialPhysicsOverride` props the way `LafayetteScene` does for Stage retint. So Stage
  should **keep its live `LafayetteScene` mount** for now (authoring needs instant retint);
  converging Stage onto `SlabBuildings` would require threading the override props through —
  out of scope for this brief. Recommend Stage stays live; Preview+production move to slab.

**Phase B — visual A/B CONFIRMED by Jacob (2026-05-26): "looks good."**

**Phase C — neon off the index (code-complete; commit lands this phase).**

- `SceneNeon.openPlaces` now branches: when `useSlabBuildingIndex` has a published index
  (Preview-slab-on / production-after-cutover), it sources each open place's
  `footprint` / `baseY` / `groundYRaw(=centroidY)` / zoning-default `category` from the
  **slab index**; otherwise it uses the unchanged live `_allBuildings` path. Gated by index
  presence, so Stage + Preview-slab-off stay live until cutover.
- **`useListings` untouched** — listing `hours`/`category` still come from the content store
  (`neonLookup`); the index only replaces the building geometry/anchor/zoning side. The
  zoning-default category uses the same `_NEON_ZONING_CATEGORY` lookup as the live path.
- `NeonBands.buildTube` reads only `footprint`/`baseY`/`groundYRaw`/`neon.category` — all in
  the index, with `baseY`/`groundYRaw` baked by the SAME anchor math, so tubes lift in lockstep.
- `SlabBuildings` clears the index store on unmount → Preview A/B off reverts neon to live too.
- **Verify (Jacob):** Preview slab A/B on vs off at a dark TOD (neon forced on in Preview) —
  tube positions / categories / colors should be identical, and the listing-lit vs
  zoning-default split unchanged. Transform graph clean.

**Phase D — selection / click / place cards (code-complete; commit lands this phase).**

Findings shrank this phase to one real change:
- **Selection + place card already work in slab mode** via Phase B's `select(id)`/`setHovered(id)`
  raycast wiring. `PlaceCard` (`Controls.jsx:54`) is a store-driven 2D overlay that resolves
  `selectedId → record` through the content layer (`getByBuildingId` / `useListings`) — exactly
  the C2 split (slab = spatial identity; content = what to display). No re-plumb needed; the
  card opens with correct content once the id is selected. Hover highlight is the Phase-B
  in-shader emissive. (Card UI itself isn't mounted in the Preview harness — that flow verifies
  in the real app post-cutover; the wiring is environment-agnostic.)
- **Added `SlabSelectionRing`** — the only 3D selection visual the live path mounted per
  `<Building>` (hidden in slab mode). Rebuilt from the index footprint (world coords, expanded
  0.15m, #ff6644 additive pulse, radius 0.045), ring Y = `baseY − 0.15` (≡ live for flat roofs,
  within a roof-peak for shaped). Like the live ring it does not terrain-lift (A/B parity).
- **⚠ SCOPE-DRIFT FLAG (sim-open neon):** the brief's verify line "sim-open neon toggles per
  building" is **stale**. `usePlaceState.openBuildings` is read only by `LafayetteScene:620`'s
  `isSimOpen`, which fed the **pre-Path-B per-Building neon** — the merged `SceneNeon`/`NeonBands`
  gates purely on listing hours / `forceNeonOn`, NOT on `openBuildings`. So sim-open drives no
  rendered neon **today, in the live path too**. I did NOT resurrect it (adding it to the slab
  neon would diverge from the live mount = non-parity scope creep). If "randomize open places →
  neon" is wanted as a feature, it's a **separate brief** (wire `openBuildings` into `openPlaces`
  in BOTH paths). Surfacing per the scope-drift discipline; no action taken.
- **Verify (Jacob):** Preview slab A/B on — click a building → emissive highlight + ring appear
  on the correct building; hover highlights; ring hugs the roofline. Transform graph clean.

## Phase A — Producer: emit the per-building index (no consumer change)

In `bake-buildings.js`, while accumulating each building into the material buckets, record
a per-building entry. **The index is RENDER-SCOPED** (see C2 resolution above): it carries
only what the 3D render + neon + click-identity path needs — NOT the LS content record
(name/address/architect/historic_status/sqft/style/lot_acres → those stay in the content
layer). Extend the manifest (bump `SLAB-CONTRACT.md §0` version → 2; consumers must refuse
unknown versions):

```jsonc
// buildings.bin gains a `footprints` section: Float32 [x,z] pairs, all buildings
// concatenated. Per-building `footprintRange: [ptStart, ptCount]` indexes into it.
// Do NOT emit footprint as JSON float arrays (C1).
"buildings": [
  { "id": "...", "footprintRange": [ptStart, ptCount], "centroidY": <m>, "baseY": <rooftop m>,
    "wallMaterial": "brick_red", "roofMaterial": "...", "zoning": "A",
    "ranges": { "wall": [v0,vN], "foundation": [v0,vN], "roof": [v0,vN] } }
]
```

Carry `zoning` (drives neon's default category for non-listing buildings) but NOT listing
fields — `hours`/`category` come from the separate `useListings` store, untouched here.

`baseY` / `centroidY` MUST be computed by the **same** anchor math the runtime uses
(`getFoundationHeight + size[1] + getRoofPeakHeight + 0.3`; mean-of-footprint-corner raw
elevation) so neon / foundations lift in lockstep on sloped terrain.

- **Fixes:** slab now carries building identity.
- **Doesn't fix:** nothing renders differently yet.
- **Verify:** index length == manifest `buildingCount` (== `buildings.length`, ~1082 today
  — don't hardcode, it drifts per survey); the real gate is that the per-group ranges **tile
  the `.bin` with no gaps/overlaps**; `--clean` re-bake idempotent (regen everything it deletes).
- **Scope guard (don't over-apply the version rule):** the "refuse unknown versions" rule is
  for the **buildings** manifest/consumer only. The tree path (`InstancedTrees`,
  `trees-atlas.json`) is deliberately version-agnostic (no version field) — the slab→v2 bump
  is safe for trees *because* nothing version-checks them. Do **not** retrofit version-refusal
  onto the tree path while touching `SLAB-CONTRACT.md`.

## Phase B — Consumer `SlabBuildings.jsx` (Preview-only, behind a flag)

New shared consumer: loads `buildings.json` + `.bin`, draws the merged mesh, builds an
in-memory `id → {footprint, centroidY, baseY, …}` map from the index.

- **Match the live material exactly** — this is the "buildings accept light differently"
  issue flagged in the parity session: palette albedo, roughness 0.9, metalness 0.05,
  night color shift, textures — NOT BakedBuildings' simplified vertex-color path.
- Add a per-vertex `aBuildingId` attribute + `uSelectedId` / `uHoveredId` uniforms so
  selection / hover highlight in-shader on the merged mesh (you can't set per-building
  emissive on one shared material).
- Raycast → resolve hit to a building id via the index.
- Mount in **Preview only**, behind a toggle, beside the live mount for A/B comparison.

- **Fixes:** Preview can inspect slab buildings + their real perf.
- **Doesn't fix:** production, neon, place state.
- **Verify** in Cartograph Stage LS at Browse / Hero / Street (Toy + Preview-close camera
  hide sub-pixel coverage + z-fight per doctrine); confirm draw-call drop in the GPU panel.

## Phase C — Neon off the index

Repoint `SceneNeon`'s `openPlaces` candidate list + tube geometry (`baseY` / `groundYRaw` /
footprint / `zoning`-derived default category) to the slab index instead of live
`_allBuildings`, gated so the live path still works until cutover. **Leave `useListings`
alone** — authored `hours`/`category` still come from the listings store (it's content, not
slab); the index only replaces the *building geometry/anchor/zoning* side of `openPlaces`.

- **Fixes:** neon geometry renders off the slab; listing colors/hours stay content-sourced.
- **Verify:** neon parity at night TOD against the live mount (tube positions lift in
  lockstep, same categories/colors, listing-lit vs zoning-default split unchanged).

## Phase D — Place state / selection / click / place cards

Re-plumb `useSelectedBuilding`, hover, `usePlaceState`, and the place-card mount to resolve
*spatial selection* against the index map (raycast → id) rather than per-`Building` React
props. **The place card's content lookup stays as-is** — once you have the id, `PlaceCard`
reads its record from the content layer (`buildingMap` / `useListings`), exactly as today.
The slab provides identity; the content layer provides what to display.

- **Fixes:** full interactivity on the merged mesh.
- **Verify:** click selects the right building; ring / highlight correct; place card opens
  with correct content; sim-open neon toggles per building.

## Phase E — Production cutover

Swap production `src/components/Scene.jsx` `LafayetteScene` → `SlabBuildings`; **remove the
`src/data/buildings` import from the 3D-render path** (`LafayetteScene`/`SlabBuildings`,
`SceneNeon`, `Controls`-if-geometry). Point Preview at `SlabBuildings` too (drop the Phase-B
flag).

**Gate scope (corrected — see C2):** the gate is the **render path**, NOT the whole bundle.
The content importers (`SidePanel`, `GlassSearch`, `useListings`, `CheckinPage`, `PlaceCard`)
legitimately keep importing the content record — that's the LS app reading its own content DB,
which the slab-render doctrine never prohibited. Do NOT chase them out of the bundle here.

- **Fixes:** the 3D render trusts the slab for building geometry/anchors/materials/identity;
  Stage > Preview > Production *render* parity complete.
- **Verify:** all three render identically; confirm the **3D-scene render path** no longer
  imports building geometry from `src/data/buildings` (grep the render-tree modules) — NOT
  that the whole `dist/` bundle dropped the module (it won't, and shouldn't, until the separate
  content-relocation brief).

## Phase F — Retire + docs

Delete `src/preview/BakedBuildings.jsx`. Update `SLAB-CONTRACT.md §6` (new schema + version
2, mark L1.3 resolved as **render-scoped**), `ls/FEATURES.md:83`, and `cartograph/FEATURES.md`
render-environments table (Preview / production now both slab-buildings). **Don't** delete
`src/data/buildings.json` — Designer / bake still read it as the geometry *source*, AND the
content importers still read it as the content DB. Only the *render-path* runtime dependency
is removed; document that the content layer is intentionally still source-backed (the separate
relocation brief, if pursued, handles that).

## Addendum — emit `roofOutline` into the index (Boz/Jacob, 2026-05-26)

A neon-fidelity bug surfaced at the C/D review: the neon tube traces the **building footprint**
at roof height, so on inset roofs (mansard/hip) it hangs out past the actual roof edge. Fix needs
the rooftop perimeter polygon. Per operator call (2026-05-26), **emit it now** while you're in the
schema (avoids a later slab bump).

- **`roofOutline` per building** = the rooftop perimeter the tube should sit on — **= footprint for
  flat roofs, the inset top edge for mansard/hip** — derived from the **same roof geometry the bake
  already builds** (`classifyRoofFor` + the roof vert construction you replicated for `baseY`). Don't
  re-derive an inset heuristic; take the actual top-edge ring of the baked roof.
- **Pack into `.bin` per C1** (bulk numerics, never JSON floats): a `roofOutlineRange: [ptStart,
  ptCount]` per building, into its own `.bin` section (or extend the footprints section). Mirror the
  `footprintRange` convention.
- **Additive, optional field → stays within slab v2** (no v3 bump — that's the whole point of doing
  it now). Nothing consumes it yet, so old v2 readers tolerate it.
- **Discrete producer commit**, separate from the `Scene.jsx` cutover (D.3). Land before or after
  the cutover, your call — it doesn't change cutover behavior.
- **The neon does NOT get rewired here.** Tracing `roofOutline` (and the depth-culling fix) is a
  separate neon brief (`HANDOFF-neon-roof-depth.md`) that consumes what you emit. You're the
  producer; the neon brief is the consumer.

**Addendum — DONE (Alidade, 2026-05-26; discrete producer commit, lands separately from the cutover).**

- Roof builders (`buildMansardRoofWorld`/`buildHipRoofWorld`) now return their internal
  `topRing`; `buildingGeometry` returns `roofTopRing` from whichever branch built the roof —
  so `roofOutline` is the **actual baked top edge**, not a re-derived inset. Rule: **flat →
  footprint**, **mansard → the inset-0.30 cap ring** (n pts), **hip → ridge endpoints `[r0,r1]`
  or pyramid apex `[cx,cz]`**.
- Packed into a new **`roofOutlines` `.bin` section** (Float32 [x,z], after `footprints`, so all
  prior offsets are byte-unchanged) + per-building `roofOutlineRange: [ptStart, ptCount]`.
  Manifest gains `roofOutlineByteOffset` + `roofOutlinePointCount`. **Additive → stays slab v2**
  (no v3 bump). Nothing consumes it yet.
- **⚠ Note for the neon-roof-depth consumer:** **hip roofOutlines are degenerate** — 1 pt
  (pyramid apex) or 2 pts (ridge) — because a hip roof has no closed top ring. 159 hips are
  1–2 pt; the consumer must handle `ptCount < 3` (e.g. trace the eave/`footprint` instead, or
  render a peak accent). flat (710) = full footprint; mansard (213) = n-pt inset ring.
- **Verified:** bin size byte-exact; footprint section intact; flat outline==footprint 710/710;
  mansard 213 inset rings (all toward centroid); hip 159 degenerate (0 malformed);
  710+213+159=1082; re-bake byte-identical.

**Phase E — production cutover (CLEARED by Jacob 2026-05-26; Scene.jsx surfaced to Boz, land-first
confirmed; commit lands this phase).**

- `src/components/Scene.jsx:714`: `<LafayetteScene />` → `<LafayetteScene hiddenLayers={{ building: true }} />`
  (keeps neon / street labels / landmark markers / click-catcher; hides live Building+Foundations)
  + new `<SlabBuildings lookId={INSTANCE.lookId} />` sibling. `SceneNeon` auto-switches to the slab
  index (SlabBuildings publishes it). Production buildings now come from the slab.
- **Preview pointed at the slab by default** (`DEFAULT_LAYERS.slabBuildings: true`, `LAYERS_KEY`→v2
  so the new default takes), toggle kept as an A/B inspection affordance per Jacob.
- **Stage stays live — verified:** `CartographApp` does NOT mount `SlabBuildings`, so the
  `useSlabBuildingIndex` store stays null there and `SceneNeon` falls back to live `_allBuildings`
  (Stage neon doesn't go dark; authoring retint intact).
- **Render-path gate (per C2 correction):** production no longer *renders* live building geometry
  (Building/Foundations hidden; SceneNeon off the index). The `import { buildings }` STRING remains
  in `LafayetteScene.jsx` + `SceneNeon.jsx` purely for the Stage authoring path + the content layer —
  it cannot be deleted without forking those files for Stage vs production (which would violate
  `project_stage_consumer_parity`). Jacob confirmed this reading at the pre-E check-in: the gate is
  render *behavior*, not bundle contents.
- **Verified:** transform graph clean; SlabBuildings mounts only in Preview + production Scene.
  **Production visual confirmation → Jacob (index.html): buildings render off the slab; neon at
  night; click/select/card; draw-call drop.**

---

## Explicitly out of scope

LOD / instancing for buildings; per-building frustum culling beyond what the index trivially
enables; any change to Designer building fortification. **The content-DB relocation is
explicitly out of scope** — do NOT widen the index into a full per-building content record,
do NOT migrate `SidePanel` / `GlassSearch` / `useListings` / `CheckinPage` / `PlaceCard` off
source, do NOT try to empty the buildings module from `dist/`. That's a separate future brief
(geometry-source + deploy-bundled content sidecar); folding it in here is the D.3 bundling
anti-pattern. **Stage keeps its live
`LafayetteScene` mount** (authoring needs live retint — only production / Preview move to the
slab consumer) UNLESS your Phase-B findings show the shared-consumer + `override ?? scene.<x>`
pattern is clean enough to converge Stage too — surface that as a decision, don't assume it.

## Commit boundaries

One commit per phase, each independently revertible. Canonical off-limits unless the phase
owns them: `RIBBONS.md`, ground / terrain bake. Check in with Jacob at the **Phase A→B seam**
(schema review) and **before Phase E** (the production cutover is the irreversible-feeling
one). **Aesthetics + perf are co-equal** (49/51 doctrine): the merged mesh must look
identical to the live buildings — no flatter lighting — not just measure faster.

**⚠️ Concurrent-arc convergence (`SLAB-CONTRACT.md` + `Scene.jsx`).** A second arc is in flight
in parallel — the hero-tree visibility-LOD (`HANDOFF-tree-hero-lod.md`, agent Azimuth). The two
arcs are on disjoint files **except** `SLAB-CONTRACT.md` (you bump it to v2; trees adds a
`heroTier` field) and `src/components/Scene.jsx` (your Phase E swaps `LafayetteScene`→`SlabBuildings`;
trees' Phase E wires the tier render). **This arc is further along and lands FIRST on both files.**
Do NOT defer your `SLAB-CONTRACT` v2 bump or `Scene.jsx` cutover for the tree arc — proceed
normally. But **surface to Boz before touching either file** so the sequencing is confirmed; the
tree arc rebases on top of your v2 contract, not the reverse.
