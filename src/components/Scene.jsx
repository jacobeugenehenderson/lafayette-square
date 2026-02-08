import { useRef, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, SoftShadows } from '@react-three/drei'
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing'
import * as THREE from 'three'
import LafayetteScene from './LafayetteScene'
import CelestialBodies from './CelestialBodies'
import VectorStreets from './VectorStreets'
import LafayettePark from './LafayettePark'
import StreetLights from './StreetLights'
import useCamera from '../hooks/useCamera'
import useTimeOfDay from '../hooks/useTimeOfDay'
import buildingsData from '../data/buildings.json'

// Find the nearest building position to a given (x, z)
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

// Advances the simulation time each frame
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

const EYE_HEIGHT = 1.73 // 5'8" in meters

function CameraRig() {
  const { camera } = useThree()
  const setAzimuth = useCamera((state) => state.setAzimuth)
  const controlsRef = useRef()
  const transitioning = useRef(false)
  const transitionStart = useRef(0)
  const transitionDuration = useRef(1200)
  const savedPosition = useRef(null)
  const prevMode = useRef('plan')
  const prevFlyTarget = useRef(null)

  const targetPosition = useRef(new THREE.Vector3(0, 400, 80))
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0))

  // ESC to exit street view
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && useCamera.getState().viewMode === 'street') {
        useCamera.getState().exitToPlan()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useFrame(() => {
    const ctl = controlsRef.current
    if (!ctl) return

    const vm = useCamera.getState().viewMode
    const st = useCamera.getState().streetTarget
    const ft = useCamera.getState().flyTarget

    // ── Detect mode changes ──
    if (vm !== prevMode.current) {
      if (vm === 'street' && st) {
        savedPosition.current = [camera.position.x, camera.position.y, camera.position.z]
        transitioning.current = true
        transitionStart.current = Date.now()
        transitionDuration.current = 1500

        const [x, , z] = st
        // Face toward the nearest building from the drop point
        const nearest = findNearestBuilding(x, z)
        const dx = nearest ? nearest[0] - x : -x
        const dz = nearest ? nearest[2] - z : -z
        const len = Math.sqrt(dx * dx + dz * dz) || 1
        targetPosition.current.set(x, EYE_HEIGHT, z)
        targetLookAt.current.set(x + dx / len * 0.5, EYE_HEIGHT, z + dz / len * 0.5)
      }
      if (vm === 'plan') {
        transitioning.current = true
        transitionStart.current = Date.now()
        transitionDuration.current = 1500
        const ret = savedPosition.current
        if (ret) {
          targetPosition.current.set(ret[0], ret[1], ret[2])
        } else {
          targetPosition.current.set(0, 400, 80)
        }
        targetLookAt.current.set(0, 0, 0)
        savedPosition.current = null
      }
      prevMode.current = vm
    }

    // ── Detect flyTo changes ──
    if (ft !== prevFlyTarget.current) {
      prevFlyTarget.current = ft
      if (ft && vm !== 'street') {
        transitioning.current = true
        transitionStart.current = Date.now()
        transitionDuration.current = 1200
        const [px, py, pz] = ft.position
        const [lx, ly, lz] = ft.lookAt
        targetPosition.current.set(px, py, pz)
        targetLookAt.current.set(lx, ly, lz)
      }
    }

    // ── During transition: relax all constraints so update() doesn't fight lerp ──
    if (transitioning.current) {
      ctl.minDistance = 0
      ctl.maxDistance = Infinity
      ctl.minPolarAngle = 0
      ctl.maxPolarAngle = Math.PI
      ctl.enableRotate = false
      ctl.enablePan = false
      ctl.enableZoom = false

      const elapsed = Date.now() - transitionStart.current
      const t = Math.min(elapsed / transitionDuration.current, 1)
      const ease = 1 - Math.pow(1 - t, 3)

      camera.position.lerp(targetPosition.current, ease * 0.08)
      ctl.target.lerp(targetLookAt.current, ease * 0.08)

      // Smoothly transition FOV
      const targetFov = vm === 'street' ? 75 : 45
      camera.fov += (targetFov - camera.fov) * 0.05
      camera.updateProjectionMatrix()

      ctl.update()

      // Snap to final positions and hand off to orbit controls
      if (elapsed > transitionDuration.current + 500) {
        camera.position.copy(targetPosition.current)
        ctl.target.copy(targetLookAt.current)
        camera.fov = vm === 'street' ? 75 : 45
        camera.updateProjectionMatrix()
        ctl.update()
        transitioning.current = false
      }
      return
    }

    // ── Apply mode-specific constraints ──
    if (vm === 'street') {
      ctl.minPolarAngle = Math.PI / 2
      ctl.maxPolarAngle = Math.PI * 0.99
      ctl.enableRotate = true
      ctl.enablePan = false
      ctl.enableZoom = false
      ctl.rotateSpeed = 0.35
      ctl.minDistance = 0.5
      ctl.maxDistance = 0.5
    } else {
      ctl.minPolarAngle = 0.1
      ctl.maxPolarAngle = Math.PI / 2.2
      ctl.enableRotate = true
      ctl.enablePan = true
      ctl.enableZoom = true
      ctl.panSpeed = 1.5
      ctl.minDistance = 30
      ctl.maxDistance = 2000
      ctl.rotateSpeed = 0.5
      ctl.zoomSpeed = 1.2
    }

    // ── Track azimuth ──
    const spherical = new THREE.Spherical()
    const offset = new THREE.Vector3()
    offset.copy(camera.position).sub(ctl.target)
    spherical.setFromVector3(offset)
    setAzimuth(spherical.theta)
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={true}
      dampingFactor={0.15}
    />
  )
}

function Scene() {
  const viewMode = useCamera((s) => s.viewMode)
  const isStreet = viewMode === 'street'

  return (
    <Canvas
      camera={{
        position: [0, 400, 80],
        fov: 45,
        near: 1,
        far: 60000,
      }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      dpr={[1, 2]}
      shadows="soft"
    >
      <SoftShadows size={52} samples={32} focus={0.35} />
      <TimeTicker />
      <CelestialBodies />
      <VectorStreets />
      <LafayettePark />
      <LafayetteScene />
      <StreetLights />
      <CameraRig />
      <EffectComposer>
        <N8AO
          aoRadius={12}
          intensity={6}
          distanceFalloff={0.3}
          quality="ultra"
        />
        <Bloom
          intensity={isStreet ? 1.8 : 1.2}
          luminanceThreshold={isStreet ? 0.15 : 0.3}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}

export default Scene
