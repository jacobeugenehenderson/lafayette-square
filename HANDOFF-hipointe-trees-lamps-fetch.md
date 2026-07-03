# HANDOFF — HiPointe-DeMun: trees + lamps DATA intake (the deferred follow-up)

**Agent: FRESH.** The HiPointe **bake→3D phase landed** (commits `b0284080` terrain · `17784239` buildings+StageEnvironment · `29c0b4fd` ghost-removal). HiPointe now pours a correct, LS-free slab and renders in 3D: its own terrain + ground + 5230 buildings, **honest zero trees/lamps, no LS ghosts.** This brief is the ONE deferred piece: give HiPointe its **own** trees + lamps. It was split out because both data sources have real problems (below) that need investigation, not a blind grind. Written 2026-07-02.

## Read first
1. `CLAUDE.md` route gate → `ORIENTATION.md` → `README §⭐ START HERE`.
2. `feedback_installations_are_independent` (the law), `project_hipointe_demun_pour_step0_landed` (the pour history + this landing).
3. `cartograph/BAKE.md` (terrain is now a per-Look slab artifact — see the bake chain) + `SLAB-CONTRACT.md`.

## What already exists (the plumbing is done — this is DATA + two small wires)
- **The bake handler + all bake scripts are installation-agnostic** (A/B/C). `bake-ground-ao.js` is scene-gated: a poured scene reads its OWN `lamps.json` (else none) and does NOT read LS's global `baked/default.json` trees. So the moment HiPointe HAS its own tree/lamp data, the AO contact-shadows bake correctly with zero code change to AO.
- **The generic `StageEnvironment`** (`CartographApp.jsx genericSceneConfig`) mounts `SlabBuildings` + `BakedLamps` (look-keyed). `BakedLamps` already reads `/baked/<look>/lamps.json` — so wiring HiPointe lamps is purely a bake-source fix (below), no render change.
- **Trees are the only unmounted consumer:** `InstancedTrees` is deliberately excluded from the generic env because it reads the GLOBAL `baked/default.json` (LS placements). See the two wires below.

## The work

### 1. Lamps — fix the prebake coord bug, then flip the source gate
- **⚠️ BUG found (not yet fixed):** HiPointe's `clean/map.json` `streetlamp` layer has 641 entries, but **all 641 sit at x 6883–8228 / z 1038–2805 — ~7 km outside** the ±1560 neighborhood frame (buildings/ground are correctly centered at ±1500). So the streetlamp layer is in the WRONG coordinate space (raw un-centered OSM, or a projection miss for that layer in prebake). This is a **SKELETON/prebake** bug (`derive.js` / the layer projection), not a bake bug. Fix it there so the lamps land in-frame.
- Then **scene-key `bake-lamps.js`'s SOURCE:** today it reads LS's `src/data/street_lamps.json` (its terrain is already scene-aware). For a poured scene, read the scene's own lamps (the fixed `map.json` streetlamp layer → `{x,z}` points). Serve.js currently **gates lamps to the default scene** (`isDefaultScene`) precisely so HiPointe doesn't inherit LS's — **remove that gate** once the source is scene-keyed.

### 2. Trees — fetch a census (City + County), then two wires
- **⚠️ Data source is NOT in the repo.** LS's trees came from a **manual ArcGIS REST export** (`scripts/raw/lafayette_park_trees.json` → `scripts/12-process-park-trees.py`), and it's **PARK trees only** (point-in-park-polygon filtered), not a neighborhood street-tree census. So there is no captured endpoint to mirror for a whole neighborhood.
- **HiPointe straddles the City/County line** (`admin_boundaries.json`, OSM rel 1180533): **Hi-Pointe = St. Louis City, DeMun = St. Louis County/Clayton.** So a full census needs BOTH:
  - **St. Louis City Forestry** tree inventory (find the ArcGIS REST FeatureServer on the City open-data portal — the service the LS export came from) for the Hi-Pointe side.
  - **St. Louis County** tree/forestry data for the DeMun side — **uncertain it exists**; County tree inventories are spotty. If none, DeMun legitimately gets no trees (or OSM `natural=tree` as a fallback).
  - Mirror the parcels City/County split pattern: `scripts/03-fetch-stl-parcels.py` (City) + `scripts/03b-fetch-stlco-parcels.py` (County), both scene-aware via `scripts/config.py`. Normalize both → one census schema, clip to the HiPointe boundary.
- **Then the two wires:**
  1. **`arborist/bake-trees.js`:** scene-key it to read the scene's census + write a scene/look-scoped placement file (NOT the LS-global `baked/default.json`). The handler runs `arborist/bake-trees.js --look default` (hardcoded `default`) inside the `isDefaultScene` branch — extend it to bake poured-scene trees to a scene-scoped path.
  2. **`InstancedTrees.jsx`:** make it read the scene/look-scoped placement file (its `BAKE_URL` is hardcoded `/baked/default.json`), then **mount it in the generic `StageEnvironment`** (`genericSceneConfig`, alongside SlabBuildings/BakedLamps). `bake-tree-anchors.js` is already scene-terrain-aware.

## Done =
HiPointe bakes + renders its **own** street lamps (in-frame) and its **own** trees (City + County census, or honest-zero where no data), with correct ground contact-shadows — no LS content, zero kit edits for the NEXT town. Every fix installation-agnostic.
