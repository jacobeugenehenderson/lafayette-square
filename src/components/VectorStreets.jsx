import { useMemo } from 'react'
import * as THREE from 'three'
import streetsData from '../data/streets.json'
import blocksData from '../data/blocks.json'
import landuseData from '../data/landuse.json'
import useCamera from '../hooks/useCamera'
import { mergeBufferGeometries } from '../lib/mergeGeometries'

// Per-street road widths measured from parallel sidewalk segment offsets
// road width = 2 * sidewalk_offset - sidewalk_strip_width
const ROAD_WIDTH_BY_NAME = {
  // Major arteries
  'South Jefferson Avenue': 20,
  'South Tucker Boulevard': 14,
  'Gravois Avenue': 6,
  'Officer David Haynes Memorial Highway': 14,
  // Secondary / border streets
  'Chouteau Avenue': 17,
  'Russell Boulevard': 16,
  'Truman Parkway': 13,
  'Lafayette Avenue': 23,
  'Park Avenue': 15,
  'Missouri Avenue': 12,
  'Mississippi Avenue': 14,
  // Interior through-streets
  'South 18th Street': 10,
  'South 13th Street': 12,
  'Papin Street': 13,
  'Geyer Avenue': 9,
  'Dolman Street': 9,
  'Rutger Street': 9,
  'Allen Avenue': 9,
  'Ohio Avenue': 8,
  'Hickory Street': 8,
  'Carroll Street': 9,
  'Grattan Street': 9,
  // Small residential / places
  'Lasalle Street': 6,
  'Waverly Place': 8,
  'Mackay Place': 8,
  'South 22nd Street': 6,
  'Dillon Street': 12,
  'Preston Place': 10,
  'Albion Place': 12,
  'Whittemore Place': 8,
  'Vail Place': 8,
  'Simpson Place': 7,
  'Ann Avenue': 9,
  'McNair Avenue': 9,
  'Benton Place': 5,
  'Nicholson Place': 3,
  'Kennett Place': 3,
  'Caroline Street': 5,
  'Serbian Drive': 8,
  'Hickory Lane': 6,
  'Dillon Drive': 6,
  'South 12th Street': 5,
  'South 17th Street': 6,
  'South 21st Street': 6,
  'Josephine Street': 6,
  'Rutger Lane': 4,
  '21st Street Cycle Track': 5,
}

// Fallback widths by type (for unnamed segments = sidewalks)
const STREET_WIDTHS = {
  primary: 6,
  secondary: 5,
  tertiary: 4,
  residential: 3.6,
  service: 4,
}

const STREET_Y_OFFSET = {
  primary: 0.16,
  secondary: 0.14,
  tertiary: 0.12,
  residential: 0.10,
  service: 0.08,
}

const STREET_COLORS = {
  primary: '#4a4a50',
  secondary: '#454548',
  tertiary: '#404045',
  residential: '#3a3a40',
  service: '#353538',
}

const LANDUSE_COLORS = {
  park: '#2d4a2d',
  grass: '#3a5a3a',
  water: '#2a4060',
  waterway: '#2a4060',
  parking: '#35353d',
  railway: '#28282e',
  residential: '#32323a',
  commercial: '#35353d',
  industrial: '#303038',
}

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

