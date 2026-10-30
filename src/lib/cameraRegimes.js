/**
 * cameraRegimes — THE ONE HOME of how a camera is driven, for every runtime
 * (Stage/Cartograph, Extent, Preview, production `Scene.jsx`, the lab, and the
 * tool viewers). BRIEF-camera-regimes; ROADMAP H-7.
 *
 * ⭐ A runtime CHOOSES a regime; it never defines controls itself. The React
 * mount is `src/components/RegimeControls.jsx`; production, which drives one
 * controls instance imperatively across its modes, calls `applyRegime`.
 * `checks/claims-the-camera-has-one-definition.mjs` fails on any other controls mount.
 *
 *   plan     — 2D. Straight overhead (the Designer's ortho, the Extent tool,
 *              the Grove's overhead view): pan + zoom, NO rotate.
 *   overhead — the town's plan shot (Browse and Society in every app, Stage's
 *              Browse): the plan, plus a LEAN of up to PLAN_MAX_LEAN_DEG off
 *              straight down, the map tilted like a surface (Jacob, 2026-10-14;
 *              it was `plan`, "Browse is already correct", 2026-09-26). The lean
 *              is RegimeControls' own gesture, never OrbitControls' rotate: it
 *              tips the camera back along the heading (its horizontal `up`, the
 *              rose's), so it can never turn the map. ⛔ OrbitControls measures
 *              its polar angle about the camera's CURRENT `up` (re-read every
 *              update()): in the plan that is the heading, and its clamp threw
 *              a straight-down camera to 60° (measured, 2026-10-14). Phone: two
 *              fingers up or down (a pinch still zooms); mouse: right-drag. One
 *              finger and left-drag still pan. ▶ node checks/claims-a-lean-never-turns-the-map.mjs
 *   orbit    — 3D. Stage and everything beyond it: drag orbits, ⌥-drag grabs
 *              the ground, ⇧-drag AIMS (turns the camera in place, #aimInPlace),
 *              ⌘/⌃-drag pans, middle-drag dollies, wheel zooms — the same
 *              buttons, keys and limits in every app.
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
const _derivedSaid = new Set()

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
  // Said once per disc: a movie nobody authored is a reconstruction, and the operator must be able to tell.
  const said = `${c[0]},${c[1]},${r}`
  if (!_derivedSaid.has(said)) {
    _derivedSaid.add(said)
    console.warn(`[camera] no hero keyframes: the movie is DERIVED from the scene disc (centre ${c.map(Math.round)}, radius ${Math.round(r)} m), not authored`)
  }
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
/**
 * How far the town's plan may lean off straight down, in degrees. ⚠️ THE NUMBER IS NOT ESTABLISHED: it is a property of
 * the kit's tree drawing (the overhead discs are flat bands, so leaned far they read as stacked plates) and the same in
 * every town, never a town's. 30 is a neutral placeholder until Jacob sets it by eye in Preview at the close camera.
 */
export const PLAN_MAX_LEAN_DEG = 30
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
// The plan, leaning: rotate on, polar from straight down to the lean; the azimuth is pinned per frame (RegimeControls).
// OrbitControls keeps the plan's pan and zoom; the lean is RegimeControls' (right-drag, two fingers vertically), so
// the right button does nothing in OrbitControls and two fingers only dolly there (DOLLY_ROTATE with rotate off).
REGIMES.overhead = {
  ...REGIMES.plan,
  mouseButtons: { LEFT: M.PAN, MIDDLE: M.DOLLY, RIGHT: null },
  touches: { ONE: T.PAN, TWO: T.DOLLY_ROTATE },
}
REGIMES.playback = { ...REGIMES.orbit }

