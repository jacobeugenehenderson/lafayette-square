# Ground "splits, not stretches" at buildings — root cause (forensic, 2026-07-16)

**Read-only forensic. Operator-confirmed defect:** on sloped ground a crack runs **parallel to a
building's footprint** and **exposes the concrete foundation blocks** (below-grade geometry that
should be hidden); **worse on steeper ground**. The ground should deform continuously ("stretch")
under/around the building, not split.

## VERDICT — mechanism (B): per-vertex ground vs rigid-centroid building
Two surfaces displaced by **different rules** meet at the footprint, and diverge on a slope:
- **Ground = per-vertex world (x,z).** `src/utils/terrainShader.js:197` `TERRAIN_DISPLACE`:
  `transformed.y += texture2D(uTerrainMap, _terrainUV(worldPos.xz)).r * uExag` — each ground vertex
  lifts to its OWN terrain height.
- **Building + foundation = ONE rigid lift by a single baked `aCentroidY`.** `bake-buildings.js:427`
  `transformed.y += aCentroidY * uExag`; `aCentroidY` = the **arithmetic mean of the footprint-vertex
  raw elevations** (`bake-buildings.js:726-728`). Walls + foundation share it (`:689-694`) → a rigid
  body with a **flat base at the mean footprint elevation** (the anti-shear regime — intentional).
- **The footprint is NOT cut out of the ground.** `bake-ground.js:385-391` subtracts only
  curb/treelawn/sidewalk/park from block interiors — **buildings are absent**, so the ground is a
  continuous per-vertex sheet *passing under* the building. There is **no baked "pad"/"mound"** — the
  "house-mound" is the *rigid building sitting in per-vertex terrain*: uphill the ground rises and
  buries the wall base (the mound look), downhill it falls and exposes the foundation (the crack).
  **Two faces of one divergence.**

At a downhill footprint vertex `i`: ground Y = `e_i·uExag`, flat foundation-top Y = `mean(e)·uExag + fh`.
Since downhill `e_i < mean(e)`, the ground drops **below** the foundation top, exposing a concrete
side-band of height `(mean(e) − e_i)·uExag + fh` — **grows linearly with slope** (= "worse on steeper
ground"). The 8 m foundation depth (`foundationGeometry.js`) only keeps the **bottom** buried; it does
nothing for the exposed **top**, so a deeper skirt cannot help.

**NOT mechanism (A):** there is no region boundary at the footprint (ground passes under as one
region), so nothing to weld/T-junction there. *(Mechanism (A) — cross-region T-junction cracks at
grass/pavement/LU seams from the per-polygon refine with no global weld, `bake-ground.js:651` — is a
**real but separate, cosmetic** hazard: hairline daylight at material seams, never exposes concrete.
Own ticket if it reads on the eye.)*

## The cure (smallest true fix) — flatten the terrain raster under each footprint
Both the ground and the building read the **same** displacement field, and the building's anchor is a
**known scalar** (mean footprint-vertex elevation). So the seam closes if the ground under + immediately
around each footprint sits at that same scalar. Geometry-free, at bake:

- **File:** `cartograph/bake-terrain.js` (the heightmap producer consumed identically by the ground
  `TERRAIN_DISPLACE` and by `getElevationRaw` in `bake-buildings.js:624`).
- **Change:** after the raw heightfield is built, **stamp each building footprint flat to its
  footprint-vertex mean elevation** (`= centroidY`, the exact value `bake-buildings.js:727-728`
  computes), with a **smooth apron falloff** blending back to native terrain over a few metres outside
  the footprint. Then the ground per-vertex under/around the building already equals the building's
  rigid anchor → it meets the flat foundation top **flush** (no exposed band) and **"stretches"** back
  to true terrain across the apron instead of splitting.
- **Guard against drift:** share ONE `footprintMeanElevation()` helper between `bake-terrain.js` and
  `bake-buildings.js` so the ground-stamp and the building-anchor can never diverge.
- **Why not the alternatives:** shearing the building to per-vertex terrain is rejected (that's the
  whole reason for rigid-centroid); a deeper foundation skirt moves only the buried bottom, not the
  exposed top.

## Notes for the eye-gate / bake
- Fix lives in `bake-terrain.js` → **rebuild-gated** (re-bake terrain + ground; uncommitted bakes in
  the tree → Jacob's go). Also confirm the apron radius doesn't visibly flatten yards on steep lots
  (operator eye) and that `V_EXAG` is read from its SSoT, not re-hardcoded.
- Lands in macro **FRONT B** (rides the terrain/ground machinery, `HANDOFF-altadena-pour.md` siblings).

*Forensic method: confirmed the two displacement rules (terrainShader vs bake-buildings), the uncut
footprint (bake-ground:385-391), and the foundation extrusion (foundationGeometry.js). Fork (A) weld vs
(B) rigid-divergence resolved to (B) by measurement of the divergence direction (downhill-exposed) and
its slope-scaling.*
