# The Prebake

**The compile that turns the Skeleton's clean frame into the document Survey opens — and the stage where the Data Wall belongs.** Today it is a thin, **two-source** compile that freezes the *wrong* polygons; the program is to elevate it into the **polygon-ization + freeze** stage. This is its single-source-of-truth reference: what it does now (grounded in code), what `ribbons.json` actually holds, the gap, and the target.

> **Status: v0.2 (2026-07-04) — + the boundary clip / Data-Wall neuter (§2.5).** The SSOT for the prebake stage. **Grounded in code** (`pipeline.js`, `derive.js`, `promote-ribbons.js`, `io.js`), verified against `ribbons.json` 2026-06-05. The middle of the front-half rebuild spec: **`SKELETON.md` → this → `SURVEY.md`.** Register docs (`PIPELINE` execution · `ARCHITECTURE` build · `FEATURES` what-it-is) reference this; they carry only their audience's slice.

---

## 0. What prebake is

Prebake takes the frozen `skeleton.json` (+ raw OSM + operator overlay) and compiles it into **`ribbons.json`** — the single geometry document the Survey tool authors against and the live 2D view renders from. *"The First Bake."*

Two facts, both load-bearing for the program:

- **Today it is a thin, two-source compile.** It freezes street **chains** (from the skeleton) *and* parcel **faces** (polygonized from **raw OSM**, used only for land-use color) into one file. The real block-shape polygon is **not** produced here — Survey re-derives it from the chains on every build (§4).
- **This is where the Data Wall belongs — for correctness *and* perf.** "Polygon-first" means the chain→polygon conversion happens **once, in prebake**, and the polygon substrate is **frozen** here. Correctness: Survey receives polygons, so the false corner can't be re-born (`SURVEY.md §5.1`). Perf: Survey stops re-deriving the whole map every edit, so live authoring can recompute **only the activated blocks** (`SURVEY.md §4.1`). Elevating prebake from *compile* to *polygon-ization* **is** the wall-move.

---

## 1. The artifact chain — where prebake sits

```
Intake → Skeleton → ⟦ PREBAKE ⟧ → Survey → ⟦DATA WALL⟧ → Section → Bake → 3D
```

| | The 'thing' it freezes | File |
|---|---|---|
| input | the frame (chains + nodes) | `data/<id>/clean/skeleton.json` |
| input | raw OSM (faces/parcels source) | `data/raw/osm.json` |
| **prebake freezes** | the First-Bake geometry document | **`src/data/ribbons.json`** |

**Built by** `pipeline.js` → `promote-ribbons.js`. **Consumed by** `src/lib/tileGround.js` (live Survey render + bake). ⚠️ **Two-step rebuild:** run `skeleton.js` **then** `pipeline.js` **then** `promote-ribbons.js` — `pipeline.js` does **not** re-run the extractor (it reads `skeleton.json` and *errors if absent*).

---

## 2. How it builds today — function by function

1. **`pipeline.js`** (`:1`–`171`) — the orchestrator. Reads `data/raw/osm.json` (`:28`), optional buildings + cached elevation, runs **`deriveLayers(...)`** (`:78`, the real work, in `derive.js`), walks the world-coord bbox, and writes **`data/clean/map.json`** (`:158`, via `writeIfChanged`). `map.layers.ribbons` is the payload. Does **not** run the skeleton.
2. **`derive.js`** — the heavy stage, and **the two-source seam** (the "palimpsest spine"):
   - **Streets ← the skeleton.** `ribbonStreets = skeleton.streets` (`:2314`–`:2325`; reads `skeleton.json`, errors if missing), operator overlay merged in. `ribbonStreets[].points` are the **skeleton's** chain polylines. Medians + corridors are built from the paired chains (`:2869`–`:3010`).
   - **Faces ← raw OSM.** `vehicularStreets` filtered from **raw OSM** highways (`:1056`); `streetPolylines = …coords` (`:1150`) → `nodeEdges` (`:1172`) → `polygonize` (`:1173`) → `classify` (`:1176`) → `faceFills` tagged with land-use (`:2724`–`:2769`). **These polygons are NOT derived from the skeleton** — different node topology than the chains.
   - **Serializer** (`:3029`–`:3103`) — whitelists fields into `ribbonsLayer`. Keeps the enriched marrow (`lanes`/`surface`/`maxspeed`/`seed`/`caps`/`gradeSeparated`/`phase` incl. **`spineAtStart`/`spineAtEnd`**, `:3046`); emits `junctions`/`nameTransitions` only if the skeleton carried them.
