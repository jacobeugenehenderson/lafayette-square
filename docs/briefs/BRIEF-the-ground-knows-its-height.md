# BRIEF — each piece of the ground knows its own height: terrain before ribbons, the kerb and the shore built from the shape chain

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-08
evict-when: RULING: Jacob passes, by eye at street level, (1) HPDM's sidewalks on its hills: level across, following the street's grade along, with no stretched or tilted walk, (2) LS baked WITH its raised kerb (0.15 m) and no ground refusal, and (3) Huron's and Provincetown's shorelines smooth where land meets water, with no jags and no cracks (the shore gap walk at zero after its instrument fix). Both towns re-baked from one pour each. node checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs is green on every town.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.**
**Report to Boz** (the coordinator session Jacob names when he dispatches you).

**Instruction: confirm-then-build.** This brief REOPENS DESIGN, by Jacob's explicit ruling (§0). That makes the
confirm step heavier than usual: every premise below is a claim to check against the code, and the design in §5 is a
PROPOSAL, not a ruling. Read the canon and code in §2–§3, run the measurements in §4, and **stop and report** before
you write any production code. Where the code contradicts this brief, stop and flag it. That is the work, not an
interruption.

---

## 0. What this is (Jacob, 2026-10-07/08)

Three defects that turned out to be one design question.

**(a) The stretched sidewalk.** *"We currently paint then stretch. That is usually fine; unfortunately many times it
means a stretched sidewalk. I think we need to do terrain sometime -during- ribbons; like: stamp id fes, terrain, then
ribbons."* Asked what the defect looks like, he confirmed it is the walk tilting and warping across hills, **frequent in
HPDM**. HPDM's `terrainExag` is `null`, which means the kit default 1× (`terrainCommon.js#DEFAULT_V_EXAG`: "draw the ground at the height the ground actually is"; 1× is 100% of real, and 0 is flat). So this is the real slope, not exaggeration. ⚠️ The value is a per-shot CEILING the view eases toward (Hero → the town's value, Browse → 0), so today the tilt shows at Hero and Street, not in Browse. Measure and eye-gate there. ⛔ But don't build on Browse being flat: Jacob may re-add depth to Browse (2026-10-08), so every check here must hold at ANY exaggeration, not just today's per-shot values.

**(b) LS's raised kerb.** LS's ground bake is REFUSED with its authored kerb (0.15 m, Jacob 2026-10-06): 266
T-junctions after the kerb's creases are cut into the conformed mesh (`BRIEF-corner-ramps-and-kerb §9`). The proposed
patch (snap rounding inside `cutAlong`) was **ruled out**: *"I don't understand how this fits with the protopolygon; it
exists for exactly this reason."*

