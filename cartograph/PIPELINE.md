# Pipeline — the address map

**Status: v0.2 (2026-06-15) — the tile-model rewrite.** The execution-ordered map of how raw data becomes the slab. Every step has a stable **address** (`§P#`) so we can hang three things on it without re-deriving each time:

- **🔧 Optimize** — what we keep polishing here (the perf/quality checklist).
- **🩺 Troubleshoot** — where to look first when this step misbehaves.
- **🗣 Explain** — the plain-language sentence for pitching/teaching the product.

> Part of the **cartograph quintet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md` / `RIBBONS.md`). This doc is the **index**; the deep geometry prose lives in `RIBBONS.md` (the tile model) + `SKELETON.md` (the frame) + `SECTION.md` (the FILL), and the addresses below point into them. Ordered by **execution** — the order the bake actually runs, so an agent tracing a bug reads top-to-bottom.
>
> ⭐ **v0.2 (2026-06-15):** the ladder + §Tile now describe the **live TILE construction** (`src/lib/tileGround.js`). The retired **figure-ground** ladder (the old P4–P13: asphalt-rects → polygonize → round → ribbons) is archived with the rest of the figure-ground reference in [`_archive/RIBBONS-figureground-emitter-2026-06-15.md`](_archive/RIBBONS-figureground-emitter-2026-06-15.md).

---

## The ladder

```
PHASE A — FRAME & FORTIFICATION (the centerline graph + tabular truth)
  P1   Skeleton          osm.json → skeleton.json                   "streets exist here"        SKELETON.md
  P2   Fortification     Survey overlay → overlay.json              measures, caps, anchors, corner-R, parcels/LU
  P3   Promote           pipeline.js + promote-ribbons.js → ribbons.json {streets, intersections, faces}

PHASE B — SHAPE (the curb silhouette; LIVE in Survey, then FROZEN)   src/lib/tileGround.js
  P4   Tiles             extractFaces(streets) → block faces of the centerline graph              RIBBONS §3.2
  P5   Curb SHAPE        per-edge offset iA = chain ⊕ pavementHW (offsetRingVariable) + filletRing RIBBONS §3.3

  ═══════════════════════ THE DATA WALL — the Survey-exit freeze → shape.json ═══════════════════════
   Past here, chains are DEAD; Section is a pure consumer of the frozen per-tile SHAPE. See §Wall.

PHASE C — FILL (the ped cross-section, stroked INWARD off the frozen curb)   tileGround.sectionPass
  P6   Ped FILL          treelawn/sidewalk strips + bent corner + ADA pad + cap wraps; LU = remainder SECTION.md
  P7   Curb stroke       one continuous stroke per tile, wraps the silhouette incl. corners         RIBBONS §3.5
  P8   LU / median       per-tile land-use color; treelawn matches its LU; loop/divided median grass RIBBONS §3.5

PHASE D — PUBLISH (the slab)
  P9   Materials         BAND_TO_LAYER + per-Look design.json colors                                 m3Colors.js, Stage
  P10  Bake siblings     ground / ao / buildings / lamps / scene → public/baked/<id>/                BAKE.md
