# Pipeline — the address map

**Status: v0.1 (2026-05-30) — living doc.** The execution-ordered map of how raw data becomes the slab. Every step has a stable **address** (`§P#`) so we can hang three things on it without re-deriving each time:

- **🔧 Optimize** — what we keep polishing here (the perf/quality checklist).
- **🩺 Troubleshoot** — where to look first when this step misbehaves.
- **🗣 Explain** — the plain-language sentence for pitching/teaching the product.

> Part of the **cartograph quintet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md` / `RIBBONS.md`). This doc is the **index**; the deep geometry prose lives in `RIBBONS.md §3` and the addresses below point into it. Ordered by **execution**, not by concept — this is the order the bake actually runs, so an agent tracing a bug reads top-to-bottom.
>
> Sibling address-maps planned (the larger data effort): one for **Meteorologist** and one for **Arborist** as sub-parts of Cartograph; and, ultimately, a *dependency index* for **Lafayette Square** — which is a different shape (a consumer/runtime composition map, not an authoring pipeline). See §Campaign at the bottom.

---

## The ladder

```
PHASE A — AUTHORING (chains & tabular truth)
  P1   Skeleton          osm.json → skeleton.json                   "streets exist here"
  P2   Fortification     Survey/Measure → overlay.json              measures, caps, couplers, anchors, parcels/LU
  P3   Promote           pipeline.js + promote-ribbons.js → ribbons.json {streets, ix, faces}

  ═══════════════════════ THE DATA WALL (aspirational P2 · actual ~P8) ═══════════════════════
   Past here, NO geometry should be derived from chains — polygons are the surface. Today chains
   stay alive through P4–P8; closing that gap is the app's standing architectural debt. See §Wall.

PHASE B — GEOMETRY (buildBlockGeometryV2, run inside bake-ground.js)
  P4   Asphalt rects     emitChain pass 1 — per-chain rectangles + caps          RIBBONS §3.3
  P5   Polygonize SHARP  asphaltSharp = ∪ rects ; blockSharp = stencil − asphalt RIBBONS §3.4   ← figure-ground
  P6   Customs           emitChain pass 2 — per-block-edge overrides             RIBBONS §3.5
  P7   Corner records    cornersAtIx — polygon-edge Q, per leg-pair              RIBBONS §3.6
  P8   Polygonize ROUND  applyRoundCorners → blockRounded                        RIBBONS §3.7   ← round the positive
  P9   Corner mouths     asphaltRounded = stencil − blockRounded                 RIBBONS §3.8   ← negative falls out
  P10  Ribbons           MONO-WIDTH band · 2 strips × 8 regions = 16 SW/LU fields RIBBONS §3.9a
  P11  Corner asphalt    fillet residual attributed per-IX                       RIBBONS §3.10
  P12  Curb              dilate(asphaltRounded, cw) − asphaltRounded             RIBBONS §3.11
  P13  Parcel / Land Use faces → owning block ring, lu resolution                RIBBONS §3.12

PHASE C — PUBLISH (the slab)
  P14  Materials         BAND_TO_LAYER + per-Look design.json colors             m3Colors.js, Stage
  P15  Bake siblings     ground / ao / buildings / lamps / scene → public/baked/<id>/
