# BRIEF — the shore is one line: the coast from the lidar, the water from the coast, the median gone

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-25 (Boz; claims C1–C11 read against the code by Zob at integration 2956609e)
evict-when: on Huron (then PTown), ①'s coast is the lidar's high-water line (the coast-vs-lidar distance ~0 by the replacement instrument); the dry-bed/wet-land check reads ~0; the shore median is deleted with every reader; the gates below are GREEN; merged; then Jacob passes Huron's shore by eye at street level. Then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, not one a running session holds (`ListAgents`, then `/rename`).
**Agent: FRESH.** **Report to Boz.** **Instruction: confirm-then-build.** If the code contradicts this brief, stop and flag
Boz. The stop is the deliverable.
**Supersedes** `cartograph/_archive/BRIEF-the-coast-from-the-lidar-SUPERSEDED-2026-10-25.md` (its rulings carried here; its
deformer-era plan is dead).
**Priority (Jacob, 2026-10-25):** *"I want to fix Huron's shoreline next; it's unsightly."* Huron first, then PTown.
⚠️ **Jackson Heights also gets a lidar coast** (Flushing Bay lies in its fetch; it has a tidal record and lidar), so its
next Bake reads the lidar too. JH is out of the current tranche (Boz, 2026-10-25).

## 0. Why it looks wrong (Zob, read + measured on Huron's 2026-10-25 tranche bake)

Three lines that should be one:
1. **①'s coast traces OSM** (`coastline.mjs#coastRings`: `natural=coastline` / `isWaterFeature`), and so does the height
   field's water mask (`bake-terrain#waterDatum` takes the mode under those OSM rings; `writeBed` digs the bed under the mask).
2. **The real shore is the lidar's.** ▶ `node scratch/ground-height/shore-sources.mjs huron` (from the integration worktree):
   the lidar trace sits p50 4.34 m · p90 71.8 m · p99 263 m off ①'s coast; on 58% of the coast the field stands above zero.
3. **The shore median** paints sand between them (`bake-shore-median.mjs` → bake-ground `shoreMedianItems` + the
   `ground-shore` second pass). It is ALIVE, against two rulings (Jacob 2026-10-13 "drop it"; 2026-10-21 "the sand line should
   be made as part of the protopoly"): a REGRESSION.

## 1. The rulings (verbatim homes; don't re-derive)

- **The coast is where the lidar meets HIGH water** (Jacob 2026-10-11, `BRIEF-the-ground-knows-its-height §5` "The shore:
  RULED"): tidal → MHW, a lake → its authored level; one outline from the lidar; the sheet that finds it is discarded.
- **⭐ ①'s coast IS the high-water mark, by definition** (Jacob 2026-10-25: *"Could we just say the polygon IS the logical
  highest water mark?"*). Water is ①'s water face at the level, drawing back inside it below HIGH; land outside ① is land at every
  level, even below HIGH; the field is stamped to the line in a band; HIGH is the water record's number. The lidar trace is the
  pour's FIRST DRAFT of the line (authorable), and the bed inside ① is NCMP near shore.
- **A river at the lake's own level is the lake; islands are built** (Jacob 2026-10-26: *"yes river is lake, build islands with the
  floor"*). The lower Huron River, flattened at the lake's sheet, is part of ①'s water face. Islands are holes in the water through
  the mint and bake-ground (holed polygons). Holes smaller than one terrain cell are dropped, counted and named.
- **The drawn coast is PINNED to HIGH; the bed is measured where surveyed** (Jacob 2026-10-27: *"yes pin the coast, and go with (a)
  for the bed"*). Every drawn-ground vertex on ①'s coast carries a per-vertex raw override = HIGH (shader and drawnGround read one
  function); line-adjacent vertices are clamped by SIDE (land ≥ HIGH, water ≤ HIGH), each clamp counted and named. So the visible
  waterline IS ①'s line at any field resolution. The stamp only SHAPES now; its straddler/wall machinery is removed. Bed (a): the
  survey where it reads, writeBed's profile elsewhere, and every ring records its floor share. A ground.bin format change: the player
  side gets Ward's read, and every town is re-baked once.
- **A road over ①'s water is a bridge** (Jacob 2026-10-27, choosing "(a)": a street span over the water, tagged off-grade or
  not, is left out of the ground ink; an UNTAGGED one is off-grade by the coast and RECORDED per span in the pour and the bake
  report, never silent). FILED (Jacob: *"we don't have any mechanism for this in the authoring tools"*): an authoring gesture to mark
  a span as bridge or at grade.
- **Bridges over water are PAINTED across it, for now; a deck later** (Jacob 2026-10-27: *"b for now, deck later"*). One behaviour for
  every road class: ①'s water stays continuous under the bridge (the off-grade span stays out of ①'s ink), and the span is painted
  over the water as an overlay, the way H already is. The pin skips coast vertices under that paint by identity, counted and named.
  FILED: a real bridge deck (raised over the water), the "deck later".
