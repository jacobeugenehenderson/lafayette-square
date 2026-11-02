# Foundry — making the Slab

> **Status: v0.2 (2026-07-04; base v0.1 2026-06-09) — topic-doc + scene-generic Foundry / boundary cull.** The keystone Reference for the **Foundry** (step 07). Grounded against the live orchestration in `serve.js` (the `/looks/:id/bake` handler) and the `bake-*` scripts it runs. ⚠️ **Cite the SYMBOL, never the line** — this doc's line numbers had drifted by ~1,400 lines and landed readers nowhere near the code, not assembled from prose. Part of the front-half rewrite spec — the doc that was missing between **Section** and **Look**. Paired with **`STAGE.md`** (the Look step whose output the Foundry freezes) and **`SLAB-CONTRACT.md`** (the output format, owned by neither app).
>
> The Foundry is **both** an *idea* (step 07 — `… Section → Foundry → Slab`) and a *thing* (the artifacts under `public/baked/<look>/`). This doc owns the *how*: which scripts run, in what order, what each freezes. It does **not** re-document the Slab's byte format — that is `SLAB-CONTRACT.md`'s job, referenced never duplicated.

---

## 0. What the Foundry is

The **Foundry** turns the frozen pipeline (`map.json` → `ribbons.json`) plus the active Look's authored intent (`design.json`) into the **Slab** — the read-only static artifacts under `public/baked/<look>/` that the LS runtime mounts.