```

---

## §Wall — the Data Wall (read this once)

The single most expensive truth in this codebase: **chains (the nodes that make up centerlines) are the recurring root problem.** Almost every "we have to go back to the drawing board" episode traces to a chain/node issue that would have been a one-step solve if the data were already a polygon.

The doctrine, in Jacob's words: **"The Skeleton is The First Bake."** By the time the operator leaves the Survey tool, we should be holding an *extremely simplified, polygon-ready dataset* — and chains should be **dead**. The Data Wall *should* sit at **P2**.

It doesn't, yet. Chains stay alive and load-bearing through **P4–P8** (they build the asphalt rectangles, feed the corner records, and drive the Bezier rounding). The wall — *"no geometry derived from chains past here"* — is only really enforced after P8, and even then the corner-radius authoring kit is a sanctioned exception that reaches back for `R`.

**This gap is the standing architectural debt.** It works today and is not worth fussing with mid-flight. But it is *not a solved problem*. When a future head-scratcher appears, the first question is: **"is this chains again?"** The fix direction is always *move the wall earlier / make the Skeleton the simplified bake* — never *patch chains deeper into Phase B*.

**Corroborating evidence — the ribbon model (§Ribbon) is itself an argument for the early wall.** The mono-width ribbon operates *purely on the polygon* (`blockRounded` offsets); it needs no chains at all. The only thing that ever tempts anyone back toward per-leg rectangles or a constructed corner is the chain-derived framing that lingers through P4–P8. Move the wall to P2 and the mono-width-bent-corner construction becomes the *obvious, only* path — the chains-root-problem and the corner-confusion are one disease with one cure: **polygon-first.**

Doctrine memory: `memory/project_skeleton_is_the_first_bake.md`.

> **⭐ ACTIVE 2026-06-04 — the §Wall debt, made visible (the "better bones" program).** The thorn / bulge-bow / "dead-end-triangle" cluster on the live 2D Survey render is **this debt, not separate bugs**: the skeleton is *not* polygon-ready, so OSM saw-tooth noise reaches Survey and the inward band offsets wander/cross/pinch. Operator's target (Jacob): *the park block = ~4 corner points; the whole map scrubbed of thorn-points BEFORE Survey.* **Two layers** (verified 2026-06-04) — so the fix is **one simplification authority that survives to Survey:** ① `skeleton.js simplify` was a timid local filter (perp<0.2m AND turn<2°) — needs **aggressive junction-protected DP/Visvalingam** (⛔ junction-protected: the junction-*blind* simplify deleted 79 interior Ts — `OSM-FORENSICS`); ② **`tileGround.smoothChain:614` re-smooths ×4** (count-based) — make it **arc-length** (single smoothing authority). Sibling: **intersection consolidation** (over-noded IXs → one node; survey `osm2streets`, don't reinvent) = the corner-saga lever. Live brief: `HANDOFF-too-much-line-root-cause.md`. Verified: Benton frame 29 (skeleton-origin, NOT derive) → render ~113; the aggressive skeleton RDP **survives `derive`** (64/66 curvy chains coarsened in `ribbons.json`), so `derive.js:1146`'s curve-densify is **inert post-RDP — not a layer** (an earlier draft wrongly listed it; corrected).

### ⭐ The proper way to a clean map (2026-06-02 — STOP per-symptom whack-a-mole on degenerate polygons)

The **frame is already correct** — `skeleton.json` carries the marrow (329 typed junctions, name-transitions, seeds). The render breaks because the **consumers ignore the frame and re-derive from raw OSM**: `derive.js` re-nodes raw OSM for faces, re-derives intersections, and **3m-snaps** them (§Part 3 / `OSM-FORENSICS.md`); `tileGround.extractFaces` re-walks the chains. **The degenerate polygons — interchange triangles, slivers, false blocks — ARE those re-noding artifacts**, not separate bugs.

**Two fixes — corrected 2026-06-02 by Groma against live code + data (the earlier draft of this note had two wrong premises; this supersedes it):**

1. **Faces + intersections on-frame** (`OSM-FORENSICS-EVAL.md` item 1) — read blocks from skeleton chains, intersections from `skeleton.junctions`; **delete** the raw-OSM faces noding + 3m snap (`IX_SEG_SNAP`) + densify hacks. ⚠️ **This is correct HYGIENE but render-INERT** — the live render + bake drive geometry from **`tileGround.extractFaces(ribbons.streets)`** (builds its graph from *shared vertices* of `ribbons.streets[].points`); `ribbons.intersections` has **zero consumers**, `ribbons.faces` is read **only for LU coloring** (`tileGround.js:786`). So this cleanup removes ~220 lines of inert splice machinery + the raw-OSM bypass — but **does not clear a single visible degenerate polygon by itself.**
2. **Grade separation — where the VISIBLE degenerates actually are.** NOT false junctions: `skeleton.junctions` (329) is shared-vertex-only and grade-separated roads don't share vertices → **0 false junctions.** The artifact is **~29 grade-separated 2D crossings** (motorway / Ozark Expressway / ramps × Mississippi, Nebraska, S. Tucker, S. Jefferson, S. 12th) that cross *without* a shared vertex; **`extractFaces` bowties them** (only a point-count filter at `tileGround.js:600`, no grade filter). **Detection is tag-free:** 0 same-layer crossings lack a shared node, so *any* no-shared-vertex 2D crossing IS a grade separation. **Fix: `extractFaces` must EXCLUDE grade-separated streets from the face graph** (construction-side, `tileGround`); the FRAME's job is to carry the grade flag (`layer`/`bridge`/`tunnel` + `gradeSeparated`) so the consumer can filter. **DONE end-to-end (frame: Groma, merged `6854122`; consumer + render: Theodolite, `77791f0`→`fc57115`, 2026-06-02).** Frame side: `skeleton.js#gradeFields` grades every street from *all* of `chain.sources` (fixed the named-street `makeStreet` tag-drop — Mississippi-the-bridge now reads `bridge:true,layer:1` but `gradeSeparated:false`, still bounds blocks); `gradeSeparated` survives the serializer into `ribbons.streets`. Verified: the filter `streets.filter(s => !s.gradeSeparated)` clears **29 → 0** crossings, 187/242 streets kept, junctions **329 → 329** (additive). Consumer side (`tileGround.js`): `buildTileGround` **excludes `gradeSeparated` streets from `extractFaces`** (kills the interchange triangles/slivers/false-blocks) AND **strokes them as flat asphalt strips off `measure.pavementHW` in the same pass** — they paint like alleys, no bare render (`77791f0`; denser arcs `b69cc72`). They live on their **own layer + material with a visibility toggle** (`d52e4f6`) and **render behind the local network** (grade-sep below grade in 2D; `fc57115`). The `sectionPass` wall held (0 chain refs). A/B-verified at the I-44 corridor; pending Jacob's eye on the live re-bake.

