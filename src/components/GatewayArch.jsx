import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useEnvironment } from '@react-three/drei'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'

// NPS catenary equation converted to meters:
// y(x) = A - B * cosh(C * x)
const A = 211.5    // 693.8597 ft → m
const B = 20.96    // 68.7672 ft → m
const C = 0.03292  // 0.0100333 / 0.3048

const PEAK_HEIGHT = A - B // ~190.5m centerline peak
const HALF_SPAN = Math.acosh(A / B) / C // ~91.2m

// Cross-section tapers from base to top
const BASE_RADIUS = 6.0
const TOP_RADIUS = 2.0

// Equilateral triangle, one vertex pointing up
const TRI_ANGLES = [
  Math.PI / 2,
  Math.PI / 2 + 2 * Math.PI / 3,
  Math.PI / 2 + 4 * Math.PI / 3,
]

function createArchGeometry(curveSegs = 120) {
  const positions = []
  const curveParams = []

  // Pre-compute ring positions along catenary
  const rings = []
  for (let i = 0; i <= curveSegs; i++) {
    const t = i / curveSegs
    const x = -HALF_SPAN + 2 * HALF_SPAN * t
    const y = Math.max(0, A - B * Math.cosh(C * x))

    // Tangent for cross-section orientation
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

  // Build 3 flat face strips (non-indexed for flat normals via computeVertexNormals)
  for (let face = 0; face < 3; face++) {
    const next = (face + 1) % 3
    for (let i = 0; i < curveSegs; i++) {
      const a = rings[i].corners[face]
      const b = rings[i].corners[next]
      const c = rings[i + 1].corners[face]
      const d = rings[i + 1].corners[next]
      const t0 = rings[i].t
      const t1 = rings[i + 1].t

      // Two triangles per quad: (a, b, c) and (c, b, d)
      positions.push(...a, ...b, ...c, ...c, ...b, ...d)
      curveParams.push(t0, t0, t1, t1, t0, t1)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('aCurveParam', new THREE.Float32BufferAttribute(curveParams, 1))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

// Position: real-world offset from Lafayette Park center
const ARCH_POSITION = [2716, 0, -966]

// Scale up; sink legs underground so arch looks anchored
const ARCH_SCALE = 3.5
const ARCH_Y_OFFSET = -80

export default function GatewayArch() {
  const geometry = useMemo(() => createArchGeometry(), [])
  const groupRef = useRef()

  // Load env map for arch only — NOT scene-wide (would wash out everything at night)
  const envMap = useEnvironment({ preset: 'city' })

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#d0d0d8',
      metalness: 0.88,
      roughness: 0.08,
      emissive: '#8888aa',
      emissiveIntensity: 0,
    })

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute float aCurveParam;
         varying float vCurveParam;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vCurveParam = aCurveParam;`
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying float vCurveParam;`
      )

      // Panel seams and per-panel variation
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Panel seam lines — 142 sections per leg
         float panelCount = 284.0;
         float panel = fract(vCurveParam * panelCount);
         float seam = smoothstep(0.0, 0.012, panel) * (1.0 - smoothstep(0.988, 1.0, panel));
         float panelId = floor(vCurveParam * panelCount);
         float panelHash = fract(sin(panelId * 127.1) * 43758.5453);
         // Darken seams
         diffuseColor.rgb *= mix(0.3, 1.0, seam);
         // Per-panel warm/cool shift
         float warmShift = (fract(sin(panelId * 311.7) * 43758.5453) - 0.5) * 0.04;
         diffuseColor.rgb += vec3(warmShift, warmShift * 0.3, -warmShift * 0.5);`
      )

      // Roughness variation per panel
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(0.6, roughnessFactor, seam);
         roughnessFactor *= 0.85 + 0.3 * panelHash;`
      )
    }

    return mat
  }, [])

  // Apply env map to arch material only (not scene-wide)
  useEffect(() => {
    if (envMap) {
      material.envMap = envMap
      material.needsUpdate = true
    }
  }, [envMap, material])

  // Billboard + time-of-day lighting
  useFrame(({ camera }) => {
    if (!groupRef.current) return
    const dx = camera.position.x - ARCH_POSITION[0]
    const dz = camera.position.z - ARCH_POSITION[2]
    groupRef.current.rotation.y = Math.atan2(dx, dz)

    // Modulate environment reflections and emissive by time of day
    const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
    const t = Math.max(0, Math.min(1, (sunAltitude + 0.12) / 0.42))
    const day = t * t * (3 - 2 * t) // smoothstep
    material.envMapIntensity = 0.1 + 0.6 * day
    // Subtle night glow (arch is artificially lit IRL)
    material.emissiveIntensity = 0.2 * (1 - day)
  })

  return (
    <group ref={groupRef} position={[ARCH_POSITION[0], ARCH_Y_OFFSET, ARCH_POSITION[2]]}>
      <mesh geometry={geometry} scale={ARCH_SCALE} castShadow material={material} />
    </group>
  )
}
