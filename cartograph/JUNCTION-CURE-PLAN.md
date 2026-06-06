# Junction cure — the shared-root verdict + the polygon-first design

**Deliverable of `HANDOFF-e3-junction-cure-scope.md` (Voussoir, 2026-06-06). Spike only — no production geometry touched.** Forensics on the trunk post-E2 build (`f15017a` ribbons, production parity: `smooth:0`, `curbWidth:0.381`, `cornerRadiusScale:1`, design `blockCustoms`/overrides applied, mirroring `bake-ground.js:293`). Harnesses: `scratch/voussoir-{setup,census,join,ring,probe,spurwidth,corner,benton,steps,opposite,marks,svg}.mjs`; renders `scratch/voussoir-*.svg(.png)`. Validated against the 8 fresh marks (`marker_strokes.json`, 2026-06-05 22:53).

> **Verdict up front.** The operator's eye is right, with one refinement: **(a) the divided fold-at-join, (c) the perpendicular-join protrusion (Benton stem + the shape-level T-bulges), and the historic (b) false corner are ONE code root — the junction silhouette is never *constructed*; it is EMERGENT from independent constant-width chain strokes, so every width discontinuity at a node manufactures spurious geometry** (step / dip / scoop / scallop / tooth / spur — one family, enumerated below: **53 instances map-wide**). The trigger is **width discontinuity at the node**, not perpendicularity per se — perpendicular meetings are just where discontinuities live. One cure lands all three. **The band-fold thorn class is ruled OUT** — different layer (`sectionPass` `iW`, behind the wall), confirmed by render: the marked band-fold T's (Vail, Mackay) have *clean* block silhouettes. ⚠️ One honest caveat: some of Jacob's "T-base bulges" may be band-folds (the Section-layer "thorn opposite a T") rather than shape-level steps — the shape-level population is enumerated; anything he circles outside it goes to `HANDOFF-band-fold-fix.md`.

---

## 1. The forensics — each artifact, traced to its locus

### (a) The fold-at-join — post-E2 state: E2 cured the needle, NOT the join

