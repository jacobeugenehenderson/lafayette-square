# Ribbons & Corners — canonical reference (the TILE model)

**Status: v1.0 (2026-06-15) — the tile-model rewrite.** This is the central reference for how the visible street geometry — asphalt, curb, treelawn, sidewalk, corners — is constructed. **The live model is the TILE construction in `src/lib/tileGround.js`.** (v1.0: promoted the tile model from banner-warnings + the feature ledger into the body; the retired **figure-ground / `buildBlockGeometryV2` emitter** reference was migrated to [`_archive/RIBBONS-figureground-emitter-2026-06-15.md`](_archive/RIBBONS-figureground-emitter-2026-06-15.md); the 13-month corner saga stays in [`_archive/RIBBONS-history-2026-06-12.md`](_archive/RIBBONS-history-2026-06-12.md).)

> Part of the cartograph quintet alongside `FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`. **Read this before any geometry / corner / curb / intersection / ribbon work.** Most regressions in this repo trace to someone re-deriving a points-and-chains framing for a problem this system already answers. The doctrine in §1 is load-bearing.
>
> **Where the rest lives:** the **frame** (centerlines, divided pairs, the across-intersection organ) is `SKELETON.md`; the **ped FILL** (treelawn/sidewalk depths, the bent corner fill, ADA pads, caps, the authoring panel) is `SECTION.md` (the FILL SSoT); the **execution order** is `PIPELINE.md`. This doc owns the **geometry doctrine + the tile construction** that connects them.

---

## §0. Scope + how to use this doc

**This doc covers:** the derivation chain (centerline → polygon → ribbon), the tile (the block face between streets), the curb as a concentric offset, the corner as a bent band, the divided-road model, and the live `tileGround.js` construction at a function level.

**This doc does NOT cover:** centerline derivation (`SKELETON.md` + `skeleton.js`); the ped FILL detail + Section authoring panel (`SECTION.md`); Stage look authoring (`STAGE.md`); Preview QA (`PREVIEW.md`); Arborist/Meteorologist.

**How to use it:**
- Touching ribbons/corners/curb → read §1 (the regime + invariants) first. It is the load-bearing part.
- Implementing → read §3 for the live function, then verify against `src/lib/tileGround.js` (the doc points at it; the code is the truth).
- **Don't re-derive from code or memory.** If §3 conflicts with the code, the code moved — flag it and update this doc.

---

## §1. The regime, in plain words

### ⭐ The model in one sentence

**The map is made of TILES — the block faces of the centerline graph. The centerlines are the grout; each tile is painted INWARD from its own edges (asphalt → curb → treelawn → sidewalk → land-use); the corner is the band BENT around the curb arc, never a constructed primitive.** Everything visible is a pure derivation of the centerline.

> ⚠️ **"Faces of the centerline graph" is the assumption now under challenge (2026-07-25).** A graph face
> cannot close around a **degree-1** chain: `extractFaces` walks a dead-end spur out and back over the
> same vertices, so **ALL 50 LS dead-end tips are zero-width slits** — a chain traversal, not a shape
> (`PREBAKE §4.0`, `PIPELINE §Wall`). Proposed replacement (Jacob): the SSoT radius as the **outer
> polygon**, everything inside **punched out** — blocks = boundary − stroked roads — which closes a spur
> into a real notch and makes the concentric law literal (the block boundary IS the curb). Not ratified;
> it re-founds the tile substrate and this sentence changes with it. Spike + risks:
> **`_handoffs/HANDOFF-deadend-face-resolution.md`**.

> The tile model replaced the **figure-ground** regime (blocks-as-positive, streets-as-subtracted-void) in the ~2026-06-01 re-pour, and **T4 (2026-07-15) deleted figure-ground's geometry outright** — the tile construction is now the only one. The emitter reference is archived at [`_archive/RIBBONS-figureground-emitter-2026-06-15.md`](_archive/RIBBONS-figureground-emitter-2026-06-15.md); `silhouetteStraightEmitter` and the band emitters no longer exist in the tree. `buildBlockGeometryV2` survives as a **frontage-edge identity builder only** (§1's T3 note below).

