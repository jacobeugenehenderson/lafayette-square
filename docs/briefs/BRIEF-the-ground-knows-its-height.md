# BRIEF — each piece of the ground knows its own height: terrain before ribbons, the kerb and the shore built from the shape chain

<!-- BRIEF-STATE
status: OPEN
dispatched: Swale, 2026-10-11 (FRESH)
written: 2026-10-08
evict-when: RULING: Jacob passes, by eye at street level, (1) HPDM's sidewalks on its hills: level across, following the street's grade along, with no stretched or tilted walk, (2) LS baked WITH its raised kerb (0.15 m) and no ground refusal, and (3) Huron's and Provincetown's shorelines smooth where land meets water, with no jags and no cracks (the shore gap walk at zero after its instrument fix). Both towns re-baked from one pour each. node checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs is green on every town.
-->

## State (2026-10-12, Swale). Rewrite in place; never append a log

**Taking it fresh?** Name yourself (one word no live session or commit uses), report to Boz, confirm each claim here
against the code before building, and stop and flag where they disagree. ⛔ No bake without Boz's clear, one heavy job
at a time (load ≤ 8), scratch slabs only. No Publish or Promote. LS's pour stays HELD.

**Landed** (measured on scratch slabs; no town is served with the deformer yet):
- The height along ①: `lineHeight.mjs`, `h[]` on every shape run (f0082e6a). ① painted first (d504d7eb).
- The deformer: `groundDeformer.mjs`; `cutAlong` deleted; the runtime draws `aRaw × uExag + y` (5255b311). Ped bands
  refine to 7.8 mm (686dff56). The painted band decides, and an unowned walk vertex throws (6be9cbaf, 49665eec).
- Readers on the drawn ground (`src/lib/drawnGround.js`): d05e3cc1, c7c433e5, and b0e65999 (the revetment).
- The kerb: creases are partition lines (eb1d3876); the lift reads each polygon's carried side (de1c2f83).
- The shore: ruled (794b7911). A coast run's `h` is the line, `waterLevels(terrain.water).lineAt` (c227acaf, 73eee209).
- ⚠️ **UNBUILT, Jacob's to re-raise: the grain continuum** (boulder → rock → gravel → sand; the retired shore brief's
  rulings 3–5 and steps 3–4, in the Diary: `cartograph/_archive/BRIEF-the-shore-is-closed-2026-10-13.md`). Its input
  was the shore median's width, which is retired (Jacob, 2026-10-13: "drop it"); the gusset record is the candidate input.
- ③'s strikes on `offsetRingByRects`, Jacob's swap (db9c7d87). `gusset.mjs` reads `aRaw` (00c76119).

**Open gates** (re-run, never quote):
- **Gusset, Huron: open stations 123 → 0.** On a scratch slab with the coast at high water: 129 open; step p50
  0.19 → 0.02 m; land vs water-side ground p90 0.15 → 0.25 m (worse).
  ▶ `SLAB_DIR=<slab> GUSSET_OUT=<file> node scratch/ground-height/gusset.mjs huron` (never over `gusset-huron.json`).
  Residual cause not established. Unmeasured candidates: the 6,419 ② vertices that still take a neighbour's H; the
  water side's S-curve.
- **Huron seams (≤ 5 mm orphans) 3,001 → 3,498 across the swap**, measured on a vertex set meshed from the PRE-swap
  paint; cause not established. Re-measure on a post-swap mesh. ▶ `scratch/ground-height/orphans.mjs`.
- **Huron's bake refuses on HEAD** (2 T-junctions, `mat:shore` on `face:underived`), and conformity runs ~4,000 s:
  Cairn, who holds `groundConformity.js` (91c7fb7f, 3c6bf870). No Huron bake until it clears.
- **Level across:** HPDM street walks over 1:48, 3.28% offline (served 85.92%). ▶ `checks/claims-the-walk-is-level-across.mjs`.
- **LS bare kerb steps, 46 m:** BACKLOG ("LS's ground bake is REFUSED on bare kerb steps").
- Jacob's eye is owed on `scratch/ground-height/ribbons/thin-blocks.html` (the swap) and on (d) below.

