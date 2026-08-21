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

`pipeline.js` runs a **boundary clip** immediately **after `deriveLayers(...)` and before the `map.json` write** — a **KIT** step, **gated on the scene carrying a `neighborhood_boundary.json`** (a bare `existsSync`). ⚠️ **Every scene including `toy` carries the file, so the clip fires everywhere** (LS: `keepR = 1030 m`). What LS lacks is a **`polygon` key** — the different fact that makes the building-membership test fall back to the disc. It is the Data Wall doing its defining job (§0): **neutering a spurious polygon *at the wall* rather than carrying it whole downstream.**

The canonical spur is a named **boundary arterial** that enters the fetch at full *city* length and overshoots the hood. **South Big Bend ran 3882 m across a 2502 m hood** (Forsyth 3677 m, Wydown 2905 m); kept whole, these arterials stick out asymmetrically (south + east) and **skew the entire content bbox SE.** The clip has three moves, keyed to the layer:

- **⭐ Streets / alleys / paths are polyline-CLIPPED, not kept whole** (`clipRun`): each polyline is trimmed to the boundary circle and **only the longest inside run is kept — the rest are silently discarded.** ⚠️ **Lossy, and unfixed:** a street that leaves and re-enters the hood loses its shorter in-hood run. **0 chains on LS produce a second piece**, so it fires nowhere here — a town-#2 landmine, not a measured loss. ⛔ Its fix is **not** a second street entry: minting an id downstream of `skeleton.js:1681` orphans authored slots (`RIBBONS §2`). It goes as a **loud report**. After the clip the ribbons street bbox is **symmetric** — `x[-1439..1434] z[-1441..1441]` (was `x[-2110..1770] z[-1940..1940]`, skewed SE); max street span **3882 → 2144 m**.
- **Faces / tiles / features drop-if-outside** — a feature entirely outside `keepR` is **removed**: top-level `layers[cat]` arrays + ribbons faces / tiles / medians / corridors / junctions / nameTransitions. The `touches` test is **inclusive** so a tile→street edge ref straddling the edge survives. ⭐ **This is the move that earns the size win below**, not the polyline clip. `keepR = max(streetFade.outer, radius) + 30` — **floored and fail-loud** since `b54cbaae`; gate `node scratch/claims-clip-extent-floor.mjs` (§2.5a).
- **⭐ Building MEMBERSHIP = `((polygon − exclusions) ∪ activate) − hide`** (2026-07-20). **The POLYGON decides; the disc RENDERS.** The operator's **inclusion polygon** (`nb.polygon`, lon/lat, re-projected into the re-centered frame) is the membership test; the flattened **exclusion loops** (`nb.exclusions`) carve strays OUT via `pointInPolygon`, and per-building `activate`/`hide` overrides layer on top (`NEIGHBORHOOD-INPUTS §5.2`). **A scene with no polygon falls back to the disc.** Applied in `pipeline.js` so `map.json` is the single filtered source (2D Designer + bake); `bake-buildings.js` re-applies the same belt-and-suspenders. Live home: `INTAKE.md §0.5` · design of record `EXTENT-DESIGN.md`.
- **The 3D ground mesh is stencil-bounded to ±1461 regardless** (a clean disc) — the clip changes the **ribbons/content bounds**, not the ground mesh.

Result on a wide 5.4 km test fetch: `map.json` **180 → 52 MB**, ribbons **22 → 8 MB**, streets **2117 → 300**.

