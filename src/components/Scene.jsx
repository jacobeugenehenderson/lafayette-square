import { useRef, useEffect, Suspense, useMemo, forwardRef, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, SoftShadows } from '@react-three/drei'
import { EffectComposer, Bloom, N8AO, DepthOfField } from '@react-three/postprocessing'
import { Effect } from 'postprocessing'
import * as THREE from 'three'
import LafayetteScene from './LafayetteScene'
import CelestialBodies from './CelestialBodies'
import VectorStreets from './VectorStreets'
import LafayettePark from './LafayettePark'
import StreetLights from './StreetLights'
import GatewayArch from './GatewayArch'
import CloudDome from './CloudDome'
import WeatherPoller from './WeatherPoller'
import UserDot from './UserDot'
import useCamera from '../hooks/useCamera'
import useUserLocation from '../hooks/useUserLocation'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'

// ── Film grade (lift blacks, darken midtones) ────────────────────────────────

class FilmGradeEffect extends Effect {
  constructor() {
    super('FilmGrade', /* glsl */`
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // S-curve contrast
        vec3 curved = c * c * (3.0 - 2.0 * c);
        c = mix(c, curved, 0.42);
        // Toe — cinematic blacks with readable shadow detail
        float toe = smoothstep(0.0, 0.25, lum);
        c *= mix(0.28, 1.0, toe);
        // Shadow saturation boost — keeps color in the lowlights instead of mud
        float shadowSat = 1.0 + (1.0 - toe) * 0.3;
        vec3 gray = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
        c = mix(gray, c, shadowSat);
        // Midtone lift
        float midBell = 4.0 * lum * (1.0 - lum);
        c *= 1.0 + midBell * 0.15;
        // Overall saturation
        gray = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
        c = mix(gray, c, 1.1);
        // Protect bright areas
        c = mix(c, inputColor.rgb, smoothstep(0.7, 1.0, lum));
        // Gentle vignette
        vec2 center = uv - 0.5;
        float vignette = 1.0 - dot(center, center) * 1.0;
        vignette = smoothstep(0.0, 1.0, clamp(vignette, 0.0, 1.0));
        c *= vignette;
        outputColor = vec4(c, inputColor.a);
      }
    `)
  }
}