⚠️ **Never patch faces downstream by hand** — but note the *consumer-side* filter in `extractFaces` IS the fix here (the frame can't fix a crossing it correctly refuses to false-node; the consumer must decline to bowtie it). Frame carries the flag; consumer filters on it. (Capacity guard for thin-feature degeneracy = the sibling fix, RIBBONS §3.9a item 5, already on tiles.)

---

## §Ribbon — the mono-width model (novel; easy to forget)

> ⚠️ **2026-06-01 — SUPERSEDED IN PROGRESS by the TILE model.** The mono-width / figure-ground pipeline (P4–P13 below: asphalt-rects → polygonize → round → ribbons) is being replaced by the tile construction (tiles = faces of the centerline graph; inward strips; corners = the inward-offset). LS runs tiles now, unflagged. **Live State: [`HANDOFF-tile-feature-ledger.md`](../HANDOFF-tile-feature-ledger.md).** The P-ladder + §Ribbon + §Wall rewrite lands at **T4** (figure-ground deletion). Read the ledger for the live pipeline.

Two load-bearing, counter-intuitive facts. Both use techniques that don't match the obvious mental model, so they **drift every time someone (human or agent) reaches for the intuitive construction.** Hold them deliberately:

**1. The ribbon is MONO-WIDTH.** It is one band of uniform width `W` wrapping the *entire* block silhouette — not a per-leg cross-section stitched together. Internally it is **2 adjustable horizontal strips** (inner / outer, divided by the `cw+TL` offset), and the continuous band is sliced into **8 linear regions** around the block → **16 fields** (8 regions × 2 strips), each tagged **SW** (concrete sidewalk) or **LU** (land-use / parcel showing through). "Treelawn" is *not* a special material — it's just an LU-tagged strip. Keystone phrase: ***"ribbon monowidth, strips variable."*** This is why the construction is three inward Clipper offsets of `blockRounded` (`cw` / `cw+TL` / `WB`) + difference into 2 bands — not per-leg rectangles.

**2. The CORNER is an ACTUAL rectangle, bent.** ⚠️ *This is the one that keeps getting violated.* The corner is the same rectangular ribbon cross-section **physically curved around the corner arc** — it is **NOT a separately-constructed corner primitive engineered to *look* bent.** There is no fillet polygon, no corner wedge, no glue-between-two-legs. The band is built once as a continuous wrap of the whole block; the "corner" is simply *where that continuous band curves*. If you ever find yourself constructing a corner shape, **stop** — you've reverted to the V1 mental model the entire V2 regime exists to kill (RIBBONS §1 anti-patterns).

Doctrine memory: `memory/project_ribbon_corner_uniform_width.md` (V1 FINAL, 16-fields model).

> **Dual-emitter cutover (live state).** The ribbon model is mid-cutover, gated on `useRingBandEmitter` (`scene === 'toy'`). **Toy runs the mono-width keystone** (`emitBlockRingBands` → `emitOneBlockRingBands`, documented in `RIBBONS.md §3.9a` as of v0.8 / 2026-05-30); **LS still runs the legacy per-leg split** (`silhouetteStraightEmitter` + `buildFrontageBandsV2`, §3.9b) until the **C5 cutover** flips the flag. So P10/P11 below describe the *target* (mono-width) model — read §3.9a for the live toy construction, §3.9b for what LS does today.

---

## The addresses

> Contours below are **seeded** — this is the living polish checklist; we fill and sharpen them over time. `(seed)` marks a line that wants a deeper pass (RIBBONS §6 failure modes / §7 dead-ends, or real perf numbers).

### P1 · Skeleton
`osm.json → skeleton.json`. Derives canonical chains (skelId-keyed) from raw OSM. The First Bake.

> **⚠️ STATUS — "is the skeleton doing its job?" = NO, not yet (2026-06-04).** Its job per §Wall is an **extremely simplified, polygon-ready** dataset (a clean block = ~4 corners). It is **not**: it produces *correct* canonical chains but **passes OSM saw-tooth through** — the `simplify` (`skeleton.js:~593`) is a timid *local* filter (perp<0.2m **AND** turn<2°) that does nothing on curves, so e.g. **Benton's loop = 29 pts where ~5 suffice** (skeleton-origin over-noding; `derive.js:1146`'s curve-densify is NOT the source — an aggressive skeleton RDP survives it, 64/66 curvy chains coarsened). "Geometrically correct centerlines" ≠ "polygon-ready" — don't conflate them (Boz did, 2026-06-04, and wrongly answered "it's fine"). **This over-noding is the source of the thorn / bulge-bow class downstream.** Fix = the **better-bones / §Wall program** (see §Wall note above + `HANDOFF-too-much-line-root-cause.md`). Until it lands, treat the frame as **over-noded by default**.

