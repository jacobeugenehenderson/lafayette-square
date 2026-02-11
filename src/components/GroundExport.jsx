import { useRef, useMemo, useCallback } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import streetsData from '../data/streets.json'
import blocksClean from '../data/blocks_clean.json'
import { mergeBufferGeometries } from '../lib/mergeGeometries'

// ── Bounds matching SVG export viewBox ───────────────────────────────────
// Original: viewBox="-497.7 -732.5 1308.55 1120.5"
const BOUNDS = { minX: -497.7, maxX: 810.85, minZ: -732.5, maxZ: 388.0 }
const CENTER_X = (BOUNDS.minX + BOUNDS.maxX) / 2   // 156.575
const CENTER_Z = (BOUNDS.minZ + BOUNDS.maxZ) / 2   // -172.25
const HALF_W = (BOUNDS.maxX - BOUNDS.minX) / 2     // 654.275
const HALF_H = (BOUNDS.maxZ - BOUNDS.minZ) / 2     // 560.25

const WHITE = '#ffffff'
const BG    = '#111111'

// ── ROW widths (same as VectorStreets / export scripts) ─────────────────
const ROW_WIDTHS = { ...(blocksClean.street_widths || {}) }

// Inline width table (covers everything)
const WIDTH_OVERRIDES = {
  'Chouteau Avenue': 24, 'Park Avenue': 24, 'Lafayette Avenue': 24,
  'South Jefferson Avenue': 24, 'Truman Parkway': 24,
  'South Tucker Boulevard': 14, 'Gravois Avenue': 6,
  'Officer David Haynes Memorial Highway': 14, 'Russell Boulevard': 16,
  'South 13th Street': 12, 'Papin Street': 13, 'Geyer Avenue': 9,
  'Allen Avenue': 9, 'Ohio Avenue': 8, 'Ann Avenue': 9,
  'McNair Avenue': 9, 'Caroline Street': 5, 'Serbian Drive': 8,
  'South 12th Street': 5, 'South 17th Street': 6, 'Josephine Street': 6,
  '21st Street Cycle Track': 5,
}
const TYPE_DEFAULTS = { primary: 24, secondary: 18, residential: 14, service: 8 }
const PATH_WIDTHS  = { primary: 6, secondary: 5, tertiary: 4, residential: 3.6, service: 4 }

function getWidth(street) {
  return WIDTH_OVERRIDES[street.name] || ROW_WIDTHS[street.name] ||
         TYPE_DEFAULTS[street.type] || 14
}

// ── Park detection ──────────────────────────────────────────────────────
const PARK_COS = Math.cos(9.2 * Math.PI / 180)
const PARK_SIN = Math.sin(9.2 * Math.PI / 180)
const PARK_CLIP = 175
function isInsidePark(x, z) {
  const rx = x * PARK_COS + z * PARK_SIN
  const rz = -x * PARK_SIN + z * PARK_COS
  return Math.abs(rx) < PARK_CLIP && Math.abs(rz) < PARK_CLIP
}

// ── Road geometry builder (simplified — no Catmull-Rom re-smoothing) ────
function buildStripGeometry(points, width, y = 0) {
  if (points.length < 2) return null
  const halfWidth = width / 2
  const vertices = []
  const indices = []

  for (let i = 0; i < points.length; i++) {
    let tx, tz
    if (i === 0) {
      tx = points[1][0] - points[0][0]
      tz = points[1][1] - points[0][1]
    } else if (i === points.length - 1) {
      tx = points[i][0] - points[i-1][0]
      tz = points[i][1] - points[i-1][1]
    } else {
      tx = points[i+1][0] - points[i-1][0]
      tz = points[i+1][1] - points[i-1][1]
    }
    const len = Math.sqrt(tx * tx + tz * tz) || 1
    const px = -tz / len, pz = tx / len

    vertices.push(
      points[i][0] + px * halfWidth, y, points[i][1] + pz * halfWidth,
      points[i][0] - px * halfWidth, y, points[i][1] - pz * halfWidth,
    )

    if (i > 0) {
      const base = (i - 1) * 2
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    }
  }

  // Round end caps (semicircle at start and end)
  addEndCap(vertices, indices, points[0], points[1], halfWidth, y, false)
  addEndCap(vertices, indices, points[points.length - 1], points[points.length - 2], halfWidth, y, true)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function addEndCap(vertices, indices, endPt, prevPt, halfWidth, y, isEnd) {
  const tx = endPt[0] - prevPt[0], tz = endPt[1] - prevPt[1]
  const len = Math.sqrt(tx * tx + tz * tz) || 1
  const dx = tx / len, dz = tz / len
  const px = -dz, pz = dx

  const segments = 8
  const centerIdx = vertices.length / 3
  vertices.push(endPt[0], y, endPt[1])

  const startAngle = isEnd ? -Math.PI / 2 : Math.PI / 2
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (i / segments) * Math.PI
    const cx = endPt[0] + (px * Math.cos(a) + dx * Math.sin(a)) * halfWidth
    const cz = endPt[1] + (pz * Math.cos(a) + dz * Math.sin(a)) * halfWidth
    vertices.push(cx, y, cz)
  }

  for (let i = 0; i < segments; i++) {
    indices.push(centerIdx, centerIdx + 1 + i, centerIdx + 2 + i)
  }
}

