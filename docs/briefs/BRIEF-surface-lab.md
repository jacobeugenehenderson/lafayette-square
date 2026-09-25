# BRIEF — The surface lab: one GL test environment for every procedural surface, dunes first

<!-- BRIEF-STATE
status: OPEN
dispatched: yes (2026-09-24)
written: 2026-09-24
evict-when: the lab runs the real environment on a real baked town; the boulders render identically in lab and map; context maps are baked from the scene and read by a surface; Provincetown's dunes are a surface Jacob has eyed at eye level, mid and overhead
-->

**Status:** DISPATCHED 2026-09-24 by Jacob (Boz drafted it).

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH, graphics.** You are building the **factory**, then its first new product.

- **Stop points** where you bring your design to Boz and Jacob before building: **§4** (the settings model) and **§5.1** (the dune look, after a first pass).
- ⛔ Don't write the row-crop surface. It comes next, in the lab you build (`BRIEF-field-shader.md`, to be updated with Jacob's season ruling).
- ⛔ Don't touch `src/lib/tileGround.js`, `mintProtopolygon` or ②/③. Plumb and Gantry are working there.

## Jacob's ask

> *"Let's hire a shader designer. We have two new novel surfaces which are integral to their environments: rowcrops and sand dunes. We need procedural color, texture, and geometry … The boulder helper app was very successful."*
> *"Perhaps we elaborate that harness out into a GL test environment."*
> *"There are many things I'd like to do: like a field with a brown edge but grass in the middle (just as an example.) Like where two trails meet the dirt around the union should get 'distressed'."*
> *"Let's shift the priority to getting the dunes up first, given we're making the factory."*

## 1. The template: why the boulder harness worked

`boulders.html` → `src/harness/boulders/` **imports the production pieces rather than copying them**:
- `components/InstancedBoulders.jsx`
- `components/revetmentMaterial.js`
- `lib/boulderGeometry.js`
- `lib/revetmentDrape.js`
- `lib/shoreChunks.js`

So what Jacob tuned in the harness is what shipped: generated near the camera, with zero slab bytes (`bee17a58`).

⛔ **The lab's one inviolable rule: import, never re-implement.** A lab with its own lighting or material is a second pipeline, and what looks right there will not match the map (memory `feedback_no_parallel_pipeline_for_scenes`).

## 2. What the lab is

One page (e.g. `lab.html` → `src/harness/lab/`). The boulder harness **moves in** as its first resident; ⛔ it is not rebuilt.

1. **The stage is a real piece of a baked town**, never a flat plane:
   - Provincetown's dunes;
   - a Huron field;
   - LS's park, **as the control:** its grass must render unchanged.
2. **The real environment**, through the sockets the grass already uses (`src/components/grassMaterial.js`, `applyWeatherToShader` from `lib/weather-uniforms.js`, sun altitude, the lamp pool):
   - time of day;
   - weather;
   - lamp light.
   ⭐ A surface that doesn't answer the sky looks painted.
