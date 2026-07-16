# Bake — pouring the slab

> **Status: v0.2 (2026-07-04; base v0.1 2026-06-09) — topic-doc + scene-generic bake / boundary cull.** The keystone Reference for the **bake** stage. Grounded against the live orchestration in `serve.js` (the `/looks/:id/bake` handler, ~L461–623) and the bake scripts it runs, not assembled from prose. Part of the front-half rebuild spec — the doc that was missing between **section** and **stage**. Paired with **`STAGE.md`** (the Look tool whose output this stage freezes) and **`SLAB-CONTRACT.md`** (the output format, owned by neither app).
>
> The bake is **both** an *idea* (the publish stage — `… section → bake → stage`) and a *thing* (the artifacts under `public/baked/<look>/`). This doc owns the *how*: which scripts run, in what order, what each freezes. It does **not** re-document the slab's byte format — that is `SLAB-CONTRACT.md`'s job, referenced never duplicated.

---

## 0. What the bake is

The **bake** is the publish stage: it turns the frozen pipeline (`map.json` → `ribbons.json`) plus the active Look's authored intent (`design.json`) into the **slab** — the read-only static artifacts under `public/baked/<look>/` that the LS runtime mounts. It is the boundary between the **authoring** world (cartograph: stores, live re-derivation, the operator's eye) and the **runtime** world (LS: trust the slab, never reach back).

Two load-bearing facts:

1. **The bake is one button, not a sequence the operator runs by hand.** The `/looks/:id/bake` handler rolls the whole chain — re-derive the pipeline, pour every sub-bake, build the AO — into a single async POST (`serve.js:461`). "Edit, bake, see" works because every step the operator might forget is inside the button. Designer's "Stage →" fires it implicitly in the background; Stage's "↻" re-fires it in place. *(`ARCHITECTURE.md §3` "The implicit bake.")*

2. **The bake is where the second wall stands.** The pipeline has **two walls** (`WALL.md`, `[[project_two_bakes_two_walls]]`): the **first** is the Survey freeze (chains die → polygons), the **second** is the bake (the look **store** dies → `scene.json`; the live geometry → `ground.json/bin`). Past the bake, nothing authoring-side exists — the runtime sees only frozen files. **The bake captures a snapshot; it does not author.** Its correctness is therefore exactly the correctness of its inputs (see §4 — the curb-freeze gate).

---

## 1. The artifact chain

| | |
|---|---|
| **Inputs (per scene)** | `clean/map.json` (skeleton+derive), `src/data/ribbons.json` (First Bake), the raw set (`osm.json`, `measurements.json`, `centerlines.json`, `elevation.json`, `overlay.json`, `skeleton.json`, `src/data/buildings.json`), `park_trees.json` / `park_water.json` / `street_lamps.json` (LS-only) |
| **Input (per Look)** | `public/looks/<id>/design.json` — the operator's authored styling/shape intent (live autosave; see `STAGE.md §4`) |
| **Who builds it** | the `/looks/:id/bake` handler (`serve.js:461`), running each `bake-*.js` via `runIfDirty` |
| **Outputs (the slab)** | everything under `public/baked/<id>/` — see §2 for what each step writes, and **`SLAB-CONTRACT.md`** for the byte format |
| **Who consumes it** | the **runtime** (LS app) and the cartograph **Stage** / **Preview** players — read-only, cache-busted by `?t=<bakedAt>` (Preview is the inspection surface — `PREVIEW.md`) |

⚠️ **Two-step rebuild discipline (inherited from prebake).** `pipeline.js` + `promote-ribbons.js` run *inside* the bake for the LS scene, so a Survey/Measure edit (which writes `overlay.json`) re-derives `map.json` → `ribbons.json` before the geometry bakes. The hand-authored **toy** scene skips both (no OSM, no pipeline). A **poured OSM neighborhood is different** — see the scene-generic note below.