- **The lidar's own point classes decide what is a deck** (Jacob 2026-10-27: *"If we have access to literal data via the lidar it
  seems like that is the more legit option"*). A mapped pier/deck footprint is masked as water only where the 3DEP point cloud's classes
  say structure over water; a "pier" tag on land (Huron's dredge pump-out pad) stays ground. The kit gains a LAZ reader (approved in
  principle), pinned, with a registry row for the LPC access path; a footprint with no point data refuses by name.
- **Water, sand and shore run to the bb and are stamped with everything; the disc stamps last; the sand line is ink in ①,
  made in the pour** (Jacob 2026-10-21 night; `BRIEF-the-rim-is-cut-once §5`).
- **No fallback:** no lidar, no vertical datum, or no water record ⇒ THROWS by name, never OSM (`coast-from-lidar §3.2`).
- **The datum must not depend on the line it moves.**
- **The coast slit's water-side half joins the water** (Jacob 2026-10-25; landed with `BRIEF-the-ink-is-owned-by-its-labels`).

## 2. The claims, as Zob answered them (re-confirm each by symbol)

C1 PARTLY (water culled at `discR × 1.25`, a dated exception; water paint still `clipAllToStencil`) · C2 FAILS (OSM) ·
C3 ROT ("a coast run's h = high water" was the deformer's; height is the one field; `tideBand` logs rather than throws, which is
reached by no-coast towns only, inferred) · C4 FAILS (the median is end-to-end: maker, ground pass, runtime diagnostic, checks) ·
C5 holds today, and absorption moves the water edge 5 mm (evict option (a)'s wording when it lands) · C6 PARTLY (the bed is
written into terrain.bin under the OSM mask; no gusset at HEAD) · C7 open (`BRIEF-the-shore-keeps-its-lidar` Phase B) ·
C8 unbuilt (rim §5; the PAINT bed, not the height bed) · C10 HOLDS (the datum reads the OSM coast; bake-terrain carries a third
copy of the bb projection, which goes to `geography.mjs#localBB`) · C11 is tern's, ready.

## 3. The work, in order (Zob's order)

1. **The lidar coast into ①.** Port tern/coast-from-lidar's building blocks, NOT the branch (it doesn't merge): `bake-coast.mjs`,
   `coastFile.mjs`, `coastVerify.mjs`, `marchingSquares.mjs`, with three rewires (`demVerticalDatum` / `TERRAIN_STEP_M` not
   exported; `waterDatums.mjs` absent). Its throws come with it (C11). ①'s coast source becomes that file; OSM coast ways stay
   only as what the lidar line is VERIFIED against, never a fallback. **Propose where it runs in the ratchet** (Jacob 2026-10-25:
   "the build is a ratchet"; agents use the buttons' routes): a pour step, before the mint, that the Bake's dirty detector sees.
2. **Everything after the mint READS ①'s water; the field is STAMPED to it** (Jacob 2026-10-25: *"This smells like a
   protopolygon misuse"*; Zob read it by symbol the same day). The shore on screen is not ①'s line: it is where the flat water
   sheet meets the 5 m field by DEPTH TEST, and bake-terrain decides water by itself four times (`waterDatum`'s own coastRings
   mask, `writeBed`'s dig, `floodExtent`'s raster flood, `rockCells`). bake-ground's water is a COPY of ①'s source. So:
   (a) ONE coast read: waterDatum, writeBed, rockCells and bake-ground's water read ①'s frozen water (`protopolygon.waterRings` /
   the absorbed water cells), never coastRings or map.json again; (b) the field STAMPED to ①'s coast (ground = level on the line,
   ≥ level landward, the bed ≤ level seaward), so the depth-test contour IS ①'s line; (c) `floodExtent` RETIRED as a decider.
   Gate: along ①'s coast, |ground − level| = 0 to the field's resolution; no flood polygon outside ①'s water. The datum is found
   independently of the line (C10).