3. **`promote-ribbons.js`** (`:1`–`38`) — copies `map.layers.ribbons` verbatim → **`src/data/ribbons.json`** (`:23`–`:32`, `writeIfChanged`).
4. **`io.js writeIfChanged`** — skips the disk write when bytes are byte-identical **but bumps mtime to now** (canonical-`make` behavior), so a no-op rebuild doesn't cascade-rerun downstream.

---

## 2.5 ⭐ The boundary clip — the Data-Wall neuter (2026-07-04)

`pipeline.js` runs a **boundary clip** immediately **after `deriveLayers(...)` and before the `map.json` write** — a **KIT** step, **gated on the scene carrying a `neighborhood_boundary.json`** (LS/default, which has none for this purpose, is untouched). It is the Data Wall doing its defining job (§0): **neutering a spurious polygon *at the wall* rather than carrying it whole downstream.**

The canonical spur is a named **boundary arterial** that enters the fetch at full *city* length and overshoots the hood. **South Big Bend ran 3882 m across a 2502 m hood** (Forsyth 3677 m, Wydown 2905 m); kept whole, these arterials stick out asymmetrically (south + east) and **skew the entire content bbox SE.** The clip has three moves, keyed to the layer:

- **⭐ Streets / alleys / paths are polyline-CLIPPED, not kept whole** (`clipRun`): each polyline is trimmed to the boundary circle and the **longest inside run** is kept. **This is the neuter** — the overshooting arterial is cut back to the hood instead of carried at city length. After it, the ribbons street bbox is **symmetric** — `x[-1439..1434] z[-1441..1441]`, center ≈ origin (was `x[-2110..1770] z[-1940..1940]`, skewed SE); max street span **3882 → 2144 m**.
- **Faces / tiles / features drop-if-outside** — a feature entirely outside the circle + street-fade margin (`keepR = streetFade.outer + 30 ≈ 1441 m`) is **removed**: top-level `layers[cat]` arrays + ribbons faces / tiles / medians / corridors / junctions / nameTransitions. The `touches` test is **inclusive** so a tile→street edge ref straddling the edge survives.
- **⭐ Building MEMBERSHIP = `(polygon ∪ activate) − (exclusions ∪ hide)`** (2026-07-20). **The POLYGON decides; the disc RENDERS.** The operator's **inclusion polygon** (`nb.polygon`, lon/lat, re-projected into the re-centered frame) is the membership test; the flattened **exclusion loops** (`nb.exclusions`) carve strays OUT via `pointInPolygon` (`pipeline.js:242-255`), and per-building `activate`/`hide` overrides layer on top (`NEIGHBORHOOD-INPUTS §5.2`). **A scene with no polygon falls back to the disc**, so every hood poured under the old excluder model bakes byte-identical. Applied in `pipeline.js` so `map.json` is the single filtered source (2D Designer + bake); `bake-buildings.js:603-613` re-applies the same belt-and-suspenders. ⛔ **RETRACTED 2026-07-20 — this bullet used to state the "excluder model": *"the circle is the boundary, every building inside is IN, supersedes the boundary-street polygon."* That was wrong and load-bearing wrong** (it made subtraction the only gesture and silently cost 147 Księży Młyn buildings incl. the Church of St. Anne); the accompanying `24323ab2` polygon-drop-on-re-bake is likewise RETIRED — `commit-extent` and `rescope` now accept and **preserve** a polygon. Live home: `INTAKE.md §0.5` · design of record `EXTENT-DESIGN.md`. *(This file was the one the retraction commit `004a33e3` missed; fixed in the 2026-07-23 canon sweep.)*
- **The 3D ground mesh is stencil-bounded to ±1461 regardless** (a clean disc) — the clip changes the **ribbons/content bounds**, not the ground mesh.

