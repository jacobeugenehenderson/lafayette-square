# How a neighborhood is poured — end to end

**One read for everyone: Jacob, Boz, Zob, a new developer.** Compact on purpose. Every settled item gets one
paragraph here and one home in the code; the depth lives at that home and in its check, never in a second
account. If this and the code disagree, one of them is wrong: find out which (`CLAUDE.md`, the smell detector).
Marks: ⟦unbuilt⟧ = ruled but not yet the code · ⛔ = a gap.

## 1. What we are building

A **kit that pours neighborhoods**. Real city data goes in; a **slab** comes out: a flat, fast, trusted map that the
public app, **The Ward**, plays without recomputing anything. Lafayette Square was the first town off the line, so
most names in the repo are its names; the subject is always the kit. LS is the mould the kit was cast around
(`EXTENT-DESIGN §2.1`); every town runs the same pipeline, never a private one.

Three questions come before any change (`CLAUDE.md` Layer 0):
1. **What does this do for town #2?** A fix that needs someone to have seen this street is not a fix.
2. **What happens when it's wrong on a town nobody inspected?** It must fail loudly. No fallbacks.
3. **Am I calling the operator's authoring a defect?** The machine pours a strong first draft and the operator may
   override any of it. The override is the product. Never measure without the town's authoring loaded.

## 2. The picture

*"Imagine a big square map (the bb) rolled out on a desk. We have a spotlight (the radius) which shows which part
of the map is 'displayed'. The map exists first, then we shine a light on part of it and it's that part that we
elevate"* — and the light also decides *"what makes it thru to the slab."* (Jacob)

So: **everything is drawn to the bb first** (streets, blocks, land use, water, sand). **The disc is applied once,
to the finished shape.** What's lit is what's raised and what ships. The rim is an edge of the drawing, never an
absence; the soft fade is a look, applied after.

## 3. The lineage, and the three tools on it

The data has one lineage. Each step is a **freeze**: it hands the next something simpler, and the next trusts it
completely. A freeze is a performance move as much as a correctness one: authoring must be fluid, so nothing may
retrace the whole map every frame. The operator works on it with three tools, each at its own place:

```
         EXTENT                       SURVEY                         SECTION (opened as Measure)
           ↓                            ↓                                 ↓
intake → skeleton → ① protopolygon → the fe walk/stamp → ② the curb → ⟦THE WALL⟧ → the ribbons → the bake → slab → The Ward
                                       + land use stamped → the disc cuts the shape
```

| Tool | The operator authors… | It writes | It sits… |
|---|---|---|---|
| **Extent** | what the neighborhood *is*: an inclusion polygon of real streets, exclusions, per-building toggles; the radius and hood centre | `neighborhood_boundary.json`, `geography.json`, `neighborhood.json`, `building-overrides.json` (via `commit-extent`) | before the pour: it decides the data and freezes the frame |
| **Survey** | the SHAPE: each street's width, caps, corner radii, block by block | `overlay.json`, centerlines, measurements, `blockCustoms…pavementHW` | on ① and the stamp, built live; **its exit IS the Wall** (it posts `shape.json`) |
| **Section** | the FILL: treelawn and sidewalk depths, materials, terminals; corner overrides | `design.json` `blockCustoms` (its own fields) | after the Wall, inside the frozen curb |

Survey and Section write one record, `blockCustoms`, different fields: the one place two tools meet.

**Extent.** You size an envelope, fetch, and say what the neighborhood is. Commit freezes the **frame origin**, which
may grow or shrink but never moves: every coordinate and building id is keyed to it. The **bb** is the fetch's
envelope, frozen (`cartograph/fetch.js` `BBOX` → the raw `bbox`), never derived from the disc. Two centrepoints: the
fetch centre (the frame) and the hood centre (where the disc is drawn). Home: `src/cartograph/ExtentApp.jsx`; the disc
record `neighborhood_boundary.json` (`center`, `radius`, `boundary`). The gazetteer's ring is a hint: drawn inert, it
reaches membership only when the operator adopts it, so picking streets must work from zero (`EXTENT-DESIGN §1`).
One compass frame, true GPS positions, no rotation constants (`cartograph/ARCHITECTURE.md`, "Coordinate systems").

