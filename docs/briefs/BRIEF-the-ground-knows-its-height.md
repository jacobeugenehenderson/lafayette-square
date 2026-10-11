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
chains. ⚠️ He did NOT rule out measuring: he questioned one step, more hole-hunting, when he had a clearer idea of the
underlying thesis. So measure to TEST THE THESIS (one shape source or two, heights before or after the flatten), not
to hunt more holes. Argon's measurements so far (2026-10-07/08, facts only):
- The shore-median sand edge is the lidar waterline traced by marching squares at 1 m, UNSMOOTHED
  (`bake-shore-median.mjs` → `bake-ground`'s `shore` group). It zigzags p50 0.16 · p90 0.73 · p99 2.24 m off its own
  ±3 m chord. Meanwhile the coast is ALSO a chain in ① (`ROADMAP H-4`: "stroke the coast as a two-sided chain"). So the
  waterline has two shape sources at two resolutions.
- The drape (per vertex, last) and the cracks: measured in §4.3 and §4.6. The 9,212 px "hole" at (−2386, −2008) was the
  gap walk's 20 m camera under a ~12 m channel's far bank; the standoff is now derived.

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
"put the wrong construction in `src/`". So the fix is not "① carries heights". It is: **heights computed ALONG ① (derived, like the bands), then one
deformer swept across it like curb geometry (§5), and the ground is shaped by it.** The
kerb isn't cut into a mesh afterwards. Its face is the edge where a road piece meets a curb piece (② gives that edge),
and its ramps, flares and tapers are the same profile easing h → 0, not cuts.

## 1. The rule this must keep (`CLAUDE.md` Layer 0)

- **A kit, not HPDM.** The method must hold on a town nobody has looked at: flat (Huron), hilly (HPDM), coastal
  (Provincetown), heavily authored (LS). No per-town or per-street exception, and no constant tuned to HPDM's slopes.
  Every tolerance is the town's authored value with a neutral default, or derived from the scene.
- **Fails loudly.** A place where the deformer can't be satisfied (a walk that can't stay level within its tolerance, a
  kerb step with no face) is a COUNTED, NAMED failure, never a silent drape.
- **The override is the product.** Authored widths, corners and the kerb height (`norms.json#kerb`) are inputs. Measure
  with each town's `blockCustoms` and `design.json` loaded.
- **Never add a source of truth** (`feedback_never_add_a_source_of_truth`). The terrain (`terrain.bin`), the partition
  (① and ② and the painted partition, `shape.json`) and the kerb norm already exist. The deformer's heights are read off them, never a parallel
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

## 4. Measured (Talus, 2026-10-10). Each line names its probe; ⛔ re-run it, never quote it

