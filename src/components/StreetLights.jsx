import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import lampData from '../data/street_lamps.json'
import { useSceneJson } from '../lib/useSceneJson.js'
import { patchTerrainInstancedBaked, UNIFORMS as TERRAIN_UNIFORMS, TERRAIN_DECL } from '../utils/terrainShader'
import { getElevationRaw } from '../utils/elevation'
import { INSTANCE } from '../instance.js'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { LANTERN_FLAT_DEFAULTS, LANTERN_FIELD_KEYS } from '../cartograph/skyLightChannels.js'
import { lampGlow as _lampGlow } from '../preview/lampGlowState'

const LANTERN_DEFAULT_CHANNEL = Object.freeze({ values: { ...LANTERN_FLAT_DEFAULTS } })

function _resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

// ── Constants ──────────────────────────────────────────────────────────────────
const LAMP_URL = `${import.meta.env.BASE_URL}models/lamp-posts/victorian-lamp.glb`
const LAMP_MODEL_HEIGHT = 2.65
const LAMP_TARGET_HEIGHT = 3.66  // 12ft real-world Victorian streetlamp
const LAMP_SCALE = LAMP_TARGET_HEIGHT / LAMP_MODEL_HEIGHT  // ~1.38

import { IS_MOBILE as _IS_MOBILE } from '../lib/isMobile.js'
const LAMP_COLOR_ON = new THREE.Color('#fff2e0')  // warm incandescent white
const GLOW_Y = 3.3       // world Y of lantern center
const GLOW_RADIUS = _IS_MOBILE ? 0.25 : 0.18 // tight glass halo
const HALO_RADIUS = _IS_MOBILE ? 0.6 : 1.0   // soft wide glow (bloom substitute)
const BULB_RADIUS = 0.05                      // sharp bulb dot at lantern center
// (The ground light pool AND the lamp contact shadow moved into the baked
// ground FX map — see BakedGround / grassMaterial / bake-ground-ao.js.
// POOL_RADIUS/POOL_Y/poolMat + SHADOW_RADIUS/baseMat all retired.)