Result on a wide 5.4 km test fetch: `map.json` **180 → 52 MB**, ribbons **22 → 8 MB**, streets **2117 → 300**.

> **Doctrine (ties §0 to §6).** The Data Wall is where a **spurious / overshooting polygon gets neutered** — polyline-clip the boundary arterial *to the hood*, don't keep it whole. Drop what's fully outside; clip what straddles; hold buildings to the **inclusion polygon** (+ exclusions + roster overrides — `NEIGHBORHOOD-INPUTS §5.2`). The wall **neuters**, it doesn't merely pass geometry through.

---

## 3. What `ribbons.json` contains

Top level: `{ streets[], alleys[], paths[], intersections[], faces[], medians[], corridors[], junctions?, nameTransitions? }`.

- **`streets[]`** (from the **skeleton**) — `skelId`, `name`, `points` (chain polyline), `measure{left,right}`, `anchor`, `innerSign`, `pairId`, `capEnds`, `couplers`, `oneway`, `highway`, `type`, `layer`/`bridge`/`tunnel`, `gradeSeparated`, `lanes`/`surface`/`maxspeed`/`seed`/`caps`, and **`phase{role,kind,pairKey,medianWidth?,spineAtStart?,spineAtEnd?}`**.
- **`faces[]`** (from **raw OSM**, polygonized) — `{ ring:[[x,z]…], use }`. **Used only for land-use coloring** (`tileGround.js:808`), *not* for block shape.
- **`medians[]` / `corridors[]`** — from the paired skeleton chains (divided-road structure).
- **`intersections[]`** — from raw OSM (legacy; near-zero live consumers).
- **`junctions` / `nameTransitions`** — the skeleton's, when present.

> **There is no block-shape polygon in `ribbons.json`.** The only polygons are the raw-OSM parcel `faces` (LU) and the `medians`. The block silhouette does not exist until Survey builds it — every render, every bake, from scratch.

---

## 4. ⭐ The gap — prebake freezes the *wrong* polygons

> ### ⭐⭐ 4.0 — At a DEAD END it freezes no polygon at all (2026-07-25)
>
> The sharpest instance of this whole section. `extractFaces` walks a dead-end spur **out and back inside
> its enclosing face**, so the tip is a ring vertex whose two adjacent edges carry the **same chain on
> opposite sides** — the ring retraces its own vertices. **ALL 50 LS dead-end tips are zero-width slits**
> (`scratch/coupler-slit-universal.mjs`, ported to trunk 2026-07-30 — the old "46 of 49" read the tip off a
> FILL run's span end, not the frozen `cap.vertexIdx`; see `POLYGON-FIRST §2.1`; on `south-18th-street-3`, `ring[2]` and `ring[4]` are the same
> coordinate). **40 of them only LOOK resolved** because the FILL-layer mouth-wrap snap displaces
> `run.poly` off the ring by up to 13 m after the freeze; the 9 with no mouth disc show the slit raw, and
> those are exactly where the operator's eye fails.
>
> ⇒ Downstream, `side` inverts on the returning leg (34/34, measured), the cap needs a synthetic
> negative-`segOrd` fe, the mouth needs a patch disc, and a fold leg has **no interior on one side** — so
> there is nothing there to click. Every one of those is a consumer rebuilding a polygon prebake never
> made. ⛔ **Do not address around it** (a walk-ordinal key was built and retired for exactly this reason).
>
> **The construction (Jacob):** the SSoT radius as the **outer polygon**, everything inside **punched
> out** — blocks = boundary − stroked roads — so a spur becomes a real notch. Precedent in-repo:
> `buildBlockGeometryV2` already builds `blockSharp = differenceRings([stencil], asphaltSharp)`, and all 9
> slit chains have frontage edges on **both** sides there (`scratch/punchout-spike.mjs`). Risks to design
> for (identity attribution; topology becoming width-dependent) + the spike:
> **`_handoffs/HANDOFF-deadend-face-resolution.md`**. Enforcement: `POLYGON-FIRST §2.1`.