> ### ⛔ 2.5a — THE RIM CHOP IS A MISSING RIM CHAIN, NOT THE CLIP (2026-08-12)
> **Jacob, seeing round-capped stubs north of Chouteau: *"I am seeing artificially cut off streets in this
> whole area."* Then, on the mechanism: *"cut off streets are on the map boundary, very rough chop that
> gets 'close enough' to the edge of the disc."***
>
> ▶ **Reproduce, any scene: `node scratch/claims-deadend-populations.mjs [scene]`.** It prints the three
> populations this section used to tabulate — skeleton (pre-clip) · rendered (post-clip, the one
> `tileGround.js:2787` recomputes and caps) · `junctionMap` (frozen stamp) — plus the frozen tile caps.
> ⚠️ **Name the population or the old figures do not reproduce:** they count **degree-1 nodes EXCLUDING
> `gradeSeparated`** (57 chains held out on LS). On that population `94` total, `42` beyond the hood and
> `33` interior-at-`<0.8R` reproduce exactly. **`29 at clip radius` does NOT — it measures 25.**
> ✅ **CAUSE ESTABLISHED 2026-08-21** — that 25 is the nodeless-tip population below, and it is exact.
>
> **What the clip does, measured:** it **never touches the interior dead-end population** — 51 interior
> degree-1 tips pre-clip, 51 post. It manufactures **31 tips at the rim**, at exactly `keepR` (1030 m on
> LS) to the metre — the guillotine — and the cap machinery then gives each a **round cap**, so a chopped
> street renders as a cul-de-sac.
> - ⛔ **`streetFade` IS A RENDER PARAMETER** (a shader fade — `boundary.js:10`, `BakedGround.jsx:117`)
>   deciding **content extent**. Same defect shape as the outer-polygon finding (`RIBBONS §1`).
> - ✅ **THE FROZEN TILE/CAP SYSTEM IS CLEAN** — 0 of 50 caps at the clip radius, because the tile and cap
>   freeze run **before the clip exists** (`pipeline.js:111` `deriveLayers` vs `:139`; `derive.js:4707`
>   resolves caps against the original chain endpoints). ⇒ `RIBBONS §1`'s ruled dead-end class is **not**
>   contaminated.
> ### ⛔⛔ THE RECIPROCAL HALF — **THE CLIP MANUFACTURES VERTICES THAT HAVE NO NODE** *(2026-08-21, agent Gimbal, `6d2fcb4d`)*
> This section knew the clip **strands** nodes outside the rim. It did not record the other direction, and
> **that direction is what breaks the sidewalk band.**
> ▶ `node scratch/claims-nodeless-tip-classifier.mjs --source=pour`
> - **The sequence, in source:** `pipeline.js:111` `deriveLayers` builds `junctionMap` over **full-length
>   chains**; the clip then runs and `clipRun` **mints brand-new endpoint coordinates** at the circle. The
>   category filter is `if (Array.isArray(arr))` — `junctionMap` is an **object**, so it is **skipped**.
>   ⇒ **A frozen index outlives a mutation of the geometry it indexes, with no re-derive and no refusal.**
> - **Every nodeless degree-1 tip sits within 0.5 m of `keepR` — 25/25 LS · 67/67 HPDM, zero exceptions,
>   zero unexplained.** ⛔ **No node source declined them; at derive time those vertices DID NOT EXIST.**
>   Every source is correct. **There is no coverage gap in `junctionMap`.**
> - **Downstream, and this is why it matters:** no node ⇒ no `cornersAdjacent` (the emitter iterates
>   `jnodes.values()`) ⇒ the walk hits `no-successor`/`no-node` ⇒ **the run does not close** ⇒ a hole in
>   the ped band. `substrateWalk.js:262-280`.
> - **The reciprocal population is the larger one:** `junctionMap` nodes beyond `keepR` — **LS 48/305
>   (16%) · HPDM 2006/2457 (82%)**. HPDM's index mostly describes streets that are not in the map.
> - ⛔ **THE NAIVE CURE IS A PLAUSIBLE-LOOKING WRONG MAP:** minting a node at the cut promises a **cap
>   coupler** there, i.e. the kit would render a guillotined arterial as a **cul-de-sac by design**.
> - ⚠️ **Bears on the ruling below but does not overturn it** — that ruling rests on there being no
>   interior population to recover, which still holds (51 interior tips pre-clip, 51 post). **What is new
>   is the invalidation defect, which is general and not rim-specific.** Jacob's ruling owed.
> - ⛔ **Populations here are POST-MINT (95 pendant-tip nodes, 25 rim tips); the figures above are
>   PRE-MINT (29 deg-1 nodes, 31 rim tips). Different populations — never merge them.**
>
> - ⚠️ **`junctionMap` is stamped pre-clip and never re-filtered** — 0 of its 29 degree-1 nodes sit at the
>   clip radius, but **19 of 31 unlocatable stamps name a chain the whole-feature drop removed**
>   (agent A, `a2e0f6c4`). ⛔ **Do not read this as "Slice 1 is mostly artifact."** That reading came from
>   quoting the `<0.8R` column — 10 of 29 — as though it were the real-tip count. **By hood radius it is
>   17 of 29**, and the interior population the tip couplers sit on is untouched by the clip.
>
> ### ✅ RULED 2026-08-12 — THE RIM IS THE SUBSTRATE'S JOB; ② CLOSED WITHOUT REMOVING THE CLIP
> `__boundary__` is a **synthetic id with no chain behind it in `ribbons.streets`** (`RIBBONS §1`), so
> `derive.js:4697` closes the faces against the contour at **892** while the streets run on to **1030** and
> get capped. **The chop is the missing rim chain, not the cut** ⇒ **the cure ships with the substrate
> slice**, when the boundary becomes an ordinary chain with an ordinary band. ⛔ **Do not re-open the clip
> for it.** *(Superseded: an earlier sequencing ruled "remove the artificial cut and reconnect the nodes
> first." The measurement above closed it — there is no interior population to recover.)*
>
> What the clip did need was the two defects it shared with the bake bbox (`bake-ground.js`): a **floor**,
> so a look band narrower than the disc cannot cut inside the hood, and **no fallback** — `?? Infinity`
> clipped nothing and still printed a clean kept/dropped line. Both landed `b54cbaae`; the gate for the
> class is `node scratch/claims-clip-extent-floor.mjs`. ⭐ `§2.5`'s original job is real (a city-length
> arterial skewing the content bbox) and was **kept, not removed**.
>
> ⛔⛔ **NEVER AN EXTENT OPERATION. THIS IS THE TRAP.** `EXTENT-DESIGN §3.3` (D4, measured 2026-08-08):
> **`commit-extent`/`rescope` ALWAYS reset `center`, `fade`, `streetFade`, `innerFadeOffset` to hardcoded
> values, with no protection and no warning** — and **LS is the ONLY scene carrying authored values there**
> (`center:[-15,-15]` = Lafayette Park's centroid; `innerFadeOffset:134`; every other scene `[0,0]`/200).
> **`streetFade` is in that reset set, and it is the very field `keepR` reads.** ⇒ **the tool would
> silently destroy LS's authored centre and fade** — on production `lafayette-square.com`, a scene that
> **has never been poured** (`EXTENT-DESIGN §2`) and that the worklist rules is **conformed LAST**.
>
> ⛔ **CLEAN IT UP; DO NOT PATCH, AND DO NOT KEEP AN IMPRINT** *(Jacob: "this is the very definition of
> clogging dead code effluvium… we will not return to this state, so it is no benefit to save an imprint
> of it. **This is true in the documentation as well.**")* Excise knobs, wiring **and prose** in one pass.
> ⚠️ A **deliberate, scoped exception** to *archive-don't-delete*: it covers **dead code and the artifacts
> of a state we will not return to** — never design record or rulings. *(Doctrine: §6.)*

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
> `run.poly` off the ring by up to **6.24 m** after the freeze (re-run of the doc's own probe, 2026-08-04 — 37 tips displaced, next-largest 6.00 and 5.49; the `13 m` this line carried was ~2× and it is used to argue the FILL mask's size); the 9 with no mouth disc show the slit raw, and
> those are exactly where the operator's eye fails.
>
> ⇒ Downstream, `side` inverts on the returning leg (34/34, measured), the cap needs a synthetic
> negative-`segOrd` fe, the mouth needs a patch disc, and a fold leg has **no interior on one side** — so
> there is nothing there to click. Every one of those is a consumer rebuilding a polygon prebake never
> made. ⛔ **Do not address around it** (a walk-ordinal key was built and retired for exactly this reason).
>
> ## ✅ RULED 2026-08-12 — the construction below is ADOPTED, with the walk kept. → **`RIBBONS.md §1`** (the ruling; this pointer is the only copy).
> **blocks = boundary − stroked roads, computed as a DIRECTED HALF-EDGE WALK over identity-carrying
> side-chains** — each authored chain derives into two directed side-chains (datum = the left EDGE of the
> right lane, i.e. coincident at the centerline when undivided), joined at every node by a **coupler**.
> ⭐ **That answers the punch-out's blocking risk** (a boolean loses "which chain and which side bounds
> this edge"); walking side-chains carries identity by construction. ⛔ **Authoring is unchanged — the
> split is DERIVED**, so `blockCustoms` does not migrate. ⭐ **The coupler relation is already frozen and
> unconsumed — `junctionMap.nodes[].cornersAdjacent`** (`POLYGON-FIRST §2.1`); it is complete at every T
> and cross and **absent at all 29 dead ends**, which is the one genuinely new build.
> ⚠️ **Topology becomes width-dependent ⇒ the combinatorial half freezes at prebake (`cornersAdjacent`,
> width-independent) and the geometric half resolves after width authoring** — §5's own split, at last.
> ⛔ **Pre-build gates, none optional:** explain `~115 vs 101` · measure the retrace × severed overlap ·
> do not regress the June render (`tileGround.js:620-627`) · the eye-gate must record its scene.
>
> **The construction (Jacob):** the SSoT radius as the **outer polygon**, everything inside **punched
> out** — blocks = boundary − stroked roads — so a spur becomes a real notch. Precedent in-repo:
> `buildBlockGeometryV2` already builds `blockSharp = differenceRings([stencil], asphaltSharp)`, and all 9
> slit chains have frontage edges on **both** sides there (`scratch/punchout-spike.mjs`). Risks to design
> for (identity attribution; topology becoming width-dependent) + the spike:
> **`_handoffs/HANDOFF-deadend-face-resolution.md`**. Enforcement: `POLYGON-FIRST §2.1`.

> ### ⭐⭐ 4.0a — asserting the spur BEFORE polygonization: TRIED, REVERTED (2026-07-31)
>
> Built (`152e7734`), judged **WORSE** on Jacob's eye, reverted (`7b5b87a3`). `SPUR_OUTLINE` is not in
> the code. ⛔⛔ **THE VERDICT IS UNRELIABLE, NOT REVERSED — and the older claim that it was "run past
> Jacob's eye on both scenes" is itself in doubt.** Named 2026-08-06: **Jacob was looking at
> `lafayette-square` while the work was on `lafayette-square-staging`, and neither party knew for the
> whole day.** Those are different maps — overlay-authored streets **52 vs 177**, tiles 101 vs 116 — so
> the more-authored scene is precisely where the construction's effect would have shown.
> ⚠️ **The older lesson here, *"every probe was green and the eye still said no — these probes do not
> predict the eye,"* over-read a verdict taken on the other map.** The probes are neither vindicated
> nor discredited; they were never tested against a correctly-scened look. ⛔ Do not re-derive that
> table and read it as success **and** do not cite the revert as proof the construction fails.
> Full construction, measurements and the bugs found building it →
> **`_archive/PREBAKE-4.0a-spur-assert-REVERTED-2026-07-31.md`**.
> Live doctrine for dead ends → `POLYGON-FIRST.md §2.1` (Checks 1–5).

### 4.1 ⭐⭐ What is frozen, and what is not — CONSUMER done, PRODUCER open

**Verified in code 2026-07-31. SSOT: `WALL.md §2`.**

- ✅ **Consumer — done.** Every non-Survey view (Section/Measure **and** the neutral Design view) renders from the frozen `shape.json`: frozen `iA` on **93/101** LS tiles plus per-run curb polylines with measures. `sectionOpen` has no chain in lexical scope and cannot re-derive. Race-guarded twice (`72bbc989`, `59e5f109`).
- ✅ **Survey strokes live — **not a WALL violation** — Survey is the tool that *edits* the SHAPE, so re-stroking the edited element is the requirement. ⚠️ **But that is not a blessing of the current implementation:** today every edit re-strokes the **WHOLE MAP**, and the standing requirement is fluid asymmetric editing of a **single polygon** — nothing that retraces the whole map at 60fps works (`ORIENTATION` §the-chain, the condensation principle). The whole-map scope is a known perf defect (D6c / the block-local loop), just not a wall one.
- 🔴 **Producer — open (`ROADMAP A03`, Check C RED).** `shape.json` is **minted** by `buildTileGround(liveRibbons,…)` and snapshotted, so the artifact is a **photograph of a chain-stroke, not a function of the frozen frame**. The tracing errors are frozen in at mint time, which is why a defect in the artifact cannot be cured downstream. Brief: `_handoffs/HANDOFF-freeze-the-curb-in-the-first-bake.md`.
- ⛔ **Do NOT cite "the ~4 m bow" as the symptom — measured 2026-07-31, it is not one defect and mostly not a bow.** Largely a **shifted datum**: the curb is parallel at the *authored* width, and the check was comparing it to the un-authored one — **not a defect**. Some genuine **wander** remains, on specific tiles rather than in the offset math. ⛔ A same-day *"collapsed curb rings, 28 of 92"* census was **WITHDRAWN**: it measured `iA` **area**, and `Block = iA = tile − the authored roadway` (`SURVEY §3`/`§4`), so it was measuring the width edits themselves. **Nothing here is a defect until re-measured as a DISTANCE against authored widths** (`ROADMAP A05`).
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
