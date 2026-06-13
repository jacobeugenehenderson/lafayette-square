# RIBBONS — archived Diary (closed failure modes + history)

**Migrated out of `cartograph/RIBBONS.md` 2026-06-12 (the Diary-winnow demonstrator).** This is **Diary** (past-as-narrative, non-authoritative) — the RESOLVED failure-mode archeology (§6.1, §6.2, §6.8, §6.9, §6.10) and the §7 History table, preserved verbatim a layer deeper so RIBBONS carries only live doctrine + open issues. Nothing here is current construction: LS runs the **tile model** (`tileGround.js` / `SECTION.md` / the tile ledger); these entries describe the superseded **figure-ground / mono-width** regime and its toy-era keystone. The load-bearing *invariants* these arcs produced live on in RIBBONS §1 ("INVARIANTS THAT SURVIVE THE REWRITE") + §3.9a — they were lifted to safety before this cut.

> **Why it's kept (not git-only):** the sequence is a readable forensic record of the 13-month corner saga — what was tried, what failed, why. Future reconstruction reads this; the live docs don't carry it.

---

## §6 — closed failure modes (RESOLVED)

### 6.1 Black ring around every block (the "L-strip") — RESOLVED 2026-05-17 (commit `9cf12c4`)

**Symptom:** a thick continuous dark band visible around every block's perimeter in Designer with Aerial OFF, sitting between the block face fill (e.g. park-green) and the asphalt edge. Most visually obvious at Lafayette Park because the authored polygon at `park-polygon.json` (halfWidth=175m, fence position) is materially smaller than the actual block silhouette extending to the asphalt edge (~±185m), exposing a ~4m wide strip of canvas-ground (`#2A2826` near-black). Same mechanism on every block where the polygonized face is smaller than the rounded block silhouette.

