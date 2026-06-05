# The Survey

**The second tool and the second bake — both an *idea* (the SHAPE pipeline stage) and a *thing* (the frozen per-tile `shape.json` it produces).** Survey consumes the Skeleton's clean frame and **builds the polygon world**, then **freezes the hardscape SHAPE at the Data Wall.** This is its single-source-of-truth reference: what it is, the document it freezes, how it builds, the authoring panel it powers, the wall it raises, and the one special case still open.

> **Status: v0.1 (2026-06-05) — new, the topic-doc.** The SSOT for the Survey stage. **Grounded in code** (`src/lib/tileGround.js` + the Survey panel), verified against the live path 2026-06-05 — not assembled from prose (the prose had contradictions; this supersedes them). The cross-cutting docs (`PIPELINE` execution · `ARCHITECTURE` build/decisions · `FEATURES` what-it-is · `OPERATIONS` knobs) **reference this doc** for the mechanism; they carry only their audience's slice. Paired with **`SKELETON.md`** — the two together are the rebuild spec for the front half of the pipeline.

---

## 0. What Survey is

Survey takes the Skeleton's lab-clean centerlines + IX nodes and turns them into the **polygon world**: it forms **Tiles**, strokes the chains **outward** into a hardscape silhouette to make **Blocks**, authors the **corner shapes**, and **freezes** all of it. Two load-bearing facts:

- **SHAPE only — there is no notion of pedestrian depth in Survey.** Treelawn/sidewalk widths, ADA pads — that is **Section** (FILL). Survey authors the asphalt/curb silhouette and the corner geometry; Section strokes *inward* off the frozen curb. (`ARCHITECTURE §2.1`.)
- **The Skeleton is a black box; Survey fortifies on top of it.** The operator does not edit the centerline graph — they author a thin overlay of widths/caps/corner-radius keyed to the Skeleton's identities. **If the Skeleton is right, Survey shrinks to thin fortification** (`SKELETON.md §0`).

It is the middle of the three tools — **Survey · Section · Stage** — and it raises **wall #1** (chains die here; `[[project_two_bakes_two_walls]]`).

---

## 1. The vocabulary — the smell-generator

The artifact's *form* tells you which stage made it. Hold these distinct:

| Term | What it is | Stage that owns it |
|---|---|---|
| **chain / node** | centerline polyline + junction point | Skeleton |
| **Tile** | a bounded **face of the centerline graph** (the chains are the grout) | Survey — the unit of construction |
| **Block** | the **positive polygon** = tile − asphalt; the real thing the city is made of | Survey |
| **ribbon** | the uniform-width band wrapping a block inward (asphalt/curb here; treelawn/sidewalk in Section) | Survey (hardscape) → Section (ped) |
| **slab** | the lean, GPU-flattened bake | Stage |

If you are reasoning about a Survey defect in terms of chains / `pavementHW` / carriageway centerlines, you have slipped a stage — **a Survey defect is a POLYGON problem** (`[[feedback_survey_polygon_not_ribbon_concepts]]`).

---

## 2. The artifact chain — where Survey sits

```
Intake → Skeleton → Prebake → ⟦ SURVEY ⟧ → ⟦DATA WALL⟧ → Section → Bake → 3D
```

| | The 'thing' it freezes | File |
|---|---|---|
| **input** | the prebaked frame (the First Bake) | `src/data/ribbons.json` |
| **Survey authors** | operator intent — widths, caps, anchor, corner-R, land-use | `clean/overlay.json` (geometry) · `looks/<id>/design.json` (corner-R, customs, LU) |
| **⟦WALL⟧ freezes** | the per-tile hardscape SHAPE (`_shapeArtifact`) | `public/baked/<id>/shape.json` |

**Built + consumed by** `src/lib/tileGround.js` — the *same* `buildTileGround()` drives the **live 2D Designer render** and the **bake**, so Survey is **WYSIWYG by construction** (live == bake). *WYSIWYG is a property of the **path**, not a correctness claim — the live view faithfully shows the bake **including its current defects** (§6). The map is broken right now; it is broken identically in both places.*