> ## ⭐⭐ DOCTRINE (2026-06-15, Jacob — the construction campaign): CONSTRUCT the hard polygons; DERIVE only the simple block faces.
> The derivation chain below holds for a **simple block face** — a tile bounded by ordinary street legs derives correctly (centerline → offset → ribbon). It **fails at the two HARD polygons**, and that failure is one root, not many: **the junction and the divided median must be CONSTRUCTED positively, not left to emerge from the face-walk.** This **supersedes the old `"the IX is never constructed"` line** (`tileGround.js:26`) — that emergent posture *is* the bug family.
> - **Why (canon × the median deep-research × osm2streets):** the standard (`OSM2STREETS-GROUNDING §2`, "the defining divergence") **constructs the intersection polygon positively at every node** — roads trimmed back, the node neighborhood *replaced* by construction; *"every E3 artifact lives in this gap."* And the median research (2026-06-15) found **no production system *derives* a median** — A/B Street calls a centerline-derived median a **known limitation that "doesn't fit"** — the right move is to **construct a generic median positively**. Both findings are the same principle from two sides.
> - **The unification:** junction-curb bumps + 4-way sliver corners (emergent junction tile) · median needles + the "d" bulge (emergent median face) · divided-transition scallops/width-steps (tiles inheriting messy node geometry) are **ONE root** — *we build ribbons against tiles that are emergent at the hard cases, not constructed.* The concentric-ribbon FILL is sound; it just needs **correct polygons to build against.**
> - **The campaign (now ONE move):** **intersection-everywhere** — construct the intersection polygon at EVERY node (trim-back + corners-by-clockwise-adjacency). The junction MAP already spans every node + the corner-adjacency pairs are frozen; only the GEOMETRY (apron + edge-collision trim) is still divided-only (forensic 2026-06-16). The `OSM2STREETS-GROUNDING §4` recommendation #2. **Brief: `HANDOFF-junction-construction.md`.** *(The second half — ~~constructed generic median~~ — is RETRACTED; the median is DERIVED, see the update below.)*
> - **LOCKED (do not reopen):** the two-carriageway model (no merge-to-spine); the concentric-ribbon FILL (`sectionPass`); custom > OSM > AASHTO widths. **Separate layers, NOT tile/median geometry:** pedestrian refuge islands (a footway layer, `footway=traffic_island`/`crossing:island=yes`) and signal hardware (instanced assets from `highway=traffic_signals`).
>
> ### ⭐⭐ UPDATE (2026-06-15, Jacob — *"why aren't we using the same make-polygon / walk-polygon process as everywhere else?"*): the MEDIAN is DERIVED, not constructed.
> The median half of the campaign is **retracted.** A divided median is **NOT a hard polygon to construct** — it is the **block face `extractFaces` already walks between the two carriageway chains**, painted by the **existing Section ribbon model** (`SECTION §3`): a tile with both ped strips off is the **"open field"** (`SECTION §3.1` line 89), its **`luRemainder` flooding curb-to-center** (`SECTION §3` line 111) — route that flood to the `median` class and that *is* the median. Liftable, no new geometry. What made it *look* like a construction problem was a **WIDTHS** bug — the carriageways overran the gap and annihilated the median; once each carriageway is `surveyHW/2` per side (the landed `3a` widths, `8fd3485`), the median = the gap between the inner asphalt edges = `luRemainder`, and the **nose, cross-street crossings, and Lafayette's no-median all fall out for free.** Even the nose **rounds with the same cap/fillet strategy as every other tile end** (Jacob) — no bespoke primitive. The old chain-to-chain median **stamp RING** is deleted. **Mechanics + the as-built identity: §3.5.**
>   - ⚠️ **CORRECTION (2026-07-22):** the E2 **merge patches** (`derive.js` `stamp('merge', …)`, the divided-corridor loop ~L3306–3440 — the nose-taper + cross-street-crossing *corridor asphalt*) are **NOT deleted**; they still emit. The median **body** is a derived walked face (the lock below holds), but the transition-taper/crossing merge *asphalt* is still constructed. At a divided-into-through-road **shared-node convergence** one of these nose-taper stamps collapses to a **degenerate duplicated-vertex needle** on the through-edge — the class `SKELETON §5h` fixes, upstream of E2, via the prevailing-direction overlay (`strokePoints`). So: median body = derived; merge asphalt = still constructed; the "~:3135–3354 deleted" line ref was stale.
> - **The deeper pattern (bank it):** BOTH recent hard cases dissolved the same way — the **junction-curb bump** was fixed by correcting the *survey* (name-aware `roadId` + width reconciliation), not by constructing a junction polygon; the **median** by correcting the *widths*, not by constructing a median polygon. **Fix the derivation → the universal walk produces the right polygon.** This *narrows* the "construct the hard polygons" campaign: construction is the last resort, after the derivation is verified correct. Whether intersection-everywhere (campaign half 1) is still needed, or also dissolves once the survey/identity is right, is the open question — do NOT assume construction before exhausting the derivation fix.
> - **New LOCK:** the median is a WALKED FACE, derived by the universal pipeline — **never a constructed polygon.**

### ⭐ THE DERIVATION CHAIN — the centerline is the root source (FUNDAMENTAL; Jacob)

Everything the operator sees is a **pure derivation of the centerline**, in strict order: **centerline → polygon (curb/tile) → ribbon (asphalt · curb · treelawn · sidewalk)**. The ribbon reads off the *polygon*, but the polygon is *itself* nothing but the centerline's concentric offset, so the **centerline is the ROOT**. Two consequences bind every fix:

1. **The polygon is BOTH the geometry source AND the identity source.** The ribbon reads off the polygon not just *where the edges are* but *what they mean*: **"what is a straight leg?"** (a maximal run of same-street edges — `groupRuns`), **"what is a corner?"** (a run seam / sharp vertex — `vertR` / `filletRing`), and **"is this treelawn or sidewalk?"** (the per-frontage material — `gleanTreelawn`). So a rough centerline corrupts not only the *shape* but the *identity*: facet vertices get misread as corners (each taking a fillet → lumps), one frontage shatters across facet-edges, the material assignment fragments. **A broken sidewalk at a faceted curve is an identity failure, not only a geometry one.**

2. **Fix at the centerline, FIRST, and at its source.** Because the polygon and the ribbon are *derivations*, any defect in either originates upstream. Patching the polygon — or the ribbon/sidewalk/treelawn — while the centerline is rough is **editing a shadow**. ⛔ **Diagnostic corollary:** if you change something and the *polygon moves but the centerline does not*, you are at the wrong (downstream) layer — stop and go up.

The **concentric law** (the curb is *always* a concentric offset of the centerline) is the **geometry half** of this. The **identity half** — leg/corner/material descend from the same root — is just as binding. Together: **get the centerline right and the entire ribbon, shape *and* identity, follows for free.** Cross-refs: `ORIENTATION.md`, `README §START HERE`, **`SKELETON.md §3.5`** (the concrete frame→render flow: where the points live, the single `ribbons.json` source, the `STREET_SMOOTH` knob, the curve-fit), `SECTION.md §7.1` (the SHAPE/FILL which-layer frame).

