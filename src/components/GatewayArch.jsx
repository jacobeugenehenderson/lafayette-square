import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
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
const ARCH_SCALE = 2.1
const ARCH_Y_OFFSET = -30

// Real arch faces roughly north-south (legs N/S, curve arches E-W).
const ARCH_FIXED_ROTATION = 1.36 // radians

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
      transparent: true,
      depthWrite: true,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlintPos = { value: 0.5 }
      shader.uniforms.uGlintBright = { value: 1.0 }
      shader.uniforms.uFlash = { value: 0.0 }
      shader.uniforms.uFlashPos = { value: 0.5 }
      shader.uniforms.uCameraPos = { value: new THREE.Vector3() }
      shader.uniforms.uSunDir = { value: new THREE.Vector3(0, 0.3, 1) }
      shader.uniforms.uDayFactor = { value: 1.0 }

      // Vertex: pass curve param, edge param, world position, world normal
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

      // Fragment: declare uniforms and varyings
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uGlintPos;
         uniform float uGlintBright;
         uniform float uFlash;
         uniform float uFlashPos;
         uniform vec3 uCameraPos;
         uniform vec3 uSunDir;
         uniform float uDayFactor;
         varying float vCurveParam;
         varying float vEdge;
         varying vec3 vArchWorld;
         varying vec3 vArchNormal;`
      )

      // Panel seams + per-panel color variation
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float panelCount = 284.0;
         float panel = fract(vCurveParam * panelCount);
         float seam = smoothstep(0.0, 0.012, panel) * (1.0 - smoothstep(0.988, 1.0, panel));
         float panelId = floor(vCurveParam * panelCount);
         float panelHash = fract(sin(panelId * 127.1) * 43758.5453);
         diffuseColor.rgb *= mix(0.3, 1.0, seam);
         float warmShift = (fract(sin(panelId * 311.7) * 43758.5453) - 0.5) * 0.04;
         diffuseColor.rgb += vec3(warmShift, warmShift * 0.3, -warmShift * 0.5);`
      )

      // Per-panel roughness variation
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(0.5, roughnessFactor, seam);
         roughnessFactor *= 0.85 + 0.3 * panelHash;`
      )

      // Post-lighting: add camera-responsive specular highlights
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>

         vec3 viewDir = normalize(uCameraPos - vArchWorld);
         vec3 N = normalize(vArchNormal);

         // ── 1. Fresnel sheen: bright at grazing angles (edge-on to camera) ──
         float NdotV = max(0.0, dot(N, viewDir));
         float fresnel = pow(1.0 - NdotV, 4.0);
         // Sky-tinted reflection at edges
         vec3 fresnelColor = mix(vec3(0.6, 0.65, 0.75), vec3(0.9, 0.92, 0.95), fresnel);
         gl_FragColor.rgb += fresnelColor * fresnel * (0.1 + uDayFactor * 0.3);

         // ── 2. Broad camera-driven specular band ──
         vec3 reflDir = reflect(-viewDir, N);
         vec3 envDir = mix(vec3(0.0, 1.0, 0.0), uSunDir, uDayFactor);
         float specDot = max(0.0, dot(reflDir, normalize(envDir)));
         float specBroad = pow(specDot, 8.0) * 0.5;
         float specTight = pow(specDot, 64.0) * 0.6;
         vec3 specColor = mix(vec3(0.7, 0.75, 0.85), vec3(1.0, 0.98, 0.92), uDayFactor);
         gl_FragColor.rgb += specColor * (specBroad + specTight);

         // ── 3. Hot corner highlight: tight specular running along triangle edges ──
         // vEdge measures distance to the nearest triangle corner edge (0=face center, 1=edge)
         // The highlight rides the edge and shifts position based on view angle
         float cornerIntensity = smoothstep(0.88, 1.0, vEdge);
         // View-dependent position along curve — the hot spot slides up/down
         float viewSlide = dot(viewDir, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
         // Concentrate the hot spot: peaks where curveParam aligns with viewSlide
         float hotDist = vCurveParam - viewSlide;
         float hotSpot = exp(-hotDist * hotDist * 80.0);
         // Tight bright highlight on corners
         float hotCorner = cornerIntensity * hotSpot;
         vec3 hotColor = vec3(1.0, 0.98, 0.94);
         gl_FragColor.rgb += hotColor * hotCorner * 0.7 * (0.5 + uDayFactor * 0.5);

         // ── 4. Sun/moon glint: narrow traveling band on edges ──
         float edgeMask = smoothstep(0.85, 1.0, vEdge);
         float glintD = vCurveParam - uGlintPos;
         float glint = exp(-glintD * glintD * 3000.0) * edgeMask;
         gl_FragColor.rgb += vec3(1.0, 0.97, 0.9) * glint * uGlintBright * 0.5;

         // ── 5. Major flash: once per camera transit, bloom catches it ──
         if (uFlash > 0.01) {
           float flashEdge = smoothstep(0.82, 1.0, vEdge);
           float flashD = vCurveParam - uFlashPos;
           // Tight core — very bright, narrow
           float flashCore = exp(-flashD * flashD * 6000.0) * flashEdge;
           // Wider bloom-feeding glow around the core
           float flashGlow = exp(-flashD * flashD * 400.0) * flashEdge;
           // Diffuse wash across nearby panels
           float flashWash = exp(-flashD * flashD * 40.0);
           // White-hot core (HDR values >> 1.0 for bloom to catch)
           vec3 flashColor = vec3(1.0, 0.98, 0.94);
           gl_FragColor.rgb += flashColor * flashCore * uFlash * 8.0;
           gl_FragColor.rgb += flashColor * flashGlow * uFlash * 2.0;
           gl_FragColor.rgb += vec3(0.8, 0.82, 0.9) * flashWash * uFlash * 0.3;
         }

         // ── 6. Daytime ambient boost: arch glows brighter in midday sun ──
         gl_FragColor.rgb += vec3(0.35, 0.36, 0.42) * uDayFactor * 0.25;

         // ── 7. Constant base shimmer ──
         float shimmer = fresnel * 0.12 + 0.02;
         gl_FragColor.rgb += vec3(0.5, 0.52, 0.6) * shimmer * (0.1 + uDayFactor * 0.6);

         // ── 8. Fade feet into sky ──
         // No ground plane beneath the arch — just dissolve the lowest geometry
         if (vArchWorld.y < -20.0) discard;
         float footAlpha = smoothstep(-20.0, 40.0, vArchWorld.y);
         gl_FragColor.a *= footAlpha;`
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

    material.emissiveIntensity = 0.1 * (1 - day)

    // Fixed rotation — the real arch doesn't spin
    meshRef.current.rotation.y = ARCH_FIXED_ROTATION

    if (shaderRef.current) {
      // Push camera position for view-dependent specular
      shaderRef.current.uniforms.uCameraPos.value.copy(camera.position)
      shaderRef.current.uniforms.uDayFactor.value = day

      // Sun direction for specular reflection
      let azimuth, altitude
      if (isNight) {
        const moonPos = SunCalc.getMoonPosition(currentTime, LATITUDE, LONGITUDE)
        azimuth = moonPos.azimuth + Math.PI
        altitude = moonPos.altitude
      } else {
        const sunPos = SunCalc.getPosition(currentTime, LATITUDE, LONGITUDE)
        azimuth = sunPos.azimuth + Math.PI
        altitude = sunPos.altitude
      }

      // Sun direction as unit vector
      shaderRef.current.uniforms.uSunDir.value.set(
        Math.cos(altitude) * Math.sin(azimuth),
        Math.sin(altitude),
        -Math.cos(altitude) * Math.cos(azimuth)
      )

      // Sun-driven glint position along curve
      const relAngle = azimuth - ARCH_FIXED_ROTATION
      const glintFromSun = 0.5 + Math.sin(relAngle) * 0.48

      // Camera parallax shifts glint subtly
      const dx = camera.position.x - (-400)
      const dz = camera.position.z - 230
      const lateral = (dx * 0.358 + dz * 0.934) / 140
      const cameraShift = Math.max(-0.15, Math.min(0.15, lateral * 0.15))

      const glintPos = Math.max(0.02, Math.min(0.98, glintFromSun + cameraShift))
      shaderRef.current.uniforms.uGlintPos.value = glintPos

      // Glint brightness: strongest at low sun angles
      const altFade = isNight ? 0.8 : Math.max(0.4, 1.0 - sunAltitude * 1.5)
      shaderRef.current.uniforms.uGlintBright.value = altFade

      // Major flash: fires twice per transit at different lateral positions
      const flash1 = Math.exp(-(lateral - 0.35) * (lateral - 0.35) * 60)
      const flash2 = Math.exp(-(lateral + 0.25) * (lateral + 0.25) * 60)
      const flashTrigger = Math.max(flash1, flash2)
      shaderRef.current.uniforms.uFlash.value = flashTrigger
      // Flash position shifts: first flash near apex, second flash slightly off-center
      const flashPos = flash1 > flash2
        ? 0.5 + cameraShift * 0.5
        : 0.38 + cameraShift * 0.5
      shaderRef.current.uniforms.uFlashPos.value = flashPos
    }
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[ARCH_POSITION[0], ARCH_Y_OFFSET, ARCH_POSITION[2]]}
      scale={ARCH_SCALE}
    />
  )
}