> ### ⭐⭐ 4.0a — asserting the spur BEFORE polygonization: TRIED, REVERTED (2026-07-31)
>
> Built (`152e7734`), run past Jacob eye on both scenes, judged **WORSE**, reverted (`7b5b87a3`).
> `SPUR_OUTLINE` is not in the code. ⭐ **Every probe was green and the eye still said no — these
> probes do not predict the eye.** Do not re-derive that table and read it as success.
> Full construction, measurements and the bugs found building it →
> **`_archive/PREBAKE-4.0a-spur-assert-REVERTED-2026-07-31.md`**.
> Live doctrine for dead ends → `POLYGON-FIRST.md §2.1` (Checks 1–5).

### 4.1 ⭐⭐ What is frozen, and what is not — CONSUMER done, PRODUCER open

**Verified in code 2026-07-31. SSOT: `WALL.md §2`.**

- ✅ **Consumer — done.** Every non-Survey view (Section/Measure **and** the neutral Design view) renders from the frozen `shape.json`: frozen `iA` on **93/101** LS tiles plus per-run curb polylines with measures. `sectionOpen` has no chain in lexical scope and cannot re-derive. Race-guarded twice (`72bbc989`, `59e5f109`).
- ✅ **Survey strokes live — by design.** Survey is the tool that *edits* the SHAPE.
- 🔴 **Producer — open (`ROADMAP A03`, Check C RED).** `shape.json` is **minted** by `buildTileGround(liveRibbons,…)` and snapshotted, so the artifact is a **photograph of a chain-stroke, not a function of the frozen frame**. The tracing errors are frozen in at mint time, which is why a defect in the artifact cannot be cured downstream. Brief: `_handoffs/HANDOFF-freeze-the-curb-in-the-first-bake.md`.
- ⛔ **Do NOT cite "the ~4 m bow" as the symptom — measured 2026-07-31, it is not one defect and mostly not a bow.** It is three things sharing a number: a **shifted datum** (the curb is parallel, at the *authored* width — *not a defect*), genuine **wander**, and **collapsed curb rings** (**28 of 92 tiles**; tile 37 is a 2058 m² block with an **85 m² curb fragment**). Same street is a perfect offset on six tiles and wild on two — **specific tiles, not the offset math.**
- ⛔ **`POLYGON-FIRST` Check A is RED *and mis-specified*** — it runs with `blockCustoms: null` (authoring OFF, so it scores the operator's decisions as defects) and skips tiles with no curb ring (so a total failure prints as a modest bow). **Its aggregate is not evidence.** The parallelism *idea* is still right; the instrument is not. Full account + the three detector rules it forced: **`POLYGON-FIRST.md §2` Check A** and **`§5`**.

*Prior text (2026-06-09), incl. the ruled-out approaches → `_archive/PREBAKE-4.1-frozen-vs-unfrozen-2026-06-09.md`.*

---

## 5. ⭐ The target — the polygon-ization + the wall (where polygon-first lives)

The program (`SURVEY.md §5.1`): **do the chain→polygon conversion once, in prebake, and freeze the polygon substrate.** Concretely:

- **Derive the block substrate from the SKELETON chains** (the `extractFaces` topology Survey currently re-derives), here, once — and **freeze it** into `ribbons.json` (or its successor). The skeleton, not raw OSM, becomes the single source for faces.
- **Resolve the corner *identities* as polygons** during that conversion — including the divided↔undivided transition: **corner the corridor outer-edge legs, not the carriageway stubs**, using the frozen `phase.spineAt*` link. The false corner is decided **once, upstream**, as a topology fact — never reconstructed per-build.
- **Freezing is a PERF move as much as a correctness one.** With the substrate frozen, live Survey editing **recomputes only the *activated* blocks** (operator clicks a centerline → adjacent blocks activate → only those reshape; the rest stay the frozen render). **Block-independence is already verified** (the re-pour is block-local); freezing is what lets us exploit it instead of re-deriving the whole map on every drag over the high-res aerial (`SURVEY.md §4.1`).
- **Kill the two-source seam** — retire the raw-OSM `polygonize`/`nodeEdges`/3 m-snap face path; faces + intersections come from the skeleton. (`OSM-FORENSICS-EVAL.md` "Layer-2": highest-leverage cleanup.)
- **Survey then only reshapes** the frozen rings (offset by width, round by radius). Chains die at the **prebake→Survey boundary** — the Data Wall moves to ~**P3**, where doctrine says it belongs.

The split this buys: **corner identity (topology) = prebake, frozen once; curb position (width/radius) = Survey, authored on top.** Two concerns, two stages, no re-derivation.

> **⭐ Refinement (2026-06-09): freeze the curb GEOMETRY, not just the topology.** D2 froze the topology but the curb polygon is still *fully re-stroked* live (`§4.1`) — the union, the corner cuts, the apron — which is what bows it. "Survey only reshapes" must mean exactly that: the First Bake emits the **clean curb polygon** (straight runs = `chain ⊕ halfWidth` parallel offsets; corners = offset-intersections, constructed **once**), freezes it, and Survey *consumes* it — re-stroking **only the single element under the operator's hand**, never the whole map. The litmus for "correct": every straight-run curb is parallel to its chain. The divided-transition "d" bulge is the canonical proof this half is unfinished. Program + seam-to-cut: `HANDOFF-freeze-the-curb-in-the-first-bake.md`.

---

## 6. Doctrine, in one place

- **Prebake prepares the polygon document Survey opens** — it is not a footnote; steps 2–4 of the program (fortify prebake → polygonize Survey → DataWall) hinge here.
- **Freeze the polygon substrate here, once, from the skeleton.** Don't defer the chain→polygon conversion into Survey's per-build construction — that deferral both manufactures the false corner *and* forces a full-map redraw on every edit.
- **Freezing serves perf, not just correctness** — it's the precondition for activated-only live redraw (`SURVEY.md §4.1`), which the sticky high-res Designer needs.
- **One source for faces: the skeleton.** Retire the raw-OSM face path; the two-source seam is the palimpsest.
- **The Data Wall belongs at the prebake→Survey boundary (~P3).** Past it, no geometry derived from chains.
- **⭐ The Data Wall neuters spurious polygons (§2.5).** A boundary arterial carried in at full city length is **polyline-clipped to the hood** at the wall, never kept whole; features fully outside drop, buildings held to the **boundary polygon** (+ roster `activate`/`hide`, §5.2). A KIT step gated on `neighborhood_boundary.json`.
- **Two-step rebuild, always:** `skeleton.js` → `pipeline.js` → `promote-ribbons.js`.

---

## Cross-references
- `SKELETON.md` — the frame prebake consumes.
- `SURVEY.md §5.1` (polygon-first) + `§4.1` (the activated-block editing/perf model) — this doc is where that cure is built.
- `PIPELINE.md §prebake` + `§Wall` + `P3` — the execution spine.
- `OSM-FORENSICS-EVAL.md` — the two-source seam + the Layer-2 (faces-on-frame) cleanup, in detail.
- `src/lib/tileGround.js` — the downstream consumer that today re-derives the polygon.
- `pipeline.js` (the boundary clip, §2.5) · `bake-buildings.js` (the belt-and-suspenders building cull) · `neighborhood_boundary.json` (the gate — center/radius disc).
- Memory: `[[project_two_bakes_two_walls]]`, `[[project_the_palimpsest_code_path_multiplicity]]`, `[[project_skeleton_is_the_first_bake]]`.
