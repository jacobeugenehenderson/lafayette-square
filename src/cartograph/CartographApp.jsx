import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { MapControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

// Map geometry (rendered in every shot)
import StreetRibbons from '../components/StreetRibbons.jsx'
import MapLayers from './MapLayers.jsx'

// Designer-only (aerial + authoring overlays)
import AerialTiles from './AerialTiles.jsx'
import DesignerPark from './DesignerPark.jsx'
import SurveyorOverlay from './SurveyorOverlay.jsx'
import MeasureOverlay from './MeasureOverlay.jsx'
import MarkerOverlay from './MarkerOverlay.jsx'
import MarkerFAB from './MarkerFAB.jsx'
import { DesignerArch } from '../stage/StageArch.jsx'

// Shot-only (environment paint-in)
import LafayetteScene from '../components/LafayetteScene'
import LafayettePark from '../components/LafayettePark'
import StreetLights from '../components/StreetLights'
import GatewayArch from '../stage/StageArch'
import CelestialBodies from '../stage/StageSky'
import CloudDome from '../components/CloudDome'
import Terrain from '../components/Terrain'
import R3FErrorBoundary from '../components/R3FErrorBoundary'
import { StageCamera, SHOTS, StageShadows, PostProcessing } from '../stage/StageApp.jsx'

// UI
import Toolbar from './Toolbar.jsx'
import StatusBar from './StatusBar.jsx'
import Panel from './Panel.jsx'
import StagePanelReal, { defaultKeyframes } from './StagePanel.jsx'

// Hooks + store
import useCartographStore from './stores/useCartographStore.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import useCamera from '../hooks/useCamera'

const CAM_KEY = 'cartograph-camera'

// Pre-set time to noon so sky starts with daylight
useTimeOfDay.getState().setHour(12)

// ── Camera rig ─────────────────────────────────────────────────────────────
// Canvas creates the default ortho camera (Designer). <PerspectiveCamera
// makeDefault /> takes over for shots; flipping makeDefault back to false
// returns control to the Canvas's ortho camera.
function CameraRig({ orthoRef, perspRef, controlsRef }) {
  const { camera, scene } = useThree()
  const shot = useCartographStore(s => s.shot)
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
    if (appliedShot.current === shot) return
    appliedShot.current = shot
    const applyTarget = () => {
      const ctl = controlsRef.current
      if (shot === 'designer') {
        const cam = orthoRef.current
        if (!cam) return
        cam.up.set(0, 0, -1)
        cam.lookAt(cam.position.x, 0, cam.position.z)
        cam.updateProjectionMatrix()
        if (ctl) { ctl.target.set(cam.position.x, 0, cam.position.z); ctl.update() }
      } else {
        const cam = perspRef.current
        const s = SHOTS[shot]
        if (!cam || !s) return
        cam.position.set(...s.position)
        cam.fov = s.fov
        cam.updateProjectionMatrix()
        if (ctl) { ctl.target.set(...s.target); ctl.update() }
      }
    }
    // MapControls remounts via its key change — wait one tick for the new
    // instance to be in controlsRef before we push the target.
    const id = requestAnimationFrame(applyTarget)
    useCamera.getState().setMode(shot === 'street' ? 'planetarium' : shot)
    return () => cancelAnimationFrame(id)
  }, [shot, orthoRef, perspRef, controlsRef])

  // Persist designer pan/zoom (ortho only)
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
  // Non-Designer shots: StageCamera owns the controls via its own setup; here
  // we only need basic orbit.
  const panEnabled = !inDesigner || spaceDown
    || (!tool && !markerActive)
    || ((tool === 'surveyor' || tool === 'measure') && !hoverTarget)

  return (
    <MapControls
      key={inDesigner ? 'ortho' : 'persp'}
      ref={controlsRef}
      enableRotate={!inDesigner}
      enablePan={panEnabled}
      enableZoom
      screenSpacePanning={inDesigner}
      minZoom={0.5}
      maxZoom={40}
      minDistance={1}
      maxDistance={5000}
      /* Unlock full 360° so the operator can orbit under the map and
         verify underside lighting / normals / shadow behaviour. */
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

// ── App ─────────────────────────────────────────────────────────────────────
export default function CartographApp() {
  const orthoRef = useRef(null)
  const perspRef = useRef(null)
  const controlsRef = useRef(null)

  const shot = useCartographStore(s => s.shot)
  const tool = useCartographStore(s => s.tool)
  const markerActive = useCartographStore(s => s.markerActive)
  const markerEraserActive = useCartographStore(s => s.markerEraserActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const hoverTarget = useCartographStore(s => s.hoverTarget)
  const bgColor = useCartographStore(s => s.bgColor)
  const layerVis = useCartographStore(s => s.layerVis)
  const luColors = useCartographStore(s => s.luColors)
  const fillsVisible = useCartographStore(s => s.fillsVisible)
  const aerialVisible = useCartographStore(s => s.aerialVisible)
  const centerlineData = useCartographStore(s => s.centerlineData)

  // StagePanel state — local, used when a non-Designer shot is active
  const [keyframes, setKeyframes] = useState(() => defaultKeyframes('hero'))
  const [heroMotion, setHeroMotion] = useState({
    period: 720, tension: 0.5, easing: 'easeInOut', preview: false,
  })

  useSpaceKey()
  useLoadData()

  const hiddenLayers = {}
  for (const k in layerVis) {
    if (!layerVis[k]) hiddenLayers[k] = true
  }
  const stageHidden = fillsVisible ? hiddenLayers : {
    ...hiddenLayers,
    ground: true, park: true, building: true,
    alley: true, footway: true, tree: true, lamp: true,
  }

  const inDesigner = shot === 'designer'

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
          <TimeTicker />
          <SkyStateTicker />

          {/* ── Always rendered (the map itself) ── */}
          {inDesigner && <ambientLight intensity={1} />}
          <R3FErrorBoundary name="StreetRibbons">
            <StreetRibbons hiddenLayers={inDesigner ? hiddenLayers : stageHidden}
              luColors={luColors}
              liveCenterlines={centerlineData.streets}
              flat={inDesigner} />
          </R3FErrorBoundary>

          {/* ── Designer-only ── */}
          <group visible={inDesigner}>
            <AerialTiles visible={aerialVisible && inDesigner} />
            {/* DesignerPark owns park boundary/paths/water — suppress
                MapLayers' old bounding-box park layer so they don't fight. */}
            <MapLayers hiddenLayers={{
              ...(fillsVisible ? hiddenLayers : stageHidden),
              park: true,
              // DesignerPark owns the hand-authored path network; OSM-derived
              // footways drawing over the top produced duplicated trails.
              footway: true,
            }} />
            <DesignerPark />
            <DesignerArch />
            <SurveyorOverlay />
            {tool === 'measure' && <MeasureOverlay />}
          </group>

          {/* ── Shot-only (environment paint — must exactly mirror runtime) ── */}
          {!inDesigner && <StageShadows />}
          <group visible={!inDesigner}>
            <R3FErrorBoundary name="CelestialBodies"><CelestialBodies debugLevel={0} /></R3FErrorBoundary>
            <R3FErrorBoundary name="CloudDome"><CloudDome /></R3FErrorBoundary>
            {/* Terrain mesh hidden — the ribbons + land-use fills ARE the
                visible ground. Terrain still mounts so its shader uniforms
                drive displacement for ribbons/buildings. */}
            <group visible={false}>
              <R3FErrorBoundary name="Terrain"><Terrain /></R3FErrorBoundary>
            </group>
            <R3FErrorBoundary name="LafayettePark"><LafayettePark /></R3FErrorBoundary>
            <R3FErrorBoundary name="LafayetteScene"><LafayetteScene /></R3FErrorBoundary>
            <R3FErrorBoundary name="StreetLights"><StreetLights /></R3FErrorBoundary>
            <R3FErrorBoundary name="GatewayArch"><GatewayArch /></R3FErrorBoundary>
          </group>
          {!inDesigner && <PostProcessing />}

          <Controls controlsRef={controlsRef} />
        </Canvas>

        {inDesigner && <MarkerOverlay cameraRef={orthoRef} />}
        {inDesigner && <MarkerFAB />}
        <Toolbar />
        <StatusBar />

        {!inDesigner && (
          <StagePanelReal shot={shot}
            setShot={(s) => useCartographStore.getState().setShot(s)}
            keyframes={keyframes} setKeyframes={setKeyframes}
            heroMotion={heroMotion} setHeroMotion={setHeroMotion} />
        )}
      </div>

      {inDesigner && <Panel />}
    </div>
  )
}
