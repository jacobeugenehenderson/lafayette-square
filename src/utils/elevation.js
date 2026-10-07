// Thin compatibility shim — the canonical home for the bilinear sampler and
// displaceGeometry is `src/lib/terrainCommon.js`; the town's exaggeration comes
// from `terrainShader.sceneExag()` and is passed in below. Terrain
// payload arrives via terrainShader.js's reloadTerrain(); this module re-uses
// that already-decoded Float32Array so the binary isn't parsed twice.
import { currentTerrain, onTerrainReload, sceneExag } from './terrainShader.js'
import { makeElevationSampler } from '../lib/terrainCommon.js'

// Terrain is now loaded per-lookId and can be re-pointed live (authoring Stage
// switching installations), so the CPU sampler must rebuild on reload. Held in
// a mutable ref behind stable wrapper functions — same names + signatures as
// before, so every consumer is untouched; they just read the live heightfield.
// ⛔ THE EXAG IS THE TOWN'S, NOT A CONSTANT, and it is re-read on every reload — the sampler
// closes over it, so rebuilding is the only way it can change (site 15). terrainShader re-points
// `sceneExag()` BEFORE firing these callbacks, so this reads the incoming look's value.
// Before any town's terrain is loaded the heightfield is FLAT (terrainShader.js), whose heights are all 0, so
// the exaggeration is moot until the first reload — and sceneExag() refuses to answer before one.
let sampler = makeElevationSampler(currentTerrain(), 1)
onTerrainReload(() => { sampler = makeElevationSampler(currentTerrain(), sceneExag()) })

export const getElevation    = (x, z) => sampler.getElevation(x, z)
export const getElevationRaw = (x, z) => sampler.getElevationRaw(x, z)
export const displaceGeometry = (geometry) => sampler.displaceGeometry(geometry)

// ── Where the Street eye stands — THE one method, every app ─────────────────
// Jacob, 2026-09-26: "the street camera is supposed to be about 5' 8" off the
// finished ground elevation." The street view draws the ground at exag 1
// (BakedGround's targetExag), so the eye reads the RAW elevation at its own point,
// plus the town's authored eye height. ⛔ Never an absolute Y (raised terrain buries
// it), never the exaggerated sampler (it floats), and NO FALLBACK: a missing
// sample or eye height throws, naming the point.
// ▶ node checks/claims-the-street-eye-stands-on-the-ground.mjs
export function streetEyeY(x, z, eyeHeight) {
  const g = sampler.getElevationRaw(x, z)
  if (!Number.isFinite(g)) throw new Error(`[street] ⛔ no ground under the eye at (${x}, ${z})`)
  if (!Number.isFinite(eyeHeight)) throw new Error(`[street] ⛔ no eye height (got ${eyeHeight})`)
  return g + eyeHeight
}

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
// ⛔ ALL THREE ARE RAW. Nothing here multiplies by the exaggeration; that is the carrier's job,
//    per frame, from the live uniform — see the note on the function itself.
export function treeGroundRaw(inst) {
  // ⛔⛔ RAW, PRE-EXAG — AND THE EXAG IS NOT A CONSTANT (Jacob's eye, 2026-08-28, while
  // dragging the ground in Browse: "the trees aren't stuck to or near the ground at all
  // … rendered off the ground very high in the air").
  // The ground's vertical exaggeration is a LIVE, PER-SHOT, ANIMATED uniform:
  //     targetExag = street ? 1 : browse ? 0 : sceneExag()   (PreviewApp.jsx)
  // In BROWSE the ground is drawn FLAT. An earlier version of this returned
  // `raw × exag` baked into the world matrix, which is right in Hero and wrong
  // everywhere else — up to 52 m adrift in Browse, ~12 m in Street. A constant cannot
  // follow a tween.
  // ⭐ SO THE LIFT BELONGS IN THE SHADER, exactly where the mesh path has always put it
  // (`terrainShader.js#patchTerrainInstancedBaked`: `aGround.x * uExag + aGround.y`, world-up). This
  // returns the RAW anchor; the carrier multiplies by the live uExag per frame, and the
  // trees ride the ground down when a shot flattens it. Placement matrices sit at y = 0.
  if (typeof inst.groundRaw === 'number') return inst.groundRaw
  // ⚠️ ASSUMPTION, UNTESTABLE TODAY: a stamped `inst.y` is taken as a RAW height. No slab
  // stamps this column (see `slabYIsUnstamped`); confirm the units the day one does.
  if (typeof inst.y === 'number' && inst.y !== 0) return inst.y
  return getElevationRaw(inst.x, inst.z)
}

// ⭐ THE DRAWN GROUND'S OWN HEIGHT under an anchored object (2026-10-06, the raised kerb): `groundY`, baked beside the
// raw anchor (`groundSampler#groundAt`), UNEXAGGERATED — 0 on a flat town, the kerb height on a raised block. Absent
// (an anchor baked before it, or none) is 0: the object then seats on the field, exactly as before.
export function groundYOf(o) { return typeof o?.groundY === 'number' ? o.groundY : 0 }

// The `aGround` attribute payload (itemSize 2) for a list of anchored objects: [raw, y] each — the one packing every
// instanced consumer uses (`terrainShader.js#patchTerrainInstancedBaked`). `rawOf` resolves the raw anchor.
export function groundPairs(list, rawOf) {
  const a = new Float32Array(list.length * 2)
  for (let i = 0; i < list.length; i++) { a[2 * i] = rawOf(list[i]); a[2 * i + 1] = groundYOf(list[i]) }
  return a
}

// ⭐ THE DETECTOR, not a patch. Answers "is this slab's y column stamped at all?" for a
// town nobody has opened — no species list, no threshold, no LS constant. A bake that
// starts stamping real heights lights this up as false and nothing else changes.
export function slabYIsUnstamped(instances) {
  if (!instances?.length) return false
  for (const i of instances) if (i.y !== 0) return false
  return true
}
