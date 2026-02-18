import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import lampData from '../data/street_lamps.json'

// ── Constants ──────────────────────────────────────────────────────────────────
const LAMP_URL = `${import.meta.env.BASE_URL}models/lamp-posts/victorian-lamp.glb`
const LAMP_MODEL_HEIGHT = 2.65
const LAMP_TARGET_HEIGHT = 7.0
const LAMP_SCALE = LAMP_TARGET_HEIGHT / LAMP_MODEL_HEIGHT

const LAMP_COLOR_ON = new THREE.Color('#ffd9b0')  // warm peach
const GLOW_Y = 6.3       // world Y of lantern center
const GLOW_RADIUS = 0.12 // sphere radius — small warm dot, bloom expands it
const POOL_RADIUS = 14
const POOL_Y = 0.5
const SHADOW_RADIUS = 1.8 // soft dark contact shadow at lamp base

function StreetLights() {
  const lampRef = useRef()
  const glowRef = useRef()
  const poolRef = useRef()
  const baseRef = useRef()
  const sunAltUniform = useRef({ value: 0.5 })
  const lampMatRef = useRef(null)
  const glowMatRef = useRef(null)
  const getLightingPhase = useTimeOfDay(s => s.getLightingPhase)

  const allLamps = lampData.lamps

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
    glowMatRef.current = mat
    return mat
  }, [])

  // ── Pool material ───────────────────────────────────────────────────────────
  const poolMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#ffd9b0') },
      uIntensity: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - 0.5) * 2.0;
        float falloff = 1.0 - smoothstep(0.0, 1.0, dist);
        falloff = pow(falloff, 1.5);
        float alpha = falloff * uIntensity * 0.25;
        gl_FragColor = vec4(uColor, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  // Dark contact shadow — soft radial blur at lamp base
  const baseMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - 0.5) * 2.0;
        // Dense dark core fading to transparent edge
        float shadow = 1.0 - smoothstep(0.0, 1.0, dist);
        shadow = shadow * shadow; // sharper falloff
        gl_FragColor = vec4(0.0, 0.0, 0.0, shadow * 0.6);
      }`,
    transparent: true,
    depthWrite: false,
  }), [])

  // ── Load Victorian GLTF ─────────────────────────────────────────────────────
  // Strip KHR_materials_transmission (incompatible with InstancedMesh).
  // Glass panels are cut out via alphaTest so glow orbs show through the cage.
  const [lampModel, setLampModel] = useState(null)

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

              // Night-darken iron parts for contrast against glass glow
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                float nightDarken = mix(0.4, 1.0, smoothstep(-0.1, 0.1, uSunAltitude));
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
      d.position.set(lamp.x, 0, lamp.z)
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
        d.position.set(lamp.x, 0.05, lamp.z)
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

    // Glass panels glow via emissiveMap
    if (lampMatRef.current) lampMatRef.current.emissiveIntensity = t * 1.2
    // Glow orb opacity
    if (glowMatRef.current) glowMatRef.current.opacity = t * 0.4
    // Ground pools
    poolMat.uniforms.uIntensity.value = Math.min(0.5, t * 0.6)

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
      />

    </group>
  )
}

export default StreetLights