Census re-run post-E2 (`voussoir-census/spurwidth.mjs`): **47 transition ends / 24 nodes** (Mercator/Alidade's enumeration holds). **18/24 nodes still carry >150° boundary spikes** — but they decompose into two distinct kinds:

1. **Zero-width degenerate spurs (w = 0.00 m)** — most spikes. The E2 merge patch fills the taper needle (verified: all probes inside asphalt at the Lafayette join, `voussoir-probe.mjs`), but its edges coincide *exactly* with the tile/chain edges, so the Clipper difference/union boundary **retraces the taper legs as a measure-zero spur from nose to node** (e.g. the asphalt hole at Mississippi×Lafayette runs nose-arc → `[174.8,225.5]` → node → back, all ON the chains). Quantization residue, sub-mm wide — render-hygiene risk (hairline cracks / triangulator stress), not visible area.
2. **Real folds + the curb STEP (w = 0.4–3.3 m) at ~10 nodes** — the visible defect. Where the carriageway's outer width ≠ the spine's same-side width, the per-run stroke **steps abruptly at the node** and the carriageway's taper makes its outer curb **dive inward** approaching it. Verified on render against the marks: mark #1 runs straight through a **3.85 m step** (laf-1/L 10.56 → laf-6/R 6.70 at `(481.9,272.1)`; the fillet rounds it into an S-bulge in the block edge, tile#11 iA arc at x≈478–483.6); mark #2 runs straight across the matching **north-curb dip**; marks #4–#7 trace S-Jefferson's curbs straight through its two **4.13 m steps** (`(-430.9,157.5)`, `(-465.3,362.5)` — 9.16 ↔ 5.03). The divided×divided node (`(-426.4,134.1)`, deg-6, marks #3–#5) adds **inter-pair slivers**: four corridors' per-pair merge patches converge with nothing constructing the shared interior → 0.7–1.1 m folds at the node center (tile#100 iA 159°).

**Locus:** the asphalt silhouette is assembled per tile from **independent constant-width butt-capped strokes** — `tileGround.js:919–924` (`strokeOpen(run.poly, edgeDepth(...))` per run, union, clip) — fed by `extractFaces` (`tileGround.js:297`) which walks the **raw chains, taper runs included**, as face boundaries; `filletRing` (`tileGround.js:88`) then rounds whatever silhouette falls out (R 4.5×scale, turn-tol 18°). No code anywhere knows "these two curbs are one curb." E2's constructor (`derive.js:3018–3220`) stops at the chains — the **outer** curb was never its scope, and its merge patch tapering to zero at the node is what leaves the spur.

### (b) The false corner — cured by data, residual is datum + identity

Post-D1/E1 production: nearest block vertex to the operator's true corners — **Mississippi×Lafayette NW 1.76 m** (was 40.7 pre-D1), **Park×S-18th 3.77 m** (was 6.60 pre-E1) (`voussoir-corner.mjs`). Jacob's live eye agrees ("the park corners currently look good"). The *mechanism* that fabricated it — `filletRing` cornering a taper-stub edge against the cross-street — is the same emergent-silhouette root as (a): the stub only ever reached the corner-builder because `extractFaces` feeds taper runs in as face boundaries. What remains is **D3 verbatim**: freeze the corner *identity* (which two straight legs corner) so the false corner cannot be re-born, plus the width datums.

### (c) The perpendicular-join protrusion — the width-step family, confirmed

- **Benton stem-joint** (`(58.7,-234.0)`): rendered (`voussoir-benton.svg.png`) — the east block edge carries a **scallop + notch** exactly where the stem (hw 5.49) hands to the loop leg (hw 3.96): the wider butt-capped stroke ends mid-air at the node, the narrower one continues, the wedge between them notches, and `filletRing` rounds the step corners into the scallop. **Same construction defect as (a)'s step, smaller numbers.** (Benton's node is *also* a 37° same-name kink — Bollard's list — so the joint stacks two defects; the width-step is the dominant visible one.)
- **The T-base bulges**: map-wide census of width steps at run boundaries (`voussoir-steps.mjs`): **53 steps ≥ 0.5 m**, three classes — **SAME-CORRIDOR 32** (divided joins + same-name chains: Chouteau 6.70 m(!), Papin, Geyer, S-Jefferson, Lafayette, S-18th, Benton), **SAME-STREET 16** (asymmetric L/R widths meeting at pendant tips: Nicholson, S-18th-3 in the park, Allen, California, Caroline, Eads), **COLLINEAR-X 5** (name-continuation joins: Truman↔Grattan — rendered, a visible 1.96 m tooth — Gravois↔S-12th). Every instance is the same shape-level signature.
- **Ruled out as the shape-level cause: doglegs and band-folds.** Far-side scan at all 141 T nodes (`voussoir-opposite.mjs`): only 3 far-side block deviations >1 m, **all on straight centerlines** and all explainable (median side / corner attribution) — there is **no systematic "bulge opposite the T" population in the block silhouette**. The "thorn opposite a T" that *does* exist is the **`iW` band-fold in `sectionPass`** (Bollard's Root A/B, ~115 junctions, behind the wall, corner-R-sensitive) — **a different root, unaffected by this cure, stays with `HANDOFF-band-fold-fix.md`.** Likewise §5a centerline doglegs (46 through-kinks) are a frame matter (`HANDOFF-name-logic-skeleton-pass.md`) — none coincide with the shape-level steps.

## 2. The verdict

**One root, one cure — with two adjacent classes explicitly excluded.**

| artifact | root | in the cure? |
|---|---|---|
| (a) fold-at-join: step / dip / spur, 24 transition nodes | emergent junction silhouette (un-constructed width discontinuity) | ✅ core |
| (c) Benton stem scallop + shape-level T/X steps (53 enumerated) | **same** — same code path, same signature | ✅ same construction, generalized trigger |
| (b) false corner (park corners) | same root historically; data-cured; identity unfrozen | ✅ D3 corner identity rides the same junction map |
| divided×divided inter-pair slivers (deg-6 nodes) | per-pair merge construction, no per-NODE apron | ✅ the apron (below) |
| `iW` band-fold thorns (~115) | `sectionPass` offset capacity — behind the wall | ⛔ OUT — band-fold-fix |
| centerline doglegs (46) | skeleton through-junction protection | ⛔ OUT — name-logic pass |

**The refinement on Jacob's framing:** "a path meeting another perpendicularly → protrusion opposite" unifies visually, but the code trigger is **the asphalt half-width changing across a junction node** — divided transition, same-name width change, authored per-side asymmetry at a tip, or name-continuation. Perpendicularity is incidental; "opposite" at the Section layer is the band-fold (excluded). The cure below therefore targets *every junction node with a width discontinuity on a continuous curb*, which covers every instance he circled in the (a)/(c) family.

## 3. The cure — construct the junction at prebake (polygon-first)

**Doctrine:** generalize `SKELETON.md §5e` from "corner the corridor outer-edge legs" to: **at every junction node, declare which curbs are CONTINUOUS, construct the junction's interior positively, and never let a taper or a stroke-end fabricate silhouette.** Identity at prebake, geometry at reshape (authored widths keep working). No tileGround chain-patch; this extends the **proven E2 pattern** (construct at prebake in `derive.js`, consume by identity in the shape pass).

**Per junction node, the prebake stamps (the junction map — `ribbons.junctions[]`-successor):**

1. **Curb-continuity pairs** — `(chainA, sideA) ↔ (chainB, sideB)` whose curbs are one physical curb through the node. Sources, all frame facts already carried: divided transitions via `phase.spineAtStart/End` + `pairKey` (24 nodes); same-name joins via `corridorName`/name (Benton, Geyer, Papin, Chouteau…); name continuations via `continuesAs` (Truman↔Grattan; note **Truman↔Lafayette at `(549.7,282)` has no `spineAt*` because the corridor *name* changes — the map must use `continuesAs`/collinearity there**, a gap found by the mark #0/#1 trace); pendant tips with L↔R asymmetry (the tip itself is the continuity point).
2. **De-taper windows** — per carriageway transition end, the station where gap-to-mate ≥ NOSE_GAP (E2's `s0` — already computed in the median constructor; reuse, don't re-derive). The block-side boundary inside the window is the **straight-body extension**, never the taper run.
3. **Corner identities (D3 verbatim, generalized)** — at nodes with cross-streets: `(legA, legB)` = the two post-de-taper straight curbs that corner. The four park-corner IXs are instances, not specials.
4. **The node apron** — ONE junction-interior polygon per node (not per pair): bounded by the constructed curbs/corners, spanning all incident corridors' merge windows. Positively asphalt (`kind:'merge'`-class). Kills the deg-6 inter-pair slivers AND the zero-width spurs (no more coincident-edge difference at the node — the apron's edges are the *constructed* curbs, offset from the chains).

**The geometry rule at shape time (reads the stamps + live widths):**

- A continuity pair's curb = offset of the de-tapered body, **width transitioning monotonically wA→wB across the merge window** — no step. Where the true curb is straight (the marks say it is at every marked join), correct datums make the blend degenerate to a straight line.
- Runs inside a de-taper window stroke the **de-tapered polyline**; the **transition wedge** (between the narrow stroke edge and the continuous curb) fills as junction asphalt.
- `filletRing` corners **identified legs only** at junction-construction nodes — the corner can never again be built from a stub (regression-proofs (b)).

**Why per-fe customs still work:** the stamps are *identities* (which legs join); widths resolve at shape time exactly as today (`runMeasure`, blockCustoms) — the wall stays where it is, and with **D2** the whole construction moves into the frozen face artifact unchanged (the stamps become face-boundary facts).

## 4. Foundation check — is E2's transition edge sufficient input?

**Yes, with three flags:**

1. **The merge needle's zero-width node tip** (E2 imperfection) sits exactly where E3 builds — but E3 **replaces** that geometry with the apron; it does not build on the tip. No touch-up needed first.
2. **The 69 m² S-18th median fragment** (bbox `x[649,658] z[-721,-705]`) sits **at the `(658.3,-726.7)` transition nose** E3 constructs against — absorb it into that node's apron or trim it in the same change. The other small piece (**53 m² Park Ave**, `x[-552,-544]`) is **mid-corridor** — NOT in E3's way; stays in the median-refine backlog.
3. **Nose stations (`s0`/`s1`) are the right interface** — computed once in the E2 constructor; E3 must consume them, not re-derive gap profiles (one nose truth).

E2's "edge wobble" (raw-chain median edges) does not gate E3: the cure consumes the *stations*, not the median's lateral edge geometry.

## 5. Validation against the 8 marks

`voussoir-marks.mjs` — per mark: residual to the **production** asphalt boundary vs to the **proposed** construction (de-tapered straight-body offsets, *current* authored widths). Median / p90, meters:

| mark | traces | production | proposed (current datums) | trace-implied datum |
|---|---|---|---|---|
| #0 | Truman-A / Laf-1 north curb | 0.67 / **2.50** | 0.81 / **1.06** | laf-1 L 10.56→~11.4 |
| #1 | Laf-6 + Truman-B south curb (through 2 joins) | 0.82 / 1.57 | **0.47 / 0.76** | laf-6 R 6.70→7.08 · laf-1 L→11.0 |
| #2 | Laf-5 north curb at the join | 0.20 / 0.56 | 0.35 / 1.11 | laf-5 R 6.86→6.52 |
| #3 | Laf×Jefferson SE corner region | 1.91 / 3.02 | 1.82 / 3.96 | laf-7 R 7.90→**9.63** (76 pt — a real ~1.7 m hole) |
| #4 | S-Jeff-B west curb @ step node | 0.97 | 0.87 | s-jeff-7 R 5.03→4.32 |
| #5 | S-Jeff-A east curb @ step node | 2.29 | 2.29 / 0.12 (2 pt) | s-jeff-5 R 5.34→**7.63** |
| #6 | S-Jeff-A @ Geyer | 1.50 | 1.09 | s-jeff-5 R→4.25 *(varies by station vs #5 — per-segment repair)* |
| #7 | S-Jeff-B west @ Geyer | 1.99 | 3.83 | ⚠️ contaminated: nearest geometry is `motorway-link-22` (d 2.1 m) — the ramp/north-void class, not cleanly a Jefferson-curb mark |

**Reading:** the structure is right — at the marked joins the proposed construction with *current* widths already meets or beats production p90 everywhere the mark is clean (the 2.5 m dip at #0 and the folds at #1 vanish; what remains is the width datum, extracted above = the E1-round-3 repair list). Same conclusion as Alidade's corridor spike, re-confirmed post-E1/E2 on fresh marks. (#3's corner region and #7's ramp adjacency need Jacob's eye on intent. ⚠️ numbers are proxy evidence; final verdict = the live tool.)

## 6. Decomposition → build steps

| # | step | what | depends | gate |
|---|---|---|---|---|
| **E3.1** | **The junction map (prebake identity).** Stamp per-node: continuity pairs, de-taper windows (reuse E2's noses), corner identities, apron spec. Extend the link beyond `corridorName` (use `continuesAs` — the Truman↔Lafayette gap). Absorb/trim the 69 m² S-18th fragment. **Geometry-neutral** (the 61930d7 pattern). | — (now) | A/B byte-identical; stamps count ≈ 24 transition nodes + same-name joins + 5 continuations |
| **E3.2** | **De-tapered strokes + transition wedges + aprons (shape pass).** tileGround consumes by identity (the E2 pattern): de-tapered run polylines, wedge + apron into `aFill`. Kills step/dip/scoop/tooth/spur. | E3.1 | `voussoir-census/spurwidth/steps` → 0 real folds, 0 steps on continuity pairs; marks ≤ §5 proposed column; **Jacob live**: Lafayette east join, S-Jefferson (marks 4–7), Benton stem, Truman↔Grattan, the deg-6 sweep |
| **E3.3** | **Corner identities into the fillet (D3).** `filletRing` corners identified legs only at constructed nodes. | E3.1–.2 | park corners hold ≤ datum bound; 24-node sweep; no regression at the 84 cross nodes |
| **E3.4** | **Datum repair, E1 round 3.** The §5 trace-implied widths (robust rows: laf-1 L→~11.0–11.4, laf-6 R→7.08, laf-5 R→6.52, laf-7 R→9.63; s-jeff per-segment). **Jacob's call** frame-side vs Survey-drag (E1 precedent). | any time | marks p90 → sub-meter everywhere clean |
| then | **E4 rip-out** (the DIVIDED-CORRIDOR-PLAN §7 ledger) after E3.2+.3 blessed; **D2 freeze** absorbs the stamps + construction into the frozen face artifact whenever it lands (E3 does not gate on it — the E2 consume-by-identity pattern carries until then). | E3 blessed | no behavior change |

**Out of scope confirmed:** band-fold (`iW`, own brief) · name-logic doglegs (own brief) · median lateral refine (parked) · brief F north-void (mark #7 brushed it — flag stands).

---
*Voussoir, 2026-06-06. Read-only spike; operator data read from the main tree; worktree synced to trunk `f15017a`. Note: the `alidade-*.mjs` harnesses cited by DIVIDED-CORRIDOR-PLAN are no longer in the main tree's scratch/ — the voussoir-* set re-establishes the validation surface.*