```

**WYSIWYG by construction:** P4–P8 run through **one module** (`buildTileGround` / `sectionPass`) for both the live 2D Survey render and the offline bake — live == bake.

---

## The stages, in order (READ THIS FIRST — the authoritative spine)

> ⭐ **This is the one place to learn what each pipeline stage is, whether it's working, and its doctrine — without hunting across files.** (Doctrine being diffuse is what kept causing mistakes.) §Wall + the P-ladder + `RIBBONS`/`SKELETON`/`SECTION` are the deeper detail this points into. Indexed from the repo-root README "Documentation map".

**Jacob's order:** `intake → skeleton → prebake → survey → ⟦WALL⟧ → section → bake → stage/preview/production`.

### intake — onboard a place  (`◎ Extent` tool → `ExtentApp.jsx`) — **THE INCLUSION POLYGON (2026-07-20)**
- **What / job:** author a place front-to-back with **no JSON hand-editing, no CLI**: ZIP → Locate → **frame** the hood on the global aerial → **Fetch this view** (frame-then-fetch: OSM + buildings + skeleton) → **author the inclusion POLYGON** (gazetteer ring · click boundary streets · draw) → exclusion loops + per-building overrides as *correction* (`BezierPen`) → **Bake** (Commit re-centers `geography.json` to the boundary centroid, writes `neighborhood_boundary.json` = circle + `exclusions`; then one-click Pour into the 3D Designer, §pour).
- **STATUS:** **LANDED** (on trunk `curb-offset-draw`; **not yet in prod** `origin/main`). Membership = **`(polygon ∪ activate) − (exclusions ∪ hide)`** (2026-07-20) — the polygon decides, the disc renders and is only the fallback when a scene has none. Installation-agnostic (kit); hipointe-demun and **altadena** were onboarded, poured and baked this way — **altadena is the first fully end-to-end intake→pour hood** (LS/HPDM predate the regime and carry bolt-on protections). **Never geocode for geometry** — search is the fetch bootstrap only.
- **Refs:** ⭐ **`EXTENT-DESIGN.md`** (design of record — what the tool makes, the size/centroid model, the seal) · **`INTAKE.md §0.5`** (the as-built flow + frame-then-fetch + the re-center guard) · `FEATURES.md` (pitch) · `OPERATIONS.md §Extent` (knobs) · BACKLOG "Onboarding/Intake".

### skeleton — the frame  (`skeleton.js`: `osm.json → skeleton.json`)
- **What / job:** trace the real street network from OSM into canonical chains (skelId-keyed) and produce an **extremely simplified, polygon-ready** frame. *"The Skeleton is The First Bake."*
- **⚠️ STATUS:** centerlines are **polygon-ready** (aggressive junction-protected RDP, `smooth=0`). The remaining debt is the **across-intersection organ** (doglegs + degenerate corners) — at the intersections, not the lines. ⛔ Do NOT conflate clean lines with clean corners.
- **Doctrine:** simpler output = healthier everything downstream. ⛔ junction-protected always (the junction-blind simplify deleted 79 interior Ts). Carry tags / grade-sep / divided-pair facts as frame truth.
- **Refs:** ⭐ **`SKELETON.md`** (the keystone home — schema, build stages, the across-intersection gap §5, the frame→render flow §3.5) · P1 below · §Wall · `OSM-FORENSICS.md`.

### prebake — the First Bake  (`pipeline.js` + `promote-ribbons.js` → `ribbons.json`)
- **What / job:** compile the skeleton (+ operator `overlay.json`) into **`ribbons.json {streets, intersections, faces}`** — the single geometry artifact downstream consumes (the live 2D render + the bake both read it). `derive.js` inserts an IX vertex at every intersection and freezes the tiles.
- **STATUS:** working, and now **scene-generic** — the whole prebake→bake arc runs for a fresh non-LS neighborhood (verified this session; hipointe-demun poured a full slab). ⭐ The 2D Survey/Design view renders **LIVE from `ribbons.json` via `buildTileGround`** — the *ground bake* is irrelevant to the 2D screen; only `ribbons.json` + `tileGround.js` matter there (the bake feeds 3D Stage/Preview).
- **⭐ The boundary clip = the Data-Wall neuter (`pipeline.js`, after `deriveLayers`, before `map.json`).** A **KIT** step: if the scene has `neighborhood_boundary.json`, prune everything outside the hood. Three cuts: (1) **Drop** features entirely outside the circle + street-fade margin (`keepR = streetFade.outer + 30 ≈ 1441 m`) — top-level layers **and** ribbons faces/tiles/medians/corridors/junctions/nameTransitions (inclusive `touches` test so edge refs survive). (2) **Building MEMBERSHIP = `(polygon ∪ activate) − (exclusions ∪ hide)` (2026-07-20).** The disc is only the FALLBACK when a scene has no polygon. Every building inside the circle is IN; the operator's flattened **exclusion loops** (`nb.exclusions`, lon/lat, re-projected into the re-centered frame) carve strays OUT via `pointInPolygon` (`pipeline.js:242-254`); then the per-building overrides layer on top (`activate` forces one IN, `hide` forces one OUT — `building-overrides.json`, **git-tracked** so the curation is reproducible source; §5.2 / `NEIGHBORHOOD-INPUTS §5.2`). Applied HERE so `map.json` is the **single filtered source** both the 2D Designer (which reads `map.json`) and the bake inherit. ⚠️ **A re-bake used to DROP the inclusion polygon** (`24323ab2`) — that behaviour is RETIRED (2026-07-20): `commit-extent` and `rescope` now accept and preserve one so membership is circle − exclusions, matching the Extent preview (else the slab clips to the stale ring and buildings vanish). (3) **Streets/alleys/paths are polyline-CLIPPED, not kept whole** (`clipRun`): trim each polyline to the circle, keep the longest inside run. **This is where an overshooting named arterial gets neutered** — South Big Bend ran **3882 m** across a **2502 m** hood (Forsyth 3677, Wydown 2905); kept whole they skewed the content bounds SE. Post-clip the ribbons street bbox is symmetric (center ≈ origin). ⚠️ The **3D ground mesh is stencil-bounded to a clean disc regardless** — the clip changes the *content/ribbons* bounds, not the ground mesh. *(Belt-and-suspenders: `bake-buildings.js:603-613` re-applies the same circle − exclusions + activate/hide membership on the already-filtered `map.json`.)*
- **Doctrine / gotchas:** **two-step** — run `skeleton.js` **then** `pipeline.js` (pipeline does NOT re-run the extractor), then `promote-ribbons.js`. `ribbons.json` is a bundled vite import — run the dev server from the worktree whose frame you want to view, or restart.
- **Refs:** **`PREBAKE.md`** · P3 below · §pour.

### pour — one-click intake→3D  (`POST /:scene/pour` → the Extent "Pour → Designer" button)
- **What / job:** collapse the whole prebake→bake arc into one operator click. `pipeline.js --skip-elevation` (boundary-clipped, above) → `promote-ribbons.js --scene=<s>` → ensure a Look bound to the scene (`createLook` now forwards `scene`) → `setActiveLook` → `bakeLook(force)` (ground/AO/buildings/lamps/scene) → load fresh ribbons → open the Designer. **The whole intake→3D arc is now ONE tool, no CLI.**
- **STATUS:** **LANDED + scene-generic.** Uses the scene's OSM buildings, OSM land-use, STL parcels if in STL. Guarded per-scene (`_seedsInFlight`). The pour applies **circle − exclusions + activate/hide membership** in `pipeline.js` (the single filtered `map.json` source for 2D Designer + bake; §prebake cut 2, `NEIGHBORHOOD-INPUTS §5.2`) and flushes the overrides before building. A committed hood's Bake routes through the light **rescope** path (re-clip + re-bake, no re-center — the re-center guard, `INTAKE §0.5`). ⚠️ The pour is **long** (derive processes the whole fetch *before* clipping — the bottleneck; clipping the INPUT for speed is OPEN); a too-wide fetch OOM'd the dev stack once — **frame tighter**. On trunk `curb-offset-draw`.
- **Refs:** `INTAKE.md §0.5` (the as-built flow) · `OPERATIONS.md §Extent` · `EXTENT-DESIGN.md` (the model).

### survey — the SHAPE tool  (`surveyor` pill → `SurveyorPanel.jsx`)
- **What / job:** author the **hardscape SHAPE** off the prebaked frame — asphalt/curb silhouette, smoothing, caps, anchor, road metadata, corner radius, hero-pick. Strokes chains outward into the curb `iA`; freezes at the WALL (chains die).
- **⛔ STATUS / scope:** **Survey = SHAPE ONLY. No ped depth in Survey** (treelawn/sidewalk = Section). The handles are SHAPE controls (asphalt-edge / curb / corner-R). A ped control leaking in is tool-conflation to remove.
- **Doctrine:** **SHAPE = Survey · FILL = Section.** Renders **live == bake** from `buildTileGround` (WYSIWYG). The SHAPE first appears here, LIVE off the skeleton (`SKELETON §3.5`).
- **Refs:** **`SURVEY.md`** · `SKELETON.md §4` (the authoring catalog) · `ARCHITECTURE.md §2.1` · `SECTION.md §7.1` (the SHAPE/FILL split) · P2 below.

### ⟦WALL⟧ — the freeze  (after Survey)
By the time the operator leaves Survey, hold an extremely-simplified, polygon-ready frozen dataset (`shape.json`, the per-tile `_shapeArtifact`) and **chains die here** — downstream (Section, bake) is a pure consumer; no geometry derived from chains past the Wall. First diagnostic on any head-scratcher: **"is this chains again?"** — and the fix is always *move the Wall earlier*, never patch chains deeper. **Deep-dive: §Wall (below).**

### section · bake · stage *(downstream)*
- **section** — the ped **FILL** off the frozen Survey shape (`sectionPass` / `sectionOpen`): treelawn/sidewalk, bent corner fills, ADA pads, cap wraps, strip materials, stroked INWARD off the frozen curb. **Built**; the FILL tail (perf/D6d, cap-wrap, thorns G12) + the Measure→Section rename remain. ⭐ **`SECTION.md`** (the FILL SSoT).
- **bake** — freezes the **slab** (ground/buildings/lamps/scene → `public/baked/<id>/`) = wall #2. `BAKE.md`.
- **stage** — the **LOOK** authoring tool; freezes `design.json` → `scene.json`. `STAGE.md`.
- **preview** — the slab inspection surface (GPU profiler · phone-aspect · layer cost). `PREVIEW.md`.
- **production** — the deployed LS runtime; trusts the slab cold. (LS app, downstream of this repo.)

---

## §Wall — the Data Wall (read this once)

The single most expensive truth in this codebase: **chains (the nodes that make up centerlines) are the recurring root problem.** Almost every "back to the drawing board" episode traces to a chain/node issue that would have been a one-step solve if the data were already a polygon.

The doctrine, in Jacob's words: **"The Skeleton is The First Bake."** By the time the operator leaves Survey, we should be holding an *extremely simplified, polygon-ready dataset* — and chains should be **dead**. The Data Wall *should* sit as early as the Survey-exit freeze.

**Where the wall is today.** The **topology** is frozen (the tiles, `extractFaces` output). The **curb** is the unfrozen half — it is re-stroked live from chains every frame by `buildTileGround` (`SKELETON §5f`). That live re-stroke is what still bows the curb at divided transitions and is the standing architectural debt: the curb is `chain ⊕ pavementHW` (a pure function of the skeleton), so it **belongs in the frozen body**. The fix direction is always *finish the First Bake (freeze the curb)* — never *patch the live construction deeper* (`HANDOFF-freeze-the-curb-in-the-first-bake.md`, `PREBAKE.md §4.1/§5`).

When a head-scratcher appears, the first question is: **"is this chains again?"** The fix direction is always *move the wall earlier*, never *patch chains deeper into the construction*.

Doctrine memory: `memory/project_skeleton_is_the_first_bake.md`.

### ⭐⭐ The wall we have is a HANDLE rule; it needs to be a CONTENT rule (2026-07-25, Jacob)

> **"An absolute datawall rule where we are *polygons only* by the time we get to the Section tools."**

`sectionOpen`'s signature is genuinely chain-free — artifact + design params, no handle on
streets/chains/ribbons — so a Section surface *physically cannot reach back*. That is enforced and it
holds. **But it only guarantees no consumer can reach the chain; it says nothing about whether the
artifact IS one.** And at a dead end, it is: the face freeze walks the spur **out and back over the same
vertices**, so the ring is the traversal. **ALL 50 LS dead-end tips are zero-width slits**
(`scratch/coupler-slit-universal.mjs`, ported to trunk 2026-07-30 — the old "46 of 49" mismeasured; see
`POLYGON-FIRST §2.1`); 40 only *look* right because the FILL-layer mouth-wrap snap
displaces `run.poly` off the ring by up to 13 m. Section then consumed a chain trace through a chain-free
API, and every dead-end mechanism — inverted `side`, the synthetic cap fe, the mouth disc — is a consumer
rebuilding the polygon that was never made.

⭐ **`detectTileCaps` is a SLIT DETECTOR wearing a cap detector's name.** Its criterion (*same chain, both
adjacent edges, opposite sides, at a chain endpoint* — `tileGround.js:738`) is exactly *"the ring doubled
back here."* `tile.caps` is a **registry of the places the freeze failed to close a polygon**, and we used
it for months as an identity source.

⇒ The rule is **content, checked at the freeze, failing the bake**: rings simple + nonzero area · no
same-chain/opposite-side vertex · every frontage edge has an interior on exactly one side · no real
feature described by a patch. Enforceable form + the "gate to make green" caveat (Checks 1–2 fail on all 50 tips; Check 5 on 9 of 50):
**`POLYGON-FIRST.md §2.1`**. Live task + the punch-out construction:
`_handoffs/HANDOFF-deadend-face-resolution.md`.

> **The frame is already correct; the consumers re-derive.** `skeleton.json` carries the marrow (329 typed junctions, name-transitions, seeds, divided pairs, grade flags). The degenerate polygons people chase are mostly **construction artifacts** — the tile corner-builder pairing the wrong legs at a divided transition (`SKELETON §5e`), a width-step datum at a through-node (`SKELETON §5g`), or a grade-separated crossing that should be excluded from the face graph (`gradeSeparated`, landed). Diagnose at the frame and the construction, not by hand-patching faces. (The intersection-everywhere / `osm2streets` sub-thread was retired 2026-06-13 — the *wrong task*; the centerlines are clean, only the drawing was wrong.)

---

## §Tile — the live construction model (novel; easy to forget)

> Two load-bearing, counter-intuitive facts. Both drift every time someone reaches for the intuitive construction. Hold them deliberately. (Full doctrine: `RIBBONS.md §1`.)

**1. The map is made of TILES — the block faces of the centerline graph.** `extractFaces(streets)` walks the planar graph of the centerlines' shared vertices; each enclosed face is a tile (a city block). The **centerlines are the grout**; each tile is painted **INWARD** from its own edges (asphalt → curb → treelawn → sidewalk → land-use). It is NOT drawn as pen-strokes along streets, and NOT figure-ground (blocks-as-positive, streets-subtracted) — that regime is dead.

**2. The CURB is a CONCENTRIC OFFSET, and the CORNER is the band BENT.** The curb `iA` is the centerline pushed outward by `pavementHW`, parallel everywhere (`offsetRingVariable`); the corner is rounded **once** by `filletRing`. The ped band then wraps inward at **mono-width** ("ribbon monowidth, strips variable"), and the corner is simply *where that continuous band curves* — a slice of the same offsets, not a separately-constructed primitive. ⚠️ If you ever find yourself constructing a corner shape, **stop** — you've reverted to the model the tile regime exists to kill (`RIBBONS.md §1` invariants).

**The derivation chain is the law:** centerline → polygon (tile/curb) → ribbon. The centerline is the ROOT; fix defects there and the curb + ribbon follow by construction (`RIBBONS.md §1`, `SKELETON.md §3.5`).

Doctrine memory: `memory/project_ribbon_corner_uniform_width.md`.

---

## The addresses

> Contours below are seeded — the living polish checklist; fill and sharpen over time.

### P1 · Skeleton
`osm.json → skeleton.json`. Canonical chains (skelId-keyed) from raw OSM. The First Bake.
- **🔧 Optimize:** the simpler this output, the healthier everything downstream — chain/node minimization (aggressive junction-protected RDP) is the lever that moves the Data Wall earlier. ⛔ junction-protected always.
- **🩺 Troubleshoot:** node-count blowups; OSM noise read as real bends; grade-separation (carry `gradeSeparated` so the face consumer excludes elevated/buried crossings); divided carriageways (longitudinal weld + station-overlap pairing; median emergent). `SKELETON.md §2/§3`.
- **🗣 Explain:** "We trace the real street network from OSM + aerial photos — provable truth, not invention."

### P2 · Fortification (Survey)
Operator hardens widths, caps, anchors, corner-R, parcels/land-use into `overlay.json` against max-res aerial. Designer = fortification, not authoring.
- **🔧 Optimize:** authoring ergonomics; keeping edits in a minimal skelId/segOrd-keyed shape (`feCustomKey`).
- **🩺 Troubleshoot:** customs identity across edits (keyed `(skelId, side, segOrd)`); a width drag fans across every `segOrd` the frontage owns (`SKELETON §5g`).
- **🗣 Explain:** "An operator measures every street's width and marks every cap against the photo — the map is fortified, not guessed."

### P3 · Promote
`pipeline.js` → `map.json`, then `promote-ribbons.js` → `ribbons.json` (`{streets, intersections, faces}`).
- **🔧 Optimize:** dirty-skip correctness (mtime touch via `io.js writeIfChanged`).
- **🩺 Troubleshoot:** the two-step gotcha — `skeleton.js` then `pipeline.js`; the pipeline does NOT run the extractor.
- **🗣 Explain:** "We compile the authored intent into a single geometry input the bake reads."

### P4 · Tiles (`extractFaces`, `tileGround.js:508`)
Builds the planar graph from shared vertices of `streets[].points` (excludes `gradeSeparated`), welds near-coincident endpoints (`ENDPOINT_SNAP`), walks the enclosed faces → tiles. Loop interiors emerge as median faces; the perimeter face is included so exterior streets get asphalt (G9).
- **🩺 Troubleshoot:** loop bodies that don't close (the endpoint-weld — `LOOP-STREETS.md`); grade-sep streets bowtie-ing the face walk if not excluded; dead-ends render woven (pruning deletes the tile-sourced road).
- **🗣 Explain:** "The blocks are the faces between the streets — the real thing the city is made of."

### P5 · Curb SHAPE (`offsetRingVariable` + `filletRing`)
Per tile, per edge: `iA = chain ⊕ pavementHW` (per-side, per-run via `runMeasure`); corners rounded once by `filletRing` (radius from the 3-tier corner-R kit). jtMiter throughout. Freezes at the Wall.
- **🔧 Optimize:** the robust-offset program (D6a); the curve-fit cleanliness (`STREET_SMOOTH`, ix-safe on a copy).
- **🩺 Troubleshoot:** the divided false corner (pair the corridor outer-edge legs, not carriageway stubs — `SKELETON §5e`); width-step doglegs at through-nodes (datum data — `SKELETON §5a/§5g`); the through-edge needle where a divided road T's into a through-road on a shared OSM node (straighten ONLY the kinked carriageway leg through the junction box via the `derive.js` prevailing-direction overlay / `strokePoints` — `SKELETON §5h`, LANDED); thorns when the inward offset folds (G12).
- **🗣 Explain:** "The curb is the street's centerline stepped outward a fixed distance, parallel everywhere — fix the line and the curb follows."

### ⟦WALL⟧ · Freeze → `shape.json`
Survey-exit writes the live smoothed per-tile `_shapeArtifact`. Chains die. Section reads this frozen shape. (§Wall.)

### P6 · Ped FILL (`sectionPass` / `sectionOpen`, `tileGround.js:801/1161`)
Strokes the ped cross-section INWARD off the frozen curb `iA`: treelawn (outer strip) + sidewalk (inner) + the bent corner fill + ADA pad + cap wraps; LU = the flooded remainder. Mono-width.
- **🔧 Optimize:** block-local rebuild on FILL override (don't recompute the silhouette — D6d); curves béziér-fine, flat-LU coarse (P3 footprint dial).
- **🩺 Troubleshoot:** thin-tile thorns (G12, the LOCAL capacity clamp); cap-wrap fat-pad/blunt (G8); SW↔SW corner residuals. **`SECTION.md` is the FILL SSoT.**
- **🗣 Explain:** "A ribbon of sidewalk and tree-lawn wraps every block at constant width, stroked inward from the curb."

### P7 · Curb stroke
One continuous stroke polygon per tile, wraps the whole silhouette incl. corners (G6), painted OVER the bands so the band-to-asphalt seam hides under it.
- **🩺 Troubleshoot:** curb material distinct from asphalt/sidewalk (M6); global editable width.
- **🗣 Explain:** "The curb is a single ribbon tracing the whole block edge, including every rounded corner."

### P8 · LU / median
Per-tile land-use color (M1); treelawn matches its tile's LU (M2); loop/divided interiors flood grass (`medianClipFor` / `isMedianTile`). `lu = blockLandUse[blockKey] || face.use || hash`.
- **🩺 Troubleshoot:** phantom park from `classify.js:60` (⭐ **`landuse=grass` mis-stamp — 25 of 29 `use='park'` faces are residential yards, measured 2026-07-30; NOT chiefly `leisure=garden`** — `RIBBONS §6.2`); per-block LU via blockKey, not centroid probe.
- **🗣 Explain:** "Every block is colored by what it's used for — and the tree-lawn picks up its block's color."

### P9 · Materials
`BAND_TO_LAYER` (`m3Colors.js`) maps every band/material to a layer; per-Look `design.json` colors seed each group; bake honors `layerVis`.
- **🩺 Troubleshoot:** verify the tile bake routes per-Look colors (not BAND_COLORS defaults, M5); Designer toggle ↔ bake group parity.
- **🗣 Explain:** "The operator paints the whole map's look — and saves named Looks — without changing a single shape."

### P10 · Bake siblings (the slab)
`bake-ground` + `-ao` + `-buildings` + `-lamps` + `-scene` → `public/baked/<id>/`. Deterministic, byte-reproducible, dirty-skipped.
- **🔧 Optimize:** dirty-skip / mtime discipline; the no-op 1ms bake; slab footprint dials (P1 row in the ledger — coarsen flat-LU `maxEdge`, keep curves fine).
- **🩺 Troubleshoot:** slab completeness — anything authored-but-not-baked is invisible to the deployed app.
- **🗣 Explain:** "We pour a flat, fast, fortified slab that the public app trusts unconditionally."

---

## §Campaign — the larger data effort

This doc is the first of a family of address-maps:
- **A.** PIPELINE.md doubles as a *polish checklist* — the 🔧 lines are the standing "always keep optimizing" list.
- **B.** Meteorologist and Arborist each get their own pipeline address-map, framed as sub-parts of Cartograph.
- **C.** Lafayette Square gets a *different* artifact — a **dependency index**, not an authoring pipeline (a consumer/runtime composition surface).

`RIBBONS.md` (tile model) + `SKELETON.md` (frame) + `SECTION.md` (FILL) are the Phase-B deep chapters the §P refs point into.

---

*Updated 2026-07-23 (canon sweep) — intake boundary authoring is the **INCLUSION POLYGON**: membership = `(polygon ∪ activate) − (exclusions ∪ hide)`, the polygon decides and the disc renders. ⛔ The 2026-07-16 line here reconciled this doc to the **excluder pen** ("circle − exclusion loops; the name-streets flow is dormant/dead code") — that model was RETRACTED 2026-07-20 and the street-selection machinery is the live mechanism, not dead weight. Design of record: `EXTENT-DESIGN.md`; as-built: `INTAKE.md §0.5`. Committed on `curb-offset-draw`, not yet in prod.*
*Updated 2026-06-15 — the tile-model rewrite (v0.2). The ladder + §Tile now describe the live `tileGround.js` construction; the figure-ground ladder is archived. Verify the addresses against `src/lib/tileGround.js` before building.*
