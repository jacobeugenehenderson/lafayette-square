# The Skeleton

**The keystone of the cartograph — both an *idea* (a pipeline stage) and a *thing* (the `skeleton.json` artifact we are literally building).** This is its home reference: what it is, the document it freezes, how it's built, the authoring affordances it powers, and where it's still incomplete.

> **Status: v0.2 (2026-06-04) — new, additive.** Consolidates notation that was previously scattered across `PIPELINE.md`, `FEATURES.md §367–387/§437/§439`, `ARCHITECTURE.md §2.1`, `OSM-FORENSICS.md`, `skeleton.js` code comments, and ~70 HANDOFFs. Those sources stay (this is additive, not destructive); this doc is the *index + the artifact reference*. Part of the cartograph quintet's orbit (`FEATURES` / `ARCHITECTURE` / `BACKLOG` / `NOTES` / `RIBBONS`); read alongside `PIPELINE.md` (the execution spine).

> **🔬 Forensic basis (read before trusting the doctrine below).** This design is *evidence-grounded*, not asserted — the proof lives in `OSM-FORENSICS.md` (the Osteopathologist) + `OSM-FORENSICS-EVAL.md` (the build eval). The load-bearing findings, with their homes: **(a)** the frame was *strictly poorer than raw OSM* — "OSM or us?" = **100% us** (`OSM-FORENSICS` Part 5); **(b) 79/79 interior T-junctions** sat in raw OSM at exactly 0.00 m and were deleted by the old junction-*blind* `simplify()` (Part 3.1) — this is *why* §3 step 8 is junction-protected; **(c)** extractability **proven** on a re-runnable prototype: 33% vertex reduction while keeping **all 338 junctions**, vs production's 48%-but-79-destroyed (Part 3.5); **(d)** tags are *present-and-discarded* at P1 (**242 `lanes` · 261 `surface` · 171 `maxspeed` · 28 `median width` already computed**) — "stop dropping it" is most of the enrichment (Part 2); **(e)** the **Dolman→18th** name-transition is the canonical regression case, and fixing the frame deleted two `derive.js` scars (the West-18th densify + LaSalle magic-coord hacks; `OSM-FORENSICS-EVAL`). The downstream damage these caused — the 3 m fuzzy re-projection snap (`IX_SEG_SNAP`), the blunt-and-pray cap — all trace to the junction loss.

---

## 0. Why the skeleton is "the most important document"

Jacob's words: *"Skeleton is **THE most important document** in the cartograph."* Meant literally — the skeleton is the keystone **file** (`skeleton.json`) *and* the special sauce / IP. Two load-bearing facts follow:

- **It is a black box for the user.** Survey originally existed as *user controls for the skeleton*, but those controls were too complex and not very helpful. We've changed methods elsewhere in the product, but the **Skeleton remains the Skeleton**: the operator does not edit the skeleton's graph; they *fortify* on top of it (widths, caps, corner radius — the Survey/Measure overlay). **If the skeleton is right, Survey shrinks to thin fortification.** *("The Skeleton is The First Bake."* — `[[project_skeleton_is_the_first_bake]]`.)
- **It is the wall's anchor.** By the time the operator leaves Survey we should be holding an *extremely-simplified, polygon-ready frozen dataset*, and chains should be **dead** (`PIPELINE.md §Wall`). The closer `skeleton.json` is to polygon-ready at birth, the earlier the Data Wall sits — that gap is the app's standing architectural debt.

---

## 1. The artifact chain — where the skeleton sits

Every pipeline stage *freezes a real document*. The skeleton is link #2, and it is the one all downstream geometry trusts.

```
Intake → Skeleton → Prebake → Survey → ⟦DATA WALL⟧ → Section → Bake → 3D
```

| Stage | The 'thing' it freezes | File | Size (LS) |
|---|---|---|---|
| **Intake** | cleaned OSM + the neighborhood disc | `data/<id>/clean/map.json` · `neighborhood_boundary.json` | 14M · 8K |
| **Skeleton** | **the frame** — `{streets[], paths[], junctions[], nameTransitions[]}` | **`data/<id>/clean/skeleton.json`** | **1.3M** |
| **Prebake** | the First-Bake geometry | `src/data/ribbons.json` | 1.3M |
| **Survey** | operator intent (widths, caps, anchor, corner R) | `clean/overlay.json` · `looks/<id>/design.json` | 108K · 12K |
| **⟦WALL⟧** | the frozen per-tile shape (`_shapeArtifact`) | `public/baked/<id>/shape.json` | 64K |
| **Section** | *(in-memory ped FILL off the frozen shape)* | — | — |
| **Bake → 3D** | the slab | `public/baked/<id>/{ground,buildings,lamps,scene}.{json,bin}` + lightmap | the slab |