> **⭐ The bake is now scene-generic (verified 2026-07-03/04, the Pour).** A fresh, poured neighborhood bakes a **full slab** — ground + lightmap + buildings + scene + shape — from its own OSM (buildings, land-use, plus STL parcels if in St. Louis). The Pour tool (`POST /:scene/pour`, `serve.js`) runs `pipeline.js --skip-elevation` → `promote-ribbons.js --scene=<s>` → `bakeLook(force)` end-to-end, so the two-step derive is driven *for* the poured scene (not skipped like toy). The old bake-route comment *"scene-specific pipeline not yet implemented"* was **conservative — it works**: the hipointe-demun pour clipped 6853 → boundary buildings and poured `ground.bin` + `lightmap` + `buildings` + `scene` + `shape` cleanly. *(Intake → 3D is one tool now; see `STAGE.md` / the Extent + Pour flow. Boundary clipping lives in `pipeline.js` after `deriveLayers`.)*

---

## 2. How it builds — the chain, in order

The handler runs steps through one helper, `runIfDirty(label, inputs, outputs, cmd)` (`serve.js:531`): **a step is skipped when every output is newer than every declared input — including the step's own `.js` source.** `?force=1` on the bake URL forces a full rebuild. This is the **dirty-skip** contract (`ARCHITECTURE.md §7` "Bake writes go through `io.js`'s `writeIfChanged`") — no-op bakes are ~1ms; mtime is touched even on byte-identical writes so the graph doesn't cascade.

**Layer-visibility is a bake lever, not just a render toggle** (`serve.js:536`): a hidden layer (`layerVis[id] === false`) skips its (often heavy) sub-bake entirely. Re-showing flips `design.json` → the sub-bake goes dirty → re-runs.

The steps, in execution order:

