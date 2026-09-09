# The Prebake

**The compile that turns the Skeleton's clean frame into the document Survey opens — and the stage where the Data Wall belongs.** Today it is a thin, **two-source** compile that freezes the *wrong* polygons; the program is to elevate it into the **polygon-ization + freeze** stage. This is its single-source-of-truth reference: what it does now (grounded in code), what `ribbons.json` actually holds, the gap, and the target.

> **Status: v0.3 (2026-09-08) — §2.5 rewritten: the boundary clip was EXCISED `ec7dd3f4`; what remains there is building membership + the coupler's switched-off consumer.** The SSOT for the prebake stage. **Grounded in code** (`pipeline.js`, `derive.js`, `promote-ribbons.js`, `io.js`), verified against `ribbons.json` 2026-06-05. The middle of the front-half rebuild spec: **`SKELETON.md` → this → `SURVEY.md`.** Register docs (`PIPELINE` execution · `ARCHITECTURE` build · `FEATURES` what-it-is) reference this; they carry only their audience's slice.

---

> ⛔ **THE NARRATIVE LIVES IN `PIPELINE.md` — read it first.** This doc holds **detail only**:
> the mechanism, the schema, the open defect. **What prebake is FOR** is now said once, in `PIPELINE.md` step 3 (and the block-substrate question in step 3a).
> *(The "what this stage is" opening that used to sit here was excised 2026-09-06 in the narrative
> scrub — one storyline, one home. Text preserved verbatim in
> `_archive/stage-doc-openings-2026-09-06.md`.)*

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

## 2.5 ⭐ What prebake does at the boundary — membership, and nothing else (rev. 2026-09-08)

> ### ⛔⛔ THE BOUNDARY CLIP IS GONE — EXCISED 2026-09-05, `ec7dd3f4`. It ran here for two months and this section described it in the present tense until 2026-09-08.
> It trimmed every street/alley/path polyline to `max(streetFade.outer, radius) + 30` and kept only
> the longest inside run. ⛔ **It was a contract breach, not a perf question:** the bb is the frozen
> "forever zone" (`EXTENT-DESIGN §3.3`), and the clip cut **inside** it on every kit-built scene —
> so growing the radius revealed nothing, because the data was already destroyed. ⭐ **The root is
> the one to carry: the boundary record has no bb field, so the clip reached for `streetFade` — A
> RENDER KNOB DECIDING WHAT EXISTS.** *(Jacob: "the edge gets faded but AFTER it's drawn.")*
> ⭐ **The verb was wrong. The disc HIDES; the bb HOLDS. This was the one step that DELETED.**
>
> **⇒ Chains now run to the full bb.** ▶ re-derive, never quote:
> `node -e "const r=require('./src/data/ribbons.json');const d=p=>Math.hypot(p[0],p[1]);console.log(r.streets.filter(s=>(s.points||[]).some(p=>d(p)>1030)).length,'of',r.streets.length,'chains run past the old keepR')"`
> ⛔ **The manufactured rim tips and their nodeless-vertex reciprocal are closed BY REMOVAL** — not
> fixed, removed. ⛔ **NOT the interior dead-end tips**, which the clip never touched; `A0` stands.
> ⚠️ **Anything citing a `keepR` population is reading a dead mechanism.** Full retired text, the
> census, and the instrument status → **`_archive/PREBAKE-2.5-boundary-clip-EXCISED-2026-09-05.md`**.

**What prebake still does here is BUILDING MEMBERSHIP, and only that** (`pipeline.js`, gated on the
scene carrying `neighborhood_boundary.json`). **`((polygon − exclusions) ∪ activate) − hide`** —
⭐ **the POLYGON decides; the disc RENDERS**, and a scene with no polygon falls back to the disc.
Applied here so `map.json` is the single filtered source the 2D Designer and the bake both inherit;
`bake-buildings.js` re-applies it belt-and-braces. One function, not three copies (`2585292f`);
degenerate input is **UNDECIDABLE and loud**, never a silent keep.
▶ `createMembershipFilter` — live home `INTAKE.md §0.5`, design of record `EXTENT-DESIGN.md`.

> ### ⭐ THE COUPLER RELATION IS PRODUCED HERE AND ITS CONSUMER IS SWITCHED OFF
> *(The consumer-status fact `RIBBONS §1` and `POLYGON-FIRST §2.1/§3` point at this section for —
> keep it here, do not restate it there.)*
> `junctionMap.nodes[].cornersAdjacent` is stamped at prebake (`derive.js:4353`/`:4358`, serialized
> `:4410`) and is complete at every T and cross. **Its only consumer is `src/lib/substrateWalk.js`,
> and the walk is DEFAULT-OFF STRUCTURALLY** — `tileGround.js:4709` gates it on `opts.substrateTiles`
> (passed by nothing) or `SUBSTRATE_TILES=1` (absent in the browser). ⇒ **production tiles are the
> frozen `shape.json`.** ⛔ **So a defect reasoned through `cornersAdjacent` explains nothing the
> operator is looking at**; it is a blocker on the walk becoming the producer, and scoped to that.
> ▶ `grep -rn "substrateTiles\|cornersAdjacent" src cartograph --include="*.js" --include="*.jsx"`

