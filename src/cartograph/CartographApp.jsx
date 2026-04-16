import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { MapControls } from '@react-three/drei'
import * as THREE from 'three'
import StreetRibbons from '../components/StreetRibbons.jsx'
import AerialTiles from './AerialTiles.jsx'
import MapLayers from './MapLayers.jsx'
import SurveyorOverlay from './SurveyorOverlay.jsx'
import MeasureOverlay from './MeasureOverlay.jsx'
import MarkerOverlay from './MarkerOverlay.jsx'
import StageCanvas from './StageCanvas.jsx'
import Toolbar from './Toolbar.jsx'
import StatusBar from './StatusBar.jsx'
import Panel from './Panel.jsx'
import StagePanelReal, { defaultKeyframes } from './StagePanel.jsx'
import useCartographStore from './stores/useCartographStore.js'

const CAM_KEY = 'cartograph-camera'

function CameraSetup({ cameraRef, glRef }) {
  const { camera, gl, invalidate } = useThree()
  const didSetup = useRef(false)
  useEffect(() => {
    cameraRef.current = camera
    glRef.current = gl.domElement
    if (didSetup.current) return
    didSetup.current = true

    // Restore saved camera position or use default
    let cx = 0, cz = 0, zoom = 3
    try {
      const saved = JSON.parse(localStorage.getItem(CAM_KEY))
      if (saved) { cx = saved.x; cz = saved.z; zoom = saved.zoom }
    } catch { /* ignore */ }

    camera.position.set(cx, 500, cz)
    camera.up.set(0, 0, -1)
    camera.lookAt(cx, 0, cz)
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, gl, invalidate, cameraRef, glRef])

  // Persist camera position on move (only when flat canvas is active)
  useEffect(() => {
    let rafId
    let lastX = 0, lastZ = 0, lastZoom = 0
    const persist = () => {
      const cam = cameraRef.current
      const storeMode = useCartographStore.getState().mode
      if (storeMode !== 'stage' && cam && (cam.position.x !== lastX || cam.position.z !== lastZ || cam.zoom !== lastZoom)) {
        lastX = cam.position.x; lastZ = cam.position.z; lastZoom = cam.zoom
        localStorage.setItem(CAM_KEY, JSON.stringify({ x: lastX, z: lastZ, zoom: lastZoom }))
      }
      rafId = requestAnimationFrame(persist)
    }
    rafId = requestAnimationFrame(persist)
    return () => cancelAnimationFrame(rafId)
  }, [cameraRef])

  return null
}

function Controls() {
  const mode = useCartographStore(s => s.mode)
  const markerActive = useCartographStore(s => s.markerActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const hoverTarget = useCartographStore(s => s.hoverTarget)
  // Pan: on by default, disabled when hovering a target in tool modes (so drag goes to overlay)
  // Space always overrides to enable pan
  const panEnabled = spaceDown || ((!mode && !markerActive) || (mode === 'measure' && !hoverTarget))

  return (
    <MapControls
      enableRotate={false}
      enablePan={panEnabled}
      enableZoom
      screenSpacePanning
      minZoom={0.5}
      maxZoom={40}
    />
  )
}

function useSpaceKey() {
  const setSpaceDown = useCartographStore(s => s.setSpaceDown)
  useEffect(() => {
    const onDown = (e) => {
      if (e.code !== 'Space') return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (!useCartographStore.getState().mode && !useCartographStore.getState().markerActive) return
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

// Pre-set time to noon so CelestialBodies starts with daylight
import useTimeOfDay from '../hooks/useTimeOfDay'
useTimeOfDay.getState().setHour(12)

export default function CartographApp() {
  const cameraRef = useRef(null)
  const glRef = useRef(null)
  const mode = useCartographStore(s => s.mode)

  // Stage panel state
  const [shot, setShot] = useState('hero')
  const [keyframes, setKeyframes] = useState(() => defaultKeyframes('hero'))
  const [heroMotion, setHeroMotion] = useState({
    period: 720, tension: 0.5, easing: 'easeInOut', preview: false,
  })
  const markerActive = useCartographStore(s => s.markerActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const hoverTarget = useCartographStore(s => s.hoverTarget)
  const bgColor = useCartographStore(s => s.bgColor)
  const layerVis = useCartographStore(s => s.layerVis)

  useSpaceKey()
  useLoadData()

  // Mode-specific workspace: override layer visibility per mode
  const effectiveVis = { ...layerVis }
  const hiddenLayers = {}

  const isToolMode = mode === 'surveyor' || mode === 'measure'

  if (isToolMode) {
    // Tool modes: hide everything — aerial + overlay rendered independently
    for (const k in effectiveVis) effectiveVis[k] = false
  }

  for (const k in effectiveVis) {
    if (!effectiveVis[k]) hiddenLayers[k] = true
  }

  let cursor = 'grab'
  if (markerActive && !spaceDown) cursor = 'crosshair'
  else if ((mode || markerActive) && hoverTarget && !spaceDown) cursor = 'pointer'

  const isStage = mode === 'stage'

  return (
    <div className="cartograph" style={isStage ? { background: '#000' } : bgColor !== '#1a1a18' ? { background: bgColor } : undefined}>
      <div className="carto-canvas-wrap" style={{ cursor: isStage ? 'default' : cursor }}>
        {/* ── Flat workspace: unmounted when Stage is active ── */}
        {!isStage && <div style={{ position: 'absolute', inset: 0 }}>
          <Canvas
            orthographic
            frameloop="always"
            camera={{
              position: [0, 500, 0],
              zoom: 3,
              near: 0.1,
              far: 2000,
            }}
            style={{ cursor: 'inherit' }}
          >
            <CameraSetup cameraRef={cameraRef} glRef={glRef} />
            <ambientLight intensity={1} />
            <AerialTiles />
            {!isToolMode && <StreetRibbons hiddenLayers={hiddenLayers} flat />}
            {!isToolMode && <MapLayers hiddenLayers={hiddenLayers} />}
            <SurveyorOverlay />
            {mode === 'measure' && <MeasureOverlay />}
            <Controls />
          </Canvas>
        </div>}

        {/* ── Stage: mounted when active ── */}
        {isStage && (
          <Canvas
            frameloop="demand"
            camera={{ position: [-400, 55, 230], fov: 22, near: 1, far: 60000 }}
            gl={{
              alpha: false, antialias: true, stencil: true,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.95,
            }}
            onCreated={({ gl, camera }) => {
              gl.setClearColor(0x2a2a26, 1)
              camera.lookAt(400, 45, -100)
            }}
            dpr={[1, 1.5]}
            shadows="soft"
            style={{ position: 'absolute', inset: 0 }}
          >
            <StageCanvas shot={shot} />
          </Canvas>
        )}

        {!isStage && <MarkerOverlay cameraRef={cameraRef} />}
        <Toolbar />
        <StatusBar />

        {/* Stage floating panel overlay (same style as /stage) */}
        {isStage && (
          <StagePanelReal shot={shot} setShot={setShot}
            keyframes={keyframes} setKeyframes={setKeyframes}
            heroMotion={heroMotion} setHeroMotion={setHeroMotion} />
        )}
      </div>

      {/* Right sidebar panel — hidden in stage mode */}
      {!isStage && <Panel />}
    </div>
  )
}
