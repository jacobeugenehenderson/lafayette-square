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

## Bounds
No bake without Jacob's go, cleared through Boz. Commit only your own paths. Lafayette Square is not re-poured.