---

## 3. How it builds — the live construction (`tileGround.js`)

The live construction is the **tile model** (`buildTileGround()`, `tileGround.js:591`). **LS runs it unflagged** (`isTileScene = true`, `BlockGeometryV2Debug.jsx:253`). ⚠️ The figure-ground module (`buildBlockGeometryV2` / `cornersAtIx`) is **dead-in-place** — still *mounted* only to feed legacy authoring overlays, **never the render or bake.** Anything framing the construction or a fix around `cornersAtIx` is pointed at the dead path.

The SHAPE pass, in execution order:

1. **`extractFaces(streets)` (`:303`) → the Tiles.** A half-edge DCEL planar walk over the **shared-vertex graph** of `ribbons.streets[].points` (nodes keyed to 0.1 mm). Each bounded face = one tile, tagged per-edge with its owning `(street, side)`. **Grade-separated streets are filtered out first** (`:600`) so a 2D crossing with no shared vertex can't bowtie the faces; they're stroked separately as flat asphalt and rendered behind the local network.
2. **Outward stroke → the asphalt silhouette.** `groupRuns` (`:450`) collects each tile's boundary into maximal runs of one `(street, side)`; `strokeOpen` (`:198`) offsets each run **outward** by the asphalt half-width `edgeDepth(runMeasure(run), side, 'A')`. Dead-end **round** tips get a circle cap; **blunt/none** tips stay flat.
3. **`filletRing` (`:90`) rounds the convex corners ONCE → the curb line (`iA`).** Per-vertex radius via `resolveVertR` (`:715`), 3-tier: **per-corner** override → **per-IX** override → default (4.5 m AASHTO × `cornerRadiusScale`). The achieved arcs are tagged into **`cornerFillets`** (`:920`) — the *one* corner truth the magenta authoring handle reads (no re-derivation). `jtMiter`, never `jtRound` (jtRound re-rounds and corrupts operator R=0 squares).
4. **Capacity guard (`:951`).** Engages **only on FULL collapse** — `if (!offsetRings(iA, −(WB/0.9)).length)` then bisects to `cap = 0.9 × inscribed reach`. ⚠️ A tile that pinches to a thin *non-empty* sliver keeps `cap = WB` (no clamp) → the inward offsets still run past the medial axis and `filletRing` thorns them. So this catches *full* degeneracy, **not** the partial-degeneracy thorn class (the persistent ~100 thorns — `HANDOFF-band-fold-fix.md`).
5. **Asphalt = `tile.ring − iA` (`:958`); Block = `iA`** (the rounded inner region = `tile − aFill`, rounded). The `block` output is the union of per-tile `iA` (`:1101`) — the positive polygon to the curb edge (consistent with §1: *block = tile − asphalt*).
6. **Freeze → `shapeTiles[]` (`:961`).** Per tile: `{ ring, iA, vertR, tl, sw, lu, roundTips, bluntTips, roundTipKeys, runs: runMeta[], bandJoin, cap }`. The JSON-safe `_shapeArtifact` (`:1108`, built **only** when `emitArtifact` — bake-side) is the frozen hand-off across the wall.

> **The only chain reach-back in the SHAPE pass** is `runMeasure`/`runSegOrd` (`:659`–`:686`), which resolve a run's authored `pavementHW` from `blockCustoms[skelId][side][segOrd]`. That is **authoring identity, not geometry** — it answers "which width did the operator type for this edge," nothing about node positions.

---

## 4. The authoring panel — the SHAPE controls (deliberate; use them)

Survey authors a thin **fortification overlay** keyed to Skeleton identities (`skelId`, side, `segOrd`, `ixKey`). The controls (live in `SurveyorPanel.jsx` + on-canvas overlays):