| # | Step | Script | Reads | Writes | Notes |
|---|---|---|---|---|---|
| 1 | **pipeline** | `pipeline.js` (+ `derive.js`, `snap.js`, `classify.js`, `standards.js`, `config.js`) | raw set + `overlay/skeleton` | `clean/map.json` | LS-only; re-derives the frame from the latest edits. `derive.js` is the heavy lifter (185 KB). |
| 2 | **promote-ribbons** | `promote-ribbons.js` | `map.json` | `src/data/ribbons.json` | extracts `layers.ribbons` → the bundled runtime asset (the First Bake artifact). LS-only. |
| 3 | **ground** | `bake-ground.js` | `map.json`, `design.json`, `ribbonsGeometry.js` | `ground.json` + `ground.bin` **+ `shape.json`** | calls `buildTileGround(ribbons, { emitArtifact:true })` (the Section FILL construction) → merged, triangulated, indexed ground plane, one group per material/face-use. **Non-street ribbons** (alleys + footway/cycleway/steps/path) are stroked by `buildPathRibbons` (clipped to parcel interiors = block − curb − treelawn − sidewalk; park excluded — its paths render gravel-shaded via `LafayettePark.jsx`) and added as their own `mat:<kind>` groups, `layerVis`-gated like every other group — the **same** geometry the Designer renders live (`BlockGeometryV2Debug`). *(This call was orphaned in the dead V2 bake path until 2026-06-12 — `DOC-CODE-COHERENCE C13`; the slab shipped without alleys/paths.)* **Also emits `shape.json`** — the frozen per-tile shape the Section consumer reads chain-free (the **WALL artifact**, `WALL.md §3`). Y=0 always (flat; terrain lift is a runtime shader). |
| 4 | **buildings** | `bake-buildings.js` | `map.json` (poured) / **render ledger** (LS), `design.json` | `buildings.json` (v2) + `buildings.bin` | merged building mesh + render-scoped per-building index (`SLAB-CONTRACT.md §6`). Gated on `layerVis.building`. **Render ledger (2026-07-05):** `loadBuildings(scene)` reads a per-scene **render record** at `data/<scene>/buildings.json` for every scene — the `scene==='lafayette-square'` source hardwire (`:62`) is retired (keyed on data, not the name). LS's ledger is the render-field projection of its authored `src/data/buildings.json` (`derive-ls-render-ledger.js`); LS bakes byte-identical. Poured scenes without a ledger fall back to `map.json`→`adaptMapBuildings`. **Membership cull (excluder model, 2026-07-14):** belt-and-suspenders re-application of the pipeline's membership — keep a building if it's inside the circle, **not** inside any **exclusion loop** (`nb.exclusions`), **or** force-`activate`d, and **not** `hide`n — reads `neighborhood_boundary.json` (circle + exclusions) + `building-overrides.json` (git-tracked) at bake time, so **curation only reaches the slab on a re-bake** (`OPERATIONS §Extent`). A legacy hood's inclusion `nb.polygon` is dropped on excluder re-bake (`24323ab2`). See `PIPELINE.md §prebake`. *(Was: the boundary-street polygon; before that, drop any footprint point outside the circle.)* |
| 5 | **lamps** | `bake-lamps.js` | `street_lamps.json`, `design.json` | `lamps.json` | lamp point cloud (`SLAB-CONTRACT.md §5`). Gated on `layerVis.lamp`. |
| 6 | **scene** | `bake-scene.js` | `design.json` **only** | `scene.json` | **wall #2** — the Look's full authored snapshot (palette, materials, every SC channel). Geometry-independent; never forces a geometry re-bake. This is the **Stage's** output — owned by `STAGE.md`, format in `SLAB-CONTRACT.md §4`. |
| 7 | **trees** | `arborist/bake-trees.js` | the SCENE's census + species map + `map.json` (resolved by `cartograph/tree-bake-inputs.mjs`) | `public/baked/<scene>/trees.json` | Per **neighborhood**, never shared (`SLAB-CONTRACT.md §8`). Two axes: `--scene` = whose census; `--heroLook` = whose camera tracks drive `heroTier`. No census on disk → **honest zero**, skip (a blank grove, never another hood's trees). Gated on `layerVis.tree`. *(Was LS-only, writing the fossil `baked/default.json`; retired 2026-07-15.)* |
| 8 | **ground-ao** | `bake-ground-ao.js` | `map.json`, `design.json`, `ground.json` | `ground.lightmap.png` **+ `ground.poolmap.png` + `ground.colormap.png`** | **last** — slowest (~50 s); depends on `ground.json` mtime, runs after the geometry settles. Emits three "ground-contact" textures (2026-06-22): the **AO lightmap** (building AO), the **ground FX map** (R = lamp light pool, G = tree+lamp contact shadow), and the **ground-color map** (albedo raster for the tree trunk-base blend). See `SLAB-CONTRACT.md §3/§3.1/§3.2`. ⚠️ reads tree positions from the look's own `trees.json` + lamp positions from the per-Look `lamps.json` (or `street_lamps.json`). |

On success the handler stamps the Look's `bakedAt = Date.now()` into the Looks index (`serve.js:616`) — the canonical `?t=` cache-bust seed (`SLAB-CONTRACT.md §4`).

> **`bake-svg.js` is deliberately NOT in the chain** (`serve.js:493`). It's demoted to a CLI-only QA artifact (human-readable / diffable); the runtime consumes `ground.json/bin/lightmap` exclusively.
>
> **`bake-terrain.js` IS now in the per-Look bake** (2026-07-02, the HiPointe bake→3D phase). Terrain is a **per-installation** artifact: `bake-terrain.js --scene=<id>` writes the scene's own heightfield to the portable folder `cartograph/data/<scene>/clean/terrain.{json,bin}` (was the global `src/data/terrain.*` — retired; LS bakes byte-identical through the same path, no privilege), and the bake **publishes it into the slab** (`public/baked/<look>/terrain.{json,bin}`) so the runtime fetches it BY lookId like `ground.bin`. `src/utils/terrainShader.js` loads the active look's slab terrain (flat fallback if absent) and re-points live on a Stage scene-switch (`reloadTerrain`). Runs before `ground` (its adaptive refine samples the relief). *(Rationale: `feedback_installations_are_independent` — a poured neighborhood must lift on its OWN relief, and the installation folder is portable.)*

