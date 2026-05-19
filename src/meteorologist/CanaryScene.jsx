/**
 * CanaryScene — Meteorologist's authoring viewport.
 *
 * Phase 4a scaffold: real <Canvas> with sky/sun/moon via the shared
 * CelestialBodies consumer (sourced from useSceneJson(activeLookId)),
 * flat ground plane + one hero tree in the GROUND slot, and the v3
 * raymarched <Atmosphere /> as the cloud renderer (Phase 4b.1 swap;
 * uniforms hardcoded to cumulus_humilis, preset binding lands 4b.2).
 * Two static camera framings.
 *
 * Composition follows feedback_preview_uses_production_pipeline +
 * project_kit_helpers_pattern: Meteorologist mounts Cartograph's
 * published scene.json and Arborist's per-Look GLB, doesn't reproduce
 * either pipeline.
 *
 * What Phase 4a does NOT do:
 *   - Drive the cloud from the active Teapot preset's TodChannel params
 *     (Phase 4b mounts <Atmosphere /> with that wiring).
 *   - Drive the cloud from the active Condition's directive (Phase 4b).
 *   - Provide camera controls. Static per slot.
 *
 * logarithmicDepthBuffer is mandatory — kit-wide depth precision,
 * matching Stage + Preview. Raw shaders rely on this chain.
 * (feedback_raw_shadermaterial_needs_logdepth_chunks)
 *
 * GLB paths route through import.meta.env.BASE_URL so the same build
 * runs at apex or any subpath (project_kit_deploy_path_agnostic).
 */
import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import CelestialBodies from '../components/CelestialBodies.jsx'
import Atmosphere from '../components/Atmosphere.jsx'
import { CANARY_CAMERAS } from './canaryCamera.js'

const HERO_TREE_SPECIES = 'platanus_acerifolia'
const HERO_TREE_SKELETON = 'skeleton-1-lod0.glb'

export default function CanaryScene({ slot = 'chamber' }) {
  const activeLookId = useMeteorologistStore(s => s.activeLookId)
  const cam = CANARY_CAMERAS[slot] || CANARY_CAMERAS.chamber

  return (
    <Canvas
      // `key={slot}` rebuilds the Canvas when the slot framing changes so
      // we get the new camera + ground/tree toggle without juggling
      // imperative camera-lookAt updates. Cheap — single tree GLB, no
      // post-FX.
      key={slot}
      gl={{
        antialias: true, alpha: false,
        logarithmicDepthBuffer: true,
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%', display: 'block' }}
      frameloop="always"
    >
      <SceneCamera cam={cam} />
      <TimeTicker />
      <SkyStateTicker />
      {/* Defaults give a visible cloud envelope; brief flagged that
          useSkyState defaults are the driver in Phase 4a — disclosed. */}
      <CloudCoverSeed />

      <Suspense fallback={null}>
        <CelestialBodies lookId={activeLookId} bakeLastMs={Date.now()} />
      </Suspense>

      {cam.showGround && <GroundPlane />}
      {cam.showGround && activeLookId && (
        <Suspense fallback={null}>
          <HeroTree lookId={activeLookId} />
        </Suspense>
      )}

      <Atmosphere lookId={activeLookId} />

      {/* Free-orbit camera controls. Different target per slot:
          - chamber: orbit a point in the cloud volume above the operator.
          - ground:  orbit around the hero tree's mid-canopy. */}
      <OrbitControls
        makeDefault
        target={cam.target}
        enableDamping
        dampingFactor={0.1}
        minDistance={cam.showGround ? 8 : 50}
        maxDistance={cam.showGround ? 80 : 3000}
      />
    </Canvas>
  )
}

// ── Camera ────────────────────────────────────────────────────────────
// PerspectiveCamera makeDefault wires the active camera; lookAt runs
// imperatively on mount so the `target` aims at canopy / cloud height.
function SceneCamera({ cam }) {
  const ref = useRef()
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.lookAt(...cam.target)
    c.updateProjectionMatrix()
  }, [cam])
  return (
    <PerspectiveCamera
      ref={ref}
      makeDefault
      position={cam.position}
      fov={cam.fov}
      near={0.1}
      far={60000}
    />
  )
}