**Intake.** OSM, parcels, measured widths, footprints, aerials, lidar, labelled by source in one pass. What we take
in we keep, or a named rule says why not (`claims-intake-is-lossless`). A census is the union of its wells: lamps
and trees union every source and dedupe, never the first source found (`cartograph/FOUNDRY.md §4.5`).

**Skeleton.** The traced lines become a clean, named, simplified frame: a block should have about four corners, not
thirty wiggles. It is the single source of truth downstream, built to spec; reality comes from Survey.

**① The protopolygon.** Every chain expanded at ε across the whole bb: the ink of the frame. A **block is a hole of
①**. ① is width-free and has **no nodes**: a chain cut is not a corner. Coasts are ink too (they close the land and
make the water); the sand line will be ⟦unbuilt⟧. Home: `src/lib/tileGround.js#mintProtopolygon`.

**The fe walk and stamp.** Every edge of every block knows which street and which side made it, and its place along
the street: `skelId · side · segOrd`, the **frontage edge (fe)**. Authoring is keyed to it (`design.json`
`blockCustoms[skelId][side][segOrd]`), so a re-pour keeps the operator's work on the same frontage. Land use is
stamped the same way: evidence (OSM, then parcels; the class order decides contested ground) is built as **one
partition** (`cartograph/derive.js#layerLandEvidence`), where two classes meet in one line, and stamped per tile
(`tileGround.js#stampTile`). Where no evidence reaches, the ground is `underived` (ruled 2026-10-05, 9cf113be).

**② The curb (Survey).** One producer: the block's ① outline stepped out by each edge's own half-width
(`tileGround.js#offsetRingByRects`). A block may change width several times along its span; that is what Survey is
for. Fix the line and the curb follows.

