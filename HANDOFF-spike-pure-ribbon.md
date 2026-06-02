# HANDOFF — SPIKE: the pure-ribbon model (THROWAWAY concept validation)

**You are the dispatched agent.** Pick a name (one word, yours); sign your report with it. **This is a THROWAWAY concept spike, not production work** — its only job is to answer "does the pure-ribbon model hold?" on Jacob's eye. If it validates, a *later* brief builds it for real (unflagged, on LS, retiring figure-ground). Do not over-build; do not polish; do not commit anything you'd be sad to `git checkout --`.

**Agent: FRESH (cold).** New construction idea; no prior context is load-bearing.

**Reads first:** `HANDOFF-pipeline-reconception.md` (the program this may re-pour) · `HANDOFF-stroke-construction.md` (the stroke model this completes) · `cartograph/RIBBONS.md §1` (the figure-ground regime this proposes to *delete*).

---

## The hypothesis (Jacob, 2026-06-01) — the TILE model

Eliminate the asphalt/block distinction and figure-ground entirely. The map is **tiles that fit together perfectly**:

- **A tile = a face of the centerline graph. The centerlines are the grout** (shared tile edges). Graph faces partition the plane *by construction* — no gaps, no overlaps, nothing to reconcile.
- **Each tile is painted with strips, offset INWARD from its grout edges:** `asphalt (at the grout) | curb | treelawn | sidewalk | land-use (tile center)`. The road surface = the asphalt strips of the **two tiles sharing a grout edge**, meeting at the grout (asymmetric widths fall out — each tile offsets by its own side's half-width).
- **The construction = inward Clipper offsets of one closed ring** — the keystone you already have — except the ring is a **robust graph face**, not a fragile figure-ground block. No figure-ground, no complement, no block polygon.
- **Rounding lives on the STRIPS, not the tile** (Jacob). The tile stays **sharp** — it's topology; the grout meets at centerline nodes, which have no physical radius. The authored R is the **curb** radius → apply it at the asphalt strip's inner edge; outer strips round **concentrically** (R + their depth). The tile is never rounded.

⚠️ **Face extraction needs a clean, noded, typed planar graph — which is exactly what Phase 1 produced** (typed junctions, recovered Ts, junction-protected simplify). On **toy the graph is clean by authoring**, so the spike runs now; on LS the real build stands on the committed Phase 1 frame. (This is the Phase-1 payoff made concrete — note it in your report.)

If this holds, it dissolves: figure-ground (→ customs-flood, blockKey-drift, two-pass machine, two-source spine), the asphalt/block distinction, the corner-as-special-object (the 13-month saga), AND the open/3-point-polygon edge cases (target #3) — all from one idea.

## Why toy, and the hard caveat

Toy's clean orthogonal grid + simple blocks **isolate the mechanism** — a controlled intersection and a controlled interior, with none of LS's edge-case zoo confounding the read. **But toy passing is the FIRST read, NOT the gate.** A clean grid can make a construction look easy that LS's curves / divided carriageways / park / dead-ends then break. So: prove on toy → if it holds, the *next* step (not this brief) re-strokes a slice of real LS before anything is committed to the program.

## What to build (minimal, on the production path — NOT scratch SVG)

Per `[[feedback_toy_is_the_construction_spike_surface]]`: the production code path already runs on toy. Build the pure-ribbon construction as a **temporary, toy-gated branch in `src/lib/buildBlockGeometryV2.js`**, bake via `node cartograph/bake-ground.js --look=toy --scene=toy`, and view in the **Toy designer**. 

⚠️ **The toy gate here is EXPLICITLY TEMPORARY throwaway scaffolding** — it is *not* a kept scene-flag (we're killing those). If the model validates, the real build comes off the gate and replaces figure-ground for all scenes. Don't mistake this spike gate for a permanent parallel path.

Minimal construction:
1. **Extract tiles** = faces of toy's centerline graph (clean by authoring). Each tile = a closed ring whose edges are centerlines (grout). Toy's clean authored graph means face extraction is straightforward — a half-edge/DCEL traversal or any planar-subdivision face walk.
2. **Per tile, offset INWARD** from the grout by cumulative band depths (`asphalt-hw | +curb | +treelawn | +sidewalk`) → strips; the innermost remainder = LU. This is the keystone's inward-Clipper-offset-of-a-closed-ring applied per tile — reuse `dilateRings` (negative delta) + `differenceRings`.
3. **Round the strips, not the tile** (the design directive): apply the authored R at the asphalt strip's inner edge (the curb); outer strips concentric at R + their depth. Reuse the R-kit (`applyRoundCornersToRing`) at the strip level. **The tile stays sharp** — do not round the tile/face.
4. **Asphalt surface = union of all tiles' asphalt strips.** The intersection fills where the tiles meeting at a node each contribute their asphalt; the rounded curbs form the mouth — **don't construct the IX.**

## The things to SHOW (the validation targets — report each on Jacob's eye)

1. **Intersection fill.** At a toy grid crossing: does the asphalt fill as a clean **plus/cross** shape, with the four corners **rounding out of the curb join** (not a notch, not an overshoot)? *This is the make-or-break — the corner problem in new clothes.*
2. **Block interior flood.** Does a toy block's interior **fill with the LU band** where the surrounding ribbons' floods meet — no hole, no overlap seam?
3. **Edge-of-map / the open-polygon case** (Jacob, 2026-06-01 — a key claimed win). Toy's stencil is a rectangle, so a street running to the toy edge *is* the edge-of-map case. Confirm: the ribbon strokes what's there and the flood **clips cleanly to the stencil** — **no open/degenerate/3-point polygon**, because there's no subtraction demanding a closed block. Figure-ground's worst edge-case class should simply *not arise*. Show a to-the-edge street **and** a dead-end cap.

## Boundaries

- ❌ Throwaway — do **not** touch the production LS path, do **not** delete figure-ground (that's the real build *if* this validates), do **not** wire LU-identity/coloring perfectly (a hash/placeholder color is fine for the spike — the question is *geometry*, not color).
- ❌ Do not touch `design.json` or the canonical docs.
- ❌ Do not commit to `cartograph-looks-pass-ab` unless Jacob asks — keep the spike on the working tree / a scratch branch so it's trivially discardable.

## Gate (decision, not done)

Jacob's eye in the **Toy designer**: does the intersection fill and the corner fall out of the join? Does the interior flood? **Relief or trouble** — that's the deliverable, not a finished feature.

## Deliverable / report

- The three targets, each: what you saw (with the toy render), honest verdict.
- The single most important answer: **does this dissolve figure-ground, or does the intersection/flood break in a way that says "no"?**
- If it holds: the one-paragraph sketch of what the real (unflagged, LS, figure-ground-retiring) build would take — so Boz can re-pour the program.
- If it breaks: exactly where and why, so we don't chase it.

*Provenance: Boz, 2026-06-01. A concept spike that may re-pour `HANDOFF-pipeline-reconception.md`. Construction lineage: `HANDOFF-stroke-construction.md`.*
