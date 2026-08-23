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
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import useAtmosphere from '../hooks/useAtmosphere.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { defaultWindState, resolveWindState } from '../lib/wind-field.js'
import { applyDegrees, DEFAULT_DEGREES } from '../lib/condition-degrees.js'
import CelestialBodies from '../components/CelestialBodies.jsx'
import Atmosphere from '../components/Atmosphere.jsx'
import WeatherEffects from '../components/WeatherEffects.jsx'
import {
  useTreeAtlas,
  applyBarkUniforms,
  applyDeformerUniforms,
  stampTreeVertexAttrs,
  treeSwayUniforms,
} from '../components/treeAtlasMaterial.js'
import { CANARY_CAMERAS } from './canaryCamera.js'
import { useCanaryTree } from '../lib/canaryTree.js'

// Gentle authoring breeze used when the active Condition's directive
// carries no wind yet (Phase 5 directive→viewport wiring still pending).
// Keeps the canopy reading as alive; once a Condition supplies real wind
// the resolved directive overrides this. m/s.
const HERO_BREEZE_MPS = 3.0
// Module-scoped wind state, reused per frame (mirrors InstancedTrees'
// SwayDriver — one allocation, mutated in place).
const _heroWindState = defaultWindState()

const HERO_TREE_SPECIES = 'platanus_acerifolia'
const HERO_TREE_SKELETON = 'skeleton-1-lod0.glb'

// Display altitude for the authoring viewport. CANARY_CAMERAS are framed for
// a cloud band at ~1200m (browse looks down from y=4000; ground looks up from
// eye level), so we normalize every preset's placement here regardless of its
// real baseAlt. Keep in sync with CANARY_CAMERAS framing in canaryCamera.js.
const CANARY_DISPLAY_BASE_ALT = 1200

export default function CanaryScene({ slot = 'browse', directive = null, degrees = DEFAULT_DEGREES }) {
  const activeLookId = useMeteorologistStore(s => s.activeLookId)
  const cam = CANARY_CAMERAS[slot] || CANARY_CAMERAS.browse

  // Derive circular-dolly lock values from the camera's starting
  // position + target. Only matters when cam.lockDolly is true:
  // radius = distance(position, target); polar = acos(dy / radius).
  // Both values then constrain OrbitControls so the camera traces a
  // horizontal arc at constant height + distance, only azimuth varies.
  const dolly = (() => {
    if (!cam.lockDolly) return null
    const dx = cam.position[0] - cam.target[0]
    const dy = cam.position[1] - cam.target[1]
    const dz = cam.position[2] - cam.target[2]
    const radius = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const polar = Math.acos(dy / radius)
    return { radius, polar }
  })()

  return (
    <Canvas
      // `key={slot}` rebuilds the Canvas when the slot framing changes so
      // we get the new camera + ground/tree toggle without juggling
      // imperative camera-lookAt updates. Cheap — single tree GLB, no
      // post-FX.
      key={slot}
      // `shadows` enables three's shadow-map pipeline. CelestialBodies'
      // sun is already configured castShadow + 4096² shadow map (sized
      // for LS-scale ground but our 200m canary plane fits comfortably
      // inside its 1800m frustum). Tree + ground set cast/receive flags
      // below.
      shadows
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
      {/* Environment wiring (Conditions context): the active Condition's
          directive drives the canary the way it drives the LS install —
          clouds/wind/precip via useAtmosphere, scene darkening via
          useSkyState. When no directive is supplied (Teapot), seed a mild
          envelope so the placeholder cloud is visible. */}
      {directive
        ? <ConditionEnvironmentDriver directive={directive} degrees={degrees} />
        : <CloudCoverSeed />}
      <CanaryFog lookId={activeLookId} />

      <Suspense fallback={null}>
        <CelestialBodies lookId={activeLookId} bakeLastMs={Date.now()} />
      </Suspense>

      {cam.showGround && <GroundPlane />}
      {cam.showGround && activeLookId && (
        <Suspense fallback={null}>
          <HeroTree lookId={activeLookId} />
        </Suspense>
      )}

      {/* In-situ weather: rain/snow particles, wetness, lightning. Ground
          slot only — the Cloud Chamber reads the cloud's shape/light under
          the condition, not the full precip scene. Driven by the directive
          the ConditionEnvironmentDriver pushed into useAtmosphere. */}
      {directive && cam.showGround && <WeatherEffects />}

      {/* Authoring normalize: the Canary cameras frame the ~1200m band, so
          place EVERY selected preset there regardless of its real baseAlt
          (cirrus 9000m, stratus 300m). The operator authors cloud SHAPE here;
          real-altitude placement is a production concern. */}
      <Atmosphere lookId={activeLookId} displayBaseAlt={CANARY_DISPLAY_BASE_ALT} />

      {/* Orbit controls — only mounted if the slot wants them.
          BROWSE is locked (matches production's static overhead).
          GROUND uses a "circular dolly" lock: polar angle + radius
          both fixed at their starting values; only azimuth varies.
          Camera traces a horizontal arc around the tree at eye
          height. Pan + zoom disabled. */}
      {cam.orbit && dolly && (
        <OrbitControls
          makeDefault
          target={cam.target}
          enableDamping
          dampingFactor={0.1}
          enablePan={false}
          enableZoom={false}
          minDistance={dolly.radius}
          maxDistance={dolly.radius}
          minPolarAngle={dolly.polar}
          maxPolarAngle={dolly.polar}
        />
      )}
      {cam.orbit && !dolly && (
        <OrbitControls
          makeDefault
          target={cam.target}
          enableDamping
          dampingFactor={0.1}
          minDistance={cam.minDistance}
          maxDistance={cam.maxDistance}
        />
      )}
    </Canvas>
  )
}