### ⭐ THE FOUR INVARIANTS (read before touching corners — these bind the construction)

These are substrate-independent corner principles. Building against them is mandatory; if your construction can't honor one, **stop and flag Boz** rather than improvising a parallel mechanism.

1. **The corner is the band BENT around the arc** — a slice of the same continuous concentric offsets — **never a separately-constructed primitive** (no per-corner pad, no per-vertex fillet *as the corner*). §3.4, `SECTION.md §6`.
2. **Concentric offsets use `jtMiter`, never `jtRound`** — jtMiter inherits an already-rounded ring's arcs as concentric nested arcs AND passes operator-authored R=0 squares through sharp; jtRound re-rounds every corner by radius=depth (a second rounding mechanism) and corrupts squares. The curb silhouette is rounded **once** by `filletRing`; the inward bands then `jtMiter`-inherit it. §3.3.
3. **The ADA corner pad is a band-slice**, not predicated on the arc — so it works square OR round. (`SECTION.md §6` owns the ADA fill.)
4. **Mono-width** per block/run, not per-leg stitched. "Ribbon monowidth, strips variable" — the *outer* depth is uniform per block (clean concentric corners); what varies per-edge is the *divider* (where treelawn ends) and the *materials*.

### The ribbon as the entire object

The visible "street" is a cross-section running along the chain: asphalt, then curb, then treelawn, then sidewalk, terminating at the property line. The same cross-section persists from straight-spans into the corner — *the corner is the ribbon's WRAP around the IX*, same materials, same depths, bent around an arc. The corner is **not** a separate primitive gluing two ribbons together; it is what naturally happens when the band follows the rounded curb silhouette around the IX.

### Anti-patterns this regime forbids

- ❌ Snapping or editing chain endpoints to "clean up" a corner. The corner comes from the offset of the centerline; chain endpoints are descriptive, not prescriptive.
- ❌ Per-IX special-case extension math (extending a chain segment to find where it meets another).
- ❌ Authoring a fillet-wedge primitive at a corner as a separately-constructed polygon.
- ❌ Re-deriving geometry from chains *past the Wall*. Section is a pure consumer of the frozen shape (`WALL.md`).
- ❌ Smoothing/simplifying the **polygon** (curb) while the centerline stays faceted — the wrong layer (the Derivation Chain corollary).
- ❌ Splitting a chain at every slight bend. Slight bends are OSM noise; the junction-protected RDP already collapses them (`SKELETON.md §3 step 8`).

### Diagnostic order when something looks wrong

1. **Is the CENTERLINE clean at this location?** (Survey navy line, `SurveyorOverlay`.) A faceted/kinked centerline corrupts shape *and* identity downstream. If rough → fix the frame (`SKELETON.md`), not the polygon.
2. **Does the polygon move but the centerline doesn't?** → you're at the wrong (downstream) layer. Go up.
3. **Is this SHAPE (Survey, pre-Wall) or FILL (Section, post-Wall)?** A wrong silhouette is upstream; how the ribbon *bends* is Section. "Is this chains again?" (`PIPELINE §Wall`).
4. **Only then, the construction:** the tile curb-builder (`tileGround.filletRing` / `offsetRingVariable`) or the FILL (`sectionPass`). The legs are almost always clean (`SKELETON.md §5d`); the bug is usually which legs the corner-builder paired, or a width datum (`SKELETON.md §5a/§5g`), not the input.

---

## §2. Data shapes

### Input: `ribbons.json` (the First Bake — `src/data/ribbons.json` or per-scene)

```js
{
  streets: [
    {
      id, skelId,        // chain identity (skelId canonical post-skeleton.js)
      name, type, highway,
      points: [[x, z], ...],     // chain centerline polyline (denser than skeleton: derive.js inserts an IX vertex at every intersection)
      measure: {
        left:  { pavementHW, treelawn, sidewalk, terminal, curb? },
        right: { pavementHW, treelawn, sidewalk, terminal, curb? },
        symmetric: bool,
      },
      segmentMeasures: { [segOrd]: { left, right, symmetric } },  // per-run overrides
      capStart, capEnd, capEnds,    // 'round' | 'blunt' | 'none'
      anchor,                       // 'center' | 'inner-edge'
      innerSign, pairId,            // divided carriageways (which perp side faces the median; mate's skelId)
      phase,                        // divided structure {kind, role, corridorName, spineAtStart, spineAtEnd, ...} — see SKELETON §2
      gradeSeparated,               // excluded from the face graph (else the 2D crossing bowties extractFaces)
      intersections: [{ ix, ... }], // ⚠️ ix are INDICES into points — stale if you densify the stored array (SKELETON §3.5)
      disabled,
    },
  ],
  intersections: [ { point: [x, z], streets: [...] } ],   // emergent IX list
  faces: [ { ring: [[x, z], ...], use: 'residential' | 'park' | ... } ],  // read for LU coloring
}
```

**Field semantics:** `pavementHW` — perp half-width from centerline to asphalt outer edge (the curb is this offset). `terminal` — `'sidewalk'` (ped zone present) or `'none'` (bare median, etc.). `anchor: 'inner-edge'` — divided-carriageway authoring mode; zeroes the inboard ped zone so the median falls out (`SKELETON §4`). `intersections.ix` are **indices** — the fragile key; `segOrd` (IX-count-before-a-run) and `cornerKeyAt` (IX coord + leg skelIds) are the densify-robust keys (`SKELETON §3.5`).