- **🔧 Optimize:** the simpler this output, the healthier everything downstream — chain/node minimization (**aggressive junction-protected** Douglas-Peucker / Visvalingam on OSM saw-tooth) is the lever that moves the Data Wall to P2 = makes the skeleton polygon-ready. ⛔ Junction-protected: the junction-*blind* simplify deleted 79 interior Ts (`OSM-FORENSICS`). Sibling lever: **intersection consolidation** (over-noded IXs → one node; survey `osm2streets`).
- **🩺 Troubleshoot:** node-count blowups; OSM noise read as real bends; `blockKeyFromRing` rounded-vs-sharp divergence starts here (`memory/feedback_block_key_rounded_vs_sharp_diverges`). **Grade separation (Groma 2026-06-02):** every street carries `layer`/`bridge`/`tunnel` + an operative `gradeSeparated` flag (`skeleton.js#gradeFields`, summarized over *all* `chain.sources`). It's the frame fact a face consumer reads to exclude elevated/buried + limited-access corridors from the planar walk — without it, grade-separated centerlines that cross in 2D with no shared vertex bowtie `extractFaces`. **Junctions are shared-vertex-only → carry NO false grade crossings** (don't look for grade bugs in `junctions[]`; look at street crossings). **Divided carriageways (2026-06-03):** detected + paired in the frame — pairing is gated on longitudinal **station-overlap** (`8392b3e`), not just antiparallel + perp-gap (the perp helper clamps `t∈[0,1]`, so offset stubs false-pair); carriageway fragments are **longitudinally welded** into continuous chains (D1 `5348fbc` — Truman 8→2, all 11 corridors keep ≥2). The median is an emergent geometric face downstream (`extractFaces`), not a frame object. See RIBBONS §3.1.
- **🗣 Explain:** "We trace the real street network from OSM + aerial photos — provable truth, not invention."

### P2 · Fortification (Survey / Measure)
Operator hardens widths, caps, couplers, anchors, parcels/land-use into `overlay.json` against max-res aerial. Designer = fortification, not authoring.
- **🔧 Optimize:** authoring ergonomics; keeping the operator's edits in a minimal skelId-keyed shape.
- **🩺 Troubleshoot:** customs identity drift across edits; `blockCustoms` keyed by `(blockKey, edgeOrd)` and the pass-2 carry-forward (`memory/feedback_d7a_blockkey_drift`).
- **🗣 Explain:** "An operator measures every street's width and marks every cap against the photo — the map is fortified, not guessed."

