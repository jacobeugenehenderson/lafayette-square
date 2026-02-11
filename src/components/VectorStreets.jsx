import { useMemo } from 'react'
import * as THREE from 'three'
import blockShapes from '../data/block_shapes.json'
import groundLayers from '../data/ground_layers.json'
import useCamera from '../hooks/useCamera'
import { mergeBufferGeometries } from '../lib/mergeGeometries'

// ── Colors & constants ──────────────────────────────────────────────────────
const ROAD_COLOR   = '#0e0e12'

// ── Geometry helpers ────────────────────────────────────────────────────────

function getPathLength(points) {
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i-1][0]
    const dz = points[i][1] - points[i-1][1]
    length += Math.sqrt(dx * dx + dz * dz)
  }
  return length
}

function catmullRomSpline(points, numSegments) {
  if (points.length < 2) return points
  if (points.length === 2) {
    const result = []
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments
      result.push([
        points[0][0] + (points[1][0] - points[0][0]) * t,
        points[0][1] + (points[1][1] - points[0][1]) * t
      ])
    }
    return result
  }

  const result = []
  const extended = [
    [2 * points[0][0] - points[1][0], 2 * points[0][1] - points[1][1]],
    ...points,
    [2 * points[points.length-1][0] - points[points.length-2][0],
     2 * points[points.length-1][1] - points[points.length-2][1]]
  ]

  const segsPerSection = Math.max(2, Math.ceil(numSegments / (points.length - 1)))

  for (let i = 1; i < extended.length - 2; i++) {
    const p0 = extended[i - 1]
    const p1 = extended[i]
    const p2 = extended[i + 1]
    const p3 = extended[i + 2]

    for (let j = 0; j < segsPerSection; j++) {
      const t = j / segsPerSection
      const t2 = t * t
      const t3 = t2 * t

      const x = 0.5 * (
        (2 * p1[0]) +
        (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
      )
      const z = 0.5 * (
        (2 * p1[1]) +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
      )
      result.push([x, z])
    }
  }

  result.push([points[points.length-1][0], points[points.length-1][1]])
  return result
}

