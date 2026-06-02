# HANDOFF — Render-Path Census (pull up the carpet; find the subfloor)

> **Status: dispatch-ready** (Boz, 2026-06-01). **READ-ONLY forensics — a MAP, not a demolition.** Deliverable = a report. **Warm → Vesalius** (just traced `pipeline.js`/`derive.js`/skeleton) or **Plumb** (owns the chain-consumer-census this extends); cold fine.

## You are the cartographer of the code
**Name yourself** if fresh. You are not Boz. Your job: produce the **definitive map of the single LIVE path from raw data to the pixels Jacob sees** for LS — and inventory every dead / stale / parallel / bypassed layer around it. Diagnosis, not surgery. **Do not delete or edit anything** — evidence-before-excision; the report scopes the demolition, it doesn't perform it.

## Why you exist — the palimpsest
Jacob's diagnosis (2026-06-01), confirmed: the project has been built so many ways it's a **palimpsest — layers of carpet and linoleum** (dead/stale/parallel/conflicting paths from superseded iterations). The recurring symptom is *"oh wait, it wasn't even reading that"* — we fix code that isn't on the live path, so nothing changes. **The confirming exhibit:** Vesalius's P1 frame-enrichment was correct but produced **zero visible render change**, because the render's blocks + intersections read **raw `osm.json` via `pipeline.js`, NOT `skeleton.json`** — the artifact we *call* "The First Bake" is a partially-bypassed sidecar. We can't publish a clean LS while fixes miss the live path. **This census is the precondition to everything downstream** (Layer-2, the boundary-trio, the wall-move all collapse into one program once the live path is known).

## The deliverable — `cartograph/RENDER-PATH-CENSUS.md`, four parts

### Part 1 — THE single live path (raw data → pixels), both render surfaces
Trace and draw the actual artifact+code chain end to end. Known spine to verify/complete: `raw/osm.json → pipeline.js (reads osm directly, ~L28) → deriveLayers (derive.js) → map.json → promote-ribbons.js → src/data/ribbons.json → bake-ground.js → public/baked/<id>/ground.{json,bin} → BakedGround.jsx`. **Map BOTH render surfaces and where they diverge:** the **bake** (`BakedGround`, what Jacob hard-refreshes) AND the **Designer live render** (`BlockGeometryV2Debug.jsx` → `buildBlockGeometryV2` / `ribbonsGeometry.js`). Divergence between them is the [[project_ribbon_three_representations]] drift — name it.

### Part 2 — Where does the skeleton actually enter? (resolve the bypass precisely)
`skeleton.json` is read only by `skeleton.js`/`derive.js`/`migrate-overlay.js`/`serve.js`. `derive.js` IS called by `pipeline.js` (deriveLayers) **and** reads `skeleton.json`. **So pin the exact split: inside `derive.js`/`deriveLayers`, which derivations use `skeleton.json` vs the raw `osm` passed by `pipeline.js`?** Vesalius found blocks+intersections take the raw path — confirm and enumerate. State plainly: is `skeleton.js` even on the render's critical path, or is it produced-then-mostly-bypassed (the two-step `skeleton.js`→`pipeline.js` gotcha)?

### Part 3 — The carpet & linoleum inventory (every layer, with a verdict)
For each, give: **who reads/writes it · LIVE / DEAD / PARALLEL / BYPASSED · evidence**. Build on `HANDOFF-chain-consumer-census.md` (Plumb already mapped 33 chain-read sites — extend, don't redo). Cover at least:
- the **skeleton bypass** (Part 2) · the **dual emitters** (`emitBlockRingBands` vs `silhouetteStraightEmitter`+`buildFrontageBandsV2` — which is live for LS post-C5?) · known-dead funcs (`chainPavementRing`, `buildFrontageBands`) · the **customs two-regime graveyard** · legacy inputs (`centerlines.json`, `measurements.json`, `survey.json` — still read?) · the **vestigial bbox** vs the circle stencil · the **manual out-of-neighborhood cull** · scene-blind single-scene imports.

### Part 4 — The collapse-to-one-path plan
Recommend the prioritized path to **ONE live data→render source** (the doctrine: ARCHITECTURE "scenes route through one pipeline; parallel emitters = revert to canonical"; the [[project_two_bakes_two_walls]] wall-move). Show how **Layer-2 (faces+intersections on-frame), the boundary-trio, and the wall-move become facets of this one move**, and what to pull up first for the fastest honest LS render. Flag what's safe-to-delete-now vs what needs care.

## Bounds & guardrails
- **Bounded to the LS data→render path** — not an all-repo audit. Toy only as a "what a cleaner path looks like" contrast.
- **READ-ONLY. Delete nothing, edit nothing.** A map, not a demolition. Evidence-before-excision.
- **Verify every "this is dead/live" with an actual read-trace** — a proxy reading that disagrees with reality is void. Mark anything you can't confirm "unconfirmed."
- **Do NOT edit canonical docs.** Write the report (new `cartograph/RENDER-PATH-CENSUS.md`) + `scratch/` probes only. No git — Boz coordinates.
- Required reading: `HANDOFF-chain-consumer-census.md`, `cartograph/OSM-FORENSICS.md` + `-EVAL.md`, `cartograph/PIPELINE.md` (§Wall + the ladder).

## Deliverable
`cartograph/RENDER-PATH-CENSUS.md` — the four parts (the one live path w/ both surfaces · the skeleton-entry resolution · the LIVE/DEAD/PARALLEL/BYPASSED inventory · the collapse plan) — plus a closing summary: the 3–5 things to pull up first and the single-source target. Name yourself in it.