const FilmGrade = forwardRef((props, ref) => {
  const effect = useMemo(() => new FilmGradeEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

// ── Film grain (organic noise wash) ──────────────────────────────────────────
// Breaks up mathematically perfect CG gradients on walls, sky, and flat surfaces.
// Stronger in shadows (like real film stock), subtle in highlights.

class FilmGrainEffect extends Effect {
  constructor() {
    super('FilmGrain', /* glsl */`
      uniform float uSeed;
      uniform float uScale;

      float grainHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float strength = mix(0.007, 0.002, smoothstep(0.0, 0.5, lum)) * uScale;
        float grain = (grainHash(uv * 1000.0 + uSeed) - 0.5) * strength;
        outputColor = vec4(inputColor.rgb + grain, inputColor.a);
      }
    `, {
      uniforms: new Map([
        ['uSeed', new THREE.Uniform(0)],
        ['uScale', new THREE.Uniform(1.0)],
      ])
    })
  }

  update() {
    this.uniforms.get('uSeed').value = Math.random() * 1000
    const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
    // Day = full grain, night = 40% grain
    const dayFactor = sunAltitude > 0.1 ? 1 : sunAltitude < -0.15 ? 0 : (sunAltitude + 0.15) / 0.25
    this.uniforms.get('uScale').value = 0.4 + dayFactor * 0.6
  }
}

const FilmGrain = forwardRef((props, ref) => {
  const effect = useMemo(() => new FilmGrainEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

// ── Adaptive bloom — time-of-day driven ──────────────────────────────────────
// Simulates real camera lens behavior: minimal diffusion in daylight,
// soft halation at twilight, pronounced halos on point sources at night.
// Updates bloom directly via ref (no React re-renders — critical for smooth hero pan).

function useAdaptiveBloom(bloomRef, viewMode) {
  const isPlanetarium = viewMode === 'planetarium'

  useFrame(() => {
    const bloom = bloomRef.current
    if (!bloom) return
    const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()

    let intensity, threshold, smoothing
    if (isPlanetarium) {
      intensity = 1.8; threshold = 0.15; smoothing = 0.9
    } else {
      const darkness = sunAltitude > 0.1
        ? 0
        : sunAltitude < -0.15
          ? 1
          : 1 - (sunAltitude + 0.15) / 0.25
      intensity = 0.3 + darkness * 0.6
      threshold = 0.75 - darkness * 0.45
      smoothing = 0.5 + darkness * 0.3
    }

    bloom.intensity = intensity
    bloom.luminanceMaterial.threshold = threshold
    bloom.luminanceMaterial.smoothing = smoothing
  })
}

// ── Aerial perspective — telephoto atmospheric haze ──────────────────────────
// Real atmosphere scatters light between camera and subject. Telephoto lenses
// compress this, making distant objects appear milkier and lower contrast.
// Uses gl_FragCoord depth to blend toward a haze color that shifts with time.

class AerialPerspectiveEffect extends Effect {
  constructor() {
    super('AerialPerspective', /* glsl */`
      uniform float uHazeStrength;
      uniform vec3 uHazeColor;

      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        // Vertical gradient: more haze near horizon (lower screen), less in sky (upper)
        // The horizon sits roughly at the vertical midpoint in our telephoto framing
        float horizonBand = smoothstep(0.15, 0.55, uv.y) * smoothstep(0.85, 0.55, uv.y);

        // Distance approximation from luminance contrast — dark distant objects
        // lose contrast more than bright nearby ones
        float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float contrastLoss = smoothstep(0.05, 0.4, lum) * smoothstep(0.9, 0.4, lum);

        float haze = horizonBand * contrastLoss * uHazeStrength;

        // Blend toward haze color — desaturate and lift slightly
        vec3 hazed = mix(inputColor.rgb, uHazeColor, haze);
        outputColor = vec4(hazed, inputColor.a);
      }
    `, {
      uniforms: new Map([
        ['uHazeStrength', new THREE.Uniform(0.0)],
        ['uHazeColor', new THREE.Uniform(new THREE.Vector3(0.7, 0.75, 0.82))],
      ])
    })
  }
}

const AerialPerspective = forwardRef((props, ref) => {
  const effect = useMemo(() => new AerialPerspectiveEffect(), [])
  const internalRef = useRef()

  useFrame(() => {
    const e = internalRef.current
    if (!e) return
    const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()

    // Haze is strongest during day, fades at night (no atmospheric scatter in darkness)
    const dayFactor = sunAltitude > 0.1
      ? 1
      : sunAltitude < -0.05
        ? 0
        : (sunAltitude + 0.05) / 0.15

    e.uniforms.get('uHazeStrength').value = dayFactor * 0.12

    // Haze color shifts: blue-white during day, warm amber at twilight
    const warmth = sunAltitude < 0.08 && sunAltitude > -0.05
      ? 1 - (sunAltitude + 0.05) / 0.13
      : 0
    const r = 0.7 + warmth * 0.15
    const g = 0.75 - warmth * 0.05
    const b = 0.82 - warmth * 0.15
    e.uniforms.get('uHazeColor').value.set(r, g, b)
  })

  return <primitive ref={internalRef} object={effect} dispose={null} />
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ── Hero pan path ────────────────────────────────────────────────────────────
// Slow lateral tracking shot perpendicular to arch sight line.
// Camera moves along this path; arch stays centered, foreground parallaxes.

const HERO_CENTER = [-400, 40, 230]
const HERO_TARGET = [400, 40, -100]
// Projection vertical offset when panel is open.
// Shifts the frustum center so the arch stays centered in the visible area above the panel.
// panelFraction = portion of screen covered by panel (0.5 = bottom half).
// To center content in the top (1-p) of screen, shift up by p/2 in viewport coords = p in NDC.
const PANEL_FRACTION = 0.02
// Direction to arch in XZ: [3116, -1196], perpendicular: [0.358, 0.934]
const PAN_HALF_LENGTH = 140 // ±140m from center
const PAN_PERP = [0.358, 0.934]
const PAN_PERIOD = 480 // seconds for one full back-and-forth
const HERO_PHASE = Math.random() // randomized start position each visit

// Reshaped sine: |sin|^0.6 pushes the curve toward a triangle wave —
// nearly constant velocity through the middle, brief smooth turnarounds at extremes.
// Pure sine spends ~25% of time in the last 10% of travel; this cuts that in half.
function heroPanSwing(t) {
  const s = Math.sin(t * Math.PI * 2)
  return Math.sign(s) * Math.pow(Math.abs(s), 0.6)
}

// ── Camera presets ───────────────────────────────────────────────────────────

const PRESETS = {
  hero: {
    position: HERO_CENTER,
    target: HERO_TARGET,
    fov: 22,                      // moderate telephoto — neighborhood fills frame
  },
  browse: {
    position: [0, 600, 1],        // top-down (Z=1 avoids gimbal lock)
    target: [0, 0, 0],
    fov: 45,
  },
  planetarium: {
    fov: 75,                       // wide for sky dome feel
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

// ── Frame limiter (30fps) ────────────────────────────────────────────────────
// Canvas uses frameloop="demand" so no frames render unless invalidated.
// Uses rAF and skips every other frame to stay vSync-aligned (smooth 30fps).

function FrameLimiter() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let skip = false
    let id
    const loop = () => {
      if (!skip) invalidate()
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

  // Projection vertical offset (lens shift) for panel-aware reframe
  const projOffsetY = useRef(0)

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
          PRESETS.browse.fov,
          1500
        )
      } else if (entering === 'planetarium') {
        // Street-level sky view at the clicked position
        const origin = state.planetariumOrigin || [0, 0]
        const EYE = 1.73
        beginTransition(
          [origin[0], EYE, origin[1]],
          [origin[0], EYE, origin[1] - 0.5],  // look north, orbit takes over
          PRESETS.planetarium.fov, 1500
        )
      } else if (PRESETS[entering]) {
        // Transition to mode preset
        const p = PRESETS[entering]
        const dur = entering === 'hero' ? 2500 : 1500
        transToHero.current = entering === 'hero'
        beginTransition(p.position, p.target, p.fov, dur)
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
          PRESETS.browse.fov,
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
      // Hold still for first 3 seconds to let GPU warm up (shader compile, texture upload)
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

      // Panel-aware projection offset (lens shift)
      // Slides the rendered image up so the arch is centered in the visible area above the panel.
      const panelOpen = useCamera.getState().panelOpen
      const goalOffset = panelOpen ? -PANEL_FRACTION : 0
      projOffsetY.current += (goalOffset - projOffsetY.current) * 0.04
      if (Math.abs(projOffsetY.current) > 0.001) {
        // Rebuild projection matrix then apply vertical lens shift
        camera.updateProjectionMatrix()
        camera.projectionMatrix.elements[9] += projOffsetY.current
      }
    } else {
      // Reset projection offset when leaving hero
      if (Math.abs(projOffsetY.current) > 0.001) {
        projOffsetY.current *= 0.9
        camera.updateProjectionMatrix()
        camera.projectionMatrix.elements[9] += projOffsetY.current
      } else {
        projOffsetY.current = 0
      }
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

function PostProcessing({ viewMode, aoReady }) {
  const bloomRef = useRef()
  useAdaptiveBloom(bloomRef, viewMode)

  return (
    <EffectComposer>
      {aoReady && (
        <N8AO
          halfRes={viewMode !== 'hero'}
          aoRadius={viewMode === 'hero' ? 20 : 12}
          intensity={viewMode === 'hero' ? 5 : 3}
          distanceFalloff={viewMode === 'hero' ? 0.5 : 0.3}
          quality="medium"
        />
      )}
      <Bloom
        ref={bloomRef}
        intensity={0.3}
        luminanceThreshold={0.75}
        luminanceSmoothing={0.5}
        mipmapBlur
      />
      {!IS_MOBILE && <AerialPerspective />}
      <FilmGrade />
      <FilmGrain />
    </EffectComposer>
  )
}

const IS_GROUND = window.location.search.includes('ground')
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

// Mobile post-processing: FilmGrade + FilmGrain only (no Bloom — render targets too heavy)
function MobilePostProcessing() {
  return (
    <EffectComposer>
      <FilmGrade />
      <FilmGrain />
    </EffectComposer>
  )
}

// Defer street lights on mobile — let hero settle before GLB fetch + 641 instances
function DeferredStreetLights() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 4000)
    return () => clearTimeout(id)
  }, [])
  if (!ready) return null
  return <StreetLights />
}

function Scene() {
  const viewMode = useCamera((s) => s.viewMode)
  const isPlanetarium = viewMode === 'planetarium'

  // N8AO (SSAO) is disabled on mobile — its render targets leak GPU memory
  // across mount/unmount cycles (hero↔browse), causing the second category
  // click to crash. Enabled in all desktop modes including hero.
  const aoReady = false

  // Portal div for CSS3D SVG ground — rendered BEHIND the transparent WebGL canvas.
  // See VectorStreets.jsx header comment for full architecture explanation.
  // useState (not useRef) so the state change propagates into the R3F reconciler —
  // a ref object is referentially stable, so R3F wouldn't detect the .current update.
  const [svgPortalEl, setSvgPortalEl] = useState(null)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
      {/* SVG ground portal — behind the canvas (z-index: 0) */}
      <div
        ref={setSvgPortalEl}
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}
      />
    <Canvas
      style={{ position: 'relative', zIndex: 1 }}
      frameloop="demand"
      camera={{
        position: PRESETS.hero.position,
        fov: PRESETS.hero.fov,
        near: 1,
        far: 60000,
      }}
      gl={{
        alpha: true,
        antialias: !IS_MOBILE,
        stencil: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      dpr={IS_MOBILE ? 1 : [1, 1.5]}
      shadows={IS_GROUND || IS_MOBILE ? false : 'soft'}
    >
      {!IS_GROUND && !IS_MOBILE && <SoftShadows size={52} samples={16} focus={0.35} />}
      <FrameLimiter />
      <TimeTicker />
      <SkyStateTicker />
      <WeatherPoller />
      <CelestialBodies />
      <CloudDome />
      <VectorStreets svgPortal={svgPortalEl} />
      <LafayettePark />
      {!IS_GROUND && <UserDot />}
      {!IS_GROUND && <LafayetteScene />}
      {!IS_GROUND && !IS_MOBILE && <StreetLights />}
      {!IS_GROUND && (!IS_MOBILE || viewMode === 'hero') && <GatewayArch />}
      <CameraRig />
      {!IS_GROUND && !IS_MOBILE && <PostProcessing viewMode={viewMode} aoReady={aoReady} />}
      {/* No post-processing on mobile — EffectComposer render targets exhaust VRAM */}
      {!IS_GROUND && IS_MOBILE && <DeferredStreetLights />}
    </Canvas>
    </div>
  )
}

export default Scene
