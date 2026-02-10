import { useMemo } from 'react'
import * as THREE from 'three'
import streetsData from '../data/streets.json'
import blockShapes from '../data/block_shapes.json'
import useCamera from '../hooks/useCamera'
import { mergeBufferGeometries } from '../lib/mergeGeometries'

// ── Colors & constants ──────────────────────────────────────────────────────
const ROAD_COLOR   = '#404045'
const LOT_COLOR    = '#2a2a32'
const SIDEWALK_CLR = '#8a8a82'

const PATH_WIDTHS = {
  primary: 6, secondary: 5, tertiary: 4, residential: 3.6, service: 4,
}

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

// ── City blocks: lot fills + sidewalk rings from pre-computed shapes ────────

function CityBlocks() {
  const { lotGeometry, sidewalkGeometry } = useMemo(() => {
    const lotGeos = []
    const swGeos = []

    for (const block of blockShapes.blocks) {
      // Park lot fill is rendered by LafayettePark.jsx — skip it here
      if (!block.isPark) {
        const lotShape = new THREE.Shape()
        lotShape.moveTo(block.lot[0][0], -block.lot[0][1])
        for (let i = 1; i < block.lot.length; i++) {
          lotShape.lineTo(block.lot[i][0], -block.lot[i][1])
        }
        lotShape.closePath()

        const lotGeo = new THREE.ShapeGeometry(lotShape)
        lotGeo.rotateX(-Math.PI / 2)
        lotGeos.push(lotGeo)
      }

      // Sidewalk ring: curb boundary with lot as hole (park gets one too)
      if (!block.sidewalk) continue
      const swShape = new THREE.Shape()
      swShape.moveTo(block.sidewalk[0][0], -block.sidewalk[0][1])
      for (let i = 1; i < block.sidewalk.length; i++) {
        swShape.lineTo(block.sidewalk[i][0], -block.sidewalk[i][1])
      }
      swShape.closePath()

      const holePts = [...block.lot].reverse()
      const hole = new THREE.Path()
      hole.moveTo(holePts[0][0], -holePts[0][1])
      for (let i = 1; i < holePts.length; i++) {
        hole.lineTo(holePts[i][0], -holePts[i][1])
      }
      hole.closePath()
      swShape.holes.push(hole)

      const swGeo = new THREE.ShapeGeometry(swShape)
      swGeo.rotateX(-Math.PI / 2)
      swGeos.push(swGeo)
    }

    const mergedLot = lotGeos.length > 0 ? mergeBufferGeometries(lotGeos) : null
    const mergedSw = swGeos.length > 0 ? mergeBufferGeometries(swGeos) : null
    lotGeos.forEach(g => g.dispose())
    swGeos.forEach(g => g.dispose())

    return { lotGeometry: mergedLot, sidewalkGeometry: mergedSw }
  }, [])

  return (
    <group>
      {lotGeometry && (
        <mesh geometry={lotGeometry} position={[0, 0.05, 0]} receiveShadow>
          <meshStandardMaterial color={LOT_COLOR} roughness={0.92} />
        </mesh>
      )}
      {sidewalkGeometry && (
        <mesh geometry={sidewalkGeometry} position={[0, 0.08, 0]} receiveShadow>
          <meshStandardMaterial color={SIDEWALK_CLR} roughness={0.92} />
        </mesh>
      )}
    </group>
  )
}

// ── Center lines on major roads ─────────────────────────────────────────────