**(c) The jagged shore** (Jacob, 2026-10-08, after Argon's hole hunt): *"If we aren't smoothing the lidar points into
a smooth line and extruded into a plane WHICH MEETS a smoothed ground plane similarly extruded, and instead the system is
just searching for the closest points, that explains our jags. This may be also an issue with sequence; and perhaps this
is related to WHEN we do the terrain extrusion."* And: **① is the single source of truth for anything that began as a
chain and has two sides**. There is a resolution mismatch with the lidar, probably on both sides of the first offset
chains. He ruled that **no more measuring is needed** to establish the shape of the problem. Argon's measurements
(2026-10-07/08, facts only):
- The shore-median sand edge is the lidar waterline traced by marching squares at 1 m, UNSMOOTHED
  (`bake-shore-median.mjs` → `bake-ground`'s `shore` group). It zigzags p50 0.16 · p90 0.73 · p99 2.24 m off its own
  ±3 m chord. Meanwhile the coast is ALSO a chain in ① (`ROADMAP H-4`: "stroke the coast as a two-sided chain"). So the
  waterline has two shape sources at two resolutions.
- The ground is pressed flat into the 2D partition at bake and lifted per VERTEX at render from the 5 m terrain texture
  (`terrainShader.js#patchTerrain`, perVertex). The extrusion happens LAST and samples the terrain only where the 2D
  edges happen to put vertices. The bed raster is the same 5 m grid.
- The cracks: Huron's biggest "hole" (9,212 px at −2386, −2008) is the INSTRUMENT. The gap walk's near-from-water camera
  sits 20 m out along the normal, which on a ~12 m channel puts it under the far bank. One real crack cluster (~785
  px/station near 1417–1430, −320…−326): two thin lines along the shoreline where rays pass under a `face:beach` drawn at
  ~0.31 m, with open edges on `mat:shore` nearby. Down-facing triangles and T-junctions are ruled out; the mechanism is not
  established.

**The reopening:** *"Yes this reopens design but we have to solve it, so too bad."* Not built tonight; this brief is so
an agent with directed context can do it soon.

⭐ **The shared root, Boz's reading (confirm it, §4):** today every piece of the ground is painted FLAT, then draped
over the terrain, and the kerb is then CUT into the draped mesh. Both defects come from deciding height AFTER shape.

⭐ The shore is the same root: its SHAPE comes from a second, unsmoothed source beside its chain in ①, and its HEIGHT
is decided last, per vertex, at render.

⛔ **Keep the stages apart (Jacob, 2026-10-08; `RIBBONS.md` "① the protopolygon … ② the curb polygons"):** ① the
protopolygon is the literal first corrected offset of the chains: width-free, sharp, never seen, never authored, one
closed path. **It gets no heights and no pieces.** The pieces are DOWNSTREAM of it: ② the curb polygons offset from ①,
then Section's bands painted into them (the partition). The canon warns that conflating ① with what is built from it
"put the wrong construction in `src/`". So the fix is not "the protopolygon carries heights". It is: **the painted
pieces, each derived from ① through ②, carry their own height law, and the ground is meshed from those pieces.** The
kerb isn't cut into a mesh afterwards. Its face is the edge where a road piece meets a curb piece (② gives that edge),
and its ramps, flares and tapers are pieces built in the same chain, as the corners and bands already are.

## 1. The rule this must keep (`CLAUDE.md` Layer 0)

- **A kit, not HPDM.** The method must hold on a town nobody has looked at: flat (Huron), hilly (HPDM), coastal
  (Provincetown), heavily authored (LS). No per-town or per-street exception, and no constant tuned to HPDM's slopes.
  Every tolerance is the town's authored value with a neutral default, or derived from the scene.
- **Fails loudly.** A piece whose height law can't be satisfied (a walk that can't stay level within its tolerance, a
  kerb step with no face) is a COUNTED, NAMED failure, never a silent drape.
- **The override is the product.** Authored widths, corners and the kerb height (`norms.json#kerb`) are inputs. Measure
  with each town's `blockCustoms` and `design.json` loaded.
- **Never add a source of truth** (`feedback_never_add_a_source_of_truth`). The terrain (`terrain.bin`), the partition
  (① and ② and the painted partition, `shape.json`) and the kerb norm already exist. The height law is read off them, never a parallel
  list. Replacing today's drape-then-cut with the new construction is a SWAP: the old path is deleted in the same
  change.

## 2. Read first (the canon, to the section)

- `ORIENTATION.md`, then `README.md §⭐ START HERE`, and the topic canon below.
- `cartograph/BAKE.md` §the steps (1 pipeline → 2 promote-ribbons → … terrain … 3 ground) and the terrain block
  (`bake-terrain.js` reads the coast and lidar only: confirm it reads nothing the ribbons make).
- `cartograph/ARCHITECTURE.md`: "Ground conformance — one DRAWN surface, everything sits on it", "Terrain doctrine —
  one dial, corner-mean anchor", and the `PAINT_ORDER` decision rule.
- `cartograph/SECTION.md §4` and `cartograph/RIBBONS.md §1`: ① is the producer for Survey AND Section, and the fill
  paints from the partition.
- `cartograph/POLYGON-FIRST.md`, `cartograph/SKELETON.md §0.1`, and `cartograph/PIPELINE.md §5` (the Wall: what is
  frozen, and why freezing wrong data is worse than not freezing).
- `docs/briefs/BRIEF-corner-ramps-and-kerb.md §3` step 5 (the kerb ruling: the whole block inboard of the kerb face
  lifts by h, the road stays at 0, a riser where the kerb is drawn, cuts slope h → 0, curbless edges taper) and **§9**
  (the 266 T-junctions, the shelved radial landings, and snap rounding ruled out).
- `docs/briefs/BRIEF-ground-cross-polygon-conformity.md`: "the ground must stretch, not break". That is the conformity
  this must not regress.
- **The shore:** `ROADMAP H-4` (the coast as a two-sided chain, the lake face as its own ring, the bb as the frame),
  `RIBBONS §1` (how a coast arrives), and `docs/briefs/BRIEF-the-shore-is-closed.md` (the shore median; its step 3 treatment
  rules are MATERIAL, grain and handoffs, and stay there; the SHAPE and HEIGHT of the waterline are this brief's).
  "Smoothing is skeleton, rounding is Survey" (`RIBBONS`, on ①): a waterline's smoothing belongs at the chain, before ①.
- Memory: `project_terrain_doctrine_2026_05_14` (uExag is the single dial; the mesh carries terrain × uExag at runtime).

## 3. Code sites (confirm each; line numbers drift, so cite symbols)

| what | where |
|---|---|
| the pour: skeleton, stamps, feature edges, ribbons | `cartograph/pipeline.js`, `cartograph/derive.js` → `clean/map.json` |
| the terrain | `cartograph/bake-terrain.js` → `terrain.json` + `terrain.bin` |
| the painter: the partition, the bands | `src/lib/tileGround.js` (`buildTileGround`, `sectionPassProtoTile`, `PAINT_ORDER`) |
| flat paint → mesh → conformed to terrain | `cartograph/bake-ground.js` (`buildTileBakeShape`, `triangulateAndRefine`) · `cartograph/groundConformity.js` (`conformAndRefine`, `closeBoundaryTJunctions`, `findTJunctions`, `cutAlong`) |
| the raised kerb, as cut-then-lift | `cartograph/kerbLift.mjs` (`ringsInside`, `liftBuffer`, `riserFromEdges`, `curblessEdges`), its guard at `bake-ground.js` (`kerbH`) |
| the runtime drape | `src/utils/terrainShader.js` (`patchTerrain`, perVertex) · `src/lib/terrainCommon.js` (`makeElevationSampler`, `DEFAULT_V_EXAG`) |
| objects that sit on the drawn ground | `cartograph/bake-tree-anchors.js`, `bake-buildings.js` (centroid y), `bake-lamps.js` |
| the coast chain and its water side | `cartograph/coastline.mjs` (`weldCoastlines`), the pour's coast stroke (`RIBBONS §1`) |
| the shore median's sand edge (lidar marching squares, 1 m) | `cartograph/bake-shore-median.mjs` → `bake-ground.js`'s `shore` group |
| the water level and the bed | `bake-terrain.js` (`terrain.json#water`, `#bed`), the 5 m raster |
| the shore gap instrument | `checks/claims-no-view-reaches-the-sky-at-the-shore.mjs`, gaps.html (`at=` / `keep=` / hole-ray params, Argon 2026-10-08) |
| the shelved corner rework (the same seam) | `scratch/perp-corner/radial-landings-SHELVED-2026-10-07.diff` |
| the kerb-cut harness | `scratch/kerb-cut/dump.mjs`, `scratch/kerb-cut/harness.mjs` |

## 4. Step 1: measure, then STOP and report (read-only)

1. **Confirm the order and the dependencies.** List each bake step's inputs from `runIfDirty` / `bake-reads.json`.
   Confirm terrain reads nothing the ribbons make, and that the ribbons and paint today read no terrain. If either is
   false, stop: §5's reorder premise changes.
2. **Size the stretched walk, per town** (HPDM, Huron, Provincetown and LS; Altadena if it bakes). For every walk band
   (and curb and lawn), measure along its length across its width: the cross-slope (the height difference across the
   band ÷ its plan width), and how it changes along the band (the warp). Report the distribution (p50 / p90 / max)
   and the count above a cross-slope a person would read as tilted. ⭐ The threshold is NOT yours to pick: report the
   distribution and propose the source (an accessibility norm already in the kit, e.g. the curb-cut norm's slopes in
   `norms.json`, or Jacob's call). Give HPDM's ten worst stretches by place (the tile whose ring contains them, the arc
   and its `skelId · side · segOrd`; ⛔ never "nearest street").
   *Before reporting a defect:* is it the authoring's intended output? A walk the operator widened onto a slope is
   still his walk.
3. **Where does the walk's height come from today?** For one of HPDM's worst stretches, trace a vertex from the paint
   to its rendered y: what the conformed mesh holds, and what the runtime adds. Say whether the tilt is the terrain
   itself, the mesh's coarseness (`triangulateAndRefine`'s max edge), or both. Cause measured, or "cause not
   established".
4. **The kerb, re-read in this light.** Confirm §9's 266 and where they sit. Then answer the first question Jacob's
   ruling raised: **is each ramp, flare and taper outline already a piece of the painted partition (derived through
   ① → ② → the bands), or only a record that `kerbLift.mjs` turns into a cut afterwards?**
   Name the producer of each outline (`kerbLift.mjs` today) and whether it could be emitted as partition pieces instead.
5. **Who else reads a ground height** (trees, buildings, lamps, the revetment, the shore band, labels): list each and
   what it samples (the field, or the drawn mesh). A height law per piece changes the drawn ground, and every one of
   these must still sit on it.

6. **The shore needs no new measuring** (Jacob's ruling; facts in §0(c)). Two exceptions, both instrument work:
   FIX the gap walk's camera so it never lands under the far bank (derive its standoff from the local water width, never
   the 20 m constant), and re-run it to get a true baseline. Then say whether the ~1417–1430 crack cluster survives on
   the fixed instrument.

Report counts per town, plus screenshots of HPDM's worst stretch from the street camera, then **STOP**.

## 5. The proposed design (a PROPOSAL; confirm or replace it with numbers, then Boz and Jacob rule)

**The order:** stamp the feature edges (the pour) → terrain → ribbons and paint WITH the terrain known → the ground
meshed from pieces that each carry their height law. Terrain still depends only on the coast and lidar, so this is a
reorder, not a loop (§4.1 confirms it).

**A height law per painted piece** (the partition built from ① through ②; ① itself stays width-free and height-free),
read off what already exists:
- **Road (carriageway):** follows the street's own grade along its centreline, level across (or the town's authored
  crown, if one exists in the norms; ⛔ never a constant).
- **Curb and sidewalk:** a plane per segment: the street's grade along, level or the town's cross-fall across, sitting
  h above the road's edge (h = the town's kerb height, 0 for a flat-kerb town).