function StreetLights({ lamps: lampsProp, lookId, bakeLastMs, lantern: lanternChannel } = {}) {
  const lampRef = useRef()
  const glowRef = useRef()
  const bulbRef = useRef()
  // Production Canvas runs frameloop="demand"; the imperative instance-matrix
  // fills below (lamp/glow/bulb) don't trigger R3F's auto-invalidate, and the
  // lamp model loads async — so lamps would stay unpainted until a camera nudge.
  // invalidate() after each fill requests the paint. No-op under "always".
  // (2026-06-28 — sibling of the InstancedTrees demand-mode fix.)
  const invalidate = useThree(s => s.invalidate)
  const sunAltUniform = useRef({ value: 0.5 })
  const lampMatRef = useRef(null)
  const glowMatRef = useRef(null)
  const getLightingPhase = useTimeOfDay(s => s.getLightingPhase)
  // Panel-driven lamp tint, sourced from scene.json (frozen-at-bake) per
  // couplers plan §1. Stage panel writes layerColors.lamp into design.json
  // → bake → scene.json.layerColors.lamp; runtime applies via useEffect
  // (not useFrame) — per-frame overwrite of the instanced material's
  // emissive caused lamps to vanish at daytime.
  const scene = useSceneJson(_resolveLookId(lookId), bakeLastMs)
  const panelLampColor = scene?.layerColors?.lamp

  // Effect that re-applies tint lives below the lampModel useState so the
  // dep array can include it (re-runs when the GLB finishes loading).

  const allLamps = lampsProp || lampData.lamps
  // Baked ground anchor per lamp (groundSampler): the raw field where the DRAWN
  // ground sits under each lamp → rigid-lift onto the rendered surface, no float
  // (the buildings/foundations regime for point objects). Falls back to the
  // smooth field for any lamp that predates the bake.
  const aGroundRaw = useMemo(
    () => new Float32Array(allLamps.map(l => (typeof l.groundRaw === 'number' ? l.groundRaw : getElevationRaw(l.x, l.z)))),
    [allLamps],
  )

  // ── Shared geometries ───────────────────────────────────────────────────────
  // Glow + halo are billboards (planes that face the camera in the
  // vertex shader). Soft fragment-shader falloff = no visible edge.
  // Bulb stays a tiny sphere — small enough that the sphere edge is
  // imperceptible and it reads as a pure pinprick of light.
  const glowGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const haloGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(1, 8, 6), [])

  // Vertex-shader snippet for camera-facing billboards on instanced
  // geometry. The plane's local position becomes a screen-space offset
  // from the instance center, so the quad ALWAYS faces the camera and
  // the fragment shader gets clean UVs to compute radial falloff.
  //
  // Terrain lift is added directly to _bbCenter.y in world space (the
  // billboard custom shader bypasses three's standard project_vertex
  // chain, so patchTerrainInstanced can't see it). Uniforms come from
  // TERRAIN_UNIFORMS on each ShaderMaterial that consumes this snippet.
  const BILLBOARD_VS_INC = /*glsl*/`
    vec4 _bbCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Baked ground anchor (matches the lamp post) — no live terrain sample.
    _bbCenter.y += aGroundRaw * uExag;
    vec4 _bbCenterView = viewMatrix * _bbCenter;
    // Scale recovered from instanceMatrix's first column (uniform scale).
    float _bbScale = length(vec3(instanceMatrix[0].xyz));
    vec4 _bbView = _bbCenterView + vec4(position.xy * _bbScale, 0.0, 0.0);
    gl_Position = projectionMatrix * _bbView;
  `

  // ── Glow orb (tight glass halo) — billboard with soft falloff ────────────
  // Tight, intense, warm — reads as the bulb's immediate halo through
  // the lantern glass. PlaneGeometry billboarded in vertex; fragment
  // does its own radial Gaussian.
  const glowMat = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: LAMP_COLOR_ON.clone() },
        uIntensity: { value: 0 },
        ...TERRAIN_UNIFORMS,
      },
      vertexShader: /*glsl*/`
        ${TERRAIN_DECL}
        attribute float aGroundRaw;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          ${BILLBOARD_VS_INC}
        }`,
      fragmentShader: /*glsl*/`
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;          // 0 at center, 1 at edge
          if (r >= 1.0) discard;
          float core = exp(-r * r * 8.0);
          float ring = exp(-r * r * 2.0);
          float a = (core * 0.7 + ring * 0.3) * uIntensity;
          a *= 1.0 - smoothstep(0.6, 1.0, r);          // force-clamp to 0 at edge
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    glowMatRef.current = { uniforms: mat.uniforms }
    return mat
  }, [])

  // ── Wide soft halo (bloom substitute) — billboard, much wider/dimmer ──────
  const haloMat = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: LAMP_COLOR_ON.clone() },
        uIntensity: { value: 0 },
        ...TERRAIN_UNIFORMS,
      },
      vertexShader: /*glsl*/`
        ${TERRAIN_DECL}
        attribute float aGroundRaw;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          ${BILLBOARD_VS_INC}
        }`,
      fragmentShader: /*glsl*/`
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          if (r >= 1.0) discard;
          // Wide soft glow with a guaranteed-zero edge.
          float a = exp(-r * r * 2.0) * uIntensity * 0.45;
          a *= 1.0 - smoothstep(0.6, 1.0, r);
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return mat
  }, [])

  // ── Bulb dot — sharp tiny point of pure light at the lantern center ───────
  // Slightly hot-tinted but visually reads white because it's tiny and bright.
  const bulbMat = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    patchTerrainInstancedBaked(mat)
    return mat
  }, [])

  // (Both the ground light POOL and the lamp CONTACT SHADOW moved into the
  // baked ground FX map 2026-06-22 — R = additive pool (dark center → bright
  // ring → 0), G = contact shadow (tree + lamp bases), darkening the ground
  // diffuse DIRECTLY so the ring reads in daytime. Sampled by grass + FadeMesh;
  // see bake-ground-ao.js. The floating pool/base discs are retired.)

  // ── Load Victorian GLTF ─────────────────────────────────────────────────────
  // Strip KHR_materials_transmission (incompatible with InstancedMesh).
  // Glass panels are cut out via alphaTest so glow orbs show through the cage.
  const [lampModel, setLampModel] = useState(null)

  // Apply panel lamp tint once on mount + whenever the picker changes or the
  // GLB finishes loading. Avoids the per-frame mutation that previously
  // caused the iron material to vanish at daytime.
  useEffect(() => {
    const lampCol = panelLampColor || '#fff2e0'  // layerColors.lamp, else the warm default
    if (glowMatRef.current?.uniforms?.uColor) glowMatRef.current.uniforms.uColor.value.set(lampCol)
    if (lampMatRef.current?.emissive) lampMatRef.current.emissive.set(lampCol)
    // The ground light pool IS the lantern's light on the ground — give it the
    // same colour (consumed by the grass + FadeMesh pool term via uLampColor).
    _lampGlow.colorUniform.value.set(lampCol)
  }, [panelLampColor, lampModel])

  useEffect(() => {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load(
      LAMP_URL,
      (gltf) => {
        let found = false
        gltf.scene.updateMatrixWorld(true)
        gltf.scene.traverse(child => {
          if (child.isMesh && !found) {
            found = true
            const mat = child.material

            // Save transmission texture (identifies glass vs iron areas)
            const txMap = mat.transmissionMap

            // Strip transmission (incompatible with InstancedMesh)
            mat.transmission = 0
            mat.transmissionMap = null

            // Glass glow: transmissionTexture becomes emissiveMap
            // Glass areas glow warm amber at night, iron stays dark
            mat.emissive = LAMP_COLOR_ON.clone()
            mat.emissiveMap = txMap
            mat.emissiveIntensity = 0

            // Enable transparency so glass panels can fade to clear during day
            mat.transparent = true

            mat.onBeforeCompile = (shader) => {
              shader.uniforms.uSunAltitude = sunAltUniform.current
              if (txMap) {
                shader.uniforms.uTxMap = { value: txMap }
              }

              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
                uniform float uSunAltitude;
                ${txMap ? 'uniform sampler2D uTxMap;' : ''}`
              )

              // Force flat dark wrought-iron on non-glass areas, night-darken all
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                vec3 ironColor = pow(vec3(0.04, 0.04, 0.04), vec3(2.2));
                ${txMap ? `
                float ironMask = 1.0 - texture2D(uTxMap, vMapUv).r;
                diffuseColor.rgb = mix(diffuseColor.rgb, ironColor, ironMask);
                ` : `
                diffuseColor.rgb = ironColor;
                `}
                float nightDarken = mix(0.15, 1.0, smoothstep(-0.1, 0.1, uSunAltitude));
                diffuseColor.rgb *= nightDarken;`
              )

              // Glass alpha: clear during day, opaque at night (smooth golden hour fade)
              if (txMap) {
                shader.fragmentShader = shader.fragmentShader.replace(
                  '#include <dithering_fragment>',
                  `#include <dithering_fragment>
                  float glassMask = texture2D(uTxMap, vMapUv).r;
                  float glassVisible = 1.0 - smoothstep(-0.05, 0.15, uSunAltitude);
                  gl_FragColor.a *= mix(1.0, glassVisible, glassMask);`
                )
              }
            }

            // Chain terrain displacement for instanced mesh lift.
            patchTerrainInstancedBaked(mat)
            lampMatRef.current = mat

            setLampModel({
              geometry: child.geometry,
              material: mat,
              nodeMatrix: child.matrixWorld.clone(),
            })
          }
        })
      },
      undefined,
      (err) => console.warn('Victorian lamp model failed to load:', err)
    )
  }, [])

  // ── Instance transforms — lamp posts ────────────────────────────────────────
  useEffect(() => {
    if (!lampRef.current || !lampModel) return
    const d = new THREE.Object3D()
    const combined = new THREE.Matrix4()

    allLamps.forEach((lamp, i) => {
      d.position.set(lamp.x, -0.08, lamp.z)
      d.rotation.set(0, Math.random() * Math.PI * 2, 0)
      d.scale.setScalar(LAMP_SCALE)
      d.updateMatrix()
      combined.copy(d.matrix).multiply(lampModel.nodeMatrix)
      lampRef.current.setMatrixAt(i, combined)
    })
    lampRef.current.instanceMatrix.needsUpdate = true
    lampModel.geometry.setAttribute('aGroundRaw', new THREE.InstancedBufferAttribute(aGroundRaw, 1))
    invalidate()   // demand-mode: paint the just-filled matrices
  }, [allLamps, lampModel, aGroundRaw, invalidate])

  // ── Instance transforms — glow orbs (tight glass halo) ────────────────────
  useEffect(() => {
    if (!glowRef.current) return
    const d = new THREE.Object3D()
    allLamps.forEach((lamp, i) => {
      d.position.set(lamp.x, GLOW_Y, lamp.z)
      d.rotation.set(0, 0, 0)
      d.scale.setScalar(GLOW_RADIUS)
      d.updateMatrix()
      glowRef.current.setMatrixAt(i, d.matrix)
    })
    glowRef.current.instanceMatrix.needsUpdate = true
    glowGeo.setAttribute('aGroundRaw', new THREE.InstancedBufferAttribute(aGroundRaw, 1))
    invalidate()
  }, [allLamps, lampModel, aGroundRaw, glowGeo, invalidate])

  // ── Instance transforms — sharp bulb dot ───────────────────────────────────
  useEffect(() => {
    if (!bulbRef.current) return
    const d = new THREE.Object3D()
    allLamps.forEach((lamp, i) => {
      d.position.set(lamp.x, GLOW_Y, lamp.z)
      d.rotation.set(0, 0, 0)
      d.scale.setScalar(BULB_RADIUS)
      d.updateMatrix()
      bulbRef.current.setMatrixAt(i, d.matrix)
    })
    bulbRef.current.instanceMatrix.needsUpdate = true
    bulbGeo.setAttribute('aGroundRaw', new THREE.InstancedBufferAttribute(aGroundRaw, 1))
    invalidate()
  }, [allLamps, lampModel, aGroundRaw, bulbGeo, invalidate])

  // (Lamp base-ring instance transforms removed — the contact shadow is baked
  // into the ground FX map now, not a per-lamp disc.)

  // ── Per-frame time-of-day animation ─────────────────────────────────────────
  // Transition starts at golden hour (sunAlt=0.15) for a gradual warm-up
  useFrame(() => {
    const { sunAltitude } = getLightingPhase()

    sunAltUniform.current.value = sunAltitude

    // Ramp: 0 at sunAlt≥0.15 (day), 1 at sunAlt≤-0.3 (deep night)
    const t = Math.min(1, Math.max(0, (0.15 - sunAltitude) / 0.45))
    const isActive = t > 0.01

    // Lantern channel (operator master Brightness + Glow, TOD-animatable) ×
    // the automatic dusk→night turn-on (t). Resolved per-frame; defaults
    // reproduce the old hardwired 0.8 / 1.0 multipliers.
    const tod = useTimeOfDay.getState()
    const lant = resolveGroupAtMinute(
      lanternChannel || LANTERN_DEFAULT_CHANNEL, tod.getMinuteOfDay(),
      lanternChannel?.animated ? getTodSlotMinutes(tod.currentTime) : null,
      LANTERN_FIELD_KEYS, LANTERN_FLAT_DEFAULTS,
    )
    const lampLit = t * (lant.intensity ?? 1)

    // Glass panels — warm white when lit, no procedural glow
    if (lampMatRef.current) lampMatRef.current.emissiveIntensity = lampLit * 0.8
    // Tight glass halo — visible but not blowout (× the Glow knob)
    if (glowMatRef.current?.uniforms?.uIntensity) glowMatRef.current.uniforms.uIntensity.value = lampLit * (lant.glow ?? 1)
    // Sharp bulb dot — bright pinprick at lantern center
    bulbMat.opacity = lampLit
    // The ground light pool IS the lantern's light on the ground — drive its
    // intensity from the lantern's actual output (Brightness × the dusk→night
    // ramp), so the Lantern Brightness slider controls the pool too, and it's
    // off by day. (Consumed by grass + FadeMesh as uPool; colour = uLampColor.)
    _lampGlow.poolUniform.value = lampLit
    // (Lamp pool + contact shadow moved into the baked ground FX map — see
    // BakedGround / bake-ground-ao.js.)
    if (glowRef.current) glowRef.current.visible = isActive
    if (bulbRef.current) bulbRef.current.visible = isActive
  })

  if (!lampModel) return null

  return (
    <group>
      {/* Victorian lamp posts — iron with glass cutouts (1 draw call) */}
      <instancedMesh
        ref={lampRef}
        args={[lampModel.geometry, lampModel.material, allLamps.length]}
        castShadow
        frustumCulled={false}
      />

      {/* Ground light pool — MOVED into the ground itself (2026-06-22): baked
          additive ring map sampled by the grass + FadeMesh shaders so it
          drapes over terrain/curbs with no z-fighting. See bake-ground-ao.js
          (poolmap) + grassMaterial / BakedGround FadeMesh. The floating disc
          is retired. */}

      {/* Tight warm glass halo */}
      <instancedMesh
        ref={glowRef}
        args={[glowGeo, glowMat, allLamps.length]}
        frustumCulled={false}
      />

      {/* Sharp bulb dot at the lantern's bulb position */}
      <instancedMesh
        ref={bulbRef}
        args={[bulbGeo, bulbMat, allLamps.length]}
        frustumCulled={false}
      />

      {/* Ground light pool + lamp contact shadow — both baked into the ground
          FX map (R = pool, G = shadow) and sampled by the ground shaders. No
          floating discs. See bake-ground-ao.js + BakedGround / grassMaterial. */}

    </group>
  )
}

export default StreetLights
