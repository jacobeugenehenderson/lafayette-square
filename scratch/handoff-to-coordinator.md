# Handoff to Coordinator — Phase 2-arc full session report

**Session date:** 2026-05-16 → 2026-05-17 (overnight).
**Local branch:** `cartograph-looks-pass-ab` at `8956ffa`. **13 commits ahead of origin; not pushed.** Jacob explicitly held the push pending visual sign-off, which never closed cleanly.
**Operator:** Jacob, going to bed. Wants this report so a fresh coordinator can pick up tomorrow without re-deriving context.

---

## TL;DR

The full corner-geometry arc (A.5 → A.6 → A.7 → Bezier → Phase 1 → Phase 2 → 2.1) landed the doctrinal end-state — block-as-positive-space, round-block-not-asphalt, Bezier corners, three-regime arc-span emitter, per-corner asphalt-fillet attribution. **The corner work is real and worth preserving.** But Phase 2 also rewrote the ribbon-emission spine (`buildFrontageBands` → `buildFrontageBandsV2`), and the rewrite produced system-wide ribbon disruption — 70+ self-intersecting band rings repo-wide, visible at Lafayette Park as opaque-black bands along the interior perimeter where translucent ribbons should be.

**Pending decision:** Jacob blessed the hybrid-revert framing (keep corner work, restore the pre-Phase-2 straight-span emitter) verbally but stopped the implementation before any code changes. He explicitly said "no patches." Next session resumes from that decision point.

---

## Commit history this session (`ed29700` → `8956ffa`)

```
8956ffa Phase 2-arc: park-corner band cusp guard       ← baby fix; cusp SELFINT solved, spine still broken
3a80549 Revert "Phase 2.2: curb stroke smoothing..."   ← reverted morphological-closing curb attempt
c360fc2 Phase 2.2: curb stroke smoothing (REVERTED)    ← cascade through Clipper precision; structurally wrong
b9cb11c Phase 2.1: corner ribbon outer face            ← per-corner asphalt-fillet attribution, fixed Phase 2's overzealous deletion
30f7c7e Phase 2: Path-B three-regime emitter + plug retirement  ← round-block swap, regime emitter, retired chain-era plugs (deletion bug here)
ed29700 Phase 1: multi-vertex Bezier consumption       ← pre-Phase-2 baseline
```

Bake artifacts in `public/baked/{default,lafayette-square}/` reflect `8956ffa` for default look only; LS look's bake is stale (baby skipped LS re-bake — would need follow-up bake if the cusp guard stays).

---

## What's salvageable (the corner solution — preserve)

The doctrine endorses ALL of this. FEATURES line 23 ("blocks are positive space; streets are the void around them") was the load-bearing claim Phase 2 finally honored structurally. Don't back this out.

1. **Round-block swap** (`30f7c7e`). `applyRoundCornersToRing` runs on each `blockSharp` ring; `asphaltRounded = stencil − blockRounded` falls out. The rounded asphalt mouth at every IX emerges inherently from the negative-space subtraction.
2. **Winding-aware convexity check.** `cross * ringSign > 0` filter works on either ring direction; selects block-convex corners regardless of ring winding.
3. **Bezier output reversal for block-CCW walk order.** Pass-2 emission reverses + inverts arcPositionFrac so the Bezier samples align with block-CCW walk (which arrives via tB-edge, departs via tA-edge — opposite of asphalt-CCW).
4. **arcMeta sidecar** from `applyRoundCornersToRing`. `{ ring, arcMeta }` where `arcMeta[i] = { corner, arcPositionFrac } | null` tags each output vertex with its corner identity. Drives the regime emitter.
5. **Three-regime arc-span emission** in `buildFrontageBandsV2` for corner geometry:
   - **ASYMMETRIC** (|d_A − d_B| > 1.0m OR min/max < 0.7): single sidewalk plug across whole arc, sharp angular step at midpoint.
   - **SYMMETRIC-WITH-RAMP** (both legs tl+sw, depths match): concentric tl + sw bands outside ramp window; sidewalk-material wedge spanning full ped-zone depth inside ramp window. Ramp = min(2.0m, 0.4 × arc_length); skip below 0.5m floor.
   - **SYMMETRIC-NO-RAMP** (both legs sidewalk-only): single sw band across arc.
