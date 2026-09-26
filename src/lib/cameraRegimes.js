/**
 * cameraRegimes — THE ONE HOME of how a camera is driven, for every runtime
 * (Stage/Cartograph, Extent, Preview, production `Scene.jsx`, the lab, and the
 * tool viewers). BRIEF-camera-regimes; ROADMAP H-7.
 *
 * ⭐ A runtime CHOOSES a regime; it never defines controls itself. The React
 * mount is `src/components/RegimeControls.jsx`; production, which drives one
 * controls instance imperatively across its modes, calls `applyRegime`.
 * `checks/claims-one-controls-definition.mjs` fails on any other controls mount.
 *
 *   plan     — 2D. Straight overhead (the Designer's ortho, the Extent tool,
 *              and Browse's overhead perspective): pan + zoom, NO rotate.
 *              Browse is this regime exactly as it was (Jacob, 2026-09-26:
 *              "Browse is already correct").
 *   orbit    — 3D. Stage and everything beyond it: drag orbits, ⌥-drag grabs
 *              the ground, ⌘/⌃-drag pans, middle-drag dollies, wheel zooms —
 *              the same buttons, keys and limits in every app.
 *   street   — 3D, CONSTRAINED: stand at eye height and look around. Orbit in
 *              place (distance locked to the 0.5 m look-ahead the Street entry
 *              sets), polar held between the horizon and near-zenith, right /
 *              ⌃-drag walks across the ground plane, no zoom. Production's
 *              "planetarium", now the same in every app.
 *   playback — 3D.1. The authored keyframes own the camera: no input at all.
 *              Mounted as the orbit regime with `enabled={false}`, so the
 *              hand-back when playback stops is the orbit regime's re-aim.
 *
 * ⛔ No camera reads a hero subject. Shots are the operator's keyframes, each
 * carrying its own position + target + fov (`heroAnim.js`); where a town has
 * none yet, the opening view is DERIVED from the town's own extent (below).
 */
import { useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { onSceneStencil, getSceneStencil } from '../components/sceneStencilState.js'
import { assertKeyframesAimed, assertHeroMotion } from '../preview/heroAnim.js'

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
 * @returns a single keyframe `{ position, target, fov, t: 0 }` (a static shot), or null when the
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
    t: 0,
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
 * aim and time (and an animated shot for its motion); else the derived opening
 * view; else null (size not yet known — the camera stays put until the ground
 * publishes the disc).
 */
export function resolveHeroKeyframes(authored, motion, stencil, fov, where) {
  if (authored?.length) {
    assertHeroMotion(authored, motion, where)
    return assertKeyframesAimed(authored, where)
  }
  const k = derivedOpeningKeyframe(stencil, fov)
  return k ? [k] : null
}

// ── The regimes ─────────────────────────────────────────────────────────────
// Everything a controls instance is told, per regime. Gestures and speeds are
// FIXED per regime; only content-scale LIMITS (see REGIME_LIMIT_KEYS) may be
// passed per mount — a tree viewer is not a town.
const M = THREE.MOUSE, T = THREE.TOUCH
export const REGIMES = {
  plan: {
    enableRotate: false, enablePan: true, enableZoom: true,
    enableDamping: true, dampingFactor: 0.05,
    rotateSpeed: 1, panSpeed: 1, zoomSpeed: 1,
    screenSpacePanning: true,
    minDistance: 50, maxDistance: 20000,
    minPolarAngle: 0, maxPolarAngle: Math.PI,
    mouseButtons: { LEFT: M.PAN, MIDDLE: M.DOLLY, RIGHT: M.PAN },
    touches: { ONE: T.PAN, TWO: T.DOLLY_PAN },
  },
  orbit: {
    enableRotate: true, enablePan: true, enableZoom: true,
    enableDamping: false, dampingFactor: 0.05,
    rotateSpeed: 0.4, panSpeed: 0.6, zoomSpeed: 0.6,
    screenSpacePanning: true,
    minDistance: 0.5, maxDistance: 20000,
    minPolarAngle: 0, maxPolarAngle: Math.PI,
    // ⌃/⌘ turns ROTATE into a pan inside OrbitControls itself; ⌥ is the ground
    // grab (RegimeControls). RIGHT pans; see RegimeControls for why it is
    // re-pushed under ⌃.
    mouseButtons: { LEFT: M.ROTATE, MIDDLE: M.DOLLY, RIGHT: M.PAN },
    touches: { ONE: T.ROTATE, TWO: T.DOLLY_PAN },
  },
  street: {
    enableRotate: true, enablePan: true, enableZoom: false,
    enableDamping: true, dampingFactor: 0.25,
    rotateSpeed: 0.35, panSpeed: 80, zoomSpeed: 1,
    screenSpacePanning: false,                 // pan on the XZ ground plane
    minDistance: 0.5, maxDistance: 0.5,        // locked — look around in place
    minPolarAngle: Math.PI / 2,                // the horizon
    maxPolarAngle: Math.PI * 0.99,             // nearly straight up
    mouseButtons: { LEFT: M.ROTATE, MIDDLE: M.PAN, RIGHT: M.PAN },
    touches: { ONE: T.ROTATE, TWO: T.DOLLY_PAN },
  },
}
REGIMES.playback = { ...REGIMES.orbit }

/** The per-mount keys a caller may set: content scale, never gestures. */
export const REGIME_LIMIT_KEYS = ['minDistance', 'maxDistance', 'minPolarAngle', 'maxPolarAngle', 'minZoom', 'maxZoom']

/**
 * Push a regime onto a live OrbitControls instance (plus any allowed limits).
 * ⛔ Throws on an unknown regime or a non-limit override — a silent default
 * would be a controls definition nobody declared.
 */
export function applyRegime(ctl, name, limits = {}) {
  const r = REGIMES[name]
  if (!r) throw new Error(`[camera] unknown controls regime '${name}'`)
  for (const k of Object.keys(limits)) {
    if (!REGIME_LIMIT_KEYS.includes(k)) throw new Error(`[camera] '${k}' is not a per-mount limit — gestures are fixed per regime`)
  }
  for (const [k, v] of Object.entries(r)) {
    ctl[k] = (k === 'mouseButtons' || k === 'touches') ? { ...v } : v
  }
  for (const [k, v] of Object.entries(limits)) if (v !== undefined) ctl[k] = v
}