### The TILE — the block face (`extractFaces`)

`extractFaces(streets)` (`tileGround.js:508`) builds a planar graph from the **shared vertices** of `streets[].points` (grade-separated streets excluded) and walks its faces. Each enclosed face is a **tile** — a city block, bounded by the centerlines that surround it. The tile is the unit everything is painted onto.

- **The grout is the centerline**, not a drawn line. A tile's edges ARE segments of the bounding streets' centerlines.
- **Near-coincident endpoints are welded** before the walk (`ENDPOINT_SNAP`) so a loop body that closes within a few cm reads as a closed face, not an open pendant — this is what makes a loop's **median = the emergent enclosed face** (`LOOP-STREETS.md`).
- **Dead-ends** render woven with their authored cap; the pendant-prune was reverted (asphalt is tile-sourced — pruning deletes the road; `SECTION.md §6`).

### The curb SHAPE — `iA` (the frozen polygon)

The curb is the per-edge **parallel offset** of the centerline: `iA = chain ⊕ pavementHW` per side (`offsetRingVariable`, `tileGround.js:147`; D6a — the curb is an offset, not an asphalt-union carve). Corners are rounded **once** by `filletRing` (`tileGround.js:262`) — the single legitimate rounding (analogous to figure-ground's `applyRoundCornersToRing`). The curb's render differs by tool:
- **Survey (live, pre-Wall):** re-stroked every frame by `buildTileGround` (`sectionFrozen=false` → `tileGeos`).
- **Section (frozen, post-Wall):** read from `shape.json` (`sectionOpen` off the frozen `_shapeArtifact`); the live stroke is gated OFF. (`SKELETON §3.5` — the render-path map.)

### `shape.json` — the frozen per-tile SHAPE (`_shapeArtifact`) + sibling groups

The Wall freezes the SHAPE here: each tile's `runs[]` = `{skelId, side, segOrd, poly, baseMeasure}` (the curb edge + run identity). This is Section's frozen input (`SECTION.md §2`). `64K` on LS.

**Format (`{ tiles, highway }`, 2026-06-16 G1).** The artifact is now an OBJECT wrapping the per-tile array plus **sibling groups that aren't tile-shaped**: `{ tiles: _shapeArtifact[], highway: rings[] }`. The `highway` group holds the grade-separated highway-class strokes (motorway/trunk + links/ramps) — frozen alongside the tiles so the non-Survey frozen views (Section/Design) restore them. *Legacy bare-array `shape.json` is still read* (treated as `{ tiles: d, highway: [] }`) so an un-re-baked scene degrades gracefully. Readers: `BlockGeometryV2Debug` fetch + `freezeShape` (`useCartographStore`); writers: the Survey-exit freeze + `bake-ground.js:923`. Grade-sep centerlines are smoothed unconditionally at 1.5 m before stroking (independent of `STREET_SMOOTH=0`, which exists only to spare the fragile *concentric curb* offset — highways stroke flat) so the frozen ramps are facet-free (`tileGround.js` gradeSep loop). *(Was: a bare array; 4924d9a routed non-Survey views to the frozen path, which dropped the top-level highway group → highways vanished from Design/Measure. Restored (G1, landed) → `_archive/handoffs/HANDOFF-surface-and-wire-geometry-LANDED-2026-06-22.md`.)*

### `blockCustoms[skelId][side][segOrd]` — operator overrides

Per-run cross-section override authored in Survey/Section, keyed by the **frozen run identity** (`feCustomKey`), never chain geometry. Same shape as `measure[side]`. A width drag **fans across every `segOrd` the frontage `fe` owns** (so a far-side T does not step the near frontage — `SKELETON §5g`).

### `runs` / `groupRuns` — the leg identity

`groupRuns(tile)` (`tileGround.js:764`) groups a tile's edges into **runs** — maximal spans of same-street edges. A run is a *leg*; a run seam (street changes) is a *corner*. This is the identity read of the Derivation Chain: `cornerAt(a,b)` = real corner iff `a !== b` (different street both sides), else a through-node. The same test governs construction (`filletRing`) AND authoring scope (`SKELETON §5g`).

---

## §3. The pipeline, function-by-function (`tileGround.js`)

`buildTileGround(ribbons, opts)` (`tileGround.js:1185`) is the single entry for **both** the live 2D Survey render and the offline bake → WYSIWYG by construction (`bake-ground.js:294`, `BlockGeometryV2Debug.jsx:681`). ~2650 LOC total. Opts: `{ stencil, curbWidth, smooth, blockLandUse, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides, blockCustoms, emitArtifact }`.

### 3.1 The frame, divided roads, and the smooth knob

- **Centerline smoothing rides ONE knob.** `smoothCenterline.js` exports `STREET_SMOOTH` (`:150`, currently `0`) + `junctionKeysOf` (`:159`); `buildTileGround` takes `opts.smooth = STREET_SMOOTH`. `smoothChain` (`:101`) is an interpolating centripetal Catmull-Rom, **corner-protected** (30° splits sharp corners as hard vertices) + **junction-pinned** + **arc-length-uniform** (no scallop on sparse input). Applied at **consume time** on a COPY — it must never bake into the frozen frame (the IX-index constraint, `SKELETON §3.5`). One constant + one pin-set ⇒ one smooth curve, concentric by construction.
- **Divided carriageways stay two centerlines; the median is an emergent geometric face (this line is now the WHOLE model — see the §1 update).** The chain stays at carriageway center; each carriageway strokes `surveyHW/2` per side (the `3a` widths); the median is whatever face `extractFaces` walks between the two carriageways, and its grass is the ordinary `luRemainder` of that tile (ped-zeroed by **face-read identity**: a tile bounded by BOTH carriageways of one pair — §3.5) — **not** a chain-identity consequence, **not** an authored object, **not** a constructed ring. The E2 stamp ring that briefly contradicted this is **deleted** (§3.5). The two-carriageway model is **LOCKED** (no pair synthesis, no collapse to a single spine). Frame topology (longitudinal weld, station-overlap pairing, `phase.spineAt*` the frozen transition link) lives in `SKELETON.md §2/§3` + `_archive/TRUMAN-FORENSICS.md`.
- **Divided↔undivided transition (the "special sauce", `SKELETON §5d/§5e`).** At a transition the outer curb must run **straight through**; the median opens **inward**. The corner-builder must round the **two corridor outer-edge legs** (treat the divided corridor as ONE road at the corner), never the carriageway *stubs* — rounding a stub against the cross-street fabricates the **false corner**. Detect via `phase.spineAt*` (a frozen frame fact, never re-derived by node-matching at construction). This cured the live false corner (`9c275ce`). The residual transition "d" bulge is the **unfrozen curb** re-stroked live — fixed by freezing the curb (`HANDOFF-freeze-the-curb-in-the-first-bake.md`), not by more construction.

### 3.2 Tiles — `extractFaces` (`:508`)

Builds the planar graph from shared vertices of `streets[].points` (excludes `gradeSeparated`), welds near-coincident endpoints (`ENDPOINT_SNAP`), walks the enclosed faces. Output: the tiles, each carrying its bounding-street edges (skelId/side per edge). Loop interiors emerge as faces (→ median, `LOOP-STREETS.md`); the outer/perimeter face is included so exterior streets get asphalt (G9).

### 3.3 The curb SHAPE — `offsetRingVariable` + `filletRing`

Per tile, per edge: stroke the centerline outward by `pavementHW` (per-side, per-run via `runMeasure`) → `iA`, the curb edge. `offsetRingVariable(ring, depthAt, cornerAt, capAt)` (`:147`) does the variable-depth parallel offset; `cornerAt` uses the run-seam test (real corner vs through-node) so a width step doesn't appear at a through-node. `filletRing(ring, Rfn, sink)` (`:262`) rounds the curb corners **once** (radius from the authored corner-R kit: global scale × per-IX × per-corner). `strokeOpen(polyline, delta)` (`:371`) handles open/perimeter runs. **jtMiter throughout** (invariant 2). This is the SHAPE that freezes at the Wall.

> ⭐ **Name-aware identity (2026-06-15) — `cornerAt`/`isThrough` key on the canonical `roadId`, not raw `skelId`.** A `continuesAs` name-transition is ONE continuous road (*the road is the line, the name a label*), so its seam is a **through-node, not a corner** — `cornerAt` reads the same `roadId` both sides and runs the offset straight through; `sectionPass`'s `isNameTransition` suppresses the corner/ADA bid there. The `roadId` (a `continuesAs` union) is frozen in `derive.js` and rides the frozen `runMeta` so Section reads it post-Wall. Keying on `skelId` mis-read the West-18th↔Dolman / South-18th↔West-18th seam as a corner → an unstable offset-line intersection between near-tangent legs → the junction-curb **bump** + a phantom mid-curve ADA ramp (the resolved `HANDOFF-curve-primitive-skeleton.md` defect). The companion is the **width datum**: a through-road must carry one `pavementHW` per side (next §, the width-step line).

### 3.4 The ped FILL — `sectionPass` / `sectionOpen` (`:801` / `:1161`)

`sectionPass(shapeTiles, cw, stripMat, blockCustoms)` strokes the ped cross-section **INWARD** off the frozen curb `iA`: treelawn (outer strip) + sidewalk (inner strip) + the bent corner fill + the ADA pad + the dead-end cap wraps; LU is the flooded remainder. **Mono-width** (one total depth per block → clean concentric outer edge; the divider varies per-edge). The corner is the band **bent** (invariant 1) — a slice of the same continuous offsets, all-SW at the corner (ADA), tangent-trimmed onto the legs. `sectionOpen` is the open-side mate (Wall Phase-D) composing block/curb/asphalt off the frozen `iA` with **no chain handle**.

> **`SECTION.md` is the SSoT for the FILL** — the strip swap, the bent-SECTOR corner construction, the ADA "slide-to-curb", the cap-wrap, the "how to change the corners" guide, and the Section authoring panel all live there. This doc owns only the geometry doctrine; §3.4 is the pointer.

### 3.5 Materials / LU / median

- **Per-LU color:** each tile colors by its own land-use metadata (M1); the treelawn paints its tile's LU color (M2). LU = `blockLandUse[blockKey]` override → `face.use` → weighted hash.
- **Median (divided) — a WALKED FACE, derived (the as-built home; §1 update is the doctrine).** The median is the block face `extractFaces` produces between the two carriageway chains. **Identity (`isMedianTile`, `tileGround.js`):** a tile bounded by **BOTH carriageways of one divided pair** (read off `phase.role`/`phase.pairKey`). ⛔ **No left/right side test** — tried and reverted: the measure side is point-order-relative *per chain*, so a pair's two carriageways disagree on which side faces the median (Lafayette: A's side matches the inboard oracle, B's doesn't). "Bounded by both members of the pair" is the convention-free signal; `pairKey` rules out cross-pair junction tiles. **Grass:** the tile's `luRemainder` (the open-field flood, `SECTION §3`) routed to the `median` class via a frozen `isMedian` flag (ped bands already zeroed) — no clip, no ring. **Curb:** the universal carve `differenceRings([tile.ring], aFill)` (tile − asphalt = the inner-edge gap). **The nose, crossings, and no-median all fall out** once the carriageway widths are `surveyHW/2` per side: where the carriageways converge or a cross-street crosses, their asphalt closes the gap → `luRemainder` empty. `derive.js` keeps only `noseRecs` (junction map) + corridor **merge asphalt** (crossing windows + nose tapers); the median STAMP RING is deleted. *(OPEN: nose rounds with the standard cap/fillet — pending; the merge-asphalt may be removable once the junction lands — `HANDOFF-junction-construction.md`.)*
- **Median (loop-body):** the enclosed loop interior (Benton / Park Place, `LOOP-STREETS.md`) is the analogous case, still on a Clipper-inset `kind:'median'` ring (frozen `med`, clipped) — **not yet unified** to the walked-face/`luRemainder` path. Separate from the divided median above.
- **Curb stroke** is one continuous polygon per tile, wrapping the silhouette incl. corners (G6), painted OVER the bands so the band-to-asphalt seam hides under it.