⛔⛔ **A FOUNDRY RUN ENDS ON DISK; PUBLISH IS THE UPLOAD (2026-10-05).** `public/baked/` is gitignored and the Slab is served
from R2, so nothing the Foundry writes reaches anyone until Preview's **Publish** uploads it to staging (and fails loudly if
the upload does); Promote alone writes production. ▶ `node checks/claims-a-bake-never-uploads.mjs`. Operator view:
`cartograph/OPERATIONS.md §Foundry`. Mechanics: `PUBLISH.md §6`. It is the boundary between the **authoring** world (cartograph: stores, live re-derivation, the operator's eye) and the **runtime** world (LS: trust the Slab, never reach back).

Two load-bearing facts:

1. **The Foundry is one button, not a sequence the operator runs by hand.** The `/looks/:id/bake` handler rolls the whole chain — re-derive the pipeline, run every sub-step, build the AO — into a single async POST (`serve.js:461`). "Edit, run the Foundry, see" works because every step the operator might forget is inside the button. The Designer's "Look →" does not run it: it opens Look, which offers a Foundry run when the Slab is older than what the Foundry reads (▶ `node checks/claims-a-stage-entry-knows-its-slab-age.mjs`); Look's **Foundry** button runs it in place. *(`ARCHITECTURE.md §3`.)*

2. **The Foundry is the second freeze.** The pipeline freezes **twice** (`ORIENTATION §3 (the Wall)`, `[[project_two_bakes_two_walls]]`): the **first** is the Seal (chains die → polygons), the **second** is the Foundry (the look **store** dies → `scene.json`; the live geometry → `ground.json/bin`). Past the Foundry, nothing authoring-side exists — the runtime sees only frozen files. **The Foundry captures a snapshot; it does not author.** Its correctness is therefore exactly the correctness of its inputs (see §4 — the curb-freeze gate).

---

## 1. The artifact chain

| | |
|---|---|
| **Inputs (per scene)** | `clean/map.json` (skeleton+derive), `src/data/ribbons.json` (promote-ribbons), the raw set (`osm.json`, `measurements.json`, `centerlines.json`, the DEM — a `.tif`, an `elevation/` directory or the `elevation-sources.txt` URL list — `overlay.json`, `skeleton.json`, `src/data/buildings.json`), `park_trees.json` / `park_water.json` / `street_lamps.json` (LS-only) |
| **Input (per Look)** | `public/looks/<id>/design.json` — the operator's authored styling/shape intent (live autosave; see `STAGE.md §4`) |
| **Who builds it** | the `/looks/:id/bake` route (`serve.js`), every step through `runStep` (`runIfDirty` when it can be dirty-skipped) |
| **Outputs (the Slab)** | everything under `public/baked/<id>/` — see §2 for what each step writes, and **`SLAB-CONTRACT.md`** for the byte format. ⛔ **Written there, but PUBLISHED to R2** — the tree is gitignored and Publish uploads it (§0) |
| **Who consumes it** | the **runtime** (LS app) and the cartograph **Look** / **Preview** players — read-only; a published town serves the Slab under content names that cannot go stale, and on disk the server revalidates every read (`src/lib/slabUrl.js`; Preview is the inspection surface — `PREVIEW.md`) |

⚠️ **The Foundry re-derives first.** For every scene with a `raw/osm.json`, `pipeline.js` + `promote-ribbons.js` run inside the Foundry, so an authoring edit (`overlay.json`, `skeleton.json`) re-derives `map.json` → ribbons before the geometry is made. A scene without OSM skips both, said by name. `POST /:scene/pour` runs the same two steps and then the rest of the Foundry.

---

## 2. How it builds — the chain, in order

**Dirty-skip, by content.** `runIfDirty(label, inputs, outputs, cmd)` re-runs a step when its CODE (every declared script's whole import closure) or a declared DATA input differs by content from what it read when it last ran, or an output is missing. The record is `clean/bake-reads.json` (`pour-code.mjs` `contentRecord`); no record ⇒ the step runs. A date that moved alone — a checkout, `writeIfChanged`'s touch — re-runs nothing. A step that reads a few keys out of a busy file declares them as a VALUE (`{ value, read }` — e.g. the terrain's `terrainValueReads`: design.water + three registry findings), so an edit elsewhere in that file re-runs nothing. `?force=1` re-runs every step. The pipeline step alone keeps the mtime rule for its authoring inputs (below). ▶ `node checks/claims-a-bake-step-declares-what-it-reads.mjs` — every file a step reads is declared, or named at the call site with its reason (`// not-inputs:`).
- **The pipeline step is judged by what it READ, by content — never by mtime** (`pour-code.mjs`). `map.json` carries four records, each compared with now: **`dataRead`** — the step's other data files (`pourDataReads`: the footprint well, boundary, building overrides, survey, park polygon, street lamps, county land-use codes, `sources.json` and its parcels) · **`codeRead`** — a hash per file of `pipeline.js`'s import closure, the ① mint and the coastline included · **`geographyRead`** — the five numbers `config.js` projected with (`geography.mjs`; the town modules in `src/instances/` are read only as this value, so a favicon or a domain edit dirties no town) · **`registryRead`** — the registry entries it used. A checkout or rebase that only rewrites mtimes asks nothing. A missing record is dirty.
- **A pipeline re-run caused by CODE, one of those DATA files, GEOGRAPHY or the REGISTRY asks first** — and on LS (held) so does a first `promote-ribbons` with no record, since it rewrites the committed `src/data/ribbons.json`: the route answers 428 with what changed, and BakeModal offers *Run every step* / *Cancel*. An authoring edit re-runs it without asking.
- **Every step runs through `runStep`**: state, elapsed time, the last output line and a real fraction from `[progress] <what> i/n`, shown by BakeModal; the list is `bakePlan()`, read from the route itself. **No step is killed on a clock.** Cancelling stops the running step and names it; a failure names its step.
- **Layer visibility is a Foundry lever**: a hidden layer (`layerVis[id] === false`) skips its sub-step; re-showing it dirties `design.json`.
▶ `node checks/claims-the-bake-watches-its-code.mjs` · `node checks/claims-bake-progress-shows-the-route.mjs`

The steps, in execution order:

| # | Step | Script | Reads | Writes | Notes |
|---|---|---|---|---|---|
| 1 | **pipeline** | `pipeline.js` and its import closure | raw set + `overlay/skeleton` | `clean/map.json` | every scene with OSM; re-derives the frame from the latest edits |
| 2 | **promote-ribbons** | `promote-ribbons.js` | `map.json` | the scene's ribbons (`src/data/ribbons.json` for LS, else `clean/ribbons.json`) | extracts `layers.ribbons` |
| 3 | **ground** | `bake-ground.js` | `map.json`, `design.json`, `ribbonsGeometry.js` | `ground.json` + `ground.bin` **+ `shape.json`** | calls `buildTileGround(ribbons, …)` (①②③) and freezes its `protoShapeTiles` → merged, triangulated, indexed ground plane, one group per material/face-use. **Non-street ribbons** (alleys + footway/cycleway/steps/path) are stroked by `buildPathRibbons` (clipped to parcel interiors = block − curb − treelawn − sidewalk; park excluded — its paths render gravel-shaded via `LafayettePark.jsx`) and added as their own `mat:<kind>` groups, `layerVis`-gated like every other group — the **same** geometry the Designer renders live (`BlockGeometryV2Debug`). *(This call was orphaned in the dead V2 path until 2026-06-12 — `DOC-CODE-COHERENCE C13`; the Slab shipped without alleys/paths.)* **Also emits `shape.json`** — the frozen per-tile shape the Section consumer reads chain-free (the **Seal's artifact**, `ORIENTATION §3 (the Wall)`). Y=0 always (flat; terrain lift is a runtime shader). |
| 4 | **buildings** | `bake-buildings.js` | `map.json` (poured) / **render ledger** (LS), `design.json` | `buildings.json` (v2) + `buildings.bin` | merged building mesh + render-scoped per-building index (`SLAB-CONTRACT.md §6`). Gated on `layerVis.building`. **Render ledger (2026-07-05):** `loadBuildings(scene)` reads a per-scene **render record** at `data/<scene>/buildings.json` for every scene — the `scene==='lafayette-square'` source hardwire (`:62`) is retired (keyed on data, not the name). LS's ledger is the render-field projection of its authored `src/data/buildings.json` (`derive-ls-render-ledger.js`); LS's Slab comes out byte-identical. Poured scenes without a ledger fall back to `map.json`→`adaptMapBuildings`. **Membership cull (2026-07-20):** belt-and-suspenders re-application of the pipeline's membership — `((polygon − exclusions) ∪ activate) − hide`, where the **circle is only the fallback** when the scene has no polygon — reads `neighborhood_boundary.json` (circle + exclusions) + `building-overrides.json` (git-tracked) at Foundry time, so **curation only reaches the Slab on a Foundry run** (`OPERATIONS §Extent`). ⚠️ A Foundry run used to DROP `nb.polygon` (`24323ab2`) — **retired 2026-07-20**; the polygon is now first-class and preserved. See `ORIENTATION §3` (the slab: membership). *(Was: the boundary-street polygon; before that, drop any footprint point outside the circle.)* |
| 5 | **lamps** | `bake-lamps.js` (+ `derive-lamps.mjs` → `clean/derived_lamps.json`) | `raw/osm.json` POIs + `raw/osm_street_lamps.json` · the derived well · the authored well · `shape.json` (legal ground) · `design.json` | `lamps.json` (v3) | lamp point cloud (`SLAB-CONTRACT.md §5`), every lamp stamped `osm`/`derived`/`authored`. Gated on `layerVis.lamp`. ⭐ **UNION of wells**, richest kept — see below. |
| 6 | **scene** | `bake-scene.js` | `design.json` **only** | `scene.json` | **the second freeze** — the Look's full authored snapshot (palette, materials, every SC channel). Geometry-independent; never forces a geometry re-run. This is **Look's** output — owned by `STAGE.md`, format in `SLAB-CONTRACT.md §4`. |
| 7 | **trees** | `arborist/bake-trees.js` | the SCENE's census + species map + `map.json` (resolved by `cartograph/tree-bake-inputs.mjs`) | `public/baked/<scene>/trees.json` | Per **neighborhood**, never shared (`SLAB-CONTRACT.md §8`). Two axes: `--scene` = whose census; `--heroLook` = whose camera tracks drive `heroTier`. No census on disk → **honest zero**, skip (a blank grove, never another hood's trees). Gated on `layerVis.tree`. *(Was LS-only, writing the fossil `baked/default.json`; retired 2026-07-15.)* |
| 8 | **ground-ao** | `bake-ground-ao.js` | `map.json`, `design.json`, `ground.json` | `ground.lightmap.png` **+ `ground.poolmap.png` + `ground.colormap.png`** | **last** — slowest (~50 s); depends on `ground.json` mtime, runs after the geometry settles. Emits three "ground-contact" textures (2026-06-22): the **AO lightmap** (building AO), the **ground FX map** (R = lamp light pool, G = tree+lamp contact shadow), and the **ground-color map** (albedo raster for the tree trunk-base blend). See `SLAB-CONTRACT.md §3/§3.1/§3.2`. ⚠️ reads tree positions from the look's own `trees.json` + lamp positions from the per-Look `lamps.json` (or `street_lamps.json`). |

On success the handler stamps the Look's `bakedAt = Date.now()` into the Looks index (`serve.js`, at the end of the Foundry handler): the Slab's age, which Look's banner and Publish read. It is not a cache-bust: a published Slab's names are its content (`src/lib/slabUrl.js`).

>
> **`bake-terrain.js` IS now in the per-Look Foundry run** (2026-07-02, the HiPointe 3D phase). Terrain is a **per-installation** artifact: `bake-terrain.js --scene=<id>` writes the scene's own heightfield to the portable folder `cartograph/data/<scene>/clean/terrain.{json,bin}`, and the Foundry **copies it into the Slab** (`public/baked/<look>/terrain.{json,bin}`) so the runtime fetches it BY lookId like `ground.bin`. `src/utils/terrainShader.js` loads the active Look's Slab terrain and re-points live on a Stage scene-switch (`reloadTerrain`). Runs before `ground` (its adaptive refine samples the relief). *(Rationale: `feedback_installations_are_independent` — a poured neighborhood must lift on its OWN relief.)*
>
> ### ⭐⭐⭐ THE HEIGHTFIELD IS NOT JUST A RESAMPLED DEM — IT DERIVES **WHERE ZERO IS**
> `bake-terrain` reads the water from the **lidar's coast** (`clean/coast.json`, `bake-coast.mjs`, through
> `coastFile.mjs#readCoast` — the one the mint reads) and takes y = 0 from that file's **flattened water**: the
> lidar's EXACT mode over the flood sheet, found before any line is traced, so the line cannot move it (Boz's
> ruling (B), 2026-10-25). With no coast the datum is the **local minimum**. Every height-above-water in the town is
> measured from it. ▶ `cat cartograph/data/<scene>/clean/terrain.json` · `node checks/claims-the-coast-is-the-lidars.mjs`
> - ⭐ **THEN IT WRITES THE BED UNDER THE WATER — the REAL floor where there is one.** `fetch-bathymetry.mjs` lists
>   the town's bathymetry tiles (`raw/bathymetry-sources.txt`, by coordinates: NOAA BlueTopo, then USACE NCMP
>   topobathy — one survey, ranked by its share of the town's water edge then recency, only with a permitted registry row; NCEI CUDEM is a named rung not yet built, so a
>   town only it would cover is **not** verified-absent). ▶ `node checks/claims-the-floor-is-read-only-from-a-permitted-survey.mjs` Under the water
>   the floor's depth below the level replaces the stand-in, down to the depth the bottom stops showing **at the town's
>   LOW water** (the visibility depth below `water.low` — the town's `design.json#water`, else the kit's recorded
>   defaults, and it says which; it was cut below y = 0, so a town whose LOW sits under y = 0 never reached its own
>   water colour at low tide, ruled 2026-10-07), so the edge where the bottom
>   disappears follows the real bars, flats and channels. Where no floor is known the stand-in is the USACE
>   equilibrium beach profile (h = A·y^⅔, A read from `references/` at the town's sand size) — which, alone, puts that
>   edge the same distance off every shore. ⛔ Two vertical datums are never mixed (no conversion is built: a
>   non-NAVD88 pair refuses). The floor runs right to the drawn shore: where the water
>   meets the land is ①'s coast, the high-water mark (`coastFile.mjs#waterFace`), not the bed. Which cells the floor drew is recorded in `terrain.json#bed.floor`
>   with its seam against the DEM. A town with no coast comes out byte-identical.
>   ▶ `node cartograph/fetch-bathymetry.mjs --scene=<id>` · `node checks/claims-the-shore-is-closed.mjs` · `node checks/claims-the-bed-is-seen-to-depth-at-low-water.mjs`
> - ⭐ **AND IT NAMES WHERE THE WATER STANDS** (`terrain.json#water`). y = 0 stays the lidar's water — the tide the survey
>   flew at, which no one chose — and the town's named levels are heights above it: a **low** and a **high** tide (MLLW
>   and MHW unless the town's `design.json#water.low/high` names others it has), as a coarse grid because the datums
>   vary across a town; a lake has one level, which the town must rule (`water.lakeLevel`: its chart datum or its
>   gauge's mean). From `raw/water-datums.json` (`fetch-water-datums.mjs`: NOAA VDatum, cross-checked against the
>   CO-OPS station; for a lake, its Great Lakes gauge) — the Foundry calls no service. ⛔ A coast with no datums, or a lake
>   with no ruled level, REFUSES. ▶ `node cartograph/fetch-water-datums.mjs --scene=<id>`
>   A tidal town also acquires its **tide clock** (NOAA's constituents, which time the tide; the levels stay the town's)
>   into `raw/tide.json` — ⛔ never a terrain input — and `bake-manifest` publishes it. ▶ `node cartograph/fetch-water-datums.mjs --scene=<id> --tide-only`
> - ⭐ **EVERY CONSUMER READS THE LEVEL, ONE WAY** — `cartograph/waterLevel.mjs`: `levelAt(x, z, phase)` = low + (high − low)·phase
>   over those fields, and `tidePhase(t)` (HIGH until it is wired to the clock, `cartograph/tide.mjs` `tidePhaseClock` —
  phase in [0, 1] by ruling, so HIGH is the most the water ever stands). ⛔ **Never measure water
>   depth or a waterline from y = 0** — that is the flight's tide. Built on it: the **tide band** (`bake-ground`: a soft fill refines to half a terrain step and ±the datum's
>   uncertainty wherever its terrain reaches LOW…HIGH, so the drawn beach IS the terrain the tide meets); the player
>   (water vertices carry `aLevelLow/High`, the sheet stands at the phase × exag, depth from it); the **revetment**
>   (placed by the bank above y = 0, crest built to ≥ HIGH + a course, toe below LOW; breakwaters sized against LOW —
>   `levelM/levelFrom/lowM` per walk). ▶ `node checks/claims-the-shore-is-closed.mjs` (walks HIGH and LOW) ·
  `node checks/claims-water-depth-reads-the-level.mjs`