function buildRoadGeometry(points, width, yOffset = 0.1, centerOffset = 0) {
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
    // Shift the center of the strip perpendicular to the road
    const cx = x + px * centerOffset
    const cz = z + pz * centerOffset

    vertices.push(
      cx + px * adjustedHalfWidth, yOffset, cz + pz * adjustedHalfWidth,
      cx - px * adjustedHalfWidth, yOffset, cz - pz * adjustedHalfWidth
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

function buildCenterLineGeometry(points, width = 0.5) {
  return buildRoadGeometry(points, width, 0.18)
}

function BatchedStreets({ streets, type }) {
  const geometry = useMemo(() => {
    const geometries = []
    const fallbackWidth = STREET_WIDTHS[type] || STREET_WIDTHS.residential
    const yOffset = STREET_Y_OFFSET[type] || 0.1

    streets.forEach(street => {
      if (street.points && street.points.length >= 2) {
        const width = (street.name && ROAD_WIDTH_BY_NAME[street.name]) || fallbackWidth
        const geo = buildRoadGeometry(street.points, width, yOffset)
        if (geo) geometries.push(geo)
      }
    })

    if (geometries.length === 0) return null

    const merged = mergeBufferGeometries(geometries)
    geometries.forEach(g => g.dispose())
    return merged
  }, [streets, type])

  if (!geometry) return null

  const color = STREET_COLORS[type] || STREET_COLORS.residential
  const roughness = type === 'primary' ? 0.85 : type === 'secondary' ? 0.87 : 0.9

  const handleDoubleClick = (event) => {
    event.stopPropagation()
    const { x, z } = event.point
    useCamera.getState().enterStreetView([x, 0, z])
  }

  return (
    <mesh geometry={geometry} receiveShadow onDoubleClick={handleDoubleClick}>
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  )
}

// Inset a polygon by `distance` (positive = inward toward centroid)
// Uses miter-based vertex offsetting
function insetPolygon(pts, distance) {
  const n = pts.length
  // Compute outward edge normals
  const edgeNormals = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const dx = pts[j][0] - pts[i][0]
    const dz = pts[j][1] - pts[i][1]
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    edgeNormals.push([dz / len, -dx / len])
  }

  // Ensure normals point outward (away from centroid)
  const cx = pts.reduce((s, p) => s + p[0], 0) / n
  const cz = pts.reduce((s, p) => s + p[1], 0) / n
  const midX = (pts[0][0] + pts[1][0]) / 2
  const midZ = (pts[0][1] + pts[1][1]) / 2
  const dot = (cx - midX) * edgeNormals[0][0] + (cz - midZ) * edgeNormals[0][1]
  if (dot > 0) {
    edgeNormals.forEach(en => { en[0] = -en[0]; en[1] = -en[1] })
  }

  const result = []
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n
    const n1 = edgeNormals[prev]
    const n2 = edgeNormals[i]
    const bx = n1[0] + n2[0]
    const bz = n1[1] + n2[1]
    const bLen2 = bx * bx + bz * bz
    // Inward = negative of outward normal direction
    if (bLen2 < 0.001) {
      result.push([pts[i][0] - n2[0] * distance, pts[i][1] - n2[1] * distance])
    } else {
      const scale = 2 * distance / bLen2
      // Clamp miter to prevent spikes at sharp corners
      const miterLen = Math.sqrt(4 * distance * distance / bLen2)
      if (miterLen > distance * 3) {
        // Fall back to simple offset at sharp corners
        result.push([pts[i][0] - n2[0] * distance, pts[i][1] - n2[1] * distance])
      } else {
        result.push([pts[i][0] - bx * scale, pts[i][1] - bz * scale])
      }
    }
  }
  return result
}

// Park block ID from city data (Lafayette Park itself)
const PARK_BLOCK_ID = '1214000'

function BlockSidewalks() {
  const geometry = useMemo(() => {
    const insetDist = 10 // meters inward from block edge (covers road half-width + sidewalk)
    const geometries = []

    for (const block of blocksData.blocks) {
      if (block.id === PARK_BLOCK_ID) continue // handled by ParkPerimeterSidewalk
      if (block.area < 1500) continue // skip tiny slivers

      // Remove closing point if duplicated
      let poly = block.points
      if (poly.length > 1 &&
          poly[0][0] === poly[poly.length - 1][0] &&
          poly[0][1] === poly[poly.length - 1][1]) {
        poly = poly.slice(0, -1)
      }
      if (poly.length < 3) continue

      const inner = insetPolygon(poly, insetDist)

      // Build shape: outer = block edge, hole = inset boundary
      const shape = new THREE.Shape()
      shape.moveTo(poly[0][0], -poly[0][1])
      for (let i = 1; i < poly.length; i++) {
        shape.lineTo(poly[i][0], -poly[i][1])
      }
      shape.closePath()

      const hole = new THREE.Path()
      hole.moveTo(inner[0][0], -inner[0][1])
      for (let i = 1; i < inner.length; i++) {
        hole.lineTo(inner[i][0], -inner[i][1])
      }
      hole.closePath()
      shape.holes.push(hole)

      try {
        const geo = new THREE.ShapeGeometry(shape)
        geo.rotateX(-Math.PI / 2)
        geometries.push(geo)
      } catch (e) {
        // Skip blocks that fail triangulation (degenerate geometry)
      }
    }

    if (geometries.length === 0) return null
    const merged = mergeBufferGeometries(geometries)
    geometries.forEach(g => g.dispose())
    return merged
  }, [])

  if (!geometry) return null

  return (
    <mesh geometry={geometry} position={[0, 0.07, 0]} receiveShadow>
      <meshStandardMaterial color="#8a8a82" roughness={0.92} />
    </mesh>
  )
}