// ── All ground layers merged into white geometry ────────────────────────

function GroundLayers() {
  const geometry = useMemo(() => {
    const geos = []

    // 1. Named streets (non-service)
    for (const street of streetsData.streets) {
      if (!street.name || !street.points || street.points.length < 2) continue
      if (street.type === 'service') continue
      const w = getWidth(street)
      const geo = buildStripGeometry(street.points, w, 0.01)
      if (geo) geos.push(geo)
    }

    // 2. Service roads (outside park)
    for (const street of streetsData.streets) {
      if (!street.points || street.points.length < 2) continue
      if (street.type !== 'service') continue
      if (!street.name) {
        const mid = street.points[Math.floor(street.points.length / 2)]
        if (isInsidePark(mid[0], mid[1])) continue
      }
      const w = getWidth(street)
      const geo = buildStripGeometry(street.points, w, 0.01)
      if (geo) geos.push(geo)
    }

    // 3. Park paths (unnamed, inside park)
    for (const street of streetsData.streets) {
      if (street.name || !street.points || street.points.length < 2) continue
      const mid = street.points[Math.floor(street.points.length / 2)]
      if (!isInsidePark(mid[0], mid[1])) continue
      const w = PATH_WIDTHS[street.type] || 3.6
      const geo = buildStripGeometry(street.points, w, 0.01)
      if (geo) geos.push(geo)
    }

    if (geos.length === 0) return null
    const merged = mergeBufferGeometries(geos)
    geos.forEach(g => g.dispose())
    return merged
  }, [])

  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={WHITE} />
    </mesh>
  )
}

// ── Orthographic camera setup ───────────────────────────────────────────

function OrthoSetup() {
  const { camera } = useThree()

  useMemo(() => {
    camera.position.set(CENTER_X, 1000, CENTER_Z)
    camera.lookAt(CENTER_X, 0, CENTER_Z)
    camera.updateProjectionMatrix()
  }, [camera])

  return null
}

// ── Download button ─────────────────────────────────────────────────────

function DownloadButton({ canvasRef }) {
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current?.querySelector('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'ground-layers.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [canvasRef])

  return (
    <button
      onClick={handleDownload}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 10,
        padding: '10px 20px', background: '#fff', color: '#111',
        border: 'none', borderRadius: 6, fontWeight: 600,
        fontSize: 14, cursor: 'pointer',
      }}
    >
      Download PNG
    </button>
  )
}

// ── Main export component ───────────────────────────────────────────────

export default function GroundExport() {
  const containerRef = useRef()

  return (
    <div ref={containerRef} style={{
      width: '100vw', height: '100vh', background: BG,
    }}>
      <Canvas
        orthographic
        camera={{
          position: [CENTER_X, 1000, CENTER_Z],
          left: -HALF_W,
          right: HALF_W,
          top: HALF_H,
          bottom: -HALF_H,
          near: 1,
          far: 2000,
          zoom: 1,
        }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        dpr={2}
        style={{ background: BG }}
      >
        <OrthoSetup />

        {/* Dark ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <planeGeometry args={[3000, 3000]} />
          <meshBasicMaterial color={BG} />
        </mesh>

        {/* All ground features in white */}
        <GroundLayers />
      </Canvas>

      <DownloadButton canvasRef={containerRef} />

      <div style={{
        position: 'fixed', top: 12, left: 12, color: '#666',
        fontFamily: 'system-ui', fontSize: 13,
      }}>
        Ground Export — all layers white on dark &nbsp;|&nbsp; matches SVG viewBox
      </div>
    </div>
  )
}
