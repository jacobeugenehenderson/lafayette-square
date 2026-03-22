import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import SunCalc from 'suncalc'
import { LATITUDE, LONGITUDE } from './CelestialBodies'

// NPS catenary equation converted to meters:
const A = 211.5
const B = 20.96
const C = 0.03292

const PEAK_HEIGHT = A - B
const HALF_SPAN = Math.acosh(A / B) / C

const BASE_RADIUS = 6.0
const TOP_RADIUS = 2.0

const TRI_ANGLES = [
  Math.PI / 2,
  Math.PI / 2 + 2 * Math.PI / 3,
  Math.PI / 2 + 4 * Math.PI / 3,
]

function createArchGeometry(curveSegs = 120) {
  const positions = []
  const curveParams = []
  const edgeParams = []

  const rings = []
  for (let i = 0; i <= curveSegs; i++) {
    const t = i / curveSegs
    const x = -HALF_SPAN + 2 * HALF_SPAN * t
    const y = Math.max(0, A - B * Math.cosh(C * x))

    const dydx = -B * C * Math.sinh(C * x)
    const tangentLen = Math.sqrt(1 + dydx * dydx)
    const nx = -dydx / tangentLen
    const ny = 1 / tangentLen

    const hFrac = y / PEAK_HEIGHT
    const radius = BASE_RADIUS + (TOP_RADIUS - BASE_RADIUS) * hFrac

    const corners = TRI_ANGLES.map(theta => {
      const cosT = Math.cos(theta)
      const sinT = Math.sin(theta)
      return [
        x + nx * cosT * radius,
        y + ny * cosT * radius,
        sinT * radius
      ]
    })

    rings.push({ corners, t })
  }

  for (let face = 0; face < 3; face++) {
    const next = (face + 1) % 3
    for (let i = 0; i < curveSegs; i++) {
      const a = rings[i].corners[face]
      const b = rings[i].corners[next]
      const c = rings[i + 1].corners[face]
      const d = rings[i + 1].corners[next]
      const t0 = rings[i].t
      const t1 = rings[i + 1].t

      positions.push(...a, ...b, ...c, ...c, ...b, ...d)
      curveParams.push(t0, t0, t1, t1, t0, t1)
      edgeParams.push(0, 1, 0, 0, 1, 1)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('aCurveParam', new THREE.Float32BufferAttribute(curveParams, 1))
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edgeParams, 1))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

const ARCH_POSITION = [1470, 0, -490]
const ARCH_SCALE = 2.66
const ARCH_Y_OFFSET = -165
const ARCH_FIXED_ROTATION = 1.36

export default function GatewayArch() {
  const geometry = useMemo(() => createArchGeometry(), [])
  const meshRef = useRef()
  const shaderRef = useRef(null)

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#c8c8d0',
      metalness: 0.92,
      roughness: 0.04,
      emissive: '#8888aa',
      emissiveIntensity: 0,
      transparent: false,
      depthWrite: true,
      alphaTest: 0.01,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = { value: new THREE.Vector3(0, 0.3, 1) }
      shader.uniforms.uDayFactor = { value: 1.0 }
      shader.uniforms.uGlintPos = { value: 0.5 }
      shader.uniforms.uGlintBright = { value: 1.0 }
      shader.uniforms.uSkyBright = { value: 0.5 }
      shader.uniforms.uHorizonColor = { value: new THREE.Color('#9dc5e0') }
      shader.uniforms.uGroundColor = { value: new THREE.Color('#3a4a3a') }

      // Vertex
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute float aCurveParam;
         attribute float aEdge;
         varying float vCurveParam;
         varying float vEdge;
         varying vec3 vArchWorld;
         varying vec3 vArchNormal;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vCurveParam = aCurveParam;
         vEdge = aEdge;
         vec4 archWP = modelMatrix * vec4(position, 1.0);
         vArchWorld = archWP.xyz;
         vArchNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
      )

      // Fragment: declare
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSunDir;
         uniform float uDayFactor;
         uniform float uGlintPos;
         uniform float uGlintBright;
         uniform float uSkyBright;
         uniform vec3 uHorizonColor;
         uniform vec3 uGroundColor;
         varying float vCurveParam;
         varying float vEdge;
         varying vec3 vArchWorld;
         varying vec3 vArchNormal;`
      )

      // Panel seams + per-panel color variation
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Horizontal seams along the curve (~142 bands)
         float hPanelCount = 142.0;
         float hPanel = fract(vCurveParam * hPanelCount);
         float hSeam = smoothstep(0.0, 0.025, hPanel) * (1.0 - smoothstep(0.975, 1.0, hPanel));

         // Vertical seams: darken at triangle edges (where vEdge → 1.0)
         // This creates 3 visible vertical stripes running the length of the arch
         float vSeam = 1.0 - smoothstep(0.88, 0.96, vEdge) * 0.5;

         // Combined seam: multiply horizontal and vertical
         float seam = hSeam * vSeam;

         // Face index (0, 1, or 2) — each triangular face is a distinct surface
         float faceId = floor(vEdge * 2.99);
         // Panel ID combines horizontal position + face
         float panelId = floor(vCurveParam * hPanelCount) * 3.0 + faceId;
         float panelHash = fract(sin(panelId * 127.1) * 43758.5453);
         float panelHash2 = fract(sin(panelId * 311.7) * 43758.5453);
         float panelHash3 = fract(sin(panelId * 541.3) * 43758.5453);

         // Seams always visible
         float seamVis = 0.5 + 0.5 * uDayFactor;
         diffuseColor.rgb *= mix(1.0, mix(0.4, 1.0, seam), seamVis);

         // Per-panel color — brightness + warm/cool tint
         float panelBright = (panelHash - 0.5) * 0.35;
         vec3 panelTint = vec3(
           (panelHash2 - 0.5) * 0.18,
           (panelHash3 - 0.5) * 0.10,
           (panelHash - 0.5) * 0.14
         );
         // Panels subtle during twilight, stronger in full day/night
         float twilightDip = 1.0 - smoothstep(0.1, 0.4, uDayFactor) * (1.0 - smoothstep(0.6, 0.9, uDayFactor));
         float colorStrength = (0.4 + 0.6 * uDayFactor) * mix(0.4, 1.0, twilightDip);
         diffuseColor.rgb += panelBright * colorStrength;
         diffuseColor.rgb += panelTint * colorStrength;
         diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.05));`
      )

      // Uniform roughness — no per-panel variation
      // All panel detail comes through color, not reflectivity
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         // Slightly rougher at seams, otherwise uniform
         roughnessFactor += (1.0 - seam) * 0.06 * seamVis;
         roughnessFactor = clamp(roughnessFactor, 0.03, 0.15);`
      )

      // Post-lighting: environment-aware tinting + glint + foot blend
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>

         vec3 N = normalize(vArchNormal);

         // ── Sky/ground reflection tint ──
         // Simulate environment reflection based on normal direction
         // Up-facing normals reflect sky, down-facing reflect ground
         float upness = dot(N, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
         vec3 envTint = mix(uGroundColor, uHorizonColor, upness);
         // Blend with the PBR output — stronger when metallic surface is bright
         float envStrength = uSkyBright * 0.4;
         gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb + envTint, envStrength);

         // ── Broad directional light wash ──
         // Strong in day, very subtle at night (moon isn't a spotlight)
         float sunFacing = max(0.0, dot(N, uSunDir));
         float wash = sunFacing * 0.7;
         vec3 washColor = mix(vec3(0.4, 0.42, 0.5), vec3(0.9, 0.87, 0.8), uDayFactor);
         gl_FragColor.rgb += washColor * wash * uDayFactor * 0.25;

         // ── Sun/moon glint on edges — sharp and bright ──
         float edgeMask = smoothstep(0.78, 1.0, vEdge);
         float glintD = vCurveParam - uGlintPos;
         // Sharp core + softer halo
         float glintCore = exp(-glintD * glintD * 2000.0) * edgeMask;
         float glintHalo = exp(-glintD * glintD * 200.0) * edgeMask;
         gl_FragColor.rgb += vec3(1.0, 0.97, 0.9) * glintCore * uGlintBright * 1.2;
         gl_FragColor.rgb += vec3(0.8, 0.82, 0.9) * glintHalo * uGlintBright * 0.3;

         // ── Foot blending + hard clip ──
         float footDist = min(vCurveParam, 1.0 - vCurveParam);
         // Color blend near feet
         float footBlend = smoothstep(0.0, 0.12, footDist);
         float paintStrength = (1.0 - footBlend) * 0.70;
         float heightFrac = smoothstep(-20.0, 120.0, vArchWorld.y);
         vec3 paintColor = mix(uGroundColor, uHorizonColor, heightFrac);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, paintColor, paintStrength);
         // Alpha fade: legs fade out approaching ground level
         float legFade = smoothstep(-40.0, 30.0, vArchWorld.y);
         gl_FragColor.a = legFade;
         if (legFade < 0.01) discard;

         // ── Clamp output to prevent HDR blowout from bloom ──
`
      )

      shaderRef.current = shader
    }

    return mat
  }, [])

  useFrame(({ camera }) => {
    if (!meshRef.current) return
    const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
    const { currentTime } = useTimeOfDay.getState()
    const isNight = sunAltitude < -0.12
    const t = Math.max(0, Math.min(1, (sunAltitude + 0.12) / 0.42))
    const day = t * t * (3 - 2 * t)

    // Emissive: subtle glow at night so arch is visible against dark sky
    material.emissiveIntensity = 0.06 * (1 - day)

    // At night: reduce metalness so PBR doesn't amplify moonlight into a spotlight
    material.metalness = 0.5 + day * 0.42 // 0.5 at night, 0.92 in day
    material.roughness = 0.04 + (1 - day) * 0.15 // rougher at night, less specular catch

    // Dynamic color: warmer in golden hour, darker/cooler at night
    const r = 0.55 + day * 0.33
    const g = 0.55 + day * 0.33
    const b = 0.60 + day * 0.27
    material.color.setRGB(r, g, b)

    meshRef.current.rotation.y = ARCH_FIXED_ROTATION

    if (shaderRef.current) {
      shaderRef.current.uniforms.uDayFactor.value = day

      const hc = useSkyState.getState().horizonColor
      shaderRef.current.uniforms.uHorizonColor.value.copy(hc)
      const gc = shaderRef.current.uniforms.uGroundColor.value
      gc.set(hc.r * 0.35 + 0.02, hc.g * 0.35 + 0.03, hc.b * 0.30)

      // Sky brightness — drives how bright the arch appears (never fully dark)
      shaderRef.current.uniforms.uSkyBright.value = 0.25 + day * 0.75

      // Compute sun and moon as direction vectors, then blend the vectors
      // (blending angles causes jumps when they're far apart)
      const sunPos = SunCalc.getPosition(currentTime, LATITUDE, LONGITUDE)
      const moonPos = SunCalc.getMoonPosition(currentTime, LATITUDE, LONGITUDE)
      const sunAz = sunPos.azimuth + Math.PI
      const sunAlt = sunPos.altitude
      const moonAz = moonPos.azimuth + Math.PI
      const moonAlt = Math.max(0.05, moonPos.altitude)

      const sunDirX = Math.cos(sunAlt) * Math.sin(sunAz)
      const sunDirY = Math.sin(sunAlt)
      const sunDirZ = -Math.cos(sunAlt) * Math.cos(sunAz)
      const moonDirX = Math.cos(moonAlt) * Math.sin(moonAz)
      const moonDirY = Math.sin(moonAlt)
      const moonDirZ = -Math.cos(moonAlt) * Math.cos(moonAz)

      const blend = Math.max(0, Math.min(1, (sunAltitude + 0.2) / 0.4))
      let lx = sunDirX * blend + moonDirX * (1 - blend)
      let ly = sunDirY * blend + moonDirY * (1 - blend)
      let lz = sunDirZ * blend + moonDirZ * (1 - blend)
      const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1
      lx /= ll; ly /= ll; lz /= ll

      shaderRef.current.uniforms.uSunDir.value.set(lx, ly, lz)

      // Glint position — use the blended direction
      const azimuth = Math.atan2(lx, -lz)
      const relAngle = azimuth - ARCH_FIXED_ROTATION
      const glintFromSun = 0.5 + Math.sin(relAngle) * 0.48
      const dx = camera.position.x - (-400)
      const dz = camera.position.z - 230
      const lateral = (dx * 0.358 + dz * 0.934) / 140
      const cameraShift = Math.max(-0.15, Math.min(0.15, lateral * 0.15))
      shaderRef.current.uniforms.uGlintPos.value = Math.max(0.02, Math.min(0.98, glintFromSun + cameraShift))

      // Glint brightness: strong at all times — this is the drama
      const altFade = Math.max(0.5, 1.0 - Math.abs(sunAltitude) * 1.2)
      shaderRef.current.uniforms.uGlintBright.value = altFade
    }
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[ARCH_POSITION[0], ARCH_Y_OFFSET, ARCH_POSITION[2]]}
      scale={ARCH_SCALE}
      frustumCulled={false}
    />
  )
}
