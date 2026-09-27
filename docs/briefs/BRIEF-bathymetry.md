<!-- BRIEF-STATE
status: OPEN
dispatched: yes (Strand's subagent, 2026-09-26)
written: 2026-09-26
evict-when: every town with water bakes its bed from a real floor (a named bathymetry source, or verified-absent on the record); `node checks/claims-the-shore-is-closed.mjs` asserts depth gets deeper, never shallower, going out from the shore; Jacob has seen Huron and Provincetown shaded by real depth.
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