> - ⚠️ **A COAST THAT MOVES RE-RUNS THE TERRAIN STEP.** The terrain step declares `clean/coast.json` (by content) beside
>   the computed import closure of `bake-terrain.js`, never a hand list of files.
> - ⭐ **THE DRAWN SHORE IS ①'s LINE** (Jacob, 2026-10-27: "yes pin the coast"): the ground step pins every vertex on ①'s
>   coast to HIGH and clamps the other corners of its triangles by side, land max(field, HIGH) and water min(field, HIGH)
>   (`coastPins.mjs`; `ground.json#drawnRaw`). The field only SHAPES the bed (`shoreStamp.mjs#stampCoast`, after the bed):
>   the seaward corners of every cell ①'s line crosses ramp up to HIGH (one slope per ring, the bed's own, capped by the
>   tide); land is never written. Recorded as `terrain.json#stamp`.
>   A street DECK (MacMillan Wharf: "the street rides the deck") is held flat at its land root first (`deckHeights`;
>   a bare-earth DEM carries no deck), recorded as `terrain.json#decks`.
>   ▶ `node checks/claims-the-shore-meets-the-field-at-high.mjs`
> - ⭐ **The dry bed is recorded before it is dug** (`terrain.json#bed.dry`: cells under the water whose lidar stood
>   above their HIGH level, each with that height, rock apart; under a tagged deck they are listed by name, not gated). ▶ `node checks/claims-the-shore-agrees-with-the-field.mjs`
> - ⛔ **NO DEM ⇒ THE FOUNDRY STOPS.** Elevation is declared `ABSENT.FALSE_MAP`: flat ground is
>   town-neutral only where the town is flat, and a dune town made as a plane is a FALSE map, not a
>   degraded one. The `terrain` step FAILS and prints the command for that town. **The way past it is
>   to look** — `fetch-dem` records **verified-absent** when it searches the whole ladder and finds
>   nothing, and a town carrying that mark is made flat deliberately, on the record.
>   ▶ `node checks/claims-a-false-map-is-not-a-fallback.mjs`

