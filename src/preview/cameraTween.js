/**
 * cameraTween — pure-JS camera transition state machine.
 *
 * Extracted from src/components/Scene.jsx (CameraRig, lines 482–775).
 * The legacy app keeps the same logic inline; this module is the
 * portable form for /preview and (eventually) /stage to share.
 *
 * No React. Construct an instance, call start({...}) when a transition
 * fires, call tick(performance.now()) every frame; the instance writes
 * the interpolated pose via onUpdate. onComplete fires once at t≥1.
 *
 * Allocation-aware: reuses internal Vector3 scratchpads. tick() does
 * no allocations on the hot path.
 */
import * as THREE from 'three'

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

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

  const outPos = new THREE.Vector3()
  const outTarget = new THREE.Vector3()

  let onUpdate = null
  let onComplete = null
  let label = null

  function start(opts) {
    fromPos.set(opts.from.pos[0], opts.from.pos[1], opts.from.pos[2])
    fromTarget.set(opts.from.target[0], opts.from.target[1], opts.from.target[2])
    fromFov = opts.from.fov
    toPos.set(opts.to.pos[0], opts.to.pos[1], opts.to.pos[2])
    toTarget.set(opts.to.target[0], opts.to.target[1], opts.to.target[2])
    toFov = opts.to.fov
    dur = opts.duration ?? 1500
    easeFn = EASES[opts.ease] || easeInOutCubic
    onUpdate = opts.onUpdate || null
    onComplete = opts.onComplete || null
    label = opts.label ?? null
    t0 = performance.now()
    active = true
  }

  function tick(nowMs) {
    if (!active) return false
    const tRaw = (nowMs - t0) / dur
    const t = tRaw >= 1 ? 1 : tRaw
    const e = easeFn(t)
    outPos.lerpVectors(fromPos, toPos, e)
    outTarget.lerpVectors(fromTarget, toTarget, e)
    const fov = fromFov + (toFov - fromFov) * e
    if (onUpdate) onUpdate(outPos, outTarget, fov, e)
    if (t >= 1) {
      active = false
      const cb = onComplete
      onComplete = null
      if (cb) cb()
    }
    return true
  }

  function cancel() {
    active = false
    onComplete = null
  }

  return {
    start,
    tick,
    cancel,
    isActive: () => active,
    getLabel: () => label,
  }
}
