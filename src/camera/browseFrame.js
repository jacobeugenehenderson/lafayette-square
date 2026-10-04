/**
 * browseFrame — where Browse (the plan) opens: ONE authority, read by Stage, Preview, the Ward (through <Town>'s
 * ShotFlight) and the legacy player. Phase 2 B (BRIEF-phase2-B-camera-authority row 1).
 *
 * AUTHORED in Stage's Camera card ("Set as Browse frame"): `{ center:[x,z], altitude }`, a centre point and a camera
 * height (Jacob, 2026-10-04; a y rotation may join it). Baked through bake-scene into scene.json#browseFrame.
 *
 * READ everywhere as a SQUARE on the ground (Jacob: "effectively a square, no matter where it's shown"): half-side
 * = altitude · tan(fov/2), the ground Stage showed top to bottom, fitted whole into whatever region the surface leaves
 * free (planPose#planAltitude). A phone, the Ward's map half and Stage frame the same ground.
 *
 * NONE AUTHORED → the town's own disc (ground.json#stencil): its centre, half-side = its radius. Said once per town,
 * on console.warn. ⛔ No disc and no frame → null, said by the caller: never another town's frame.
 */
import { planAltitude } from './planPose.js'

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }
const _said = new Set()

/** The authored frame, validated — `{ center:[x,z], altitude }` — or null. A malformed frame is refused loudly. */
export function authoredBrowseFrame(f) {
  if (f == null) return null
  const c = f.center
  if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Number.isFinite(f.altitude) && f.altitude > 0) {
    return { center: [c[0], c[1]], altitude: f.altitude }
  }
  console.error('[camera] ⛔ browseFrame is malformed (want { center:[x,z], altitude > 0 }) — refused', f)
  return null
}

/**
 * The square Browse frames: `{ x, z, half, authored }`, or null when neither a frame nor the disc is known.
 * @param frame    the authored `{ center, altitude }` (scene.json#browseFrame, or Stage's store), or null
 * @param stencil  the scene's disc `{ center:[x,z], radius }`, or null while it loads
 * @param fov      the Browse camera's vertical fov, degrees (the town's shots.browse.fov)
 * @param where    who asks, for the one log line
 */
export function browseSquare(frame, stencil, fov, where) {
  const f = authoredBrowseFrame(frame)
  if (f) return { x: f.center[0], z: f.center[1], half: f.altitude * Math.tan((fov * Math.PI) / 360), authored: true }
  const r = stencil?.radius, c = stencil?.center
  if (!(r > 0) || !Array.isArray(c) || !c.every(Number.isFinite)) return null
  const said = `${where}:${c[0]},${c[1]},${r}`
  if (!_said.has(said)) {
    _said.add(said)
    console.warn(`[camera] ${where}: no Browse frame authored — Browse opens on the town's disc (centre ${c.map(Math.round)}, radius ${Math.round(r)} m)`)
  }
  return { x: c[0], z: c[1], half: r, authored: false }
}

/** The camera height that fits the square whole into the free region of a W×H canvas (inset = the CSS px it covers). */
export function browseSquareAltitude(half, { fov, W, H, inset = ZERO }) {
  return planAltitude(half, { fov, pad: 1, W, H, inset: { ...ZERO, ...inset } })
}