---

## 3. What crosses into the runtime — the Slab

The Foundry's outputs **are** the Slab. Their byte-level format — top-level fields, group entries, the binary layout, the producer/consumer contracts — is documented once, authoritatively, in **`SLAB-CONTRACT.md`** (owned by neither cartograph nor LS, because it is the *interface*). This doc does not duplicate it. The table:

| Artifact | Format SSOT | Consumer |
|---|---|---|
| `ground.json` + `ground.bin` | `SLAB-CONTRACT.md §2` | `BakedGround.jsx` |
| `ground.lightmap.png` | `SLAB-CONTRACT.md §3` | `BakedGround.jsx` (UV-sampled building AO) |
| `ground.poolmap.png` | `SLAB-CONTRACT.md §3.1` | `BakedGround.jsx` → grass + `FadeMesh` shaders (R lamp pool · G contact shadow) |
| `ground.colormap.png` | `SLAB-CONTRACT.md §3.2` | `BakedGround.jsx` → `groundColorState` → `treeAtlasMaterial` (trunk blend) |
| `scene.json` | `SLAB-CONTRACT.md §4` | `useSceneJson` → light/material/post-FX consumers |
| `lamps.json` | `SLAB-CONTRACT.md §5` | `BakedLamps.jsx` |
| `buildings.json` (v2) + `buildings.bin` | `SLAB-CONTRACT.md §6` | `SlabBuildings.jsx` |
| `trees-atlas.json` + atlas PNGs | `SLAB-CONTRACT.md §7` | `treeAtlasMaterial.js` |
| `<scene>/trees.json` | `SLAB-CONTRACT.md §8` | `InstancedTrees.jsx` · `bake-ground-ao.js` · `bake-tree-anchors.js` |
| **`shape.json`** | **`ORIENTATION §3 (the Wall)`** | **Section** (`sectionOpen`), Foundry-time only — **not** a runtime artifact |