// ── Frame drivers ─────────────────────────────────────────────────────
// Same pattern PreviewApp uses (lines 67–75). TimeTicker advances the
// TOD clock; SkyStateTicker animates cloudCover/storminess interpolation
// + wind drift. Without these, CelestialBodies' sun position freezes
// and CloudDome's wind offset never accumulates.
function TimeTicker() {
  const tick = useTimeOfDay(s => s.tick)
  const last = useRef(Date.now())
  useFrame(() => {
    if (typeof tick !== 'function') return
    const n = Date.now(); tick(n - last.current); last.current = n
  })
  return null
}
function SkyStateTicker() {
  useFrame((_, d) => {
    const sky = useSkyState.getState()
    if (typeof sky.tick === 'function') sky.tick(Math.min(d, 0.1))
  })
  return null
}

// One-shot seed: useSkyState's defaults have cloudCover: 0, which would
// render an empty sky. Phase 4a's stated goal is "clouds visible
// against real sky for the first time" — without a weather fetcher
// (Production-only) the operator would see nothing. Seed a moderate
// envelope so the placeholder cloud is actually placed. Disclosed.
function CloudCoverSeed() {
  useEffect(() => {
    const sky = useSkyState.getState()
    if (typeof sky.setCloudCover === 'function') {
      sky.setCloudCover(0.45)
    } else {
      useSkyState.setState({ cloudCover: 0.45, storminess: 0.15 })
    }
  }, [])
  return null
}

// ── Ground ────────────────────────────────────────────────────────────
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#5c5040" roughness={0.95} />
    </mesh>
  )
}

// ── Hero tree ─────────────────────────────────────────────────────────
// Direct GLB via useGLTF — bypasses InstancedTrees because Meteorologist
// places exactly one tree as a scale reference, not a population.
//
// ⚠ KNOWN-PENDING (2026-05-20): renders with embedded GLB materials only;
// Arborist's runtime `applyBarkUniforms` + atlas tinting are not applied,
// so the tree appears unlit white/grayscale instead of properly bark-
// and-leaf-textured. Fix path: Arborist coordinator exports
// `applyBarkUniforms` + an atlas-loader from `treeAtlasMaterial.js`; this
// component consumes them. Tracked in a follow-up coordinator brief
// dated 2026-05-20. Until then, the tree silhouette + scale are
// correct, just color/texture wrong.
//
// Tree selection: reads `meteorologist-canary-tree` from localStorage (set
// by Arborist's Grove/Workstage canary-picker button per the 2026-05-20
// cross-helper contract). Falls back to platanus_acerifolia/skeleton-1
// from the active Meteorologist Look if no preference is set.
// Cross-tab updates via `storage` events.
//
// 404 fallback: if the resolved GLB doesn't exist (e.g. the payload's
// lookId+species combination wasn't baked), useGLTF throws and the
// Suspense boundary swallows it. The viewport continues to render sky +
// ground without a tree. Operator-visible: pick a different tree in
// Arborist.
function useCanaryTreePref() {
  const [pref, setPref] = useState(() => {
    if (typeof localStorage === 'undefined') return null
    try { return JSON.parse(localStorage.getItem('meteorologist-canary-tree') ?? 'null') }
    catch { return null }
  })
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'meteorologist-canary-tree') return
      try { setPref(JSON.parse(e.newValue ?? 'null')) }
      catch { setPref(null) }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return pref
}

function HeroTree({ lookId }) {
  const pref = useCanaryTreePref()
  const species  = pref?.species ?? HERO_TREE_SPECIES
  const variant  = pref?.variantId != null ? `skeleton-${pref.variantId}-lod0.glb` : HERO_TREE_SKELETON
  const treeLook = pref?.lookId ?? lookId
  const url = `${import.meta.env.BASE_URL}baked/${treeLook}/trees/${species}/${variant}`
  const { scene } = useGLTF(url)
  return <primitive object={scene} position={[0, 0, 0]} />
}