// ── Camera ────────────────────────────────────────────────────────────
// PerspectiveCamera makeDefault wires the active camera; lookAt runs
// imperatively on mount so the `target` aims at canopy / cloud height.
// `cam.up` (when present) reorients the camera's up vector before
// lookAt — needed for true 90° overhead (BROWSE) where the default
// world-up [0, 1, 0] degenerates with a straight-down view.
function SceneCamera({ cam }) {
  const ref = useRef()
  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (cam.up) c.up.set(...cam.up)
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

// ── Condition → environment bridge ────────────────────────────────────
// The staging-area doctrine in action: a selected Condition drives the
// canary the same way it drives the LS install, through the SAME shared
// stores — no canary-only effects. Two stores carry "weather":
//   • useAtmosphere (the directive) → cloud blend + color, wind, precip,
//     lightning. Consumed by <Atmosphere>, HeroTree sway, <WeatherEffects>.
//   • useSkyState (cloudCover/storminess) → the actual scene DARKENING:
//     CelestialBodies dims the sun by (1 − cloudCover·0.6); GradientSky
//     desaturates + darkens by storminess. The directive alone does NOT
//     darken the ground — that's why both stores are driven here.
const clamp01 = (v) => Math.max(0, Math.min(1, v))

// The almanac authors no cloudCover/storminess; derive them from the
// directive's own darkness signals so the scene reads as overcast/stormy.
function deriveSkyScalars(directive) {
  const precipI = directive?.precip?.intensity ?? 0
  const sunI = directive?.sun?.intensity ?? 1.2          // ~1.2 = "normal" day
  const darkness = clamp01((1.2 - sunI) / 1.2)           // dim sun ⇒ dark sky
  const cloudWeight = (directive?.clouds ?? [])
    .reduce((s, c) => s + (c.weight ?? 0), 0)            // blend total ≈ coverage
  return {
    cloudCover: clamp01(Math.max(cloudWeight, precipI, darkness)),
    storminess: clamp01(Math.max(precipI * 0.9, darkness)),
    turbidity:  clamp01(darkness * 0.3),
  }
}

// The almanac has no `lightning` field (see STATUS.md); synthesize a rate
// for visibly-stormy conditions so a thunderstorm actually flashes. An
// authored field (Phase 3b) wins if present.
function augmentDirective(directive) {
  if (!directive || directive.lightning) return directive
  const precip = directive.precip || {}
  const precipI = precip.intensity ?? 0
  const sunI = directive.sun?.intensity ?? 1.2
  const darkness = clamp01((1.2 - sunI) / 1.2)
  const stormy = precip.kind === 'rain' && precipI >= 0.6 && darkness >= 0.45
  if (!stormy) return directive
  return {
    ...directive,
    lightning: { rate: 0.12 + precipI * 0.15, kind: 'cloud_to_ground' },
  }
}

function ConditionEnvironmentDriver({ directive, degrees = DEFAULT_DEGREES }) {
  const setActivePreset = useMeteorologistStore(s => s.setActivePreset)

  // Force <Atmosphere>'s directive render path: clear any stale active
  // preset so getActivePreset() returns null (in Conditions you author a
  // condition, not a preset). Routing keys on mode+activeConditionId, so
  // this doesn't unmount the editor. Reset the shared stores on unmount so
  // leaving the editor doesn't leave the canary frozen in the last weather.
  useEffect(() => {
    setActivePreset(null)
    return () => {
      useAtmosphere.getState().setRawDirective(null)
      useAtmosphere.getState().setTweenedDirective(null)
      useSkyState.setState({
        cloudCover: 0, _targetCloudCover: 0,
        storminess: 0, _targetStorminess: 0,
        turbidity: 0,  _targetTurbidity: 0,
      })
    }
  }, [setActivePreset])

  // Push the EFFECTIVE directive (Condition × Degrees) + derived darkening
  // every time the condition or the scrubbed Degrees change. applyDegrees is
  // the continuous-response core (WEATHER-MODEL.md §4): the look is a function
  // of the Degrees, so scrubbing precip/wind/cover previews drizzle→downpour
  // continuously. Deriving skyState from the EFFECTIVE directive (not the
  // base) makes the darkening track cover/precip automatically. Current +
  // target are set together so the authoring view updates instantly rather
  // than tweening over ~90s.
  const dp = degrees?.precip, dw = degrees?.wind, dc = degrees?.cover
  useEffect(() => {
    if (!directive) return
    const eff = applyDegrees(directive, degrees)
    const aug = augmentDirective(eff)
    useAtmosphere.getState().setRawDirective(aug)
    useAtmosphere.getState().setTweenedDirective(aug)
    const { cloudCover, storminess, turbidity } = deriveSkyScalars(eff)
    useSkyState.setState({
      cloudCover, _targetCloudCover: cloudCover,
      storminess, _targetStorminess: storminess,
      turbidity,  _targetTurbidity: turbidity,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directive, dp, dw, dc])

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
// Renders through the SAME shared atlas material the LS runtime mounts
// (treeAtlasMaterial.js#useTreeAtlas), so the canary tree picks up bark
// gradient + leaf atlas tinting, is lit by the scene's sun (lit
// MeshStandardMaterial, not the GLB's flat embedded materials), and sways
// via the shared injectFoliageSway vertex path driven by the atmosphere
// directive — exactly like the trees in the LS skymap install, so
// Conditions "feels" like production. Mirrors SpecimenViewport's Skeleton
// (Salon's single-tree authoring surface): stamp per-vertex attrs →
// replace material → per-frame applyBarkUniforms/applyDeformerUniforms;
// wind via treeSwayUniforms (SwayDriver pattern).
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
function HeroTree({ lookId }) {
  const pref = useCanaryTree()
  const species   = pref?.species ?? HERO_TREE_SPECIES
  const variantId = pref?.variantId ?? 1
  const variant   = pref?.variantId != null ? `skeleton-${pref.variantId}-lod0.glb` : HERO_TREE_SKELETON
  const treeLook  = pref?.lookId ?? lookId
  const url = `${import.meta.env.BASE_URL}baked/${treeLook}/trees/${species}/${variant}`
  const { scene } = useGLTF(url)
  const groupRef = useRef()

  // Shared per-Look atlas — the same path the LS runtime uses
  // (InstancedTrees#ParkPopulation). Yields the lit MeshStandardMaterial
  // (bark + leaf atlas + normal map) and the per-species/-variant bark
  // manifest. Status flows idle → loading → ready as the atlas bakes.
  const atlas = useTreeAtlas(treeLook)

  // Anchor the GLB base at the group origin so the trunk meets the ground
  // plane regardless of where Arborist's publish-glb pipeline put the GLB
  // origin. Geometry-local; independent of the material swap below.
  useEffect(() => {
    if (!scene) return
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    scene.position.set(-center.x, -box.min.y, -center.z)
  }, [scene])

  // Replace the GLB's embedded materials with the shared atlas material and
  // stamp the per-vertex signals (aBark / aBarkRegion / aWindTier /
  // aTreeHeightNorm) the shared shader reads. Mirrors SpecimenViewport's
  // Skeleton. aTreeHeightNorm normalizes against the chassis-wide local-Y
  // range, pre-scanned over all meshes to match the LS runtime axis.
  useEffect(() => {
    if (!scene || !atlas.treeMaterial) return
    let chMinY = Infinity, chMaxY = -Infinity
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return
      o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox
      if (bb) { chMinY = Math.min(chMinY, bb.min.y); chMaxY = Math.max(chMaxY, bb.max.y) }
    })
    const chassisMinY = Number.isFinite(chMinY) ? chMinY : 0
    const chassisYRange = Math.max(1e-4, chMaxY - chMinY)
    scene.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = false
      if (o.geometry) {
        stampTreeVertexAttrs(o.geometry, { chassisMinY, chassisYRange }, o)
        // Vertex colors flip USE_COLOR and compile a parallel program; the
        // shared material expects none.
        if (o.geometry.attributes?.color) o.geometry.deleteAttribute('color')
      }
      o.material = atlas.treeMaterial
    })
  }, [scene, atlas.treeMaterial])

  // Per-species/-variant bark slots, resolved from the atlas manifest (same
  // lookups as InstancedTrees#ParkPopulation; variantId keys may be numeric
  // or string).
  const barkUniforms = useMemo(() => {
    const m = atlas.manifest
    if (!m) return null
    return {
      barkSettings:   m.barkBySpecies?.[species] || null,
      gradientSlot:   m.barkGradientByVariant?.[species]?.[variantId]
                        || m.barkGradientByVariant?.[species]?.[String(variantId)] || null,
      detailSlot:     m.barkDetailBySpecies?.[species] || null,
      posterizedSlot: m.barkPosterizedBySpecies?.[species] || null,
      deformerRange:  m.deformerBySpecies?.[species]?.range || null,
    }
  }, [atlas.manifest, species, variantId])

  // Bark/deformer uniforms applied per frame: material.userData.shader
  // doesn't exist until three compiles the program on first render, so a
  // pre-paint effect would early-return forever (matches Skeleton).
  useFrame(() => {
    if (!atlas.treeMaterial || !barkUniforms) return
    applyBarkUniforms(
      atlas.treeMaterial,
      barkUniforms.barkSettings,
      barkUniforms.gradientSlot,
      barkUniforms.detailSlot,
      barkUniforms.posterizedSlot,
    )
    applyDeformerUniforms(atlas.treeMaterial, barkUniforms.deformerRange, null)
  })

  // Wind → shared foliage-sway uniforms (SwayDriver pattern). Sourced from
  // the active Condition's directive when present; falls back to a gentle
  // authoring breeze so the canopy reads as alive before the Phase 5
  // directive→viewport wiring lands. The vertex shader synthesises its own
  // per-tree advected gusts from these uniforms.
  useFrame((_, delta) => {
    treeSwayUniforms.uTime.value += delta
    const directive = useAtmosphere.getState().tweenedDirective
    resolveWindState(directive, _heroWindState)
    const ws = _heroWindState
    if (ws.baseSpeedMps < 0.5) {
      treeSwayUniforms.uWindForce.value.set(HERO_BREEZE_MPS, 0, 0)
      treeSwayUniforms.uWindIntensity.value = HERO_BREEZE_MPS
      treeSwayUniforms.uGustFrontVelocity.value.set(HERO_BREEZE_MPS * 2.5, 0, 0)
      treeSwayUniforms.uGustsScale.value   = 1.5
      treeSwayUniforms.uGustEnvelope.value = 1.0
    } else {
      treeSwayUniforms.uWindForce.value.copy(ws.baseDirection).multiplyScalar(ws.baseSpeedMps)
      treeSwayUniforms.uWindIntensity.value = ws.baseSpeedMps
      treeSwayUniforms.uGustFrontVelocity.value.copy(ws.gustFrontVelocity)
      treeSwayUniforms.uGustsScale.value   = ws.gustsScale
      treeSwayUniforms.uGustEnvelope.value = ws.gustEnvelope
    }
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={scene} />
    </group>
  )
}

// ── Fog ───────────────────────────────────────────────────────────────
// Reads the active Look's `mist` channel from scene.json and mounts
// three.js exponential fog. Mist density=0 → no fog (today's default);
// authored values surface in the canary the way they would in production.
function CanaryFog({ lookId }) {
  const scene = useSceneJson(lookId)
  const mist  = scene?.mist?.values
  if (!mist || !mist.density || mist.density <= 0) return null
  // Mist density is authored 0-2 in the Conditions schema; map to an
  // exponential fog density value with a gentle scale factor. 1.0 →
  // visibility falls to ~50% at ~700m; 2.0 → ~350m. Tuned by eye.
  const fogDensity = mist.density * 0.001
  return <fogExp2 attach="fog" args={[mist.color || '#9dc5e0', fogDensity]} />
}