// ── The aimer (the orbit regime's ⇧-drag) ───────────────────────────────────
// ⭐ GRAB-LOOK, ORIENTATION ONLY (Jacob, 2026-10-29; registry r-plant-it-and-point-it): the camera turns IN PLACE (yaw
// about world up, pitch about its own right axis, never a roll) so the direction grabbed at the press stays under the
// cursor. A pure rotation sees only that DIRECTION, never the depth of what is under it, so nothing is picked. Solved
// from the two rays, never from pixel deltas (a delta solve drifts toward the frame's edge).
// The pitch is held inside the MOUNT's own polar limits (OrbitControls' polar about the target is π/2 + pitch), and
// short of the zenith and nadir by OrbitControls' own Spherical.makeSafe margin, so its update() never moves the camera.
// ▶ node checks/claims-the-aimer-turns-in-place.mjs
const AIM_EPS = 1e-6                         // three's Spherical.makeSafe EPS: the margin OrbitControls itself keeps
const _aimL = new THREE.Vector3(), _aimV = new THREE.Vector3(), _aimX = new THREE.Vector3(1, 0, 0)
/**
 * The camera's turn that puts world direction `grabDir` under screen point `ndc`, its position unchanged.
 * @param camera   a PerspectiveCamera whose `up` is world +Y (projection matrices current)
 * @param grabDir  unit world direction grabbed at the press
 * @param ndc      { x, y } the cursor now, in normalised device coordinates
 * @param polarMin, polarMax  the live controls' polar limits (the mount's own)
 * @returns { pitch, yaw } — Euler 'YXZ', roll 0 — or { skip } naming why nothing may move: an `up` that is not world +Y,
 *   a grab within float of vertical (no yaw), or a cursor no pitch can reach. ⛔ A skip moves nothing; it is never clamped
 *   or flung into a guess.
 */
export function aimInPlace(camera, grabDir, ndc, polarMin, polarMax) {
  if (!camera.isPerspectiveCamera) return { skip: 'the aimer turns a perspective camera only' }
  if (Math.abs(camera.up.x) > AIM_EPS || Math.abs(camera.up.y - 1) > AIM_EPS || Math.abs(camera.up.z) > AIM_EPS) {
    return { skip: `camera.up is (${camera.up.toArray().map(v => +v.toFixed(4))}), not world +Y: a turn would roll it` }
  }
  if (Math.hypot(grabDir.x, grabDir.z) < AIM_EPS) return { skip: 'the grab is straight up or down: no heading to turn to' }
  // The cursor's ray in the camera's own frame.
  _aimL.set(ndc.x, ndc.y, 0.5).applyMatrix4(camera.projectionMatrixInverse).normalize()
  // Pitch: (Rx(θ)·l).y = g.y, i.e. A·cosθ + B·sinθ = g.y — the root nearest the camera's own pitch.
  const A = _aimL.y, B = -_aimL.z, R = Math.hypot(A, B)
  if (Math.abs(grabDir.y) > R) return { skip: 'no pitch puts the grab under the cursor here' }
  const base = Math.atan2(B, A), s = Math.acos(grabDir.y / R)
  const now = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').x
  const wrap = (t) => Math.atan2(Math.sin(t), Math.cos(t))
  const r1 = wrap(base + s), r2 = wrap(base - s)
  let pitch = Math.abs(r1 - now) <= Math.abs(r2 - now) ? r1 : r2
  pitch = THREE.MathUtils.clamp(pitch, Math.max(polarMin, AIM_EPS) - Math.PI / 2, Math.min(polarMax, Math.PI - AIM_EPS) - Math.PI / 2)
  // Yaw: turn the pitched ray's heading onto the grab's.
  _aimV.copy(_aimL).applyAxisAngle(_aimX, pitch)
  if (Math.hypot(_aimV.x, _aimV.z) < AIM_EPS) return { skip: 'the cursor ray is vertical at this pitch: no heading to turn' }
  return { pitch, yaw: Math.atan2(grabDir.x, grabDir.z) - Math.atan2(_aimV.x, _aimV.z) }
}
const _aimE = new THREE.Euler(), _aimF = new THREE.Vector3()
/** Put an aim on live controls: the camera turns, and `target` turns with it at `dist`, so OrbitControls' update() agrees. */
export function applyAim(controls, turn, dist) {
  const cam = controls.object
  cam.quaternion.setFromEuler(_aimE.set(turn.pitch, turn.yaw, 0, 'YXZ'))
  controls.target.copy(cam.position).addScaledVector(_aimF.set(0, 0, -1).applyQuaternion(cam.quaternion), dist)
  controls.update()
}

