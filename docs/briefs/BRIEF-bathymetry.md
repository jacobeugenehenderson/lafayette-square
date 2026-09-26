<!-- BRIEF-STATE
status: OPEN
dispatched: yes (Strand's subagent, 2026-09-26)
written: 2026-09-26
evict-when: every town with water bakes its bed from a real floor (a named bathymetry source, or verified-absent on the record); `node checks/claims-the-shore-is-closed.mjs` asserts depth gets deeper, never shallower, going out from the shore; Jacob has seen Huron and Provincetown shaded by real depth.
-->

# Bathymetry: the bed is the real floor

## The ask (Jacob, 2026-09-26)
Water shaded by its real depth: pale where shallow, dark where deep. Chose real depth over a
distance-from-shore stand-in: *"it's a whole other thing, BUT it's CORRECT and we'll get a better result."*

## What is measured
- Under the drawn water the terrain carries **no depth**. Depth (water surface − terrain) is 0.09 m at
  p5–p95 in both towns — the water sheet's own slot lift — max 0.09 m on Huron, 1.23 m on Provincetown.
  ▶ `scratch` probe in Strand's session; re-derive from `public/baked/<town>/terrain.bin` and the water group.
- Why: the USGS DEM hydro-flattens water bodies, and `bake-terrain.js` DERIVES the datum as the mode of
  the samples under the water (`BAKE.md §2`, "the heightfield derives where zero is"). The flattening
  IS the datum's signal. ⛔ **A merge that replaces those samples first breaks the datum for every
  coastal town.** Order: derive the datum from the flattened surface, THEN lay the floor under it.
- `BRIEF-water-shader.md` §6d/§6e already records "no bathymetry in the source" and that any depth ramp
  built without one is fabricated. This brief is the source it lacked.

## What is already built (Strand, 2026-09-26) — your consumer
- The **bed**: the ground under every water body, draped over the terrain, conformed with the land
  (`bake-ground.js` PAINT_ORDER `bed`, FLOOR_KEYS). Each interior bed vertex carries the level of the water over it
  and drapes no higher (`aClampY`, section 5 of `ground.bin`). With a real floor, the drape simply goes
  below the level, and nothing downstream changes.
- The check: `checks/claims-the-shore-is-closed.mjs`.

## The job
1. **Source, per town, by coordinates — never by town name.** Candidates: NOAA NCEI Great Lakes
   bathymetry (Lake Erie), NOAA CUDEM / Coastal Relief Model (US coasts). Record vertical datum and
   resolution. Kit-wide ladder like `fetch-dem.mjs`'s: a town with none on record is verified-absent,
   and says so (`claims-a-false-map-is-not-a-fallback.mjs` is the pattern). ⛔ No invented floor.
2. **Vertical datum**: bathymetry and lidar use different datums (e.g. IGLD85 / NAVD88 / MLLW). Convert,
   cite the conversion, and measure the seam where they meet at the shore. ⛔ A step there is a new bare gap.
3. **Merge** under the water only, after the datum is derived. Plan it and report before editing
   `bake-terrain.js` or `fetch-dem.mjs` — both reach every town.
4. **Depth shading** in `waterMaterial.js` (depth = water surface − bed under the fragment; shallow colour
   from the bed's sand colour). Respect the shader's idempotence rule (`332a06cf`, `b87e42f7`).
5. **Check**: depth gets deeper, never shallower, going out from the shore along sampled lines, in
   `claims-the-shore-is-closed.mjs`. Mutation-test it.

## Bounds
No bake or pour without Jacob's go, cleared through Boz. Commit only your own paths. Lafayette
Square is not re-poured. Report the plan (source, datum, merge site) before building.
