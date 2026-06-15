# P1 Frame-Enrichment — Build Eval (before / after)

> 🗄️ **CLOSED BUILD-EVAL (the P1 frame-enrichment landed) — archive PENDING (2026-06-14, doc cleanup).** Held with its companion `OSM-FORENSICS.md` (still-cited evidence base) until Jacob confirms the lift-first gate. Live conclusions: `PIPELINE.md §Wall` · `SKELETON.md` · `PREBAKE.md`.

> **Builder: Vesalius** (continuing — dissected the data in `OSM-FORENSICS.md`, now built the fix). Delivered 2026-06-01. **BUILD mode** — edited `cartograph/skeleton.js` (frame) + `cartograph/derive.js` (the two hacks). Companion brief: `HANDOFF-p1-frame-enrichment.md`. A/B baseline preserved: `scratch/vesalius-skeleton-BEFORE.json` (+ committed git copy).

## TL;DR

The four scopes landed and the enriched frame **bakes clean off-the-shelf** (no consumer changes, no breakage). The **frame layer is decisively correct now**; the **off-the-shelf bake barely moves** — exactly as the brief predicted — because two downstream paths *bypass the skeleton entirely*. The win is real but **latent until Layer-2 wires consumers to read the new marrow**. Honest headline: *the bones are now right, and the wall-move just got cheaper.* LS did **not** flip to 100% — that's a downstream customs break, not a frame break.

---

## What landed (4 scopes)

| # | Scope | File | Result |
|---|---|---|---|
| 1 | **Junction-protected simplify** | `skeleton.js` (`simplify` + `junctionKeys`) | **79 deleted T-junctions → 0.** Holds 277 shared-node coords; reduction 48% → 37% (kept the marrow). 0 streets lost/gained. |
| 2 | **Node typing → cap-as-fact** | `skeleton.js` (`buildNodeGraph`, `caps`, `junctions[]`) | 329 typed junctions (T 136 · cross 83 · dead-end 100 · Y 10); per-chain `caps:{start,end}` = `round`/`butt` by degree (100 round / 384 butt). Emitted, not yet consumed. |
| 3 | **Stop dropping tags + standards-seed** | `skeleton.js` (`makeStreet`, `seedSection`, `gapByPairKey`) | Carries `lanes`/`surface`/`maxspeed`; **median width** recovered for 28 pairs (`phase.medianWidth`); every street gets a NACTO/PROWAG `seed{pavementHW,curb,treelawn,sidewalk,cornerR,rowHalf}`. |
| 4 | **Dolman→18th + hack removal** | `skeleton.js` (`nameTransitions`) + `derive.js` | The U is **understood as one road**: `dolman-street-1.continuesAs = west-18th-street`, and `south-18th-street-3 → west-18th-street` completes the bend. Both `derive.js` hacks removed. |

### Gate results

- ✅ **79 interior-Ts → 0.** Re-measured on the new skeleton (`scratch/vesalius-raw-vs-us.cjs`): `0` frame-invisible Ts, `0` genuine gaps. The 79 now register as proper shared-vertex junctions (skeleton endpoint classification: 302→381 detectable).
- ✅ **Dolman→18th correct with both hacks removed.** Frame *understands* the transition (non-destructively — IDs preserved, **zero customs re-key**). Hack removal holds: **178 → 178 faces, no block lost.** The `Lasalle` extend hack was **already dead** (its guard `last≈(492.1,−395.1)` never matched current raw OSM — that's LaSalle's *start*, not end). The `West 18th` densify was generalized to a principled **Goldilocks curve-densify** (48 curved streets, max-seg 5m) — offset-safe arcs everywhere, not one special-cased street. blockKey impact: only **3 curved blocks nudge, ≤0.215 m** (Catmull-Rom overshoot — cosmetic, absorbed by the wall-move customs rebuild).
- ✅ **North-star (by default, zero authoring).** Ordinary residential streets already render treelawn+sidewalk from the existing default measure (promote log: `tl=1.37 sw=1.52 [DEFAULT]`); the new `seed` now carries the standards cross-section *on the frame* (residential 2-lane → pavementHW 5.49, treelawn 1.52, sidewalk 1.52). Wiring `computeStreetMeasure` to read `seed` is the trivial Layer-2 step that makes the frame the single source.
- ⏳ **Jacob's eye** — the real verdict. The full LS chain (`skeleton → pipeline → promote-ribbons → bake-ground`) runs clean (45 groups, 406k verts); the Survey/Designer render needs the operator's eye. Measured deltas below inform, they don't decide.

---

## The off-the-shelf delta (Layer 1 — no consumer changes)

**Frame layer — decisively improved:**