**Next, in order** (each needs Boz's clear):
1. **The water-side half: the gusset is RECORDED, nothing lowered** (Boz 2026-10-13). `shoreGusset.mjs` → `shape.json#gusset`
   ▶ `checks/claims-the-gusset-is-recorded.mjs`. The S-curve waits for the drawn step. The old plan, in the Diary:
   `cartograph/_archive/BRIEF-the-ground-knows-its-height-water-side-2026-10-13.md`.
2. **(a) The coast from lidar**, Jacob's go ("OK", 2026-10-12), and with it the shore (the water-side half above and
   (d) below): **moved to `BRIEF-the-coast-from-the-lidar.md`** for a fresh agent (Boz, 2026-10-13).
3. **(d)'s render:** a browser eye-check of `ShoreMedian` and `SlabRevetment` on the drawn ground (b0e65999).

**Known, not yet in canon:** below 1 cm `gusset.mjs` reads ①'s ε band, not the gusset, and at 0.3 m with B = 5 m it
reads a slope by construction. Two lines are boarded: `band(a, [])` makes the capacity guard load-bearing, and
`withSide` is A15's last recovery (BACKLOG). The registers (`ARCHITECTURE` "Ground conformance" / "Terrain doctrine",
`SECTION`/`RIBBONS`, `FEATURES`, `BAKE.md`) are rewritten when level-across is green and a town ships.
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
to hunt more holes. (Argon's 2026-10-07/08 measurements are in the Diary; the live ones are §4 and §5 "The shore".)

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
  and `RIBBONS §1` (how a coast arrives).
  "Smoothing is skeleton, rounding is Survey" (`RIBBONS`, on ①): a waterline's smoothing belongs at the chain, before ①.
- Memory: `project_terrain_doctrine_2026_05_14` (uExag is the single dial; the mesh carries terrain × uExag at runtime).

## 3. Code sites (confirm each; line numbers drift, so cite symbols)

| what | where |
|---|---|
| the pour: skeleton, stamps, feature edges, ribbons | `cartograph/pipeline.js`, `cartograph/derive.js` → `clean/map.json` |
| the terrain | `cartograph/bake-terrain.js` → `terrain.json` + `terrain.bin` |
| the painter: the partition, the bands | `src/lib/tileGround.js` (`buildTileGround`, `sectionPassProtoTile`, `PAINT_ORDER`) |
| flat paint → deformer → mesh → conformed | `cartograph/bake-ground.js` (`planGroup`, the line-height stamp) · `cartograph/lineHeight.mjs` · `cartograph/groundDeformer.mjs` (`buildDeformer`) · `cartograph/groundConformity.js` (`conformAndRefine`, `closeBoundaryTJunctions`, `findTJunctions`) |
| the raised kerb: creases as partition lines, lift by carried side | `cartograph/kerbLift.mjs` (`kerbPlan`, `kerbCells`, `splitAtCreases`, `withSide`, `liftBuffer`, `riserFromEdges`) |
| the runtime drape | `src/utils/terrainShader.js` (`patchTerrain`, perVertex) · `src/lib/terrainCommon.js` (`makeElevationSampler`, `DEFAULT_V_EXAG`) |
| objects that sit on the drawn ground | `cartograph/bake-tree-anchors.js`, `bake-buildings.js` (centroid y), `bake-lamps.js` |
| the coast chain and its water side | `cartograph/coastline.mjs` (`weldCoastlines`), the pour's coast stroke (`RIBBONS §1`) |
| the water level and the bed | `bake-terrain.js` (`terrain.json#water`, `#bed`), the 5 m raster |
| the shore gap instrument | `checks/claims-no-view-reaches-the-sky-at-the-shore.mjs`, gaps.html (`at=` / `keep=` / hole-ray params, Argon 2026-10-08) |
| the shelved corner rework (the same seam) | `scratch/perp-corner/radial-landings-SHELVED-2026-10-07.diff` |

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
4. **The kerb.** The 265 T-junctions were `cutAlong`'s, which is deleted (5255b311). The creases are now partition
   lines (eb1d3876) and the lift reads each polygon's carried side (de1c2f83). Open: the State block above.
5. **Who reads a ground height.** The drawn mesh (`src/lib/drawnGround.js`): lamps, tree anchors, buildings, Movers,
   UserDot, the street eye, PilgrimMonument, LafayetteParkBody's ponds, stairs and title, and the revetment
   (drape and stones). The field: LafayetteParkBody's fence posts only (lifted in the shader by `patchTerrain`, which has
   only the field on the GPU). Labels: none.
