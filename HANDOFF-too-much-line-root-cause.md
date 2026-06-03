# HANDOFF — The §Wall / "better bones": simplify the skeleton to polygon-ready BEFORE Survey

**State:** IN-FLIGHT — diagnosis DONE; **reframed 2026-06-04 from "too-much-line tweak" → the §Wall / better-bones program** (the documented highest-leverage item; the doctrine was in the canon all along). Fresh agent (Chord) on it. **Domain:** cartograph SHAPE — `skeleton.js` (the First Bake) → `derive.js` → `tileGround.js`. **Drafted/diagnosed:** Boz + Jacob + the root-cause agent, 2026-06-04.

---

## The goal, in the canon's own words (read these FIRST — they are the brief)

This is not a new problem. It is the **Data Wall**, and the doctrine was written down:

- **`PIPELINE.md §Wall` (L50) — "The Skeleton is The First Bake" (Jacob's words, memorialized):** *"By the time the operator leaves the Survey tool, we should be holding an **extremely simplified, polygon-ready dataset** — and chains should be **dead**. The Data Wall should sit at **P2**."*
- **`PIPELINE.md` P1 §Optimize (L95) — the lever, named:** *"the simpler this output, the healthier everything downstream — **chain/node minimization (Douglas-Peucker on OSM saw-tooth) is the lever** that would let the Data Wall move to P2."*
- **`FEATURES.md` (L23):** *"Most regressions in this repo trace to someone re-deriving a **points-and-chains framing for a problem the polygon system already answers**."*
- **`cartograph/BACKLOG.md` — the "better bones" item** (boundary-trio): names the two failures verbatim — **over-noding** ("3M segments in a chain → Douglas-Peucker / Visvalingam") + **intersection consolidation** ("680 nodes in one IX → one logical node"); flags it *"possibly the highest-leverage item on the board"* (clean IX bones also relieve the corner saga); **survey prior art, don't reinvent: `osm2streets` (A/B Street) intersection-consolidation pass, OSRM/Valhalla/GraphHopper cluster+simplify, JOSM validator.**
- **Doctrine memory:** `project_skeleton_is_the_first_bake`.

**Operator's acceptance image (Jacob, 2026-06-04):** *the park block should be ~**4 corner points**; the whole map scrubbed of errant thorn-points* **before** it reaches Survey. That is "polygon-ready."

## Why the thorns exist — the §Wall debt, made visible

The thorn / bulge-bow / "dead-end triangle" cluster is **one root: the skeleton is NOT simplified to polygon-ready**, so OSM saw-tooth noise propagates into Survey, and the inward band offsets wander/cross/pinch. Three layers compound — **and two of them put the noise BACK after any simplify** (the reconciliation is the crux):

1. **The frame is over-noded** — `skeleton.js` carries far more vertices than the geometry warrants (Benton's teardrop loop = **29 pts** where ~5–13 suffice; a clean block edge should be ~2). The existing `simplify` is a weak *local* filter (perp<0.2m AND turn<2°) — useless on curves.
2. **`derive.js:1146` RE-DENSIFIES** every curve >12° back to **5m segments** (`densifyCoords`/`catmullRomPt`, `CURVE_MAX_SEG=5`). **This is pre-tile code** — its stated job (`derive.js:1128`) is the *figure-ground block-face offset*, the dying path. **It actively undoes a skeleton simplify.**
3. **`tileGround.smoothChain` (`:614`) re-smooths ×4** (count-based, ~+3 pts/seg) → Benton 29 → ~113. Not idempotent (`smoothCenterline.js:63`): re-sampling an already-dense line injects ripple → offset crossings.

**Verified (read-only):** Benton frame **29 → render ~113**; the 29 sits at exactly `derive`'s 5m spacing (smoking gun). Diagnosis verdict = **both frame over-noding AND render ×4** (not one or the other).

**NOT this brief:** the **Truman south-of-Park median** (real one-sided cross-street junctions → `TRUMAN-FORENSICS.md` addendum, D3/D8) and **Park-Ave's single sparse-chain thorn** (corner/junction) are *separate* threads. The dead-end prune was a symptom-patch on this root → **stood down** (Bollard, parked + backed up). **Do NOT prune by shape.**

## The fix — ONE simplification authority that survives to Survey

Polygon-ready means: **simplify aggressively, junction-protected, and don't let anything re-noise it downstream.** Implement as **validated sub-steps — NOT one bundle** (`RIBBONS §7` lesson: validate each before bundling, so a regression isn't confounded):

**1. Aggressive junction-protected simplify in `skeleton.js` (the First Bake).** Junction-protected global Douglas-Peucker / Visvalingam, tuned toward **polygon-ready** (block edges → near-essential points; the "4-corner park"), not the timid 0.2m local filter. → re-bake → verify.
   - ⛔ **HARD GATE — junction protection.** The old junction-*blind* `simplify` (`:375`, devTol 0.2) **DELETED 79 interior T-junctions** (Osteopathologist/Vesalius, `OSM-FORENSICS`). Vesalius's junction-protected version landed but only 48%→37% (too timid). **Build on that `junctionKeys` protection surface — do NOT re-derive it.** Verify junctions are **preserved exactly (before==after at every eps)** against `OSM-FORENSICS` — the current production baseline is **329** junctions (note: the prototype's 338 was a re-runnable extractor; reconcile but invariance-before-after is the gate). If a node would move/drop, **STOP and flag Boz.**

