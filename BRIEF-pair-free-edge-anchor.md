# BRIEF — Pair-free edge-anchor (fix the overlap-holes on divided & frontage roads)

**Status:** DRAFT, dispatch-ready. Active brief (tracked at root). Boz drafted 2026-07-21 from a live eye-session with Jacob on **HPDM** (divided/frontage overlap-holes). Fresh-agent brief (identity + bounds below); **Jacob dispatches.** This is a **construction / authoring** fix — it does **not** touch the frame chains.

> ⛔ **ROUTE FIRST (`CLAUDE.md` gate):** `ORIENTATION.md` → `README §⭐ START HERE` → **`RIBBONS.md §3.1` (the divided-road inner-edge anchor — LOCKED) + `RIBBONS.md §1`.** Memory: `[[feedback_survey_chains_immutable_corner_is_stroke]]`, `[[feedback_fix_at_source_never_hack_the_symptom]]`, `[[project_v2_authoring_asphalt_phase2]]` ("one asphalt mesh").

---

## Who you are + the bounds

Fresh specialist landing **one** capability: let a ribbon be **projected from an explicit edge (left or right) without a detected pair**, so two parallel same-material roads **abut instead of overlap.** You do NOT touch the frame/chains, the ped FILL, corner identity, or the bake's triangulator. If scope pulls wider, **surface to Jacob** (`[[feedback_baby_must_surface_scope_drift]]`).

## The symptom (your eye-proof)

**HPDM, divided roadways & frontage roads.** Where two same-material strokes run parallel and overlap, the asphalt renders with a **hole in the overlap** — nested "donut" islands (green LU showing through a concrete ring, then another ring inside). Visible in **both** the baked render and Survey → it's in the **geometry**, not a 2D fill quirk. Jacob: *"this happens a lot in divided roadways or frontage roads."*

## The mechanism (verified — start here, don't re-derive)

- The asphalt/curb rings reach the bake **raw and un-unioned** (tileGround emits "raw Clipper ring lists per material," per-chain).
- **`bake-ground.js:307` (`ringsToHoledPolys`) classifies each ring outer-vs-hole by its WINDING SIGN** (`ringSignedArea(r) > 0` = fill, else hole). When two same-material polygons **overlap** and one is wound the negative way, it's misread as a **hole and subtracted** → the punched-out overlap.
- **Why divided/frontage specifically:** that's the only place two *same-material* strokes run parallel and overlap. A grid of separate blocks never overlaps same-material, so it never fires there. Jacob's clue IS the diagnosis.

## ⭐ THE FIX DIRECTION — at the source, not the bake union

Do **not** patch `ringsToHoledPolys` to union-then-classify (that's fixing the symptom — the overlap still shouldn't exist). **Don't let the polygons overlap.** The devised solution (Jacob): **project the ribbon from an edge, not the centerline** — the **inner-edge anchor** (`RIBBONS §3.1`), which offsets from one side outward so two parallel strokes **abut**.

**The gap to close:** the edge-projection EXISTS but is **hard-coupled to a detected pair.** `derive.js:3554` stamps `anchor='inner-edge'` + `innerSign` only on **divided carriageway pairs**, and it resolves "which side is inner" by measuring against the **mate's polyline** (`innerSideSign`). A **frontage road has no mate** → the Survey dropdown greys out **"Inner-edge (no paired chain detected)"** → the operator can't even apply it by hand. That coupling is the whole bug.

**Generalize the anchor to a pair-free, explicit side:**

> `anchor` ∈ `{ 'center' (symmetric), 'left-edge', 'right-edge' }` — an explicit side, **no pair required.**

- **`left-edge`/`right-edge`** = project the full ribbon width to one side of the centerline. The offset machinery **already does one-sided projection** (that is exactly what inner-edge does today via `etOpenButt`/the inboard-zeroing at `tileGround.js:763`); the crux is letting the **side come from the anchor value directly** instead of being derived from a mate.
- **`inner-edge`** becomes **sugar over `left/right-edge`** = "the side toward the detected pair." Divided pairs keep auto-resolving; nothing regresses.
- **Frontage / any parallel-overlap road:** operator picks the side that projects *away* from the neighbor. **Kit auto-suggest:** when a same-material road runs parallel-and-close to another and is not a divided pair, propose the edge (and the side) so the operator confirms rather than hunts.

## Layer + homes

- **`derive.js`** — the `anchor`/`innerSign` stamp (`~:3548–3558`, the divided-pair block) + the operator-override merge (`:2556`). Generalize the anchor vocabulary; keep the operator override first-class.
- **`src/lib/tileGround.js`** — the offset consumer (`:730–765`, the inner-edge inboard-zeroing). Make it honor an explicit `left/right-edge` side, not only a mate-derived `innerSign`.
- **Survey UI** — the anchor dropdown (the `Center / Inner-edge` control in the screenshot). Add `Left edge` / `Right edge`; ungate them (no pair required).
- ⚠️ **`innerSign` is documented UNRELIABLE** (`tileGround.js:742`, `derive.js:3514` — re-resolved geometrically every bake). An explicit operator side **sidesteps** that fragility; prefer the explicit side over the derived sign where both exist.

## Acceptance (the eye is the gate)

1. **The overlap-holes are GONE on HPDM** (divided + frontage) — on the **baked** render *and* Survey, the asphalt is solid where the two strokes meet; no nested-donut voids. Jacob's eye.
2. **Operator can select `Left edge`/`Right edge` on a frontage road with no pair** (the dropdown no longer greys out) and it visibly resolves the overlap.
3. **Divided carriageways unchanged** — `inner-edge` still auto-picks the paired side; LS + existing HPDM divided roads byte-identical-or-better.
4. **Legit holes survive** — a treelawn void inside a block, a median void, still render as holes (the fix removes *overlap*, it must not fill *genuine* enclosed voids). ⚠️ this is the guard: confirm on a block with an interior treelawn ring.
5. **"One asphalt mesh" honored** — overlapping road coverage unions/abuts to solid, per doctrine.
6. **Validate on LS *and* HPDM.**

## Open / notes
- Signature harness: the overlap-hole is reproducible in the baked `ground.bin`/`shape.json` at a divided/frontage node — build a small probe (like `scratch/hpdm-curb-probe.mjs`) to confirm the winding-classification before and after.
- Kit auto-suggest of the parallel neighbor is the "kit" half; the explicit operator side is the minimum that fixes the eye — **land the operator side first, eye-confirm, then add auto-suggest.**
- Distinct from **A2b** (`BRIEF-through-road-edge-straight.md`, the through-edge-straight stroke fix) and **A3/A4** (curve smoothness) — different defect, don't conflate.