// Clean sidewalk frame around Lafayette Park perimeter with rounded corners
function ParkPerimeterSidewalk() {
  const geometry = useMemo(() => {
    // Park is 350x350 centered at origin, rotated -9.2°
    const half = 175
    const sidewalkWidth = 4
    const cornerRadius = 4
    const segments = 8 // segments per corner arc

    // Build rounded rectangle path
    function roundedRect(h, r) {
      const pts = []
      // Start at bottom-left, going clockwise
      // Bottom edge (left to right)
      pts.push([-h + r, -h])
      pts.push([h - r, -h])
      // Bottom-right corner
      for (let i = 0; i <= segments; i++) {
        const a = -Math.PI / 2 + (Math.PI / 2) * (i / segments)
        pts.push([h - r + r * Math.cos(a), -h + r + r * Math.sin(a)])
      }
      // Right edge (bottom to top)
      pts.push([h, -h + r])
      pts.push([h, h - r])
      // Top-right corner
      for (let i = 0; i <= segments; i++) {
        const a = 0 + (Math.PI / 2) * (i / segments)
        pts.push([h - r + r * Math.cos(a), h - r + r * Math.sin(a)])
      }
      // Top edge (right to left)
      pts.push([h - r, h])
      pts.push([-h + r, h])
      // Top-left corner
      for (let i = 0; i <= segments; i++) {
        const a = Math.PI / 2 + (Math.PI / 2) * (i / segments)
        pts.push([-h + r + r * Math.cos(a), h - r + r * Math.sin(a)])
      }
      // Left edge (top to bottom)
      pts.push([-h, h - r])
      pts.push([-h, -h + r])
      // Bottom-left corner
      for (let i = 0; i <= segments; i++) {
        const a = Math.PI + (Math.PI / 2) * (i / segments)
        pts.push([-h + r + r * Math.cos(a), -h + r + r * Math.sin(a)])
      }
      return pts
    }

    const outer = roundedRect(half + sidewalkWidth / 2, cornerRadius + sidewalkWidth / 2)
    const inner = roundedRect(half - sidewalkWidth / 2, cornerRadius - sidewalkWidth / 2)

    // Create shape with hole
    const shape = new THREE.Shape()
    shape.moveTo(outer[0][0], outer[0][1])
    for (let i = 1; i < outer.length; i++) {
      shape.lineTo(outer[i][0], outer[i][1])
    }
    shape.closePath()

    const hole = new THREE.Path()
    hole.moveTo(inner[0][0], inner[0][1])
    for (let i = 1; i < inner.length; i++) {
      hole.lineTo(inner[i][0], inner[i][1])
    }
    hole.closePath()
    shape.holes.push(hole)

    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [])

  // Rotate to match park grid, position at sidewalk Y
  const GRID_ROTATION = -9.2 * (Math.PI / 180)

  return (
    <mesh geometry={geometry} position={[0, 0.13, 0]} rotation={[0, GRID_ROTATION, 0]} receiveShadow>
      <meshStandardMaterial color="#8a8a82" roughness={0.92} />
    </mesh>
  )
}

function CenterLines({ streets }) {
  const geometry = useMemo(() => {
    const geometries = []

    streets.forEach(street => {
      if (street.points && street.points.length >= 2) {
        const namedWidth = street.name && ROAD_WIDTH_BY_NAME[street.name]
        const isMajor = street.type === 'primary' || street.type === 'secondary'
        if (isMajor || (namedWidth && namedWidth >= 10)) {
          const geo = buildCenterLineGeometry(street.points, 0.6)
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

function LandUsePolygon({ feature }) {
  const geometry = useMemo(() => {
    const pts = feature.points
    if (!pts || pts.length < 3) return null

    try {
      const shape = new THREE.Shape()
      shape.moveTo(pts[0][0], -pts[0][1])
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i][0], -pts[i][1])
      }
      shape.closePath()

      const geo = new THREE.ShapeGeometry(shape)
      geo.rotateX(-Math.PI / 2)
      return geo
    } catch (e) {
      return null
    }
  }, [feature.points])

  if (!geometry) return null

  const color = LANDUSE_COLORS[feature.type] || '#2a2a30'

  return (
    <mesh geometry={geometry} position={[0, 0.02, 0]} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  )
}

// Render all unnamed OSM segments (park paths, walking paths, etc.)
function UnnamedPaths({ segments }) {
  const geometry = useMemo(() => {
    const geometries = []
    segments.forEach(street => {
      if (street.points && street.points.length >= 2) {
        const geo = buildRoadGeometry(street.points, STREET_WIDTHS[street.type] || 3.6, 0.07)
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
      <meshStandardMaterial color="#8a8a82" roughness={0.92} />
    </mesh>
  )
}

function VectorStreets() {
  const { roadsByType, unnamedSegments } = useMemo(() => {
    const roads = { primary: [], secondary: [], tertiary: [], residential: [], service: [] }
    const unnamed = []

    streetsData.streets.forEach(street => {
      const type = street.type || 'residential'
      const isNamed = street.name && street.name.length > 0
      if (isNamed) {
        if (roads[type]) roads[type].push(street)
        else roads.residential.push(street)
      } else if (street.points && street.points.length >= 2) {
        unnamed.push(street)
      }
    })

    return { roadsByType: roads, unnamedSegments: unnamed }
  }, [])

  return (
    <group>
      {/* Base ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <circleGeometry args={[4000, 128]} />
        <shaderMaterial
          transparent
          uniforms={{
            groundColor: { value: new THREE.Color('#1a1a22') },
            fadeStart: { value: 0.6 },
            fadeEnd: { value: 1.0 },
          }}
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform vec3 groundColor;
            uniform float fadeStart;
            uniform float fadeEnd;
            varying vec2 vUv;
            void main() {
              float dist = length(vUv - 0.5) * 2.0;
              float alpha = 1.0 - smoothstep(fadeStart, fadeEnd, dist);
              gl_FragColor = vec4(groundColor, alpha);
            }
          `}
        />
      </mesh>

      {/* Land use features */}
      {landuseData.features.map(f => (
        <LandUsePolygon key={f.id} feature={f} />
      ))}

      {/* Park perimeter sidewalk (clean frame with rounded corners) */}
      <ParkPerimeterSidewalk />

      {/* Block perimeter sidewalks from official city block polygons */}
      <BlockSidewalks />

      {/* Unnamed OSM segments — park paths, walking paths, sidewalks */}
      <UnnamedPaths segments={unnamedSegments} />

      {/* Roads (named segments — asphalt, rendered above sidewalks) */}
      <BatchedStreets streets={roadsByType.service} type="service" />
      <BatchedStreets streets={roadsByType.residential} type="residential" />
      <BatchedStreets streets={roadsByType.tertiary} type="tertiary" />
      <BatchedStreets streets={roadsByType.secondary} type="secondary" />
      <BatchedStreets streets={roadsByType.primary} type="primary" />

      {/* Center lines */}
      <CenterLines streets={streetsData.streets} />
    </group>
  )
}

export default VectorStreets
