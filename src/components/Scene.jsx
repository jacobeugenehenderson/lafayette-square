import { useRef, useEffect, Suspense, useMemo, forwardRef } from 'react'
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
import useCamera from '../hooks/useCamera'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import buildingsData from '../data/buildings.json'

// ── Film grade (lift blacks, darken midtones) ────────────────────────────────

class FilmGradeEffect extends Effect {
  constructor() {
    super('FilmGrade', /* glsl */`
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // S-curve contrast
        vec3 curved = c * c * (3.0 - 2.0 * c);
        c = mix(c, curved, 0.5);
        // Toe crush — pull shadows toward true black
        float toe = smoothstep(0.0, 0.2, lum);
        c *= mix(0.1, 1.0, toe);
        // Midtone lift — recover brightness in the center of the range
        float midBell = 4.0 * lum * (1.0 - lum);  // peaks at lum=0.5, zero at extremes
        c *= 1.0 + midBell * 0.2;
        // Saturation boost
        vec3 gray = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
        c = mix(gray, c, 1.15);
        // Protect bright areas
        c = mix(c, inputColor.rgb, smoothstep(0.7, 1.0, lum));
        // Gentle vignette
        vec2 center = uv - 0.5;
        float vignette = 1.0 - dot(center, center) * 1.2;
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

      float grainHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        // Grain stronger in shadows, subtle in highlights
        float strength = mix(0.007, 0.002, smoothstep(0.0, 0.5, lum));
        float grain = (grainHash(uv * 1000.0 + uSeed) - 0.5) * strength;
        outputColor = vec4(inputColor.rgb + grain, inputColor.a);
      }
    `, {
      uniforms: new Map([
        ['uSeed', new THREE.Uniform(0)]
      ])
    })
  }

  update() {
    this.uniforms.get('uSeed').value = Math.random() * 1000
  }
}