### 3.6 The Wall + the bake

Survey-exit freezes the live smoothed `_shapeArtifact` → `shape.json` (`serve.js` POST `/shape`); the full slab bake (`bake-ground.js`) runs the same `buildTileGround` (+ `STREET_SMOOTH`) → the slab. WYSIWYG: live == bake, one module. (`WALL.md`, `BAKE.md`.)

---

## §4. The corner specifically

The corner is the highest-stakes, most-re-derived topic. Hold the chain of homes:

- **Geometry doctrine (the 4 invariants):** §1 above. The corner is the band bent; jtMiter; ADA band-slice; mono-width.
- **The SHAPE corner (curb arc):** `filletRing` rounds the curb offset once; radius from the 3-tier kit (`SKELETON §4` — Corners subsection). The corner is *two things in two tools*: **SHAPE in Survey, FILL in Section** (`ARCHITECTURE §2.1`).
- **The FILL corner (ped bend + ADA):** `SECTION.md §6` — the bent SECTOR off the frozen fillet, exact tangent-trimmed legs, street-edge always concrete (ADA), the set-back walk sliding to the curb on its leg.
- **The divided false corner:** `SKELETON §5e` — the corner-builder must pair the corridor outer-edge legs, not the carriageway stubs. (Figure-ground skipped these IXs via the now-dead `cornersAtIx`; the tile path must build the *right* corner. The retired skip is documented in the figure-ground archive.)
- **The width-step "dogleg":** `SKELETON §5a/§5g` — a per-fe `pavementHW` step at a through-node, usually a datum-data defect (drop/reconcile the deviating value), not a construction one. **Now reconciled by construction across `continuesAs` seams** (2026-06-15): `derive.js` sets each canonical `roadId`'s base `pavementHW` to one value per side (MAX across its chains), so a through-road carries one curb width — the seam no longer steps. ⚠️ A per-fe `blockCustoms` `pavementHW` override still wins over the base, so a deviating override on a through-road must still be corrected in the Survey/SHAPE SSoT (`blockCustoms`, `SURVEY.md:76`) — the residual curated-override gap. Detector: `through-width` (regression guard) + `curb-bump` (symptom) in `scratch/correctness-detector.mjs`.

