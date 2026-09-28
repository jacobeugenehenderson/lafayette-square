# BRIEF — What the player loads, from where, and when

**For:** a fresh agent, in the kit. **Written:** 2026-09-27, from a read of the player's code and
the files on disk (Lafayette Square, Provincetown, Huron). **Spec it serves:** The Ward's `README.md`
§7 — *"Anything the player can do that lets the slab carry less is good"*, and return visits that
load less every time. **Related:** `BRIEF-one-town-assembly.md` (much of this lands in the assembly),
ROADMAP **H5** (streaming-slab chunking).

> ⛔ Every size and count below was measured on 2026-09-27 and **will drift**. Re-measure with the
> commands given; never quote these numbers forward. Premises are claims — confirm each.

---

## 1. Findings, worst first

### ① First paint waits on the biggest file in town
`src/utils/terrainShader.js` fetches `terrain.json`, `terrain.bin` and `scene.json` with **module-level
`await`** (`let _terrain = await fetchTerrain(...)`, `let _sceneExag = await fetchSceneExag(...)`),
serially and uncached. Anything importing that module waits. Provincetown's `terrain.bin` is 18 MB.
Then `App.jsx` mounts the scene on a **fixed 1500 ms timer**, not on readiness.
- ⚠️ That this also holds back the splash is **inferred** from the import chain, not timed. Time it.
- ▶ `grep -n "await" src/utils/terrainShader.js` · `ls -l public/baked/*/terrain.bin`

### ② A few files are most of the weight
Provincetown: `ground.bin` 48 MB, `trees.json` **58 MB of JSON**, `terrain.bin` 18 MB,
`context.coastDist.bin` 9 MB. Lafayette Square: `trees.json` 8 MB, tree atlas PNGs 19 MB, tree GLBs
28 MB, hero impostor pages 20 MB.
- `trees.json` as text is the plainest win: placements are numbers, and a binary, quantised layout
  is a fraction of the size.
- ▶ `for t in public/baked/*/; do echo "$t"; ls -lS "$t" | head -8; done`

### ③ One town's data ships to every town
> ✅ **CLOSED 2026-09-27** — ▶ `node checks/claims-no-town-rides-in-the-bundle.mjs`. The star catalogue
> moved into `src/data/planetarium/`; the park loads as its own chunk behind its town's guard (deleted
> at the re-pour); the authoring store loads its bundled ribbons lazily; the street-lamp fallback and
> the runtime building-overrides copy are deleted (the bake applies overrides). The chunk every town
> preloads went from 2.92 MB to 437 KB. What follows is the finding as it stood.
Bundled into the app by static import, so every town downloads it:
- `src/data/ribbons.json` — 6 MB, one town's, in a chunk the app preloads (via `LafayettePark.jsx`).
- `park_water`, `park-polygon`, `park-feature-elev`, `street_lamps.json`, `buildingOverrides.json`,
  `src/data/buildings.json`, `streets.json` (254 KB, read only to count street names),
  `facade_mapping.json`, `menus.json`.
- Each also has a `loadInstanceData` manifest entry that nothing calls — the per-town seam exists
  and is bypassed.
- This is `BRIEF-ls-bleed-excision.md`'s class, in the bundle rather than the code.

### ④ Caching works against return visits
- **Re-downloaded on every load** (`?t=Date.now()`): `buildings.json` + `buildings.bin`
  (`SlabBuildings.jsx`), `trees-atlas.json` and `design.json` (`treeAtlasMaterial.js#buildMaterials`),
  one `ground.json` (`HorizonDisc.jsx`).
