# BRIEF — Hold the through-road's edge straight through the junction (the curb, not the chain)

**Status:** ✅ **LANDED + eye-confirmed 2026-07-22** (Jacob: *"you did it!"*). Live content folded into **`SKELETON.md §5h`** (the invariant + the four tuning rules) + **`RIBBONS.md §3.5`** (E2-merge-not-deleted correction) + memory `[[project_through_road_edge_straight]]`. Fix shipped in **`cartograph/derive.js`** (`correctedTipChain` + the through-edge overlay pass → `strokePoints`, consumed by E2 + `faceStreets` + tileGround). Survey chains untouched. This archived copy is the trail; canon is the live home. *(Originally drafted 2026-07-21 by Boz from a long live eye-session on De Mun × Clayton, HPDM.)*

> ⛔ **ROUTE FIRST (`CLAUDE.md` gate):** `ORIENTATION.md` → `README §⭐ START HERE` → **`SKELETON.md §5d/§5e/§5f/§5g` + `RIBBONS.md §1` (the four invariants + the derivation chain).** Memory: **`[[feedback_survey_chains_immutable_corner_is_stroke]]` (READ FIRST — the load-bearing principle)**, `[[project_freeze_the_curb_first_bake]]`, `[[feedback_proxy_render_is_not_the_operator_eye]]`, `[[feedback_read_canon_before_forensics]]`.

---

## Who you are + the bounds

Fresh specialist landing **one** construction change: at a junction, the **through-road's stroked curb edge bends/bulges** where a road terminates against it. A through-road's block-facing edge is **street-simple** (`SKELETON §5d/§5g`) — ONE straight offset of its straight chain, past the mouth, untouched by whatever terminates there. You make the curb construction honor that. You do **NOT** touch the frame/skeleton/chains, the ped FILL, or the bake. If scope pulls wider, **surface to Jacob** (`[[feedback_baby_must_surface_scope_drift]]`).

## The canonical case (your eye-proof)

**De Mun × Clayton, HPDM, node `[-4.4, 931.3]`.** Load the HPDM Survey view and look: **Clayton's curb edge bends/bulges at the De Mun mouth** (a hump-then-diagonal on the east side; a needle-thin median sliver up the middle). Clayton is the through-road; its edge should run dead straight past the mouth. Jacob marked this repeatedly — it is the defect.

---

## ⭐ THE PRINCIPLE — load-bearing, DO NOT REOPEN (this is the whole point of the brief)

Tonight's session burned hours re-deriving these. They are settled. Start here, do not re-litigate:

1. **The chain IS the survey — IMMUTABLE.** *"If that's the survey, that's the survey"* (Jacob). ⛔ **Do NOT edit `skeleton.js` or move any chain vertex.** A frame straighten was **tried and REVERTED tonight** — reprojecting a terminal tip dead-ended the carriageway (degree-3 T → degree-1 deadend) and relocated its surveyed endpoint. Corrupting the survey to buy a pixel. The fix is a **STROKE / construction** result. `[[feedback_survey_chains_immutable_corner_is_stroke]]`.
2. **The through-road is not in question.** Clayton's **chain is straight** — every turn through the node is ≤1.7° (it's a gently *rising* road; the node sits ~1.3 m off its own chord, negligible). **Verified.** So the bend you see is in the **stroke**, never the survey.
3. **Divided-vs-single is IRRELEVANT — do NOT special-case it.** Jacob, verbatim: *"I just don't understand why it even matters if it's divided carriage or a single street T: Clayton is not in question!"* A through-road's edge is a straight offset of its straight chain, **full stop**, whatever terminates at the mouth. ⛔ **Do NOT go down the divided-carriageway / merge / E2 rabbit hole** — that trap ate this session. The rule is universal: **hold ANY through-edge straight at ANY through-node; the terminating road corners INTO it** (`SKELETON §5e` — corner the right legs).
4. **The prevailing-direction brief is MOOT.** `BRIEF-prevailing-direction-projection.md` (reproject artifact tips in the frame) is **dead** — the tip kink is absorbed by street widths (no visible effect) AND it's a frame edit (forbidden, #1). Retire it; do not resurrect it.

## The diagnosis (verified tonight — start from here, don't re-derive)

- **Clayton (`clayton-road-0`, spine)** is the **through-road**: it has an *interior/intermediary* vertex at the node (verts 5,6). De Mun (`de-mun-avenue-2` carriageway-A END, `de-mun-avenue-3` carriageway-B START) *terminates* there. The **terminal-vs-intermediary** identity is the lever, and it's already frozen: ribbon fields `through`, `throughId`, and the ped band already reads it via `isThruNode` ← the landed terminal-node sweep (`thruNodeEnds`).
- **The bulge is in `iA` (the frozen curb ring).** Reproduced with `scratch/hpdm-curb-probe.mjs`: near the node the curb collapses to a **degenerate near-coincident vertex cluster** — ~12 points all at `[0.8–1.0, 923.5]` — sitting **right on Clayton's north edge line** (z≈923 = one half-width north of Clayton's centerline at z≈931). That collapsed cluster is the **median-needle pinch bleeding onto the through-road's edge**. tileGround's own comments name it: **L96–97** *"an attached needle… pinches the curb band (iA−iC)"* and **L200** *"the thin in-and-out needles are the iA-source concave pinch — fixed upstream."*
- **The junction construction skips it.** The E3 pass logs **607 pairs "skipped (unresolvable)"** while `[THRU]` runs 358 windows and builds only 3 corner identities — De Mun × Clayton is plausibly among the *unresolvable* skips, so its geometry stays **emergent** (the tangled needle) instead of constructed straight. Confirm this first; it may be the direct lever.
- **The convergence is in raw OSM, not our snap** — both carriageways *and* Clayton share ONE OSM node at `[-4.4,931.3]`. So "stop snapping upstream" is NOT available; the fix is purely in the stroke.

