/**
 * cameraRegimes — THE ONE HOME of how a camera is driven, for every runtime
 * (Stage/Cartograph, Preview, production `Scene.jsx`, the lab).
 * BRIEF-camera-regimes; ROADMAP H-7.
 *
 * ⛔ No camera reads a hero subject. Shots are the operator's keyframes, each
 * carrying its own position + target + fov (`heroAnim.js`); where a town has
 * none yet, the opening view is DERIVED from the town's own extent (below).
 */
import { useSyncExternalStore } from 'react'
import { onSceneStencil, getSceneStencil } from '../components/sceneStencilState.js'
import { assertKeyframesAimed } from '../preview/heroAnim.js'

// ── The opening view — a town with no authored keyframes ─────────────────────
// H-7: "Where a town has no keyframes yet, the default opening view MAY point at
// its set-piece, else the town centre: a starting suggestion, not a rule." It
// points at the town centre, because the camera never reads the set-piece.
//
// ⛔ Derived from the scene's OWN disc (`ground.json#stencil`, published by
// BakedGround in every runtime) — never `scene.shots.values.browse.bounds`,
// which is Lafayette Square's frame in every baked town (ROADMAP A13).
// The numbers are dimensionless ratios of the disc's radius, so the shot scales
// with the town: a close oblique inside the hood, not a whole-hood fit (a fit
// lands kilometres out and renders the neighbourhood as a speck).
const OPENING_STANDOFF_RATIO = 0.75           // eye distance from centre / radius
const OPENING_EYE_RATIO      = 0.13           // eye height / radius
const OPENING_BEARING        = [-0.80, 0.60]  // unit XZ direction from centre to eye

/**
 * @param stencil `{ center:[x,z], radius }` — the scene's disc, or null
 * @param fov     the town's authored hero fov (scene.shots)
 * @returns a single keyframe `{ position, target, fov }`, or null when the
 *   scene's size is unknown: quietly while the disc has not been published
 *   (null), LOUDLY when it has been and is degenerate. ⛔ No fallback extent: without the disc there is no
 *   scale to stand off by, and inventing one puts a plausible-looking frame on a
 *   scene we cannot measure. Callers show nothing and say so.
 */
export function derivedOpeningKeyframe(stencil, fov) {
  if (stencil == null) return null            // not published yet — the ground is still loading
  const r = stencil.radius
  const c = stencil.center
  if (!Number.isFinite(r) || r <= 0 || !Array.isArray(c) || !c.every(Number.isFinite) || !Number.isFinite(fov)) {
    console.error('[camera] the scene disc (or hero fov) is degenerate — cannot derive an opening view', stencil, fov)
    return null
  }
  const d = r * OPENING_STANDOFF_RATIO
  return {
    position: [c[0] + OPENING_BEARING[0] * d, r * OPENING_EYE_RATIO, c[1] + OPENING_BEARING[1] * d],
    target: [c[0], 0, c[1]],
    fov,
  }
}

/** The active scene's disc, reactive (null until BakedGround publishes it). */
export function useSceneStencil() {
  return useSyncExternalStore(
    (cb) => onSceneStencil(() => cb()),
    getSceneStencil,
    getSceneStencil,
  )
}

/**
 * The keyframes a runtime plays: the authored ones, each checked for its own
 * aim; else the derived opening view; else null (size not yet known — the
 * camera stays put until the ground publishes the disc).
 */
export function resolveHeroKeyframes(authored, stencil, fov, where) {
  if (authored?.length) return assertKeyframesAimed(authored, where)
  const k = derivedOpeningKeyframe(stencil, fov)
  return k ? [k] : null
}