> ### ⚠️ OPEN, AND IT IS AN ASPIRATION FILED AS DONE: **NOTHING BOUNDS THE DRAWING.**
> `ec7dd3f4` carved this out explicitly — *"a bake-time crop is a SEPARATE, still-unbuilt concern:
> **chop at the BAKE, never at the chain**"* — and nothing has been built since. ⇒ a chain wholly
> outside the boundary is drawn, and a real degree-1 tip out there takes a **round cap**, which reads
> as a cul-de-sac at the rim. ⛔ **That is the same SYMPTOM the clip used to manufacture and it is
> now a different CAUSE** — the chain and its tip are genuine. ⛔ Do not answer it by reinstating a
> clip on the chain. **Unscoped; Jacob's ruling owed.**

> ### ⚠️ RETAINED HAZARD, AND IT OWES A HOME: `commit-extent`/`rescope` RESET THE LOOK FIELDS.
> They overwrite `center`, `fade`, `streetFade`, `innerFadeOffset` with hardcoded values, no warning
> — and **LS is the only scene carrying authored values there** (`center` = Lafayette Park's
> centroid). ⛔ Independent of the clip and **still live**, so it does not go to the archive with it.
> ⚠️ It cites `EXTENT-DESIGN §3.3` as its home and **§3.3 does not carry it** — the pointer does not
> resolve. Owed there; kept here meanwhile rather than dropped.
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

**Verified in code 2026-07-31. SSOT: `PIPELINE.md` §5 (the Wall).**

- ✅ **Consumer — done.** Every non-Survey view (Section/Measure **and** the neutral Design view) renders from the frozen `shape.json`: frozen `iA` on **93/101** LS tiles plus per-run curb polylines with measures. `sectionOpen` has no chain in lexical scope and cannot re-derive. Race-guarded twice (`72bbc989`, `59e5f109`).
- ✅ **Survey strokes live — **not a WALL violation** — Survey is the tool that *edits* the SHAPE, so re-stroking the edited element is the requirement. ⚠️ **But that is not a blessing of the current implementation:** today every edit re-strokes the **WHOLE MAP**, and the standing requirement is fluid asymmetric editing of a **single polygon** — nothing that retraces the whole map at 60fps works (`ORIENTATION` §the-chain, the condensation principle). The whole-map scope is a known perf defect (D6c / the block-local loop), just not a wall one.
- 🔴 **Producer — open (`ROADMAP A03`, Check C RED).** `shape.json` is **minted** by `buildTileGround(liveRibbons,…)` and snapshotted, so the artifact is a **photograph of a chain-stroke, not a function of the frozen frame**. The tracing errors are frozen in at mint time, which is why a defect in the artifact cannot be cured downstream. Brief: `_handoffs/HANDOFF-freeze-the-curb-in-the-first-bake.md`.
- ⛔ **Do NOT cite "the bow" in metres as the symptom — measured 2026-07-31, it is not one defect and mostly not a bow.** Largely a **shifted datum**: the curb is parallel at the *authored* width, and the check was comparing it to the un-authored one — **not a defect**. Some genuine **wander** remains, on specific tiles rather than in the offset math. ⛔ A same-day *"collapsed curb rings"* census was **WITHDRAWN**: it measured `iA` **area**, and `Block = iA = tile − the authored roadway` (`SURVEY §3`/`§4`), so it was measuring the width edits themselves. **Nothing here is a defect until re-measured as a DISTANCE against authored widths** (`ROADMAP A05`).
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
- **⛔ The Data Wall does NOT neuter geometry any more (§2.5).** The polyline clip was **excised 2026-09-05 (`ec7dd3f4`)** — it let `streetFade`, a render knob, decide what exists, and cut inside the frozen bb. **The disc HIDES; the bb HOLDS; nothing here DELETES.** What survives at the boundary is **building membership** — `((polygon − exclusions) ∪ activate) − hide`, a KIT step gated on `neighborhood_boundary.json`. ⚠️ **Bounding the DRAWING is unbuilt** — chop at the BAKE, never at the chain.
- **Two-step rebuild, always:** `skeleton.js` → `pipeline.js` → `promote-ribbons.js`.

---

## Cross-references
- `_archive/PREBAKE-2.5-boundary-clip-EXCISED-2026-09-05.md` — the retired clip, its census, and the instruments that read it. ⛔ Nothing in it is true of the code today.
- `SKELETON.md` — the frame prebake consumes.
- `SURVEY.md §5.1` (polygon-first) + `§4.1` (the activated-block editing/perf model) — this doc is where that cure is built.
- `PIPELINE.md step 3 (prebake)` + `§Wall` + `P3` — the execution spine.
- `OSM-FORENSICS-EVAL.md` — the two-source seam + the Layer-2 (faces-on-frame) cleanup, in detail.
- `src/lib/tileGround.js` — the downstream consumer that today re-derives the polygon.
- `pipeline.js` (building membership, §2.5 — ⛔ the boundary clip is gone, `ec7dd3f4`) · `bake-buildings.js` (the belt-and-suspenders building cull) · `neighborhood_boundary.json` (the gate — center/radius disc).
- Memory: `[[project_two_bakes_two_walls]]`, `[[project_the_palimpsest_code_path_multiplicity]]`, `[[project_skeleton_is_the_first_bake]]`.