// ── The overhead regime's zoom rule ─────────────────────────────────────────
/**
 * Whether a detail of size `sizeM` at a bounding sphere resolves on screen in the OVERHEAD regime (Browse, Society):
 * inside the view (`frustum`, the camera's own) AND spanning at least `samples` pixels at the sphere's own distance.
 * ⭐ Jacob, 2026-10-29: "We will though need to see stones when the user pinches/zooms in to the map; but only at the LoD
 * for the elevation and for the area inside the camera view" — ruled to be metres per pixel. The revetment asks it per
 * chunk with the stone's own size (d50) and the drape's own sampling rule (revetmentDrape.js#VERTS_PER_WAVELENGTH).
 * Metres per pixel is `labelLod.js#metersPerPixel`'s measure taken at the detail's own distance from the camera rather
 * than the camera's height, and with none of its fallbacks: a missing viewport height, position or fov THROWS.
 * ⚠️ OVERHEAD ONLY, AND WHY: looking down, every detail in view is about as far as the ground under the camera, so one
 * metres-per-pixel answers for the view; near-horizontal (the movie, Street) it varies from metres to kilometres across
 * one frame (labelLod's own caveat), and the budget there is the near layer's NEAR_RADIUS_M. ⚠️ KNOWN OPEN: two
 * selections stand until Street's own brief rules one for the near-horizontal regimes.
 */
export function overheadResolves(camera, viewportHeightPx, frustum, center, radius, sizeM, samples) {
  if (!(viewportHeightPx > 0)) throw new Error(`[camera] overheadResolves: no viewport height (${viewportHeightPx})`)
  if (!(sizeM > 0) || !(samples > 0)) throw new Error(`[camera] overheadResolves: a detail needs a size and a sample count (${sizeM}, ${samples})`)
  if (!frustum.intersectsSphere({ center, radius })) return false
  let mpp
  if (camera.isOrthographicCamera) mpp = (camera.top - camera.bottom) / camera.zoom / viewportHeightPx
  else {
    if (!(camera.fov > 0) || !camera.position) throw new Error(`[camera] overheadResolves: a perspective camera with no fov or position`)
    const dist = Math.max(0, camera.position.distanceTo(center) - radius)
    mpp = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / viewportHeightPx
  }
  return sizeM / mpp >= samples
}

/** The per-mount keys a caller may set: content scale, never gestures. */
// ── The overhead near plane ──────────────────────────────────────────────────
const _nd = new THREE.Vector3(), _nw = new THREE.Vector3()
/**
 * ⭐ THE OVERHEAD CAMERA'S NEAR PLANE COMES FROM WHERE IT IS (BRIEF-the-overhead-camera-resolves-its-ground, 2026-10-30).
 * A linear depth buffer's step at view depth z is z² / (near · 2²⁴): with near 1 m a phone's plan (6.5 km up, Society
 * 19.7 km) stepped 2.5 m and 23 m, so the bed drawn 0.102 m under the water won the depth test and the harbour read as
 * sand. Nothing drawn is nearer than the plane y = `topY` (the town's drawn top, Town.jsx#TownOptics), so the near is the
 * smallest view depth at which that plane meets the frustum: the min over the frustum's four corner rays that point
 * down (depth to a plane is linear-fractional in the ray, so its minimum over the frustum is at a corner), which holds
 * at any lean and through a flight's tilt. ⛔ `floorM` (the canvas's own near) when the camera is not above `topY`, no
 * corner ray points down, or `topY` is unknown — never a guess. ▶ node checks/claims-the-overhead-camera-resolves-its-ground.mjs
 */
export function overheadNear(camera, topY, floorM) {
  if (!(floorM > 0)) throw new Error(`[camera] overheadNear needs the canvas's near as its floor (got ${floorM})`)
  if (!camera?.isPerspectiveCamera || !Number.isFinite(topY)) return floorM
  camera.updateMatrixWorld()
  const h = camera.matrixWorld.elements[13] - topY
  if (!(h > floorM)) return floorM
  let z = Infinity
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    _nd.set(x, y, -1).applyMatrix4(camera.projectionMatrixInverse).normalize()   // a corner ray, in view space
    _nw.copy(_nd).transformDirection(camera.matrixWorld)                          // the same ray, in the world
    if (_nw.y < -1e-9) z = Math.min(z, h * _nd.z / _nw.y)                        // view depth where it meets y = topY
  }
  return Number.isFinite(z) ? Math.max(floorM, z) : floorM
}

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