---

## 3. What crosses into the runtime — the slab

The bake's outputs **are** the slab. Their byte-level format — top-level fields, group entries, the binary layout, the producer/consumer contracts — is documented once, authoritatively, in **`SLAB-CONTRACT.md`** (owned by neither cartograph nor LS, because it is the *interface*). This doc does not duplicate it. The map:

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
| **`shape.json`** | **`WALL.md §3`** | **Section** (`sectionOpen`), bake-time only — **not** a runtime artifact |

`shape.json` is the one output the runtime never sees: it is the WALL #1 freeze, consumed only by the Section FILL pass at the next bake. It is the load-bearing proof that `ground.json/bin` was built chain-free (`WALL.md §2`).

---

## 4. Frozen-or-not — what the bake freezes, and the gate

**The bake freezes a *snapshot of live state*, not a re-derivation.** This is the doctrine and the trap, in one sentence:

- ✅ **Frozen at the bake:** `scene.json` (the look store, wall #2 — the store does not survive past here); the merged ground/building geometry (one mesh, no per-feature scaffolding); the AO; the per-Look colors baked *into* the groups (swap a Look = re-bake, not a runtime palette swap — `ARCHITECTURE.md §3`).
- ⚠️ **NOT frozen *upstream*, therefore captured-with-its-defects:** the **curb geometry**. `bake-ground.js` calls `buildTileGround`, which **re-strokes the curb live from chains every build** (`PREBAKE.md §4.1`, `POLYGON-FIRST.md` Check A = RED). The bake faithfully freezes whatever the live re-stroke produced — including the divided-transition curb bulge. **The slab is exactly as correct as the live construction the moment the bake ran.**

**This is the one true gate between "Section done" and "geometry ready for the Stage."** Until the curb is frozen in prebake (`POLYGON-FIRST.md §3`, tickets D6a→d, currently PARKED), the bake cannot pour a *provably* correct slab — it can only pour a faithful photograph of a still-moving subject. Freezing the curb upstream is what makes the bake's snapshot a freeze of *frozen* data rather than a freeze of *live* data. The bake mechanism itself needs no change; its **input** does.

> **Diagnostic when a baked artifact looks wrong:** the first question is *not* "is the bake broken?" — it's "**is this the live re-stroke's defect, faithfully captured?**" (`feedback_verify_render_path_before_forensics`). The bake is almost never the bug; it is the messenger.

---

## 5. Status — done / open / aspirational

**DONE (shipping, verified in code):**
- ✅ The full chain runs incrementally, dirty-skipped, with mtime discipline (`writeIfChanged`, `serve.js:531`). No-op bakes ~1ms; layer-vis bake-gating live.
- ✅ `ground` / `buildings` / `lamps` / `scene` / `trees` / `ground-ao` all emit and are consumed by production (the L1.1/L1.3 cutovers — `SLAB-CONTRACT.md §11`).
- ✅ `shape.json` (WALL artifact) emitted by `bake-ground.js:887` when `emitArtifact:true`; Section opens it chain-free (`ef460d1`, `WALL.md`).
- ✅ The slab is **look-complete** for the shipped channels (SC.1–SC.3 + SC.7 baked into `scene.json` — see `STAGE.md §5`).
- ✅ **Scene-generic bake (2026-07-03/04).** A poured neighborhood bakes a full slab (ground/lightmap/buildings/scene/shape) from its own OSM via the Pour tool; the "scene-specific pipeline not yet implemented" comment was conservative (§1). Poured scenes get **polygon + activate/hide building membership** — applied in `pipeline.js` (the single filtered `map.json` source), belt-and-suspendered in `bake-buildings.js` (step 4; `NEIGHBORHOOD-INPUTS §5.2`). Buildings load via a per-scene **render ledger** (`data/<scene>/buildings.json`), retiring the LS source hardwire.

**OPEN (the gates + the debt):**
- 🚧 **Curb-freeze gate (D6a→d, PARKED).** §4 above — the bake captures the unfrozen curb. The blocker to a provably-correct geometry freeze. *(`POLYGON-FIRST.md`, `HANDOFF-freeze-the-curb-in-the-first-bake.md`.)*
- 🚧 **SC.4 / SC.5 partial bake** — time-of-day defaults (SC.4) persist nothing; per-shot camera (SC.5) bakes only Browse heading, not Hero keyframes / Browse altitude (those stay live). See `STAGE.md §5`.
- 🩹 **Corpse-lie C3/C4** — `bake-ground.js:28` still `import`s `buildBlockGeometryV2` (the dead figure-ground) alongside the live `buildTileGround`. Dead weight pending the T4 excision (`DOC-CODE-COHERENCE.md`).

**ASPIRATIONAL (sketched, did not ship — do not wait for it):**
- ⛔ **`stage-config.json`** — `ARCHITECTURE.md §1`'s diagram still shows a future "stage-config.json" for runtime shader params. **It never materialized.** Every Stage authoring channel folded into `scene.json` field-by-field instead, and that has proven sufficient. The placeholder is stale intent, not pending work. *(Flagged in `DOC-CODE-COHERENCE.md`.)*
- ⛔ **Meteorologist clouds as a slab artifact** — `public/clouds/*.json` are a *separate* publish-loop (not slab). `scene.json.clouds` round-trips a preset ref forward-compat, but the runtime defers to the Almanac (`STAGE.md §5`, SC.6).

---

## 6. The doctrine, in one place

- **The bake is the second wall.** Past it, no store, no chains, no live re-derivation — only frozen files. The runtime trusts the slab absolutely (`SLAB-CONTRACT.md §10`).
- **One button, one coherent snapshot.** Every sub-bake from one bake must agree (`SLAB-CONTRACT.md §9` rule 1). The operator never hand-sequences steps.
- **The bake captures; it does not fix.** A wrong slab is a wrong *input*. Diagnose upstream (the live construction), never patch the bake output.
- **Incremental by mtime.** Every output goes through `writeIfChanged`; every step declares its inputs (including its own source); `?force=1` is the override. Never add a step that writes outside this discipline (`ARCHITECTURE.md §7`).
- **Format lives in the contract, not here.** `SLAB-CONTRACT.md` is the SSOT for the slab's bytes; this doc owns the *chain*. Keep them non-overlapping.
- **`scene.json` is geometry-independent.** A look re-bake never forces a geometry re-bake, and vice-versa — the two axes (geometry / look) are separable by construction.

---

## Cross-references

- **`STAGE.md`** — the Look-authoring tool whose `design.json` this stage freezes into `scene.json` (the upstream keystone).
- **`PREVIEW.md`** — the inspection surface that reads this stage's slab (the downstream keystone; completes `stage → bake → preview`).
- **`SLAB-CONTRACT.md`** — the slab's byte format + producer/consumer contracts (the SSOT this doc points to for §3).
- **`WALL.md`** — the freeze doctrine; `shape.json` schema; why frozen-wrong-data is odious.
- **`SECTION.md`** — the FILL construction `bake-ground.js` runs (`buildTileGround`).
- **`PREBAKE.md §4.1` / `POLYGON-FIRST.md`** — the curb-freeze gate (§4).
- **`PIPELINE.md §bake`** + the `P14`/`P15` addresses — the execution-ladder view.
- **`ARCHITECTURE.md §3` / §7** — the implicit bake, the Looks model, the `writeIfChanged` discipline.
- **Code:** `serve.js:461` (orchestration) · `bake-ground.js` · `bake-scene.js` · `bake-buildings.js` · `bake-lamps.js` · `bake-ground-ao.js` · `io.js` (`writeIfChanged`).
- **Memory:** `[[project_two_bakes_two_walls]]`, `[[feedback_verify_render_path_before_forensics]]`, `project_writeifchanged_touches_mtime`.
