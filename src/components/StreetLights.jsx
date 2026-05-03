import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import lampData from '../data/street_lamps.json'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { patchTerrainInstanced, UNIFORMS as TERRAIN_UNIFORMS, TERRAIN_DECL } from '../utils/terrainShader'
import { lampGlow as _lampGlow } from '../preview/lampGlowState'

// ── Constants ──────────────────────────────────────────────────────────────────
const LAMP_URL = `${import.meta.env.BASE_URL}models/lamp-posts/victorian-lamp.glb`
const LAMP_MODEL_HEIGHT = 2.65
const LAMP_TARGET_HEIGHT = 3.66  // 12ft real-world Victorian streetlamp
const LAMP_SCALE = LAMP_TARGET_HEIGHT / LAMP_MODEL_HEIGHT  // ~1.38

const _IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
const LAMP_COLOR_ON = new THREE.Color('#fff2e0')  // warm incandescent white
const GLOW_Y = 3.3       // world Y of lantern center
const GLOW_RADIUS = _IS_MOBILE ? 0.25 : 0.18 // tight glass halo
const HALO_RADIUS = _IS_MOBILE ? 0.6 : 1.0   // soft wide glow (bloom substitute)
const BULB_RADIUS = 0.05                      // sharp bulb dot at lantern center
// Pool radius shrunk from 40 → 15 (desktop) so each lamp's pool is mostly
// its own circle. At 40m with ~25m lamp spacing, every street point sat
// inside 2–3 stacked discs and the gradient (dark center → bright ring →
// soft fade) was invisible — pools just smeared into one wash. At 15m
// neighboring pools touch with a gentle penumbra, the gradient is legible,
// and the pool slider has visible feedback per lamp.
const POOL_RADIUS = _IS_MOBILE ? 10 : 15
// Pool sits AT the ground (y=0 plus the terrain displacement applied in the
// vertex shader). No artificial lift — the pool reads as light cast on the
// ground beneath the lamp post. Visibility against grass is handled by the
// pool mesh's renderOrder=50 + the material's polygonOffset, not by a Y bump.
const POOL_Y = 0.0
const SHADOW_RADIUS = 1.5 // AO contact shadow at lamp base