- **No token at all** (stale for up to the Worker's 300 s after a re-bake): terrain, the first
  `scene.json`, `labels.json`, `sources.json`, the atlas PNGs, the impostor KTX2 pages, the clouds.
- `useSceneJson`'s default token is the constant `production`: no protection after a re-bake.
- The contract's own scheme (`?t=<bakeLastMs>` on every file, `SLAB-CONTRACT.md` §1, §10.2) means a
  re-bake invalidates **every** file, changed or not.

### ⑤ The same thing, loaded more than once
- `scene.json` under four different URLs (`?t=production`, `?t=bakedAt`, `?t=Date.now()`, none).
- `ground.json` two or three times; `ground.colormap.png` decoded and uploaded twice (`BakedGround`,
  `HorizonDisc`).
- Seven building textures (3.9 MB) loaded by `LafayetteScene` on desktop for a layer production
  hides, and again by `SlabBuildings`.
- Building identity from two sources (the bundled roster and the baked `buildings.json`); listings
  in three layers (bundled, Apps Script `init`, `live/<town>/listings.json`).
- `sources.json` once per component that asks.

### ⑥ The player reads an authoring file
`treeAtlasMaterial.js` fetches `looks/<town>/design.json` — the authoring document — at runtime.
What the player needs from it belongs baked into the slab (`BRIEF-one-town-assembly.md` §5's
authoring separation, seen from the data side).

### ⑦ Shipped and never loaded
`public/textures/milky_way.jpg` (17 MB; its sphere is commented out), `public/models/lamp-posts/`
(~255 MB, one file used), `public/trees/` (~5.3 GB, copied into `dist/`), `public/data/landmarks.json`,
PNG twins beside the KTX2 impostor pages. Deploy weight, not visitor weight — but palimpsest.
- ▶ `du -sh public/trees public/models/lamp-posts dist/trees 2>/dev/null`

### ⑦a The repo's history carries the pours — and still grows
Packed history is ~4.7 GB. Until 2026-09-01 Publish committed the slab (`public/baked/`), 92 times for
one town's `ground.bin` alone; `e774d984` untracked it but removed nothing. **It still grows:** fetched
`cartograph/data/<town>/raw/` data (OSM, parcels), rosters, and `clean/map.json` (~10 MB, a dozen+
versions since 09-01) are committed on every pour and save. ⛔ **Jacob deferred the history rewrite
(2026-09-27) — do not do it unasked.** First decide what the repo tracks at all, ignore the rest, add a
check that fails on a large or regenerable file being staged; only then rewrite once.
- ▶ `git count-objects -vH` · the per-directory sum in the memory note
  `project_git_history_carries_the_pours`.

### ⑧ The town has three names and is resolved in several places
**Ruled (Jacob, 2026-09-27): one key, a single source of truth** — "the town, or the neighborhood, or
whatever we call the map." The name is still to settle; the rule is that there is one. This is new, not
old rot: build it as its own step.
- Files live under `baked/<look>/`, tree placements are keyed by *scene*, the installation by *map*,
  and `SLAB-CONTRACT.md` §0 spends a paragraph reconciling them. `theward-operations` has ruled
  **"a town's name is its address."**
- `resolveLookId()` is called independently by several consumers (`terrainShader`, `BakedGround`,
  `HorizonDisc`, …) rather than read once.
- The list of towns (`looks/index.json`) is bundled at build time, so a town poured after a build
  cannot resolve; an unresolved town falls back to `DEFAULT_LOOK`.

### ⑨ The clouds are global — and that is correct
`public/clouds/{almanac,presets,modulators}.json` serve every town, **by design** (Jacob, 2026-09-27):
the almanac anticipates weather conditions and is wired to each town's **local live weather**, so the
rules are kit-wide and the weather is the town's. Today the clouds are basic particle clouds; the
Meteorologist's **cloud species generator** will replace them with procedural clouds the weather draws
from. Not a bleed. (`SLAB-CONTRACT.md` §11 still says these files have "no runtime consumer" — rot:
`useAtmosphereDirective` fetches them. Rewrite that line.)

---

## 2. The proposal

**Accepted by Jacob, 2026-09-27:** the town manifest with content-named files (*"the return sounds
really good"*), one key, nothing but the manifest on the boot path, no town in the app bundle, and the
blur law. Findings ①, ②, ④, ⑤ are to be fixed now that everything they touch is in place.

### One manifest per town; everything else immutable
- A small **town manifest** (`baked/<town>/manifest.json`), fetched with `no-cache`, is the only
  file whose URL never changes. It lists every file of the slab **by content-hashed name**.
- Every other file is **immutable** and cached forever. A re-bake changes only the names of files
  that actually changed, so a return visit downloads only those.
- This replaces the `?t=` scheme entirely. Rewrite `SLAB-CONTRACT.md` §1 and §10.2 — not amend.
- The manifest also carries what the player needs to start (the town's identity, what it
  declares), so the bundled town list and the scattered `resolveLookId()` calls go.

### One key: the town
`baked/<town>/…` for everything the town owns — slab, placements, content. Retire "look vs scene
vs map" as three names for one thing, and rewrite the contract's §0 to say so. (Where a *look* is
genuinely a styling variant of one town, it is a field of that town's manifest, not a directory.)

### Nothing on the boot path but the manifest
- Terrain, `scene.json` and the rest load when the thing that needs them mounts, each once.
- The scene mounts when its manifest has arrived, not on a timer.

### No town's data in the bundle
Every `src/data/*.json` that belongs to one town moves under that town's slab or content, loaded
through the per-town seam that already exists. The app bundle carries no town.

### The ladders — after the cheap wins, ranked by bytes
1. **Shot rungs** (the Ward's README §7): rung 0 the manifest and content, rung 1 plan view
   (coarse ground, footprints and heights the player extrudes, top-down trees), rung 2 the movie,
   rung 3 street detail near the camera. A visit downloads only the rungs its screens use.
2. **The blur law** (`DownsamplePyramid.jsx`): the circle-of-confusion rule that picks a pixel's
   blur rung also bounds the detail that region can show. The movie's path and focus are authored,
   so the bake can know what the movie ever sees sharply, and ship the rest coarser.
   **The pyramid was built for phones** — Preview's tier emulator varies its resolution for exactly
   that. ⚠️ But production still excludes it on a phone: every pass that uses it is tagged
   `platform: 'desktop'` in `renderPipeline.jsx`, a fixed tag, not the Preview-measured, per-device
   inclusion its own comment promises ("the v0.2 measurement regime"). That is **aspiration, not
   rot** — surface it as work (the quality profile in `BRIEF-one-town-assembly.md`). Plan view has
   no depth of field, so there this law does not apply.
3. Each rung is **the real thing at lower detail**, never a stand-in; where rungs split comes from
   the town's data, never a size tuned on one town.

## 3. Order of work
1. Time the boot (①) and publish the byte table per town (②) — the numbers the rest is ranked by.
2. Remove the boot-path awaits and the timer; dedupe (⑤); drop `Date.now()` (④).
3. The town manifest, content-hashed names, one key — with the contract rewritten.
4. Move one-town data out of the bundle (③), under `BRIEF-ls-bleed-excision.md`.
5. Binary `trees.json`; then the shot rungs; then the blur law.
6. Clear the orphans (⑦).

## 4. Checks
- **Weight:** first-visit and return-visit bytes per town, on every build (the Ward's check).
- **Nothing fetched twice** in one visit, and **nothing with `Date.now()`** in a slab URL.
- **The bundle names no town** — no `src/data` file belonging to one town in the built chunks.
- **Every slab file is listed in its manifest**, and every listed file exists.
Each seen to fail first.
