# BRIEF — Smooth HPDM's chunky roads (turn the curve primitive ON)

**Status:** DRAFT, dispatch-ready. Active brief (root). Boz drafted 2026-07-22 after routing the curve canon live. Fresh-agent brief (identity + bounds below); **Jacob dispatches.** Branch: `curb-offset-draw`.

> ⛔ **ROUTE FIRST (`CLAUDE.md` gate):** `ORIENTATION.md` → `README §⭐ START HERE` → then, in this order:
> 1. **`_handoffs/HANDOFF-curve-primitive-skeleton.md`** — THE canon for this work. Read in full (the two landed phases, the two durable laws, what was tried and rejected).
> 2. **`SKELETON.md §3.5`** — frame→render, the ONE knob, the ⚠️ IX constraint, and the ⛔ SHAPE-not-Section bug-class.
> 3. **`RIBBONS.md §1`** — the Derivation Chain (fix the centerline; never smooth the polygon).
> Memory: `[[feedback_proxy_render_is_not_the_operator_eye]]`, `[[feedback_read_canon_before_forensics]]`.

---

## Who you are + the bounds

Fresh **geometry/pipeline specialist** — **name yourself**. ONE job: make HPDM's roads read **smooth instead of faceted**, by turning on the *already-built* curve primitive and proving it on the operator's eye.

