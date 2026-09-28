/**
 * cameraTween — THE camera tween (BRIEF-town-shot-flight). <Town>'s flight between shots drives it
 * (src/camera/ShotFlight.jsx); Stage's shot glide and the Grove's reframe use it too. Its motion is production's
 * (Scene.jsx CameraRig, the reference feel, retired at the cutover): position, target and fov lerped on the ease, the
 * up vector lerped and normalised (the smooth tilt into a true overhead), and — with `chase` — the destination
 * re-sampled every frame, so a flight into the movie lands on the MOVING path, not a pose sampled at entry.
 * ▶ node checks/claims-one-shot-flight.mjs
 *
 * No React. Construct an instance, call start({...}) when a transition fires, call tick(performance.now()) every
 * frame; the instance writes the interpolated pose via onUpdate. onComplete fires once at t≥1. Allocation-aware:
 * tick() does no allocations on the hot path.
 */
import * as THREE from 'three'
import { easeInOutCubic } from '../lib/ease.js'

const EASES = {
  linear: (t) => t,
  easeInOutCubic,
}

export function createCameraTween() {
  let active = false
  let t0 = 0
  let dur = 1500
  let easeFn = easeInOutCubic

  const fromPos = new THREE.Vector3()
  const fromTarget = new THREE.Vector3()
  let fromFov = 60

  const toPos = new THREE.Vector3()
  const toTarget = new THREE.Vector3()
  let toFov = 60

  // Up-vector lerp (added 2026-06-21 — the camera-SSOT unification). Production
  // smoothly tilts the up-vector into overhead across Hero↔Browse; Stage/Preview
  // used to SNAP it. Now the shared tween lerps + normalizes it so all three get
  // the smooth tilt. `up` is optional on from/to — defaults to [0,1,0], so a
  // caller that doesn't pass it (and ignores the new onUpdate arg) is unchanged.
  const fromUp = new THREE.Vector3(0, 1, 0)
  const toUp = new THREE.Vector3(0, 1, 0)

  const outPos = new THREE.Vector3()
  const outTarget = new THREE.Vector3()
  const outUp = new THREE.Vector3(0, 1, 0)

  let onUpdate = null
  let onComplete = null
  let chase = null
  let label = null
  let lastT = 0, lastE = 0, lastAt = 0

  function start(opts) {
    fromPos.set(opts.from.pos[0], opts.from.pos[1], opts.from.pos[2])
    fromTarget.set(opts.from.target[0], opts.from.target[1], opts.from.target[2])
    fromFov = opts.from.fov
    toPos.set(opts.to.pos[0], opts.to.pos[1], opts.to.pos[2])
    toTarget.set(opts.to.target[0], opts.to.target[1], opts.to.target[2])
    toFov = opts.to.fov
    const fu = opts.from.up || [0, 1, 0]
    const tu = opts.to.up || [0, 1, 0]
    fromUp.set(fu[0], fu[1], fu[2])
    toUp.set(tu[0], tu[1], tu[2])
    dur = opts.duration ?? 1500
    easeFn = EASES[opts.ease] || easeInOutCubic
    onUpdate = opts.onUpdate || null
    onComplete = opts.onComplete || null
    // chase(toPos, toTarget) → { fov } | null: re-sample a MOVING destination every tick (the movie's pose).
    chase = opts.chase || null
    label = opts.label ?? null
    lastT = 0; lastE = 0; lastAt = t0
    t0 = performance.now()
    active = true
  }

  function tick(nowMs) {
    if (!active) return false
    const tRaw = (nowMs - t0) / dur
    const t = tRaw >= 1 ? 1 : tRaw
    const e = easeFn(t)
    lastT = t; lastE = e; lastAt = nowMs
    if (chase) { const r = chase(toPos, toTarget); if (r && Number.isFinite(r.fov)) toFov = r.fov }
    outPos.lerpVectors(fromPos, toPos, e)
    outTarget.lerpVectors(fromTarget, toTarget, e)
    outUp.lerpVectors(fromUp, toUp, e).normalize()   // smooth up-tilt (matches production)
    const fov = fromFov + (toFov - fromFov) * e
    if (onUpdate) onUpdate(outPos, outTarget, fov, e, outUp)
    if (t >= 1) {
      active = false
      const cb = onComplete
      onComplete = null
      if (cb) cb()
    }
    return true
  }

  // Stop where it is (a gesture interrupted it): no onComplete.
  function cancel() {
    active = false
    onComplete = null
    chase = null
  }

  return {
    start,
    tick,
    cancel,
    isActive: () => active,
    getLabel: () => label,
    progress: () => ({ t: lastT, eased: lastE, duration: dur, at: lastAt }),
  }
}
