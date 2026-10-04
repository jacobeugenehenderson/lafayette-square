/**
 * ShotFlight — <Town> flies its own shot changes (BRIEF-town-shot-flight, 2026-09-28). Mounted once, in Town.
 *
 * WHY. The old player flew hero → plan in one continuous move; every app that drew a town through <Town> alone CUT,
 * because the move lived in the app. Now the town answers both halves: WHERE each shot puts the camera, and HOW the
 * camera gets there — production's move (Scene.jsx CameraRig, the reference feel): transitions.js durations keyed by
 * the shot entered, easeInOutCubic, the up vector tilting into a true overhead, a chase into the MOVING movie pose.
 * ▶ node checks/claims-one-shot-flight.mjs · node checks/claims-a-shot-change-flies.mjs
 *
 * DESTINATIONS (the town's, never the app's):
 *   movie  the movie's own pose on MovieCamera's clock, re-sampled every frame (it lands on the path as it plays)
 *   plan   ENTERING: the town's Browse frame (src/camera/browseFrame.js — authored in Stage, else the town's disc,
 *          said), a square fitted whole into the free region (Jacob, 2026-10-04: the frame is where the plan opens).
 *          A frameKey CHANGE (a category or a search chosen): the frame of its places (frameMode: 'densest' —
 *          frameDensest's cluster, the default · 'all' — every placed member, frameAll), the lit places, else every
 *          listed place. No placed place → back to the Browse frame, said. Under the town's browseHeading; a true
 *          overhead on landing.
 *   street the eye at `streetAt`, 5′8″ above the drawn ground (utils/elevation#streetEyeY), looking north
 *
 * THE APP'S LINKS (agreed with Quire, 2026-09-28):
 *   flight       true: fly · 'cut': land at once on the destination · false: hands off — the app places the camera
 *                itself (Stage, ruled 2026-09-28)
 *   viewInset    { top, right, bottom, left } CSS px of the canvas the app's UI covers; applied as a camera VIEW
 *                OFFSET so plan and street frame into the free region. The movie ignores it (full frame). A flight
 *                eases the offset on the camera's own curve; a change with no shot change re-fits at once.
 *   flightRef    { from, to, t, eased, duration, at, landed, interrupted } — `at` is the performance.now() of the frame
 *                that computed t. Set at t = 0 in a layout effect when the shot
 *                changes (before the first painted frame), then every frame. `eased` is the camera's own curve.
 *   onFlightEnd  (f) => void, once: landed, or interrupted (a pointerdown / wheel on the canvas ends it where it is).
 *
 * The controls are the app's (RegimeControls, one regime per shot). While flying they are held off every frame and
 * the camera is aimed with lookAt — OrbitControls.update() reprojects around `up` and flips the camera while up
 * rotates (the SC.5 lookAt flip). On landing they take the camera back, enabled unless the shot is playback.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createCameraTween } from './cameraTween.js'
import { transitionMs } from './transitions.js'
import { framePlaces } from '../lib/frameDensest.js'
import { planAltitude, insetOffset } from './planPose.js'
import { browseUpFromHeading, bearingOf } from '../lib/browseHeading.js'
import { getSceneStencil } from '../components/sceneStencilState.js'
import { browseSquare, browseSquareAltitude } from './browseFrame.js'
import { streetEyeY } from '../utils/elevation'
import { SHOTS_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'
import { prefersReducedMotion } from '../lib/reducedMotion.js'

// transitions.js is keyed by the production vocabulary (the shot ENTERED).
const ENTRY = { movie: 'hero', plan: 'browse', street: 'street' }
const PLAYBACK = 'movie'
const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }
const insetKey = (i) => (i ? `${i.top | 0},${i.right | 0},${i.bottom | 0},${i.left | 0}` : '0,0,0,0')

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _fwd = new THREE.Vector3()
const _warned = new Set()

export default function ShotFlight({ shot, flight = true, streetAt, viewInset, flightRef, onFlightEnd, movieHandle, holdRef, scene, places, placeIds, frameMode = 'densest',
  frameKey, onFramed, planHeading = 'town', bearingRef }) {
  if (flight !== true && flight !== false && flight !== 'cut') throw new Error(`[Town] ⛔ flight must be true, 'cut' or false (got ${flight})`)
  const following = planHeading && typeof planHeading === 'object'
  if (following ? !(planHeading.follow && 'current' in planHeading.follow) : planHeading !== 'town' && planHeading !== 'north') {
    throw new Error(`[Town] ⛔ planHeading must be 'town', 'north' or { follow: headingRef } (got ${JSON.stringify(planHeading)})`)
  }
  // The heading mode, as a value: a new { follow } object each render is the same mode while it names the same ref.
  const headingMode = following ? planHeading.follow : planHeading
  if (shot === 'street' && flight !== false && !(Array.isArray(streetAt) && streetAt.length === 2 && streetAt.every(Number.isFinite))) {
    throw new Error('[Town] ⛔ shot="street" needs streetAt={[x, z]} — the eye stands at a point the app chooses (a tap, a place)')
  }
  const { camera, size, gl } = useThree()
  const getControls = useThree((s) => s.get)
  const tween = useRef(null)
  if (!tween.current) tween.current = createCameraTween()
  const live = useRef({})
  live.current = { shot, flight, streetAt, viewInset, flightRef, onFlightEnd, scene, places, placeIds, frameMode, size, onFramed, planHeading }
  const prev = useRef(null)            // the last shot this component saw
  const pending = useRef(null)         // { shot, landed }: a cut whose destination is not known yet — landed when placed
  const flying = useRef(null)          // { from, to, toUp, fromOff, toOff }
  const off = useRef({ x: 0, y: 0 })   // the view offset now, CSS px
  const lastInset = useRef(null)
  const planOn = useRef('home')       // what the plan is framing: 'home' (the Browse frame) or 'places' (a frameKey move)
  holdRef.current = () => !!flying.current

  const controls = () => getControls().controls
  const report = (f) => { if (live.current.flightRef) live.current.flightRef.current = f }
  const end = (f) => { report(f); live.current.onFlightEnd?.(f) }

  // The view offset that centres the frame in the free region; the movie is full frame.
  const offsetFor = (s) => {
    return insetOffset(s === PLAYBACK ? ZERO : { ...ZERO, ...(live.current.viewInset || {}) })
  }
  const applyOffset = (o) => {
    const { width: W, height: H } = live.current.size
    off.current = o
    if (Math.abs(o.x) < 0.5 && Math.abs(o.y) < 0.5) { if (camera.view?.enabled) camera.clearViewOffset() }
    else camera.setViewOffset(W, H, o.x, o.y, W, H)
  }

  // Where shot `s` puts the camera: { pos, target, fov, up, chase?, overhead? } — or null when it cannot be known yet.
  // The plan's up vector: the town's authored browseHeading · north · or, FOLLOWING, the reader's true heading (the
  // direction they face, from the app's compass; null — no sensor, no permission — holds north up).
  const followHeading = () => {
    const h = live.current.planHeading?.follow?.current
    return Number.isFinite(h) ? h : 0
  }
  const planUp = () => {
    const ph = live.current.planHeading
    if (ph && typeof ph === 'object') return browseUpFromHeading(followHeading())
    return ph === 'north' ? browseUpFromHeading(0) : browseUpFromHeading(live.current.scene?.browseHeading?.values?.value ?? 0)
  }
  const destination = (s) => {
    const { scene: sc, size: { width: W, height: H } } = live.current
    const v = sc?.shots?.values || {}
    if (s === PLAYBACK) {
      const r = movieHandle.current?.pose(_p, _t)
      if (!r) return null
      return { pos: _p.toArray(), target: _t.toArray(), fov: r.fov, up: [0, 1, 0],
        chase: (toPos, toTarget) => movieHandle.current?.pose(toPos, toTarget) }
    }
    const i = { ...ZERO, ...(live.current.viewInset || {}) }
    if (s === 'plan') {
      const stencil = getSceneStencil()
      const fov = v.browse?.fov ?? SHOTS_FLAT_DEFAULTS.browse.fov
      const home = () => {
        const sq = browseSquare(sc?.browseFrame, stencil, fov, 'town')
        if (!sq) return null
        const alt = browseSquareAltitude(sq.half, { fov, W, H, inset: i })
        return { pos: [sq.x, alt, sq.z + 1], target: [sq.x, 0, sq.z], fov, up: planUp(), overhead: true }
      }
      if (planOn.current === 'home') return home()
      if (!stencil) return null
      const pad = v.browse?.padding ?? SHOTS_FLAT_DEFAULTS.browse.padding
      const ids = live.current.placeIds || []
      const frame = live.current.places ? framePlaces(live.current.places, ids, stencil, live.current.frameMode) : null
      if (!frame) {
        const why = `${stencil.center}:${ids.length}`
        if (!_warned.has(why)) { _warned.add(why); console.warn(`[Town] plan: no listed place has a building in this town (${ids.length} ids) — the plan goes back to its Browse frame`) }
        // The disclosure still names every id: none has a place inside the disc (the frames' own partition).
        const at = (id) => (id == null ? null : live.current.places?.get(id))
        const outside = ids.filter((id) => at(id) && Math.hypot(at(id).x - stencil.center[0], at(id).z - stencil.center[1]) > stencil.radius)
        const d = home()
        return d && { ...d, frame: { x: d.target[0], z: d.target[2], radius: 0, placed: 0, of: ids.length,
          outside, unplaced: ids.filter((id) => !at(id)).map((id) => id ?? null) } }
      }
      const alt = planAltitude(frame.radius, { fov, pad, W, H, inset: i })
      return { pos: [frame.x, alt, frame.z + 1], target: [frame.x, 0, frame.z], fov, up: planUp(), overhead: true, frame }
    }
    const [x, z] = live.current.streetAt
    const y = streetEyeY(x, z, v.street?.eyeHeight ?? SHOTS_FLAT_DEFAULTS.street.eyeHeight)
    return { pos: [x, y, z], target: [x, y, z - 0.5], fov: v.street?.fov ?? SHOTS_FLAT_DEFAULTS.street.fov, up: [0, 1, 0] }
  }

  // Put the camera on a destination and hand the controls back.
  const land = (s, d) => {
    const ctl = controls()
    camera.up.set(...d.up)
    const tgt = _t.set(...d.target)
    if (d.overhead) {
      const dist = camera.position.distanceTo(tgt) || _p.set(...d.pos).distanceTo(tgt)
      camera.position.set(tgt.x, tgt.y + dist, tgt.z + 0.01)   // a true overhead; +0.01 z breaks the straight-down tie
    }
    if (Math.abs(camera.fov - d.fov) > 0.01) camera.fov = d.fov
    camera.lookAt(tgt)
    camera.updateProjectionMatrix()
    if (ctl) {
      ctl.target.copy(tgt)
      ctl.enabled = s !== PLAYBACK
      if (ctl.enabled) ctl.update()
    }
  }
  // Land at once. A destination not known yet (the disc not published, the movie's path not loaded) waits, and its
  // `landed` is reported when it is placed — never before, and never for a shot the town has already left.
  const cut = (s, landed) => {
    const d = destination(s)
    if (!d) { pending.current = { shot: s, landed }; if (landed) report({ ...landed, t: 0, eased: 0, landed: false }); return false }
    pending.current = null
    if (s !== PLAYBACK) { camera.position.set(...d.pos); land(s, d) }   // the movie places itself (MovieCamera)
    applyOffset(offsetFor(s))
    framed(d)
    if (landed) end(landed)
    return true
  }
  // The plan says what it framed, and what it could not put down (the frame's disclosure).
  const framed = (d) => {
    const f = d?.frame
    if (!f) return
    live.current.onFramed?.({ x: f.x, z: f.z, radius: f.radius, placed: f.placed, of: f.of, outside: f.outside, unplaced: f.unplaced })
  }

  // ONE flight, whatever asked for it: a shot change, a re-frame (frameKey), a turn (planHeading). Under "reduce
  // motion" it is a cut. `d` is the destination; `duration` comes from transitions.js.
  const fly = (from, to, d, duration) => {
    const landed = { from, to, t: 1, eased: 1, duration: 0, landed: true, interrupted: false }
    if (prefersReducedMotion()) {
      if (to !== PLAYBACK) { camera.position.set(...d.pos); land(to, d) }
      applyOffset(offsetFor(to)); framed(d); end(landed)
      return
    }
    const ctl = controls()
    const fromTarget = ctl ? ctl.target.toArray()
      : camera.getWorldDirection(_fwd).multiplyScalar(100).add(camera.position).toArray()
    const fromOff = { ...off.current }, toOff = offsetFor(to)
    flying.current = { from, to, d, fromOff, toOff }
    framed(d)
    report({ from, to, t: 0, eased: 0, duration, landed: false, interrupted: false })
    tween.current.start({
      from: { pos: camera.position.toArray(), target: fromTarget, fov: camera.fov, up: camera.up.toArray() },
      to: { pos: d.pos, target: d.target, fov: d.fov, up: d.up },
      duration, ease: 'easeInOutCubic', label: `→${to}`, chase: d.chase,
      onUpdate: (p, t, fov, e, up) => {
        camera.position.copy(p)
        if (up.lengthSq() > 1e-6) camera.up.copy(up)
        camera.lookAt(t)
        if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix() }
        const c = controls()
        if (c) c.target.copy(t)
        const fl = flying.current
        applyOffset({ x: fromOff.x + ((fl?.toOff ?? toOff).x - fromOff.x) * e, y: fromOff.y + ((fl?.toOff ?? toOff).y - fromOff.y) * e })
      },
      onComplete: () => {
        const fl = flying.current
        flying.current = null
        land(to, fl.d.chase ? { ...fl.d, target: controls()?.target.toArray() ?? fl.d.target } : fl.d)
        applyOffset(fl.toOff)
        end({ ...landed, duration })
      },
    })
  }

  // ── a shot change: fly, cut, or keep hands off ────────────────────────────────────
  useLayoutEffect(() => {
    const from = prev.current
    prev.current = shot
    if (from === shot) return
    planOn.current = 'home'
    const { flight: mode } = live.current
    if (tween.current.isActive()) tween.current.cancel()
    flying.current = null
    pending.current = null
    const landed = { from, to: shot, t: 1, eased: 1, duration: 0, landed: true, interrupted: false }
    if (mode === false) { end(landed); return }
    if (from == null || mode === 'cut') { cut(shot, landed); return }

    const d = destination(shot)
    if (!d) { cut(shot, landed); return }
    fly(from, shot, d, transitionMs(ENTRY[shot]))
  }, [shot])

  // ── the plan's ONE move: re-frame on a frameKey change (never on litIds alone — typing never moves the camera) ──
  const lastKey = useRef(frameKey)
  useLayoutEffect(() => {
    if (Object.is(lastKey.current, frameKey)) return
    lastKey.current = frameKey
    if (shot !== 'plan' || live.current.flight === false) return
    planOn.current = 'places'
    const d = destination('plan')
    if (!d) return
    if (tween.current.isActive()) tween.current.cancel()
    flying.current = null
    fly('plan', 'plan', d, transitionMs('frame'))
  }, [frameKey])

  // ── the rose: turn the plan to the town's heading or to north, keeping what the reader is looking at ──
  const lastHeading = useRef(headingMode)
  useLayoutEffect(() => {
    if (lastHeading.current === headingMode) return
    lastHeading.current = headingMode
    if (shot !== 'plan' || live.current.flight === false || flying.current) return
    const ctl = controls()
    const target = ctl ? ctl.target.toArray() : [camera.position.x, 0, camera.position.z]
    fly('plan', 'plan', { pos: camera.position.toArray(), target, fov: camera.fov, up: planUp(), overhead: true }, transitionMs('frame'))
  }, [headingMode])

  // ── an inset change with no shot change re-fits at once ──────────────────────────
  useEffect(() => {
    const k = insetKey(viewInset)
    if (lastInset.current === null) { lastInset.current = k; return }
    if (k === lastInset.current) return
    lastInset.current = k
    if (flying.current) { flying.current.toOff = offsetFor(flying.current.to); return }
    if (live.current.flight === false) return
    if (shot === PLAYBACK) applyOffset(offsetFor(shot))
    else cut(shot, null)
  })

  // A resized canvas: the offset is stored against the full size, so re-apply it.
  useEffect(() => { applyOffset(off.current) }, [size.width, size.height])

  // ── a gesture ends a flight where it is ──────────────────────────────────────────
  useEffect(() => {
    const el = gl.domElement
    const stop = () => {
      const fl = flying.current
      if (!fl || !tween.current.isActive()) return
      const { t, eased, duration } = tween.current.progress()
      tween.current.cancel()
      flying.current = null
      applyOffset(fl.toOff)
      const ctl = controls()
      if (ctl) { ctl.enabled = fl.to !== PLAYBACK; if (ctl.enabled) ctl.update() }
      end({ from: fl.from, to: fl.to, t, eased, duration, landed: true, interrupted: true })
    }
    el.addEventListener('pointerdown', stop, { capture: true })
    el.addEventListener('wheel', stop, { capture: true, passive: true })
    return () => { el.removeEventListener('pointerdown', stop, { capture: true }); el.removeEventListener('wheel', stop, { capture: true }) }
  }, [gl])

  useFrame(() => {
    if (pending.current && !flying.current) cut(pending.current.shot, pending.current.landed)
    // FOLLOWING: screen-up is the reader's heading every frame — no flight (the app's heading is already smoothed; a
    // live follow must not ease). Entering and leaving follow are flights (the planHeading effect).
    if (following && shot === 'plan' && !flying.current && live.current.flight !== false) {
      const [ux, uy, uz] = browseUpFromHeading(followHeading())
      if (Math.abs(camera.up.x - ux) > 1e-6 || Math.abs(camera.up.z - uz) > 1e-6) {
        const ctl = controls()
        camera.up.set(ux, uy, uz)
        camera.lookAt(ctl ? ctl.target : _t.set(camera.position.x, 0, camera.position.z))
        if (ctl?.enabled) ctl.update()
      }
    }
    if (flying.current) {
      const ctl = controls()
      if (ctl) ctl.enabled = false                       // held off every frame, as production does
      tween.current.tick(performance.now())
      if (flying.current) {
        const { t, eased, duration, at } = tween.current.progress()
        report({ from: flying.current.from, to: flying.current.to, t, eased, duration, at, landed: false, interrupted: false })
      }
    }
    // LAST, so it is what this frame draws: the compass bearing of screen-up (0 = north up, 90 = east up) — the rose.
    if (bearingRef) bearingRef.current = bearingOf(camera.getWorldDirection(_fwd), camera.up)
  })
  return null
}