| Control | What it does | Writes |
|---|---|---|
| **Corner radius** — 3-tier (`CornersSubsection :67`) | global **scale** slider (× 4.5 m baseline); **Edit** mode → each corner is a magenta handle on the achieved curb arc (drag = radius, to-centre = square R=0, right-click reverts one); **Revert** clears all | `design.cornerRadiusScale` · `cornerRadiusOverrides[ixKey]` · `cornerCornerRadiusOverrides[ixKey|legA|legB]` |
| **Asphalt-edge** drag (on-canvas) | strokes per-side pavement half-width outward; the block (curb line) follows | per-fe `blockCustoms[skelId][side][segOrd].pavementHW` |
| **Cap** Start/End (`:300`) | None (connected) / Round (cul-de-sac) / Blunt (flat) | `overlay` `capStart` / `capEnd` |
| **Anchor** = ribbon propagation (`:286`) | **Center** (grow symmetric) vs **Inner-edge** (grow outward from the median-facing edge → median falls out). Auto-detected from corridor pairing; disabled when no pair | `overlay.anchor` (pair-mirrored) |
| **Name / Type / One-way** (`:260`–`:278`) | street metadata (residential / secondary / primary / service) | `overlay` `name` / `type` / `oneway` |
| **Hero subject** | pick the focal building | `design` |
| **Symmetric ↔ Asymmetric**; **whole-chain ↔ per-block** | author *scope* — whether an edit mirrors to both sides / fans across the whole chain vs the one block-edge | sets the selection an edit fans across |

**What is NOT Survey** (→ Section): treelawn/sidewalk depths, the ribbon corner *fills*, ADA pads. **The corner is two things in two tools** — its *shape* (curb roundness) is Survey; its *fill* (how ped bends around it) is Section.