### P3 · Promote
`pipeline.js` → `map.json`, then `promote-ribbons.js` → `ribbons.json` (`{streets, intersections, faces}`).
- **🔧 Optimize:** dirty-skip correctness (mtime touch via `io.js writeIfChanged`).
- **🩺 Troubleshoot:** the two-step gotcha — `skeleton.js` then `pipeline.js`; the pipeline does NOT run the extractor (`memory/feedback_skeleton_pipeline_two_step`).
- **🗣 Explain:** "We compile the authored intent into a single geometry input the bake reads."

### P4 · Asphalt rectangles
`emitChain` pass 1: each natural-segment → a perp-offset rectangle (`±pavementHW`); round caps emit pie-slice + quarter-annulus rings.
- **🔧 Optimize:** —
- **🩺 Troubleshoot:** mixed-winding caps cancelling against segment rectangles under NonZero union → dead-end holes; all rings must be CCW-normalized (RIBBONS §3.3).
- **🗣 Explain:** "Each street becomes a ribbon of asphalt as wide as we measured it."

### P5 · Polygonize (sharp)
`asphaltSharp = ∪ rects`; `blockSharp = stencil − asphaltSharp`. The figure-ground inversion: **blocks become the positive object, streets are the void.**
- **🔧 Optimize:** —
- **🩺 Troubleshoot:** `blockKey` divergence on donut-topology blocks — use smallest-enclosing-area PIP, not centroid-match (`memory/feedback_block_key_rounded_vs_sharp_diverges`).
- **🗣 Explain:** "The blocks are literally what's left when you subtract the streets — and the block is the real thing the city is made of."

### P6 · Customs
`emitChain` pass 2, fires only if any fe carries `blockCustoms[blockKey][edgeOrd]`. Rebuilds asphalt/block/frontage with per-block-edge overrides; carries pass-1 identity forward.
- **🔧 Optimize:** —
- **🩺 Troubleshoot:** the resolver is **wholesale-replace, not merge** — partial customs collapse asphalt (`memory/feedback_customs_resolver_wholesale_not_merge`); blockKey drift carry-forward via `(chainIdx, segOrds[0], side)`.
- **🗣 Explain:** "An operator can override any single block edge's cross-section without touching the rest."

### P7 · Corner records
`cornersAtIx`: per CCW-adjacent leg-pair at each IX, derive the corner point `Vc` from **polygon-edge crossing** (not extended tangents). No crossing → skip (median wedge).
- **🔧 Optimize:** —
- **🩺 Troubleshoot:** `feedback_corner_pad_continuity_first` doctrine; same-name through-street + parallel skips; this still consults chains (Data Wall debt — see §Wall).
- **🗣 Explain:** "Where two streets meet, we find the true corner from the block's own edges."

### P8 · Polygonize (round)
`applyRoundCornersToRing(blockSharp)` → `blockRounded`. Bezier (handle `(4/3)·R·tan((π−θ)/4)`, 16 samples) at each block-convex matched vertex. **Round the positive geometry. This is the last place chains are consulted.**
- **🔧 Optimize:** `R=0` (square) must be authorable for ADA ramps; band offsets must use `jtMiter` not `jtRound` (jtRound corrupts operator-authored R=0) — the V1-remaining work (`memory/project_ribbon_corner_uniform_width`).
- **🩺 Troubleshoot:** consume-spans pass; arc reversal + arcPositionFrac inversion (RIBBONS §3.7); `R` is design control, not a thing to clamp (`memory/feedback_no_corner_radius_clamps_in_emit`).
- **🗣 Explain:** "We round each block's corners; the streets' rounded mouths appear for free as the negative."

### P9 · Corner mouths
`asphaltRounded = stencil − blockRounded`. The rounded street mouth at every IX is the back side of the rounded block corner — inherent, not constructed.
- **🔧 Optimize:** —
- **🩺 Troubleshoot:** "visible geometry is permanent; derivation can change" (ARCHITECTURE §7) — the mouth region must always fill, regardless of which emitter computes it.
- **🗣 Explain:** "The flared opening where a street meets an intersection is just the shape of the rounded block, inverted."