6. **Per-corner asphalt-fillet attribution** (`b9cb11c`). `attributeFilletResidualToArcs` computes `asphaltRounded − union(per-chain asphalt)` and attributes each polygon to its nearest corner record's arc-span frontageBand entry (or top-level `cornerOrphanAsphalt` orphan list). Restores the asphalt fill that Phase 2's `cornerAsphaltPlugs` deletion accidentally removed.
7. **Cusp guard** (`8956ffa`). When `max(cw + tl + sw) > 0.9 · arcR` at a corner, scale tl/sw proportionally so the offset arc doesn't fold onto itself. Fixes the 4 arc-span SELFINTs at Lafayette Park's corners. R is threaded through arcMeta to make the guard self-contained.

All six items satisfy `feedback_corner_pad_continuity_first` ("corner must be derived from same source as the legs, never a separate primitive") structurally — the regime emitter produces the corner-pad/ramp/asym geometry as part of the same band machinery, not as separate constructed primitives.

---

## What's broken (the spine — must fix)

Phase 2's `buildFrontageBandsV2` STRAIGHT-SPAN emission path. The rewrite walks `blockRounded` and groups all T-intersection vertices on a block side into ONE big straight-span (versus pre-Phase-2's per-sharp-fe emission: many short fes per block side, one per T-intersection segment). The resulting long offset polylines + `closeBandRingV2` produce self-intersecting rings.

**Evidence:**
- Baby's repo-wide scan (`scratch/all-band-selfint-scan.js`): 70 self-intersecting band rings across all blocks. Mix of straight-span SELFINTs (in `closeBandRingV2`) and tiny residual arc-span cusps (the cusp guard didn't reach the smallest-R corners).
- Operator-reported visible bug at Lafayette Park: ribbon zone along park's interior perimeter renders as opaque BLACK in Measure mode. Aerial-through-translucent-ribbon should show (per `FEATURES:173` + `NOTES:3569-3571`). Black = no geometry emitted; canvas-black shows through the face-hidden zone.
- Jacob's framing: "every single ribbon is disrupted" — the park is the most visually obvious instance because of the aerial backdrop, but the failure mode is system-wide.

**Why pre-Phase-2 worked:** the spine emitted bands per-sharp-fe (one fe per T-intersection segment, short polylines, easy offset, no SELFINT). Then clipped to `blockRounded` per-block to handle rounded-corner overshoots. The straight-corner-to-straight-corner span was bounded by chain-identity transitions, never by Bezier endpoints. Phase 2's "walk blockRounded with arcMeta and emit one big band per straight span" was a doctrinal aesthetic move (all emission flows from blockRounded), but the long offset polylines hit Clipper precision and produced SELFINTs en masse.

---

## The salvage plan Jacob blessed but did not yet ship