**Built by** `cartograph/skeleton.js` (`osm.json → skeleton.json`). **Consumed by** `pipeline.js` + `promote-ribbons.js` → `ribbons.json` → `tileGround.js` (the live 2D Survey render *and* the bake — same module, WYSIWYG by construction). ⚠️ **Two-step rebuild:** run `skeleton.js` **then** `pipeline.js` — the pipeline does NOT re-run the extractor (`[[feedback_skeleton_pipeline_two_step]]`).

---

## 2. The artifact — `skeleton.json` schema

Top level: `{ streets[], paths[], junctions[], nameTransitions[] }`.

### `streets[]` — the canonical chains (the centerline graph)
| field | meaning |
|---|---|
| `id` | slug, unique. Divided roads emit two: `<slug>-0`, `<slug>-1` (one per carriageway). |
| `name` | street name (the welder groups OSM fragments by it). |
| `highway` | OSM class (`residential` / `secondary` / `primary` / `service` / `motorway` / `…_link`). |
| `oneway` | bool. Oneway chains keep OSM direction; bidi chains are canonical-oriented (dominant axis positive). |
| `points` | `[{x,z}]` — the centerline, **junction-protected-RDP-simplified** (eps 1.0 m; loops 0.3 m). The polygon-ready vertices. |
| `sources` | the OSM way ids welded into this chain (grade is summarized over **all** of them). |
| `seed` | seeded cross-section (lanes/surface/maxspeed → default widths) from `seedSection`. |
| `lanes` / `surface` / `maxspeed` | raw OSM tags, carried through *verbatim* on named streets when present (conditional — the marrow the forensics said to stop dropping). Distinct from `seed`, which *interprets* them into widths. |
| `layer` / `bridge` / `tunnel` | raw OSM grade tags, summarized over `sources`. |
| `gradeSeparated` | operative flag = `entirelyOffGrade ‖ isLimitedAccess(highway)`. Consumers **exclude these from the face graph** (else the 2D crossing bowties `extractFaces`). Folds in motorway/trunk + links. Surface bridges (Mississippi) stay `false` and keep bounding blocks. (`gradeFields`; `HANDOFF-onframe-faces.md`; FEATURES §"Grade separation".) |
| `phase` | `{ kind: 'divided'|'single', role: 'carriageway-A'|'carriageway-B'|'spine', corridorName, pairKey, medianWidth?, startNode?, endNode? }`. Carries the divided-road structure downstream so derive/knit don't rediscover it. `medianWidth` = the paired-carriageway gap. `startNode`/`endNode` are stamped post-normalize (the endpoint node keys, after the canonical-direction flip). |
| `caps` | per-endpoint geometric cap info (degree, cap type) — Survey's Cap Start/End authors over it. |

> **Note — unnamed vehicular streets** (motorway/trunk/`*_link`, §3 step 7) are built *inline*, not via `makeStreet`, so they carry a slightly different field set: synthetic `name`, `gradeSeparated:true`, plus `osmIds` + raw `tags` (and no `seed`/`phase`). Named streets are the `makeStreet` shape above.

