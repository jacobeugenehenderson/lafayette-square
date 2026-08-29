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

// ── Where a tree placement sits on the ground — RAW; the carrier applies uExag ──
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
// ⛔ ALL THREE ARE RAW. Nothing here multiplies by V_EXAG; that is the carrier's job,
//    per frame, from the live uniform — see the note on the function itself.
export function treeGroundRaw(inst) {
  // ⛔⛔ RAW, PRE-EXAG — AND THE EXAG IS NOT A CONSTANT (Jacob's eye, 2026-08-28, while
  // dragging the ground in Browse: "the trees aren't stuck to or near the ground at all
  // … rendered off the ground very high in the air").
  // The ground's vertical exaggeration is a LIVE, PER-SHOT, ANIMATED uniform:
  //     targetExag = street ? 1 : browse ? 0 : V_EXAG        (PreviewApp.jsx:1140)
  // In BROWSE the ground is drawn FLAT. An earlier version of this returned
  // `raw × V_EXAG` baked into the world matrix, which is right in Hero and wrong
  // everywhere else — up to 52 m adrift in Browse, ~12 m in Street. A constant cannot
  // follow a tween.
  // ⭐ SO THE LIFT BELONGS IN THE SHADER, exactly where the mesh path has always put it
  // (`terrainShader.js:345`: `transformed.y += aGroundRaw * uExag / _instYScale`). This
  // returns the RAW anchor; the carrier multiplies by the live uExag per frame, and the
  // trees ride the ground down when a shot flattens it. Placement matrices sit at y = 0.
  if (typeof inst.groundRaw === 'number') return inst.groundRaw
  // ⚠️ ASSUMPTION, UNTESTABLE TODAY: a stamped `inst.y` is taken as a RAW height. No slab
  // stamps this column (see `slabYIsUnstamped`); confirm the units the day one does.
  if (typeof inst.y === 'number' && inst.y !== 0) return inst.y
  return getElevationRaw(inst.x, inst.z)
}

// ⭐ THE DETECTOR, not a patch. Answers "is this slab's y column stamped at all?" for a
// town nobody has opened — no species list, no threshold, no LS constant. A bake that
// starts stamping real heights lights this up as false and nothing else changes.
export function slabYIsUnstamped(instances) {
  if (!instances?.length) return false
  for (const i of instances) if (i.y !== 0) return false
  return true
}