**Root cause (diagnosed via Jacob's hypothesis 2026-05-17, after Stage 1-3 chased the wrong target):** `buildBlockGeometryV2.js:2316` intersected each face's authored polygon with its owning blockRounded ring (`intersectRings([face.ring], [owning])`). When `face ⊂ owning` (the common case: authored polygons represent block features like fences or polygonized parcels that don't reach the asphalt edge), the intersect returned the SMALLER face → blockFill shrank to the face's extent → the ped-zone strip between the face's outer edge and the band-property-line had no fill underneath → canvas-ground showed through.

**This was a doctrinal violation.** Per §1: ribbons define the void by expressing inward from chains; the block IS whatever they leave over (= `owning` = blockRounded ring). The authored face is a LU LABEL, not a geometry source.

**Fix (3 lines, commit `9cf12c4`):** `const clipped = owning ? [owning] : (asphaltRounded.length ? differenceRings([face.ring], asphaltRounded) : [face.ring])`. The straddle-fallback (`differenceRings` against global `asphaltRounded`) is preserved for faces that span multiple blocks (rare on LS). Net effect: every blockFill extends to the rounded asphalt silhouette regardless of how small the authored face is.

**Lesson:** when a visible symptom looks like material trespass, also test for material absence (canvas-through). Aerial-toggle is the discriminator (canvas-gap shows aerial; opaque trespass stays opaque). Stage 1-3 burned a session anchoring on overshoot (H1, §6.2) before testing absence.

### 6.2 D.7a keying-system divergence: pass-2 `ringByKey` vs pass-1 `fe.blockKey` — RESOLVED 2026-05-17 (commit `48d8135`)

**Mechanism (exact):**
- `buildFrontageBands` (line 1374) builds `ringByKey` via `blockKeyFromRing(blockRoundedRing)` on each pass-2-derived rounded block ring — **pass-2 keys.**
- Each fe arriving has `fe.blockKey` set to the **pass-1** value (overwritten at line 2149: `fe.blockKey = p1.blockKey`) so `blockCustoms[fe.blockKey][fe.edgeOrd]` resolves to the same customs entry the operator wrote against pass-1 keys.
- **The two keying systems disagree for 295 of 506 straight fes (58%).** When pass-2 asphalt expansion shifts a bbox center past a 0.5m grid line, `blockKeyFromRing` rounds the pass-2 ring to one key while `fe.blockKey` carries the pass-1 key. `ringByKey.get(fe.blockKey)` returns undefined → clip block silently `continue`s → band rings emit unclipped. Unclipped offset polylines extend up to **8.306m** past the rounded silhouette (worst: Truman Parkway `653.5,-236.5`). 248 fes carry >0.5m overshoots repo-wide. This is the L-strip black mechanism in §6.1.

**Pre-existing back to `ed29700`:** latent defect from the D.7a customs migration. Never visible before because (a) opaque ribbons trespassing into the asphalt-color corner mouth blend with the asphalt, (b) Aerial-mode + clicking park-adjacent chains is the specific condition where the overshoot reads against a non-asphalt backdrop.

**Fix (Stage 3, ~15 LOC, commit `48d8135`):** per-fe containment resolution at clip time — for each fe, find the owning ring directly by interior probe + `pointInRing`, no key→ring registry. The registry indirection was the trap: registering rings under fe blockKeys collapses when multiple fes with DIFFERENT pass-1 blockKeys land in the same pass-2 ring — only the first wins. Dry-run validated: 257/295 drifted entries resolve to their true owner via containment.

**Lesson:** when a diagnostic dry-run validates a containment join, port the dry-run's algorithm directly; don't translate it into a registry pattern (an earlier registry sketch resolved only 144/295). Identity (which ring contains this fe's probe) beats geometric heuristic (find ring by key). H1 is a latent structural fix — it did NOT visibly close the L-strip (§6.1 was the face-clip doctrine violation, closed separately in `9cf12c4`); H1's overshoots had been masked by overlying asphalt + curb stroke.

### 6.8 Corner-interior regime emitter deviates from concentric doctrine — RESOLVED 2026-05-29 (V1 keystone, `025ee40`)

**Closed by:** the V1 keystone construction (`emitOneBlockRingBands` per §3.9a) retired the three-regime (ASYM / SYM-WITH-RAMP / SYM-NO-RAMP) arc-span emitter entirely. The corner is no longer constructed as a separate primitive — it's a slice of the two continuous Clipper-offset bands. *(Note per RIBBONS §1: this "RESOLVED" was true on toy's mono-width, never on LS; superseded by the tile model.)*

— Historical (pre-V1 keystone) record —

**2026-05-28 status update.** The HANDOFF-ribbon-corners.md uniform-width-model attempt aimed to resolve §6.8 by retiring the three-regime emitter and treating the corner as a single inward Clipper offset of `blockRounded` (`cw + W`). The arc landed (C0–C5 + post-C5 buildPedBand attempts) but the operator visual gate failed: the per-leg emitter's STRAIGHT-only partition continued to produce square outer corners at the rounded silhouette regardless of how the corner-emitter was shaped (see §6.10). Entire code arc reverted; §6.8 remained OPEN.

**Symptom:** at every IX corner the visible interior of the corner zone reads as a *constructed plug between two straight ribbons* rather than *continuous concentric arcs wrapping the silhouette*. Doctrine (§1): each band depth emerges as a nested inset arc around the same effective corner center — concentric, like a target. The three-regime emitter did not produce this on ANY corner.

**Audit (Stage 6, 2026-05-17, 355 arc-span entries on LS):** NEITHER-EMITTED 128 (36%), SYM-NO-RAMP 104 (29%), SYM-WITH-RAMP 98 (28%), ASYM 25 (7%) — **doctrine-correct: 0 of 355.** 8 ASYM corners were visible "treelawn drop" cases (operator authored tl + sw both flanks, regime dropped treelawn). Cusp guard fired on 22.5% of corners (vs 5% flag threshold).

**Resolution arc (Stages 7-12) → see §6.9 + the §7 History table.** Stage 7 retired the three regimes (concentric tapered, uncommitted); Stage 8 walked blockRounded (reverted — Bezier consume-span ate fe vertices, ~30% no emission); Stage 9 landed single-polygon symmetric corner pad over restored per-sharp-fe legs.

**Doctrinal note:** the figure-ground inversion (§1) was preserved because the visible corner geometry derives from blockRounded. The legs' source-from-sharp-fe was a pragmatic implementation choice — bounded by blockRounded via the H1 clip.

### 6.9 Corner-input-preparation produces non-uniform output across IX corners — RESOLVED 2026-05-29 (V1 keystone + V2-Measure)

**Closed by:** the V1 keystone's per-block scalar resolution (`bakeFeScalars` computes `blockScalars[blockKey].W` once per block from per-fe `fe.measure` through `blockCustoms` precedence) replaced the four-corner-records-each-with-its-own-input-preparation path. Datum's V2-Measure (`72cd0a7`) hardened it by making `blockCustoms` the canonical per-fe authoring target.

— Historical (pre-V1 keystone) record —

**Symptom:** at a single IX, the four corner records produce four different qualities of arc-span emission despite identical emitter code. Mississippi × Park: SW correctly empty, SE wrong-size pad, NE self-intersecting, NW correct-shape-at-60%-depth.

**Diagnosis (Stage 10 audit, `79fcd9e`, 666 corner records):** the variance is in input-preparation upstream of the emitter — four separate block-ring walks, each with its own flanking-meta resolution through `applyRoundCornersToRing` → `findAdjacentChainForBlockEdge` → per-flank lookup. Failure-mode histogram: ok 7.5%, no_match (vertex ≥0.5m) 26.6%, no_match (notConvex/smallR) 20.3%, flanking_skip 18.9% (doctrine-correct), **wrong_flanking 25.5% (dominant defect)**, selfint 1.2%, cusp_ramp_collision 0% (`RAMP_MIN_M=1.5` dead code under LS authoring).

**Stage 10.5 (`0bc0cd9`) — alley hypothesis REFUTED.** Of 388 `adj=null` flanks: 2.6% alley-bordered, 2.6% truly-void, 0% probe-bug, **95% structural** — 67.5% `adjacent_arc_span` (back-to-back arcs, no straight flank between), 27.3% `degenerate_span` (Bezier consume ate the straight to <2 vertices). The probe itself is not buggy.

**Doctrine settled for the corner ribbon (operator-confirmed 2026-05-18) — the AASHTO/ADA ramp pad:**
1. **Sidewalk material only** at the corner (the ADA curb ramp); treelawn ends at tA/tB on each flank.
2. **Depth = `max(d_A, d_B)`** where `d = cw + tl + sw` per flank.
3. **Uniform concentric annulus** across the whole arc tA→tB. No tapering, no angular step, no ramp-wedge.
4. **Both legs stop at tA/tB**; the corner ribbon takes over; legs resume.
5. **No cusp guard.** If `(R − max(d_A,d_B)) < 0`, honest weird shape — "self-intersection is signal, not error."
6. **`RAMP_MIN_M=1.5` inert on LS**, retired with the cusp guard.
7. Operator override = a future authoring channel.

This resolves the asymmetric-flanks question without tapering or per-corner authored depth: the corner ribbon is its own thing at its own (max-of-flanks) depth.

**Stage 11/12 arc (HEAD was `a7f2791`):** `silhouetteStraightEmitter` (sub-A + sub-A.1) walks blockRounded straight runs, kink-split at >5° for chain-tangent coherence; `buildFrontageBandsV2` Stage-9 pad still emitted arc-span pads (the compromise sub-B was meant to retire); sub-B (concentric arc-span emission) REVERTED in `a7f2791` ("worst failure yet" — refactored arc-run partition broke straight-run partition). Sub-B redo lessons banked: per-vertex perp on arc vertices breaks at depth≈R → must use true concentric arc emission `C + (pts[i]−C)·(R−d)/R`; don't touch the straight-run partition; no wedge/apex.

### 6.10 Per-leg straight-only emission produces square outer corners at the rounded silhouette — RESOLVED 2026-05-29 (V1 keystone, `025ee40`)

**Closed by:** the V1 keystone (`emitOneBlockRingBands`, §3.9a) dissolves the per-leg-straight-only partition entirely — walks the FULL `blockRounded` ring (Bezier samples + literal verts uniformly) via Clipper offsets at three depths. No straight-only partition, no per-vertex-perp at the partition boundary, no square-overshoot by construction. The 13-month foundation fault dissolved structurally. (Legacy `silhouetteStraightEmitter` lived on for LS until the C5 cutover.)

— Historical (pre-V1 keystone) record —

**Symptom:** at every IX corner the cream sidewalk traces a SQUARE 90° outer corner instead of following `blockRounded` concentrically; triangular cream slivers in the asphalt where the per-leg square edge overshoots the rounded curb.

**Mechanism:** `silhouetteStraightEmitter` partitioned `blockRounded` into STRAIGHT runs (Bezier samples excluded by `arcMeta.corner`) and emitted per-vertex-perp strips on straight verts only. When `applyRoundCornersToRing` smooths an IX corner, the last literal vertex before the consumed Bezier span sits BACK from the sharp corner → the strip's outer edge extends perpendicular from that vert → SQUARE overshoot past the rounded curb. The bug was **in the partition strategy of the per-leg emitter, not the corner emitter** — any separate corner-emitter sat inside the square overshoot and got occluded.

**Correct path (the spine of the eventual fix):** per-vertex-perp on the FULL `blockRounded` ring (Bezier samples INCLUDED) at each vertex's authored depth → the strip wraps the rounded corner concentrically BY CONSTRUCTION, no separate corner emitter. Origin-fe per vertex falls out structurally by extending `applyRoundCornersToRing` to expose the consumed sharp-vertex range per Bezier span (not per-vertex coord-match, which broke at shared corners + stencil-clipped verts → 25.6% coverage).

**Ruled out (don't re-explore):** wall enforcement (held, not the bug); T-junction coord-sharing (fixed class); skeleton precision (clean); asphalt-union sub-pixel gaps (architecture handles by design); per-vertex coord-match tagging; global-W pedBand + figure-ground residual (invented un-authored surface); per-vertex-perp arc-span at flanking depth (inherits the upstream square overshoot).

---

## §7. History — what we tried and what we learned

| Date | What | Status | Lesson |
|---|---|---|---|
| pre-2026-05-06 | V1 corner stack: `buildCornerPlug`, `buildCurbAnnulus`, `intersectionGeometry.js`, per-corner annular sectors | Retired in `0286cb1` | Per-corner constructed primitives don't generalize across IX shapes and width combinations |
| 2026-05-06 | Phase 1+2 corner-authoring kit (global × per-IX × per-corner) | SHIPPED | 3-tier authoring is the right shape; per-IX dot was the drift fixed 2026-05-14 |
| 2026-05-06 PM | IP-rule switch attempt | Aborted | Rounded-block-clip is the right model; IP-rule was a parallel path |
| 2026-05-10 | D.1/D.2/D.3a shipped; D.3b+D.3c bundled attempt rolled back | Replanned | Bundle-test-debug fails when sub-phase doesn't decompose; `feedback_d3_bundling_failure_modes` |
| 2026-05-10 EOD-3 | D.3c polygon-walking + D.5/D.6 customs migration | SHIPPED | Per-block-edge customs replaces per-chain-segment customs; identity by `(blockKey, edgeOrd)` |
| 2026-05-11 EOD-2 | D.7 walker identity-driven + D.7a customs flow through corners | SHIPPED | Corner detection by chain-identity-change, not turn angle |
| 2026-05-16 | Phase A: polygon-edge-Q replaces tangent-Q | SHIPPED | Corner records computed off polygon edges, not extended chain tangents |
| 2026-05-16 | Phase A.6: dir-sign perp flip in `buildLegSidePolyline` | SHIPPED | Bisector-perps must match emitChain's sign convention |
| 2026-05-16 | Phase A.7: Douglas-Peucker on asphalt rectangles | SHIPPED then RETIRED | Bezier corners made this structurally unnecessary |
| 2026-05-16 | Bezier corners replace `arcReplaceVertex` + 49% maxInset clamp | SHIPPED (`7db2d32`) | Bezier is shape-agnostic about polygon-vertex density; the dense-corner problem dissolves |
| 2026-05-16 | Phase 1: multi-vertex Bezier consumption (consume-span walker) | SHIPPED (`ed29700`) | Two-pass span-aware walker eliminates angular kinks adjacent to Bezier insertion |
| 2026-05-16 | Phase 2: round-block swap + three-regime emitter + chain-era plug retirement | SHIPPED (`30f7c7e`) | Structurally satisfies `feedback_corner_pad_continuity_first` — but bundled spine rewrite broke 70 SELFINTs |
| 2026-05-16 | Phase 2.1: per-corner asphalt-fillet attribution | SHIPPED (`b9cb11c`) | Phase 2's deletion of `cornerAsphaltPlugs` was incomplete — fillet residual against per-chain rectangles still needs attribution |
| 2026-05-16 | Phase 2.2: morphological closing on curb stroke | REVERTED (`c360fc2`+`3a80549`) | Dilate-erode precision tax cascades; structurally wrong, not tunably wrong |
| 2026-05-17 | Phase 2-arc cusp guard: scale tl/sw when `cw+tl+sw > 0.9·arcR` | SHIPPED (`8956ffa`) | Inward-offset arc cusps onto itself when offset depth ≈ arcR; 0.9× working but not tight enough |
| 2026-05-17 | Phase 2-arc revert: restore per-sharp-fe straight-span alongside arc emitter | SHIPPED | The spine intent ("everything from blockRounded") collided with Clipper precision on long offset polylines; doctrine permits both halves |
| 2026-05-17 | Stage 1-2 diagnostics — L-strip black symptom | DIAGNOSED | H1 (blockKey drift) dominant; Stage 1's 91.9% overshoot was a `pointInRing` probe artifact (use signed-distance ≥0.01m epsilon); defect pre-existing to `ed29700`, not a regression |
| 2026-05-17 | Stage 4: block face fill uses `owning` not `intersectRings(face, owning)` | SHIPPED (`9cf12c4`) | Closed the black-ring (§6.1). Visible-material-absence vs visible-material-trespass look similar with bands above; Aerial-toggle discriminates in 30s |
| 2026-05-17 | Stage 5: H1 per-fe containment ring resolution | SHIPPED (`48d8135`) | Closed §6.2 as a latent structural fix; did NOT visibly close any corner symptom (overshoots masked by overlying asphalt+curb). "Corners jacked" is corner-interior — a separate class |
| 2026-05-17 | Stage 6: corner-regime-emitter audit (355 arc-spans) | DIAGNOSED | 0 of 355 doctrine-correct concentric. Three-regime emitter structurally wrong, not occasionally — rewrite indicated, not tuning |
| 2026-05-17 | Stage 7: concentric tapered arc-span emission | SHIPPED-then-REVERTED (uncommitted) | Geometry correct but overlapped per-sharp-fe straight bands' sharp inner edges ("vestigial chain offsets") — wrong architectural layer for the visible problem |
| 2026-05-17 | Stage 8: walk blockRounded for all band emission | SHIPPED-then-REVERTED (uncommitted) | Bezier consume-span absorbed interior fe vertices; ~30% of fes emitted nothing. Bezier consume-span structurally incompatible with per-fe-coverage straight emission |
| 2026-05-18 | Stage 9: single-polygon symmetric corner pad over per-sharp-fe legs | SHIPPED (`3cafe7f`) | **Doctrinal pivots need empirical validation at each sub-step before bundling**; Stage 8's ambition lost to a coverage gap invisible in numerical audits — visual smoke test between sub-changes, not at session end |
| 2026-05-18 | Stage 10 + 10.5: corner-input-prep audits (666 records) | SHIPPED (`79fcd9e`, `0bc0cd9`) | **Hypothesized taxonomy needs audit validation BEFORE fix design** — `cusp_ramp_collision` fired 0/666 (dead code); `no_match` not a tunable-TOL bucket; alley hypothesis refuted (95% structural) |
| 2026-05-18 | Stage 11a + 11a.1: meta-resolution ring-walk; partition-artifact vs authored-zero | SHIPPED (`44ca974`, `e710441`) | Numerical clean ≠ visually clean; `feedback_partition_artifact_vs_authored_zero` — unified "no flank meta" handlers conflate slot-doesn't-exist with operator-authored-zero; floating geometry adjacent to bandless legs is the visible tell |
| 2026-05-18 | Stage 12 sub-A + sub-A.1: silhouette-walking straight emitter + kink-split | SHIPPED (`e000b75`, `54d5e8b`) | `feedback_per_vertex_perp_needs_chain_tangent_coherence` — partition emit-runs by chain-tangent coherence; blockRounded "straight" verts include non-corner IX kinks that are bisector-perp-incoherent |
| 2026-05-18 | Stage 12 sub-B: concentric arc-span emission + Stage 9 pad retirement | REVERTED (`a5c1844`→`a7f2791`) | When a sub-phase produces both an intended + an inadvertent change, the visual failure confounds — probe-instrumented diagnosis needed. AASHTO/ADA doctrine settled (see §6.9) |
| 2026-05-18 | Doctrine pivot: corner ribbon = AASHTO/ADA ramp pad | DOCTRINE SHIPPED | Doctrinal questions spiral when the answer is "real-world AASHTO/ADA standards" — anchor on accessibility-engineering doctrine, not abstract geometry. The corner IS the curb ramp; sidewalk-material-only at max-depth |
| 2026-05-29 | V1 keystone — `emitOneBlockRingBands` ships on toy (Quoin) | SHIPPED (`012ea2a`→`e8d9b44`) | Three Clipper inward insets of `blockRounded` (`cw`/`cw+TL`/`WB`); two annular bands; per-span sectors slice for material tags; `jtMiter` preserves R=0 squares; capacity guard vs W-past-medial-axis inversions. *"ribbon monowidth, strips variable."* `feedback_boz_overengineered_for_imagined_authoring_complexity` |
| 2026-05-29 | V1.5 per-leg material swap — ctrl-click flips strip material | SHIPPED (`404e949`, `1bfac2f`) | `m.measure[side].materials={outer,inner}` per leg; corners stay all-SW per AASHTO; legacy collapse/insert gestures retired |
| 2026-05-29 | V2-Measure polygon-only authoring (Datum) | SHIPPED (`72cd0a7`, −193 LOC) | `chain.measure` becomes read-only; all writes target `blockCustoms[blockKey][edgeOrd]` per-fe; whole-chain mode fans per-fe; `feedback_vestigial_ux_is_a_wall_violation` |
| 2026-05-30 | V1.6 — pass-2 ring-index parity + per-block capacity guard + toy reset (Trammel + Stadia) | SHIPPED (`2607763`, `52d7f9e`, `cf24cb7`, `ea7c754`) | Per-block capacity guard clamps `WB ≤ 0.9·inscribed_capacity`; `feedback_no_corner_radius_clamps_in_emit` refinement (geometrically-meaningful degeneracy vs garbage); `buildChainBandsLive` migrated to keystone alignment (`67e02e0`) |

*Provenance: migrated from RIBBONS.md v0.9 (last updated 2026-05-31) on 2026-06-12.*
