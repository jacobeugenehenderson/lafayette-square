import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { INSTANCE, moduleOn } from '../instance.js'
import { deviceQuality } from '../lib/qualityProfile.js'
import { framedPresence } from '../lib/framedPresence.js'
import { FRAMED } from '../hooks/useCamera'
import { browseAltitude } from '../lib/browseAltitude.js'
import { SHOT_TRANSITION_MS } from '../camera/transitions.js'
import Town from './Town.jsx'
import { SHOT_KEY } from './townContext.js'
import LandmarkMarkers from './LandmarkMarkers.jsx'
import { streetEyeY } from '../utils/elevation'
import UserDot from './UserDot'
import CourierDots from './CourierDots'
import useCamera from '../hooks/useCamera'
import useUserLocation from '../hooks/useUserLocation'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useListings from '../hooks/useListings'
import R3FErrorBoundary from './R3FErrorBoundary'
import { useSceneJson } from '../lib/useSceneJson.js'
import MovieCamera from '../camera/MovieCamera.jsx'
import { browseUpFromHeading } from '../lib/browseHeading.js'
import { SHOTS_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'
import { resolveHeroKeyframes, useSceneStencil, applyRegime } from '../lib/cameraRegimes.js'
import RegimeControls from './RegimeControls.jsx'


// ── Helpers ──────────────────────────────────────────────────────────────────

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ── Hero framing ─────────────────────────────────────────────────────────────
// The hero camera plays the authored heroKeyframes through MovieCamera
// (src/camera/MovieCamera.jsx) — the one driver Stage and Preview mount too.
// Each keyframe carries its own aim; a town with none gets the opening view derived from its own disc (src/lib/cameraRegimes.js). ⛔ No
// subject, no Lafayette Square pose: HERO_CENTER / HERO_TARGET and the
// subject-centred derivedHeroPose are gone (BRIEF-camera-regimes, H-7).
const _heroPos = new THREE.Vector3()
const _heroTgt = new THREE.Vector3()

// Hero→Browse transition duration (ms). 1.5s read as abrupt for the overhead
// tilt; 2.4s lets it ease into the map as a deliberate "settle" move. Sourced
// from the camera-SSOT (transitions.js) so Stage/Preview move identically.
const BROWSE_TRANS_MS = SHOT_TRANSITION_MS.browse

// ⭐ Each camera mode is one of the shared regimes (src/lib/cameraRegimes.js) —
// the SAME definitions Stage and Preview mount. Production drives one controls
// instance across modes (its transitions relax and restore it), so it applies
// them imperatively. Hero is playback: the keyframes own the camera and the
// controls take no input (a drag or wheel leaves for Browse — see onMove/onWheel).
const REGIME_OF_MODE = { hero: 'playback', browse: 'plan', planetarium: 'street' }
function applyMode(ctl, mode) {
  const regime = REGIME_OF_MODE[mode]
  if (!regime) throw new Error(`[camera] production mode '${mode}' has no regime`)
  applyRegime(ctl, regime)
  ctl.enabled = regime !== 'playback'
}

function relaxConstraints(ctl) {
  ctl.enableRotate = false
  ctl.enablePan = false
  ctl.enableZoom = false
  ctl.minDistance = 0
  ctl.maxDistance = Infinity
  ctl.minPolarAngle = 0
  ctl.maxPolarAngle = Math.PI
}

// ── Sheet ground ─────────────────────────────────────────────────────────────
// While the embed sheet is up (`?layer=player`), the scene paints NOTHING but
// the sheet's own colour.
//
// ⭐ WHY, and it is not the obvious reason. The sheet cannot be made opaque —
// a fully opaque cover is occlusion-culled by Chrome exactly like a hidden
// canvas, and coming back costs a 5.6s blocked frame (`index.css .embed-sheet`,
// measured 5624ms vs 224ms). So the sheet stays at 0.95 and the five percent
// that shows through used to be the neighbourhood, read as a smudge.
//
// The fix is not a higher opacity. It is to make what shows through be the
// SAME COLOUR: `scene.visible = false` means the renderer still clears and
// still composites — the canvas never goes idle, so the switch stays instant —
// but the frame it paints is a flat field of the sheet's own ground. Five
// percent of that is indistinguishable from the sheet.
//
// ⛔ Do NOT "optimise" this into pausing, unmounting, or hiding the canvas.
// Every one of those is the failure this avoids. The scene must keep rendering;
// it just renders nothing.
//
// The colour is READ OFF THE DOCUMENT (`--sheet-bg-*`, hoisted to :root in
// index.css) rather than restated here, so the clear colour and the sheet can
// never drift apart.

function SheetGround({ active, ground }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    if (!active) return undefined

    const prevVisible = scene.visible
    const prevClear = new THREE.Color()
    gl.getClearColor(prevClear)
    const prevAlpha = gl.getClearAlpha()

    const css = getComputedStyle(document.documentElement)
      .getPropertyValue(ground === 'paper' ? '--sheet-bg-paper' : '--sheet-bg-plate')
      .trim()

    if (css) gl.setClearColor(new THREE.Color(css), 1)
    scene.visible = false
    invalidate()

    return () => {
      scene.visible = prevVisible
      gl.setClearColor(prevClear, prevAlpha)
      invalidate()
    }
  }, [active, ground, gl, scene, invalidate])

  return null
}