`shape.json` is the one output the runtime never sees: it is the Seal's freeze, consumed only by the Section FILL pass at the next Foundry run. It is the load-bearing proof that `ground.json/bin` was built chain-free (`ORIENTATION §3 (the Wall)`).

---

## 4. Frozen-or-not — what the Foundry freezes, and the gate

**The Foundry freezes a *snapshot of live state*, not a re-derivation.** This is the doctrine and the trap, in one sentence:

- ✅ **Frozen by the Foundry:** `scene.json` (the look store, the second freeze — the store does not survive past here); the merged ground/building geometry (one mesh, no per-feature scaffolding); the AO; the per-Look colors made *into* the groups (swap a Look = re-run the Foundry, not a runtime palette swap — `ARCHITECTURE.md §3`).
- ⚠️ **NOT derived *from the frozen frame*, therefore captured-with-its-defects:** the **curb geometry**. `bake-ground.js` calls `buildTileGround`, which **produces the curb by stroking chains** and then snapshots it (`ROADMAP A03`, Check C RED — `ORIENTATION §3 (the Wall)` is the SSOT). The Foundry faithfully freezes whatever that stroke produced. **The Slab is exactly as correct as the construction the moment the Foundry ran.** ⚠️ *Corrected 2026-07-31: not "re-strokes every build" for consumers — every non-Survey view reads the frozen artifact; this is a **producer** statement.* ⛔ And do **not** cite the "divided-transition bulge" as a *measured* symptom — the measurement behind it compared the curb to **un-authored** widths and largely scored the operator's own edits (`POLYGON-FIRST §2` Check A; the follow-on "collapsed rings" census was withdrawn for the same reason). **The producer defect is architectural — the artifact is traced rather than derived — and is NOT currently backed by a trustworthy geometric measurement.** `ROADMAP A05` builds the honest one.