**2. Neutralize the downstream re-noising (the reconciliation — without this, step 1 is undone).**
   - **`derive.js:1146` curve-densify** — it re-adds 5m points after the simplify. It's pre-tile (figure-ground block-face). Neutralize for the tile path **without regressing** parcel/face curve boundaries (`derive.js:1581-1617`) which also consume densified curves — decouple "densify for parcel geometry" from "the street centerline points that reach `ribbons.streets`."
   - **`tileGround.smoothChain` (`:614`)** — make smoothing a **single authority**: density by **arc-length, not ×input-count** (robust to any input density), so it neither re-densifies an already-clean frame nor under-samples a sparse one. Preserve wide-ribbon kink-freeness (grade-sep, `tileGround:967`).

**3. (Sibling, evidence-first) Intersection consolidation.** The other named "better-bones" failure — over-noded / multi-node IXs (the 680-node case; dual-carriageway multi-node junctions). **Survey `osm2streets` first** (don't reinvent); characterize before excising (`evidence before excision`). May be a follow-on brief rather than this pass — scope it after step 1/2 land, since clean IX bones are the lever on the corner saga.

**Acceptance (Jacob's eye + metrics):** the **park renders as a ~4-corner block**; thorns/bulge-bow gone across the map (Benton + straights); junctions preserved (before==after); the simplified frame **survives to the Survey render** (not re-densified). Report after each sub-step **before** the next.

## Build sequence
```
node cartograph/skeleton.js
node cartograph/pipeline.js --skip-elevation
node cartograph/promote-ribbons.js --scene=lafayette-square
node cartograph/bake-ground.js --look=lafayette-square   # ⚠️ must pass --look
```
View live in the **2D Survey** (renders live from `ribbons.json` + `tileGround` — the bake is for 3D Stage/Preview, not needed to see this).

## Coordination / boundaries
- **Branch off trunk `cartograph-looks-pass-ab` in its own worktree** (`isolation: "worktree"`; Chord is in `../lsq-chord-toomuchline`).
- **⚠️ HOLD THE BAKE / don't merge to trunk** — ONE integrated bake after the fix (joins D1 + grade-sep already in base).
- **Canon docs off-limits to the agent** — Boz folds into `PIPELINE §Wall`/P1 + `RIBBONS §3.9a` + `project_skeleton_is_the_first_bake` after it lands.
- Report each sub-step before proceeding.

## On landing (Boz)
- Fold into canon: `PIPELINE §Wall`/P1 (the wall reaches P2 — skeleton is polygon-ready; the single-simplify + single-smooth authority; derive's curve-densify retired-for-tiles) + `RIBBONS §3.9a` (thorns are upstream §Wall debt, not a corner-R/capacity clamp).
- **Knot test:** does the polygon-ready frame **evaporate** G12's capacity-guard need + the dead-end residual? (one fix, N symptoms — flip those ledger rows).
- Re-check Bollard's deferred **Missouri Ave +4231 m² flood** on the fresh topology.
- Resume the consolidated eyeball (`scratch/eyeball-checklist-post-deadend-bake.md`) on the integrated bake. Retire this HANDOFF → NOTES.
- Then scope **intersection consolidation** (osm2streets) as its own better-bones brief — the corner-saga lever.