> ⚠️ **Migration state.** The SHAPE controls have **largely consolidated into Survey already**: the asphalt-edge handle (`pavementHW`) **moved to `SurveyorOverlay`** (`:114/:424`; `MeasureOverlay:147` confirms — *"moved to Survey"*), and corner-SHAPE lives in `CornersSubsection` + `CornerEditHandles`. Ped widths (treelawn/sidewalk) stay in `Measure` (→ Section). Corner-R authoring **is wired live to the tile render** (`buildTileGround`, `BlockGeometryV2Debug.jsx:610`) — moving the Corners slider reshapes tile corners (so the tile-ledger's old "A2 no work" likely predates this wiring; confirm on the live tool). **The real remaining gap (T3/T4):** the authoring overlays still *compute* the **dead figure-ground** (`buildBlockGeometryV2`, `:409`) every authoring frame to position handles — a per-frame perf drag, and why strip-swap/translucency misbehave. Retiring it (T3 migrate handles onto tiles → T4 delete figure-ground) is the consolidation that remains. `HANDOFF-survey-section-tool-design.md`.

### 4.1 The editing model — activate, then reshape (and the perf requirement)

The operator edits **whole blocks in strips**: click a **centerline** to **activate** the blocks adjacent to it, then drag a strip (asphalt-edge, corner-R) — **symmetric** (mirror both sides) or **asymmetric** (one side).

> ⚠️ **Perf is a first-class constraint here, not a footnote.** The Designer runs over a **high-res aerial** backdrop, and the bake architecture exists precisely to **minimize live vector drawing**. Today every edit re-runs `buildTileGround` over the **entire map** (debounced) **plus** a dead figure-ground compute *every frame* (`HANDOFF-tile-feature-ledger` A-note) — that full-map redraw is why the tools feel **sticky**. **Target: recompute only the *activated* blocks.** The frozen polygon substrate (`PREBAKE.md §5`) + already-verified **block-independence** (the re-pour is block-local) make it possible — the activated block(s) reshape live, everything else stays the frozen render. (Killing figure-ground at T4 removes the other per-frame drag.) **Freezing the substrate is as much a perf move as a correctness one.**

---

## 5. The Data Wall — what freezes, and where it's enforced  *(deep: `WALL.md`)*

By the time the operator leaves Survey we hold an extremely-simplified, polygon-ready frozen dataset, and **chains are dead.** The wall is enforced **at a function signature**, not by convention:

> **`sectionPass(shapeTiles, cw, stripMat)` (`tileGround.js:487`)** takes *only* the frozen per-tile polygons + scalars — **zero handle on streets, chains, measures, or `blockCustoms`.** Section physically cannot reach back; doing so requires changing the signature (a visible, auditable edit). This is the wall made structural.

**Frozen across it:** the `shapeTiles` / `_shapeArtifact` — block silhouette (`ring`), curb line (`iA`), per-vertex radius (`vertR`), the run's *frozen* measure, and the dead-end tip typology. Everything Section needs, nothing chain-shaped.

*(The wall **should** sit even earlier — at the Skeleton/prebake boundary (P2). Today it sits at `sectionPass`; closing that gap is the standing architectural debt. First diagnostic on any head-scratcher: "is this chains again?" — `PIPELINE §Wall`.)*

### 5.1 ⭐ The deeper truth — Survey is **not yet polygon-first**

The block polygon is **re-derived from the centerline graph on every build** (`extractFaces` walks the chains; the silhouette is stroked + filleted from them and only *then* frozen at `sectionPass`). So chains are load-bearing right up to the freeze — Survey today is **chain-derived-then-frozen, not polygon-first.** This is the substrate behind every "corner saga":

- **The false corner (§6) is born here.** At a divided transition the carriageway *stub* is a vertex in the centerline graph → it becomes a tile vertex → `filletRing` corners it. In a true **polygon-first** Survey (block silhouette = the primary frozen/authored object, wall at **P2**) there is no stub and **no false corner** — nothing to detect, nothing to patch.
- **The canon already names the cure:** *the chains-root-problem and the corner-confusion are one disease with one cure — polygon-first* (`PIPELINE §Wall`/§Ribbon). The corner is **a symptom of the wall sitting too late, not a unit of work.**
- **∴ patching the corner inside `tileGround` (reaching back to carriageway / curb-line reasoning) is "patching chains deeper downstream" — the move the doctrine forbids.** The real fix moves the wall earlier; a corner-patch is at most a *labeled stopgap*.
- **Where the cure lives: prebake (`PREBAKE.md`).** Today prebake is a thin compile — it emits `ribbons.json`, still **chains** — and defers the chain→polygon conversion (`extractFaces` + silhouette) into Survey's per-build construction. The move is to **do that conversion once, in prebake, and freeze the polygon substrate** — the tile/block topology + the corner *identities* (resolving the divided transition as a polygon: corner the **corridor outer-edge legs, not the stubs**). Then chains die at the prebake→Survey boundary, Survey only *reshapes* the frozen rings (offset by width, round by radius), and the false corner **cannot be re-born.** Elevating prebake from compile → polygon-ization stage **is** the wall-move (wall → ~P3). The false corner becomes a **topology** decision made once upstream, not a per-build reconstruction.

---

## 6. The divided↔undivided transition — the symptom and its cure (the IP)

At a transition (a divided avenue meeting a cross-street — LS's four park corners: Mississippi×Lafayette, Park×S-18th), the carriageways diverge to open the median. **The rule** (`SKELETON.md §5d`, "the special sauce"): the **outer curb runs straight through**; the **median opens inward** — an outer edge must never inherit the median-opening divergence. The principle generalized: *the intersection interior is legitimately variable; the streets and corners outside it must be simple — the IP is finding and declaring that boundary.*

**Current state: this is the headline break visible on the live LS map today** (alongside thin-tile "thorns" — `HANDOFF-band-fold-fix.md`). State of the fix:

- **Part 1 — LANDED (frame fact).** `skeleton.js` stamps `phase.spineAtStart`/`phase.spineAtEnd` (the spine `skelId` at each carriageway endpoint) and carries it into `ribbons.json` (commit `61930d7`, geometry-neutral; present in `ribbons.json` ×23, 47 links). This is how a divided-transition end is known **without node-matching at build time** (the re-coupling that would violate the wall).
- **The defect (live).** `tileGround.extractFaces` makes the carriageway **stub** a tile vertex, so `filletRing` corners it → the **false corner** (~40 m off true at Mississippi×Lafayette) while the corridor's two clean outer-edge legs sit unused. It is **not** a skeleton fault (the centerlines are a clean square crossing, `SKELETON.md §5c`), not an asphalt-stroke fault, not a clamp — all tried and reverted.
- **The cure (committed).** Resolve the corner **identity** as a polygon at **prebake** — corner the corridor outer-edge legs, treat the divided corridor as one road — and freeze it (§5.1 · `PREBAKE.md`). The `spineAt*` frame fact (Part 1, landed) is the input that tells prebake a leg is a divided transition.
- **Operator ground truth:** `scratch/correct-target-mississippi-lafayette.json` (two straight curb legs meeting at the true corner) = the *polygon* outcome the prebake conversion must produce.

> ⛔ **The corner-patch is KILLED (2026-06-05, Jacob's call).** The scoped Part 2 (consume `spineAt*` in `tileGround`, reconstruct the true corner from the straight curb lines, subtract a keep-out) is a **chain-patch** — it repairs a polygon by reaching back into carriageway/centerline reasoning, the forbidden *"patch chains deeper"* move (§5.1). **We are not shipping it.** The false corner dissolves when Survey becomes polygon-first (the prebake polygon-ization, §5.1). Retired: `HANDOFF-divided-false-corner.md` → `_archive/handoffs/`; `scratch/divided-false-corner-WIP.patch` abandoned.

---

## 7. The doctrine, in one place

- **Survey = SHAPE; Section = FILL.** No pedestrian depth in Survey.
- **A Survey defect is a POLYGON problem** — diagnose in tiles/blocks, never by reasoning back through chains, `pavementHW`, or inner-edge measures (different data model from Section).
- **One construction path:** `buildTileGround`, live == bake. Figure-ground (`buildBlockGeometryV2` / `cornersAtIx`) is dead-in-place — never the live target.
- **The wall is the `sectionPass` signature.** Keep it chain-free; reaching back is the bug-class.
- **The Skeleton is a black box.** Fortify on top; fix the bones and Survey shrinks.
- **Intersection variable, street/corner simple** — the boundary is the IP (§6).
- **Polygon-first is the target; chain-derived-then-frozen is today's reality (§5.1).** Artifacts like the false corner are symptoms of the wall sitting too late — cure by moving the wall earlier, never by patching the corner.
- **A circled Survey issue may root in DATA or SKELETON, not our polygonization** — keep that door open when diagnosing (the false corner was partly scrambled carriageway measures; `[[feedback_geometry_bugs_may_be_data_bugs]]`). The operator points at issues and fortifies *shape*; they do **not** want or need to control the Skeleton or the OSM classifications (the black box — that messiness is ours to absorb). When the root is data/skeleton, fix it **systemically in the frame, invisibly — never add a user control for it.**

---

## Cross-references
- `SKELETON.md` — the frame Survey consumes (the paired front-half rebuild spec).
- `PIPELINE.md §survey` + `§Wall` — the execution spine (this doc is the deep chapter it points into).
- `ARCHITECTURE.md §2.1` — the three tools; Survey ≠ Section (different data models).
- `RIBBONS.md` — the ribbon/corner geometry canon (the tile construction's invariants).
- `SECTION-CENSUS.md` — the FILL side, past the wall.
- `HANDOFF-survey-section-tool-design.md` — the open authoring-migration work. *(The divided-false-corner patch brief is killed → `_archive/handoffs/`.)*
- `src/lib/tileGround.js` — the live construction + bake.
- Memory: `[[project_two_bakes_two_walls]]`, `[[feedback_survey_polygon_not_ribbon_concepts]]`, `[[project_special_sauce_intersection_street_distinction]]`.