function StreetLights({ lamps: lampsProp } = {}) {
  const lampRef = useRef()
  const glowRef = useRef()
  const bulbRef = useRef()
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
  // Glow + halo are billboards (planes that face the camera in the
  // vertex shader). Soft fragment-shader falloff = no visible edge.
  // Bulb stays a tiny sphere — small enough that the sphere edge is
  // imperceptible and it reads as a pure pinprick of light.
  const glowGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const haloGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(1, 8, 6), [])
  const poolGeo = useMemo(() => new THREE.CircleGeometry(POOL_RADIUS, 32), [])
  const baseGeo = useMemo(() => new THREE.CircleGeometry(SHADOW_RADIUS, 16), [])

  // Vertex-shader snippet for camera-facing billboards on instanced
  // geometry. The plane's local position becomes a screen-space offset
  // from the instance center, so the quad ALWAYS faces the camera and
  // the fragment shader gets clean UVs to compute radial falloff.
  const BILLBOARD_VS_INC = /*glsl*/`
    vec4 _bbCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
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
      uniforms: { uColor: { value: LAMP_COLOR_ON.clone() }, uIntensity: { value: 0 } },
      vertexShader: /*glsl*/`
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
      uniforms: { uColor: { value: LAMP_COLOR_ON.clone() }, uIntensity: { value: 0 } },
      vertexShader: /*glsl*/`
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
    patchTerrainInstanced(mat)
    return mat
  }, [])

  // ── Pool material — subtle radial gradient (post shadow + light ring) ───
  // Shape: dark thin band at r≈0 (the post itself blocks light directly
  // beneath it), then a brighter halo from ~0.15..0.5, then a long
  // smooth fade. Low additive intensity — meant to pump the real light
  // from the lampLightmap-on-grass, not replace it.
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
        // Apply terrain elevation in WORLD space, after instance rotation
        // bakes the disc flat. The earlier version added elevation to local
        // Y *before* the -π/2 X rotation, which mapped onto world -Z and
        // left the disc buried under non-flat terrain.
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec2 _tuv = clamp(vec2(
          (wp.x - uBMinX) / uSpanX,
          (wp.z - uBMinZ) / uSpanZ
        ), 0.0, 1.0);
        wp.y += texture2D(uTerrainMap, _tuv).r * uExag;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        if (r >= 1.0) discard;
        // Inner dark band (post shadow at the base) — slight notch at r=0
        float postShadow = smoothstep(0.0, 0.18, r);
        // Bright ring around the base — the visible "circle of light"
        float ring = exp(-pow((r - 0.32) * 4.5, 2.0));
        // Long soft penumbra — atmospheric scatter
        float penumbra = exp(-r * r * 1.6);
        float falloff = ring * 0.55 + penumbra * 0.45;
        falloff *= postShadow;
        falloff *= 1.0 - smoothstep(0.7, 1.0, r);
        float alpha = falloff * uIntensity * ${_IS_MOBILE ? '0.45' : '0.30'};
        gl_FragColor = vec4(uColor, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    // depthTest stays ON so trees + buildings occlude pool correctly
    // (pool sits behind them, on the ground). polygonOffset must beat
    // StreetRibbons' treelawn/median ribbons, which use factor/units of
    // -pri/-pri*4 (pri=3 for treelawn → -3/-12). Pool wins at -5/-20.
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -20,
    blending: THREE.AdditiveBlending,
  }), [])

  // (continued setup — contact shadow material below)
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
        // Same world-space elevation fix as poolMat above.
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec2 _tuv = clamp(vec2(
          (wp.x - uBMinX) / uSpanX,
          (wp.z - uBMinZ) / uSpanZ
        ), 0.0, 1.0);
        wp.y += texture2D(uTerrainMap, _tuv).r * uExag;
        gl_Position = projectionMatrix * viewMatrix * wp;
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
    if (glowMatRef.current?.uniforms?.uColor) glowMatRef.current.uniforms.uColor.value.set(panelLampColor)
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
  }, [allLamps, lampModel])

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
    // Tight glass halo — visible but not blowout
    if (glowMatRef.current?.uniforms?.uIntensity) glowMatRef.current.uniforms.uIntensity.value = t
    // Sharp bulb dot — bright pinprick at lantern center
    bulbMat.opacity = t * 1.0
    // Ground pools — generous spread, lower per-pool alpha so overlap stays controlled
    // AO contact shadow — driven by sun altitude
    baseMat.uniforms.uSunAlt.value = sunAltitude

    // Ground pool intensity scales with the per-Look TOD-driven pool slider.
    // poolUniform is the canonical uniform (lampGlowState); driven by the
    // per-Look envelope in CartographApp.
    poolMat.uniforms.uIntensity.value = t * _lampGlow.poolUniform.value
    if (poolRef.current) poolRef.current.visible = isActive
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

      {/* Subtle ground pool — simulates post shadow + visible light ring,
          additive over the lampLightmap-on-grass to pump up the real light.
          renderOrder=50 puts pool in the transparent pass AFTER all
          StreetRibbons meshes (priorities ≤ ~20), so when treelawn ribbons
          render with their own polygonOffset, pool still gets last say
          and additively blends on top. */}
      <instancedMesh
        ref={poolRef}
        args={[poolGeo, poolMat, allLamps.length]}
        renderOrder={50}
        frustumCulled={false}
      />

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

      {/* Ground "pools" replaced — warm lamp glow now comes from
          shaders that sample the lampLightmap (grass, trees, paths,
          ground, walls) so the light is continuous and physically-tied
          to ground material instead of fake additive discs. */}

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
