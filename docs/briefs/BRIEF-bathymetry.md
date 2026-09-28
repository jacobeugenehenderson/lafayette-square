<!-- BRIEF-STATE
status: OPEN — the BlueTopo rung and the merge LANDED (Loam, 2026-09-27); NCMP, CUDEM and datum conversion open
dispatched: yes (Strand's subagent 2026-09-26, research only; taken over by Loam 2026-09-27)
written: 2026-09-26
evict-when: every town with water bakes its bed from a real floor (a named bathymetry source, or verified-absent on the record — which needs every rung built); `node checks/claims-the-shore-is-closed.mjs` holds the profile's deepening rule on the cells the profile still draws and passes with the floor laid; Jacob has seen Huron and Provincetown shaded by real depth.
-->

# Bathymetry: real depth, only where it shows

## The ask (Jacob, 2026-09-26/27)
*"Where there is depth data, we only use it out to stair's edge. Where we don't have it, we gently slope it."* Past
the depth at which the bottom stops showing, depth does not matter.

## What is built — the consumer (`7c33bfbe`)
`bake-terrain` writes the bed under the mapped water: the USACE equilibrium profile h = A·y^⅔ down to the town's
visibility depth (`BAKE.md` "the bed"; `references/` f-cem-dean-a-table, r-bottom-visibility-default). The water
thins over it. ⭐ Real depth REPLACES the profile inside that band, and nothing downstream changes.
▶ `node checks/claims-the-shore-is-closed.mjs` (the median depth never shrinks going out).

## What landed (Loam, 2026-09-27)
`cartograph/fetch-bathymetry.mjs` (the ladder; BlueTopo found through its own tile scheme) → `raw/bathymetry-sources.txt`
→ `bake-terrain` `readFloor` + `writeBed` (the floor replaces the profile down to the visibility depth, feathered over
one source cell, the profile kept within two cells of the shore, rock still wins) → `terrain.json#bed.floor`. The pour
runs the fetch after fetch-dem; the terrain step's inputs include the list. ▶ what a town got: its bake log's `FLOOR:`
lines, or `node cartograph/fetch-bathymetry.mjs --scene=<id> --dry`.
**Open:** rungs 2–3 (USACE NCMP for Huron; CUDEM), and step 2's conversion for any non-NAVD88 pair (Huron's IGLD85).

## The job — the nearshore band only
1. **Source by coordinates**, finest first: NOAA BlueTopo (Provincetown: 4 m, NAVD88, covers its water) · USACE
   NCMP topobathy (Huron: 1 m, IGLD85) · NCEI CUDEM · the Great Lakes 3″ grid is too coarse at the shore (its cells
   straddle it: seam −5.16 m) — not usable here. A town with none is verified-absent and keeps the profile, said.
2. **Vertical datum** to NAVD88 via NOAA VDatum, per town and level (IGLD85 → NAVD88 = +0.067 m at Huron; VDatum
   returns −999999 outside coverage — refuse it). Measure the seam at the shore (USACE −0.06 m median after conversion).
3. **Merge** in `bake-terrain` after the datum, only where the source is shallower than the visibility depth; feather
   into the profile over the source's own cell. `projectorFor` needs EPSG 6339–6348 for the USACE tiles.
4. The research (sources, URLs, measurements) is in the retired brief (`cartograph/_archive/BRIEF-bathymetry-full-floor-2026-09-26.md`).

## The datums — LANDED (Loam, 2026-09-27)
`fetch-water-datums.mjs` → `raw/water-datums.json` → `bake-terrain` `waterLevels` → `terrain.json#water` = { tidal,
navd88OfZero, datums: { grid: { min, step, w, h }, <DATUM>: m above y = 0 (row-major z then x, north first), uncertaintyM },
low, lowFrom, high, highFrom, station, source }. ▶ a town's levels: the `LEVELS` line of its terrain bake.
**Open:** Huron's lake level is Jacob's to rule (`water.lakeLevel`: `LWD` or `mean`; its terrain refuses until then) ·
an explicit authored height · VDatum's NAVD88→IGLD85 at Huron reads −0.004 m where the research above says +0.067 m
(cause not established).

## ⭐ The water's LEVEL is a tide, chosen — ruled 2026-09-27 (Jacob)
**Found:** the level is the lidar's own water surface (Provincetown −0.99 m NAVD88), i.e. **the tide on the day the
survey flew** — a value no one chose, per town. With a 3.07 m range (NOAA 8446121), Provincetown shows its intertidal
flats at depth 0: bare sand, and the drop-off is gone (Strand, measured on the West End: 53% of the water at the level).
**Ruled:** a town's water stands at a **named tide datum**; the kit default is **mean high water** (MHW); a town may
author another (`design.water`: a datum name, or an explicit height). ⛔ The floor is not touched — only where the
level sits.
- **Datum:** VDatum converts the lidar's NAVD88 to the town's tidal datums at its position (step 2 above). A lake has no
  tide: its datum is the lake's own chart datum or mean level, from its source. ⛔ A coastal town with no conversion
  fails loudly; it never keeps the flight's level in silence.
- **Consumers — BUILT** (0962f27b … f52ad01f; the contract is `cartograph/BAKE.md` "every consumer reads the level"):
  the level, the traced high-water flood, the tide-band ground, the revetment. Loam: the datum. Strand: the level and the shore.
- ⭐ **The shape, ruled 2026-09-27 (Jacob): a LOW-tide level and a HIGH-tide level per town, and a clock between them.**
  Build the two levels now (the default shown = high; low = MLLW from the same VDatum call); the clock is next. And a
  **new graphic in the Almanac** tells the user where the tide is (Meteorologist's surface; its own brief).
- ⏭ **NEXT, and not negotiable (Jacob): the tide MOVES with the clock** — NOAA harmonics make it a pure function of
  time, like the monument's show. The level already is a value read at a time (`waterLevel.mjs`); the clock replaces
  only `tidePhase(t)`. The clock is built: `cartograph/tide.mjs` `tidePhaseClock` (95a7ca58), clamped to [0, 1] between
  the town's MHW and MLLW by ruling — so the flood at MHW is the full extent. ▶ `docs/briefs/BRIEF-tide.md`. Wiring
  `tidePhase` to it waits for Jacob's eye gate, after Provincetown has promoted (Boz, 2026-09-28).

## Bounds
No bake without Jacob's go, cleared through Boz. Commit only your own paths. Lafayette Square is not re-poured.
