# BRIEF — Dead-end LEG flip + the cap SLOPE (they're spousal — fix together)

## ✅ STATUS — BOTH THREADS LANDED (2026-07-22). Successor brief: **`BRIEF-dead-end-mouth-junction.md`**

- **(a) the cap SLOPE** — root was NOT the straight diagonals: the transition quad was **hard-coded**
  to one arrangement (walk-outer-at-cap → walk-inner-at-leg), correct only for a treelawn-Y leg and
  painted **backwards** for a walk-at-curb one, so it disagreed with the bulb at s=0 AND the leg at
  s=T. Now derived per shoulder from each end's RESOLVED materials, eased with a smoothstep. That is
  also why smoothstepping alone read pixel-identical last cycle — the shape was wrong, not the edge.
- **(b) the LEG flip** — two roots, both closed: the ribbon **folds on itself** at a dead end, so v2
  emitted ONE fe under ONE side token (46/50 caps) → chopped the fold at the two shoulders; and both
  legs are the same centreline under a **symmetric** claim stroke → gave each leg its own side,
  ending at the shoulder. Legs responding **56 → 93 of 100**.
- **Found while verifying:** asymmetric roads drew symmetric at every dead end (a directed-key
  clobber on the zero-width slit — **22 of 48** dead-end chains), and the Survey "Asymmetric" toggle
  was reset by the very click that places the drag anchor. Both fixed.
- ⭐ **Doctrine Jacob set during the pass** (now canon, `SECTION §6.3`): the **bulb is ONE continuous
  semicircle**, not two halves; the cap is an **end COUPLER** reconciling its two legs in **parity
  AND width** at the shoulders. See `[[project_dead_end_cap_is_an_end_coupler]]`.
- ⚠️ **Open tail:** 7 legs still don't respond; 7 caps flip to no visible change (pre-existing); 10
  asymmetric caps changed appearance (each leg now renders its own arrangement) — Jacob's call.

---

**Status:** LANDED 2026-07-22 (was: DRAFT, dispatch-ready). Active brief (tracked at root). Boz drafted 2026-07-22 from a live eye-session with Jacob on **Preston Place (LS)**. Fresh-agent brief (identity + bounds below); **Jacob dispatches.** Continues the A1 dead-end-cap arc (`_handoffs/HANDOFF-dead-end-cap-flip.md`, the two open threads). Jacob: *"they're spousal issues"* — do **both** in one pass.

> ⛔ **ROUTE FIRST (`CLAUDE.md` gate):** `ORIENTATION.md` → `README §⭐ START HERE` → **`SECTION.md §6` (the cap/corner construction) + `RIBBONS.md §1`.** Memory: **`[[feedback_render_geometry_to_png_before_the_eye]]` (READ FIRST — the verify loop is load-bearing here)**, `[[feedback_proxy_render_is_not_the_operator_eye]]`, `[[project_d6a_curb_offset]]`, `[[project_revert_buttons]]`.

---

## Who you are + the bounds