You do **NOT**: redesign the curve machinery (it's landed and eye-approved), fix shape from the Section/frozen side, chase the broader curb-bump family, or trigger a re-bake. If scope pulls wider, **surface to Jacob** (`[[feedback_baby_must_surface_scope_drift]]`).

---

## ⭐ THE HEADLINE — the machinery is BUILT and eye-approved. It is simply SWITCHED OFF.

This is the whole point of the brief; it should save you days. Do not re-derive any of it:

- **The curve primitive LANDED on this branch.** `cartograph/skeleton.js` `curveFitSegments` (`:894`) emits sparse `points` + `segments[]` (`{type:'line'}` | `{type:'bezier',c1,c2}`). Through-roads are fit **ACROSS the `continuesAs` seam as ONE curve**, then de-Casteljau-split back per chain (shared seam vertex + matched tangents → no mid-curve split). **Phase 1 = `7c49349`; Jacob: *"centerline perfect."*** Robust curve curb **Phase 2.1 = `4273ce8`; Jacob: *"curve curb is clean now."***
- **It is gated by an env flag, OFF by default:** `const CURVE_FIT = process.env.CURVE_FIT === '1'` (`skeleton.js:840`), applied at `:1834`.
- **`derive.js` already carries it:** `tessellateStreet` (`:41`, applied `:2609`) is the ONE curve→points helper, and it tessellates **BEFORE** the IX pass (so `intersections.ix` indexes the dense array — the IX constraint is already handled).
- **The consumers already read it:** `SurveyorOverlay.jsx:501` and `MeasureOverlay.jsx:356` both do
  `st.segments ? st.points : (smoothChain(st.points, STREET_SMOOTH, …) || st.points)`.
- **`STREET_SMOOTH = 0`** (`src/lib/smoothCenterline.js:150`) — the old smoothing knob is **retired/zeroed**. So a street with **no `segments`** renders as **raw faceted OSM, with no fallback smoothing at all.**
- **Verified state (2026-07-22):** **HPDM = 0 of 300 streets have `segments`. LS = 0 of 209.** Nothing is curved anywhere. **That is exactly why HPDM reads chunky.**

**So the job is: turn it on for HPDM, regenerate, and gate it on the eye.**

---

## The task

1. **Regenerate HPDM with the flag on:**
   ```
   CURVE_FIT=1 CARTOGRAPH_SCENE=hipointe-demun node cartograph/skeleton.js
   CARTOGRAPH_SCENE=hipointe-demun node cartograph/pipeline.js --skip-elevation
   CARTOGRAPH_SCENE=hipointe-demun node cartograph/promote-ribbons.js --scene=hipointe-demun
   ```
2. **Confirm it took** — count chains carrying `segments` / `type:'bezier'` in `cartograph/data/hipointe-demun/clean/ribbons.json`. Report the number. (A count of 0 means the fit found nothing to curve — investigate the fit, not the consumers.)
3. **EYE-GATE on the lit HPDM Survey view** — Jacob judges. Report: which roads smoothed, which stayed chunky, and any NEW artifact (curb bumps, junction rounding, band slivers).
4. **Only after the eye passes**, discuss downstream (Section / slab) with Jacob — see the caveats.

---

## ⚠️ Load-bearing caveats

- **The EYE is the gate — never a proxy render.** Judge on the lit Survey app (`[[feedback_proxy_render_is_not_the_operator_eye]]`).
- **⛔ Work SHAPE, not Section.** To change centerline/polygon shape you work the **SURVEY** render (`SurveyorOverlay` navy + the **live** `buildTileGround`). Editing `MeasureOverlay` / `sectionGeos` is editing the **frozen downstream consumer** — it *cannot* change the shape, and in frozen mode the live smooth is bypassed entirely. *Start at the beginning: Skeleton → Survey.* (`SKELETON §3.5`, named as a bug-class "do NOT repeat".)
- **⛔ A re-freeze / re-bake is JACOB'S GO — do not trigger it.** Survey (live, pre-Wall) shows the curve immediately. Section + the 3D slab only reflect it after `shape.json` is re-frozen, and **re-baking can clobber uncommitted bakes** (`SKELETON §3.5` open item 3).
- **Junctions must stay SHARP.** The design is "smooth bends, keep junctions sharp" — corner-protected (`CORNER_TOL 30°`) and junction-pinned (`junctionKeysOf`). If junctions round off, that's a regression, not a win.
- **The LS curve-run artifacts were deliberately left UNCOMMITTED** (Jacob's call). Ask before committing regenerated artifacts.
- **Whether `CURVE_FIT` becomes default-ON for the kit is Jacob's decision** — do not land that flip unasked.
- **Branch state:** `curb-offset-draw` just received the through-road-edge fix (`cd062388` — a `derive.js` prevailing-direction overlay emitting `strokePoints`; `SKELETON §5h`). Expect that in `derive.js`; don't disturb it.

## Known-open — explicitly NOT your task

- The `curb-bump` detector flags **~20 bumps on other LS roads** (Geyer, Russell, S Jefferson, Waverly, Park Place) — the broader per-road reconcile family.
- The per-fe `blockCustoms` width-override reconciliation gap (the residual curated hand-fix).
- The name-transition smoothing seam (`SKELETON §3.5` open item 1).
- The **tabled** divided-nose median degeneracy at the perimeter (audit: `scratch/ls-median-audit.mjs`; 10 divided noses + 2 both-straight through-Ts, boundary-edge, outside active block bodies).
- ⚠️ **Benton Place (LS) still renders ROUGH (Jacob, 2026-07-22).** The teardrop/couplet loops fall through `fitClosedLoopCircle` — their circle-fit residual is far above `CURVE_LOOP_CIRCLE_TOL` (Benton ≈73%, Waverly couplet ≈52%) → they take the **faceted legacy path**, which the code comment claims is "already clean per HANDOFF §v2" but on the eye is **not**. Real A4 gap: a teardrop/couplet loop needs a smoothing path that isn't the circle-fit (a general closed-loop bezier fit, not a circle assumption).

## Acceptance

1. **HPDM roads read smooth on the lit Survey app — Jacob's eye.** The gate.
2. Bezier `segments` present on the curved HPDM chains; count reported.
3. **Junctions still sharp**; no new curb bumps or band slivers on the eye.
4. **LS not regressed** — `node scratch/correctness-detector.mjs` before/after (CLEAN junction count is the reference; it was 75 CLEAN / 70 FLAGGED at brief time).
5. **Zero Section-side edits. Zero re-bake without Jacob's go.**

## Tools

- Rebuild loop: above. Renders for your own alignment (not the gate): `node scratch/node-render.mjs <ls|hpdm> <cx> <cz> <tag>`.
- Regression: `node scratch/correctness-detector.mjs`.
- Curve provenance + what was already tried/rejected: `cartograph/_archive/handoffs/HANDOFF-vector-curve-construction-SUPERSEDED-*.md` and `HANDOFF-concentric-curb-curved-streets-SUPERSEDED-*.md`.