**This is the one true gate between "Section done" and "geometry ready for Look."** Until the curb is frozen in prebake (`POLYGON-FIRST.md §3`, tickets D6a→d, currently PARKED), the Foundry cannot make a *provably* correct Slab — it can only make a faithful photograph of a still-moving subject. Freezing the curb upstream is what makes the Foundry's snapshot a freeze of *frozen* data rather than a freeze of *live* data. The Foundry mechanism itself needs no change; its **input** does.

> **Diagnostic when a Slab artifact looks wrong:** the first question is *not* "is the Foundry broken?" — it's "**is this the live re-stroke's defect, faithfully captured?**" (`feedback_verify_render_path_before_forensics`). The Foundry is almost never the bug; it is the messenger.

---

## 4.5 ⭐ A CENSUS IS THE UNION OF ITS WELLS — never whichever well was found first

**The rule.** Any population the Foundry makes — lamps, trees — is assembled by **unioning every well that carries it**, then deduping by proximity. A source-selection `if/else` that returns the first well it finds is the bug: it silently makes every other well invisible. Jacob, 2026-07-23: *"I would rather have more lamps and trees, since they're vibes."* Density is the product; a missing well reads as a thinner, deader place, and nothing errors.

**Lamps — the regression this rule is named for (fixed `4db5c07c`, 2026-07-23).** OSM and authored were **alternatives**: the moment LS gained an OSM lamp file, its 80 hand-placed Lafayette Park lamps stopped reaching the Slab, and nobody noticed because the *total* rose. Now three wells union, richest first — `authored` > `osm` > `derived` (the invented fill, `ROADMAP H-17`) — surveyed within 4 m of authored is the same lamp, derived within half its spacing of a real one is redundant. ▶ the per-well counts print on every Foundry run. ⛔ **The LS-bleed guard is unchanged:** an authored well is read only for **its own** scene (`docs/briefs/BRIEF-ls-bleed-excision.md` site 1).

