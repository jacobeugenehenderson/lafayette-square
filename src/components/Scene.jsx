import { useRef, useEffect, Suspense, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import LafayetteScene from './LafayetteScene'
import CelestialBodies from './CelestialBodies'
import BakedGround from './BakedGround.jsx'
import LafayettePark from './LafayettePark'
import BakedLamps from './BakedLamps'
import GatewayArch from './GatewayArch'
import CloudDome from './CloudDome'
import WeatherPoller from './WeatherPoller'
import UserDot from './UserDot'
import CourierDots from './CourierDots'
import useCamera from '../hooks/useCamera'
import useUserLocation from '../hooks/useUserLocation'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import R3FErrorBoundary from './R3FErrorBoundary'
import Terrain from './Terrain'
import { PostProcessing, StageShadows } from './PostProcessing.jsx'
import { useSceneJson } from '../lib/useSceneJson.js'
import { SHOTS_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'


// ── Helpers ──────────────────────────────────────────────────────────────────

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ── Hero pan path ────────────────────────────────────────────────────────────
// Slow lateral tracking shot perpendicular to arch sight line.

const HERO_CENTER = [-400, 55, 230]
const HERO_TARGET = [400, 45, -100]
const PAN_HALF_LENGTH = 140
const PAN_PERP = [0.358, 0.934]
const PAN_PERIOD = 720
const HERO_PHASE = Math.random()

function heroPanSwing(t) {
  return -Math.cos(((t % 1) + 1) % 1 * Math.PI * 2)
}

// ── Camera presets ───────────────────────────────────────────────────────────
// SC.5 (2026-05-13): FOVs + Street eye height retired from this const —
// they now flow through scene.shots (SHOTS_FLAT_DEFAULTS for first paint).
// What remains is the runtime-input shape for hero / browse positions +
// targets (heroSubject / Browse user-pos centering not yet plumbed
// through the slab in production — heroSubject channel bakes but
// production's hero pan still rides on HERO_CENTER; follow-up).

const PRESETS = {
  hero: {
    position: HERO_CENTER,
    target: HERO_TARGET,
  },
  browse: {
    position: [0, 600, 1],        // top-down (Z=1 avoids gimbal lock)
    target: [0, 0, 0],
  },
}

const MODE_CONSTRAINTS = {
  hero: {
    enableRotate: false, enablePan: false, enableZoom: false,
  },
  browse: {
    enableRotate: false, enablePan: true, enableZoom: true,
    panSpeed: 1.5, zoomSpeed: 1.2,
    minDistance: 50, maxDistance: 4000,
    minPolarAngle: 0.001, maxPolarAngle: 0.001,
    screenSpacePanning: true,
    mouseButtons: { LEFT: 2, MIDDLE: 2, RIGHT: 2 }, // all pan
    touches: { ONE: 1, TWO: 2 },  // one-finger pan, pinch zoom
  },
  planetarium: {
    enableRotate: true, enablePan: true, enableZoom: false,
    rotateSpeed: 0.35, panSpeed: 80,
    screenSpacePanning: false,          // pan on XZ ground plane
    minDistance: 0.5, maxDistance: 0.5,  // locked — orbit in place
    minPolarAngle: Math.PI / 2,         // horizontal (horizon)
    maxPolarAngle: Math.PI * 0.99,      // nearly straight up (zenith)
    mouseButtons: { LEFT: 0, MIDDLE: 2, RIGHT: 2 }, // left=orbit, right/ctrl+click=pan
    touches: { ONE: 0, TWO: 2 },       // one-finger orbit, pinch zoom
  },
}

function applyConstraints(ctl, mode) {
  const c = MODE_CONSTRAINTS[mode]
  if (!c) return
  ctl.enableRotate = c.enableRotate
  ctl.enablePan = c.enablePan
  ctl.enableZoom = c.enableZoom
  if (c.panSpeed != null) ctl.panSpeed = c.panSpeed
  if (c.rotateSpeed != null) ctl.rotateSpeed = c.rotateSpeed
  if (c.zoomSpeed != null) ctl.zoomSpeed = c.zoomSpeed
  if (c.minDistance != null) ctl.minDistance = c.minDistance
  if (c.maxDistance != null) ctl.maxDistance = c.maxDistance
  if (c.minPolarAngle != null) ctl.minPolarAngle = c.minPolarAngle
  if (c.maxPolarAngle != null) ctl.maxPolarAngle = c.maxPolarAngle
  if (c.mouseButtons) {
    ctl.mouseButtons = c.mouseButtons
  } else {
    ctl.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 } // default: left=rotate
  }
  if (c.screenSpacePanning != null) ctl.screenSpacePanning = c.screenSpacePanning
  else ctl.screenSpacePanning = true
  if (c.touches) ctl.touches = c.touches
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

// ── Frame limiter ────────────────────────────────────────────────────────────
// Canvas uses frameloop="demand" so no frames render unless invalidated.
// Hero mode runs at 60fps for smooth pan; other modes skip every other frame (30fps).

function FrameLimiter() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let skip = false
    let id
    const loop = () => {
      // Pause rendering when full-screen overlays are open — free the GPU
      const paused = document.querySelector('[data-scene-pause]')
      if (!paused) {
        const isHero = !IS_MOBILE && useCamera.getState().viewMode === 'hero'
        if (isHero || !skip) invalidate()
      }
      skip = !skip
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [invalidate])
  return null
}

// ── Time ticker ──────────────────────────────────────────────────────────────

function TimeTicker() {
  const tick = useTimeOfDay((state) => state.tick)
  const lastTime = useRef(Date.now())

  useFrame(() => {
    const now = Date.now()
    const delta = now - lastTime.current
    lastTime.current = now
    tick(delta)
  })

  return null
}

// ── Sky state ticker (smooth weather interpolation) ─────────────────────────

function SkyStateTicker() {
  useFrame((_, delta) => useSkyState.getState().tick(Math.min(delta, 0.1)))
  return null
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

function CameraRig() {
  const { camera, gl } = useThree()
  const controlsRef = useRef()
  const initialized = useRef(false)

  // SC.5 — per-shot framing knobs come from the slab. Production passes
  // no override; the cartograph chunk's Stage live-wires via the store.
  const scene = useSceneJson('lafayette-square')
  const shotsV       = scene?.shots?.values || SHOTS_FLAT_DEFAULTS
  const browseFov    = shotsV.browse?.fov         ?? SHOTS_FLAT_DEFAULTS.browse.fov
  const heroFov      = shotsV.hero?.fov           ?? SHOTS_FLAT_DEFAULTS.hero.fov
  const streetFov    = shotsV.street?.fov         ?? SHOTS_FLAT_DEFAULTS.street.fov
  const streetEye    = shotsV.street?.eyeHeight   ?? SHOTS_FLAT_DEFAULTS.street.eyeHeight

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
  const heroPanAccum = useRef({ t: HERO_PHASE, frames: 0 })
  const transToHero = useRef(false)
  const modeChangedAt = useRef(Date.now())

  // Start a transition
  function beginTransition(pos, target, fov, duration) {
    _fromPos.copy(camera.position)
    _fromTarget.copy(controlsRef.current.target)
    fromFov.current = camera.fov
    _toPos.set(pos[0], pos[1], pos[2])
    _toTarget.set(target[0], target[1], target[2])
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
    // in Browse drops the camera to street level at the tap point.
    // Mirrors the LS production behavior described in the navigation graph
    // (Browse ↔ Street edge). 320ms window matches the iOS double-tap
    // threshold; 24px slop tolerates a finger jitter on the second tap.
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

    const onMove = (e) => {
      if (!downXY) return
      const cam = useCamera.getState()
      if (cam.viewMode !== 'hero') { downXY = null; return }
      const dx = e.clientX - downXY.x
      const dy = e.clientY - downXY.y
      if (dx * dx + dy * dy > 36) { // >6px = drag
        downXY = null
        cam.setMode('browse')
        useUserLocation.getState().start()
      }
    }

    const onUp = () => { downXY = null }

    const onWheel = () => {
      const cam = useCamera.getState()
      cam.resetIdle()
      if (cam.viewMode === 'hero') {
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

  useFrame(({ clock }) => {
    const ctl = controlsRef.current
    if (!ctl) return

    // ── Initialize on first frame ──
    if (!initialized.current) {
      ctl.target.set(...PRESETS.hero.target)
      applyConstraints(ctl, 'hero')
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
        // Center on user's dot if in bounds, otherwise park center
        const loc = useUserLocation.getState()
        const hasUserPos = loc.active && loc.inBounds && loc.x != null
        const cx = hasUserPos ? loc.x : 0
        const cz = hasUserPos ? loc.z : 0
        const altitude = hasUserPos ? 300 : PRESETS.browse.position[1]
        beginTransition(
          [cx, altitude, cz + 1],
          [cx, 0, cz],
          browseFov,
          1500
        )
        // (SC.5: authored browseHeading consumption deferred — applying
        // `camera.up = browseUpFromHeading(...)` here flipped the lookAt
        // mid-transition. browseHeading bakes through the slab but the
        // production-side Up application is follow-up work.)
      } else if (entering === 'planetarium') {
        // Street-level sky view at the clicked position. fov + eyeHeight
        // are authored (scene.shots.values.street); origin is a runtime
        // input (ctrl+click target on the Browse map). Per doctrine
        // hardwires-come-out category 3, the click-driven origin is NOT
        // baked — only fov / eyeHeight transit the slab.
        const origin = state.planetariumOrigin || [0, 0]
        beginTransition(
          [origin[0], streetEye, origin[1]],
          [origin[0], streetEye, origin[1] - 0.5],  // look north, orbit takes over
          streetFov, 1500
        )
      } else if (PRESETS[entering]) {
        // Transition to mode preset. fov comes from the slab; position +
        // target are still production's hardcoded HERO_CENTER / HERO_TARGET
        // (heroSubject / heroKeyframes / heroMotion bake but production
        // hero-pan animation doesn't consume them yet — flagged as
        // follow-up).
        const p = PRESETS[entering]
        const fov = entering === 'hero' ? heroFov : entering === 'browse' ? browseFov : p.fov
        const dur = entering === 'hero' ? 2500 : 1500
        transToHero.current = entering === 'hero'
        beginTransition(p.position, p.target, fov, dur)
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

      // If transitioning into hero, chase the moving pan position
      if (transToHero.current) {
        const panElapsed = Math.max(0, clock.elapsedTime - 3)
        const panT = panElapsed / PAN_PERIOD + HERO_PHASE
        const swing = heroPanSwing(panT)
        const panOff = swing * PAN_HALF_LENGTH
        _toPos.set(
          HERO_CENTER[0] + PAN_PERP[0] * panOff,
          HERO_CENTER[1],
          HERO_CENTER[2] + PAN_PERP[1] * panOff
        )
        _toTarget.set(
          HERO_TARGET[0] + PAN_PERP[0] * panOff * 0.3,
          HERO_TARGET[1],
          HERO_TARGET[2] + PAN_PERP[1] * panOff * 0.3
        )
      }

      const elapsed = Date.now() - transStart.current
      const t = Math.min(elapsed / transDuration.current, 1)
      const e = easeInOutCubic(t)

      _lerpPos.lerpVectors(_fromPos, _toPos, e)
      _lerpTarget.lerpVectors(_fromTarget, _toTarget, e)
      camera.position.copy(_lerpPos)
      ctl.target.copy(_lerpTarget)

      const newFov = fromFov.current + (toFov.current - fromFov.current) * e
      if (Math.abs(camera.fov - newFov) > 0.01) {
        camera.fov = newFov
        camera.updateProjectionMatrix()
      }

      ctl.update()

      if (t >= 1) {
        if (cinematicQueue.current.length > 0) {
          const next = cinematicQueue.current.shift()
          beginTransition(next.position, next.target, next.fov, next.duration)
        } else {
          transitioning.current = false
          transToHero.current = false
          // Post-transition snap: force pure top-down for browse
          if (vm === 'browse') {
            const tx = ctl.target.x, tz = ctl.target.z
            const dist = camera.position.distanceTo(ctl.target)
            camera.position.set(tx, dist, tz + 0.01)
          }
          applyConstraints(ctl, vm)
          ctl.update()
        }
      }
      return
    }

    // ── Adjust near plane for depth precision ──
    const wantNear = vm === 'hero' ? 10 : 1
    if (Math.abs(camera.near - wantNear) > 0.1) {
      camera.near = wantNear
      camera.updateProjectionMatrix()
    }

    // ── Hero lateral pan — slow tracking shot across neighborhood ──
    if (vm === 'hero') {
      // Fixed-step accumulator: advance at a constant rate regardless of framerate.
      // If a frame is slow, we advance less (not more), so the camera never jumps.
      const elapsed = Math.max(0, clock.elapsedTime - 3)
      const t = elapsed / PAN_PERIOD + HERO_PHASE
      const swing = heroPanSwing(t)
      const offset = swing * PAN_HALF_LENGTH
      camera.position.set(
        HERO_CENTER[0] + PAN_PERP[0] * offset,
        HERO_CENTER[1],
        HERO_CENTER[2] + PAN_PERP[1] * offset
      )
      ctl.target.set(
        HERO_TARGET[0] + PAN_PERP[0] * offset * 0.3,
        HERO_TARGET[1],
        HERO_TARGET[2] + PAN_PERP[1] * offset * 0.3
      )
      // Bypass damping — direct position control, no interpolation fighting
      ctl.enableDamping = false
      ctl.update()
      ctl.enableDamping = true

    } else {
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
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={true}
      dampingFactor={0.25}
    />
  )
}

// ── Scene ────────────────────────────────────────────────────────────────────

const IS_GROUND = window.location.search.includes('ground')
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)



// Defer street lights on mobile — let hero settle before GLB fetch + 641 instances
function DeferredStreetLights() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 4000)
    return () => clearTimeout(id)
  }, [])
  if (!ready) return null
  return <BakedLamps />
}

function Scene() {
  const viewMode = useCamera((s) => s.viewMode)

  return (
    <div role="img" aria-label="3D visualization of Lafayette Square neighborhood" style={{
      position: 'relative', width: '100%', height: '100%', background: '#000',
    }}>
    <Canvas
      style={{ position: 'relative' }}
      frameloop="demand"
      camera={{
        position: PRESETS.hero.position,
        // Canvas's initial fov fires at mount time, before scene.json
        // resolves. Use the flat default — CameraRig will retarget once
        // the slab loads (~100ms).
        fov: SHOTS_FLAT_DEFAULTS.hero.fov,
        near: 1,
        far: 60000,
      }}
      gl={{
        alpha: false,
        antialias: !IS_MOBILE,
        stencil: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        // toneMappingExposure now derives from scene.exposure (SC.3,
        // 2026-05-13). PostProcessing's useFrame writes gl.toneMappingExposure
        // each tick from the authored channel; EffectComposer's FilmGrade
        // pass also applies uExposure. The previous hardcoded 0.95 was the
        // hardwired counterpart of the exposure channel — installed, so
        // out per doctrine `hardwires-come-out-when-channels-install`.
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
      dpr={IS_MOBILE ? 1 : [1, 1.5]}
      shadows={IS_GROUND || IS_MOBILE ? false : 'soft'}
    >
      {!IS_GROUND && !IS_MOBILE && <StageShadows />}
      <FrameLimiter />
      <TimeTicker />
      <SkyStateTicker />
      <WeatherPoller />
      <CelestialBodies />
      <CloudDome />
      {/* Terrain mesh hidden — the ribbons + land-use fills ARE the
          visible ground (Cartograph convention). Terrain still mounts
          so its `terrainExag` shader uniform stays live (drives Y
          displacement on ribbons + buildings). Mesh itself is dark
          #2a2a26 and centered on the elevation-data bounds — a different
          region than the LS centroid, so it would render as a large
          offset square if visible. */}
      <group visible={false}>
        <R3FErrorBoundary name="Terrain"><Terrain /></R3FErrorBoundary>
      </group>
      <R3FErrorBoundary name="BakedGround"><BakedGround lookId="lafayette-square" /></R3FErrorBoundary>
      <R3FErrorBoundary name="LafayettePark"><LafayettePark /></R3FErrorBoundary>
      {!IS_GROUND && <UserDot />}
      {!IS_GROUND && <CourierDots />}
      {!IS_GROUND && <R3FErrorBoundary name="LafayetteScene"><LafayetteScene /></R3FErrorBoundary>}
      {!IS_GROUND && !IS_MOBILE && <R3FErrorBoundary name="BakedLamps"><BakedLamps /></R3FErrorBoundary>}
      {!IS_GROUND && (!IS_MOBILE || viewMode === 'hero') && <R3FErrorBoundary name="GatewayArch"><GatewayArch /></R3FErrorBoundary>}
      <CameraRig />
      {!IS_GROUND && <PostProcessing viewMode={viewMode} />}
      {!IS_GROUND && IS_MOBILE && <DeferredStreetLights />}
    </Canvas>
    </div>
  )
}

export default Scene
