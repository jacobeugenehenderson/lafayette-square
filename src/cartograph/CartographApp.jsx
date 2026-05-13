import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { MapControls, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

// Map geometry (rendered in every shot)
import MapLayers from './MapLayers.jsx'
import BakedGround from '../components/BakedGround.jsx'

// Designer-only (aerial + authoring overlays)
import AerialTiles from './AerialTiles.jsx'
import SurveyorOverlay from './SurveyorOverlay.jsx'
import MeasureOverlay from './MeasureOverlay.jsx'
import CornerEditHandles from './CornerEditHandles.jsx'
import BlockGeometryV2Debug from './BlockGeometryV2Debug.jsx'
import MarkerOverlay from './MarkerOverlay.jsx'
import MarkerFAB from './MarkerFAB.jsx'
import { DesignerArch } from '../stage/StageArch.jsx'

// Shot-only (environment paint-in)
import LafayetteScene from '../components/LafayetteScene'
import LafayettePark from '../components/LafayettePark'
import InstancedTrees from '../components/InstancedTrees'
import StreetLights from '../components/StreetLights'
import BakedLamps from '../components/BakedLamps'
import GatewayArch from '../stage/StageArch'
import CelestialBodies from '../stage/StageSky'
import CloudDome from '../components/CloudDome'
import SpriteClouds from '../components/SpriteClouds'
import Terrain from '../components/Terrain'
import { V_EXAG } from '../utils/terrainShader'
import R3FErrorBoundary from '../components/R3FErrorBoundary'
import { SHOTS, StageShadows, computeBrowseAltitude, HeroPreview, resolveHeroSubject, PostProcessing, StageFog } from '../stage/StageApp.jsx'
import { buildings as _allBuildings } from '../data/buildings'
import PreviewPostFx from '../preview/PreviewPostFx.jsx'

// Toy scene fixtures (single 4-way corner for shader/shadow R&D)
import toyRibbons from '../data/toy/toy-ribbons.json'
import ribbonsRaw from '../data/ribbons.json'
import lsNeighborhoodBoundary from '../../cartograph/data/lafayette-square/neighborhood_boundary.json'
import toyLamps from '../data/toy/toy-lamps.json'
import ToyBuildings from '../toy/ToyBuildings.jsx'
import ToyTrees from '../toy/ToyTrees.jsx'
import ToyTerrain from '../toy/ToyTerrain.jsx'

// UI
import Toolbar from './Toolbar.jsx'
import StatusBar from './StatusBar.jsx'
import Panel from './Panel.jsx'
import StagePanelReal, { defaultKeyframes } from './StagePanel.jsx'
import CartographSkyLight from './CartographSkyLight.jsx'
import CartographPost from './CartographPost.jsx'
import { lampGlow as _lampGlowUniforms } from '../preview/lampGlowState.js'
import { neon as _neonUniforms } from '../preview/neonState.js'
import { sky as _skyUniforms } from '../preview/skyState.js'
import { lighting as _lightingState } from '../preview/lightingState.js'
import { resolveLampGlowAtMinute, resolveGroupAtMinute, getTodSlotMinutes } from './animatedParam.js'
import {
  NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS,
  AMBIENT_FIELD_KEYS, AMBIENT_FLAT_DEFAULTS,
  HEMI_FIELD_KEYS, HEMI_FLAT_DEFAULTS,
  DIRSUN_FIELD_KEYS, DIRSUN_FLAT_DEFAULTS,
  DIRMOON_FIELD_KEYS, DIRMOON_FLAT_DEFAULTS,
} from './skyLightChannels.js'
import { resolveSkyAtMinute } from './skyGrid.js'
import BakeModal from './BakeModal.jsx'
import CartographSurfaces from './CartographSurfaces.jsx'

// Hooks + store
import useCartographStore from './stores/useCartographStore.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import useCamera from '../hooks/useCamera'

const CAM_KEY = 'cartograph-camera'

// Pre-set time to noon so sky starts with daylight
useTimeOfDay.getState().setHour(12)

// ── LampGlow pump ──────────────────────────────────────────────────────────
// Reads the active Look's lampGlow envelope + todSlots from the store and
// pushes the resolved per-channel value into the shared lampGlowState
// uniforms each frame. Each channel is either flat ({value}) — pumped
// directly — or animated ({animated:'tod', values, transitionIn/Out}) —
// resolved against the current TOD minute.
// Neon pump — same shape as LampGlowPump. Resolves the per-Look neon
// channel (group of 3: core/tube/bleed) at the current TOD minute and
// writes into the module-scoped uniforms NeonBands' shader holds.
// Lighting unit pump — resolves 4 single-value channels (ambient, hemi,
// dirSun, dirMoon) each frame and writes scalar multipliers into
// lightingState. StageSky's CelestialBodies multiplies into existing
// physics. Defaults = 1.0 (no modulation).
function LightingPump() {
  useFrame(() => {
    const s = useCartographStore.getState()
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = getTodSlotMinutes(tod.currentTime)
    const slotsAmb = s.ambient?.animated ? slotMinutes : null
    const slotsHemi = s.hemi?.animated ? slotMinutes : null
    const slotsSun = s.dirSun?.animated ? slotMinutes : null
    const slotsMoon = s.dirMoon?.animated ? slotMinutes : null
    _lightingState.ambient = resolveGroupAtMinute(s.ambient, minute, slotsAmb,  AMBIENT_FIELD_KEYS, AMBIENT_FLAT_DEFAULTS).value ?? 1
    _lightingState.hemi    = resolveGroupAtMinute(s.hemi,    minute, slotsHemi, HEMI_FIELD_KEYS,    HEMI_FLAT_DEFAULTS).value    ?? 1
    _lightingState.dirSun  = resolveGroupAtMinute(s.dirSun,  minute, slotsSun,  DIRSUN_FIELD_KEYS,  DIRSUN_FLAT_DEFAULTS).value  ?? 1
    _lightingState.dirMoon = resolveGroupAtMinute(s.dirMoon, minute, slotsMoon, DIRMOON_FIELD_KEYS, DIRMOON_FLAT_DEFAULTS).value ?? 1
  })
  return null
}

// Sky pump — resolves the per-Look sky-gradient channel (4-band × N-col
// matrix) at the current minute and writes RGB into skyState. GradientSky
// reads from skyState each frame and applies weather/planetarium
// modifiers on top.
function SkyPump() {
  useFrame(() => {
    const { sky } = useCartographStore.getState()
    if (!sky) return
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = getTodSlotMinutes(tod.currentTime)
    const resolved = resolveSkyAtMinute(sky, minute, slotMinutes)
    if (!resolved) return
    _skyUniforms.bandHorizonRGB = resolved.horizon
    _skyUniforms.bandLowRGB     = resolved.low
    _skyUniforms.bandMidRGB     = resolved.mid
    _skyUniforms.bandHighRGB    = resolved.high
    _skyUniforms.sunGlowRGB     = resolved.sunGlow
    _skyUniforms.hasAuthored    = true
  })
  return null
}

function NeonPump() {
  useFrame(() => {
    const { neon } = useCartographStore.getState()
    if (!neon) return
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = neon.animated ? getTodSlotMinutes(tod.currentTime) : null
    const triple = resolveGroupAtMinute(neon, minute, slotMinutes, NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS)
    _neonUniforms.coreUniform.value  = triple.core  ?? 0
    _neonUniforms.tubeUniform.value  = triple.tube  ?? 0
    _neonUniforms.bleedUniform.value = triple.bleed ?? 0
  })
  return null
}

function LampGlowPump() {
  useFrame(() => {
    const { lampGlow } = useCartographStore.getState()
    if (!lampGlow) return
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = lampGlow.animated ? getTodSlotMinutes(tod.currentTime) : null
    const triple = resolveLampGlowAtMinute(lampGlow, minute, slotMinutes)
    _lampGlowUniforms.grassUniform.value = triple.grass
    _lampGlowUniforms.treesUniform.value = triple.trees
    _lampGlowUniforms.poolUniform.value  = triple.pool
  })
  return null
}

// ── Camera rig ─────────────────────────────────────────────────────────────
// Canvas creates the default ortho camera (Designer). <PerspectiveCamera
// makeDefault /> takes over for shots; flipping makeDefault back to false
// returns control to the Canvas's ortho camera.
// Toy is a small fixture (~36 wide × 68 deep, centered on origin); the SHOTS
// camera positions are authored for the full neighborhood, so on toy we
// override with a fixed oblique framing that puts the cluster mid-screen.
const TOY_CAM = { position: [38, 32, 58], target: [0, 4, 0], fov: 35 }

function CameraRig({ orthoRef, perspRef, controlsRef }) {
  const { camera, scene, size } = useThree()
  const shot = useCartographStore(s => s.shot)
  const sceneKey = useCartographStore(s => s.scene)
  // Grab the Canvas's default ortho camera once.
  useEffect(() => {
    if (!orthoRef.current) {
      // The default camera in a Canvas with orthographic=true is the ortho.
      // If a PerspectiveCamera is already makeDefault, scan scene for OrthographicCamera.
      if (camera.isOrthographicCamera) orthoRef.current = camera
      else scene.traverse(obj => { if (obj.isOrthographicCamera) orthoRef.current = obj })
    }
  }, [camera, scene, orthoRef])
  const appliedShot = useRef(null)
  const prevShot = useRef(null)
  const didInitOrtho = useRef(false)

  // One-time: orient the ortho camera properly (top-down), using saved
  // position + zoom if we have them.
  useEffect(() => {
    if (didInitOrtho.current) return
    if (!camera.isOrthographicCamera) return
    didInitOrtho.current = true
    const { x, z, zoom } = readCamInit()
    camera.position.set(x, 500, z)
    camera.up.set(0, 0, -1)
    camera.lookAt(x, 0, z)
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    const ctl = controlsRef.current
    if (ctl) { ctl.target.set(x, 0, z); ctl.update() }
  }, [camera, controlsRef])

  // Respond to shot changes.
  // MapControls is keyed on Designer/shot so it rebuilds when the default
  // camera swaps. On rebuild its target defaults to (0,0,0), so we re-assert
  // target (and on Designer, also re-assert the ortho's orientation) here
  // after a frame delay — giving the new MapControls instance time to mount.
  useEffect(() => {
    const key = `${sceneKey}:${shot}`
    if (appliedShot.current === key) return
    appliedShot.current = key
    const applyTarget = () => {
      const ctl = controlsRef.current
      // Toy scene runs on its own fixed oblique framing in any non-Designer
      // shot; the SHOTS table is authored for the full neighborhood and
      // would put the toy fixture hundreds of units off-camera.
      if (sceneKey === 'toy' && shot !== 'designer') {
        const cam = perspRef.current
        if (!cam) return
        cam.position.set(...TOY_CAM.position)
        cam.up.set(0, 1, 0)
        cam.fov = TOY_CAM.fov
        cam.lookAt(...TOY_CAM.target)
        cam.updateProjectionMatrix()
        if (ctl) { ctl.target.set(...TOY_CAM.target); ctl.update() }
        prevShot.current = shot
        return
      }
      // Toy + Designer: reset ortho camera to origin so the toy fixture is
      // visible (otherwise localStorage-persisted LS-centered position
      // leaves toy hundreds of meters off-screen → user sees gray canvas).
      if (sceneKey === 'toy' && shot === 'designer') {
        const cam = orthoRef.current
        if (!cam) return
        cam.position.set(0, 500, 0)
        cam.zoom = Math.max(2, size.height / 200)  // fit ~200m vertical
        cam.up.set(0, 0, -1)
        cam.lookAt(0, 0, 0)
        cam.updateProjectionMatrix()
        if (ctl) { ctl.target.set(0, 0, 0); ctl.update() }
        prevShot.current = shot
        return
      }
      if (shot === 'designer') {
        const cam = orthoRef.current
        if (!cam) return
        // Coming from Browse: copy x/z + back-compute zoom from altitude so
        // the visible patch matches what the user was looking at.
        const persp = perspRef.current
        if (persp && prevShot.current === 'browse') {
          const fovRad = (persp.fov * Math.PI) / 180
          const visibleH = 2 * Math.max(persp.position.y, 1) * Math.tan(fovRad / 2)
          cam.position.set(persp.position.x, 500, persp.position.z)
          cam.zoom = size.height / Math.max(visibleH, 1e-6)
        }
        cam.up.set(0, 0, -1)
        cam.lookAt(cam.position.x, 0, cam.position.z)
        cam.updateProjectionMatrix()
        if (ctl) { ctl.target.set(cam.position.x, 0, cam.position.z); ctl.update() }
      } else {
        const cam = perspRef.current
        const s = SHOTS[shot]
        if (!cam || !s) return
        // All non-Designer entries land on the canonical shot framing —
        // SHOTS[shot].position for hero/street, aspect-fit altitude for
        // browse (mirrors Preview's ShotCamera). Previously, Designer→Browse
        // copied the ortho camera's pan x/z so the perspective view would
        // frame the operator's last-edited patch; that landed at random,
        // off-center positions and post-bake felt unmoored. Workflow is
        // cleaner returning to the canonical view each time.
        if (shot === 'browse') {
          const aspect = size.width / Math.max(size.height, 1)
          const y = computeBrowseAltitude(aspect, s.fov)
          cam.position.set(s.position[0], y, s.position[2])
        } else {
          cam.position.set(...s.position)
        }
        cam.up.set(...(s.up || [0, 1, 0]))
        cam.fov = s.fov
        cam.lookAt(...s.target)
        cam.updateProjectionMatrix()
        if (ctl) { ctl.target.set(...s.target); ctl.update() }
      }
      prevShot.current = shot
    }
    // MapControls remounts via its key change — wait one tick for the new
    // instance to be in controlsRef before we push the target.
    const id = requestAnimationFrame(applyTarget)
    useCamera.getState().setMode(shot === 'street' ? 'planetarium' : shot)
    return () => cancelAnimationFrame(id)
  }, [shot, sceneKey, orthoRef, perspRef, controlsRef])

  // Persist designer pan/zoom (ortho only). Browse-↔-Designer view sync
  // is handled by the cross-camera handoff in the shot-change useEffect
  // above (read ortho/persp directly), not via localStorage.
  useFrame(() => {
    if (useCartographStore.getState().shot !== 'designer') return
    if (!camera.isOrthographicCamera) return
    localStorage.setItem(CAM_KEY, JSON.stringify({
      x: camera.position.x, z: camera.position.z, zoom: camera.zoom,
    }))
  })

  return null
}

function readCamInit() {
  try {
    const saved = JSON.parse(localStorage.getItem(CAM_KEY))
    if (saved) return { x: saved.x || 0, z: saved.z || 0, zoom: saved.zoom || 3 }
  } catch { /* ignore */ }
  return { x: 0, z: 0, zoom: 3 }
}

// ── Controls ────────────────────────────────────────────────────────────────
function Controls({ controlsRef }) {
  const shot = useCartographStore(s => s.shot)
  const tool = useCartographStore(s => s.tool)
  const markerActive = useCartographStore(s => s.markerActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const hoverTarget = useCartographStore(s => s.hoverTarget)

  const inDesigner = shot === 'designer'
  // Designer: no rotate, pan enabled unless hovering an editable target.
  // Non-Designer shots: BrowseControls / OrbitControlsShot below own the
  // controls; their basic orbit is all we need for shot viewing.
  const panEnabled = !inDesigner || spaceDown
    || (!tool && !markerActive)
    || ((tool === 'surveyor' || tool === 'measure') && !hoverTarget && !markerActive)

  // Designer uses MapControls (plan view, ortho). Shots use OrbitControls so
  // the operator can freely inspect the 3D scene (full pan + orbit + zoom).
  if (inDesigner) {
    return (
      <MapControls
        key="ortho"
        ref={controlsRef}
        enableRotate={false}
        enablePan={panEnabled}
        enableZoom
        screenSpacePanning
        minZoom={0.5}
        maxZoom={40}
      />
    )
  }
  // Browse is a planar overhead by default — LEFT-drag pans, wheel zooms.
  // ⌥/Alt+LEFT-drag (and RIGHT-drag) is the hidden 360° orbit easter
  // egg. See feedback_browse_right_drag_orbit.md.
  if (shot === 'browse') {
    return (
      <BrowseControls controlsRef={controlsRef} />
    )
  }
  return (
    <OrbitControlsShot controlsRef={controlsRef} />
  )
}

function BrowseControls({ controlsRef }) {
  // LEFT=PAN by default, ⌥/Alt+LEFT=ROTATE, RIGHT=ROTATE always.
  //
  // Two delivery paths because each alone has been observed to fail:
  //   (a) Declarative `mouseButtons` prop. drei renders OrbitControls as
  //       <primitive object={controls} ...restProps>, and R3F's applyProps
  //       *mutates* `controls.mouseButtons` keys in place. That works on
  //       initial mount, but if THREE.OrbitControls' constructor (or the
  //       running drag handler) ever resets the object, the React tree
  //       won't re-push it because the prop value is referentially equal.
  //   (b) Imperative assignment after every mouse/key event. Robust against
  //       any internal reset, and against the underlying controls instance
  //       being recreated by drei when the default camera swaps (entering
  //       Browse from Designer flips makeDefault on PerspectiveCamera, which
  //       changes drei's internal `useMemo(new OrbitControls(...), [camera])`
  //       dependency and creates a NEW controls instance — our previous
  //       useEffect-once imperative set was applied to the OLD instance and
  //       silently lost). Tying the ref to a state setter forces a re-apply
  //       on every controls-instance swap.
  const [controls, setControls] = useState(null)
  const [altDown, setAltDown] = useState(false)
  const buttons = useMemo(() => ({
    LEFT: altDown ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  }), [altDown])
  // Re-apply imperatively whenever the controls instance OR alt state
  // changes. Belt-and-suspenders against drei recreating the underlying
  // OrbitControls when explCamera changes.
  useEffect(() => {
    if (!controls) return
    controls.mouseButtons = buttons
  }, [controls, buttons])
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Alt') setAltDown(true) }
    const onKeyUp   = (e) => { if (e.key === 'Alt') setAltDown(false) }
    const onBlur    = () => setAltDown(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  const refCb = useCallback((r) => {
    setControls(r)
    if (controlsRef) controlsRef.current = r
  }, [controlsRef])
  return (
    <OrbitControls
      key="browse"
      makeDefault
      ref={refCb}
      mouseButtons={buttons}
      enablePan
      enableRotate
      enableZoom
      screenSpacePanning
      minDistance={50}
      maxDistance={4000}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
    />
  )
}

// Shot-mode controls. Left-drag rotates; Option/Alt+drag pans; wheel zooms.
function OrbitControlsShot({ controlsRef }) {
  const localRef = useRef(null)
  useEffect(() => {
    const setButtons = (altDown) => {
      const c = localRef.current
      if (!c) return
      c.mouseButtons = {
        LEFT: altDown ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }
    }
    const onKeyDown = (e) => { if (e.key === 'Alt') setButtons(true) }
    const onKeyUp   = (e) => { if (e.key === 'Alt') setButtons(false) }
    setButtons(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
  return (
    <OrbitControls
      key="persp"
      makeDefault
      ref={(r) => { localRef.current = r; if (controlsRef) controlsRef.current = r }}
      enablePan
      enableRotate
      enableZoom
      enableDamping={false}
      rotateSpeed={0.4}
      panSpeed={0.6}
      zoomSpeed={0.6}
      screenSpacePanning
      minDistance={0.5}
      maxDistance={5000}
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
    />
  )
}

// ── Environment tickers (shot-only) ────────────────────────────────────────
function TimeTicker() {
  const tick = useTimeOfDay(s => s.tick)
  const last = useRef(Date.now())
  useFrame(() => { const n = Date.now(); tick(n - last.current); last.current = n })
  return null
}

function SkyStateTicker() {
  useFrame((_, d) => useSkyState.getState().tick(Math.min(d, 0.1)))
  return null
}

// ── Keyboard ────────────────────────────────────────────────────────────────
function useSpaceKey() {
  const setSpaceDown = useCartographStore(s => s.setSpaceDown)
  useEffect(() => {
    const onDown = (e) => {
      if (e.code !== 'Space') return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      const st = useCartographStore.getState()
      if (st.shot !== 'designer') return
      if (!st.tool && !st.markerActive) return
      e.preventDefault()
      setSpaceDown(true)
    }
    const onUp = (e) => {
      if (e.code !== 'Space') return
      setSpaceDown(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [setSpaceDown])
}

function useLoadData() {
  useEffect(() => {
    useCartographStore.getState()._loadMarkers()
    useCartographStore.getState()._loadCenterlines()
    useCartographStore.getState()._loadMeasurements()
  }, [])
}

// Toy bounding rectangle — defines the residential substrate that V2's
// rounded asphalt is carved out of. Toy-only stencil; non-toy scenes
// don't pass one (V2 emits asphalt + bands without block-fill).
const TOY_STENCIL = [[-180, -180], [180, -180], [180, 180], [-180, 180]]

// LS stencil = the neighborhood boundary polygon, scaled outward to the
// streetFade.outer + buffer band. Mirrors bake-ground.js's STENCIL_POLYGON
// derivation so V2's blockRounded comes out the same shape Designer-side
// as bake-side. Without this, V2's `blockRounded = stencil − asphaltRounded`
// is empty, which kills cornerSidewalkPads (clipped against blockRounded
// and lands at zero rings) and any other stencil-bound clip.
const LS_STENCIL = (() => {
  const poly = lsNeighborhoodBoundary?.boundary
  const center = lsNeighborhoodBoundary?.center
  const radius = lsNeighborhoodBoundary?.radius
  if (!poly?.length || !center || !radius) return null
  const targetR = (lsNeighborhoodBoundary?.streetFade?.outer ?? radius) + 50
  const scale = targetR / radius
  const cx = center[0], cz = center[1]
  return poly.map(([x, z]) => [cx + (x - cx) * scale, cz + (z - cz) * scale])
})()

// Per-scene configuration. The single source of truth for "what's
// different about this scene" — components above this line should not
// branch on scene names. New scenes register here; capabilities default
// to false unless declared.
//
// `ribbons` is the static post-bake intersections + faces artifact
// (centerline geometry comes from the live store, scene-aware). Once
// promote-ribbons is scene-keyed (Phase 0e) this can shrink to a path.
const SCENE_REGISTRY = {
  'lafayette-square': {
    ribbons: ribbonsRaw,
    stencil: LS_STENCIL,
    useBoundary: true,
    hasAerial: true,
    hasHero: true,
    StageEnvironment: ({ hiddenLayers, lookId, bakeLastMs }) => {
      // Stage live-wire for buildingPalette per couplers plan §1 carve-out:
      // production reads scene.json palette (frozen-at-bake); Stage retains
      // live-subscribed palette so Surfaces panel drags retint instantly.
      // Contained here in the cartograph chunk so LafayetteScene itself
      // never imports useCartographStore.
      const paletteOverride = useCartographStore(s => s.buildingPalette)
      return <>
        <R3FErrorBoundary name="LafayettePark"><LafayettePark lookId={lookId} bakeLastMs={bakeLastMs} /></R3FErrorBoundary>
        {!hiddenLayers.tree && (
          <R3FErrorBoundary name="InstancedTrees"><InstancedTrees lookId={lookId} bakeLastMs={bakeLastMs} /></R3FErrorBoundary>
        )}
        <R3FErrorBoundary name="LafayetteScene"><LafayetteScene lookId={lookId} bakeLastMs={bakeLastMs} paletteOverride={paletteOverride} /></R3FErrorBoundary>
        {!hiddenLayers.lamp && (
          <R3FErrorBoundary name="BakedLamps"><BakedLamps lookId={lookId} bakeLastMs={bakeLastMs} /></R3FErrorBoundary>
        )}
        <R3FErrorBoundary name="GatewayArch"><GatewayArch /></R3FErrorBoundary>
      </>
    },
  },
  'toy': {
    ribbons: toyRibbons,
    stencil: TOY_STENCIL,
    useBoundary: false,
    hasAerial: false,
    hasHero: false,
    StageEnvironment: () => <>
      <R3FErrorBoundary name="ToyTerrain"><ToyTerrain /></R3FErrorBoundary>
      <R3FErrorBoundary name="ToyBuildings"><ToyBuildings /></R3FErrorBoundary>
      <R3FErrorBoundary name="ToyTrees"><ToyTrees /></R3FErrorBoundary>
      <R3FErrorBoundary name="ToyStreetLights"><StreetLights lamps={toyLamps.lamps} /></R3FErrorBoundary>
    </>,
    // Designer-mode backdrop — a graph-paper grid that sits under the
    // V2 surface so the translucent/opaque story has something to read
    // against. LS uses real aerial tiles for this; toy is purely
    // diagnostic so a procedural grid signals "design mode" instead.
    // Backdrop color reads from `layerColors.ground` (Surfaces > Streets
    // > Ground); visibility from `layerVis.ground`. Defaults to a cool
    // navy if the operator hasn't customized.
    DesignerBackdrop: () => {
      const layerColors = useCartographStore(s => s.layerColors)
      const layerVis    = useCartographStore(s => s.layerVis)
      if (layerVis?.ground === false) return null
      const groundCol = layerColors?.ground || '#1f2530'
      return (
        <group>
          <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
            <planeGeometry args={[400, 400]} />
            <meshBasicMaterial color={groundCol} transparent opacity={1.0} depthWrite={false} />
          </mesh>
          <gridHelper args={[400, 80, '#3a4658', '#2a3340']} position={[0, -0.05, 0]} />
          <gridHelper args={[400, 8,  '#56708a', '#56708a']} position={[0, -0.04, 0]} />
        </group>
      )
    },
  },
}
function sceneConfig(scene) {
  return SCENE_REGISTRY[scene] || SCENE_REGISTRY['lafayette-square']
}

// ── App ─────────────────────────────────────────────────────────────────────
export default function CartographApp() {
  const orthoRef = useRef(null)
  const perspRef = useRef(null)
  const controlsRef = useRef(null)

  const shot = useCartographStore(s => s.shot)
  const scene = useCartographStore(s => s.scene)
  const tool = useCartographStore(s => s.tool)
  const markerActive = useCartographStore(s => s.markerActive)
  const markerEraserActive = useCartographStore(s => s.markerEraserActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const hoverTarget = useCartographStore(s => s.hoverTarget)
  const bgColor = useCartographStore(s => s.bgColor)
  const layerVis = useCartographStore(s => s.layerVis)
  const luColors = useCartographStore(s => s.luColors)
  const aerialVisible = useCartographStore(s => s.aerialVisible)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const corridorByIdx = useCartographStore(s => s.corridorByIdx)
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const activeLookId = useCartographStore(s => s.activeLookId)
  const bakeLastMs = useCartographStore(s => s.bakeLastMs)
  const heroSubject = useCartographStore(s => s.heroSubject)
  const storeKeyframes = useCartographStore(s => s.heroKeyframes)
  const setStoreKeyframes = useCartographStore(s => s.setHeroKeyframes)
  const storeMotion = useCartographStore(s => s.heroMotion)
  const setStoreMotion = useCartographStore(s => s.setHeroMotion)

  // Hero keyframes + authored motion live in the store (persisted to design.json).
  // preview + speed are transient runtime UI only.
  const keyframes = storeKeyframes
  const setKeyframes = setStoreKeyframes
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewSpeed, setPreviewSpeed] = useState(1)
  const heroMotion = { ...storeMotion, preview: previewPlaying, speed: previewSpeed }
  const setHeroMotion = (next) => {
    const f = typeof next === 'function' ? next(heroMotion) : next
    if (f.period !== heroMotion.period || f.easing !== heroMotion.easing) {
      setStoreMotion({ period: f.period, easing: f.easing })
    }
    if (!!f.preview !== previewPlaying) setPreviewPlaying(!!f.preview)
    if ((f.speed || 1) !== previewSpeed) setPreviewSpeed(f.speed || 1)
  }

  useSpaceKey()
  useLoadData()

  const inDesigner = shot === 'designer'

  // Designer reads the LIVE store layerVis so toggles update instantly.
  // Stage / shots consume the BAKED layerVis from scene.json — visibility
  // gets locked in at bake time, same source Preview reads. Re-baking is
  // what propagates Designer changes through to Stage and Preview.
  const [bakedLayerVis, setBakedLayerVis] = useState(null)
  useEffect(() => {
    if (!activeLookId) return
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}baked/${activeLookId}/scene.json?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setBakedLayerVis(j?.layerVis || {}) })
      .catch(() => { if (!cancelled) setBakedLayerVis({}) })
    // Re-fetch on activeLookId change AND on bake completion (bakeLastMs
    // bumps when runBake succeeds).
  }, [activeLookId, bakeLastMs])

  const effectiveLayerVis = inDesigner ? layerVis : (bakedLayerVis || {})
  const hiddenLayers = {}
  for (const k in effectiveLayerVis) {
    if (effectiveLayerVis[k] === false) hiddenLayers[k] = true
  }
  // Background view: aerialVisible swaps the painted background between
  // curated SVG and aerial photo. Curated rendering hides only when
  // aerial is on AND we're in pure Design — under tools, ribbons +
  // tool affordances stay over the aerial as reference, and the user
  // declutters via per-layer visibility toggles in the Designer Panel.
  const sceneCfg = sceneConfig(scene)
  const designAerialOnly = inDesigner && !tool && aerialVisible
  // When a tool is active, hide the giant off-map ground plane so the
  // background (curated or aerial) shows through under the streets.
  const toolActive = inDesigner && !!tool
  const corridorSelected = toolActive && selectedStreet !== null
  const decorationsHidden = toolActive ? { ...hiddenLayers, ground: true } : hiddenLayers

  // Tool + Aerial = focus mode. Drops the visual noise that competes
  // with the aerial photo for align-to-photo authoring:
  //   - V2 keeps the ribbon bands (asphalt / curb / sidewalk / treelawn —
  //     the measurement targets) but takes `hideLandUse` so the colored
  //     block faces (residential / commercial / park) stop tinting the
  //     aerial.
  //   - MapLayers (buildings, landscape overlays, parking lots, lamps,
  //     trees, water, labels, barriers) hides entirely.
  //   - DesignerArch (decoration) hides.
  // Aerial photo + ribbon bands + tool's authoring overlay = clean
  // direct-align surface. Gated by `sceneCfg.hasAerial` because scenes
  // without an aerial photo can't enter focus mode.
  const toolAerialFocus = inDesigner && !!tool && aerialVisible && sceneCfg.hasAerial

  let cursor = 'grab'
  if (markerActive && markerEraserActive && !spaceDown) cursor = 'pointer'
  else if (markerActive && !spaceDown) cursor = 'crosshair'
  else if ((tool || markerActive) && hoverTarget && !spaceDown) cursor = 'pointer'
  if (!inDesigner) cursor = 'default'

  return (
    <div className="cartograph"
      style={!inDesigner ? { background: '#000' }
        : bgColor !== '#1a1a18' ? { background: bgColor } : undefined}>
      <div className="carto-canvas-wrap" style={{ cursor }}>
        <Canvas
          orthographic
          frameloop="always"
          camera={{ position: [0, 500, 0], zoom: 3, near: 0.1, far: 2000 }}
          gl={{
            alpha: false, antialias: true, stencil: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 0.95,
            // Logarithmic depth buffer — redistributes 24-bit precision
            // logarithmically so distance-dependent sort failures (water
            // sinking into ground, treelawn snapping at high altitude)
            // resolve cleanly across the scene's full near/far range. See
            // FEATURES.md §"Layering / coplanar stacking / depth precision".
            logarithmicDepthBuffer: true,
          }}
          onCreated={({ gl }) => { gl.setClearColor(0x2a2a26, 1) }}
          dpr={[1, 1.5]}
          shadows="soft"
          style={{ position: 'absolute', inset: 0 }}
        >
          <PerspectiveCamera
            ref={perspRef}
            makeDefault={!inDesigner}
            position={SHOTS.browse.position}
            fov={SHOTS.browse.fov}
            near={1}
            far={60000}
          />
          <CameraRig orthoRef={orthoRef} perspRef={perspRef} controlsRef={controlsRef} />
          {!inDesigner && <TimeTicker />}
          {!inDesigner && <SkyStateTicker />}


          {/* ── Ground:
              - Designer (any scene) → V2 live render via
                <BlockGeometryV2Debug/>. Reads centerlines + intersections
                + blockCustoms from the live store so authoring edits
                show without re-baking.
              - Any non-Designer shot (any scene) → <BakedGround/>. Same
                component Preview mounts, same per-Look slab Publish
                ships. ↻ / Stage→ refresh via cache-bust on bakeLastMs. ── */}
          {inDesigner && <ambientLight intensity={1} />}

          {/* Designer-mode backdrop. LS uses aerial tiles (gated lower);
              toy registers a procedural grid so the V2 translucent layers
              have something to read against in Designer. */}
          {inDesigner && sceneCfg.DesignerBackdrop && (
            <R3FErrorBoundary name="DesignerBackdrop">
              <sceneCfg.DesignerBackdrop />
            </R3FErrorBoundary>
          )}


          {/* ── Rounded-block-clip V2 ground render — Designer only.
              Live render driven by the store (centerlines, blockCustoms,
              corner overrides) so authoring edits show without a re-bake.
              Stage shots consume <BakedGround/> below — same V2 emitter
              that produces the slab, just frozen at bake time. Pure-
              aerial Designer mode (no tool, aerial on) skips V2 so the
              photo shows uncovered; tool-focus mode keeps V2 mounted
              with hideLandUse so ribbon bands stay as measurement
              targets over the photo. ── */}
          {inDesigner && !designAerialOnly && (
            <R3FErrorBoundary name="BlockGeometryV2Debug">
              <BlockGeometryV2Debug
                ribbons={sceneCfg.ribbons}
                stencil={sceneCfg.stencil}
                flat={inDesigner}
                useBoundary={sceneCfg.useBoundary}
                measureActive={tool === 'measure' && inDesigner}
                surveyActive={tool === 'surveyor' && inDesigner}
                hideLandUse={toolAerialFocus} />
            </R3FErrorBoundary>
          )}

          {/* ── Corner-edit handles — surface only in Designer mode, in
              whichever scene is active. Toggle lives in Streets > Corners
              in Panel.jsx. Component bails out internally when
              cornerEditMode is off; mount is unconditional in Designer
              so the toggle takes effect without a re-mount. */}
          {inDesigner && (
            <R3FErrorBoundary name="CornerEditHandles">
              <CornerEditHandles ribbons={sceneCfg.ribbons} />
            </R3FErrorBoundary>
          )}

          {/* ── Baked Three.js ground for Stage shots — every scene.
              Same component Preview mounts; cache-busts on bakeLastMs so
              ↻ / Stage→ refresh the artifact in place. The slab is the
              single rendered ground in shot mode (no V2 overlay). ── */}
          {!inDesigner && (
            <R3FErrorBoundary name="BakedGround">
              <BakedGround
                lookId={activeLookId}
                bakeLastMs={bakeLastMs}
                targetExag={shot === 'street' ? 1 : shot === 'browse' ? 0 : V_EXAG}
              />
            </R3FErrorBoundary>
          )}

          {/* ── Map layers (flat ground geometry — neighborhood only).
              In shots, layers with 3D equivalents (park, buildings, trees,
              lamps, water) are suppressed so the 3D components own them.
              In Designer, any time aerial is on (tool focus OR pure design
              with aerial), hide entirely so the photo isn't covered by
              buildings/parcels/water/parking-lots/etc. */}
          {scene === 'lafayette-square' && !toolAerialFocus && !designAerialOnly && (
            <MapLayers hiddenLayers={inDesigner ? decorationsHidden : hiddenLayers} inShot={!inDesigner}
              surveyActive={tool === 'surveyor' && inDesigner}
              measureActive={tool === 'measure' && inDesigner} />
          )}

          {/* ── Designer-only UI overlays. Survey + Measure overlays mount
              in every scene that supports authoring (toy and LS both).
              AerialTiles + DesignerArch are LS-specific visual surfaces:
              gated by scene capabilities so toy doesn't try to load the
              64 aerial tiles or the gateway-arch decoration. Mounting
              only in Designer keeps these out of Stage shots. */}
          {inDesigner && <>
            {/* Aerial tiles fetch + GPU-upload eagerly on mount (~64 tiles at
                z=20, several MB). Mount only when needed — when a tool is
                active or Aerial is toggled — so Designer pays nothing for
                the photo unless it's actually being used. ~200ms cache hit
                / 2-5s cold the first time the operator clicks Aerial. */}
            {sceneCfg.hasAerial && (!!tool || aerialVisible) && <AerialTiles visible={true} zoom={tool === 'measure' ? 20 : 18} />}
            {scene === 'lafayette-square' && !toolAerialFocus && !designAerialOnly && <DesignerArch />}
            <SurveyorOverlay />
            {tool === 'measure' && <MeasureOverlay />}
          </>}

          {/* ── Shot-only (environment paint — must exactly mirror runtime) ── */}
          {!inDesigner && <StageShadows />}
          {!inDesigner && <StageFog />}
          {!inDesigner && <PostProcessing />}
          <group visible={!inDesigner}>
            <R3FErrorBoundary name="CelestialBodies"><CelestialBodies debugLevel={0} /></R3FErrorBoundary>
            <R3FErrorBoundary name="CloudDome"><CloudDome /></R3FErrorBoundary>
            {/* SpriteClouds parked 2026-05-03 — drei sprite Clouds approach
                produces stylized cartoon puffs, not the photoreal-stylized
                weather-responsive aesthetic this project is going for. The
                right path is upgrading CloudDome's noise shader (better fbm,
                domain warping, sun-direction lighting, weather-state morphing).
                Component file kept as a parked experiment. See
                HANDOFF-clouds-day3-clouddome-v2.md for the rebooted brief. */}
            {/* <R3FErrorBoundary name="SpriteClouds"><SpriteClouds /></R3FErrorBoundary> */}
            {/* Terrain mesh hidden — the ribbons + land-use fills ARE the
                visible ground. Terrain still mounts so its shader uniforms
                drive displacement for ribbons/buildings. */}
            <group visible={false}>
              <R3FErrorBoundary name="Terrain"><Terrain /></R3FErrorBoundary>
            </group>
            {/* Heavy 3D-only props — skip mounting entirely in Designer
                (flat top-down view doesn't render trees/arch/lamps/scene
                detail, and `visible={false}` doesn't prevent the children's
                expensive useMemos from running). They mount as soon as a
                shot is active. */}
            {!inDesigner && sceneCfg.StageEnvironment && (
              <sceneCfg.StageEnvironment
                hiddenLayers={hiddenLayers}
                lookId={activeLookId}
                bakeLastMs={bakeLastMs}
              />
            )}
          </group>
          {/* Post-FX: same chain Preview ships with so Stage and Preview
              read identically. Bloom on so the Stage Bloom panel sliders
              actually drive a live effect (PreviewPostFx mutates envState
              every frame); AO still off pending light-dome work. */}
          {!inDesigner && <PreviewPostFx bloom aerial grade grain />}

          {!inDesigner && <LampGlowPump />}
          {!inDesigner && <NeonPump />}
          {!inDesigner && <SkyPump />}
          {!inDesigner && <LightingPump />}
          <Controls controlsRef={controlsRef} />
          {shot === 'hero' && sceneCfg.hasHero && (
            <HeroPreview keyframes={keyframes} motion={heroMotion}
              subject={resolveHeroSubject(heroSubject, _allBuildings)} />
          )}
        </Canvas>

        {inDesigner && <MarkerOverlay cameraRef={orthoRef} />}
        {inDesigner && <MarkerFAB />}
        <Toolbar />
        <StatusBar />

        {!inDesigner && (
          <StagePanelReal shot={shot}
            setShot={(s) => useCartographStore.getState().setShot(s)}
            keyframes={keyframes} setKeyframes={setKeyframes}
            heroMotion={heroMotion} setHeroMotion={setHeroMotion}
            surfacesSlot={<CartographSurfaces />}
            skyLightSlot={<CartographSkyLight />}
            postSlot={<CartographPost />} />
        )}
      </div>

      {/* Re-mount Panel when the active Look changes so its local state
          rehydrates from the new Look's design. Cheap (Panel is just a
          control surface) and avoids subscribing to every layer-color
          change inside the Panel. */}
      {inDesigner && <Panel key={activeLookId || 'default'} />}

      <BakeModal />
    </div>
  )
}