- **The kerb face:** not cut. It is the shared edge between a road piece and a curb piece whose heights differ, so the
  mesher emits a vertical (or battered) face there. Ramps, flares and tapers are PIECES with their own planes (h → 0),
  so curb cuts come from the same construction.
- **Lawn, land use and lots:** drape the terrain, and ABSORB the difference between the planes the street makes and the
  ground behind, as a slope. Where the difference can't be absorbed within the town's tolerance, that is a counted
  failure (a retaining wall is the honest answer, and drawing one is out of scope here; count them).
- **The shore:** the waterline's SHAPE is one chain. Smooth the coast at the skeleton stage (where streets are already
  smoothed) and feed it to ① as the two-sided chain `H-4` rules. The lidar waterline then REFINES or VALIDATES that chain
  (with measured agreement), never as a second, unsmoothed outline painted beside it. Say which, with numbers. Its HEIGHT
  law: the water is a level plane at the town's water level (`terrain.json#water`); the beach / shore piece is a smooth
  surface that MEETS that plane along the smoothed waterline and meets the draped land behind it. Both are built before
  the flatten, not sampled per vertex at render. The bed below follows `BRIEF-the-shore-is-closed`'s treatment.
- **Medians and islands:** follow their own carriageway rule (no sidewalk or tree lawn in a median; `RIBBONS §3.5`).