6. **The shore: two shape sources, and the gusset.** Re-measured 2026-10-12; the table and the commands are in §5, "The
   shore". The crack's mechanism: §4 item 9. Gap walk: still VOID (its 2026-10-10 Huron baseline: the mutation found the
   same 7,018 sky views as the town); a one-station look comes before any re-run.
7. **Mounds behind the walk (HPDM, 1 m lidar range-read).** Rise within 20 m of the walk's back edge ≥ 1 m at 25% of
   stations; for those, run (10→90%) p50 12 m, p10 5.5 m, offset behind the walk p50 2 m. The steepest are 4–7 m over
   1.5–2.5 m; the 5 m field carries them at ~1.3 m over 6.5–17 m. The rise CAN be located at the lidar's resolution.
   ▶ `mounds.mjs hipointedemun <the town's lidar URLs>`
8. **Terrain source.** HPDM's terrain was LS's 1/3″ tile (USGS n39w091, 38–39°N 90–91°W: a shared regional tile
   reached by a symlink into LS's folder; the data covered HPDM, the input was LS's). Both towns now carry their own 1 m
   list. `fetch-dem` had chosen surveys by tile box: for LS that picked a survey with 0% data over the town, and
   `bake-terrain` would have baked it flat. Both now refuse. ▶ `checks/claims-a-dem-is-chosen-by-its-data.mjs` ·
   `checks/claims-a-town-owns-its-raw-inputs.mjs`
9. **⛔ KNOWN RED: the ground does not tile.** Partition edges used once inside the disc: Huron 24,610 (296 km), HPDM
   17,183 (133 km). ~55% of sampled seams have nothing 1 mm to one side. Mostly ~10 mm strips down the street
   centrelines: ①'s two back-to-back offsets at ε = `PROTO_HW` (0.005 m, `tileGround.js`), with nothing painted
   between them. On the lattice; a topology gap, not drift. Whether it shows at street level is NOT measured.
   ① is painted first (d504d7eb): true gaps on Huron 239/406 → 15/410 sampled seams, offline. The tiles check stays RED
   on the covered-both-sides class (~9.5k edges), not ①.
   ▶ `checks/claims-the-ground-tiles-without-a-gap.mjs` · `slit-producer.mjs <town>`
   ✅ The 1 mm lattice has one home, `src/lib/lattice.js` ▶ `checks/claims-the-lattice-has-one-home.mjs`. ⏳ Still:
   other grids keep their own values (lattice.js).

## 5. The design: heights along ①, then ONE deformer that acts like curb geometry (Jacob, 2026-10-08)

*Jacob: "Why not calculate the correct terrain heights for the protopolygon … maybe what we're wanting is a deformer,
that acts like curb geometry."* Confirm the premises with numbers, then Boz and Jacob rule on the details below.

**① stays clean.** ① is two back-to-back offsets of each chain, width-free and sharp. The heights are DERIVED along it,
the same way Section's bands are derived from it. They are not part of ①.

**① is painted FIRST** (Jacob, 2026-10-11, ruling the slit in §4.9: *"we should paint it in the first step, not
last"*). `mintProtopolygon` unions the ε strokes into one filled shape, so ① already HAS area: a 2ε band over every
chain, every edge owned. Today nothing paints that area, because every band offsets outward from ①'s edge (the road
band at `hw − PROTO_HW`), and ① shows through as the slit. ⇒ ① becomes the ground's first piece:
- **A street's ①** takes that street's road surface. The bands then paint from ①'s edge out exactly as today; the two
  halves close against ①, not against each other. Crossings are already one shape (the union).
- **The coast's ①** takes the LAND's shore surface (Jacob: option (a), not a split down the middle). The water starts
  at its water-side edge. This is where the S-curve and the gusset's record start.
- **Where strokes join** (a slipway T-ing into the coast), the joined shape is split by its edges' owners, which ①
  carries. ⛔ Never by proximity.