function buildRoadGeometry(points, width, yOffset = 0.1) {
  if (points.length < 2) return null

  const pathLength = getPathLength(points)
  const baseSegments = Math.ceil(pathLength / 2)
  const numSegments = Math.min(400, Math.max(8, baseSegments))

  const smoothedPoints = points.length >= 3 && pathLength > 10
    ? catmullRomSpline(points, numSegments)
    : points

  const halfWidth = width / 2
  const vertices = []
  const indices = []
  const miterLimit = 2.0

  const perps = []
  const miterScales = []

  for (let i = 0; i < smoothedPoints.length; i++) {
    let tangent
    let miterScale = 1.0

    if (i === 0) {
      tangent = [
        smoothedPoints[1][0] - smoothedPoints[0][0],
        smoothedPoints[1][1] - smoothedPoints[0][1]
      ]
    } else if (i === smoothedPoints.length - 1) {
      tangent = [
        smoothedPoints[i][0] - smoothedPoints[i-1][0],
        smoothedPoints[i][1] - smoothedPoints[i-1][1]
      ]
    } else {
      const t1 = [
        smoothedPoints[i][0] - smoothedPoints[i-1][0],
        smoothedPoints[i][1] - smoothedPoints[i-1][1]
      ]
      const t2 = [
        smoothedPoints[i+1][0] - smoothedPoints[i][0],
        smoothedPoints[i+1][1] - smoothedPoints[i][1]
      ]

      const len1 = Math.sqrt(t1[0]*t1[0] + t1[1]*t1[1]) || 1
      const len2 = Math.sqrt(t2[0]*t2[0] + t2[1]*t2[1]) || 1
      const n1 = [t1[0]/len1, t1[1]/len1]
      const n2 = [t2[0]/len2, t2[1]/len2]

      tangent = [n1[0] + n2[0], n1[1] + n2[1]]

      const dot = n1[0] * n2[0] + n1[1] * n2[1]
      const clampedDot = Math.max(-1, Math.min(1, dot))
      const angle = Math.acos(clampedDot)
      const halfAngle = angle / 2
      if (halfAngle > 0.01) {
        miterScale = 1 / Math.cos(halfAngle)
        miterScale = Math.min(miterScale, miterLimit)
      }
    }

    const len = Math.sqrt(tangent[0]*tangent[0] + tangent[1]*tangent[1]) || 1
    perps.push([-tangent[1]/len, tangent[0]/len])
    miterScales.push(miterScale)
  }

  for (let i = 0; i < smoothedPoints.length; i++) {
    const [x, z] = smoothedPoints[i]
    const [px, pz] = perps[i]
    const scale = miterScales[i]
    const adjustedHalfWidth = halfWidth * scale

    vertices.push(
      x + px * adjustedHalfWidth, yOffset, z + pz * adjustedHalfWidth,
      x - px * adjustedHalfWidth, yOffset, z - pz * adjustedHalfWidth
    )

    if (i > 0) {
      const base = (i - 1) * 2
      indices.push(base, base + 2, base + 1)
      indices.push(base + 1, base + 2, base + 3)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// ── Center lines on principal streets ────────────────────────────────────────

const PRINCIPAL_STREETS = new Set([
  'Park Avenue', 'Lafayette Avenue', 'Chouteau Avenue',
  'South Jefferson Avenue', 'Truman Parkway',
])

function CenterLines({ streets }) {
  const geometry = useMemo(() => {
    const geometries = []

    ;(streets || []).forEach(street => {
      if (street.points && street.points.length >= 2) {
        if (PRINCIPAL_STREETS.has(street.name)) {
          const geo = buildRoadGeometry(street.points, 0.6, 0.18)
          if (geo) geometries.push(geo)
        }
      }
    })

    if (geometries.length === 0) return null

    const merged = mergeBufferGeometries(geometries)
    geometries.forEach(g => g.dispose())
    return merged
  }, [streets])

  if (!geometry) return null

  return (
    <mesh geometry={geometry} position={[0, 0.15, 0]}>
      <meshStandardMaterial
        color="#d4c46a"
        emissive="#d4c46a"
        emissiveIntensity={0.12}
        roughness={0.35}
      />
    </mesh>
  )
}

// ── Lightweight strip builder (no Catmull-Rom — SVG points are pre-smoothed) ─

function buildStripGeometry(points, width, yOffset = 0) {
  if (points.length < 2) return null
  const halfWidth = width / 2
  const vertices = []
  const indices = []

  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i]
    let tx, tz
    if (i === 0) { tx = points[1][0] - x; tz = points[1][1] - z }
    else if (i === points.length - 1) { tx = x - points[i-1][0]; tz = z - points[i-1][1] }
    else { tx = points[i+1][0] - points[i-1][0]; tz = points[i+1][1] - points[i-1][1] }
    const len = Math.sqrt(tx * tx + tz * tz) || 1
    const px = -tz / len, pz = tx / len

    vertices.push(
      x + px * halfWidth, yOffset, z + pz * halfWidth,
      x - px * halfWidth, yOffset, z - pz * halfWidth
    )
    if (i > 0) {
      const base = (i - 1) * 2
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// ── SVG-sourced streets (from Illustrator artwork) ──────────────────────

function SvgStreets({ heroMode }) {
  const { streetGroups, blockGeometry } = useMemo(() => {
    // Group streets by color
    const streetsByColor = {}
    for (const seg of groundLayers.streets) {
      if (seg.points.length < 2) continue
      const color = seg.color || '#000'
      if (!streetsByColor[color]) streetsByColor[color] = []
      streetsByColor[color].push(seg)
    }

    const streetGroups = []
    for (const [color, segs] of Object.entries(streetsByColor)) {
      const geos = []
      for (const seg of segs) {
        const geo = buildStripGeometry(seg.points, seg.width, 0)
        if (geo) geos.push(geo)
      }
      if (geos.length > 0) {
        streetGroups.push({ color, geometry: mergeBufferGeometries(geos) })
        geos.forEach(g => g.dispose())
      }
    }

    // Merge ALL blocks into one mesh with vertex colors (avoids Z-fighting)
    const tmpColor = new THREE.Color()
    const blockGeos = []
    const blockColors = [] // { count, r, g, b } per block
    for (const blk of groundLayers.blocks) {
      if (blk.polygon.length < 3) continue
      const color = blk.color || '#000'
      if (color === '#000') continue
      const shape = new THREE.Shape()
      shape.moveTo(blk.polygon[0][0], -blk.polygon[0][1])
      for (let i = 1; i < blk.polygon.length; i++) {
        shape.lineTo(blk.polygon[i][0], -blk.polygon[i][1])
      }
      shape.closePath()
      const geo = new THREE.ShapeGeometry(shape)
      geo.rotateX(-Math.PI / 2)
      tmpColor.set(color)
      blockColors.push({ count: geo.attributes.position.count, r: tmpColor.r, g: tmpColor.g, b: tmpColor.b })
      blockGeos.push(geo)
    }
    let blockGeometry = null
    if (blockGeos.length > 0) {
      blockGeometry = mergeBufferGeometries(blockGeos)
      // Apply vertex colors after merge (mergeBufferGeometries only copies position)
      const totalVerts = blockGeometry.attributes.position.count
      const colorArr = new Float32Array(totalVerts * 3)
      let offset = 0
      for (const { count, r, g, b } of blockColors) {
        for (let i = 0; i < count; i++) {
          colorArr[offset++] = r
          colorArr[offset++] = g
          colorArr[offset++] = b
        }
      }
      blockGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3))
    }
    blockGeos.forEach(g => g.dispose())

    return { streetGroups, blockGeometry }
  }, [])

  return (
    <group>
      {blockGeometry && (
        <mesh geometry={blockGeometry} position={[0, 0.3, 0]}>
          <meshStandardMaterial vertexColors roughness={0.92} depthWrite={false} />
        </mesh>
      )}
      {!heroMode && streetGroups.map(({ color, geometry }) => (
        <mesh key={`st-${color}`} geometry={geometry} position={[0, 0.45, 0]} receiveShadow>
          <meshStandardMaterial color={color} roughness={0.92} />
        </mesh>
      ))}
    </group>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

function VectorStreets() {
  const viewMode = useCamera((s) => s.viewMode)
  const isHero = viewMode === 'hero'

  const handleDoubleClick = (event) => {
    event.stopPropagation()
    const { x, z } = event.point
    useCamera.getState().enterStreetView([x, 0, z])
  }

  return (
    <group>
      {/* Ground plane — black, soft circular fade at edges */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow onDoubleClick={handleDoubleClick}>
        <circleGeometry args={[5000, 64]} />
        <meshStandardMaterial
          color="#0a0a0c"
          roughness={0.95}
          transparent
          onBeforeCompile={(shader) => {
            shader.vertexShader = shader.vertexShader.replace(
              '#include <common>',
              `#include <common>
               varying vec2 vWorldXZ;`
            )
            shader.vertexShader = shader.vertexShader.replace(
              '#include <worldpos_vertex>',
              `#include <worldpos_vertex>
               vWorldXZ = worldPosition.xz;`
            )
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <common>',
              `#include <common>
               varying vec2 vWorldXZ;`
            )
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <dithering_fragment>',
              `#include <dithering_fragment>
               float dist = length(vWorldXZ);
               float fade = 1.0 - smoothstep(3500.0, 4800.0, dist);
               gl_FragColor.a *= fade;`
            )
          }}
        />
      </mesh>

      {/* SVG-sourced ground layers */}
      <SvgStreets heroMode={isHero} />

      {/* Center lines — hero doesn't need this detail */}
      {!isHero && <CenterLines streets={blockShapes.streets} />}
    </group>
  )
}

export default VectorStreets
