# The Prebake

**The compile that turns the Skeleton's clean frame into the document Survey opens — and the stage where the Data Wall belongs.** Today it is a thin, **two-source** compile that freezes the *wrong* polygons; the program is to elevate it into the **polygon-ization + freeze** stage. This is its single-source-of-truth reference: what it does now (grounded in code), what `ribbons.json` actually holds, the gap, and the target.

> **Status: v0.1 (2026-06-05) — new, the topic-doc.** The SSOT for the prebake stage. **Grounded in code** (`pipeline.js`, `derive.js`, `promote-ribbons.js`, `io.js`), verified against `ribbons.json` 2026-06-05. The middle of the front-half rebuild spec: **`SKELETON.md` → this → `SURVEY.md`.** Register docs (`PIPELINE` execution · `ARCHITECTURE` build · `FEATURES` what-it-is) reference this; they carry only their audience's slice.

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

Two independent topologies pass through prebake, and the one that matters isn't frozen:

- **`streets[]` come from the skeleton; `faces[]` come from raw OSM.** That's the **two-source seam** — the skeleton was bolted on *beside* the original raw-OSM face derivation, not *in front of* it. The faces carry raw OSM's node topology (un-simplified, un-consolidated), so they don't agree with the chains.
- **The block SHAPE is re-derived in Survey, not frozen here.** `tileGround.extractFaces` (`tileGround.js:303`, called `:779`) walks the **skeleton chains'** shared-vertex graph to build the tiles/blocks **on every render and bake**. `ribbons.faces` (the raw-OSM polygons) is consumed only for LU color (`:808`). So the real polygon is born downstream, per-build — with two costs: (1) the **false corner** is manufactured every build (`SURVEY.md §6`: the carriageway stub is a vertex in that per-build graph); (2) **every edit re-derives the whole map**, the perf sink behind the sticky Designer tools (`SURVEY.md §4.1`).

### 4.1 ⭐⭐ The half that's frozen vs the half that isn't — the CURB is still re-stroked live (2026-06-09)

D2 **froze the face TOPOLOGY** (`ribbons.tiles[]` = per tile `{ring, edges:[{skelId,side}]}`, the `extractFaces` walk run once at prebake; `derive.js` D2 block, consumed by `tileGround.tilesFromFrozen`). That half of the program landed. **But the CURB GEOMETRY is NOT frozen** — `buildTileGround` re-strokes the chains **live, every frame in Survey** (`BlockGeometryV2Debug.jsx:661–686` → `tg.curb` / `curbOutline`) and again in the bake, building the curb as a *union* of per-chain strokes + E3 corner keep-out cuts + node aprons + `filletRing`. The Survey blue silhouette **is** `buildTileGround(liveRibbons).curb`, read from `ribbons.json` — **not** the baked `shape.json` (same engine, two times; rebaking changes nothing visible in Survey because Survey recomputes live).

**This is the live leak the skeleton exists to abolish: a downstream consumer still building geometry from chains.** Its most visible symptom is the **divided-transition "d" bulge** (`HANDOFF-freeze-the-curb-in-the-first-bake.md`): the curb along a *straight* chain (e.g. Mississippi at Lafayette) is not a clean parallel offset — it bows ~4 m — because the live union *can* bow it. A correct curb is, by definition, `chain ⊕ halfWidth` (a parallel offset), with genuine corners as the intersection of two offsets — a **pure function of the skeleton**. So the curb belongs in the frozen body; the bow is the proof it isn't there yet.

> **Diagnostic that beats node-archaeology:** test whether each curb side is **parallel to its own chain** (`chain ± halfWidth`). The chain is straight ground-truth; deviation from parallel — except at a genuine corner — *is* the artifact, and tells you which side drifted. Measure deviation from the definition; don't reconstruct the corner from the node soup. *(Ruled out this session as wrong altitude: de-taper-nose tuning, face-ring vertex moves, `cornersAtIx`/§437, and "the corner is missing" — the E3 corner does fire; the union just yields a non-parallel curb. See the brief.)*
- **Contradiction to clear (code comments):** `tileGround.js` header and the `bake-ground.js` import comment still say *"TOY only / LS stays on figure-ground (transitional)"* — **stale** (pre-T2). The code runs LS on tiles unconditionally (`isTileScene = true`, `BlockGeometryV2Debug.jsx:253`; bake calls `buildTileGround` at `bake-ground.js:293`). Fix the comments when the code phase opens; until then, trust the code.

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
- **Two-step rebuild, always:** `skeleton.js` → `pipeline.js` → `promote-ribbons.js`.

---

## Cross-references
- `SKELETON.md` — the frame prebake consumes.
- `SURVEY.md §5.1` (polygon-first) + `§4.1` (the activated-block editing/perf model) — this doc is where that cure is built.
- `PIPELINE.md §prebake` + `§Wall` + `P3` — the execution spine.
- `OSM-FORENSICS-EVAL.md` — the two-source seam + the Layer-2 (faces-on-frame) cleanup, in detail.
- `src/lib/tileGround.js` — the downstream consumer that today re-derives the polygon.
- Memory: `[[project_two_bakes_two_walls]]`, `[[project_the_palimpsest_code_path_multiplicity]]`, `[[project_skeleton_is_the_first_bake]]`.