Fresh specialist closing the **last two open threads** of the dead-end cap class. Two symptoms, **one construction** (they're coupled — spouses):
- **(a) The cap SLOPE renders wrong** — jagged notches at the two shoulders of a flipped round cap (where the semicircle bulb meets the straight legs). Eye-proof: **Preston Place** (`preston-place:end`, flipped).
- **(b) The cul-de-sac LEGS aren't independently flippable** — a material flip on a dead-end leg renders **Δ=0.0** (`blockCustoms[skelId][side][segOrd].materials` never changes the strip).

You work **only** the dead-end cap FILL construction in `tileGround.js` (`sectionPassTile`). You do NOT touch the frame, the curve-fit, the bake pipeline, or other tiles. If scope pulls wider, **surface to Jacob** (`[[feedback_baby_must_surface_scope_drift]]`).

## ⚠️ THE VERIFY LOOP IS MANDATORY — render before the eye

The handoff says blind iteration on this slope burned a whole cycle. **Do NOT iterate on the code without rendering.** The tool works and is proven:
```
node scratch/cap-viz.mjs preston-place:end          # writes scratch/cap-viz.svg (flipped)
node -e "require('sharp')('scratch/cap-viz.svg').resize(500).png().toFile('scratch/cap-viz-X.png')"
```
then **Read the PNG**. Baseline PNGs from this session: `scratch/cap-viz-preston-baseline.png` (the notches). Render every change; only promote to Jacob's eye once the geometry is right on the PNG.

## The construction map (grounded — start here, don't re-derive)

All in `src/lib/tileGround.js` `sectionPassTile`:
- **`capFlip` set** (`~:1005`) — tipKey → {p, hw, axis}, built from `readCapCustom(...).capFlip`. The flip is a **toggle-swap** on the cap slot.
- **Cap-sliver routing** (`~:1441–1517`, the `roundTips` loop) — reclaims the semicircle sliver, routes it to walk/treelawn by owner, **inverts if `capFlipped`** (`inv()`, `:1450`). The **ASYMMETRIC-cap split** (`:1490`) cuts the sliver by a **straight half-plane through the tip** (`halfLeft`) and routes each half to its owner's material.
- **Leg-strip emit** (`~:1503`) — `for (pc of pieces) … pc.mat === 'SW' ? Wacc : pushLu`. **This is where a LEG flip must land** (thread b).
- **The bend-crossing transition** (`~:1518–1556`) — fires only when a **CAP** is flipped (`capFlip.size`); repaints the shoulder (walk contiguous outer→inner, treelawn complement). **Guard `o < total`** (`:1537`) → skips **sidewalk-only** legs. Edges are **straight diagonals** (the deferred polish).

## What tonight's diagnosis FOUND (don't repeat these)

1. **The notches are NOT (only) the transition's straight diagonals.** Smoothstepping that quad (`:1548`) left Preston's render **pixel-identical** — reverted. The visible notches come from the **cap-sliver / semicircle-mask geometry** (the asymmetric split + the mask edge at the diameter), *upstream* of the transition.
2. **Preston is an ASYMMETRIC cap** — L: treelawn 0.21m + sidewalk 1.52m; **R: sidewalk-only** (`treelawn:0, terminal:"lawn"`). So the two shoulders build differently (transition fires L, `o≥total`-skips R). **This asymmetry is the hard part** — the notch is where the semicircle mask (Piece 4a: "tip disk ∩ far half-plane, stops at the diameter") meets an uneven leg cross-section. Test symmetric caps too, but Preston is the gate.
3. **Leg-flip (b):** the transition zone (cap-flip-keyed) likely **repaints over** an independent leg flip, AND/OR the leg custom never reaches `pc.mat`. Trace both: does `blockCustoms[skelId][side][segOrd].materials` reach the `pieces` build? does the transition zone honor a leg flip vs only the cap's? (tile#10 `south-18th-street-3`: legs `left|segOrd 5`, `right|segOrd 6`.)

## The fix direction (hypotheses — verify each on the PNG)

- **The slope:** make the **semicircle-mask → leg seam** continuous across the shoulder on an asymmetric cross-section — the walk band must flow from the bulb wrap into the leg with no triangular gap/overlap. The smoothstep is *part* of it, but the dominant seam is the cap-sliver split (`:1490`) meeting the mask edge; that's where the notch is minted. Render-driven.
- **The legs:** make `pc.mat` receive the leg's own flip (thread b), and make the transition zone **flip-aware** (respect leg flip, not just cap flip) so a flipped leg shows through instead of being repainted → no more Δ=0.0.
- **Spousal:** one coherent construction — the transition/seam and the leg materials must agree. Don't fix one and let the other override it (that's the current bug).

## Acceptance (the eye is the gate)

1. **Preston `preston-place:end` flipped renders CLEAN on the cap-viz PNG** — no shoulder notches, walk contiguous around the bulb-to-leg seam — THEN Jacob's eye on the lit app.
2. **A dead-end LEG flip renders Δ≠0.0** — the leg material actually swaps (verify on a symmetric cul-de-sac + Preston).
3. **Symmetric caps unchanged / byte-identical** where they already read clean (the 2026-07-18 landed state must not regress).
4. **Un-flipped caps byte-identical** (the fast path).
5. Validate the cap class map-wide (the ~50 caps), not just Preston.

## Open / notes
- Session artifacts (scratch, git-tracked): `cap-viz-preston-baseline.png` (the notches). `cap-viz.mjs [skelId:capEnd] [flip|noflip]` is the harness.
- The A1 handoff (`_handoffs/HANDOFF-dead-end-cap-flip.md`) has the full Piece-1..4 landing history + the `cap-segord-parity-verify.mjs` gate.
- ⚠️ There is **parallel street-labels work** in the tree (uncommitted, not this task's — leave it). Work only `tileGround.js` cap FILL.