### `junctions[]` — the node typology
`{ x, z, degree, kind }`. Built by `buildNodeGraph`: a coord touched by ≥2 distinct streets, degree ≥ 3 (`d===2` bends/transitions are NOT junctions). `kind = kindOf(degree)` (T / cross / Y …). **Shared-vertex only** — grade-separated crossings share no vertex, so junctions carry **zero false grade crossings** (don't hunt grade bugs here). 329 on LS.

### `nameTransitions[]`
`{ x, z, from, to, fromId, toId }` — where one named street becomes another at a shared node (21 on LS). Marrow the figure-ground path used to drop.

### `paths[]`
Non-vehicular unnamed ways (footway/cycleway/steps/service) — `{ id, highway, tags, coords, osmId }`. Render pavement-only, no measure authoring.

---

## 3. How it's built — `skeleton.js` stages, in order

`main()` runs these top-to-bottom. **All cleanup is *along* chains; there is no *across-intersection* pass yet (see §5).**

1. **`groupByName(highways)`** — bucket raw OSM highway features by name (+ an unnamed bucket).
2. **`analyzePhases(name, fragments)`** *(Path B, phases 1+2)* — classify each named fragment as `divided-A` / `divided-B` / `single-oneway` / `single-bidi`. Produces `signatureByOsmId`, `pairKeyByOsmId`, and `gapByPairKey` (the antiparallel-pair gap **= median width**). This is the divided-road detector. Pure analysis — welding is untouched here.
3. **`weldChains(fragments, signature, pairKey)`** + `splitAtFolds` — fuse fragments **laterally** within a name group, gated on `(signature, pairKey)` equality so a bidi splice can't fuse opposing carriageways. Owns the lateral distinction (keeps A and B apart).
4. **`weldLongitudinal(chains)`** *(D1, `5348fbc`)* — fuse each carriageway's own colinear **oneway** continuation that `weldChains` left fragmented (tail-to-head, heading-continuous, degree-2 node). Truman 8→2. Excludes degree-3+ nodes (a Y/junction is not a weld point).
5. **`repairDividedPairs(merged)`** — re-derive A/B pairing on the now-continuous carriageways (per-fragment role labels don't survive the merge), gated on station-overlap (`8392b3e`) so offset stubs don't mis-pair.
   - **SAFETY VALVE** — accept the longitudinal merge only if it didn't *orphan* a carriageway (a splayed interchange corridor can merge past the re-pairing gap). A corridor may only improve or stay identical, never regress below its pre-weld carriageway count.
6. **`makeStreet(...)`** per surviving chain — one street per chain; divided roads emit two (medians emergent downstream). Stamps `phase` + grade fields.
7. **Unnamed vehicular** (`motorway`/`trunk`/`*_link`) → streets with synthetic names + `gradeSeparated:true`. Everything else → `paths[]`.
8. **Junction-protected RDP simplify** — build `junctionKeys` (coords owned by ≥2 streets), then `simplifyRDP(points, eps, junctionKeys)` per street. `eps = 1.0 m`; **closed loops auto-detected** (`hypot(first, last) < 1 m`, no OSM tag yet) get the tighter `0.3 m`. Junction/shared-node vertices are **forced split-points + forced keeps** — the fix for the **79 deleted interior T-junctions** the old junction-*blind* local `simplify()` removed (Osteopathologist; `OSM-FORENSICS.md` Part 3.1). **Why `1.0 m`, not more aggressive:** the density floor is *offset-safety* — the widest ribbon the centerline must support sets how coarse RDP may go (over-thin a curve and the inward offset self-intersects). The forensics' "Goldilocks" target (48 curved streets, ≤5 m max-seg) is offset-safe everywhere at this eps. ⚠️ **This protection is also the dogleg's cause — see §5.**
9. **Canonical direction pass** — orient bidi chains so the dominant axis component of `(last−first)` is positive (stable left/right + winding). Oneway left alone.
10. **`buildNodeGraph`** → `junctions[]`; **`gradeFields`** per street; **nameTransitions**; write `skeleton.json` (via `io.js writeIfChanged`).

**Doctrine:** simpler output = healthier everything downstream; chain/node minimization is the lever that moves the Data Wall to P2. ⛔ **Junction-protected always.** Carry tags / grade-sep / divided-pair facts as frame truth — never drop them at P1.

---

## 4. The affordances the skeleton powers (the Survey/Measure authoring catalog)

Survey/Measure don't edit the skeleton graph — they author a thin **fortification overlay** keyed to the skeleton's identities (`skelId`, side, `segOrd`). The controls (live in `SurveyorPanel.jsx` / `MeasurePanel.jsx` / on-canvas overlays):

### Polygon SHAPE + corner authoring (Survey)
- **Corners subsection** (`CornersSubsection`) — the corner-SHAPE kit. 3-tier radius: a global **Radius** scale (× AASHTO 4.5 m baseline), an **Edit** mode where each corner becomes a **magenta handle lying on the achieved curb arc** (`CornerEditHandles` — drag distance from the IX = radius; drag to centre = square; right-click reverts one), and a **Revert** that wipes overrides + resets scale. Keys: per-IX `ixKey` (3-dp point) → per-corner `ixKey|sorted(legA,legB)`; per-corner wins. The corner is *two things in two tools*: **SHAPE here, FILL in Section** (`ARCHITECTURE.md §2.1`).
- **Asphalt-edge drag** (`SurveyorOverlay`) — strokes the per-side pavement half-width outward; the polygon (curb line) follows.
- Street **Name / Type** (residential / secondary / primary / service) / **One-way**; per-endpoint **Cap** (None=connected / Round=cul-de-sac / Blunt=flat); **Hero subject** pick.

### Roadway kind + the paired→median affordance (Survey)
- **Anchor: Center vs Inner-edge.** `center` (default) = ribbon grows **symmetrically**. `inner-edge` = ribbon grows **outward only from the median-facing edge** → the median polygon falls out. **Auto-detected** from corridor pairing (`innerSign ≠ 0` means a paired chain was found); the operator can override. This is the *"looks for paired roadways, creates a median polygon, emits ribbons from interior sides instead of centers"* affordance.
- **`inner-edge` is an authoring MODE, not a geometry override** (FEATURES §367–387): the chain stays at carriageway center; the flag (a) flips `measure.symmetric=false`, (b) seeds inboard `pavementHW=0`, (c) `innerEdgeMeasure` zeroes the inboard ped zone (no sidewalk along the median). **The median emerges by construction, never authored** — and in the live tile model it is an emergent **geometric face** from `tileGround.extractFaces`. **The two-carriageway model is LOCKED:** no pair synthesis, no median couplers, no collapse to a single spine. `setAnchor` is pair-aware (mirrors onto the `pairId` mate).

### Author scope (both tools)
- **Symmetric vs Asymmetric** — the *"Asymmetric (edit sides separately)"* checkbox. Off (default) = an edit mirrors to both sides (cross streets); on = each side independent. Asymmetric and Inner-edge are **independent** concepts (the park's streets are asymmetric-center, no anchor change).
- **Whole-chain vs Per-block** — the *"Edit whole chain"* toggle (`measureMode` `global`|`block`). Both write **per-fe**; the mode only sets the *selection* an edit fans across (the whole chain side, vs the one block-edge at the click anchor — *full row vs individually*). Customs keyed `(skelId, side, segOrd)` via `feCustomKey`. Mode-switching is non-destructive.

### Cross-section widths (Measure → Section)
- Per-side **Curb / Treelawn / Sidewalk** (`SideBlock`, in feet); terminal inferred from values. Asphalt half-width is authored in Survey, referenced here.

---

## 5. Known gaps — the missing *across-intersection* organ

The skeleton cleans **along** chains (weld, longitudinal-weld, RDP) but has **no pass that consolidates geometry *at* an intersection.** It preserves OSM's intersection representation verbatim. That single gap produces two visible symptoms (forensically confirmed 2026-06-04, this is the evidence base):

### 5a. The dog-leg — a through-junction pinned *off-chord*
At a T, the through-road should pass straight. But junction-protected RDP (§3 step 8) is *forced to keep* the junction node exactly where OSM digitized it — and that node often sits **3–4 m off the line its own through-neighbours define**:

| through-road @ junction | node off the through-chord | through-kink |
|---|---|---|
| South 18th St (J#24) | 3.32 m | 10.7° |
| South Jefferson Ave (J#317) | 4.13 m | 19.3° |
| Geyer Ave (J#252) | 3.07 m | 31.1° |

**46 such through-junction kinks** in LS. The flat-side block edge is just the offset of that centerline, so it inherits the bow → the dog-leg. The re-marked **north edge of Lafayette Park deviates 3.33 m** from dead-straight over 358 m — same mechanism. *It is not the lines and not the fillet; the protection that saved the 79 Ts also freezes an OSM excursion the through-road should ignore.* **Fix direction (prong 3):** straighten the through-pair *through* the protected node (project the node onto the through-chord, drag any shared branch endpoint with it) — keep the node shared, lose the excursion. `HANDOFF-name-logic-skeleton-pass.md`.

> **⚠️ 2026-06-04 (night) — TRIED, REVERTED, trail banked.** A streets-only through-junction straightener was implemented (after RDP, before `buildNodeGraph`; guards: single through-street, turn ≤25°, off-chord ≤4.5 m). It worked *on the data* — 124 nodes projected, South 18th 10.7°→0 / S Jefferson 19.3°→0, real bends preserved, junctions 329→329. **But it did NOT resolve the doglegs Jacob actually sees**, which are **on the polygon perimeter in the Survey view** — specifically **3 very-visible doglegs on the Lafayette Park polygon's perimeter ring** (we work polygons here; this is the block/tile boundary, *not* any path). The required `ribbons.json` rebuild also surfaced a Benton-loop render regression whose inputs diff **byte-identical** to HEAD → located in the pipeline-rebuild / `tileGround` render, not the frame (palimpsest drift). **Reverted to known-good** (geometry → HEAD; docs kept); straightener preserved at **`scratch/through-junction-straightener.patch`**. **⭐ The mechanism is already forensically known — `HANDOFF-junction-band-thorns-FINDINGS.md` (Bollard).** The marked park-perimeter doglegs (Vail→Park, Kennett→Mississippi, Mackay→Park, Albion→Missouri, Waverly→Lafayette) have **clean centerlines (0.0–0.1°, ~0 m jog)** — they are **Root A: a T-mouth band-fold**, the deep `iW` sidewalk offset folding in `tileGround.sectionPass` where a wide avenue necks the tile (the G12 partial-degeneracy, made local). **They are NOT a skeleton problem** — so this §5a through-junction straightener was the *wrong layer* for the visible park doglegs (it addressed a separate, less-visible population: real centerline kinks at South 18th / S Jefferson). **The visible-park fix = the LOCAL band clamp in `tileGround.js`, `HANDOFF-band-fold-fix.md` (prong 2, Bollard).** Lesson re-learned: read `FINDINGS` before building (`[[feedback_read_canon_before_forensics]]`). Next session: take the park doglegs to **band-fold-fix (tileGround)**, not the skeleton.

### 5b. The degenerate corner — a divided avenue shattered at the cross-street
The park's **NW corner** (operator-traced true point ≈ `(180, 210.5)`) sits at the **Lafayette Ave × Mississippi Ave** junction, stored as a **degree-5 "Y" node** where Lafayette arrives as **three short fragments** (90 m, 15.6 m, 15.2 m) at three headings — because Lafayette is partially-divided (`inner-edge` carriageway pairs ↔ `center`) and the **divided↔undivided transition lands on the cross-street.** The DCEL face-walk + fillet then build the corner from stub-ends → edges **not parallel to either street.** Identical at **Park Ave × South 18th** (the other degree-5 cluster).

⭐ **This is the oldest corner, not a new bug.** In the figure-ground path these were special-cased away: FEATURES §437 — *"the median wedge between two paired carriageways converging at one IX — **LS's four park-corner IXs** — the corner record is skipped entirely."* The tile path no longer skips them; it builds them from un-consolidated fragments. **Fix direction (prong 4 — the highest-leverage):** intersection consolidation — collapse the fragment-cluster + transition into one clean crossing **with the two-carriageway model kept intact.** Forensic-first; **survey `osm2streets`** (adopt the *ideas* — dual-carriageway-merging + short-link-collapse + intersection geometry — onto our frame; do **not** adopt the library). `PIPELINE.md §Wall` prong 4.

### Both gaps are one organ
Doglegs (5a) and degenerate corners (5b) are the same missing capability: **across-intersection consolidation.** The two-carriageway divided model is correct and locked; what's absent is the pass that makes intersections clean. That pass belongs **in `skeleton.js`, after welding, before RDP** — consolidate the intersection, *then* simplify the now-clean chains.

---

## 6. The doctrine, in one place

- **The skeleton is the First Bake.** The frame should be born polygon-ready; everything downstream is a pure consumer (`[[project_two_bakes_two_walls]]`).
- **The skeleton is a black box.** The user fortifies (widths/caps/corner-R) — they do not edit the graph. Fix the bones and Survey shrinks.
- **Junction-protected always.** Never the junction-*blind* simplify (it deleted 79 interior Ts).
- **The two-carriageway divided model is locked.** Median emerges, never authored; no collapse to a single spine.
- **First diagnostic on any head-scratcher:** *"is this chains again?"* — and the fix is always *move the wall earlier / make the skeleton cleaner*, never *patch chains deeper downstream.*

---

## Cross-references
- `PIPELINE.md` — execution spine (§"The stages, in order", §Wall, P1–P3); this doc is the deep chapter §skeleton points into.
- `FEATURES.md §367–387` — divided-road inner-edge anchor (the authoritative affordance spec); §437 corner-Q + park-corner skip; §439 asphalt-rect simplification.
- `ARCHITECTURE.md §2.1` — the three tools (Survey · Section · Stage); the corner is SHAPE+FILL in two tools.
- `OSM-FORENSICS.md` / `OSM-FORENSICS-EVAL.md` — the Osteopathologist frame forensics (79 Ts, extractability).
- `RIBBONS.md` — Phase B geometry (the consumer of this frame).
- `src/lib/tileGround.js` — the live render + bake consumer (`extractFaces`, `sectionPass`, the fillet).
- Memory: `[[project_skeleton_is_the_first_bake]]`, `[[project_two_bakes_two_walls]]`, `[[feedback_skeleton_pipeline_two_step]]`, `[[project_truman_divided_road_knot]]`.