*The dispatched step list is in the Diary: `cartograph/_archive/BRIEF-the-ground-knows-its-height-section4-steps-2026-10-10.md`.
Probes: `scratch/ground-height/`. Measured on the shipped slabs (baked with each town's design.json), at exag 1.*

1. **Order: confirmed.** pipeline → promote-ribbons → terrain → ground (`serve.js` `runIfDirty`, `bake-reads.json`). Terrain
   reads the raw elevation, bathymetry, water datums, boundary, geography and `osm.json` (the coast), and nothing the
   ribbons make; the paint (`buildTileGround`) reads no terrain. LS's pour reads `raw/elevation.json` only for contour
   lines and building elevations.
2. **The walk tilts, and most of the tilt is the mesh.** Sidewalk, area-weighted, rendered vs the field's own
   cross-slope: HPDM p90 45% vs 11% · LS 31% vs 9% · Huron 82% vs 8% · Provincetown 89% vs 19%. Even the field alone
   exceeds the ruled 1:48 on 59–71% of the walk. ▶ `walk-slope.mjs <scene>` (worst stretches by tile.runs arc)
3. **Cause measured: the bands were never refined.** `bake-ground`'s tiering gave asphalt, curb, treelawn and sidewalk
   no refine policy, on the WRONG BELIEF that "their authored density already matches" (ARCHITECTURE; excised to the
   Diary). HPDM sidewalk: longest-edge p50 59 m, max 557 m. At tile 116 (fauquier-drive · right · 2) the walk's lawn
   edge, the chord of a 360 m triangle, sat 4–6 m under the terrain while its back edge followed it.
   ▶ `trace-stretch.mjs hipointedemun 116 fauquier-drive right 2 40 7` · shots `hpdm-t116-*.png`, `hpdm-t152-*.png`
4. **The kerb.** 265 T-junctions after `cutAlong`, 0 before; 258 on a crease. Mechanism not established
   (`BRIEF-corner-ramps-and-kerb §9`, corrected). The ramp, flare and taper outlines are `kerbLift.mjs`'s own geometry
   (`kerbRegions`, `taperRegions`), NOT partition pieces; the painter gives only the warning strips (`mat:curbCut`)
   and each cut's `{face, inward}`. Slicing the paint with them was tried and failed (§9). ▶ `kerb-tj-where.mjs`
5. **Who reads a ground height.** The drawn mesh: lamps, tree anchors. The field: buildings (plus only the mesh's
   kerb y), ShoreMedian, the revetment drape, Movers, UserDot, PilgrimMonument, LafayetteParkBody. Labels: none.
6. **The shore has two shape sources.** The lidar waterline lies p50 4.2 m (Huron) / 23 m (Provincetown) off the ①
   coast stroke, with a median beside 42% / 80% of the line. At the 1 m trace's y = 0 the 5 m field reads p50 0.28 /
   0.82 m. At the line the mesh's chord error is small (p50 2–5 cm), and the drawn land crosses the level FEWER times
   per km than the field. ▶ `shore-sources.mjs`, `shore-jag.mjs`
   **The gusset** (land above the water at the line): Huron p50 0.19 / p90 0.48 m on 74% of the line; Provincetown at
   LOW p50 0.69 / p90 1.58 m on 94%, at HIGH on 3%. Where both sides carry ground, the drawn ground is continuous across
   the line (p50 5–7 cm over 0.6 m). Its shape is recorded per segment for a treatment to read.
   ▶ `gusset.mjs <scene>` → `gusset-<scene>.json`
   The median's two lines are the S-curve's two ends in plan: the ① stroke, where the flat sheet meets the ground,
   and the lidar waterline, where the real ground reaches the level.
   Huron's shore carries near-coincident vertices 4.5 mm apart (shore vs residential at (2694.87, 586.40)), under the
   5 mm on-edge tolerance: a lead for Argon's thin lines, not established.
   Gap walk: standoff now derived (`gaps.jsx`). Its Huron baseline (2026-10-10) came back BLIND: 7,018 of
   7,086 views reached the sky, the unchanged `far` view included, and the mutation found the same, so the check
   voided itself. Cause not established; a one-station look comes before any re-run.
7. **Mounds behind the walk (HPDM, 1 m lidar range-read).** Rise within 20 m of the walk's back edge ≥ 1 m at 25% of
   stations; for those, run (10→90%) p50 12 m, p10 5.5 m, offset behind the walk p50 2 m. The steepest are 4–7 m over
   1.5–2.5 m; the 5 m field carries them at ~1.3 m over 6.5–17 m. The rise CAN be located at the lidar's resolution.
   ▶ `mounds.mjs hipointedemun <the town's lidar URLs>`
8. **Terrain source.** HPDM's terrain was LS's 1/3″ tile (USGS n39w091, 38–39°N 90–91°W: a shared regional tile
   reached by a symlink into LS's folder; the data covered HPDM, the input was LS's). Both towns now carry their own 1 m
   list. `fetch-dem` had chosen surveys by tile box: for LS that picked a survey with 0% data over the town, and
   `bake-terrain` would have baked it flat. Both now refuse. ▶ `checks/claims-a-dem-is-chosen-by-its-data.mjs` ·
   `checks/claims-a-town-owns-its-raw-inputs.mjs`

## 5. The design: heights along ①, then ONE deformer that acts like curb geometry (Jacob, 2026-10-08)

*Jacob: "Why not calculate the correct terrain heights for the protopolygon … maybe what we're wanting is a deformer,
that acts like curb geometry."* This REPLACES an earlier draft of this section (one height law per painted piece). That
draft multiplied the sources (one rule per piece type) and is retired. Confirm the premises with numbers, then Boz and
Jacob rule on the details below.

**① stays clean.** ① is two back-to-back offsets of each chain, width-free and sharp. The heights are DERIVED along it,
the same way Section's bands are derived from it. They are not part of ①.

**Step 1: the correct height along ①, once.** For every edge of ①, compute its height: the terrain sampled along the
line and SMOOTHED along it ("smoothing is skeleton": the smoothing happens at the line, before anything is built from
it). A street's edge gets its grade; a coast's edge gets the water level (`terrain.json#water`). One computation, one
record, read by everything after it. This replaces the raw 5 m sampling at the edges, which is the resolution mismatch
behind the jagged shore and the warped walks.

**Step 2: one deformer, swept across ① like curb geometry.** A height PROFILE, keyed to the distance from ① and the
side, swept along every edge, the way Section already sweeps the width profile (① → ② → the bands):
- **Road side:** the line's height across the carriageway (flat, or the town's authored crown if the norms carry one;
  ⛔ never a constant).