### P10 · Ribbons ⚠️ novel model — read §Ribbon first
**Mono-width** band wrapping the *entire* block silhouette at uniform width `W`: three inward Clipper offsets of `blockRounded` (`cw` / `cw+TL` / `WB`) closed into **2 adjustable horizontal strips**, sliced at corner tangents into **8 linear regions** → **16 fields**, each tagged **SW** or **LU**. The corner is the same band *bent*, never constructed. "Ribbon monowidth, strips variable."
- **🔧 Optimize:** the live-drag preview path (`buildChainBandsLive`) must migrate in lockstep with the bake emitter (`memory/feedback_live_drag_preview_migrates_with_main_emitter`).
- **🩺 Troubleshoot:** `silhouetteStraightEmitter` silently dropping fes — audit by per-fe band-entry count, not by area (`memory/feedback_silhouette_straight_emitter_skipped_fes`). (seed — live construction in RIBBONS §3.9a; full failure inventory in §6; cutover state in §Ribbon.)
- **🗣 Explain:** "A single ribbon of sidewalk and tree-lawn wraps every block at constant width — we just re-tag which stretches are pavement vs greenery."

### P11 · Corner asphalt (fillet)
`attributeFilletResidualToArcs`: the rounded-asphalt residual minus the union of chain rectangles, attributed to the nearest corner-ribbon entry (≤8m) else `cornerOrphanAsphalt`.
- **🔧 Optimize:** —
- **🩺 Troubleshoot:** attribution distance threshold; orphan accumulation at exotic IXs. (seed)
- **🗣 Explain:** "The little asphalt wedge inside each rounded corner is bound to that corner so it always paints right."

### P12 · Curb
`curbBands = dilate(asphaltRounded, cw) − asphaltRounded`. One continuous stroke per block, painted OVER the bands so the band-to-asphalt seam hides under it.
- **🔧 Optimize:** —
- **🩺 Troubleshoot:** degenerate-W flood + customs band-collapse interplay — the per-block capacity guard (RIBBONS §3.9a step 5; design HANDOFFs retired to git `2854aa3`); guard against real data, not synthetic worst-case (`memory/feedback_render_guard_against_real_data_not_synthetic`).
- **🗣 Explain:** "The curb is a single ribbon tracing the whole block edge — including every rounded corner."

### P13 · Parcel / Land Use
Block fill: `ribbons.faces[]` clipped to owning `blockRounded` ring; `lu = blockLandUse[blockKey] || face.use || hash`. Drives per-LU treelawn color too.
- **🔧 Optimize:** —
- **🩺 Troubleshoot:** per-block LU via `fe.blockKey` direct map, not centroid probe (treelawn rings sit inside the ribbon) (`memory/project_per_block_lu_via_blockkey`); coordinate-based adjacency for treelawn.
- **🗣 Explain:** "Every block is colored by what it's used for — homes, park, commercial — and the tree-lawn picks up its neighbor's color."

### P14 · Materials
`BAND_TO_LAYER` (`m3Colors.js`) maps every band/material to a layer; per-Look `design.json` colors seed each group; bake honors `layerVis`.
- **🔧 Optimize:** —
- **🩺 Troubleshoot:** `GrassMesh` needs polygonOffset parity with `FadeMesh` (FEATURES); Designer toggle ↔ bake group parity.
- **🗣 Explain:** "The operator paints the whole map's look — and saves variations as named Looks — without changing a single shape."

### P15 · Bake siblings (the slab)
`bake-ground` + `-ao` + `-buildings` + `-lamps` + `-scene` → `public/baked/<id>/`. Deterministic, byte-reproducible, dirty-skipped.
- **🔧 Optimize:** dirty-skip / mtime discipline (ARCHITECTURE §7); the no-op 1ms bake.
- **🩺 Troubleshoot:** slab completeness — anything authored-but-not-baked is invisible to the deployed app (FEATURES "the slab carries the operator's full authored product").
- **🗣 Explain:** "We pour a flat, fast, fortified slab that the public app trusts unconditionally."

---

## §Campaign — the larger data effort

This doc is the first of a family of address-maps:

- **A.** PIPELINE.md doubles as a *polish checklist* — the 🔧 lines are the standing "always keep optimizing" list.
- **B.** Meteorologist and Arborist each get their own pipeline address-map, framed as sub-parts of Cartograph (same publish-loop pattern, `ARCHITECTURE.md §1`).
- **C.** Lafayette Square gets a *different* artifact — a **dependency index**, not an authoring pipeline (it's a consumer/runtime composition surface). Shape clarifies as we work it.

`RIBBONS.md` folds in as-is for now (it's the Phase B deep chapter the §3.x refs point into); any physical merge is deferred to the larger data effort, not done in the motion that created this index.
