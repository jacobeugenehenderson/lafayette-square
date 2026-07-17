# LS tree + lamp census recovery (forensic, 2026-07-16)

**Jacob's memory confirmed on both counts.** A richer lamp set (641) was collapsed to 80; a much
richer tree set (~7,600) already sits on disk unbaked. Almost nothing needs re-fetching.

## LAMPS — a real 641 → 80 regression, recoverable with NO fetch
- **Now:** `src/data/street_lamps.json` = **80** (33 OSM park-interior + ~47 procedural perimeter;
  **0 street lamps**) → baked `public/baked/lafayette-square/lamps.json` = 80.
- **Was 641** (real OSM `highway=street_lamp`) at initial commit `ce97343d`; cut to 80 at `962c45fb`
  when `scripts/14-generate-street-lamps.py` (procedural) replaced `scripts/13-fetch-street-lamps.py`.
- **Recover with no fetch:** `scripts/raw/osm_street_lamps.json` = **641 raw OSM elements**, TRACKED in
  HEAD + present in the working tree. `cartograph/derive.js:1085-1086` already routes the LS default
  scene to this exact file. Pipeline: `scripts/13-fetch-street-lamps.py` → (optional)
  `scripts/offset-lamps.mjs` (nudge OSM centerline → sidewalk edge) → re-bake lamps.
- **Template:** HPDM bakes 110 lamps straight from its own `raw/osm_street_lamps.json`.
- **DECISION:** pure OSM 641, or 641 + keep the ~47 procedural perimeter on top?

## TREES — the "fuller set" is already on disk (gitignored, unbaked)
- **Now rendered:** `public/baked/lafayette-square/trees.json` = **756** (park only) ← `cartograph/data/
  lafayette-square/clean/park_census.json` (756, City Forestry maps6, park-clipped). `arborist/
  bake-trees.js:421` hard-codes the LS-default source to **park_census.json only**.
- **The deleted `src/data/park_trees.json`** (`b11d9f4f`) was 756 → migrated into the census, **not lost**.
- **THE FULLER SET — present now, gitignored, NOT baked** (`cartograph/data/lafayette-square/clean/`):
  - `osm_trees.json` = **3,376** (OSM `natural=tree`)
  - `park_trees.json` = **2,635** (City Forestry maps9 full CITY_TREES inventory — NOT park-clipped)
  - `derived_trees.json` = **855** (NLCD canopy fill — synthetic verdancy)
  - → **~6,866 additional placements beyond the 756 park.**
- `arborist/bake-trees.js:419` already supports **an array of placement paths to UNION**; LS just isn't
  invoking it. **HPDM already bakes a City+OSM union = 5,527 trees** (proof the path works + renders).
- ⚠️ **AT RISK:** `git check-ignore` confirms `osm_trees.json` / `park_trees.json` / `osm_trees_raw.json`
  are **gitignored — local-only, gone on a clean checkout.** Regenerable via the scene-aware fetch
  scripts (`13-fetch-city-trees` maps9 · `14-fetch-osm-trees` Overpass · `16/17` canopy), but that's
  network + endpoint-dependent. **Commit them or accept the regeneration risk.**
- **DECISIONS:** (1) which layers to union — park (756) + city (2,635) + osm (3,376) + canopy (855)?
  (2) ⚠️ **park_census 756 likely OVERLAPS the city 2,635** (both City Forestry) → needs de-dup or
  double-count. osm (3,376) is disjoint by source. (3) protect the gitignored clean files?
- **PERF coupling:** ~7,600 all-mesh trees ≈ HPDM's 5,527 → makes the **tree impostor-LOD** work
  (Front B playback lever, `BATON-tree-render-next.md`, still parked) more load-bearing. Jacob's call
  that the headroom is there.

## Untapped (future intake, not needed for LS core)
Forest Park layer 4 `FORESTRY_TREES/MapServer/4` (~4,297) · Clayton Davey ~11k (no public REST) · bulk
`CITY_TREES.geojson` ~76 MB. Per `HANDOFF-hipointe-trees-lamps-fetch.md`.

## The clean recovery path (both rebuild-gated — ride with settling the uncommitted bakes)
1. **Lamps:** `scripts/13-fetch-street-lamps.py` (reads the tracked 641 raw) → re-bake lamps.
2. **Trees:** point `arborist/bake-trees.js` LS-default at the union (with de-dup) → re-bake trees;
   commit/protect the gitignored clean files first.
