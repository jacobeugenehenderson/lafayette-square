> ⛔ KILLED 2026-06-05 (Jacob): the divided false-corner PATCH is retired. The false corner is a SYMPTOM of Survey not being polygon-first; the cure is the prebake polygon-ization (cartograph/SURVEY.md §5.1/§6 + PREBAKE.md). Preserved for the forensic trail; do NOT resurrect the patch. Operator ground-truth target: scratch/correct-target-mississippi-lafayette.json.

---

# HANDOFF — Divided-transition false-corner fix

**Status: WIP, approach validated, 3 isolated bugs from landing (2026-06-04).** Self-contained pick-up brief. Deep doc home: `cartograph/SKELETON.md §5e` (read it). Construction doctrine: `RIBBONS.md §3.1`. The "why it's IP" framing: `SKELETON.md §5d`.

---

## The goal
At a **divided↔undivided transition** (a divided avenue meeting a cross-street), the block-silhouette corner is built **tens of metres off** the true corner. Make the corner land where the two straight corridor curbs actually meet. Two live instances: **Mississippi × Lafayette** (node ≈ `166.5, 221.9`) and **Park Ave × South 18th** (node ≈ `424.4, −88.7`) — LS's park corners.

## The locked target (verify against this — it's the operator's ground truth)
`scratch/correct-target-mississippi-lafayette.json` = Jacob's two correct curb strokes (world coords): two **dead-straight** legs (Mississippi west = its `pavementHW` 7.5 m offset; Lafayette north = corridor outer edge) meeting at **ONE true corner ≈ (174, 208)**. The current build instead corners at the **FALSE corner ≈ (214, 216)** (a `filletRing` arc in block ring #20, ~40 m off). **Done = the block edge runs straight to ~(174,208) and corners cleanly; the (214,216) excursion is gone; both park corners fixed; nothing else moves.**

## The diagnosis (settled — do NOT re-derive)
- **Root: the corner-builder corners the WRONG LEGS.** A clean corner = two straight curb legs (`centerline ⊕ pavementHW`) meeting at one rounded corner — what the tools make at every normal IX. A divided road adds carriageway **stubs** at the node; the builder rounds a stub against the cross-street → the false corner, while the corridor's two clean outer-edge legs sit unused. (`SKELETON §5d/§5e`.)
- **It's a recent REGRESSION.** Figure-ground (`buildBlockGeometryV2.js#cornersAtIx`) **skipped** these median-wedge corners (`FEATURES §437`, shipped 2026-05-16; fixed Miss×Laf NW/SW per `NOTES:284`). The **tile re-pour (~2026-06-01)** moved LS to `tileGround.js` → `filletRing`/`extractFaces`, which **never inherited the §437 skip.**
- ⚠️ **`cornersAtIx` is the DEAD figure-ground path — `tileGround.js` never references it.** Every doc framing the fix around `cornersAtIx` / "intersection consolidation in `skeleton.js`" / `osm2streets` prong-4 is a **RED HERRING** for this live defect (flagged in `SKELETON §5b/§5e`, `PIPELINE §Wall` prong-4, `NOTES:17`). The centerlines/legs are already **clean and square** (`§5c`); only the tile corner-builder's leg choice is wrong. Live locus = **`tileGround.js` `filletRing` (~L90) + `extractFaces` (~L303) + the per-tile `aFill`/`iA` build (~L935–957)**.

## Part 1 — DONE (use it, don't redo)
`skeleton.js` stamps a frozen frame fact: each divided carriageway's `phase.spineAtStart`/`phase.spineAtEnd` = the spine `skelId` at that endpoint's transition, carried into `src/data/ribbons.json` (committed `61930d7`, geometry-neutral). **This is how you detect a divided-transition end — no node-matching.** (Verify: `park-avenue-3.phase.spineAtStart === "park-avenue-1"`.)

## The approach — VALIDATED (WIP at `scratch/divided-false-corner-WIP.patch`)
Per-tile in `tileGround`, after `aFill`: compute the TRUE corner = **intersection of the two STRAIGHT corridor curb lines** (`straightCurbLine` of the carriageway-outer leg + the cross-street leg, on the block side), then **subtract a keep-out quadrant** beyond both curbs so `block = tile − aFill` extends to the true corner. It moved the corner the right way (nearest-block-vtx-to-(174,208): **21.7 m → 13.7 m**). `git apply scratch/divided-false-corner-WIP.patch` to resume.
- **Bugs already fixed in the patch:** (a) cross-street must be matched as a street **passing THROUGH** the node (interior vertex), not just an endpoint (Mississippi is a through-street); (b) the measure side must be keyed to **point-order-forward** (reversal-proof), else a carriageway picks its median side (`pavementHW = 0`).

## The 3 remaining bugs (this is the work)
1. **Over-firing — 83 keep-outs vs ≈4 needed.** Fires per-tile × per-transition → −9040 m² over-removal ("disrupted elsewhere"). **Fix:** dedup `dividedTransitions`; generate one keep-out per *actually-cornered* block (gate to tiles whose curb genuinely bulges past the corridor lines), not every tile touching the node.
2. **Wrong block at the target.** At Mississippi×Lafayette only the **carriageway-A / north** keep-out fires (apex 179,218); the **SW target block (ring #20, false corner 214,216) never gets its carriageway-B (`lafayette-6`) keep-out** — B-side outer detection returns 0 in that tile's context. **Fix:** ensure the carriageway-B outer leg resolves its real `pavementHW` for the SW tile.
3. **Lands partial** (13.7 m off, not exact) — once 1 & 2 are right, confirm the keep-out quadrant fully covers FALSE→TRUE.

## How to work it (pitfalls that cost days)
- **Verify on the LIVE Survey tool — proxy SVG renders repeatedly misled** (orientation, which-tile, sign). Render only as a fast inner loop; the operator's eye is truth.
- **Axes: `+x = WEST, +z = NORTH`** (`reference_ls_local_frame_axes`). North-up/east-right render: flip BOTH (`screenX=(maxx−x)`, `screenY=(maxy−z)`).
- **Match the live tool:** `buildTileGround(..., { smooth: 0, cornerCornerRadiusOverrides, blockCustoms, ... })` (`smooth:0` hardcoded in `BlockGeometryV2Debug.jsx:273`). **No `ribbons.json` rebuild needed** — geometry is frozen; just edit `tileGround.js` + re-run a harness.
- **Numeric self-verify (gate before showing Jacob):** nearest-block-vtx-to-(174,208) → ~0; (214,216) excursion gone; total asphalt Δ **small & localized** (the −9040 must be gone); spot-check 2–3 other IXs (non-divided + a curved street) unchanged. A `dividedClamp` opt toggles the fix for OFF/ON diffs.
- **Harnesses:** `scratch/iter-miss.mjs` (before/after block at the corner), `scratch/confirm-target.mjs` (block + false/true/strokes), `scratch/pin-nw.mjs`, `scratch/clamp-ba.mjs`.

## Done definition
Both park corners build the clean two-leg corner at the true point (verified against `correct-target-*.json` numerically **and on Jacob's live tool**); no regression elsewhere (area Δ small/localized); ⛔ don't touch `skeleton.js`/`derive.js`/`ribbons.json` (Part 1 done) or `cornersAtIx` (dead). Then fold the fact into `RIBBONS §3.1`, retire this brief.