const FilmGrain = forwardRef((props, ref) => {
  const effect = useMemo(() => new FilmGrainEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function findNearestBuilding(x, z) {
  let bestDist = Infinity
  let bestPos = null
  for (const b of buildingsData.buildings) {
    const dx = b.position[0] - x
    const dz = b.position[2] - z
    const dist = dx * dx + dz * dz
    if (dist < bestDist) {
      bestDist = dist
      bestPos = b.position
    }
  }
  return bestPos
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ── Hero pan path ────────────────────────────────────────────────────────────
// Slow lateral tracking shot perpendicular to arch sight line.
// Camera moves along this path; arch stays centered, foreground parallaxes.

const HERO_CENTER = [-400, 40, 230]
const HERO_TARGET = [400, 40, -100]
// Direction to arch in XZ: [3116, -1196], perpendicular: [0.358, 0.934]
const PAN_HALF_LENGTH = 140 // ±140m from center
const PAN_PERP = [0.358, 0.934]
const PAN_PERIOD = 480 // seconds for one full back-and-forth
const HERO_PHASE = Math.random() // randomized start position each visit

// ── Camera presets ───────────────────────────────────────────────────────────

const PRESETS = {
  hero: {
    position: HERO_CENTER,
    target: HERO_TARGET,
    fov: 22,                      // moderate telephoto — neighborhood fills frame
  },
  browse: {
    position: [150, 250, 380],
    target: [0, 0, 0],
    fov: 45,
  },
}

const MODE_CONSTRAINTS = {
  hero: {
    enableRotate: false, enablePan: false, enableZoom: false,
  },
  browse: {
    enableRotate: true, enablePan: true, enableZoom: true,
    panSpeed: 1.5, rotateSpeed: 0.5, zoomSpeed: 1.2,
    minDistance: 50, maxDistance: 1200,
    minPolarAngle: 0.1,              // can't flip to underground
    maxPolarAngle: Math.PI / 2,       // horizontal — can't go below ground plane
    mouseButtons: { LEFT: 0, MIDDLE: 2, RIGHT: 2 }, // left=orbit, middle/right=pan
  },
  street: {
    enableRotate: true, enablePan: false, enableZoom: false,
    rotateSpeed: 0.35,
    minPolarAngle: Math.PI / 2, maxPolarAngle: Math.PI * 0.99,
    minDistance: 0.5, maxDistance: 0.5,
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

const EYE_HEIGHT = 1.73
const IDLE_TIMEOUT = 300000        // 5 minutes for browse
const IDLE_TIMEOUT_STREET = 120000 // 2 minutes for street view

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

  // Transition state
  const transitioning = useRef(false)
  const transStart = useRef(0)
  const transDuration = useRef(1500)
  const fromFov = useRef(6)
  const toFov = useRef(6)

  // Mode / flyTo tracking
  const prevMode = useRef('hero')
  const prevFlyTarget = useRef(null)
  const savedCamera = useRef(null) // for street view return

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

  // ESC key: street → previous mode, browse → hero
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return
      const { viewMode } = useCamera.getState()
      if (viewMode === 'street') {
        useCamera.getState().exitStreetView()
      } else if (viewMode !== 'hero') {
        useCamera.getState().goHero()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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

  // Deliberate canvas interaction: exit hero on click or scroll on the 3D canvas
  useEffect(() => {
    const canvas = gl.domElement
    const engage = () => {
      const cam = useCamera.getState()
      cam.resetIdle()
      if (cam.viewMode === 'hero') cam.setMode('browse')
    }
    canvas.addEventListener('pointerdown', engage)
    canvas.addEventListener('wheel', engage)
    return () => {
      canvas.removeEventListener('pointerdown', engage)
      canvas.removeEventListener('wheel', engage)
    }
  }, [gl])

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
    const st = state.streetTarget
    const ft = state.flyTarget

    // ── Detect mode changes ──
    if (vm !== prevMode.current) {
      const entering = vm
      const leaving = prevMode.current
      prevMode.current = vm

      if (entering === 'street' && st) {
        // Save camera state for return
        savedCamera.current = {
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [ctl.target.x, ctl.target.y, ctl.target.z],
          fov: camera.fov,
        }
        const [x, , z] = st
        const nearest = findNearestBuilding(x, z)
        const dx = nearest ? nearest[0] - x : -x
        const dz = nearest ? nearest[2] - z : -z
        const len = Math.sqrt(dx * dx + dz * dz) || 1
        beginTransition(
          [x, EYE_HEIGHT, z],
          [x + dx / len * 0.5, EYE_HEIGHT, z + dz / len * 0.5],
          75, 1500
        )
      } else if (leaving === 'street' && savedCamera.current) {
        // Return from street to saved camera state
        beginTransition(
          savedCamera.current.position,
          savedCamera.current.target,
          savedCamera.current.fov,
          1500
        )
        savedCamera.current = null
      } else if (leaving === 'hero' && entering === 'browse') {
        // User interaction exits hero — unlock controls, no animation
        // Don't call ctl.update() — let damping handle any micro-adjustments
        applyConstraints(ctl, 'browse')
      } else if (PRESETS[entering]) {
        // Transition to mode preset
        const p = PRESETS[entering]
        const dur = entering === 'hero' ? 2500 : 1500
        beginTransition(p.position, p.target, p.fov, dur)
      }
    }

    // ── Detect flyTo changes (within browse mode) ──
    if (ft !== prevFlyTarget.current) {
      prevFlyTarget.current = ft
      if (ft && vm !== 'hero' && vm !== 'street') {
        beginTransition(
          ft.position,
          ft.lookAt,
          camera.fov,
          1200
        )
      }
    }

    // ── During transition ──
    if (transitioning.current) {
      relaxConstraints(ctl)

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
        transitioning.current = false
        applyConstraints(ctl, vm)
        ctl.update()
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
      const swing = Math.sin(t * Math.PI * 2) // -1 to 1
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
    }

    // ── Idle → hero ──
    const idleLimit = vm === 'street' ? IDLE_TIMEOUT_STREET : IDLE_TIMEOUT
    if (Date.now() - state.lastInteraction > idleLimit && vm !== 'hero') {
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

function Scene() {
  const viewMode = useCamera((s) => s.viewMode)
  const isStreet = viewMode === 'street'

  return (
    <Canvas
      frameloop="demand"
      camera={{
        position: PRESETS.hero.position,
        fov: PRESETS.hero.fov,
        near: 1,
        far: 60000,
      }}
      gl={{
        antialias: true,
        stencil: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
      dpr={[1, 1.5]}
      shadows={IS_GROUND ? false : 'soft'}
    >
      {!IS_GROUND && <SoftShadows size={52} samples={16} focus={0.35} />}
      <FrameLimiter />
      <TimeTicker />
      <SkyStateTicker />
      <WeatherPoller />
      <CelestialBodies />
      <CloudDome />
      <VectorStreets />
      <LafayettePark />
      {!IS_GROUND && <LafayetteScene />}
      {!IS_GROUND && <StreetLights />}
      {!IS_GROUND && viewMode === 'hero' && <GatewayArch />}
      <CameraRig />
      {!IS_GROUND && (
        <EffectComposer>
          {viewMode !== 'hero' && (
            <N8AO
              halfRes
              aoRadius={12}
              intensity={3}
              distanceFalloff={0.3}
              quality="medium"
            />
          )}
          <FilmGrade />
          <Bloom
            intensity={isStreet ? 1.8 : viewMode === 'hero' ? 1.5 : 1.2}
            luminanceThreshold={isStreet ? 0.15 : viewMode === 'hero' ? 0.2 : 0.3}
            luminanceSmoothing={isStreet ? 0.9 : viewMode === 'hero' ? 0.8 : 0.9}
            mipmapBlur
          />
          <FilmGrain />
        </EffectComposer>
      )}
    </Canvas>
  )
}

export default Scene