3. **Retire the median** (C4): a fresh deletion against today's readers (`bake-shore-median.mjs`, bake-ground's
   `shoreMedianItems` / `shorePending` / `groundShorePass`, `ABOVE_WATER_M`'s sharing, `src/lib/shoreMedianGeometry.js`,
   `ShoreMedian.jsx`, StageApp's switch, the diagnostics, and its checks) in ONE commit. The `ground-shore` second pass goes,
   which also halves PTown's bake (the queued speed-up). ⚠️ `shore-sources.mjs` reads `shore-median.json`: replace it with
   bake-coast's trace IN THE SAME COMMIT, or the measure goes blind. Retire `BRIEF-the-shore-is-closed` there too, repointing its
   ~15 references (code comments, `references/registry.json` neededBy).
   ⭐ Folded in (Boz, 2026-10-25): `bake-terrain#floodExtent` (terrain.json `water.flood`, drawn by BakedGround.jsx) is a
   fourth trace of the same line at 5 m. It retires here IF its `beyondDrawnHa` measures ~0 on the lidar coast (Huron,
   PTown, in the slot); otherwise its numbers go to Boz.
4. **The sand line as ink in ①** (Jacob 10-21): made in the pour beside the coast. Propose its source (the beach between high and
   low water from the lidar?) before building.
