import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import lampData from '../data/street_lamps.json'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { patchTerrainInstanced, UNIFORMS as TERRAIN_UNIFORMS, TERRAIN_DECL } from '../utils/terrainShader'

// ── Constants ──────────────────────────────────────────────────────────────────
const LAMP_URL = `${import.meta.env.BASE_URL}models/lamp-posts/victorian-lamp.glb`
const LAMP_MODEL_HEIGHT = 2.65
const LAMP_TARGET_HEIGHT = 3.66  // 12ft real-world Victorian streetlamp
const LAMP_SCALE = LAMP_TARGET_HEIGHT / LAMP_MODEL_HEIGHT  // ~1.38

const _IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
const LAMP_COLOR_ON = new THREE.Color('#fff2e0')  // warm incandescent white
const GLOW_Y = 3.3       // world Y of lantern center
const GLOW_RADIUS = _IS_MOBILE ? 0.25 : 0.12 // mobile: larger since no bloom to expand
const POOL_RADIUS = _IS_MOBILE ? 15 : 24  // mobile: smaller to limit fill overdraw
const POOL_Y = 0.3
const SHADOW_RADIUS = 1.5 // AO contact shadow at lamp base

function StreetLights({ lamps: lampsProp } = {}) {
  const lampRef = useRef()
  const glowRef = useRef()
  const poolRef = useRef()
  const baseRef = useRef()
  const sunAltUniform = useRef({ value: 0.5 })
  const lampMatRef = useRef(null)
  const glowMatRef = useRef(null)
  const getLightingPhase = useTimeOfDay(s => s.getLightingPhase)
  // Panel-driven lamp tint. Wired but not troubleshot — may clash with the
  // warm-incandescent emission tuning when pushed away from #fff2e0.
  // Applied via useEffect (not useFrame) — per-frame overwrite of the
  // instanced material's emissive caused lamps to vanish at daytime.
  const panelLampColor = useCartographStore(s => s.layerColors?.lamp)

  // Effect that re-applies tint lives below the lampModel useState so the
  // dep array can include it (re-runs when the GLB finishes loading).

  const allLamps = lampsProp || lampData.lamps

  // ── Shared geometries ───────────────────────────────────────────────────────
  const glowGeo = useMemo(() => new THREE.SphereGeometry(1, 8, 6), [])
  const poolGeo = useMemo(() => new THREE.CircleGeometry(POOL_RADIUS, 24), [])
  const baseGeo = useMemo(() => new THREE.CircleGeometry(SHADOW_RADIUS, 16), [])

  // ── Glow orb material — additive blended, self-lit ──────────────────────────
  const glowMat = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: LAMP_COLOR_ON,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    patchTerrainInstanced(mat)
    glowMatRef.current = mat
    return mat
  }, [])

  // ── Pool material ───────────────────────────────────────────────────────────
  const poolMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#fff2e0') },
      uIntensity: { value: 0.0 },
      ...TERRAIN_UNIFORMS,
    },
    vertexShader: `
      ${TERRAIN_DECL}
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 _iw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 _tuv = clamp(vec2(
          (_iw.x - uBMinX) / uSpanX,
          (_iw.z - uBMinZ) / uSpanZ
        ), 0.0, 1.0);
        vec4 _localPos = vec4(position, 1.0);
        _localPos.y += texture2D(uTerrainMap, _tuv).r * uExag;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * _localPos;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - 0.5) * 2.0;
        // Two-zone falloff: bright inner pool + soft extended penumbra
        float core = exp(-dist * dist * 8.0);      // tight warm center
        float penumbra = exp(-dist * dist * 0.8);   // wider atmospheric scatter
        float falloff = core * 0.4 + penumbra * 0.6;
        // Smooth fade to zero at edge — kills the hard circle cutoff
        falloff *= smoothstep(1.0, 0.5, dist);
        float alpha = falloff * uIntensity * ${_IS_MOBILE ? '0.3' : '0.15'};
        gl_FragColor = vec4(uColor, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  // Dark contact shadow — soft radial blur at lamp base, time-of-day aware
  const baseMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSunAlt: { value: 0.5 },
      ...TERRAIN_UNIFORMS,
    },
    vertexShader: `
      ${TERRAIN_DECL}
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 _iw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 _tuv = clamp(vec2(
          (_iw.x - uBMinX) / uSpanX,
          (_iw.z - uBMinZ) / uSpanZ
        ), 0.0, 1.0);
        vec4 _localPos = vec4(position, 1.0);
        _localPos.y += texture2D(uTerrainMap, _tuv).r * uExag;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * _localPos;
      }`,
    fragmentShader: `
      uniform float uSunAlt;
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - 0.5) * 2.0;
        // Soft radial falloff — no hard core
        float shadow = exp(-dist * dist * 2.0);
        shadow *= smoothstep(1.0, 0.3, dist); // fade to zero at edge

        // Time-of-day:
        // Day (sun > 0.3): subtle contact shadow (0.25)
        // Twilight: fading
        // Night (sun < -0.1): near invisible (0.05)
        float dayT = smoothstep(-0.1, 0.3, uSunAlt);
        float intensity = mix(0.05, 0.25, dayT);

        gl_FragColor = vec4(0.0, 0.0, 0.0, shadow * intensity);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), [])

  // ── Load Victorian GLTF ─────────────────────────────────────────────────────
  // Strip KHR_materials_transmission (incompatible with InstancedMesh).
  // Glass panels are cut out via alphaTest so glow orbs show through the cage.
  const [lampModel, setLampModel] = useState(null)

  // Apply panel lamp tint once on mount + whenever the picker changes or the
  // GLB finishes loading. Avoids the per-frame mutation that previously
  // caused the iron material to vanish at daytime.
  useEffect(() => {
    if (!panelLampColor) return
    if (glowMatRef.current) glowMatRef.current.color.set(panelLampColor)
    if (lampMatRef.current?.emissive) lampMatRef.current.emissive.set(panelLampColor)
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
            patchTerrainInstanced(mat)
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
  }, [allLamps, lampModel])

  // ── Instance transforms — glow orbs ─────────────────────────────────────────
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
  }, [allLamps, lampModel])

  // ── Instance transforms — pools + base rings ───────────────────────────────
  useEffect(() => {
    const d = new THREE.Object3D()
    if (poolRef.current) {
      allLamps.forEach((lamp, i) => {
        d.position.set(lamp.x, POOL_Y, lamp.z)
        d.rotation.set(-Math.PI / 2, 0, 0)
        d.scale.setScalar(1)
        d.updateMatrix()
        poolRef.current.setMatrixAt(i, d.matrix)
      })
      poolRef.current.instanceMatrix.needsUpdate = true
    }
    if (baseRef.current) {
      allLamps.forEach((lamp, i) => {
        d.position.set(lamp.x, 0.12, lamp.z)
        d.rotation.set(-Math.PI / 2, 0, 0)
        d.scale.setScalar(1)
        d.updateMatrix()
        baseRef.current.setMatrixAt(i, d.matrix)
      })
      baseRef.current.instanceMatrix.needsUpdate = true
    }
  }, [allLamps, lampModel])

  // ── Per-frame time-of-day animation ─────────────────────────────────────────
  // Transition starts at golden hour (sunAlt=0.15) for a gradual warm-up
  useFrame(() => {
    const { sunAltitude } = getLightingPhase()

    sunAltUniform.current.value = sunAltitude

    // Ramp: 0 at sunAlt≥0.15 (day), 1 at sunAlt≤-0.3 (deep night)
    const t = Math.min(1, Math.max(0, (0.15 - sunAltitude) / 0.45))
    const isActive = t > 0.01

    // Glass panels — warm white when lit, no procedural glow
    if (lampMatRef.current) lampMatRef.current.emissiveIntensity = t * 0.8
    // Glow orb opacity — boosted on mobile to compensate for lack of bloom
    if (glowMatRef.current) glowMatRef.current.opacity = t * (_IS_MOBILE ? 0.7 : 0.4)
    // Ground pools — lower per-pool alpha, rely on overlap for fill
    poolMat.uniforms.uIntensity.value = Math.min(_IS_MOBILE ? 0.6 : 0.4, t * (_IS_MOBILE ? 0.8 : 0.5))
    // AO contact shadow — driven by sun altitude
    baseMat.uniforms.uSunAlt.value = sunAltitude

    // Show/hide pool + glow layers
    if (poolRef.current) poolRef.current.visible = isActive
    if (glowRef.current) glowRef.current.visible = isActive
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

      {/* Warm glow orbs at lantern heads (1 draw call) */}
      <instancedMesh
        ref={glowRef}
        args={[glowGeo, glowMat, allLamps.length]}
        frustumCulled={false}
      />

      {/* Ground light pools (1 draw call) */}
      <instancedMesh
        ref={poolRef}
        args={[poolGeo, poolMat, allLamps.length]}
        frustumCulled={false}
      />

      {/* Dark base rings (1 draw call) */}
      <instancedMesh
        ref={baseRef}
        args={[baseGeo, baseMat, allLamps.length]}
        frustumCulled={false}
        renderOrder={1}
      />

    </group>
  )
}

export default StreetLights
