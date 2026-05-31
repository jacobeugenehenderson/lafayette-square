# HANDOFF / BRIEF — C5: LS cutover to the mono-width ring-band emitter

**Status:** dispatch-ready (expanded from sketch by Boz, 2026-05-31).
**Dispatch:** COLD (standalone; consumes the chain-consumer census + RIBBONS as *docs*, not a live prior window). Pick your own name and sign your commits with it.

---

## You are the dispatched Agent

You own this cutover end to end. You are not Boz and not a continuation of a prior session — you're a fresh hand with full file context, dispatched for exactly this brief. Name yourself in your first reply and sign every commit `Co-Authored-By`.

## The mission

LS (the Lafayette Square neighborhood, the production scene) still renders ribbons/corners on the **legacy per-leg emitter** (`silhouetteStraightEmitter` + `buildFrontageBandsV2`). That construction **never reached a working state** — its per-corner pad visual gate failed, which is *what motivated the mono-width rebuild in the first place*. Toy has run the new keystone emitter (`emitBlockRingBands`) since C4 and through V1.5 / V2-Measure / V1.6. **C5 flips LS onto the keeper and deletes the legacy path.**

**Risk framing (important — Jacob's calibration):** LS is *already dysfunctional* on the old emitter. The eyeball gate is therefore **"is the new emitter better than a known-broken baseline,"** not "did we regress a golden render." You are not protecting working output — there is none to protect. Deleting the legacy emitter is **low-regret**: it's dead-on-arrival code. Don't agonize over preserving it.

Jacob's target: *"if we have these 'somewhat' regular corners covered we're 97% there, then we move to bespoke corner helpers for the riff raff."* So the **deliverable is twofold**: (1) LS on the keeper, baked + viewable; (2) a **catalog of the bespoke corners** that don't render correctly under the uniform construction — the riff-raff list that scopes the next arc.

## The cutover ladder (three commits — do NOT collapse)

**Commit 1 — flip LS on, legacy still present.** The emitter is gated by a `useRingBandEmitter` flag set to `scene === 'toy'` in three places. Flip all three so LS gets the keeper (simplest: change `scene === 'toy'` → `true`, leaving the legacy `else` branch in place but dead). This keeps the fallback one git-revert away while you eyeball.
- `src/cartograph/BlockGeometryV2Debug.jsx:195` (default param — live Designer path)
- `cartograph/bake-ground.js:594` (bake driver)
- `src/cartograph/CartographApp.jsx:890` (`useRingBandEmitter={scene === 'toy'}` prop)
- (re-verify these line numbers — `buildBlockGeometryV2.js` is ~3304 lines and moving.)

**Commit 2 — eyeball + bespoke-corner catalog.** Bake LS and view (see Validation). Catalog the corners that break. **This is the gate — do not proceed to Commit 3 until the catalog is written and you've confirmed the keeper is at-least-as-good as the broken baseline everywhere, and better at the regular corners.** Flag anything alarming to Jacob *before* deleting the legacy path.

**Commit 3 — delete the legacy path + flag plumbing.** Once Commit 2 confirms the keeper holds:
- Delete the `else` branch at the emitter dispatch (`buildBlockGeometryV2.js:~2892–2901`).
- Delete `silhouetteStraightEmitter` (`~L1568`), `buildFrontageBandsV2` (`~L1714`).
- Delete `buildFrontageBands` (`~L1475`) — **DEAD, zero call sites** (census L3 / RIBBONS §3.9, grep-confirm before cutting).
- Delete `chainPavementRing` (`~L124`) — **DEAD, zero call sites** (census #5; grep-confirm).
- Remove the `useRingBandEmitter` param + all gating: it's now constant-true, so make the ring-band path unconditional and drop the flag at the dispatch (`~L2884`), the opts read (`~L2539`), and the three sites above.
- Grep for any remaining `useRingBandEmitter` / `silhouetteStraightEmitter` / `buildFrontageBandsV2` / `buildFrontageBands` / `chainPavementRing` references and clean them (comments, debug, scratch — leave `scratch/` files alone unless they import a deleted symbol).

## Validation

- **Bake:** canonical unflagged `node cartograph/bake-ground.js` — it bakes **both** LS (→ `public/baked/default/`) and toy. **Do NOT use `--scene=toy`** — it clobbers `public/baked/default/` regardless of `--look` (`[[feedback_bake_ground_scene_clobbers_default_look]]`). If you must do a scoped run, `git checkout HEAD -- public/baked/default/` after.
- **View:** Designer → LS → look at ribbons/corners across the neighborhood (live V2 path). Then Stage / production for the baked slab. Toy is the reference for "what correct looks like."
- **Live-drag:** select an LS chain in Measure and drag a handle — confirm the live preview (`buildChainBandsLive`, scene-agnostic, already on keystone math) matches the post-release bake. If they diverge, that's the parallel-impl hazard (`[[feedback_live_drag_preview_migrates_with_main_emitter]]`) — report it.
- **Foundation-fault check:** the 13-month "silhouetteStraightEmitter silently drops fes" fault (`[[feedback_silhouette_straight_emitter_skipped_fes]]`) was *dissolved* by the keystone. Audit a few LS IXs by per-fe band-entry count (not by area) to confirm it stays dissolved at LS scale.
- **Reference IX:** Mississippi × Park is the RIBBONS §6.9 bespoke reference — expect it in the riff-raff catalog; there will be others.

## Boundaries — what you may and may not touch

- **YOURS:** `src/lib/buildBlockGeometryV2.js`, the three flag sites, the regenerated `public/baked/default/*` bake artifacts.
- **CANONICAL — check in with Boz/Jacob before editing:** `RIBBONS.md` (living doc — §3.9 dual-emitter → single, §1/§6.10 toward RESOLVED is **C6**, not this brief; note what needs updating, don't rewrite it yourself), the cartograph quintet (`FEATURES/ARCHITECTURE/BACKLOG/NOTES`), `BOZ.md`, this HANDOFF. Report your bespoke-corner catalog back as your final message; Boz folds it into BACKLOG + the next brief.
- **DO NOT** touch the toy state files (`public/looks/toy/design.json`, `public/looks/index.json`) — toy is at its V1.6 baseline.
- **DO NOT** rename anything to Survey / Section / Stage. That rename is DECIDED but NOT BUILT; the stale-label rule holds (`[[project_two_bakes_two_walls]]`).

## Doctrine guardrails (don't relearn these the hard way)

- **No new clamps/guards in the emit.** The ribbon emit has zero corner-radius clamps by design; Clipper handles tight-R natively. Don't import defensive patterns from the legacy path as you delete it (`[[feedback_no_corner_radius_clamps_in_emit]]`). The capacity guard that exists (Trammel's) is the *only* one and it's already in place.
- **Corner radius is a design control, not a thing to engineer around** (`[[project_corner_radius_is_design_control]]`). Tight-R pinches are the operator's dial, not a bug.
- **Per-block LU is `fe.blockKey` → direct map** (`[[project_per_block_lu_via_blockkey]]`) — already in the keeper; verify it routes correctly at LS's parcel density.
- **Verify edits applied before trusting bake output** (`[[feedback_verify_edits_applied_before_trusting_output]]`) — Edit-then-Bash can race; confirm via Read/git diff. **Render real before/after; don't theorize** (`[[feedback_render_guard_against_real_data_not_synthetic]]`).
- **Bespoke fixes are operator-side first.** For each broken corner, prefer a per-block override authored via the Measure tool over a code path. Only propose a "corner helper" code path where no operator-side fix works. Geometry doctrine, capacity guard, and authoring doctrine are all *fixed* — only operator-side fixes or narrow bespoke code paths are in scope.

## Where this sits in the arc

C5 is the **precondition for the wall-move** (`[[project_skeleton_is_the_first_bake]]`, `[[project_two_bakes_two_walls]]`). The standing chains-die-too-late debt can't be paid until LS is off the legacy per-leg path. After C5: **wall-move** (figure-ground + corner rounding become "the First Bake" at Survey-exit; freeze `blockRounded`; downstream reads zero chains). The chain-consumer census (`HANDOFF-chain-consumer-census.md`, Plumb) is the map for that next step — read its §1c (legacy emitters, moot post-C5) and the P4–P8 producer rows for context, but the wall-move itself is NOT in this brief.

## Memory cross-refs

`[[project_ribbon_corner_uniform_width]]` (V1 keystone) · `[[feedback_silhouette_straight_emitter_skipped_fes]]` · `[[feedback_no_corner_radius_clamps_in_emit]]` · `[[project_per_block_lu_via_blockkey]]` · `[[feedback_bake_ground_scene_clobbers_default_look]]` · `[[feedback_live_drag_preview_migrates_with_main_emitter]]` · `[[project_skeleton_is_the_first_bake]]` · `[[project_two_bakes_two_walls]]`
