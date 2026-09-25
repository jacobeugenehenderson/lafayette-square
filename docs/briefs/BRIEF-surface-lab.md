# BRIEF — The surface lab: one GL test environment for every procedural surface, dunes first

<!-- BRIEF-STATE
status: OPEN
dispatched: yes — Marram, 2026-09-24
written: 2026-09-24 · state rewritten 2026-09-25 (dispatch text: cartograph/_archive/BRIEF-surface-lab-dispatch-2026-09-24.md)
evict-when: Provincetown's dunes are a surface Jacob has eyed at eye level, mid and overhead in the lab
-->

Jacob: *"Let's hire a shader designer … rowcrops and sand dunes … The boulder helper app was very
successful … elaborate that harness out into a GL test environment."* Dunes first; row crops next,
in the same lab (`BRIEF-field-shader.md`).

## 1. The rule: import, never re-implement
The lab mounts the map's own components; it owns controls and cameras only.
▶ `node checks/claims-lab-imports-never-reimplements.mjs`

## 2. The lab — BUILT
`lab.html` → `src/harness/lab/`. ▶ `http://localhost:5173/lab.html?look=<look>&at=<stage>&cam=eye|mid|overhead&as=<surface>`
- **Stage** by name, read off the slab: `class:<id>` · `revetment` · `steepest` (`stage.js`).
- **Environment**: Preview's mounts (sun/sky/weather/lamps/post). Time = solar hour at the town's
  longitude + month; weather through `useSkyState.setWeatherTargets`, the live poller's socket.
- **`as=`** renders the stage's class with another surface through `BakedGround`'s `surfacesOverride`.
- **Ground normals** A/B (`uTerrainNormals`, ships at 1).
- **Boulders** = the map's `SlabRevetment` on the real shore. The old harness is archived
  (`cartograph/_archive/boulder-harness-2026-09-24/`); `boulders.html` redirects here.
- ⚠️ Chrome does not composite a hidden tab's canvas and R3F will not initialise in one: eye it in a
  visible window.

## 3. Context channels
Raw metres, baked from the scene, absent by name. Texel = the smallest band in use; while every band
is [U], the terrain grid step (the manifest's `texelFrom` says which).
- **`coastDist` — BUILT**: `cartograph/bake-coast-distance.js`, a Bake step after `revetment`; the
  shoreline is `cartograph/shoreRuns.mjs` (one reader for every bake). Contract: `SLAB-CONTRACT §3.3`.
  ▶ `node checks/claims-coast-distance-is-the-coast.mjs`
- Slope/aspect: read in-shader off the terrain the slab already ships (`terrainShader.js`).
- Not built: edge distance, trail junctions, wear.

## 4. The settings model — DECIDED (Boz, 2026-09-24)
`cartograph/surfaces.mjs`: class → surface (`SURFACE_OF_CLASS`, replacing `GRASS_FACES`), and each
surface's parameters with a unit and a source — **physics** (a `references/` finding id) · **derived**
(from the scene) · **authored** (neutral default). A parameter without its source is ABSENT and
`BakedGround` names it. The operator's layer is `design.json#surfaces` → `scene.json#surfaces`
(`SLAB-CONTRACT §4`). ⛔ No parameter home elsewhere.

## 5. Dunes — OPEN
- **Class**: `natural:dune → dune`, beside `beach` (both `hard`). ⚠️ The tag is the smaller half:
  ▶ `node scratch/marram-sand-relief.mjs` (MassGIS-labelled coastal dune sand dwarfs `natural:dune`).
- **One sand generator** for `beach` + `dune` (Boz ruling): dune state from **slope at the terrain
  grid step**, between the town's own beach-band slope (derived) and dry sand's repose angle
  (physics). Built: the sand surface (class colour + mottling). Not built: the dune state, wet sand,
  ripples — each a named absent parameter.
- **Scale**: the baked grid is 5 m; the 1–5 m band of the 1 m lidar is surface work.
  ▶ `node scratch/marram-relief-scale.mjs`
- **Blocked on**:
  1. `q-dry-sand-repose-angle` and `q-beach-band-width` — [U] (`node checks/claims-references-are-sound.mjs`).
  2. Sand faces do not reach the land-use vote: compound polygons are refused, and the centroid-in-one-face
     vote would drop them again (Revetment, probe `0f113398`). Ruling with Boz.
  3. Provincetown's slab: a Bake that completes past `ground` (terrain datum is now `water`).
  4. The wet band draws only when `terrain.json.datum === "water"`.
- ⛔ **Stop point**: Jacob eyes the first dune pass in the lab at eye, mid and overhead — present and
  correct, not tuned.

## 6. Checks
Lab imports only · every `__water__` run survives the dedupe · coastDist is the distance and absent by
name · terrain normals from the grid step · tree cards start at the ground · anchors carry their terrain:
`claims-lab-imports-never-reimplements` · `claims-coast-distance-is-the-coast` ·
`claims-ground-normals-come-from-the-terrain` · `claims-a-tree-card-starts-at-the-ground` ·
`claims-anchors-know-their-terrain`. Not yet a check: every `dune` face resolves to the sand surface
(no baked town has one).

## Coordination
Shared checkout: commit only your paths; no stash, reset, rebase or branch switch; `scripts/bake-in-flight.mjs`
quiet before saving anything `cartograph/serve.js` imports (it runs under `--watch`).
