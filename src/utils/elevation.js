// Thin compatibility shim — the canonical home for V_EXAG, the bilinear
// sampler, and displaceGeometry is `src/lib/terrainCommon.js`. Terrain
// payload arrives via terrainShader.js's top-level-await of terrain.bin;
// this module re-uses that already-decoded Float32Array so the binary
// isn't parsed twice.
import { currentTerrain, onTerrainReload } from './terrainShader.js'
import { makeElevationSampler, V_EXAG } from '../lib/terrainCommon.js'

export { V_EXAG }

// Terrain is now loaded per-lookId and can be re-pointed live (authoring Stage
// switching installations), so the CPU sampler must rebuild on reload. Held in
// a mutable ref behind stable wrapper functions — same names + signatures as
// before, so every consumer is untouched; they just read the live heightfield.
let sampler = makeElevationSampler(currentTerrain())
onTerrainReload(() => { sampler = makeElevationSampler(currentTerrain()) })

export const getElevation    = (x, z) => sampler.getElevation(x, z)
export const getElevationRaw = (x, z) => sampler.getElevationRaw(x, z)
export const displaceGeometry = (geometry) => sampler.displaceGeometry(geometry)

// ── Where a tree placement actually sits on the ground ───────────────────────
// ⛔⛔ ONE RULE, THREE CONSUMERS. The mesh path (`InstancedTrees`), the hero cards
// (`HeroImpostorTrees`) and the browse discs (`OverheadTrees`) must seat a placement
// on the SAME ground or the tiers do not line up — and for four days they did not.
//
// ⛔ THE DEFECT (Jacob's eye, 2026-08-27; root found 2026-08-28). Every placement in
// the slab carries `y: 0` — all 5127 of them, on every scene. It is a SENTINEL meaning
// "not stamped, go look it up", and the impostor consumers read it as a VALUE:
//     const y = typeof inst.y === 'number' ? inst.y : getElevationRaw(inst.x, inst.z)
// `typeof 0 === 'number'` is true, so the lookup NEVER ran and 4867 hero cards sat at
// y=0 — buried under 2.6–34.8 m of terrain. The mesh path survived only because it reads
// `groundRaw` and falls back on `undefined`, which is a value the sentinel cannot fake.
// ⭐ `[[project_a_sentinel_is_not_a_value]]` — the same shape as `terminal:'none'`.
//
// PRECEDENCE, and why:
//   1. `groundRaw` — the per-look baked anchor (`tree-anchors.json`, groundSampler bake).
//      Seats the trunk on the DRAWN ground, which is what the eye judges.
//   2. `inst.y` — ONLY when non-zero. ⚠️ Not a threshold and not an LS constant: a slab
//      whose y column is uniformly 0 is an UNSTAMPED column, and `slabYIsUnstamped()`
//      below reports that as its own loud fact rather than letting it masquerade.
//   3. the smooth terrain field — the honest fallback, and the one the mesh path has
//      been quietly using all along.
export function treeGroundY(inst) {
  // ⛔⛔ RAW IS NOT THE DRAWN GROUND — V_EXAG (Jacob's eye, 2026-08-28, against the very
  // fix that had just un-buried these trees: "is it possible the trees are still anchored
  // at y0 and not on the ground surface?"). The heightmap is in raw metres; the ground
  // MESH is displaced by `getElevation` = raw × V_EXAG, and the mesh trees are lifted in
  // the vertex shader by `aGroundRaw * uExag` (terrainShader.js:345). So a raw value put
  // straight into a world matrix lands 0.5 × raw BELOW the surface — ~11.6 m at LS's
  // median, up to ~17 m. It looked plausible, which is why only the eye caught it.
  // ⭐ `groundRaw` is a RAW anchor (same units the shader multiplies), so it exaggerates
  // here too — the difference between the two paths is WHERE the multiply happens, never
  // whether it happens.
  if (typeof inst.groundRaw === 'number') return inst.groundRaw * V_EXAG
  // ⚠️ ASSUMPTION, UNTESTABLE TODAY: a stamped `inst.y` is taken as an already-drawn world
  // height, not a raw one. No slab stamps this column (see `slabYIsUnstamped`), so there is
  // nothing to measure against; the day a bake stamps it, CONFIRM the units before trusting.
  if (typeof inst.y === 'number' && inst.y !== 0) return inst.y
  return getElevation(inst.x, inst.z)   // already × V_EXAG — the surface the eye sees
}

// ⭐ THE DETECTOR, not a patch. Answers "is this slab's y column stamped at all?" for a
// town nobody has opened — no species list, no threshold, no LS constant. A bake that
// starts stamping real heights lights this up as false and nothing else changes.
export function slabYIsUnstamped(instances) {
  if (!instances?.length) return false
  for (const i of instances) if (i.y !== 0) return false
  return true
}
