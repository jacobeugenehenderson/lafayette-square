# BOZ MORNING HANDOFF — 2026-06-01 (~02:15, after a long night)

> Boz-to-Boz. Read this, then `cartograph/BACKLOG.md` (updated tonight), then the briefs named below. The throughline is intact; **do not re-litigate the pivot — build the spike.**

---

## THE ONE-LINE STATE
LS now renders the **real** surface for the first time in the session (fresh `--look=lafayette-square` bake, 01:52) — and **every sidewalk / treelawn / corner ribbon is wrong** (Jacob's eye, screenshot 02:14). That render is the **decisive confirmation of the pivot**: the figure-ground / mono-width ribbon construction is the doomed intermediate; **adopt the STROKE / gather-to-center construction** (`HANDOFF-stroke-construction.md`).

## DO THIS FIRST (morning, in order)
1. **Sanity-glance the screenshot verdict with fresh eyes.** It should still read as "ribbons broken wall-to-wall." If so, the pivot stands.
2. **Fix the bake-target wiring** (Vesalius's option #2). *Prerequisite* — until unflagged `bake-ground.js` stops writing the phantom `baked/default/`, every spike eval is another ghost (see §Bake-target ghost). Cheap. Likely: make unflagged target `lafayette-square`, or refuse a missing-look design.
3. **Draft + dispatch the toy STROKE SPIKE** (Boz drafts; warm → Vesalius). The cheapest decisive test: on toy, *stroke chains out → union → complement → stroke in per-fe → triangulate*, and watch — does a ribbon-width drag re-stroke instantly from a frozen edge? Do narrow blocks + both dead-end cases behave? Relief or trouble, on Jacob's eye. Bake-target fix is its **step 0**.
4. **Then** the 5 stroke-model decisions (below), informed by what the spike *shows*, not argued.

---

## WHAT THE SCREENSHOT SHOWS (concrete, for spike validation targets)
- **Sidewalks detached from asphalt** — cream strips float inside the green with a gap where curb→treelawn→sidewalk ordering should sit. The cross-section ordering is wrong, not just the widths.
- **Corners don't wrap** — strips stop short of the corner, leaving gaps; some overshoot. The 13-month corner failure, live.
- **Missing strips on some block edges** — the `silhouetteStraightEmitter`-drops-fes pattern (`[[feedback_silhouette_straight_emitter_skipped_fes]]`).
- **Mackay Place loop (top-left)** — the median loop's ribbon/cap handling is rough but roughly present.
- **Tan commercial block (bottom-right)** — ribbon edges broken there too.
- Net: the construction produces detached, gapped, non-cornering ribbons everywhere — "one construction fighting itself" (the stroke brief's exact diagnosis).

## THE DECISION (locked tonight) — PIVOT to the stroke model
`HANDOFF-stroke-construction.md` (Lodestar's brief, well-developed) — *one verb, "stroke a path":* Survey strokes chains **outward** into frozen hardscape (chains die = wall #1); Measure strokes the **complement inward** into ribbons; **LU = remainder; NEVER compute the medial axis — defer collapse to Clipper.** It **IS** the wall-move with one generative spine, and it dissolves the failure class we fought all night (figure-ground-as-a-step retires → no asphalt-union to flood → the customs-flood can't happen; + corner-saga / fillet-H1 / F1 / F3). **State: DECIDED + DESIGNED, NOT BUILT** — the toy spike is the first validation. Reuse-not-reinvent (Clipper, the R-kit, the Measure handles, W1 identity all carry).

## THE NIGHT'S CHAIN OF FINDINGS (the *why*, so you don't re-walk it)
1. **Frame-enrichment (Vesalius, P1)** — `OSM-FORENSICS.md` + `-EVAL.md`. Skeleton correctly enriched (79 deleted T-junctions → 0, typed nodes, tags carried, Dolman→18th understood). **Correct + banked, but invisible** (recovered verts colinear + enriched fields **dropped at the `derive.js` L2909 serializer** + downstream broken). **Staged-not-committed** (`skeleton.js` +211, `derive.js` +38). Keep — it's the foundation + the probe that exposed the rest.
2. **Render-path census (Vesalius)** — `RENDER-PATH-CENSUS.md`. The live path mapped. Key facts: the **emitter already collapsed to one path** (`emitBlockRingBands` both surfaces; legacy per-leg = parallel-dead). The skeleton **drives block shape** (`ribbons.streets`) — only intersections + faces bypass to raw OSM (`derive.js` two-source spine = the palimpsest's structural seam). **0% root = figure-ground customs-flood**, not the skeleton/emitter.
3. **The palimpsest (Jacob's meta-insight)** — `[[project_the_palimpsest_code_path_multiplicity]]`. Code-path multiplicity → fixes land on non-live code. New first-diagnostic: **"is this palimpsest again?"**
4. **The bake-target ghost (Vesalius's W1 check-in — the night's biggest catch).** Unflagged `bake-ground.js` → look=`default` → reads **MISSING** `looks/default/design.json` → `{}` → writes phantom `baked/default/` **that nothing reads**. The app reads `baked/lafayette-square/` (`INSTANCE.lookId`), which sat **stale since May-28** until Vesalius's fresh 01:52 bake. **So "LS at 0%" and "P1 not improved" were both verdicts on a May-28 ghost.** Memory `[[feedback_bake_ground_scene_clobbers_default_look]]` was INVERTED → corrected tonight. **The customs are FINE** — they resolve `HIT=true` in the real bake; the 4 LS customs are valid new-shape (`skelId.side.segOrd`), NOT a graveyard.
5. **The near-miss.** Boz greenlit a destructive customs **wipe** (on the wrong "broken graveyard" premise); the **check-in seam + Vesalius caught it** before any damage (`design.json` intact). **Lesson, twice tonight (the "bypassed sidecar" call + the wipe): verify the causal chain, not just the symptom.**

## THE 5 WALL-MOVE DECISIONS (locked tonight) — re-mapped under the stroke pivot
- **Q2 id scheme** = chain-anchored `(skelId, side, segOrd)` — ✅ shipped (`6b83798` + `src/lib/feCustomKey.js`). **Keep** (the inward strokes hang on it).
- **Q1 artifact** = in-memory freeze + persist to slab.
- **Q3 dead-ends** = **INCLUDE NOW** (Jacob's override — complete the freeze, no chain-tether; absorbs `HANDOFF-dead-end-typology`).
- **Q5 rename** = **RIDES WITH** the arc (discrete WR step; name lands when behavior is true).
- **⚠️ Q4 LS customs = clean-slate — RECONSIDER in the morning.** Its rationale was "broken graveyard." Vesalius proved the customs are **valid** (resolve HIT=true), and the 0% was the stale bake + the broken construction, **not** the customs. The ribbons are wrong *everywhere*, not just on custom streets → customs aren't the issue. Under the stroke pivot the construction changes anyway. **Open question: do we still clean-slate, or preserve the valid authored customs?** Don't wipe reflexively.

How the stroke model re-maps W1–W5: see `HANDOFF-stroke-construction.md` §"How this re-maps the wall-move decomposition" (W1 kept; W1b parked-dissolves; W2 folds into Survey bake; W3 = freeze the stroked hardscape; W4 bigger/cleaner; W5 unchanged).

## DISPATCH BOARD
- ✅ Osteopathologist (OSM forensics) — `OSM-FORENSICS.md`.
- ✅ P1 frame-enrichment — done, staged-not-committed, invisible-until-Layer-2. Keep/commit.
- ✅ Render-path census — `RENDER-PATH-CENSUS.md`.
- ✅ W1 identity keystone — shipped (`6b83798`, `feCustomKey.js`). Keep.
- 🔜 **Bake-target wiring fix** — NEEDED, prereq. Vesalius's #2. Not yet done.
- 🔜 **Toy stroke spike** — Boz to draft from `HANDOFF-stroke-construction.md` (§Validation surface is the spec); bake-fix as step 0; warm → Vesalius.
- 📋 `HANDOFF-boundary-trio.md` — drafted, fast-follow (circle-only / build-beyond-crop / systematic cull).
- 📋 `HANDOFF-wall-W1-identity.md` — refreshed to a finish-brief, but the **customs-finish is now moot under the pivot** (the construction changes); the identity itself stays. Don't dispatch as-is.
- ⏸ Onboarding / Provincetown / Overture — all parked (banked in BACKLOG); the night confirmed OSM is fine and the problem was never the data source.

## HOUSEKEEPING / WORKING-TREE STATE
- **Uncommitted:** Vesalius's P1 frame changes (`skeleton.js`, `derive.js`) + the fresh 01:52 `baked/lafayette-square/` + `baked/default/` phantom. `design.json` **intact** (customs NOT wiped). A/B backup of the pre-enrichment bake exists.
- **Commit call for the morning:** the P1 frame work is correct — commit it (don't lose +211/+38). The bakes are working artifacts. Decide whether to commit the fresh LS bake or regenerate after the bake-target fix.
- Memory updated tonight: `[[project_the_palimpsest_code_path_multiplicity]]` (corrected: skeleton drives shape), `[[feedback_bake_ground_scene_clobbers_default_look]]` (inverted→corrected), `[[project_two_bakes_two_walls]]` (three bakes / protoslab), `[[project_skeleton_is_the_first_bake]]` (Vesalius verdict), `[[project_corner_radius_is_design_control]]` (NACTO-by-class default R), `[[project_no_map_rotation_world_locked]]`.

## THE THROUGHLINE (Boz to Boz)
Tonight: walked all the way back to the root (the skeleton), proved the frame self-inflicted, mapped the palimpsest *down through the customs and the bake target*, dodged a wrong destructive wipe on the check-in seam, made the five wall-move calls, and then the render verdict confirmed the deepest call — **stop fixing the doomed construction; build the one that dissolves the problem.** The morning is the first real swing at the stroke construction. The frame is sound, the identity is shipped, the destination is designed. Draft the spike. 🦴
