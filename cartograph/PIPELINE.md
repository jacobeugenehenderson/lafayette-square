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

**Jacob's order:** `intake → skeleton → prebake → survey → ⟦WALL⟧ → section → bake → stage/preview/production`. *(Formal intake is skipped for now; we are currently STUCK on **skeleton** + **survey**.)*

### intake — onboard a place *(skipped for now)*
Author a place: center+radius circle → fetch OSM → freeze the protoslab container. Deferred; LS already has its `osm.json`. Refs: BACKLOG "Onboarding/Intake", `INTAKE.md`.

### skeleton — the frame  (`skeleton.js`: `osm.json → skeleton.json`)
- **What / job:** trace the real street network from OSM into canonical chains (skelId-keyed) and produce an **extremely simplified, polygon-ready** frame. *"The Skeleton is The First Bake."*
- **⚠️ STATUS:** centerlines are **polygon-ready** (aggressive junction-protected RDP, `smooth=0`). The remaining debt is the **across-intersection organ** (doglegs + degenerate corners) — at the intersections, not the lines. ⛔ Do NOT conflate clean lines with clean corners.
- **Doctrine:** simpler output = healthier everything downstream. ⛔ junction-protected always (the junction-blind simplify deleted 79 interior Ts). Carry tags / grade-sep / divided-pair facts as frame truth.
- **Refs:** ⭐ **`SKELETON.md`** (the keystone home — schema, build stages, the across-intersection gap §5, the frame→render flow §3.5) · P1 below · §Wall · `OSM-FORENSICS.md`.

### prebake — the First Bake  (`pipeline.js` + `promote-ribbons.js` → `ribbons.json`)
- **What / job:** compile the skeleton (+ operator `overlay.json`) into **`ribbons.json {streets, intersections, faces}`** — the single geometry artifact downstream consumes (the live 2D render + the bake both read it). `derive.js` inserts an IX vertex at every intersection and freezes the tiles.
- **STATUS:** working. ⭐ The 2D Survey/Design view renders **LIVE from `ribbons.json` via `buildTileGround`** — the *ground bake* is irrelevant to the 2D screen; only `ribbons.json` + `tileGround.js` matter there (the bake feeds 3D Stage/Preview).
- **Doctrine / gotchas:** **two-step** — run `skeleton.js` **then** `pipeline.js` (pipeline does NOT re-run the extractor), then `promote-ribbons.js`. `ribbons.json` is a bundled vite import — run the dev server from the worktree whose frame you want to view, or restart.
- **Refs:** **`PREBAKE.md`** · P3 below.

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
- **🩺 Troubleshoot:** the divided false corner (pair the corridor outer-edge legs, not carriageway stubs — `SKELETON §5e`); width-step doglegs at through-nodes (datum data — `SKELETON §5a/§5g`); thorns when the inward offset folds (G12).
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
- **🩺 Troubleshoot:** phantom park from `classify.js:60` (`leisure=garden` mis-stamp — `RIBBONS §6.2`); per-block LU via blockKey, not centroid probe.
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

*Updated 2026-06-15 — the tile-model rewrite (v0.2). The ladder + §Tile now describe the live `tileGround.js` construction; the figure-ground ladder is archived. Verify the addresses against `src/lib/tileGround.js` before building.*
