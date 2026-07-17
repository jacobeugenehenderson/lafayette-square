# Note to Boz — LS statistical planting LANDED (+ new lanes opened)

**From:** the agent you briefed via `HANDOFF-ls-statistical-planting.md`. **Date:** 2026-07-16.
**Status:** ✅ landed + **eye-gated by Jacob on the lit app** ("my heart is singing… so much more stunning than anything we've done"). On trunk `curb-offset-draw`, **not pushed** (Jacob pushes when happy).

## What landed
LS went **756 (park-only) → 5,768 trees, 100% REAL** — City Forestry (2,486) + OSM (3,282) on the frozen-curb `makeZoneTester` mask. Median NN spacing 6.9 m (believable street trees), 0 illegal, park intact.

**Commits:** `b11d9f4f` (Phase A — normalize off `DEFAULT_SCENE`, frozen-curb mask, `source` provenance, one-button `--zone-shape`/`--boundary` flag-gap fix) · `0ba8f3e2` (Phase B, *superseded*) · **`7bcecfe1`** (final — City+OSM real-only, wells tracked).

## ⚠️ Two ways it diverged from your brief (Jacob's calls, mid-flight)
1. **Park distinction ditched.** Your recovery findings were right that the wells existed — and I confirmed **`park_census` is 99.2% redundant** with the whole-hood City inventory (750/756 coincide at 3m; `park_census` is City Forestry too, not hand-authored). So per Jacob: **no park-wins-in-park, no separate park well in the bake** — union is just City + OSM. `park_census.json` kept on disk as an authored reference, not baked. (The park-polygon dedup I'd built for the distinct-well model was reverted.)
2. **Real-only.** Dropped the NLCD `derived_trees.json` synthetic fill (Jacob: "real trees everywhere we have them"). LS's inside-city coverage makes synthetic unnecessary.

## Anti-regression (Jacob: "make sure this doesn't happen again")
The real census wells were the gitignored-`clean/` set that let 6,866 real placements sit unbaked while LS rendered 756 (your `CENSUS-RECOVERY-FINDINGS.md`). **Moved `park_trees.json` + `osm_trees.json` OUT of gitignore** (allowlisted) — the census can't be lost on a clean checkout now.

## Where to look
- Memory: **[[project_ls_tree_census_city_osm_real_only]]** (full detail + follow-ups).
- Scripts now scene-homed for LS: `config.py` gained `SCENE_CLEAN_DIR`/`SCENE_RAW_DIR`; `DEFAULT_SCENE` guards dropped in `scripts/13–17`.
- Flagship roster preserved (didn't adopt `scripts/15`'s derived roster — 48% collapses to `generic_tree_2`/`procedural_*` with no index variants); merged the species map.

## Open follow-ups (non-blocking)
- `TREE-INTAKE.md §Hardscape mask` is **stale** (still describes `makeForbiddenTester`) — needs the `makeZoneTester` rewrite.
- A re-run of `scripts/15` clobbers the **merged** `tree-species-map.json` → add a tracked overrides file.

## New lanes Jacob opened this session — where they landed → **`HANDOFF-hero-impostor-and-startup-weight.md`** (the full brief)
1. **HERO-view weight / canopy-only impostor** — DESIGN SETTLED, tabled for a sleep (2026-07-17). Driver: the `?loadAudit` profiler measured LS's cold load at ~103 MB real assets, ~73 MB of it TREES (`lod1` GLBs 39 MB + atlas 28 MB). Jacob's screenshot proved the hero trees are a distant dense canopy sea with **no visible trunks** → **ditch the trunks for the far impostor**; a **canopy-only nested-band billboard** authored the same way the overhead impostor was (re-aimed low + side-on), trades ~39 MB `lod1` for ~5–8 MB baked billboards. Open dials: nesting depth + azimuth count (↔ hero-move). ⚠️ armed `ImpostorSpecies` Matrix4 aliasing bug to fix first. NOT a switch — a real editorial surface. **Read the brief.**
2. **Startup load-in — BUILT (uncommitted, awaiting verify):** `?loadAudit` cold-load profiler (`src/lib/loadAudit.js`, opt-in) + **overhead lazy-gate** (`useOverheadWarm`) — 60 overhead PNGs no longer load during the hero shot. Also identified: **KTX2 the atlas** (28→~5 MB) as the surer independent weight win. Not committed pending Jacob's device/Preview verification.
3. **Preview integration PENDING** — the cold-load spike is Preview's named crash-on-transition vector; proposed wiring `loadAudit` in as a cold-load budget gauge against a named device (Preview v0.2). Awaiting Jacob's aim (a: build now / b: defer).

## Not my lane (yours) — noted
Lamps 641→80 regression — you fixed at `7be5c567` (Jacob confirmed he told you). LS `neon` = the separate warm agent (`NeonBands.jsx`). Kept both untouched in all my commits.
