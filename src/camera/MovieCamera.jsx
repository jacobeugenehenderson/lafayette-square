/**
 * MovieCamera — the ONE player of a town's movie: the slab's authored camera path (heroKeyframes + heroMotion),
 * played and never steered. Mounted by an app as <Town>'s sibling (BRIEF-one-movie-driver).
 *
 * It owns: the clock, the start phase, the pose + aim + fov written every frame, the controls' target, and the
 * movie's near plane (the quality profile's `movieNear` — Warden's ruling 2026-09-28: a depth-precision property of
 * the device, not of a town). It does NOT own entering or leaving the movie: an app's tween into the path, its
 * gestures, idle → movie and Stage's scrub stay the app's. An app that tweens into the movie samples the path through
 * `handle.current.pose()`, which reads THIS clock — so the tween lands on the pose the driver then plays.
 * ▶ node checks/claims-one-movie-driver.mjs
 *
 * Props:
 *   keyframes, motion  the path (resolveHeroKeyframes for a slab, the live store in Stage); null = nothing to play
 *   quality            the app's quality profile (src/lib/qualityProfile.js)
 *   active             true (or () => true) while the movie is the shot. Entering seeds the phase; leaving restores the near plane.
 *   start              'random' — a random phase of one cycle, chosen on each entry (a visitor lands somewhere new
 *                      on the operator's path, never outside it) · or () => seconds on the timeline (Stage's playhead)
 *   hold               () => true while the app owns the camera (its tween); the clock keeps running, nothing is written
 *   onTime             (seconds on the timeline) => void, each played frame (Stage's scrub readout)
 *   controlsRef        the app's controls; defaults to R3F's default controls
 *   handle             a ref filled with { pose(outPos, outTgt) → { fov, time } }
 *   framing            true while the town is drawn in the movie shot: the movie's FOCUS is published then
 *                      (src/lib/focusObject.js#movieFocus) — while it plays, and while an app holds it paused on the path
 *                      (Stage's playhead, `start` as a function). Outside the movie shot the depth of field takes the aim.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { heroKeyframeAnim, heroCycleSec, heroClockAt, heroPoseAtTime } from '../preview/heroAnim.js'
import { movieFocus, keyframeFocusIds } from '../lib/focusObject.js'

const _pos = new THREE.Vector3()
const _tgt = new THREE.Vector3()
const _fp = [0, 0, 0], _ft = [0, 0, 0]
// The focus over segment `seg` at path parameter `lam`: the two keys' objects (src/lib/focusObject.js).
function publishFocus(keyframes, seg, lam) {
  const ids = keyframeFocusIds(keyframes), n = ids.length
  movieFocus.on = true; movieFocus.from = ids[seg % n]; movieFocus.to = ids[(seg + 1) % n]; movieFocus.lam = n > 1 ? lam : 0
}

export default function MovieCamera({ keyframes, motion, quality, active, start = 'random', hold, onTime, controlsRef, handle, framing }) {
  if (!Number.isFinite(quality?.movieNear)) throw new Error('[MovieCamera] ⛔ needs `quality` — a profile from src/lib/qualityProfile.js with a movieNear')
  const { camera } = useThree()
  const defaultControls = useThree((s) => s.controls)
  const live = useRef({})
  live.current = { keyframes, motion, active, start, hold, onTime, framing }
  const clock = useRef(0)
  const entered = useRef(false)
  const priorNear = useRef(null)
  // The motion the clock plays: speed is applied to the clock, not inside the path.
  const path = () => {
    const { keyframes: k, motion: m } = live.current
    return k?.length && (k.length < 2 || m?.length > 0) ? { k, m: m ? { length: m.length, mode: m.mode } : null } : null
  }

  // Enter / leave: seed the phase, set / restore the near plane. Called from the frame loop and from pose(), so an
  // app that samples on the very frame it enters sees the seeded phase.
  const sync = () => {
    const a = live.current.active
    const on = !!(typeof a === 'function' ? a() : a) && !!path()
    if (on === entered.current) return
    entered.current = on
    if (on) {
      const { m } = path()
      const s = live.current.start
      clock.current = !m ? 0 : s === 'random' ? Math.random() * heroCycleSec(m) : heroClockAt(m, typeof s === 'function' ? s() : s)
      priorNear.current = camera.near
      if (camera.near !== quality.movieNear) { camera.near = quality.movieNear; camera.updateProjectionMatrix() }
    } else if (priorNear.current != null) {
      camera.near = priorNear.current
      priorNear.current = null
      camera.updateProjectionMatrix()
    }
  }

  const sample = (outPos, outTgt) => {
    const p = path()
    if (!p) return null
    return heroKeyframeAnim(clock.current, p.k, p.m, outPos, outTgt)
  }

  if (handle) handle.current = { pose: (outPos, outTgt) => { sync(); return sample(outPos, outTgt) } }

  // Leaving by unmount restores the near plane too.
  useEffect(() => () => {
    if (priorNear.current != null) { camera.near = priorNear.current; camera.updateProjectionMatrix() }
  }, [camera])

  // Leaving by unmount, or the town out of the movie shot: no movie focus.
  useEffect(() => () => { movieFocus.on = false }, [])

  useFrame((_, delta) => {
    sync()
    if (!entered.current) {
      // Held paused on the path (Stage's playhead): the focus is the path's at that time.
      const p = path(), s = live.current.start
      if (live.current.framing && p && typeof s === 'function' && Number.isFinite(s())) {
        const { seg, lam } = heroPoseAtTime(p.k, p.m, s(), _fp, _ft)
        publishFocus(p.k, seg, lam)
      } else movieFocus.on = false
      return
    }
    clock.current += delta * (live.current.motion?.speed || 1)
    const r = sample(_pos, _tgt)
    if (!r) { movieFocus.on = false; return }
    if (live.current.framing) publishFocus(path().k, r.seg, r.lam)
    else movieFocus.on = false
    live.current.onTime?.(r.time)
    if (live.current.hold?.()) return
    camera.position.copy(_pos)
    if (Math.abs(camera.fov - r.fov) > 0.1) { camera.fov = r.fov; camera.updateProjectionMatrix() }
    const ctl = controlsRef?.current ?? defaultControls
    if (ctl) {
      ctl.target.copy(_tgt)
      // Direct position control: bypass damping so it doesn't fight the path.
      const damp = ctl.enableDamping
      ctl.enableDamping = false
      ctl.update()
      ctl.enableDamping = damp
    } else {
      camera.lookAt(_tgt)
    }
  })
  return null
}
