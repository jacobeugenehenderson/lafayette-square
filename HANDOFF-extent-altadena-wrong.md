# HANDOFF — Extent tool: the poured Altadena slab is still WRONG (diagnose → fix)

> **Dispatch-ready brief. Drafted by Boz 2026-07-10 (pack-up) for tomorrow.** The boundary selector Phase 1+2 is merged and Altadena has been poured — **but the poured Altadena is still wrong** (Jacob, 2026-07-10). This is a **diagnose-first** task, not a build.

## Who you are + the call

You are the agent dispatched to fix Altadena's pour. **Name yourself.**

- **Agent: FRESH.**
- **Route:** `ORIENTATION.md` → `README §⭐ START HERE` (Extent row) → `cartograph/INTAKE.md §0.5` → `NEIGHBORHOOD-INPUTS §10/§11` → the selector build log `scratch/BUILDLOG-selector-finish.md`.
- **⚠️ FIRST — get Jacob to say what "wrong" looks like** before diagnosing (`feedback_results_over_vocabulary` — Jacob judges by the visible result; `feedback_verify_diagnosis_with_user`). Don't guess the symptom.

## What's already true (context, verified 2026-07-09/10)

- **Selector Phase 1+2 is MERGED** to `curb-offset-draw` (`1274aef5`): full fetch bundle (OSM+msbf+parcels), timezone via `tz-lookup`, name/blurb capture, official boundary, committed-hood repopulate/rescope, the draft-clobber fix. Files: `ExtentApp.jsx`, `cartograph/serve.js`, `api.js`, `CartographApp.jsx`, the store.
- **Altadena was poured** by the selector agent as an end-to-end validation (flat ground, `pipeline.js --skip-elevation`). So a scene/slab exists.
- **The mountain backdrop is now ALSO on trunk** (`MountainBackdrop.jsx` + the `landscape` channel + `bake-landscape`) — so Altadena's hero backdrop renders (eye-gated beautiful). If "wrong" is about the *hood* (buildings/streets/framing), that's separate from the (good) mountain.

## Candidate causes (diagnose, don't assume — rank after Jacob names the symptom)

1. **Bare-draft `neighborhood.json` never re-committed.** HPDM's was a bare draft (`{sides,radius,zip}`, no `committed`/`name`/`tz`/`center`) — a clobber-bug casualty. **Check Altadena's `cartograph/data/altadena/neighborhood.json`** — if it's also a bare draft, the hood won't load/frame correctly. Fix = re-commit through the (now-fixed) Extent tool.
2. **Framing / camera** — the "3D browse framing off (too high & left)" bug had contradictory status across 4 docs and was **never eye-gated** (the selector agent added pullback clamps; unconfirmed). If Altadena comes up off-center, this is it — settle it here and **reconcile the 4 docs** (`README` ×2, `NEIGHBORHOOD-INPUTS §11`, `HANDOFF-neighborhood-perimeter-builder.md` / `INTAKE.md` say resolved).
3. **Boundary / corners** — Altadena was validated "official-boundary only" (not named-street directional borders). If the boundary is wrong, the buildings-membership / clip is wrong. Directional-street semantics (#10) may be incomplete.
4. **Data alignment** — parcels↔buildings frame (the 2026-07-09 reproject fix has a standing gate: "after any re-pour, verify parcel↔building alignment"). Timezone should now be Pacific — verify.
5. **Elevation** — the pour runs `--skip-elevation` (flat ground). If Altadena looks wrong because it's flat under a mountain, that's the **margin/annulus terrain follow-on** (DEM-driven hood ground via `bake-terrain`), a *separate* thread — flag, don't conflate.

## Also carry (from the selector's Phase-2 tail, if not done)

Live radius re-scope, directional-street semantics, atomic/rollback pour, the stale `ExtentApp.jsx:19–22` docstring — check the selector build log for what Phase 2 actually finished vs left.

## Boundaries

- Worktree off `curb-offset-draw`; lane = `src/cartograph/*` + `cartograph/serve.js` + fetch/pour scripts. Canonical docs off-limits (Boz folds); build log in this file or `scratch/`.
- **Definition of done:** Altadena pours correct to Jacob's eye (hood framing/boundary/data all right), and the 4-doc framing-bug contradiction is reconciled to reality.