**The disc.** The radius cuts the finished shape once (`buildTileGround`'s disc stamp); geometry never reads the
fade. ⛔ Two producers still apply it early, in the pour (the land-use face walk; water dropped past `discR × 1.25`):
`BRIEF-the-disc-is-one-source` ⟦unbuilt⟧.

**⟦The Wall⟧.** Chains die here. After it there is no "this chain link", only "this edge of this surface". Nothing
downstream reaches back across it. Authoring is not a chain: a lookup by street key that returns the operator's
numbers is legitimate; every polygon comes from the frozen `shape.json`.

**The ribbons (Section).** The fill is painted *inward* from the frozen curb (`tileGround.js#sectionOpen`): curb,
treelawn, sidewalk, ramps; the treelawn takes its block's land use (`treelawn:<class>`). **Every band boundary is one
offset line of the curb, shared by both neighbours** — so a doubled edge means the code left the ribbon. ⛔ Today
the four depths are four separate offset runs (`checks/codemap.mjs` row `one-line-per-depth`). **Mono width**: one
total pedestrian depth per block, curb to property line; the strips inside may vary, the total may not.
**Corners**: the band bends around the corner arc, never glued onto two legs' ends; the one licensed hard seam is
ADA → treelawn | land use.

**Rounding, three kinds.** (1) **Smoothing**: the street lines are simplified once, in the skeleton
(`cartograph/skeleton.js#rdpKeep`, junction-protected, then `#curveFitSegments`). ⛔ It is not yet one home: other
knobs smooth too (`smoothCenterline.js#STREET_SMOOTH`, dormant at 0; paths; derive's own simplify; the seed
centerlines), their metre constants are unchecked. Ruled 2026-10-21: smoothing is one thing, the skeleton's
fit, and the other knobs retire ⟦unbuilt⟧. (2) **The corner radius**: authored in Survey, the curb's fillet.
(3) **The lattice**: every cut rounds to one 1 mm grid (`src/lib/lattice.js#CLIP_SCALE`), once, where the line is
born; near-coincident vertices join only within the rounding's own bound, √2/2 of a step
(`src/lib/latticeNode.js#NODE_BOUND`). A line cut twice and rounded twice is the recurring defect of this repo;
the cure is always to cut it once, never a tolerance.

**The bake.** The painted layers flatten into one plane of non-overlapping pieces, noded to each other
(`cartograph/bake-ground.js#flattenPaintStack`, `#nodeThePlane`). The overlays (paths, parks, scrub, the water bed,
lane lines, the stripe) are flat and stamped with everything else; the water sheet stays a tint over its bed;
bridges stay out (`BRIEF-the-rim-is-cut-once §5` ⟦unbuilt⟧). Height is **one field**: drawn = field × exaggeration +
kerb lift (`src/utils/terrainShader.js`, read on the CPU by `src/lib/drawnGround.js`); relative height matters,
literal height doesn't. Only what's lit is raised. Everything that stands on the ground (trees, lamps, paths) sits
on the one drawn surface, by a height baked per object (`cartograph/ARCHITECTURE.md`, "Ground conformance").

**The slab and The Ward.** The bake writes the slab: ground, buildings, trees, lamps, labels, terrain, ambient
occlusion, a manifest. One rule decides what's lit, for every family:
`((polygon − exclusions) ∪ activate) − hide`, ordered so the finest gesture wins (`activate` beats an exclusion,
`hide` beats everything; `NEIGHBORHOOD-INPUTS §5.2`), the disc where no polygon is authored
(`cartograph/membership.mjs#createMembershipFilter`). **Trees are impostors, not models** (Jacob: *"We're all
impostor, no models, no textures"*; *"THERE ARE NO MESHES UNLESS SPECIFIED IN THE ARBORIST, PERIOD"*,
`arborist/ARCHITECTURE` §Tree-render reality): every tree draws as its species' hero impostor, an AUTHORED capture
carried in the look's `trees-atlas.json`; a model draws only for a species on the Arborist's mesh bar. One rule,
`src/lib/treeGeometry.js#slabTreeGeometry`, read by the player, the uploader and the verifier. The models are
authoring input, never payload. ⛔ A renamed look must carry its hero impostors, or every tree falls back to a model.
The Ward plays three
payloads: the slab, the content (names, listings, history) and the installation config (identity, branding, and
a manifest that switches features on, never inferred from the data's presence; `ls/ARCHITECTURE.md §6`). If it
isn't in the slab, the public never sees it. Publish puts a slab on staging; Promote puts it on the town's address.

## 4. The canonical items

One row each: the item · its home · its check, and whether the check guards **readers** (fails if anything else
works the item out) or only **storage**. ⛔ marks a gap. Each home's header will point back here and at its check.

| Item | Home | Check (guards) |
|---|---|---|
| The disc / radius | `neighborhood_boundary.json` via `boundaryRecords.mjs`, `sceneStencil.js#loadSceneStencil` | `claims-radius-has-one-home` (storage; readers ⟦unbuilt⟧) · `claims-membership-is-the-disc` (RED) |
| The bb / frame | `fetch.js` `BBOX` → raw `bbox` | ⛔ none |
| Smoothing | `skeleton.js#rdpKeep`, `#curveFitSegments` (⛔ also STREET_SMOOTH, PATH_SMOOTH, derive, seed) | ⛔ none |
| The lattice | `src/lib/lattice.js#CLIP_SCALE` | `claims-the-lattice-has-one-home` (readers; RED on two second grids) |
| The noding rule | `src/lib/latticeNode.js#nodeAcrossGroups`, `#NODE_BOUND` | `claims-the-paint-stack-flattens` |
| ① the protopolygon | `tileGround.js#mintProtopolygon` | behaviour only; ⛔ no one-home |
| fe walk / stamp | `buildBlockGeometryV2.js#assignSegOrdsToFes`, `feCustomKey.js`, `tileGround.js#stampTile` | `claims-an-authored-key-names-the-same-frontage-after-a-re-pour` (behaviour); ⛔ no single home |
| ② the curb | `tileGround.js#offsetRingByRects` | `claims-a-look-authors-its-curb-width` |
| Corners / corner radius | seeded `STANDARDS.intersection.curbReturnRadius`; authored `design.json` corner overrides; truth `tileGround.js` `protoCornerSet` | `claims-every-corner-is-one-of-three`, `claims-proto-corner-is-authored-radius`; ⛔ no one-home |
| The ribbons | `tileGround.js#sectionOpen`; record `scene.js#ribbonsPathOf` | ⛔ none; codemap `one-line-per-depth` (MISMATCH) |
| Mono width | `tileGround.js#sectionPassProtoTile` | ⛔ none |
| The land-use stamp | `derive.js#layerLandEvidence` → `tileGround.js#stampTile` | `claims-a-land-use-boundary-is-one-line` |
| The height field | `terrainCommon.js#makeElevationSampler`, `terrainShader.js`, `drawnGround.js` | `claims-ground-normals-come-from-the-terrain`; ⛔ no reader check |
| The fade | `boundaryRecords.mjs#lookFade` | `claims-fade-derives-from-radius` |
| Membership | `membership.mjs#createMembershipFilter` (⛔ copy in `neighborhood-membership.mjs`) | `claims-membership-is-the-disc` (RED) |
| Paint order | `bake-ground.js` `PAINT_ORDER` | ⛔ none |
| Scene resolver | `scene.js#requireExplicitMap` | `claims-a-cli-scene-has-one-resolver` (readers) |
| Town id | `townRecord.js` | `claims-a-town-has-one-sealed-id` |
| The camera | `cameraRegimes.js` | `claims-the-camera-has-one-definition` (readers) |
| The wind sheet | one field a frame, read by everything that moves: `src/lib/windSheet.js` (`windAt`, `windDetail`; the one cable `#windStateOfWeather`); `cartograph/ARCHITECTURE.md` "The wind sheet" | `claims-the-wind-has-one-authority` (readers) |
| The downres ladder | the one answer to "which device, how much detail": `src/lib/qualityProfile.js` (per surface: desktop, phone-hi, phone-lo), set by the town's deployment policy (`src/lib/deployment.js`); ⛔ never a second LOD/quality/device regime. ⟦unbuilt⟧ the per-surface rung of the blur pyramid (`src/lib/renderTiers.js`, "reaches nothing that renders"; `BRIEF-pyramid-ladder`) | `claims-the-town-reads-no-player-store` (readers, Town's closure only); ⛔ `SkyEmbed`, `TreeDiorama` still sniff `IS_MOBILE` |
| The blur pyramid | one shared downsample, 8 rungs, sampled by DoF and bloom, never collapsed or duplicated: `src/components/DownsamplePyramid.jsx`; `cartograph/ARCHITECTURE.md §8`. One sanctioned sibling: `HeroLadder.jsx` (the hero alone, same kernel) | ⛔ none |

## 5. How we work on it

- **Fix the line, not the shadow.** Centerline → block → curb → ribbon. A defect is almost never fixable where it's seen.
- **Freezing wrong data is worse than not freezing.** Each freeze must be real and correct before it's trusted.
- **Scaffolding is a symptom.** A fourth guard means look at the input.
- **A source is drawn to its own resolution, and no finer** (Jacob, 2026-10-27).
  - **Two separate things.** *Fidelity* is what a source can know: the lidar coast is traced at about 1 m, so a feature
    narrower than that isn't information. *Precision* is how exactly the drawing closes: the 1 mm lattice and the 10 mm ink.
    Precision is mandatory, because it's what makes the map watertight.
  - **The rule.** Each source declares its resolution, and no feature finer than it reaches ①: no width, neck, channel or
    edge length below it.
  - **It limits a feature's SIZE, not its POSITION.** A resolvable edge may still be placed to sub-cell accuracy, but nothing
    may create a feature its source can't resolve.
  - **Beyond the limit, fidelity is authored or styled, never read off the data** (*"the style decides, authoring handles
    fidelity"*, 2026-10-20). If a wharf must be truer than its trace, the operator draws it, and ① holds the drawing exactly.
  - **The target is photorealism wherever the data allows.** Every method is a workaround toward that perceptual effect
    (Jacob, 2026-10-27). So a source's resolution says what its data may claim, and style and authoring carry the rest of the way.
  - **An artifact of the kit's own processing is never a feature.** A rounding sliver or a 1 mm jog is removed at the step that
    makes it, never drawn, and never passed downstream (Jacob, 2026-10-27: *"sounds like artifacts?"*).
  - **It is not a fallback.** What a source can't resolve is removed and recorded by name.
  - **It is not a tuned constant.** The limit is the source's own declared resolution.
  - **It is not "only seen from far".** Close-camera richness comes from style and generated detail.
  - **Homes in the code:** `structures.mjs#openCloseAtStep` (decks cut once: the source minus its features; the traced water still
    the integer form, a named debt), `structures.mjs#stripOf` (an embankment, cut once), the settle wall in `bake-coast.mjs#settleOnSource`,
    and no coast edge shorter than the step at settle's exit, `coastFile.mjs#toResolution`. ⟦unbuilt⟧ the WIDTH clause at settle's
    exit, and the decks' last rounding jogs, a corner drawn twice by the integer re-offset, cured only by float morphology
    (`BACKLOG` PTOWN PARKS (b), (c)).
  - **Check:** `checks/claims-a-coast-edge-is-no-finer-than-its-trace.mjs` (the coast's edges). ⟦unbuilt⟧ "no geometry finer than its
    source's declared resolution reaches ①", run over every traced source.
- **Every fix has three parts:** the code works and its predecessor is gone · the register is updated (FEATURES for
  the capability, OPERATIONS for the knobs) · superseded prose goes to the Diary (`cartograph/_archive/`).
- **A fact that can be run is a check, not prose.** A check reads the source and is seen to fail before it's trusted.
  The checker that catches a class on a town nobody looked at is the real prize.
- **"Polygon" means two things.** To Jacob it is the curb ring (②); to most code it is the tile face (a hole of ①).
  Say which, every time.
- **Cite symbols, never line numbers** (`module#symbol`); `checks/codemap.mjs` keeps each doc claim beside its code.

## 6. Where to go next

`README.md` — where each item lives. `ROADMAP.md` — what's left. `cartograph/BACKLOG.md` — the live front.
`ONBOARDING.md` — pouring and hydrating a new town. `ACCORDANCE-REVIEW.md` — does the code deliver what the docs claim.
The deep homes: `SKELETON` · `RIBBONS` · `SECTION` · `SURVEY` · `ARCHITECTURE` · `SLAB-CONTRACT` · `EXTENT-DESIGN`.

| The four parts | Live in |
|---|---|
| The map kit: streets, blocks, curbs, the bake | `cartograph/` (start `README.md §⭐ START HERE`) |
| The public app, The Ward: place cards, residences, the courier | `ls/` (`FEATURES` · `ARCHITECTURE` · `STATUS`) |
| The trees | `arborist/` (start `arborist/README.md §⭐ START HERE`) |
| The weather: clouds and sky | `meteorologist/` (`README` · `WEATHER-MODEL`) |

*Superseded 2026-10-21: the previous ORIENTATION → `cartograph/_archive/ORIENTATION-superseded-2026-10-21.md`; the
PIPELINE narrative → `cartograph/_archive/PIPELINE-superseded-2026-10-21.md` (its §-addresses still resolve there).*