3. **Controls:**
   - time of day;
   - **season** (row crops will need it; for dunes, test that it changes nothing it shouldn't);
   - weather;
   - camera presets: **eye level, mid, overhead**. ⭐ Judge at the close camera (memory `feedback_build_for_close_inspection_not_for_distance`): a surface that works overhead and reads as corduroy at eye level has failed.
4. **Context maps** (§3).
5. **A settings panel per surface**, in the one model §4 decides.

## 3. ⭐ Context maps: the core capability

Jacob's two examples are **one mechanism**: a distance derived from the map's own geometry drives a blend between two states of a surface.
- **Field edge:** brown near the edge, grass in the middle.
- **Trail junction:** dirt distressed around the union.

**It already half-exists:**
- `bake-ground-ao.js` (the Bake's last step, `cartograph/BAKE.md`) writes per-town rasters, **`ground.poolmap.png`** (R lamp pool · G contact shadow) and **`ground.colormap.png`** (albedo). Their contracts are in `SLAB-CONTRACT.md §3.1–3.2`.
- `BakedGround.jsx` already hands them to the grass shader.

**Context maps are more channels baked the same way, from the scene.** Candidates; **propose the set, don't assume it:**
- distance to the face / block edge;
- distance to a path or trail junction;
- slope and aspect (from `clean/terrain.bin`, the lidar);
- nearness to water;
- path density (wear).

**The rules that bind them:**
- ⛔ **Computed from the map, never painted by hand**, so they work in a town nobody has looked at (CLAUDE.md Layer 0).
- ⛔ **Resolution, fade distances and texel size are derived from the scene or authored per surface, never a constant that suits town #1** (Layer 0 Class D: *"a constant whose value happened to be correct for town #1"*).
- A missing input fails **loudly**. A town with no terrain has no slope channel, and says so. ⛔ It never gets a flat default (memory `project_a_sentinel_is_not_a_value`).

## 4. ⛔ STOP POINT: one settings model, decided once

Three open briefs each need authored surface parameters, and each was told not to invent its own home:
- `BRIEF-field-shader.md`: row bearing, spacing, headland, season;
- `BRIEF-water-shader.md`: wave scale, turbidity, shoreline band;
- `BRIEF-boulder-revetment.md`: it found it **needed none**.

**Measured 2026-09-20:** a land-use class can carry only **colour** today (`layerColors` / `luColors`). `materialPhysics` / `materialColors` are present, empty, and PBR-shaped, which is the wrong shape for a generator. *"a material says how a surface answers light; a generator says what structures exist and how they are laid out."*

**Deliverable before building:**
- the shape of a surface's authored settings **× context**, e.g. *"`agricultural`: dirt within 4 m of the edge"*, *"trail junction: distressed within 3 m"*;
- where it lives: per-town `design.json`? per LU class?
- how it reaches the bake and the runtime;
- how an operator override sits over a machine default (memory `feedback_the_override_is_the_product_never_measure_without_authoring`).

Bring it to Boz; it is decided once for every surface.

## 5. The first new surface: Provincetown's dunes

**The relief is already real.** Provincetown has 1 m lidar, −2.13 to 35.05 m, baked 2026-09-24 by Revetment (`cartograph/fetch-dem.mjs`, `clean/terrain.json`). ⛔ **Don't synthesise dune geometry.** Read it. The surface adds what the lidar can't carry:
- **sand colour and texture,** varying with slope, aspect, and dry vs wet near the water line;
- **wind ripples** at close range;
- **sparse beach grass on crests and lee slopes,** placed by context (slope / aspect / distance from the water), never by a hand mask.

⚠️ **Where 1 m of relief ends and surface detail begins is a scale question: answer it by measurement, not taste.**

**Prerequisites, and who owns them:**
1. **`natural:dune` has no land-use home.** It is 11 features in Provincetown, red in `node checks/claims-every-lu-tag-has-a-home.mjs`.
   - Jacob names dunes a surface of their own, so they become their own class, beside `beach` (`derive.js`, the `'natural:beach'`/`'natural:sand'` → `beach` map and `OSM_LU_DECLARED`).
   - ⚠️ `derive.js` is shared: check `git status` and commit only your own hunk.
   - Revetment asked that the dune class be decided **by someone who has seen the relief**. That's you, with the lidar open.
2. **The bay isn't water yet.** Revetment is on it (`cartograph/coastline.mjs`, the closed-ring arcs). The dune surface can be developed on the terrain and the land faces first. The wet-sand band needs the coast; coordinate with Revetment.
3. **Provincetown has no finished bake.** Develop on a scratch bake in a worktree under `.claude/worktrees/`, or on the terrain directly. ⛔ No pours into the shared tree; a pour needs Jacob's go in your window.

### 5.1 ⛔ STOP POINT: after a first pass, Jacob eyes it in the lab at eye level, mid and overhead

⭐ **The gate** (Jacob, 2026-09-20): *"is the element PRESENT and CORRECT?"* Don't tune for beauty. The one exception is a wrong element that looks plausible: a dune rendering as lawn, sand under water.

## 6. The checks

What is checkable, and must be (mutation-test each: seen to FAIL):
- the lab imports the production material and environment modules. A check greps that the lab defines no shader or lighting of its own;
- **boulders: lab vs map identical,** for the same stage, camera and time;
- each context channel is **derived from the scene** (mutation: substitute a constant → red) and **absent loudly** when its input is absent;
- LS's park grass is unchanged (the control);
- every `dune` face resolves to the dune surface.

## Read first

**Canon:**
- `ORIENTATION`;
- `cartograph/BAKE.md` (step 8, ground-ao);
- `SLAB-CONTRACT.md §3`;
- `docs/briefs/BRIEF-field-shader.md` §4 and its closing gate: the grass factory as template, and the parameter-home wall;
- `docs/briefs/BRIEF-boulder-revetment.md`;
- `arborist/ARCHITECTURE.md` (placement of sparse plants, if the beach grass needs it).

**Code:**
- `src/harness/boulders/*`;
- `src/components/grassMaterial.js`, `BakedGround.jsx`, `groundColorState.js`;
- `lib/weather-uniforms.js`;
- `cartograph/bake-ground-ao.js`.

**Confirm the brief's premises against the code and say what you found.** ⛔ If they disagree, stop and flag it.

## Coordination

The checkout is shared: Gantry (highways), Plumb (curb geometry), Revetment (terrain, coast), Wellhead (intake), Boz.
- Commit only your own paths or hunks (the `update-index` method in the pathspec memory note).
- ⛔ No stash, reset, rebase or branch switch.
- **Announce when your pour-path copy is NOT committed** (a pour reads the working tree).
- ⛔ Don't spawn a new dev server without asking; reuse the running one.