**What it replaces (deleted in the same change):** the flat-paint-then-conform path for the street pieces, `cutAlong`
as the kerb's mechanism, and `kerbLift.mjs`'s cut-then-lift. Whether `conformAndRefine` survives for the draped pieces
is yours to measure. The mesher likely needs a CONSTRAINED triangulation that takes the pieces' shared edges as edges
(earcut takes none); name the library or algorithm and its cost before adopting it.

**Exaggeration:** a piece's own height law is in true metres in the mesh. The runtime multiplies terrain by `uExag`
on top (as `kerbLift.mjs` already rules for h: *"a 15 cm kerb that grew with the town's exaggeration would be a Class D
constant in disguise"*). Say how a level-across plane stays level under exaggeration. It should, if the plane's
across-height is constant, but prove it.

**Open questions you must answer with numbers before Boz and Jacob rule:**
1. Does the street's grade come from the terrain sampled along the centreline, or from the skeleton's own heights, if
   it has any? (One source.)
2. What is the tolerance a lawn may absorb, and whose value is it (an authored norm with a neutral default)?
3. Bake cost: HPDM's and Provincetown's ground steps are already the long poles (Provincetown's ground + ground-shore
   took ~160 min on 2026-10-07). Estimate the new mesher's cost.
4. The shelved perpendicular-landings rework (`BRIEF-corner-ramps-and-kerb §9`, the radial landings): does this design
   subsume it (landings as pieces with their own plane)? If so, say so, and that brief's open item retires into this one.

## 6. Checks (each must be seen to FAIL before it passes; mutation-test every one)

- **Level across:** every walk and curb band's cross-slope is within the town's tolerance, on every town, with the
  count of exceptions (each named by tile and arc). Mutation: today's drape → red on HPDM.
- **The kerb has a face:** wherever the town's kerb is drawn, the height step between road and curb pieces is a mesh
  face, with no T-junction (`claims-the-ground-has-no-cross-polygon-t-junctions` green on every town, LS included).
  Mutation: drop the face → red.
- **The shore meets:** the water plane and the shore piece share the smoothed waterline as an edge. The fixed gap walk
  finds zero views reaching the sky along every shore, from water and land, near and far. Mutation: today's unsmoothed
  marching-squares edge → red (jags), and a removed shore piece → red (holes).
- **Objects still sit on the drawn ground:** the existing anchor checks (trees, buildings, lamps) stay green.
- **Flat towns don't move:** on a town with flat terrain and a flat kerb, the new ground is byte-identical to today's,
  or every difference is explained.
- **One pour → its ground:** a ground bake reads the map, terrain and ribbons of ONE pour (`bake-reads.json`).
  2026-10-07 found LS's shipped ground baked from an uncommitted pour; make that impossible to ship unnoticed.

## 7. Bounds

- **Writes:** `cartograph/bake-ground.js`, `cartograph/groundConformity.js`, `cartograph/kerbLift.mjs` (to delete or
  replace), the pour or ribbon producer only if §4 shows the height law must be known there, `src/lib/tileGround.js`
  only through the shared painter (Survey and Section must still agree: ① is one producer), `checks/`.
- ⛔ **No bake without Boz's clear, one bake at a time on the machine, load-gated.** LS's pour is HELD by its own
  declaration: re-pouring it is Jacob's call. Never put an old version of a served file on disk.
- ⛔ No Publish or Promote.
- Commit through explicit pathspecs only, checking each commit's name-status.
- **Registers:** `ARCHITECTURE` "Ground conformance" and "Terrain doctrine", rewritten in place · `BAKE.md` (the step
  order) · `SECTION` / `RIBBONS` (the height law per piece) · `FEATURES` (sidewalks that stay level on hills; the kerb
  as built) · `OPERATIONS` (any new authored tolerance).
- **Superseded text goes to the Diary** (`cartograph/_archive/`, dated). `BRIEF-corner-ramps-and-kerb §9`'s kerb item
  is re-pointed here.

## 8. Done when

On Huron's and Provincetown's shores the land meets the water along a smooth line, with no jags or cracks, at Hero and at street level. On HPDM's hills, from the street camera, the sidewalks are level across and follow the street's grade along, with no
stretch, and the lawns take up the slope. LS bakes with its 0.15 m kerb, its curb cuts sloping to the road, and no
refusal. Huron and Provincetown are no worse (byte-identical where flat). Every check in §6 is green, each seen red
first. Jacob's eye on HPDM and LS at street level, with the scene and shot recorded.
