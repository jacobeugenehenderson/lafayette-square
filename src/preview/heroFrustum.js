/**
 * heroFrustum.js — WHAT THE MOVIE CAN SEE: the authored path's poses and the frustum test against them. ONE HOME.
 *
 * Moved out of `arborist/bake-trees.js#classifyHeroTiers` (BRIEF-the-far-shore-is-not-built-at-load, 2026-10-29) so the
 * revetment's far-layer bake (`cartograph/bake-revetment-far.js`) classes its chunks by the SAME poses and the SAME test
 * the trees are tiered by, never a second copy. The arithmetic is the tree bake's, in its order; the tree tiers are
 * unchanged by the move (▶ node checks/claims-the-movie-sees-through-one-frustum.mjs).
 *
 * The poses are `heroAnim.js#heroPathPose` sampled uniformly along the PATH (a loop's closing segment included): key
 * times change when the camera is where, not the set of poses it occupies. The aim at each pose is the keyframes' own
 * target, interpolated on the same parameter.
 *
 * ⚠️ OPEN, carried unchanged from the tree bake (Zob, 2026-10-29), not decided here:
 *   · the frustum's fov is `keyframes[0].fov` for EVERY pose, while heroPathPose returns each pose's own fov
 *     (CelestialBodies reads that one). A shot that zooms is tested at its first key's lens.
 *   · the aspect is a fixed 16:9 (HERO_ASPECT), not the viewer's.
 */
import { heroPathPose, assertKeyframesAimed, assertHeroMotion } from './heroAnim.js'

/** ⚠️ OPEN (above): the viewport aspect the horizontal bound assumes. */
export const HERO_ASPECT = 16 / 9
/** How many poses sample the path (the tree bake's, since 2026-05). */
export const HERO_POSES = 24
/** The guard that widens the frustum for a CONSERVATIVE "ever seen": generous, so only what is well outside the view for
 *  the whole sweep counts as never seen (operator request 2026-05-26, the tree bake's cull tier). */
export const HERO_SEEN_GUARD = 1.3

/** n poses `{ p, q }` (camera position, aim) along the path, f = s / (n − 1). Throws on unaimed keys or a bad motion. */
export function heroPoses(keyframes, motion, n, where) {
  assertKeyframesAimed(keyframes, where)
  assertHeroMotion(keyframes, motion, where)
  const poses = []
  for (let s = 0; s < n; s++) {
    const t = n === 1 ? 0 : s / (n - 1)
    const { position: p, target: q } = heroPathPose(keyframes, motion, t)
    poses.push({ p: [p[0], p[1], p[2]], q: [q[0], q[1], q[2]] })
  }
  return poses
}

/** The frustum's half-angles (radians) from the first key's fov at HERO_ASPECT. */
export function heroHalfAngles(keyframes) {
  const fovDeg = keyframes[0].fov
  const vHalf = (fovDeg * Math.PI / 180) / 2
  const hHalf = Math.atan(Math.tan(vHalf) * HERO_ASPECT)
  return { fovDeg, vHalf, hHalf, diagHalf: Math.hypot(hHalf, vHalf) }
}

/** The camera basis at a pose: forward = unit(target − cam); right = unit(forward × up); up' = right × forward.
 *  The sign of `right` is irrelevant (the test reads |angle|). */
export function poseBasis(cam, target) {
  let fx = target[0] - cam[0], fy = target[1] - cam[1], fz = target[2] - cam[2]
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl
  let rx = -fz, ry = 0, rz = fx              // forward × (0,1,0)
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx
  return { cam, fx, fy, fz, rx, ry, rz, ux, uy, uz }
}

/** A sphere (x, y, z, radius R) seen from a pose's basis: its depth along the view, its angles off the axis (ah
 *  horizontal, av vertical) and its angular radius ar; null when it is behind the camera (depth ≤ 0.01). */
export function projectSphere(B, x, y, z, R) {
  const dx = x - B.cam[0], dy = y - B.cam[1], dz = z - B.cam[2]
  const depth = dx * B.fx + dy * B.fy + dz * B.fz
  if (depth <= 0.01) return null
  const xc = dx * B.rx + dy * B.ry + dz * B.rz
  const yc = dx * B.ux + dy * B.uy + dz * B.uz
  return { depth, ah: Math.atan2(xc, depth), av: Math.atan2(yc, depth), ar: Math.atan2(R, Math.hypot(dx, dy, dz)) }
}

/** Whether a projected sphere is inside half-angles (hHalf, vHalf) scaled by `guard` (1 = the frustum itself). */
export const insideFrustum = (pr, hHalf, vHalf, guard = 1) =>
  !!pr && Math.abs(pr.ah) < hHalf * guard + pr.ar && Math.abs(pr.av) < vHalf * guard + pr.ar
