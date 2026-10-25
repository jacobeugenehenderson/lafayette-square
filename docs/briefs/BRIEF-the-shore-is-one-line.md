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
2. **The datum and the bed from that coast** (C10, C6): `waterDatum` and `writeBed`'s mask read the lidar coast, and the
   datum is found independently of the line (the design point the old brief left open: propose it).
3. **Retire the median** (C4): a fresh deletion against today's readers (`bake-shore-median.mjs`, bake-ground's
   `shoreMedianItems` / `shorePending` / `groundShorePass`, `ABOVE_WATER_M`'s sharing, `src/lib/shoreMedianGeometry.js`,
   `ShoreMedian.jsx`, StageApp's switch, the diagnostics, and its checks) in ONE commit. The `ground-shore` second pass goes,
   which also halves PTown's bake (the queued speed-up). ⚠️ `shore-sources.mjs` reads `shore-median.json`: replace it with
   bake-coast's trace IN THE SAME COMMIT, or the measure goes blind. Retire `BRIEF-the-shore-is-closed` there too, repointing its
   ~15 references (code comments, `references/registry.json` neededBy).
4. **The sand line as ink in ①** (Jacob 10-21): made in the pour beside the coast. Propose its source (the beach between high and
   low water from the lidar?) before building.
5. **Islands:** closed shore arcs, so an island is a hole in the water through the mint (tern 5fa9effb's INTENT; rewrite against
   today's mint).
6. **Later, its own commit:** rim §5's water BED stamped with ① (C8), and water to the bb (C1a, disc §2c), are the shoreline
   project's tail. Sequence them; don't fold them into 1–5 unless they fall out.

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
