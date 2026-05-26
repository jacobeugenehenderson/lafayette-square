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

⏸ **AT THE A→B SEAM — awaiting Jacob's schema review before Phase B.**

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