5. **Islands — BUILT 2026-10-26, brought forward (Jacob: "yes river is lake, build islands with the floor").** An island is a
   hole in ①'s water and a closed shore arc. Every filled draw takes the face as holed polygons (`coastFile.mjs#faceAsPolygons`).
   An island holding no terrain node is dropped (Boz's ruling), each named in coast.json `islandsDropped`. ▶ `claims-the-water-is-one-polygon` §0,
   `claims-the-shore-meets-the-field-at-high` §7, `claims-the-coast-is-the-lidars` D.
6. **Later, its own commit:** rim §5's water BED stamped with ① (C8), and water to the bb (C1a, disc §2c), are the shoreline
   project's tail. Sequence them; don't fold them into 1–5 unless they fall out.
   FILED (Boz, 2026-10-27): a street deck's edge is told from the coast by reading the frozen streetDecks rings at the pin's
   on-line tolerance (`coastPins.mjs`). True per-edge identity is the MINT's job: ① tags each waterRings edge with its owner
   (coast or a named deck), and the pin reads the tag.

**⚠️ Built structures over water (Jacob, 2026-10-25: "PTown has a big pier and I believe Huron has something like it; it's built
structure over water").** The lidar sees a pier's DECK as a surface above high water, so a coast traced where the lidar meets high
water would draw the pier as LAND. A pier, wharf or dock is the off-the-ground family (`STYLE-GUIDE §10` Q10.a; Jacob 2026-09-27:
OSM width where mapped), never ground; a breakwater or groyne is STONE ground (ruled 2026-09-27). Zob (read + measured, 2026-10-25): `cartograph/structures.mjs`
ALREADY holds this rule ("every mapped pier · quay · wharf · jetty · platform is a DECK above the water…; breakwaters and groynes are
stone"), but only `stoneStructures` has an importer: the DECK side is vocabulary with no consumer (ASPIRATION). Today PTown's
MacMillan Wharf (highway=service, 11 of 16 vertices over the drawn water), Fishermen's Wharf and the marina footways are ① INK over
water (D merges them into the water, so no deck, no curb, only a ~1 cm line), and tern's bake-coast masks only DIKES, so it would
trace solid decks as land. So step 1 masks `structures.mjs#DECK_KINDS` (read by tag from every bucket)
OUT of the lidar intersection (by OSM tag, from the data, never a site list), so the coast runs under them,
and the water continues beneath. PTown's MacMillan Wharf (a street meets it: `macmillan-wharf|end`, a lost cap handle in
caps-from-shape) and Huron's equivalent are the exhibits. Each deck then becomes its own off-the-ground object, fed by structures.mjs's deck side.
✅ RULED (Jacob, 2026-10-25: "a, the street rides the deck"): a wharf that is also a STREET (MacMillan) carries its street ON the
deck: its walk and curb built on the deck, at the land's height, never ink over water. Gates: on PTown, the traced coast has no land inside a deck footprint, and MacMillan Wharf is drawn as a
deck at land height.
**Swash's premise pass (2026-10-25), ruled by Boz:** (1) tern's flown-water branch is ported WITH its throw; a lake or sea flown above
its high level leaves a bank with no owner, which is a NAMED REFUSAL ("flown above high by X m"), and Jacob decides which level is right.
(2) A line pier's width: OSM width where mapped, else a SOURCED typical width, with an authored override (Jacob 2026-09-27, registry's
structures-over-water finding); no permitted source ⇒ throws. (3) Step 1 is a 'coast' Bake step before 'pipeline' (judged by the dirty
detector), with clean/coast.json in pour-code's pourDataReads; /pour and the rescope run bake-coast first; derive refuses without it.
**Step 2's datum, ruled (Boz, 2026-10-25, Swash's (B)):** y=0 = the flattened water's 1 cm mode over bake-coast's COARSE flood sheet
(lidar + the water record, before any line is traced), recorded in coast.json `flattened: { navd88, share, cells }`; bake-terrain reads
it; waterDatum's own histogram is deleted. Mutant: move the coast by its p50 offset, and y=0 must not change. Too little water in the
sheet to take a mode refuses by name. Also in step 2: bake-coast-distance.js (the water past the rim) reads the lidar coast too, so
inside and past the rim are one line. Step 1 does NOT merge alone; steps 1–3 land together, validated on the shore branch.
**⭐ THE UNSEEN SHORE (Jacob's method, 2026-10-25; ruled after Swash's measurement + Zob's read).** Huron's lidar flew 2019-11 → 2020-04 with
Lake Erie 0.3–0.7 m ABOVE its gauge mean (Marblehead 9063079 = Huron's lakeLevel 174.354); the flattened sheet (174.44 NAVD88) matches no
month (set by the processor). So the shore between the mean and the flight-day water was underwater when flown. Jacob: *"If we have the
bathymetry and a depth stick at an agreed upon point, we could just fill it to the current actual average."* ⇒ keep the level at the gauge
mean; read the gauge over the lidar's own FLIGHT WINDOW (WESM collection dates, recorded per source); take that band's ground from
BATHYMETRY (rung 2: USACE NCMP topobathy, terms and registry row first); trace where the mean meets lidar-above-the-flight-water ∪
bathymetry-below-it, through ONE merged sampler used by both of bake-coast's grids; `waterAsFlown` fills the band rather than refusing,
and refuses by name only where no bathymetry covers it; bake-terrain's floor read covers the band so coast and bed share one floor. Today
the floor enters AFTER the coast (readFloor samples only under the mask); this moves it before. Tidal towns (PTown) need per-flight-line
times: designed separately.
**Dead on tern, don't port:** the gusset (`9c95f43a`, `5f19280c`; per-vertex heights for the retired deformer).

## 4. Gates

- **The shore agrees with the field.** ⚠️ terrain.bin can't show it: `bake-terrain#writeBed` OVERWRITES every masked cell with the
  bed, so "OSM drew water over land" is destroyed before anyone reads it (Zob, read). So (Boz, 2026-10-25), in step 2: writeBed
  RECORDS in terrain.json `bed` the cells under the mask whose lidar stood above that cell's HIGH (row runs, like `rock.runs`;
  rock excluded and named separately), and a new check reads that record for (a) dry bed and judges (b) wet land on terrain.bin.
  One independent cross-check in a slot: recompute (a) on one Huron tile through `elevationSources.mjs` and assert it equals the
  record. Mutant: shift the mask by the p50 offset, and it must not improve. Dated baseline (Zob's probe, 2026-10-25, ①'s
  waterRings): Huron (a) 8,123 m² (≈ its 354 kept-rock cells, inferred) · (b) 350 m²; PTown (a) 249,438 m² (cause not
  established) · (b) 0.
- **The coast is on the lidar:** the replacement for `shore-sources.mjs` (bake-coast's trace vs ①'s coast), p50/p90 → ~0.
- **The water ring's winding** (Ferrule's flag): `coastline.mjs` must never emit a CW water ring into D's nonzero fill; a check.
- Authoring: `claims-authored-skelids-keep-their-ways` + the authored-key check (Huron's 3 keys; PTown none).
- The Bake route on Huron, no refusal, through the ratchet; the detector's decisions recorded; then Jacob's eye.

## 5. Bounds

- Write: the coast/terrain/pour files named above, the ported files, new checks. Canon edits: the ROT named in §2, in the same
  commits. Branch off `integration/2026-10-20` in `.claude/worktrees/`; `git commit -- <paths>`; Boz merges on Zob's PASS.
- ⚠️ Overlap: `BRIEF-the-ink-is-owned-by-its-labels` (Ferrule) changes ①'s coast slit and the shore band. Rebase onto it if it
  lands first; flag any conflict in the mint's coast handling rather than resolve it alone.
- Heavy runs in the slot, from Boz, by name. Real pours through the buttons' routes; a hand-run is a probe and is reported as one.
- Commit messages name the register reached, or say "reaches no register".
