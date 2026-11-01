// Thin compatibility shim — the canonical home for the bilinear sampler and
// displaceGeometry is `src/lib/terrainCommon.js`; the town's exaggeration comes
// from `terrainShader.sceneExag()` and is passed in below. Terrain
// payload arrives via terrainShader.js's reloadTerrain(); this module re-uses
// that already-decoded Float32Array so the binary isn't parsed twice.
import { currentTerrain, onTerrainReload, sceneExag } from './terrainShader.js'
import { makeElevationSampler } from '../lib/terrainCommon.js'
import { Refusal } from '../lib/refusal.js'

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

// ── The DRAWN ground (BRIEF-the-ground-stands-on-one-field) ──────────────────
// BakedGround publishes `src/lib/drawnGround.js` over the bin it holds — the ONE function the bake's anchors read too —
// so whatever stands on the ground at runtime (the street eye, the movers, the user's dot) stands on the ground AS
// DRAWN: the height field at the drawn triangle's corners × the exaggeration + the kerb part. Off the mesh (past the disc), or before the
// ground has loaded, there is no drawn ground: the field is what is there.
let drawn = null
const drawnListeners = new Set()
export function setDrawnGround(d) { drawn = d; for (const cb of drawnListeners) cb() }
/** Re-seat when the drawn ground arrives or is replaced (a look switch). Returns the unsubscribe. */
export function onDrawnGround(cb) { drawnListeners.add(cb); return () => drawnListeners.delete(cb) }
export function drawnGroundY(x, z, exag) {
  const h = drawn ? drawn.heightAt(x, z, exag) : null
  return h ?? sampler.getElevationRaw(x, z) * exag
}
/** The drawn ground's two parts at (x, z), for a body seated ONCE and lifted per frame: `raw × exag + y`. Off the mesh,
 *  or before the ground has loaded, the field with y 0 (`offMesh: true`), the same ground `drawnGroundY` falls to. */
export function drawnGroundParts(x, z) {
  const p = drawn ? drawn.partsAt(x, z) : null
  return p ? { raw: p.raw, y: p.y } : { raw: sampler.getElevationRaw(x, z), y: 0, offMesh: true }
}

// ── Where the Street eye stands — THE one method, every app ─────────────────
// Jacob, 2026-09-26: "the street camera is supposed to be about 5' 8" off the
// finished ground elevation." The street view draws the ground at exag 1
// (BakedGround's targetExag), so the eye reads the RAW elevation at its own point,
// plus the town's authored eye height. ⛔ Never an absolute Y (raised terrain buries
// it), never the exaggerated sampler (it floats), and NO FALLBACK: a missing
// sample or eye height throws, naming the point.
// ▶ node checks/claims-the-street-eye-stands-on-the-ground.mjs
export function streetEyeY(x, z, eyeHeight) {
  const g = drawnGroundY(x, z, 1)   // the street view draws the ground at exag 1: the eye stands on the ground as drawn
  if (!Number.isFinite(g)) throw new Refusal(`[street] ⛔ no ground under the eye at (${x}, ${z})`)
  if (!Number.isFinite(eyeHeight)) throw new Refusal(`[street] ⛔ no eye height (got ${eyeHeight})`)
  return g + eyeHeight
}

// ── Where a tree or lamp sits on the ground: its BAKED anchor, RAW (the carrier applies uExag per frame, from the live
// uniform: a constant cannot follow Browse's tween to a flat ground) ──
// ⛔ NEVER LOOKED UP. An object is seated by its own `groundRaw` (tree-anchors.json / lamps.json, the groundSampler bake),
// which puts it on the DRAWN ground; a town whose anchors fail their gate is refused by name before any consumer runs
// (src/lib/anchorGate.js, Boz ruled 2026-10-29). The field fallback that stood here (and the `inst.y` sentinel guess
// before it) seated an unanchored object on the smooth field, a plausible-looking wrong map. ▶ src/lib/anchorGate.js#anchoredRaw

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