## The method (the fix direction — hold the through-edge straight)

**Make Clayton's curb edge a straight offset of Clayton's straight chain through the through-node, and keep the terminating road's median-needle geometry off it.** Concretely, the leads, in order of promise:
1. **The E3 "unresolvable" skip** — find why De Mun × Clayton is skipped by the junction construction and get the through-edge constructed straight (consume the frozen `through`/`throughId`/`thruNodeEnds` identity the ped band already uses, but for the **curb/`iA`** edge).
2. **The needle-pinch source** — the degenerate `iA` cluster comes from the median needle (the `kind:'merge'` patches in `derive.js` E2, `~L3408–3441`, one of which is a degenerate ring with a duplicated vertex). Hold the through-road's edge as a clean straight offset so the needle can't intrude on it.
3. Whatever the mechanism, the **acceptance is geometric**: Clayton's north curb edge is straight (a parallel offset of its chain) across the whole through-node run — no cluster, no hump, no diagonal.

Do the minimum that makes the through-edge straight. Prefer consuming the **already-frozen** through-node identity over inventing new geometry.

## Layer + homes

- **`src/lib/tileGround.js`** — the live curb construction. `iA` is the frozen curb ring; curb `C = iA − iC` (`tileGeo`, ~L1640). Needle comments L96–97 / L200; `offsetRingVariable` L148 (its `cornerAt` passes a through-vertex STRAIGHT); `filletRing` L263; `extractFaces` L533; the `[THRU]`/`isThruNode`/`thruNodeEnds` ped machinery L1111–1220. **This is the reverted core — see the caveat.**
- **`cartograph/derive.js`** — E2 divided-corridor construction: the `kind:'merge'` patch stamp (`stamp()`, ~L3408) and Brief-C outer-curb continuity (~L3583–3668, *"the outer edge runs straight through the transition"* — the same intent, already there for one case).
- **Canon:** `SKELETON §5d/§5g` (through edge simple — the "straight edge of the T"), `§5e` (corner the right legs), `§5f` (the unfrozen curb re-stroked live). `RIBBONS §1` (median = walked face, DERIVED; the four corner invariants — building against them is mandatory).

## ⚠️ The load-bearing caveat — this is the most-reverted code in the repo

`tileGround.js` iA / the junction-median construction is the **13-month corner saga** (`RIBBONS _archive`). It is **shared with LS's four park corners** — the same divided-corner path. **A fix that straightens De Mun × Clayton but regresses the LS park corners is a net loss.** So:
- **The EYE gates every step** — the frozen Survey render + Jacob, never a headless count. **Proxy ≠ eye:** tonight the headless `iA` probe first reported Clayton's edge "straight" and *missed* the needle until dumped unfiltered. The render is truth (`[[feedback_proxy_render_is_not_the_operator_eye]]`).
- **Verify LS is unchanged** — run `scratch/correctness-detector.mjs` before/after (curb∥chain, iA self-int, face-closure, junction slivers); no new breaks. Eye-check the LS park corners.
- Read **why** the frame straightener died tonight (`[[feedback_survey_chains_immutable_corner_is_stroke]]`) before touching anything — it's the wrong-layer trap this brief exists to prevent.

## Tools + rebuild loop

- **Reproduce the bulge:** `node scratch/hpdm-curb-probe.mjs` (builds HPDM `buildTileGround`, dumps `iA` verts near the node — the degenerate cluster). Extend it into a before/after gate.
- **The fix is in `tileGround.js`** → the HPDM Survey view re-strokes **live** on refresh (no rebuild needed for a tileGround change). Only rebuild the frame if you (wrongly) touch it: `CARTOGRAPH_SCENE=hipointe-demun node cartograph/skeleton.js` → `node cartograph/pipeline.js --skip-elevation` → `node cartograph/promote-ribbons.js --scene=hipointe-demun`.
- Also verify on **LS** (`src/data/ribbons.json`) — both are targets; LS is the regression guard.

## Acceptance (the eye is the gate)

1. **De Mun × Clayton on the HPDM Survey + Jacob's eye:** Clayton's curb edge runs **dead straight** past the De Mun mouth — no hump, no diagonal, no median needle on the edge. The terminating road corners cleanly into the straight through-edge.
2. **LS park corners UNCHANGED** (eye + `correctness-detector.mjs`) — the must-not-break guard.
3. **No new self-intersections / degenerate clusters** in `iA` (extend `hpdm-curb-probe.mjs` into an invariant: no near-coincident vertex run on a through-road's edge).
4. **Universal, not a De Mun special-case** — spot-check other through-nodes (single-street T's included) stay straight; the rule is through-edge-straight, not divided-handling.
5. **Zero frame changes** — `git diff` shows no `skeleton.js` / chain edits.

## Open / notes

- Retire `BRIEF-prevailing-direction-projection.md` → `cartograph/_archive/` dated, verdict *"MOOT — tip kink absorbed by widths + frame edit forbidden; superseded by BRIEF-through-road-edge-straight."*
- Correct stale canon while here if touched: `SKELETON §5b-bis` "St Vincent weld-seam" is a physical roundabout (not a weld seam).
- The frozen through-node identity (`through`/`throughId`/`thruNodeEnds`) is the terminal-node sweep's output — it composes with this; you are the **curb-edge** consumer of it (the ped band is the other).