function CenterLines({ streets }) {
  const geometry = useMemo(() => {
    const geometries = []

    streets.forEach(street => {
      if (street.points && street.points.length >= 2) {
        const isMajor = street.type === 'primary' || street.type === 'secondary'
        if (isMajor) {
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
    <mesh geometry={geometry} position={[0, 0.02, 0]}>
      <meshStandardMaterial
        color="#d4c46a"
        emissive="#d4c46a"
        emissiveIntensity={0.12}
        roughness={0.35}
      />
    </mesh>
  )
}

// ── Alley fill polygons (from pre-computed Clipper difference) ───────────────

function AlleyFillPolygons() {
  const geometry = useMemo(() => {
    if (!blockShapes.alleyFills || blockShapes.alleyFills.length === 0) return null

    const geos = []
    for (const af of blockShapes.alleyFills) {
      if (af.polygon.length < 3) continue
      const shape = new THREE.Shape()
      shape.moveTo(af.polygon[0][0], -af.polygon[0][1])
      for (let i = 1; i < af.polygon.length; i++) {
        shape.lineTo(af.polygon[i][0], -af.polygon[i][1])
      }
      shape.closePath()
      const geo = new THREE.ShapeGeometry(shape)
      geo.rotateX(-Math.PI / 2)
      geos.push(geo)
    }

    if (geos.length === 0) return null
    const merged = mergeBufferGeometries(geos)
    geos.forEach(g => g.dispose())
    return merged
  }, [])

  if (!geometry) return null
  return (
    <mesh geometry={geometry} position={[0, 0.08, 0]} receiveShadow>
      <meshStandardMaterial color={SIDEWALK_CLR} roughness={0.92} />
    </mesh>
  )
}

// ── Park interior paths (from OSM unnamed segments) ─────────────────────────

function UnnamedPaths({ segments }) {
  const geometry = useMemo(() => {
    const geometries = []
    segments.forEach(street => {
      if (street.points && street.points.length >= 2) {
        const geo = buildRoadGeometry(street.points, PATH_WIDTHS[street.type] || 3.6, 0.07)
        if (geo) geometries.push(geo)
      }
    })
    if (geometries.length === 0) return null
    const merged = mergeBufferGeometries(geometries)
    geometries.forEach(g => g.dispose())
    return merged
  }, [segments])

  if (!geometry) return null
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={SIDEWALK_CLR} roughness={0.92} />
    </mesh>
  )
}

// ── Park boundary check ─────────────────────────────────────────────────────

const PARK_COS = Math.cos(9.2 * Math.PI / 180)
const PARK_SIN = Math.sin(9.2 * Math.PI / 180)

const PARK_CLIP = 175  // clip at park lot edge

function toRotated(x, z) {
  return [x * PARK_COS + z * PARK_SIN, -x * PARK_SIN + z * PARK_COS]
}

function toWorld(rx, rz) {
  return [rx * PARK_COS - rz * PARK_SIN, rx * PARK_SIN + rz * PARK_COS]
}

function isInsidePark(x, z) {
  const [rx, rz] = toRotated(x, z)
  return Math.abs(rx) < PARK_CLIP && Math.abs(rz) < PARK_CLIP
}

// Find parameter t where segment (rx0,rz0)→(rx1,rz1) crosses the ±PARK_CLIP box
function clipSegmentT(rx0, rz0, rx1, rz1) {
  let tMin = 0, tMax = 1
  const dx = rx1 - rx0, dz = rz1 - rz0
  // Clip against each edge of the box
  for (const [p, d, lo, hi] of [
    [rx0, dx, -PARK_CLIP, PARK_CLIP],
    [rz0, dz, -PARK_CLIP, PARK_CLIP],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return null  // parallel & outside
    } else {
      let t1 = (lo - p) / d, t2 = (hi - p) / d
      if (t1 > t2) [t1, t2] = [t2, t1]
      tMin = Math.max(tMin, t1)
      tMax = Math.min(tMax, t2)
      if (tMin > tMax) return null
    }
  }
  return [tMin, tMax]
}

// Clip paths to park boundary with proper segment interpolation
function clipParkPaths(streets) {
  const result = []
  for (const street of streets) {
    if (street.name || !street.points || street.points.length < 2) continue

    const mid = street.points[Math.floor(street.points.length / 2)]
    if (!isInsidePark(mid[0], mid[1])) continue

    // Walk points, building clipped runs
    const clipped = []
    for (let i = 0; i < street.points.length; i++) {
      const [x, z] = street.points[i]
      const inside = isInsidePark(x, z)

      if (inside) {
        // If previous point was outside, interpolate entry point
        if (clipped.length === 0 && i > 0) {
          const [px, pz] = street.points[i - 1]
          const [rx0, rz0] = toRotated(px, pz)
          const [rx1, rz1] = toRotated(x, z)
          const clip = clipSegmentT(rx0, rz0, rx1, rz1)
          if (clip) {
            const t = clip[0]
            const ex = px + t * (x - px), ez = pz + t * (z - pz)
            clipped.push([ex, ez])
          }
        }
        clipped.push([x, z])
      } else if (clipped.length > 0) {
        // Just left the boundary — interpolate exit point
        const [px, pz] = street.points[i - 1]
        const [rx0, rz0] = toRotated(px, pz)
        const [rx1, rz1] = toRotated(x, z)
        const clip = clipSegmentT(rx0, rz0, rx1, rz1)
        if (clip) {
          const t = clip[1]
          const ex = px + t * (x - px), ez = pz + t * (z - pz)
          clipped.push([ex, ez])
        }
        // Flush this run
        if (clipped.length >= 2) {
          result.push({ points: [...clipped], type: street.type })
        }
        clipped.length = 0
      }
    }
    // Flush remaining
    if (clipped.length >= 2) {
      result.push({ points: clipped, type: street.type })
    }
  }
  return result
}

// ── Main component ──────────────────────────────────────────────────────────

function VectorStreets() {
  const parkPaths = useMemo(() => clipParkPaths(streetsData.streets), [])

  const handleDoubleClick = (event) => {
    event.stopPropagation()
    const { x, z } = event.point
    useCamera.getState().enterStreetView([x, 0, z])
  }

  return (
    <group>
      {/* Ground plane — flat road color */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow onDoubleClick={handleDoubleClick}>
        <planeGeometry args={[2400, 2400]} />
        <meshStandardMaterial color={ROAD_COLOR} roughness={0.95} />
      </mesh>

      {/* City blocks: lot fills + sidewalk rings */}
      <CityBlocks />

      {/* Alley fill polygons — sidewalk-colored between blocks */}
      <AlleyFillPolygons />

      {/* Park interior paths */}
      <UnnamedPaths segments={parkPaths} />

      {/* Center lines on major roads (from cleaned, joined polylines) */}
      <CenterLines streets={blockShapes.streets} />
    </group>
  )
}

export default VectorStreets