**Hybrid revert (Option #3 in coordinator-Jacob conversation):**

- **Keep:** the corner solution (all 6 items above).
- **Restore:** pre-Phase-2 per-sharp-fe straight-span band emission. The function existed at `ed29700:src/lib/buildBlockGeometryV2.js` as `buildFrontageBands(streets, frontageEdges, curbWidth, blockRounded, blockCustoms)`. Walks each `fe` in `frontageEdges` (sharp fes from `buildFrontageEdges`), emits tl + sw band rings at depths `[cw, cw+tl, cw+tl+sw]`, clips per-block to `blockRounded`. Output shape: `{blockKey, edgeOrd, chainIdx, side, points, treelawnRings, sidewalkRings}` per fe.
- **Modify `buildFrontageBandsV2`:** strip the straight-span branch (don't push entries for straight spans). Keep the arc-span branch (regime emitter, cusp guard, depths/regimes intact). Output remains: `{blockKey, edgeOrd, chainIdx, side, corner, treelawnRings, sidewalkRings, asphaltRings: []}` per arc.
- **Main pipeline:** call both functions; concatenate the two output arrays into `frontageBands`. Then `attributeFilletResidualToArcs` runs unchanged (it only attributes to entries with a `corner` field, which are exclusively arc-span entries).

**Why this works doctrinally:** the doctrine doesn't prescribe a single function; it prescribes block-as-positive-space and per-block-edge polygon-walking. Pre-Phase-2's per-sharp-fe emission satisfies polygon-walking via the sharp ring's per-chain-identity slices. Arc-span emission via the rounded ring + arcMeta satisfies the corner-as-property-of-the-rounded-silhouette doctrine. Both halves are valid, both halves are needed.

**Implementation surface:** ~150 LOC. One file (`src/lib/buildBlockGeometryV2.js`). One commit + trinity touch + re-bake both looks.

**Why coordinator-Claude was halted:** Claude began the surgical edit by injecting the restored `buildFrontageBandsStraightV1` helper above `buildFrontageBandsV2`. Jacob said "No" and asked for this report instead. Likely concerns to surface for the next coordinator:
- Whether to rename the function or restore the old name (`buildFrontageBands`).
- Whether the depth convention should be `[cw, cw+tl, cw+tl+sw]` (pre-Phase-2) or `[0, cw+tl, cw+tl+sw]` (Phase 2 "extend-to-asphalt"). They currently match in the V2 code — both use `cw + tl` and `cw + tl + sw` — so this is a non-issue, but worth confirming the restored helper uses the same convention as the arc-span emitter to avoid a visible width seam at the corner-to-straight transition.
- Whether to split into two separate output collections (`frontageBandsStraight` + `frontageBandsArc`) or concat into one (`frontageBands`). Concat is simpler; consumers (bake-ground.js, BlockGeometryV2Debug.jsx) iterate field-by-field and don't need the split.
- Whether the cusp guard still applies (it does — arc-span emission is unchanged).
- Whether `closeBandRingV2` should be retained at all (it's only used inside the V2 arc-span branch now; the restored helper has its own inline `closeRing` closure).

---

## Full session arc — what we did and why

### Phase 2 (commit `30f7c7e`) — landed 2026-05-16 early evening

Dispatched as a baby with brief "Path-B three-regime emitter + chain-era plug retirement." Three bundled changes:

1. Round-block swap (per FEATURES line 23 doctrine).
2. New regime emitter walking blockRounded + arcMeta.
3. Retired `cornerAsphaltPlugs`, `cornerSidewalkPads`, `buildCornerPadQuad`, `cornerPadUnion`, PAD INVARIANT canary.

Baby surfaced flags including a "band depth convention" divergence (brief said extend-to-asphalt; baby shipped cw-inset to preserve operator-authored visible widths). Bake delta vs Phase 1: −1 group, −1.1% verts, −0.7% tris, −0.8% size; determinism preserved.

### Phase 2.1 (commit `b9cb11c`) — landed 2026-05-16 evening

Phase 2 deleted `cornerAsphaltPlugs` based on incomplete diagnosis. The per-chain asphalt RENDERING is via `byChain[*].asphaltRings` (rectangles with square ends at IXs), which left a fillet residual against `asphaltRounded`'s rounded silhouette. Phase 2 dropping the math produced visible black voids at every IX corner.

Path (b) fix: re-derive the global residual after `buildFrontageBandsV2`, attribute each polygon to its nearest corner record's arc-span frontageBand entry (`FILLET_ATTRIB_MAX_M = 8m`), push orphans to `cornerOrphanAsphalt`. Both routes render as asphalt material. `cornerAsphaltPlugs` did NOT come back as a separate top-level output — the same area is plumbed through per-corner emission.

Bake delta vs Phase 2: +1.8% verts, +1.0% tris, +1.3% size; determinism preserved.

### Phase 2.2 (commit `c360fc2`, REVERTED in `3a80549`) — landed and reverted 2026-05-16 late evening

Attempted morphological closing on curb stroke (`dilate(rawCurb, 0.08m) → erode(rawCurb, 0.08m)`) to fill Clipper-precision sliver gaps on long curved chains. Operator screencapped LS at `c360fc2` and the visible result was WORSE than Phase 2.1: dilate-erode cycle's precision tax cascades through Clipper into adjacent block geometry via shared boundary edges, producing black voids in block interiors AND leaving the curb stroke still missing on long curves. Structurally wrong, not tunably wrong. Reverted.

Proper fix queued: Path (b) polyline-offset stroke (`Clipper.OffsetPaths` with `EndType.etClosedLine` + `JoinType.jtRound` on the asphalt boundary directly). Bypasses polygon-vs-polygon Clipper ops at the stroke output entirely.

### Measure-tool diagnosis sidetrack — 2026-05-16 night

After 2.2 revert, operator reported Measure tool "no longer works." Coordinator-Claude attempted static diagnosis of MeasureOverlay's V2 data-flow → no breakage found in code. Spent multiple turns with Jacob attempting browser-console probes:
- Tool state, store reads, canvas pointerdown listener — confirmed canvas receives pointerdown.
- Eventual conclusion: clicks DO register, but produce "wrong area reveals aerial" — which led to the park-visual investigation.

**Outstanding from this sidetrack:**
- `MeasureOverlay.jsx:777-783` has `onDblClick → deselectStreet()`. Per `NOTES:3549-3551` spec, double-click should insert a stripe split (treelawn/sidewalk boundary), NOT deselect. Spec divergence; cosmetic; surface-only — defer.

### Park visual investigation — baby dispatched (commit `8956ffa`) — 2026-05-17 early morning

Dispatched a focused baby on "Lafayette Park band-validity confirmation + targeted fix." Three branching outcomes: (A) bands degenerate, (B) bands valid but rendering broken, (C) bands valid but mispositioned.

Baby's findings:
- **Outcome (A):** 4 of 8 Lafayette Park frontageBand entries (the arc-span entries at park corners) emitted 34-vert sidewalk rings with self-intersections at indices 16,18 or 16,19. The other 4 straight-span entries were "clean" per entry-count check (but see system-wide finding below).
- **Root cause:** park-side ped-zone depth (cw+tl+sw ≈ 6.6m) marginally exceeds authored corner radius (R ≈ 6.4m); inward offset arc cusps → ring self-intersects → triangulates as opaque-black.
- **Fix:** ~25 LOC in `src/lib/buildBlockGeometryV2.js`. Threaded R through arcMeta; added cusp guard at top of buildFrontageBandsV2 arc-span branch that scales tl/sw proportionally when cw+tl+sw > 0.9·R.
- **Surfaced not fixed:** repo-wide scan finds **70 self-intersecting rings across all blocks** — mix of straight-span (untouched by this fix; separate failure mode in `closeBandRingV2`) and tiny residual arc-span cusps. Pre-existing per baby's framing; out of scope per the brief.

**Operator visual check post-fix:** "Black bands still there." Cusp guard solved the arc-span SELFINT but did NOT address the visible bug. Coordinator-Claude initially proposed Dispatch 1 scoped to Lafayette Park; Jacob corrected: "every single ribbon is disrupted, this is just one thing and feels like an unnecessary goose chase when the problem is widespread." That re-scoped the diagnosis from "park only" to "system-wide spine breakage" — pointing directly at the baby's 70-SELFINT surface as the actual answer.

### Decision conversation — 2026-05-17 pre-dawn

Coordinator-Claude proposed three options:
1. **Rescope dispatch to system-wide diagnosis** (Option 1 in conversation).
2. **Full revert to Phase 1 `ed29700`** (Option 2).
3. **5-min visual diff at Phase 1 before deciding** (Option 3).

Jacob: "I'm *praying* we can save our corner solution, we *finally* did it, the problem is effectively solved. We can't have broken the spine of the tool to do it."

Coordinator-Claude framed the hybrid revert (Option #3 in a later message — confusingly numbered): keep corner work, restore pre-Phase-2 per-sharp-fe straight-span emission. Jacob asked coordinator to read trinity for Measure-tool spec to confirm the framing held doctrinally.

Coordinator read FEATURES line 173 + NOTES 3551-3577 + NOTES 11.3 + Authority Stack (4459-4467). Doctrine reads cleanly in favor of hybrid revert: blocks-as-positive-space endorses round-block; per-block-edge ribbon emission is the spine; reverting to per-sharp-fe straight-span emission restores the spine without touching corner doctrine.

Jacob blessed verbally: "can we just make the fix now?" Coordinator began executing — injected the restored `buildFrontageBandsStraightV1` helper above `buildFrontageBandsV2`. Jacob halted with "No" and requested this report.

**Best guess on the halt reason:** the implementation moved without coordinator-Jacob doing a final framing-check. Jacob may want a different shape (e.g., restore the original function name without rename; different function-split structure; different output-array structure). Surface to fresh coordinator to ask before re-executing.

---

## Other findings to carry forward

### Phantom park[0] (separate long-standing gremlin — surfaced by prior baby, not fixed)

`cartograph/classify.js:60` stamps `type='park'` on any face whose centroid falls inside an overlay tagged `leisure=park` **OR `leisure=garden`** (or grass / recreation_ground). OSM has 245 `leisure=garden` features in this neighborhood (residential front yards, courtyards) plus 3 real `leisure=park` (Lafayette, Buder, Eads).

First-match-wins centroid test: a large polygonization "face" whose centroid happens to fall inside any one of 245 gardens gets stamped `'park'`. park[0] is concretely: a large 470 m × 420 m polygonization face the chain network couldn't subdivide (chains have gaps west of Lafayette Park), centroid lands in a garden, gets stamped park, paints green where it shouldn't.

**Fix (clean, ~3 LOC):** narrow `'park'` overlay bucket in `classify.js:60` to actual parks only; drop `leisure=garden` from that bucket (gardens should fall through to `recreation` or the OSM_TO_LU vote).

**Status:** queued as Dispatch 2 of the night, never dispatched. Independent of the spine fix.

### Curb stroke gaps (still queued — Path b polyline-offset)

The curb stroke (`differenceRings(dilateRings([asphaltRounded], cw), [asphaltRounded])`) produces sliver gaps on long gentle curves where the dilate-difference boundary computation hits Clipper precision. Visible at LS on Mississippi-class curved chains.

Phase 2.2's morphological-closing attempt was structurally wrong (cascades into adjacent geometry). Path (b) polyline-offset stroke (`Clipper.OffsetPaths` with `EndType.etClosedLine` + `JoinType.jtRound` on the asphalt boundary directly) bypasses polygon-vs-polygon Clipper ops at the stroke output entirely. **Queued for fresh dispatch.**

### D.7a blockKey drift on frontageBands (latent, not causal here)

Lafayette Park's `frontageBands` are keyed at `blockKey="2.5,0.0"` while the `frontageEdges` (after pass-2 backfill) are keyed at `blockKey="3.0,0.0"`. Classic D.7a drift per `feedback_d7a_blockkey_drift`. Downstream consumers matching by `(blockKey, edgeOrd)` would see zero overlap.

Designer / bake adapter don't currently filter bands by blockKey (they centroid-probe for LU lookup), so this is silent today. Latent for future consumers. Fix (when needed) follows the same pass-1-key-backfill pattern that `feedback_d7a_blockkey_drift` says was done for `frontageEdges`.

### MeasureOverlay double-click spec divergence

`MeasureOverlay.jsx:777-783` reads `onDblClick → deselectStreet()`. NOTES spec (3549-3551) says double-click should insert a stripe split. Spec divergence; cosmetic; surface-only.

### Trinity housekeeping (still queued for after the corner arc closes)

- FEATURES corner-section comprehensive rewrite (lines 76-104 corner-plugs + anti-patterns subsections still describe the pre-Phase-2 model; current `[PHASE 2 SUPERSEDED]` marker is a placeholder).
- NOTES sub-entry consolidation: A.5 / A.6 / A.7 / Bezier-shipped / Phase 1 / Phase 2 / Phase 2.1 / 2.2-reverted / 2-arc cusp guard → single coherent "corner emission v2" entry.
- Stale-comment cleanup in `cornersAtIx` (3 docblocks reference retired `buildCornerPadQuad`) + `CornerEditHandles.jsx` + `CartographApp.jsx`.
- Branch push (13 commits ahead of origin; pending end-of-arc sign-off).
- Stash drops (`stash@{0}` binned-stabilizer-revert-pre-phase1, `stash@{1}` pre-stabilize isolation — both untouched throughout the session; orchestrator's call when to drop).

---

## Working tree state

```
$ git status --short
 M src/data/ribbons.json     ← Jacob's in-flight Designer measure edits; PRESERVE
?? scratch/                  ← 12 .js probes + 1 .svg + this .md; coordinator GC at end
```

`src/data/ribbons.json` has 8 lines changed (pavementHW values + `symmetric: false` flag). This is Jacob's working-session authoring data. Per `feedback_stash_isolate_per_file`, do not touch — it's not part of any Phase 2-arc commit.

`scratch/` contains:
- `handoff-to-coordinator.md` (this file)
- `park-band.svg` (baby's pre-fix park visualization — useful for visual reference)
- `all-band-selfint-scan.js` (the repo-wide SELFINT scan that found 70 rings — important; preserve for the spine-fix's verification step)
- `park-band-validity.js` (baby's per-band validity probe)
- `park-band-instrument.js`, `park-band-detail.js` (deeper probes)
- `lafpark-bands.js`, `lafpark-probe.js`, `park-probe.js`, `park-probe2..5.js` (earlier exploratory probes from coordinator's investigation rounds)

Coordinator suggested earlier to GC at end-of-session. Recommend KEEPING `all-band-selfint-scan.js` + `park-band-validity.js` + `park-band.svg` as reference artifacts for the spine-fix verification; the rest can go.

---

## Recommended fresh-coordinator agenda

1. **Read this doc end-to-end + Jacob's screenshots in conversation history above (image #2 expected, image #3 broken).**
2. **Confirm the hybrid-revert framing with Jacob.** Specifically ask: function naming (restore original `buildFrontageBands` or new `buildFrontageBandsStraightV1`?), output structure (concat into single `frontageBands` array or split?), and whether to keep `closeBandRingV2` at all (only used inside V2 arc-span branch now).
3. **Execute the hybrid revert.** Surgical: ~150 LOC. One file, one commit. Trinity touch (NOTES + BACKLOG line). Re-bake BOTH looks (the prior baby only re-baked default).
4. **Verify visually.** Jacob looks at Designer with Measure on, clicks a park-adjacent centerline. Image #3 black bands should become image #2 translucent ribbons (or canvas-aerial backdrop if Aerial is on).
5. **Then queue Dispatch 2 (phantom park[0] classify.js fix)** and **Dispatch 3 (curb stroke Path b polyline-offset)**. Independent, can be parallel babies.
6. **Then housekeeping commit** (trinity consolidation, stale-comment cleanup, FEATURES corner-section rewrite).
7. **Then push the branch** (currently 13 commits ahead of origin + whatever the fresh coordinator adds).

---

## Decisions Jacob has explicitly made

- Phase 2.2 reverted; morphological closing on curb stroke is structurally wrong; Path (b) polyline-offset is the proper fix.
- Corner solution (round-block swap, regime emitter, fillet attribution, cusp guard) is salvageable and should be preserved.
- Hybrid revert is the right framing (verbally blessed).
- "No patches" — pragmatic heuristic fixes inside emission loops aren't acceptable; doctrinally clean solutions only.

## Decisions still open

- Function naming + output structure for the hybrid revert (see fresh-coordinator agenda item 2).
- Whether to keep the cusp guard after the hybrid revert lands (the SELFINTs it addressed were ARC-span; restoring per-sharp-fe straight-span emission doesn't undo the arc-span fix; cusp guard probably stays).
- Whether `closeBandRingV2` is retained (only used in V2 arc-span branch now; could be inlined or left as-is).
- When to address the D.7a `blockKey` drift on `frontageBands` (latent; defer unless a consumer surfaces that depends on it).
- When to push the branch (currently held; push after spine fix + visual verify).
- When to GC scratch/ probes (recommend after spine fix lands and is verified).

🌙

— Coordinator-Claude, end of shift 2026-05-17