---

## §5. The render side + authoring

The 2D Survey/Section render reads `buildTileGround` live (Survey) or `sectionOpen` off the frozen shape (Section). The **authoring panels** (the handles, the corner-R kit, the strip-material swap, the cap selector, translucency) are catalogued at their stage homes:
- **Survey SHAPE authoring** (asphalt-edge drag, corner-R kit, anchor, caps, name/type) → `SKELETON.md §4`.
- **Section FILL authoring** (treelawn/sidewalk depths, strip material LU↔SW swap, revert UI) → `SECTION.md §3`.

> ✅ **T4 LANDED (2026-07-15) — figure-ground's geometry is deleted.** The warning that stood here was right and the bill came due: the "real perf/reliability drag" was **285 s of Altadena's 320 s Designer load, drawing nothing** (`DESIGNER-LOAD-FORENSIC.md`). Deleted: the unreachable render branch + the `isTileScene` flag that had short-circuited it, `buildChainBandsLive` (the drag sidecar — the census's "residual third representation"), `emitOneBlockRingBands` / `emitBlockRingBands` / `buildFrontageBandsV2` / `silhouetteStraightEmitter`, `blockFill` / `ribbonUnion` / `applyRoundCornersToRing`, the `_v2Blocks` + `measureDragging` wiring, and `buildV2BakeShape` in the bake. ≈1,900 lines. `blockSharp` / `asphaltRounded` / `cornersAtIx` survive **only** as inputs to the fe builder.
>
> ⚠️ **T3 is still owed, and it is now the ONLY reason `buildBlockGeometryV2` exists.** What's left of it builds the **frontage-edge identity** — `feCustomKey` = `[chainSkelId, side, min(segOrds)]` — that SurveyorOverlay / MeasureOverlay / MeasurePanel resolve `blockCustoms` against. The tile `runs` already carry the identical triple (`tileGround.js:935`: `blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd]`), so this is a **duplicate derivation** — the last of the three representations. T3 unifies them and the file dies. **Gate: prove the tile-derived key is byte-identical to `feCustomKey` for every fe on LS *and* Altadena BEFORE cutting** — `blockCustoms` hashes off it, so a drifted segOrd doesn't error, it **silently orphans** every authored custom (the LS re-center failure mode). `scratch/t4-fe-parity.mjs` is the harness.

---

## §6. Active failure modes — LIVE

> The front of the work. The figure-ground-era modes (SELFINT band rings, curb-stroke Clipper gaps, dblclick-vs-spec) are retired to the figure-ground archive; the live thorn/degeneracy class is tracked as **G12** in `HANDOFF-tile-feature-ledger.md`.

### 6.1 G12 — thin-feature degeneracy ("thorns") — OPEN (PARTIAL)
When a tile's interior pinches below the band depth `WB = cw+tl+sw`, the inward offsets collapse past the medial axis → degenerate spurs `filletRing` rounds into thorns. **Two subclasses, both open** (`SECTION-CAP-CLAMP-FORENSIC.md`): (1) self-intersecting blobs (the band-fold-fix is STRANDED on a non-ancestor branch); (2) band-neck / partial-degeneracy (the `cap` clamp fires only on FULL collapse; the `thinTile` signal is computed but orphaned). The fix is the **LOCAL** capacity clamp (engage on partial-degeneracy without over-clamping the in-spec rest of the block — `HANDOFF-band-fold-fix.md`). ⛔ **Not** a corner-R clamp. Verify map-wide, zoomed-out, on Jacob's eye (the pulled-in view hides them).

### 6.2 Phantom park from `classify.js` — OPEN (data/classification) · ⭐ **MEASURED 2026-07-30, and the prescribed fix was aimed at the WRONG TAG**
`classify.js:60` stamps `type='park'` on any face whose centroid falls inside a park-stamping overlay, **first match wins** — and the bucket is `leisure=park` **OR `leisure=garden` OR `landuse=grass` OR `landuse=recreation_ground`**. Residential yards therefore capture whole blocks.

**Measured on the current `ribbons.json` + `raw/osm.json` (replaying the classifier's own overlay loop):**

| | |
|---|---|
| overlays that stamp `park` | **512 of 895** (258 `landuse=grass` · 249 `leisure=garden` · 4 real parks · 1 recreation_ground) |
| faces whose first match is a park-stamper | 32 — **31 caught by a residential yard, 1 by a real park** |
| faces shipping `use='park'` | 29 — **25 phantom** (all via `landuse=grass`), 1 real, 1 no-hit, 2 other |
| phantom `use='park'` area | **92,869 m²** (the real Lafayette Park face is 122,502 m²) |
| worst single capture | **face#12, 136,234 m² — the 2nd-largest face on the map — stamped by a 4,899 m² lawn** (its final `use` recovers to `residential`; the `type` stamp does not) |

⛔ **The documented "~3 LOC: drop `leisure=garden`" fix would repair 3 of 28.** The dominant offender is **`landuse=grass`** (28 of the 31 phantom catches; gardens account for 3). Any fix must narrow the bucket to genuine parkland (`leisure=park`, `landuse=recreation_ground`) and drop **grass and garden both** — and grass is the one that matters.

⚠️ **Changing this moves land use map-wide** → re-run prebake, re-bake, and gate on Jacob's eye (`[[feedback_shape_pass_fix_needs_rebake_before_the_eye]]`). Still independent of the geometry work. Reproduce: the attribution replays `classify.js`'s overlay loop against `raw/osm.json`; see the 2026-07-30 session.

### 6.2a ⛔ `layers.park[0]` is AUTHORED — it is NOT the phantom (read this before "getting rid of" it)
**The recurring trap (Jacob: *"a piece of phantom geometry that always trips us up"* — 2026-07-30).** `map.json layers.park` holds exactly **one** object, and it reads synthetic on sight: a **perfect 350 × 350 m square, 4 vertices, no tags, centred on the origin, rotated 9.2°, area 122,502 m²** (= 350²). It looks like junk. **It is not.**

It is `clean/park-polygon.json` — an authored 4-corner polygon (`tiltDegrees: -9.2`, `halfWidthMeters: 175`) that `derive.js:1060` **deliberately prefers over the OSM `leisure=park` trace**, because 4-corner topology is what lets the round-corners op and the three corner-plug components (asphalt / curb / concrete) reconcile cleanly. `derive.js` warns on fallback: *"corner plugs will degrade."* Consumers: `parkFeats` · `parkSidewalk` · `parkPaths` · the face-retag at `derive.js:3008`. **Deleting it drops the map onto the 65-vertex OSM trace the doctrine rejects** (`FEATURES.md` "The ribbon doctrine"); `[[feedback_dont_undo_a_decision_the_operator_made]]`.

⭐ **And it is NOT misaligned — measured 2026-07-30:**

| | bearing off axis |
|---|---|
| the authored square | **9.20°** (all four edges) |
| OSM Lafayette Park (65 verts) | **9°** (1,379 m length-weighted) |
| Park Ave · Lafayette Ave · Mississippi · Missouri | **9–9.5°** |

It agrees with the street grid to within ~0.3°. *(Boz mis-identified this face as "the real park, legitimate" by matching area+centroid alone — 122,502 vs the OSM overlay's 133,443 m² at (3,0) — and only caught it when Jacob challenged the object. **Match a suspicious polygon on its VERTEX COUNT and edge lengths, not its area.**)*

⚠️ **Two real correctables — correct these; do not delete:**
1. **The square is ~8% small.** 350 m a side vs the OSM trace's ~365 m (122,502 vs 133,443 m²) ⇒ the authored edge sits **~7 m inside** the true park edge all round. If that is a slip rather than intent, the fix is `halfWidthMeters`, not the polygon.
2. **`PARK_CENTER` disagrees with it.** `derive.js:1033` uses `{x: -15, z: -15}` for the park-parcel exclusion test while the authored polygon centres on `(0,0)` — a **21 m** offset. Harmless inside a 250 m radius today; it is latent drift.

### 6.3 Curb-as-offset residuals — see the correctness suite
The robust-offset program (D6a) is partial; the RED-until-true detector (`scratch/correctness-detector.mjs`) + `POLYGON-FIRST.md §5` gate the curve-fit cleanliness + corner-roundness. Live state in `BACKLOG.md`.

### 6.4 Dead-end mouth-collapse — ✅ LANDED via the FILL-side lever (eye-confirmed 2026-06-22)
Where a side street **dead-ends/T's into a through street**, `extractFaces` walks it as a **zero-width out-and-back spur** — the face's mouth vertex collapses (tile[53] Albion: `ring[1]==ring[3]`, 0.0 m). The FILL keys corners **by vertex** (`cornerT`), so the two mouth corners collapsed onto one key → one fillet wrapped, the other **butt-capped** (Section-only; curb smooth in Survey, `iA` already carries both mouth fillets). ✅ **FIXED, FILL-side, `iA` BYTE-IDENTICAL** (`spliceDeadEndMouths`-equiv, `opts.deadEndMouthWrap`, `tileGround.js`): (1) **snap** the two spur run-ends to their two fillet apexes → two `cornerT` keys; (2) **trim** the through-road's leg-sector back by a per-mouth disc so the corner wedge (`bandRem`) is free → the bent sector builds at each apex; (3) **synthesize the missing through-leg** on each mouth `cornerT` so the existing **Idea-A deep-leg slide** (`§6.1` step 5) fires → the set-back straight leg dips in. **Bounded per-mouth disc** (centered on the asymmetric fillet midpoint) keeps it local → iA byte-identical on all 101 tiles, multi-spur safe (tile[11]/[43] independent), no 98 m blow-up. 39 mouths/20 tiles; Benton/Waverly/SV loops excluded (deg-1-tip gate); `kennett-place`/`park-avenue-1` customs segOrd-stable. ⛔ **THE LESSON:** every proxy LIED — two false "LANDED" reports off unfaithful proxy renders; **the operator's eye was the only gate.** And the forensic's "iA-unachievable" blocking constraint was true for *ring-reshape* but moot — **don't reshape the face; the FILL-side lever wins.** ⚠️ **OPEN:** +5 `junction-band` detector flags = the slide's LU ramp-wedge fragments at mouths (eye-call, iA untouched); **8 single-fillet fallback mouths** unwrapped; **strip-swappable** dead-ends not yet rebuilt. Full forensic + wrong turns: `DEAD-END-MOUTH-FORENSIC.md`.

---

## §7. History

- The **13-month corner saga** (what was tried/failed/why, the figure-ground graveyard): [`_archive/RIBBONS-history-2026-06-12.md`](_archive/RIBBONS-history-2026-06-12.md).
- The **retired figure-ground emitter reference** (`buildBlockGeometryV2` data shapes + function-by-function + the dual emitter): [`_archive/RIBBONS-figureground-emitter-2026-06-15.md`](_archive/RIBBONS-figureground-emitter-2026-06-15.md).
- git holds the verbatim pre-rewrite `RIBBONS.md`.

## §8. Glossary

- **tile** — a block face of the centerline graph (`extractFaces`); the unit everything is painted onto.
- **grout** — the centerlines, which form the tile edges (the tiles are the faces between them).
- **iA** — the curb edge: the centerline's per-side parallel offset by `pavementHW` (`offsetRingVariable`), rounded once by `filletRing`. The frozen SHAPE.
- **run / leg** — a maximal span of same-street edges on a tile (`groupRuns`); a run seam (street changes) is a **corner**, same street both sides is a **through-node** (`cornerAt`).
- **fe / frontage edge** — a block-edge between two REAL corners; owns `skelId`, `side`, and the `segOrd`s spanning its through-nodes. The authoring unit (`feCustomKey`).
- **segOrd** — count of IX vertices before a run; the densify-robust run key (vs `intersections.ix`, the fragile index key).
- **mono-width** — one total ped depth per block (clean concentric corners); the divider + materials vary per-edge. "Ribbon monowidth, strips variable."
- **terminal** — `'sidewalk'` (ped zone present) or `'none'` (no ped zone — bare median).
- **anchor** — `'center'` (default) or `'inner-edge'` (divided-carriageway authoring mode; inboard ped zone zeroed).
- **STREET_SMOOTH** — the single smoothing constant (`smoothCenterline.js`), read by every consumer; one curve, concentric by construction. Currently `0`.
- **cw / tl / sw** — curb width / treelawn / sidewalk depths (m), perpendicular, outboard inward.

---

*Updated 2026-06-15 — the tile-model rewrite (v1.0). Promoted the live `tileGround.js` construction into the body; migrated the figure-ground emitter reference to the dated archive. Live siblings: `SKELETON.md` (frame), `SECTION.md` (FILL SSoT), `PIPELINE.md` (execution spine). Verify §3 against `src/lib/tileGround.js` before building.*
