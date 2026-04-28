import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { MapControls, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

// Map geometry (rendered in every shot)
import StreetRibbons from '../components/StreetRibbons.jsx'
import MapLayers from './MapLayers.jsx'
import SvgGround from './SvgGround.jsx'

// Designer-only (aerial + authoring overlays)
import AerialTiles from './AerialTiles.jsx'
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

// Toy scene fixtures (single 4-way corner for shader/shadow R&D)
import toyRibbons from '../data/toy/toy-ribbons.json'
import toyLamps from '../data/toy/toy-lamps.json'
import ToyBuildings from '../toy/ToyBuildings.jsx'
import ToyTrees from '../toy/ToyTrees.jsx'
import ToyTerrain from '../toy/ToyTerrain.jsx'

// UI
import Toolbar from './Toolbar.jsx'
import StatusBar from './StatusBar.jsx'
import Panel from './Panel.jsx'
import StagePanelReal, { defaultKeyframes } from './StagePanel.jsx'
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

// ── Camera rig ─────────────────────────────────────────────────────────────
// Canvas creates the default ortho camera (Designer). <PerspectiveCamera
// makeDefault /> takes over for shots; flipping makeDefault back to false
// returns control to the Canvas's ortho camera.
function CameraRig({ orthoRef, perspRef, controlsRef }) {
  const { camera, scene, size } = useThree()
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
    if (appliedShot.current === shot) return
    appliedShot.current = shot
    const applyTarget = () => {
      const ctl = controlsRef.current
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
        // Coming from Designer into Browse: copy x/z + derive altitude from
        // ortho zoom so the perspective view frames the same ground patch.
        if (shot === 'browse' && prevShot.current === 'designer' && orthoRef.current) {
          const ortho = orthoRef.current
          const fovRad = (s.fov * Math.PI) / 180
          const visibleH = size.height / Math.max(ortho.zoom, 1e-6)
          const altitude = visibleH / (2 * Math.tan(fovRad / 2))
          cam.position.set(ortho.position.x, altitude, ortho.position.z)
          cam.up.set(...(s.up || [0, 1, 0]))
          cam.fov = s.fov
          cam.lookAt(ortho.position.x, 0, ortho.position.z)
          cam.updateProjectionMatrix()
          if (ctl) { ctl.target.set(ortho.position.x, 0, ortho.position.z); ctl.update() }
        } else {
          cam.position.set(...s.position)
          cam.up.set(...(s.up || [0, 1, 0]))
          cam.fov = s.fov
          cam.lookAt(...s.target)
          cam.updateProjectionMatrix()
          if (ctl) { ctl.target.set(...s.target); ctl.update() }
        }
      }
      prevShot.current = shot
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
  // Browse is a fixed overhead — pan + zoom only, rotation locked. The
  // perspective camera stays where StageCamera placed it (top-down at
  // SHOTS.browse.position); we just constrain what the user can do to it.
  if (shot === 'browse') {
    return (
      <MapControls
        key="browse"
        ref={controlsRef}
        enableRotate={false}
        enablePan
        enableZoom
        screenSpacePanning
        minDistance={50}
        maxDistance={2000}
      />
    )
  }
  return (
    <OrbitControlsShot controlsRef={controlsRef} />
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
      ref={(r) => { localRef.current = r; if (controlsRef) controlsRef.current = r }}
      enablePan
      enableRotate
      enableZoom
      screenSpacePanning={false}
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
  const engineeringHidden = useCartographStore(s => s.engineeringHidden)

  // StagePanel state — local, used when a non-Designer shot is active
  const [keyframes, setKeyframes] = useState(() => defaultKeyframes('hero'))
  const [heroMotion, setHeroMotion] = useState({
    period: 720, tension: 0.5, easing: 'easeInOut', preview: false,
  })

  useSpaceKey()
  useLoadData()

  const inDesigner = shot === 'designer'

  // Effective hidden layers in Designer = active Look's layerVis(false)
  // ∪ ephemeral engineeringHidden. Stage gets only layerVis (stageHidden
  // is computed below). engineeringHidden never persists or reaches Stage.
  const hiddenLayers = {}
  for (const k in layerVis) {
    if (!layerVis[k]) hiddenLayers[k] = true
  }
  if (inDesigner) {
    for (const k in engineeringHidden) {
      if (engineeringHidden[k]) hiddenLayers[k] = true
    }
  }
  // Background view: aerialVisible swaps the painted background between
  // curated SVG and aerial photo. Curated rendering hides only when
  // aerial is on AND we're in pure Design — under tools, ribbons +
  // tool affordances stay over the aerial as reference, and the user
  // declutters via per-layer engineering-visibility toggles in the
  // Designer Panel.
  const designAerialOnly = inDesigner && !tool && aerialVisible
  // When a tool is active, hide the giant off-map ground plane so the
  // background (curated or aerial) shows through under the streets.
  const toolActive = inDesigner && !!tool && scene !== 'toy'
  const corridorSelected = toolActive && selectedStreet !== null
  const decorationsHidden = toolActive ? { ...hiddenLayers, ground: true } : hiddenLayers
  // Shots use the same hidden layers as Designer; the old Fills-OFF
  // shot variant retired with the Fills toggle.
  const stageHidden = hiddenLayers

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

          {/* ── Live ribbon mesh: Designer (any scene) and toy (any shot)
              consume ribbons.json directly. Stage neighborhood shots
              consume the baked SVG via <SvgGround/> instead. ── */}
          {inDesigner && <ambientLight intensity={1} />}
          {(inDesigner || scene === 'toy') && (
          <R3FErrorBoundary name="StreetRibbons">
            <group visible={!designAerialOnly}>
            <StreetRibbons hiddenLayers={inDesigner ? hiddenLayers : stageHidden}
              luColors={luColors}
              liveCenterlines={scene === 'toy' ? null : centerlineData.streets}
              measureActive={tool === 'measure' && inDesigner && scene !== 'toy'}
              surveyActive={tool === 'surveyor' && inDesigner && scene !== 'toy'}
              selectedCorridorNames={(() => {
                // Selection highlight is only meaningful while a tool is
                // active — it dims the chain so its aerial reads through
                // for alignment/measurement. Outside any tool the chain
                // should render like every other street.
                if (!tool || !inDesigner) return null
                if (selectedStreet === null) return null
                const corridor = corridorByIdx?.get(selectedStreet)
                if (corridor) {
                  const names = new Set()
                  for (const idx of corridor) {
                    const s = centerlineData.streets[idx]
                    if (s?.name) names.add(s.name)
                  }
                  return names
                }
                const s = centerlineData?.streets?.[selectedStreet]
                return s?.name ? new Set([s.name]) : null
              })()}
              flat={inDesigner}
              ribbons={scene === 'toy' ? toyRibbons : undefined}
              useBoundary={scene !== 'toy'}
              hideFaceFills={false} />
            </group>
          </R3FErrorBoundary>
          )}

          {/* ── Baked-SVG ground for Stage shots (neighborhood scene). ── */}
          {!inDesigner && scene === 'neighborhood' && (
            <R3FErrorBoundary name="SvgGround"><SvgGround /></R3FErrorBoundary>
          )}

          {/* ── Map layers (flat ground geometry — neighborhood only).
              In shots, layers with 3D equivalents (park, buildings, trees,
              lamps, water) are suppressed so the 3D components own them. */}
          {scene === 'neighborhood' && (
            <MapLayers hiddenLayers={inDesigner ? decorationsHidden : stageHidden} inShot={!inDesigner}
              surveyActive={tool === 'surveyor' && inDesigner && scene !== 'toy'}
              measureActive={tool === 'measure' && inDesigner && scene !== 'toy'} />
          )}

          {/* ── Designer-only UI overlays (authoring tools only make sense
              against the real neighborhood data) ──
              All four mount only in Designer; shots don't need them and
              keeping them out of the tree means TextureLoader never fires
              for the 64 aerial tiles when the operator is in a shot. */}
          {inDesigner && scene === 'neighborhood' && <>
            <AerialTiles visible={!!tool || aerialVisible} />
            <DesignerArch />
            <SurveyorOverlay />
            {tool === 'measure' && <MeasureOverlay />}
          </>}

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
            {/* Heavy 3D-only props — skip mounting entirely in Designer
                (flat top-down view doesn't render trees/arch/lamps/scene
                detail, and `visible={false}` doesn't prevent the children's
                expensive useMemos from running). They mount as soon as a
                shot is active. */}
            {scene === 'neighborhood' && !inDesigner && <>
              <R3FErrorBoundary name="LafayettePark"><LafayettePark /></R3FErrorBoundary>
              <R3FErrorBoundary name="LafayetteScene"><LafayetteScene /></R3FErrorBoundary>
              <R3FErrorBoundary name="StreetLights"><StreetLights /></R3FErrorBoundary>
              <R3FErrorBoundary name="GatewayArch"><GatewayArch /></R3FErrorBoundary>
            </>}
            {scene === 'toy' && <>
              <R3FErrorBoundary name="ToyTerrain"><ToyTerrain /></R3FErrorBoundary>
              <R3FErrorBoundary name="ToyBuildings"><ToyBuildings /></R3FErrorBoundary>
              <R3FErrorBoundary name="ToyTrees"><ToyTrees /></R3FErrorBoundary>
              <R3FErrorBoundary name="ToyStreetLights"><StreetLights lamps={toyLamps.lamps} /></R3FErrorBoundary>
            </>}
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
            heroMotion={heroMotion} setHeroMotion={setHeroMotion}
            surfacesSlot={scene === 'neighborhood' ? <CartographSurfaces /> : undefined} />
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