**Trees** already follow this rule (`[[project_tree_census_wells_must_union_all]]`) — LS unions park / park-census / OSM. What thins trees is a **different**, deliberate gate: see §4.6.

## 4.6 What the tree gates exclude — and a ground-cover block is asked at the point

The gates, in order: a footprint painted on the ground (building, water, lot, path) → the road, curb and walk →
a land-use interior whose class is not plantable (`cartograph/lu-policy.mjs`: `hard`, or `planted` with the
planting specified) → otherwise the treelawn or a plantable interior keeps the tree. Surveyed trees are
**nudged** onto legal ground; invented ones are dropped.

⭐ **A block painted with a GROUND COVER is asked at the tree, not at the block** (Jacob, 2026-09-26,
`docs/briefs/BRIEF-wetland-trees.md`). A tile takes one land use, and a cover takes a tile from a jurisdiction at
any share (`derive.js` `luWinnerFromCoverage`), so on Provincetown the Seashore's reserve was painted wetland
and beach, and every tree in it was refused with it. For a class only ground covers produce (read from
`OSM_TO_LU` × `OSM_LU_KIND`, never listed), `forbidden-surface.mjs` re-runs the vote at the point: the tree
stands on the smallest cover containing it, else a built use, else the jurisdiction, else nothing — and nothing
means the canopy data decides. **A swamp is a forest:** OSM's `wetland=*` subtype says which wetlands are wooded
(`WETLAND_SUBTYPE` in `lu-policy.mjs`). The paint is unchanged; ground colour is Look's to tune.

- ▶ `node checks/claims-every-tree-candidate-is-accounted-for.mjs [scene]` — the funnel: every candidate, every gate, the largest one.
- ▶ `node checks/claims-a-tree-is-refused-for-what-stands-under-it.mjs [scene]` — every ground-cover refusal, with what stands under the tree; fails on one refused for its block's label.

*(The LS table this section used to carry: `_archive/BAKE-4.6-tree-gates-LS-2026-07-23.md`.)*

---

## 5. Status — done / open / aspirational

**DONE:** retired to `_archive/BAKE-status-done-2026-09-25.md` — canon carries LIVE doctrine and OPEN state; a list of what already shipped is a changelog, and the code is its own record.