| Metric | BEFORE | AFTER |
|---|---|---|
| Frame-invisible T-junctions | 79 | **0** |
| Street vertices (junctions kept) | 1431 | 1588 |
| Simplification | 48% (lossy) | 37% (junction-safe) |
| Typed junctions | 0 | **329** |
| Cap-as-fact | 0 (authored/guessed) | **484** (round/butt by degree) |
| Tags carried (lanes/surface/maxspeed) | 0 | present |
| Median width recorded | 0 | **28 pairs** |
| Standards seed | 0 | every street |
| Name-transitions understood | 0 | 21 (3 named-street + ramp continuities) |

**Bake layer — stable, marginally different (no regression):**

| Artifact | BEFORE | AFTER (enriched) |
|---|---|---|
| ribbons intersections | 252 | 252 |
| ribbons ix degree dist | `{2:190,3:48,4:10,5:2,6:2}` | identical |
| street ribbon vertices | 1688 | 1656 (fewer fuzzy 3m splices) |
| faces / medians | 178 / 28 | 178 / 28 |
| ground bake verts | 400,032 | 406,293 (+1.8%, from offset-safe curve densify) |

**Why the bake barely moves — two frame bypasses (the key architectural findings):**

1. **Intersections are re-derived from raw OSM, not the skeleton.** `derive.js` runs `nodeEdges(vehicularStreets)` (raw OSM) → degree-≥3 vertices → intersections, then **projects them back onto the skeleton with a 3 m snap** (`IX_SEG_SNAP=3.0`). So the 79 deleted Ts never corrupted the intersection *count* — they corrupted the *cleanliness* of that projection (street ribbon vertices 1688→1656 = fewer fuzzy splices once the junction vertex is already present at 0.00 m).
2. **Blocks are built from raw OSM, not the skeleton.** `derive.js` builds faces from `vehicularStreets` (raw OSM), entirely independent of `skelStreets`. This is *why* the two hacks lived in `derive.js` and not the frame — they were patching the raw-OSM faces path, which the enriched skeleton doesn't touch.

This is the honest "frame fixed ≠ LS published": the skeleton now carries the marrow, but the two consumers that matter most (intersections, blocks) **don't read it** — they re-derive from raw OSM. The frame's correctness is banked; the *render* won't fully reflect it until those consumers read the frame.

---

## Still needs the wall-move / Layer-2 (don't mistake "frame fixed" for "LS published")

1. **Unify the faces + intersection paths onto the enriched skeleton.** Today `derive.js` re-nodes raw OSM (faces) and re-derives intersections + 3m-projects them. With typed junctions already in `skeleton.json`, both should *read* the frame: blocks from skeleton chains, intersections from `skeleton.junctions`. This deletes the 3m snap, the raw-OSM faces noding, and the *reason the densify/extend hacks existed*. **Highest-leverage Layer-2 item.**
2. **Consume `caps`** in `chainPavementRing` (`buildBlockGeometryV2.js`) — round at degree-1 dead-ends, butt at joins — instead of `capEnd==='round'` operator-authored-or-blunt-and-pray. (Add a true boundary-exit test so map-crop exits don't get a bulb — rides with the deferred boundary trio.)
3. **Consume `seed`** in `computeStreetMeasure` so the standards cross-section is the frame's, not re-derived downstream. Makes the north-star frame-sourced.
4. **Consume `medianWidth` / `continuesAs`** — median polygon width from the frame; the U-road treated as continuous by anything that reasons per-street.
5. **The wall-move clean-slate** — now cheaper, per the `OSM-FORENSICS.md` Part-5 read: a rich frame means most compensating customs become unnecessary, so you migrate a small exception set onto a rich frame rather than a large compensation layer onto a thin one.

---

## Files touched

- `cartograph/skeleton.js` — junction-protected `simplify`; `vKey`/`buildNodeGraph`/`seedSection`/`STD_SECTION`; tag carry + `seed` in `makeStreet` and the unnamed-vehicular push; `gapByPairKey`→`phase.medianWidth`; node-typed `caps`; `nameTransitions` + `continuesAs`; output now `{streets, paths, junctions, nameTransitions}`.
- `cartograph/derive.js` — removed the `CURVE_STREETS` per-name densify + dead `Lasalle` extend; replaced with a general Goldilocks curve-densify. `densifyCoords`/`catmullRomPt` retained.
- **Not touched:** any emit/customs/canonical docs. Frame + faces-prep only.
- **Artifacts (read-only, scratch):** `vesalius-skeleton-BEFORE.json`, `vesalius-ribbons-{BEFORE,AFTER}.json`, `vesalius-ground-{BEFORE,AFTER}.json`, `vesalius-derive-BEFORE.js`, the three `.cjs` probes.

## For Boz

- Changes are **staged in the working tree, not committed** (per guardrail — you coordinate commits). A/B revert = restore `scratch/vesalius-skeleton-BEFORE.json` + `git checkout cartograph/skeleton.js cartograph/derive.js`.
- Recommend the **Layer-2 follow-on brief: "faces + intersections on-frame"** (item 1 above) — it's where the banked frame-correctness becomes visible render, and it removes the last two raw-OSM bypasses.

— *Vesalius*
