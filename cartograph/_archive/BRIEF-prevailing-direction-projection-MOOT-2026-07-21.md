# BRIEF — Prevailing-direction projection (straighten the artifact kink at intersections)

> ⛔ **MOOT / SUPERSEDED (2026-07-21) — DO NOT DISPATCH.** The tip kink is **absorbed by street widths** (no visible effect), AND straightening it is a **frame edit** — forbidden (chains = survey = immutable; a frame straighten dead-ended the carriageway and was reverted). The real defect (the through-road's curb edge bending at the junction) is a **STROKE** fix → **`BRIEF-through-road-edge-straight.md`.** See `[[feedback_survey_chains_immutable_corner_is_stroke]]`. Retire this file to `cartograph/_archive/` when convenient.

**Status:** ~~DRAFT, dispatch-ready. Active brief (stays tracked at root).~~ **MOOT — see banner above.** Boz drafted 2026-07-21 from a live eye-session with Jacob on **Clayton × De Mun (HPDM)**. Fresh-agent brief (identity + bounds below); **Jacob dispatches.** This is the **geometry half** of the across-intersection organ; the **identity half** (the terminal-node sweep, `BRIEF-terminal-node-sweep.md`) has landed. They compose — see "Composition."

> ⛔ **ROUTE FIRST (`CLAUDE.md` gate):** `ORIENTATION.md` → `README §⭐ START HERE` → **`SKELETON.md §5a/§5b/§5c/§5e` + `RIBBONS.md §1` (Derivation Chain).** Memory: `[[feedback_curb_leg_bend_measure_chain_not_curb]]`, `[[project_skeleton_is_the_first_bake]]`, `[[feedback_read_canon_before_forensics]]`, `[[feedback_proxy_render_is_not_the_operator_eye]]`.

---

## Who you are + the bounds

Fresh specialist landing **one** change in the frame: at an intersection, an entering chain's **node-adjacent tip is yanked off its true heading** to reach a digitized convergence node, manufacturing a "curve" that isn't there on the ground. You **reproject the artifact tip to the chain's prevailing direction**, so straight streets stay straight into the intersection. You do NOT touch the FILL, the curb construction, the bake, or corner *identity* (that's the terminal sweep). If scope pulls wider, **surface to Jacob** (`[[feedback_baby_must_surface_scope_drift]]`).

## The canonical case (your eye-proof)

**Clayton × De Mun, HPDM, node `[-4.4, 931.3]`.** De Mun is a **right-angle divided street with a median** — IRL there is no curve here (Jacob). But the frame **converges both carriageways to one node** and kinks the approach. Measured (`scratch/prevailing-kink.mjs`, chain-only):
```
De Mun carriageway-A  kink=0°     bodyCurve=5°   → straight  (leave alone)
De Mun carriageway-B  kink=47.2°  bodyCurve=0.4° → ARTIFACT: body dead-straight, tip yanked 47°
```
The two bent legs Jacob marked are those kinked approaches; the curb inherits the bend (the bend is in the **chain**, not the curb — do NOT go measure the curb, `[[feedback_curb_leg_bend_measure_chain_not_curb]]`).

---

## The method

For each chain endpoint landing on a multi-way node:
1. **Prevailing heading** = the heading of the straight **body**, sampled ~**15–40 m** back from the tip (past any node kink).
2. **Tip heading** = the node-adjacent segment (~0–6 m).
3. **Kink** = angle(tip, prevailing). **Body-curve** = does the body itself turn (sample 40–70 m too)?
4. **Discriminate (THE CRUX — this is what makes it safe):**
   - **ARTIFACT** = straight body + tip kink (`kink > ~6° AND bodyCurve < ~6°`) → **reproject**: replace the kinked approach with the prevailing heading, extended into the intersection.
   - **REAL curve** = the body is turning (`bodyCurve ≥ ~6°`) → **leave untouched.** The road genuinely curves.
5. **Divided pair:** keep both carriageways on their (parallel) prevailing headings → they **do not converge**; each meets the cross-street on its own line, median opening between them to the cross-street. The single convergence node splits into the two real meeting points.

Thresholds (`6°`, `15–40 m` window) are starting values from the harness — **tune on the eye**, not headless.

## ⚠️ The load-bearing caveat — this MOVES chain geometry

Unlike the terminal sweep (a pure label), this **repositions chain vertices.** `SKELETON §5c/§5e` say ⛔ *don't move the skeleton at these corners* — but that was because **those** centerlines were already square (moving would corrupt). **Here the centerline is provably NOT square** (47° artifact kink, straight body). Moving it toward straight is *correcting an artifact*, not corrupting truth — **and the discriminator is the entire safety.** If the discriminator misfires on a real curve, this breaks a genuinely-curving street (exactly how the `§5a` straightener died — right tool, wrong population). So:
- The discriminator gate is not optional and must be conservative (bias toward "leave alone" on doubt).
- **Preserve connectivity** — a reprojected tip must not orphan a chain or break the junction-protected graph; the node it lands on may need to split (divided pair) — handle that topology explicitly, don't hand-wave it.

## Layer + placement

**`skeleton.js`, after weld + `repairDividedPairs`, before/around the junction-protected RDP** (`§5a`: "consolidate the intersection, *then* simplify the now-clean chains"). This is the missing **across-intersection organ**, geometry side. It rides the frame → `ribbons.json` like every other frame fact; downstream is a pure consumer.

## Composition with the terminal sweep

The terminal sweep names the **through-road**; this holds that road **straight through** the node while stems reproject to meet it. Where both apply, the through-road's prevailing heading is the one to run straight; the stem's tip reprojects onto it. Build this aware of that hook, but the two ship as separate briefs.

---

## Acceptance (the eye is the gate)

1. **Clayton × De Mun on the FROZEN render + Jacob's eye:** carriageway-B runs straight to Clayton, meets square, median opens between the carriageways — no manufactured curve, legs straight under the fillet.
2. **The 46 real-curve ends across LS + HPDM are UNTOUCHED** (`scratch/prevailing-kink.mjs` counts them: LS 13, HPDM 33). This is the must-not-break guard — byte-identical or eye-confirmed unchanged. A regression here is worse than the bug.
3. **No new self-intersections / connectivity breaks** — run `scratch/correctness-detector.mjs` (curb∥chain, iA self-int, face-closure) before/after.
4. **Sizing holds:** ~21 fortifiable nodes/town (LS 37 ends, HPDM 27) straighten; already-straight approaches (LS 45, HPDM 85) unchanged.
5. **Detector:** add a `prevailing-kink` invariant (artifact classification) to `scratch/correctness-detector.mjs` so town #3 can't regress it.
6. **Validate on LS *and* HPDM** — both are targets.

## Open / notes
- The harness `scratch/prevailing-kink.mjs` (chain-only) is the sizing + discriminator prototype — extend it, trust the real frame graph over its rough numbers.
- Correct stale canon while here: `SKELETON §5b-bis` "St Vincent weld-seam to straighten" is wrong (it's a physical roundabout) — separate from this fix but note it if touched.
- A prior straightener (`§5a`, reverted `scratch/through-junction-straightener.patch`) exists — read *why* it was reverted (wrong population) before reimplementing; the discriminator is what this one adds.