**OPEN (the gates + the debt):**
- 🚧 **Curb-freeze gate (D6b/c, PARKED).** §4 above — the Foundry **snapshots a curb that was traced from chains** rather than derived from the frozen frame (⚠️ *rescoped 2026-07-31: not "the curb is unfrozen" — the frozen artifact exists and every non-Survey view consumes it; what's red is **Check C**, the producer — `ORIENTATION §3 (the Wall)` ⚠️ *(was cited as `WALL.md §31` — a section that never existed)**). The blocker to a provably-correct geometry freeze. *(`POLYGON-FIRST.md`, `HANDOFF-freeze-the-curb-in-the-first-bake.md`.)*
- 🚧 **SC.4 / SC.5 partial capture** — time-of-day defaults (SC.4) persist nothing; per-shot camera (SC.5) freezes Browse heading and the Hero keyframes and motion whole (`bake-scene.js`); Browse altitude, Hero target and Street position stay live by design. See `STAGE.md §5`.
- 🩹 **Corpse-lie C3/C4** — `bake-ground.js:28` still `import`s `buildBlockGeometryV2` (the dead figure-ground) alongside the live `buildTileGround`. Dead weight pending the T4 excision (`DOC-CODE-COHERENCE.md`).

**ASPIRATIONAL (sketched, did not ship — do not wait for it):**
- ⛔ **`stage-config.json`** — `ARCHITECTURE.md §1`'s diagram still shows a future "stage-config.json" for runtime shader params. **It never materialized.** Every Look authoring channel folded into `scene.json` field-by-field instead, and that has proven sufficient. The placeholder is stale intent, not pending work. *(Flagged in `DOC-CODE-COHERENCE.md`.)*
- ⛔ **Meteorologist clouds as a Slab artifact** — `public/clouds/*.json` are a *separate* publish-loop (not the Slab). `scene.json.clouds` round-trips a preset ref forward-compat, but the runtime defers to the Almanac (`STAGE.md §5`, SC.6).

---

## 6. The doctrine, in one place

- **The Foundry is the second freeze.** Past it, no store, no chains, no live re-derivation — only frozen files. The runtime trusts the Slab absolutely (`SLAB-CONTRACT.md §10`).
- **One button, one coherent snapshot.** Every sub-step of one Foundry run must agree (`SLAB-CONTRACT.md §9` rule 1). The operator never hand-sequences steps.
- **The Foundry captures; it does not fix.** A wrong Slab is a wrong *input*. Diagnose upstream (the live construction), never patch the Foundry's output.
- **Incremental by content.** A step re-runs when its code or a declared data input differs by content from what it last read (§2); only authoring inputs are judged by mtime (`judge: 'mtime'`). Every output goes through `writeIfChanged`; `?force=1` is the override. Never add a step that writes outside this discipline (`ARCHITECTURE.md §7`).
- **Format lives in the contract, not here.** `SLAB-CONTRACT.md` is the SSOT for the Slab's bytes; this doc owns the *chain*. Keep them non-overlapping.
- **`scene.json` is geometry-independent.** A Look-only Foundry run never forces a geometry re-run, and vice-versa — the two axes (geometry / look) are separable by construction.

---

## Cross-references

- **`STAGE.md`** — the Look step, whose `design.json` the Foundry freezes into `scene.json` (the upstream keystone).
- **`PREVIEW.md`** — the inspection surface that reads the Foundry's Slab (the downstream keystone; completes `Look → Foundry → Preview`).
- **`SLAB-CONTRACT.md`** — the Slab's byte format + producer/consumer contracts (the SSOT this doc points to for §3).
- **`ORIENTATION §3 (the Wall)`** + `_archive/PIPELINE-superseded-2026-10-21.md §5` — the freeze doctrine; `shape.json` schema; why frozen-wrong-data is odious.
- **`SECTION.md`** — the FILL construction `bake-ground.js` runs (`buildTileGround`).
- **`PREBAKE.md §4.1` / `POLYGON-FIRST.md`** — the curb-freeze gate (§4).
- **`ORIENTATION §3` (the Foundry)** + the `P14`/`P15` addresses (`_archive/PIPELINE-superseded-2026-10-21.md`) — the execution-ladder view.
- **`ARCHITECTURE.md §3` / §7** — the Foundry's orchestration, the Looks model, the `writeIfChanged` discipline.
- **Code:** `serve.js:461` (orchestration) · `bake-ground.js` · `bake-scene.js` · `bake-buildings.js` · `bake-lamps.js` · `bake-ground-ao.js` · `io.js` (`writeIfChanged`).
- **Memory:** `[[project_two_bakes_two_walls]]`, `[[feedback_verify_render_path_before_forensics]]`, `project_writeifchanged_touches_mtime`.