- **At ② (the curb line):** the kerb step, h = the town's kerb height (0 for a flat-kerb town).
- **Curb and walk:** the line's height + h, level across (or the town's authored cross-fall).
- **Curb cuts:** the same profile with h → 0 over the ramp, flare and taper, so the cuts come from the deformer, not from
  cutting a mesh.
- **Lawn and land behind:** ease from the walk's height back into the raw terrain over a blend distance.
- **The shore:** the line's height IS the water level; the land eases down to meet it along the smoothed waterline. The
  waterline's SHAPE is the one smoothed coast chain in ① (`ROADMAP H-4`). The lidar trace refines or validates it, with
  measured agreement, never as a second outline beside it.
- **Medians:** the carriageway profile on both sides (no sidewalk or tree lawn in a median; `RIBBONS §3.5`).

**Step 3: the ground mesh is deformed by that field near ①, and by the plain terrain elsewhere.** The kerb face is
where the profile steps, so the mesher keeps that line as an edge; nothing is cut afterwards. Name the mechanism (a
constrained triangulation that takes the profile's step lines as edges, or vertices placed along them) and its cost
before adopting it.

**Exaggeration: two parts, applied separately.** The terrain part of the deformer (the line's height, the ease into the
land) scales with the town's exaggeration like all terrain. The kerb step h does NOT: a 15 cm kerb stays 15 cm at any
exaggeration (`kerbLift.mjs`'s own rule: *"a 15 cm kerb that grew with the town's exaggeration would be a Class D
constant in disguise"*). Show how the runtime applies the two parts separately, and prove that a walk stays level across
at ANY exaggeration (Browse may regain depth).

**Where two lines come close (overlap), in plain words:** a spot can be near two DIFFERENT lines at once, e.g. a thin
strip of land between two parallel streets, or a median between two carriageways. (One street never overlaps itself:
its two sides are back to back.) Both profiles then reach that spot. Default: **the nearer line decides**. It may rarely
matter if the lawn eases back into the terrain quickly. ⏳ Confirm the rule once the blend distance is known.

**THE CASE THAT STARTED THIS, a block on a mound** (Jacob, 2026-10-10; common, and frequent in HPDM): *"a lot is never
a smooth inflated bubble meeting at an apex; in HPDM there's lots of ~1.5 m rises over .75 m so the sidewalk is very
distorted there."* Today the 5 m terrain grid can't represent that rise, so it is smeared across the walk and the block
drapes as a bubble. In the real street the walk follows the street, and the rise happens right BEHIND it, steeply (a
berm or low wall), with the lot a terrace on top. In this design that is the lawn-and-land step: the walk stays on the
line's height and the rise lives behind it. So the blend is often SHORT and STEEP (~0.75 m on HPDM), and ideally comes
from where the real rise is in the lidar, finer than the 5 m grid. ⚠️ `BRIEF-terrain-resolution.md` ("the good elevation
exists and the pipeline cannot read it") is directly relevant: read it, and say whether the rise can be located at the
lidar's own resolution. Measure HPDM's mounds: the rise height, its run, and how far it sits behind the walk.

**THE SHORE'S GUSSET** (Jacob, 2026-10-10, the shore's mechanism in his words): *"The protopolygon has two sides; the
shore side and the water side. In plan view, they look like the same line, they are the same shape. However, when looked
at from the side the elevation splits the ground and you can see thru to the sky layer behind. This also makes a
'gusset' shaped opening: a flat bottom (water) and the contoured lip at shoreside. It is both contoured on the ground
plane *and* the terrain elevation plane. I think what has to happen is an averaging step where we look at the elevation
and average the gusset-plugged and turn it from a block shape to an s-curve."* So the shore profile is: the land side
at the line's terrain height, the water side at the water level, and the deformer's averaging step fills the gap
between them, turning the step into an S-curve that rolls the land down to the water. Measure the gusset (the height
gap across the shore edge, per town, and where it opens to the sky), and say how the shore median's two lines (Jacob's
2026-10-04 ruling, `bake-shore-median.mjs`) relate to the S-curve. ⛔ Don't retire that ruling without asking him. ⭐ **The gusset's SHAPE is data, not just a hole to fill** (Jacob, 2026-10-10: *"The gusset shape itself is
important because it would determine particulate/fill size."*): its height gap and run at each point decide the grain of
what fills it (boulder → rock → gravel → sand; `BRIEF-the-shore-is-closed`'s treatment rules). So the averaging step must
RECORD the gusset's dimensions along the shore (one record, read by the treatment), not only smooth them away.

**Cross-slope limit: RULED** (Jacob, 2026-10-10): ADA's 1:48, as a town norm beside `kerb` in `norms.json`.

**Blend distance:** how far the lawn takes to ease back into the terrain. ⏳ **Deferred by Jacob** ("will have to wait
to determine"). Build it as the town's value with a neutral default; measure what each candidate does on HPDM, but
don't settle it.

**What it replaces (deleted in the same change):** the flat-paint-then-drape path near ①, `cutAlong` as the kerb's
mechanism, `kerbLift.mjs`'s cut-then-lift, and the shore median's unsmoothed marching-squares outline as a shape
source. Whether `conformAndRefine` survives away from ① is yours to measure.

**Open questions to answer with numbers before Boz and Jacob rule:**
1. The line's height: terrain sampled along ① and smoothed. What window, and what does each candidate do to HPDM's grades
   and Huron's shore? (A town value with a neutral default, never a constant.)
2. Where the deformer's height is stored, so it stays one record that every consumer reads (the ground, trees,
   buildings, lamps, the shore band). Prefer riding an existing artifact (`shape.json` carries ①'s runs) over a new file.
3. Bake cost against today's long poles (Provincetown's ground + ground-shore took ~160 min on 2026-10-07).
4. The shelved perpendicular landings (`BRIEF-corner-ramps-and-kerb §9`): do they become simply the profile's h → 0 at a
   cut? If so, that brief's open item retires into this one.

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
  replace), the pour or ribbon producer only if §4 shows the heights along ① must be known there, `src/lib/tileGround.js`
  only through the shared painter (Survey and Section must still agree: ① is one producer), `checks/`.
- ⛔ **No bake without Boz's clear, one bake at a time on the machine, load-gated.** LS's pour is HELD by its own
  declaration: re-pouring it is Jacob's call. Never put an old version of a served file on disk.
- ⛔ No Publish or Promote.
- Commit through explicit pathspecs only, checking each commit's name-status.
- **Registers:** `ARCHITECTURE` "Ground conformance" and "Terrain doctrine", rewritten in place · `BAKE.md` (the step
  order) · `SECTION` / `RIBBONS` (the heights along ① and the deformer's profile) · `FEATURES` (sidewalks that stay level on hills; the kerb
  as built) · `OPERATIONS` (any new authored tolerance).
- **Superseded text goes to the Diary** (`cartograph/_archive/`, dated). `BRIEF-corner-ramps-and-kerb §9`'s kerb item
  is re-pointed here.

## 8. Done when

On Huron's and Provincetown's shores the land meets the water along a smooth line, with no jags or cracks, at Hero and at street level. On HPDM's hills, from the street camera, the sidewalks are level across and follow the street's grade along, with no
stretch, and the lawns take up the slope. LS bakes with its 0.15 m kerb, its curb cuts sloping to the road, and no
refusal. Huron and Provincetown are no worse (byte-identical where flat). Every check in §6 is green, each seen red
first. Jacob's eye on HPDM and LS at street level, with the scene and shot recorded.