// ── Pacing ───────────────────────────────────────────────────────────────────
// <Town paused idle>: the player's two reasons to draw less. A full-screen overlay marks itself
// `data-scene-pause` (free the GPU); an embedding page that has scrolled us mostly out of view says
// so (`ward-perf`) and we draw a third of the frames. Polled per frame, re-rendering only on change.
function usePlayerPacing() {
  const [pace, setPace] = useState({ paused: false, idle: false })
  useEffect(() => {
    let id, last = pace
    const loop = () => {
      const next = { paused: !!document.querySelector('[data-scene-pause]'), idle: FRAMED && framedPresence() === 'idle' }
      if (next.paused !== last.paused || next.idle !== last.idle) { last = next; setPace(next) }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return pace
}

// ── Camera rig ───────────────────────────────────────────────────────────────

const IDLE_TIMEOUT = 300000        // 5 minutes for browse
const IDLE_TIMEOUT_PLANET = 120000 // 2 minutes for planetarium

// Pre-allocated vectors (no per-frame allocation)
const _fromPos = new THREE.Vector3()
const _fromTarget = new THREE.Vector3()
const _toPos = new THREE.Vector3()
const _toTarget = new THREE.Vector3()
const _sph = new THREE.Spherical()
const _offset = new THREE.Vector3()
const _lerpPos = new THREE.Vector3()
const _lerpTarget = new THREE.Vector3()
// Camera up-vector interpolated across a transition so Hero↔Browse tilts
// smoothly into / out of a true overhead — up stays ⊥ the view direction the
// whole way (no gimbal, no snap). Per-shot up is the only legitimate camera
// rotation (compass-frame doctrine); browse = browseUpFromHeading, else [0,1,0].
const _fromUp = new THREE.Vector3()
const _toUp = new THREE.Vector3()
const _lerpUp = new THREE.Vector3()

function CameraRig() {
  const { camera, gl, size } = useThree()
  const controlsRef = useRef()
  const initialized = useRef(false)

  /* Framed, the hero holds the shot it was given — see onMove/onWheel below;
     hero's controls are disabled in every case (applyMode: playback). */

  // SC.5 — per-shot framing knobs come from the slab. Production passes
  // no override; the cartograph chunk's Stage live-wires via the store.
  const scene = useSceneJson(INSTANCE.lookId)
  const shotsV       = scene?.shots?.values || SHOTS_FLAT_DEFAULTS
  const browseFov    = shotsV.browse?.fov         ?? SHOTS_FLAT_DEFAULTS.browse.fov
  const heroFov      = shotsV.hero?.fov           ?? SHOTS_FLAT_DEFAULTS.hero.fov
  const streetFov    = shotsV.street?.fov         ?? SHOTS_FLAT_DEFAULTS.street.fov
  const streetEye    = shotsV.street?.eyeHeight   ?? SHOTS_FLAT_DEFAULTS.street.eyeHeight

  // Cosmetic Browse screen-orientation (authored Heading slider). Applied to
  // the overhead camera's up vector once Browse settles (see the post-
  // transition snap below). deg 0 → [0,0,-1], identical to today's framing.
  const browseHeadingDeg = scene?.browseHeading?.values?.value ?? 0

  // Browse overhead framing from the SLAB's authored bounds — center on the
  // neighborhood (cx/cz), fit altitude to the viewport, exactly as Stage/Preview
  // do. Replaces the legacy hardcoded PRESETS.browse [0,0,0]/600 that framed
  // off-center + at the wrong altitude (Vernier Phase 2).
  const browseBounds = shotsV.browse?.bounds || SHOTS_FLAT_DEFAULTS.browse.bounds
  const browsePad    = shotsV.browse?.padding ?? SHOTS_FLAT_DEFAULTS.browse.padding ?? 1.05
  const browseCx     = browseBounds?.cx ?? 0
  const browseCz     = browseBounds?.cz ?? 0

  // Authored hero camera animation from the slab — the SAME keyframes Stage +
  // Preview play, each with its own aim. No authored path → ONE keyframe, the
  // opening view derived from this scene's own disc (static: heroKeyframeAnim
  // with n = 1 is the keyframe verbatim). Null until the ground publishes the
  // disc; the hero drive waits for it rather than inventing a pose.
  const stencil = useSceneStencil()
  const heroKeyframes = useMemo(
    () => resolveHeroKeyframes(scene?.heroKeyframes, scene?.heroMotion, stencil, heroFov, 'production'),
    [scene?.heroKeyframes, scene?.heroMotion, stencil, heroFov])
  // ⛔ No default motion: a static shot needs none, and an animated one without
  // its own { length, mode } is refused by resolveHeroKeyframes above.
  const heroMotion = scene?.heroMotion ?? null
  // The movie is played by MovieCamera (mounted below); entering it samples the path through its handle, on
  // its clock — the random start on each entry (and on arrival) is the driver's (BRIEF-one-movie-driver).
  const movie = useRef(null)

  // Projection vertical offset (lens shift) for panel-aware reframe

  // Cinematic multi-segment queue
  const cinematicQueue = useRef([])

  // Transition state
  const transitioning = useRef(false)
  const transStart = useRef(0)
  const transDuration = useRef(1500)
  const fromFov = useRef(6)
  const toFov = useRef(6)

  // Mode / flyTo tracking
  const prevMode = useRef('hero')
  const prevFlyTarget = useRef(null)
  const prevPanelState = useRef('neutral')
  const _panelCameraOffset = useRef(0)
  const transToHero = useRef(false)
  const modeChangedAt = useRef(Date.now())

  // Start a transition. `toUp` (optional) is the destination shot's up vector;
  // omit it to hold the current up (flyTo / panel-offset / cinematic don't roll).
  function beginTransition(pos, target, fov, duration, toUp) {
    _fromPos.copy(camera.position)
    _fromTarget.copy(controlsRef.current.target)
    _fromUp.copy(camera.up)
    fromFov.current = camera.fov
    _toPos.set(pos[0], pos[1], pos[2])
    _toTarget.set(target[0], target[1], target[2])
    if (toUp) _toUp.set(toUp[0], toUp[1], toUp[2]); else _toUp.copy(camera.up)
    toFov.current = fov
    transStart.current = Date.now()
    transDuration.current = duration
    transitioning.current = true
  }

  // Start a multi-segment cinematic transition
  function beginCinematic(segments) {
    cinematicQueue.current = segments.slice(1)
    const first = segments[0]
    beginTransition(first.position, first.target, first.fov, first.duration)
  }

  // Track ctrl key state for planetarium pan modifier
  const ctrlHeld = useRef(false)

  // ESC key: planetarium → browse, browse → hero
  // Ctrl key: track for planetarium lateral pan
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Control') ctrlHeld.current = true
      if (e.key !== 'Escape') return
      const { viewMode } = useCamera.getState()
      if (viewMode === 'planetarium') {
        useCamera.getState().exitPlanetarium()
      } else if (viewMode !== 'hero') {
        useCamera.getState().goHero()
      }
    }
    const handleKeyUp = (e) => {
      if (e.key === 'Control') ctrlHeld.current = false
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Idle detection: any movement resets timer (doesn't exit hero)
  useEffect(() => {
    const resetIdle = () => useCamera.getState().resetIdle()
    document.addEventListener('pointermove', resetIdle)
    document.addEventListener('keydown', resetIdle)
    return () => {
      document.removeEventListener('pointermove', resetIdle)
      document.removeEventListener('keydown', resetIdle)
    }
  }, [])

  // Deliberate canvas interaction: drag or scroll exits hero; ctrl+click enters planetarium
  useEffect(() => {
    const canvas = gl.domElement
    let downXY = null

    // Raycast mouse position to ground plane (Y=0)
    const _ray = new THREE.Raycaster()
    const _mouse = new THREE.Vector2()
    const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const _hit = new THREE.Vector3()

    function groundHit(clientX, clientY) {
      const rect = canvas.getBoundingClientRect()
      _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
      _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1
      _ray.setFromCamera(_mouse, camera)
      if (_ray.ray.intersectPlane(_groundPlane, _hit)) {
        return { x: _hit.x, z: _hit.z }
      }
      return null
    }

    // Double-tap / double-click bookkeeping. End-user gesture: double-tap
    // (mobile) or double-click (desktop) in Browse drops the camera to street
    // level at the tap point, animating down via the CameraRig transition.
    // Mirrors the LS production behavior described in the navigation graph
    // (Browse ↔ Street edge). 450ms window comfortably covers a desktop
    // double-click AND the iOS double-tap; 24px slop tolerates jitter on the
    // second press.
    const DBLCLICK_MS = 450
    let lastTap = null

    const onDown = (e) => {
      useCamera.getState().resetIdle()

      // Ctrl+click (Mac: button=2) or right-click in browse → planetarium
      if ((e.ctrlKey || e.button === 2) && useCamera.getState().viewMode === 'browse') {
        e.preventDefault()
        e.stopPropagation()
        const g = groundHit(e.clientX, e.clientY)
        if (g) useCamera.getState().enterPlanetarium(g.x, g.z)
        return
      }

      // Double-tap in Browse → Street (planetarium). Only the primary
      // button counts; modifier-clicks are handled above.
      if (e.button === 0 && useCamera.getState().viewMode === 'browse') {
        const now = performance.now()
        if (lastTap && (now - lastTap.t) < 320
            && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) {
          e.preventDefault()
          e.stopPropagation()
          const g = groundHit(e.clientX, e.clientY)
          lastTap = null
          if (g) {
            useCamera.getState().enterPlanetarium(g.x, g.z)
            return
          }
        } else {
          lastTap = { t: now, x: e.clientX, y: e.clientY }
        }
      }

      downXY = { x: e.clientX, y: e.clientY }
    }

    /* ⛔ FRAMED, THE SHOT IS HELD. `?shot=` already says a framing is something
       an embedding page AUTHORS — so a drag or a wheel promoting hero→browse
       underneath it means the operator's framing is not what is on screen, and
       nothing told them. Worse on a phone: a reader swiping PAST the frame on
       their way down the page was panning the camera, because a swipe and a
       drag are the same gesture there. (Jacob, 2026-08-31: "a touch on the
       screen won't pan the camera to browse".)
       ⭐ THIS IS WHY THE HOST PAGE NEEDS NO ARM BUTTON. theward.online was
       holding `pointer-events: none` over the hero and asking for a click to
       release it — a guard the product should never have made necessary. The
       Ward is a universal player; every installation inherits this, rather than
       each embedding page inventing its own gate.
       ⚠ Unframed this is inert: a direct visitor still drags into Browse. */
    const onMove = (e) => {
      if (!downXY) return
      const cam = useCamera.getState()
      if (cam.viewMode !== 'hero') { downXY = null; return }
      const dx = e.clientX - downXY.x
      const dy = e.clientY - downXY.y
      if (dx * dx + dy * dy > 36) { // >6px = drag
        downXY = null
        if (FRAMED) return
        cam.setMode('browse')
        useUserLocation.getState().start()
      }
    }

    const onUp = () => { downXY = null }

    const onWheel = () => {
      const cam = useCamera.getState()
      cam.resetIdle()
      if (cam.viewMode === 'hero' && !FRAMED) {
        cam.setMode('browse')
        useUserLocation.getState().start()
      }
    }

    // Suppress browser context menu on canvas (Mac ctrl+click = right-click)
    const onContextMenu = (e) => {
      const vm = useCamera.getState().viewMode
      if (vm === 'browse' || vm === 'planetarium') {
        e.preventDefault()
      }
    }

    canvas.addEventListener('pointerdown', onDown, { capture: true })
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('wheel', onWheel)
    canvas.addEventListener('contextmenu', onContextMenu)
    return () => {
      canvas.removeEventListener('pointerdown', onDown, { capture: true })
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [gl, camera])

  useFrame(() => {
    const ctl = controlsRef.current
    if (!ctl) return

    // ── Initialize on first frame ──
    if (!initialized.current) {
      applyMode(ctl, 'hero')
      ctl.update()
      initialized.current = true
    }

    const state = useCamera.getState()
    const vm = state.viewMode
    const ft = state.flyTarget

    // ── Panel-aware camera offset: shift target when panel covers lower screen ──
    const ps = state.panelState
    if (ps !== prevPanelState.current && vm === 'browse') {
      prevPanelState.current = ps
      // When panel is at browse height (~50dvh), shift camera target to center
      // the neighborhood in the visible strip above the panel
      const targetZ = ctl.target.z
      const offsetZ = ps === 'browse' ? 80 : ps === 'full' ? 150 : 0
      const currentOffset = _panelCameraOffset.current || 0
      if (offsetZ !== currentOffset) {
        // Smooth transition: adjust target Z
        const baseZ = targetZ - currentOffset
        beginTransition(
          [camera.position.x, camera.position.y, camera.position.z],
          [ctl.target.x, 0, baseZ + offsetZ],
          camera.fov,
          600
        )
        _panelCameraOffset.current = offsetZ
      }
    } else if (ps !== prevPanelState.current) {
      prevPanelState.current = ps
    }

    // ── Detect mode changes ──
    if (vm !== prevMode.current) {
      const entering = vm
      const leaving = prevMode.current
      prevMode.current = vm
      modeChangedAt.current = Date.now()

      // Clear any interrupted cinematic
      cinematicQueue.current = []

      if (leaving === 'hero' && entering === 'browse') {
        // Center on user's dot if in bounds, otherwise the authored neighborhood
        // center (slab browse bounds), at the bounds-fit overhead altitude.
        const loc = useUserLocation.getState()
        const hasUserPos = loc.active && loc.inBounds && loc.x != null
        const cx = hasUserPos ? loc.x : browseCx
        const cz = hasUserPos ? loc.z : browseCz
        const altitude = hasUserPos
          ? 300
          : browseAltitude(size.width / Math.max(size.height, 1), browseFov, browseBounds, browsePad)
        beginTransition(
          [cx, altitude, cz + 1],
          [cx, 0, cz],
          browseFov,
          BROWSE_TRANS_MS,
          browseUpFromHeading(browseHeadingDeg)   // tilt into a true overhead
        )
      } else if (entering === 'planetarium') {
        // Street-level sky view at the clicked position. fov + eyeHeight
        // are authored (scene.shots.values.street); origin is a runtime
        // input (ctrl+click target on the Browse map). Per doctrine
        // hardwires-come-out category 3, the click-driven origin is NOT
        // baked — only fov / eyeHeight transit the slab.
        const origin = state.planetariumOrigin || [0, 0]
        // The eye stands 5′8″ above the drawn ground at the clicked point — the
        // one method, shared by every app (utils/elevation#streetEyeY). No fallback.
        const eyeY = streetEyeY(origin[0], origin[1], streetEye)
        beginTransition(
          [origin[0], eyeY, origin[1]],
          [origin[0], eyeY, origin[1] - 0.5],  // look north, orbit takes over
          streetFov, 1500,
          [0, 1, 0]                            // street-level: upright
        )
      } else if (entering === 'browse') {
        // Browse entered from a non-hero shot (e.g. planetarium→browse): same
        // slab-authored overhead framing as the hero→browse path above.
        const altitude = browseAltitude(size.width / Math.max(size.height, 1), browseFov, browseBounds, browsePad)
        beginTransition([browseCx, altitude, browseCz + 1], [browseCx, 0, browseCz], browseFov, BROWSE_TRANS_MS,
          browseUpFromHeading(browseHeadingDeg))
      } else if (entering === 'hero' && heroKeyframes) {
        // Glide onto the authored path: the destination is the keyframe pose
        // itself, and the chase below keeps it moving with the pan. Up returns
        // to [0,1,0] so Hero un-rolls smoothly out of Browse's overhead.
        // MovieCamera picks a random point in the pan on each entry → a returning user
        // sees a different part of the arc, not always the same start.
        transToHero.current = true
        const { fov } = movie.current.pose(_heroPos, _heroTgt)
        beginTransition(_heroPos.toArray(), _heroTgt.toArray(), fov, SHOT_TRANSITION_MS.hero, [0, 1, 0])
      }
    }

    // ── Detect flyTo changes (within browse mode) ──
    if (ft !== prevFlyTarget.current) {
      prevFlyTarget.current = ft
      if (ft && vm !== 'hero' && vm !== 'planetarium') {
        // flyTo overrides any in-progress cinematic
        cinematicQueue.current = []
        beginTransition(
          ft.position,
          ft.lookAt,
          browseFov,
          1200
        )
      }
    }

    // ── During transition ──
    if (transitioning.current) {
      relaxConstraints(ctl)
      // Drive the camera MANUALLY during the transition. OrbitControls is
      // disabled so drei's per-frame `update()` can't run — that update
      // reprojects the position from its spherical relative to camera.up, and
      // when `up` rotates mid-transition the round-trip flips the camera to the
      // underside (the SC.5 lookAt-flip — what made Browse end upside-down +
      // underground). We orient with camera.lookAt instead (well-defined while
      // up stays ⊥ the view), then hand back to OrbitControls at the very end.
      ctl.enabled = false

      // If transitioning into hero, chase the moving keyframe-animated pose
      // so the transition lands on the authored path instead of a stale point.
      if (transToHero.current && heroKeyframes) {
        const { fov: kfFov } = movie.current.pose(_toPos, _toTarget)
        toFov.current = kfFov
      }

      const elapsed = Date.now() - transStart.current
      const t = Math.min(elapsed / transDuration.current, 1)
      const e = easeInOutCubic(t)

      _lerpPos.lerpVectors(_fromPos, _toPos, e)
      _lerpTarget.lerpVectors(_fromTarget, _toTarget, e)
      camera.position.copy(_lerpPos)
      ctl.target.copy(_lerpTarget)

      // Smoothly rotate the up-vector so Hero→Browse tilts into a true overhead
      // (and Browse→Hero un-rolls). lerp+normalize is a clean slerp for the ⊥,
      // ≤90° hero/browse pair (never antiparallel), and lookAt below stays
      // well-defined because up never aligns with the view direction.
      _lerpUp.copy(_fromUp).lerp(_toUp, e)
      if (_lerpUp.lengthSq() > 1e-6) { _lerpUp.normalize(); camera.up.copy(_lerpUp) }

      camera.lookAt(_lerpTarget)

      const newFov = fromFov.current + (toFov.current - fromFov.current) * e
      if (Math.abs(camera.fov - newFov) > 0.01) {
        camera.fov = newFov
        camera.updateProjectionMatrix()
      }

      if (t >= 1) {
        if (cinematicQueue.current.length > 0) {
          const next = cinematicQueue.current.shift()
          beginTransition(next.position, next.target, next.fov, next.duration)
        } else {
          transitioning.current = false
          transToHero.current = false
          camera.up.copy(_toUp)   // land exactly on the destination up
          // Browse: snap to a pure overhead — camera directly above the target
          // at the lerped distance (the +0.01z avoids the straight-down gimbal
          // tie-break). Heading already lives in the up vector above.
          if (vm === 'browse') {
            const tx = ctl.target.x, tz = ctl.target.z
            const dist = camera.position.distanceTo(ctl.target)
            camera.position.set(tx, dist, tz + 0.01)
          }
          camera.lookAt(ctl.target)
          // Hand control back to OrbitControls now that up is settled and the
          // pose is well-defined (browse overhead is equatorial in the up frame).
          applyMode(ctl, vm)
          ctl.update()
        }
      }
      return
    }

    // ── Idle → hero ──
    const idleLimit = vm === 'planetarium' ? IDLE_TIMEOUT_PLANET : IDLE_TIMEOUT
    const modeAge = Date.now() - modeChangedAt.current
    if (modeAge > 10000 && Date.now() - state.lastInteraction > idleLimit && vm !== 'hero') {
      useCamera.getState().goHero()
    }

    // ── Track azimuth for compass ──
    _offset.copy(camera.position).sub(ctl.target)
    _sph.setFromVector3(_offset)
    state.setAzimuth(_sph.theta)
  })

  return (
    /* ⛔ HERO IS PLAYBACK — the controls are DISABLED there (applyMode), framed or
       not. That is the half that gives a HOST PAGE ITS GESTURES BACK, and why
       theward.online could delete its "Click to browse" arm gate. `update()` is
       unaffected: the hero keyframe path drives target and position and calls
       `update()` itself (drei's own useFrame skips it while disabled).
       ⚠ MEASURED: drei bundles `three-stdlib`'s OrbitControls, which never sets
       `touch-action` on the canvas, so there is nothing else to undo. */
    <>
      <RegimeControls managed controlsRef={controlsRef} />
      <MovieCamera keyframes={heroKeyframes} motion={heroMotion} quality={QUALITY} controlsRef={controlsRef} handle={movie}
        active={() => useCamera.getState().viewMode === 'hero'} hold={() => transitioning.current} />
    </>
  )
}

// ── Scene ────────────────────────────────────────────────────────────────────

// `?ground` strips the town to bare ground (App.jsx's chrome gate reads the same flag).
const IS_GROUND = window.location.search.includes('ground')
const GROUND_ONLY = { buildings: false, trees: false, lamps: false, setPieces: false, neon: false, labels: false, fog: false, shadows: false, post: false }
// The old player's camera modes → the shot <Town> draws.
const SHOT_OF_MODE = { hero: 'movie', browse: 'plan', planetarium: 'street' }
// The device this page runs on decides the quality — in lib/qualityProfile.js, not here.
const QUALITY = deviceQuality()

function Scene({ sheeted = false, ground = 'plate' } = {}) {
  const viewMode = useCamera((s) => s.viewMode)
  const shot = SHOT_OF_MODE[viewMode]
  if (!shot) throw new Error(`[Scene] ⛔ camera mode '${viewMode}' draws no shot`)
  const { paused, idle } = usePlayerPacing()
  // The player owns its selection and its listings; <Town> is handed them (a click opens the place card, as before).
  const selectedId = useSelectedBuilding((s) => s.selectedId)
  const select = useSelectedBuilding((s) => s.select)
  const deselect = useSelectedBuilding((s) => s.deselect)
  const onSelectBuilding = useCallback((id) => (id ? select(id) : deselect()), [select, deselect])
  const listings = useListings((s) => s.listings)

  // The movie shot needs CONTINUOUS rendering where the profile asks for it: under
  // frameloop="demand" the R3F clock advances in coarse steps, so the authored pan
  // (MovieCamera's clock steps by the frame delta) reads ~2 fps even though <Town> pumps invalidate
  // every frame. Every other shot stays "demand" (<Town> paces it). Confirmed by the
  // window.__frameloop A/B test, 2026-06-29 (H1).
  const frameloop = (QUALITY.movieEveryFrame && shot === 'movie') ? 'always' : 'demand'

  return (
    <div role="img" aria-label={`3D visualization of ${INSTANCE.name} neighborhood`} style={{
      position: 'relative', width: '100%', height: '100%', background: '#000',
    }}>
    <Canvas
      style={{ position: 'relative' }}
      frameloop={frameloop}
      camera={{
        // A placeholder for the frames before the hero drive has a pose: the
        // local frame's origin, which is every town's centre by construction.
        // ⛔ Not a town's hero pose — that comes only from its keyframes.
        position: [0, 1, 0],
        // Canvas's initial fov fires at mount time, before scene.json
        // resolves. Use the flat default — CameraRig will retarget once
        // the slab loads (~100ms).
        fov: SHOTS_FLAT_DEFAULTS.hero.fov,
        near: 1,
        far: 60000,
      }}
      gl={{
        alpha: false,
        antialias: QUALITY.antialias,
        // Log depth where the profile asks for it — the validated authoring regime
        // (Stage/Preview run it): far-field precision at near:1/far:60000, and NeonBands
        // auto-enables its LOG path. The phone profile stays linear (see qualityProfile.js).
        logarithmicDepthBuffer: QUALITY.logDepth,
        stencil: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        // toneMappingExposure derives from scene.exposure: the post pipeline
        // writes gl.toneMappingExposure each tick from the authored channel.
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x1a1a18, 1)
        const canvas = gl.domElement
        canvas.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          console.warn('[WebGL] Context lost — waiting for restore')
        })
        canvas.addEventListener('webglcontextrestored', () => {
          console.info('[WebGL] Context restored')
        })
      }}
      dpr={QUALITY.dpr}
      shadows={IS_GROUND ? false : QUALITY.shadows}
    >
      <SheetGround active={sheeted} ground={ground} />
      <Town town={INSTANCE} lookId={INSTANCE.lookId} quality={QUALITY} shot={shot} paused={paused} idle={idle}
        selectedId={selectedId} onSelectBuilding={onSelectBuilding} listings={listings}
        layers={IS_GROUND ? GROUND_ONLY : undefined}>
        {/* The old player's overlays: the user's dot, the couriers, the map pins. */}
        {!IS_GROUND && <UserDot />}
        {!IS_GROUND && moduleOn('delivery') && <CourierDots />}
        {!IS_GROUND && <R3FErrorBoundary name="LandmarkMarkers"><LandmarkMarkers shot={SHOT_KEY[shot]} /></R3FErrorBoundary>}
      </Town>
      <CameraRig />
    </Canvas>
    </div>
  )
}

export default Scene