- `PROTO_HW` is unchanged, and ① stays width-free: painting it adds a piece, not a width.

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
- **The shore: RULED 2026-10-11 (Jacob; landed 2026-10-12).** *"I think it meets high-tide and from high tide to low
  tide is the gusset shape? Opine?"* · *"Can we compute the whole sheet for the lidar and find the actual moment of
  intersection with the shoreline/low-tide line and then discard the sheet?"* · *"The lake town still has a gusset."*
  ⇒ **The coast line is where the lidar surface meets the HIGH-WATER level** — the town's datum where tidal (MHW by
  default, `BRIEF-bathymetry`), the authored lake level on a lake — and its height IS that level. **The gusset is the bank
  from there down to the LOW-WATER plane** (on a lake, high = low, so it is the bank's own step), and its record decides
  the fill grain (below). The sheet that finds the intersection is discarded once it has: one outline, from the lidar.
  ⚠️ **Today's coast is not that line** (the ① coast chain is OSM's; measured 2026-10-12 on the served slabs, read-only):

  | | Huron (lake, mean −0.09) | Provincetown (tidal) |
  |---|---|---|
  | lidar waterline off the ① coast chain | p50 4.2 · p90 42 m | p50 23 · p90 70 m |
  | drawn land BELOW the water at the drawn coast | 8.5% | **66.7% under MHW** · 1.2% under MLLW |
  | the step land → water at the line | p50 0.19 · p90 0.48 m | at LOW p50 0.69 · p90 1.58 m |
  | stations where the step opens to the sky (no ground on the water side) | 123 | 768 at LOW |

  ▶ `scratch/ground-height/shore-sources.mjs` · `shore-jag.mjs` · `gusset.mjs <scene>`. Moving the coast chain onto the
  intersection is a skeleton source change and a re-pour of both towns: Jacob's go given ("OK", 2026-10-12); State, (a).
  *(The superseded wording — "the lidar trace refines or validates it … never as a second outline" — is in the Diary:
  `cartograph/_archive/BRIEF-the-ground-knows-its-height-shore-source-2026-10-12.md`.)*
- **Medians:** the carriageway profile on both sides (no sidewalk or tree lawn in a median; `RIBBONS §3.5`).

**Step 3: the ground mesh is deformed by that field near ①, and by the plain terrain elsewhere.** The step lines are
lines of the partition, split before triangulation (the kerb's creases, the ease's end), so nothing is cut afterwards.

**Exaggeration: two parts, applied separately.** The terrain part of the deformer (the line's height, the ease into the
land) scales with the town's exaggeration like all terrain. The kerb step h does NOT: a 15 cm kerb stays 15 cm at any
exaggeration (`kerbLift.mjs`'s own rule: *"a 15 cm kerb that grew with the town's exaggeration would be a Class D
constant in disguise"*). The runtime draws `aRaw × uExag + y` (5255b311), and the
level-across check judges at the town's exaggeration ceiling.

**Blend distance:** how far the lawn takes to ease back into the terrain. ⏳ **Deferred by Jacob** ("will have to wait
to determine"). Build it as the town's value with a neutral default; measure what each candidate does on HPDM, but
don't settle it.

**What it replaces:** the drape near ① and `cutAlong` are deleted (5255b311).  **The open questions are answered in the code:** the window is σ,
`groundLineSigmaM` (`lineHeight.mjs`); the record is each run's `h[]` plus the slab's terrain-part section; the cost on
HPDM was 119 → 387 s, with Huron's open (State); a cut is the profile's h → 0, and whether `BRIEF-corner-ramps-and-kerb
§9`'s item retires is Boz's call.

## 6. Checks (each seen RED first; mutation-tested)

`claims-the-walk-is-level-across` (RED) · `claims-the-kerb-stands-and-drops-at-each-cut` ·
`claims-every-group-meshes-its-own-area` · `claims-the-ground-has-no-cross-polygon-t-junctions` (every town, LS
included) · `claims-the-ground-tiles-without-a-gap` (RED) · `claims-no-view-reaches-the-sky-at-the-shore` (VOID until its
one-station look) · the anchor checks. Still owed as checks: flat towns byte-identical, or every difference explained;
and one pour → its ground (`bake-reads.json`: LS's shipped ground came from an uncommitted pour, 2026-10-07).

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
