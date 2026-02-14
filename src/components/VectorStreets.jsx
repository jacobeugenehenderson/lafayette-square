import { useMemo, useEffect, useState } from 'react'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import blockShapes from '../data/block_shapes.json'
import useCamera from '../hooks/useCamera'
import { mergeBufferGeometries } from '../lib/mergeGeometries'
// SVG served from public/ — user edits assets/, copies to public/ for use
const svgUrl = `${import.meta.env.BASE_URL}lafayette-square.svg`

// ── SVG coordinate mapping ──────────────────────────────────────────────────
// SVG viewBox: 0 0 1309 1152.7
// SVG origin (0,0) = world (-497.7, -732.5), 1 SVG unit ≈ 1 meter
const SVG_WORLD_X = -497.7
const SVG_WORLD_Z = -732.5

// ── Geometry helpers (used by CenterLines) ──────────────────────────────────

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

// ── Shape cleanup (fixes earcut triangulation spikes) ────────────────────────
// SVG bezier curves create near-duplicate and collinear points that cause
// earcut to produce degenerate triangles. Clean shapes before ShapeGeometry.
const DEDUP_TOL = 0.15  // merge points closer than this
const COLLINEAR_TOL = 0.02  // remove points whose cross product < this

function cleanPoints(pts) {
  if (pts.length < 3) return pts
  // 1. Remove consecutive near-duplicates
  const deduped = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - deduped[deduped.length - 1].x
    const dy = pts[i].y - deduped[deduped.length - 1].y
    if (dx * dx + dy * dy > DEDUP_TOL * DEDUP_TOL) deduped.push(pts[i])
  }
  // Close-loop dedup: check last vs first
  if (deduped.length > 2) {
    const f = deduped[0], l = deduped[deduped.length - 1]
    const dx = f.x - l.x, dy = f.y - l.y
    if (dx * dx + dy * dy < DEDUP_TOL * DEDUP_TOL) deduped.pop()
  }
  if (deduped.length < 3) return deduped
  // 2. Remove nearly-collinear points
  const clean = [deduped[0]]
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = clean[clean.length - 1]
    const curr = deduped[i]
    const next = deduped[i + 1]
    const ax = curr.x - prev.x, ay = curr.y - prev.y
    const bx = next.x - curr.x, by = next.y - curr.y
    const cross = Math.abs(ax * by - ay * bx)
    const lenA = Math.sqrt(ax * ax + ay * ay) || 1
    const lenB = Math.sqrt(bx * bx + by * by) || 1
    if (cross / (lenA * lenB) > COLLINEAR_TOL) clean.push(curr)
  }
  clean.push(deduped[deduped.length - 1])
  return clean
}

function cleanShape(shape) {
  const data = shape.extractPoints(12)
  const outerPts = cleanPoints(data.shape)
  if (outerPts.length < 3) return null
  const s = new THREE.Shape(outerPts)
  for (const hole of data.holes) {
    const hPts = cleanPoints(hole)
    if (hPts.length >= 3) {
      const hp = new THREE.Path(hPts)
      s.holes.push(hp)
    }
  }
  return s
}

// ── SVG Map Layers (parsed as geometry from Illustrator SVG) ─────────────────

// Layer config — keyed by SVG group ID, ready for CSS token mapping
const SVG_LAYERS = {
  blocks:    { y: 0.08, color: '#333333' },
  service:   { y: 0.09, color: '#4c4c4c' },
  paths:     { y: 0.10, color: '#8a8578', clipId: 'clippath' },
  streets:   { y: 0.05, color: '#000000' },
  sidewalks: { y: 0.12, color: '#7f7c73' },
}

// Transform geometry vertices from SVG 2D to world XZ
// SVGLoader preserves raw SVG coords: X right, Y down (no flip)
// World: X east, Z south — both align with SVG axes
function transformSvgToWorld(geo) {
  const pos = geo.attributes.position.array
  for (let i = 0; i < pos.length; i += 3) {
    const svgX = pos[i]
    const svgY = pos[i + 1]
    pos[i] = SVG_WORLD_X + svgX      // world X
    pos[i + 1] = 0                    // world Y (flat on ground)
    pos[i + 2] = SVG_WORLD_Z + svgY  // world Z (SVG Y-down = world Z-south)
  }
  geo.attributes.position.needsUpdate = true
}

// Clip shader via onBeforeCompile — discards fragments outside a mask texture
// Maps world XZ position to UV in the SVG viewport, samples mask texture
const CLIP_MIN = new THREE.Vector2(SVG_WORLD_X, SVG_WORLD_Z)
const CLIP_SIZE = new THREE.Vector2(1309, 1152.7)

function makeClipShader(clipTexture) {
  return (shader) => {
    shader.uniforms.uClipMap = { value: clipTexture }
    shader.uniforms.uClipMin = { value: CLIP_MIN }
    shader.uniforms.uClipSize = { value: CLIP_SIZE }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec2 vWorldXZ;`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       vWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform sampler2D uClipMap;
       uniform vec2 uClipMin;
       uniform vec2 uClipSize;
       varying vec2 vWorldXZ;`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       vec2 clipUV = (vWorldXZ - uClipMin) / uClipSize;
       float mask = texture2D(uClipMap, clipUV).r;
       if (mask < 0.5) discard;`
    )
  }
}

function SvgMapLayers() {
  const [layers, setLayers] = useState(null)

  useEffect(() => {
    fetch(svgUrl)
      .then(r => r.text())
      .then(svgText => {
        const loader = new SVGLoader()
        const data = loader.parse(svgText)

        // Bucket parsed paths by parent SVG group ID
        const buckets = {}
        for (const id of Object.keys(SVG_LAYERS)) buckets[id] = []

        for (const path of data.paths) {
          const node = path.userData?.node
          if (!node) continue
          if (path.userData.style?.display === 'none') continue

          // Walk up DOM to find which layer this path belongs to
          let el = node
          let groupId = null
          while (el) {
            if (el.id && SVG_LAYERS[el.id]) { groupId = el.id; break }
            // Stop at display:none ancestors (e.g. "streets" group)
            if (el.getAttribute?.('display') === 'none' && !SVG_LAYERS[el.id]) break
            el = el.parentElement
          }
          if (!groupId) continue
          buckets[groupId].push(path)
        }

        // Build clip mask textures from SVG <defs> clipPaths
        const clipTextures = {}
        const domParser = new DOMParser()
        const svgDoc = domParser.parseFromString(svgText, 'image/svg+xml')
        for (const clipPathEl of svgDoc.querySelectorAll('clipPath')) {
          const clipId = clipPathEl.id
          const pathEls = clipPathEl.querySelectorAll('path')
          const dAttrs = [...pathEls].map(p => p.getAttribute('d')).filter(Boolean)
          if (!dAttrs.length) continue

          // Rasterize clip path to a mask texture via Canvas2D
          const RES = 1024
          const aspect = 1152.7 / 1309
          const canvas = document.createElement('canvas')
          canvas.width = RES
          canvas.height = Math.round(RES * aspect)
          const ctx = canvas.getContext('2d')

          // Black = clipped, white = visible
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#fff'
          const sx = canvas.width / 1309
          const sy = canvas.height / 1152.7
          ctx.scale(sx, sy)
          for (const d of dAttrs) {
            const p2d = new Path2D(d)
            ctx.fill(p2d)
          }

          const tex = new THREE.CanvasTexture(canvas)
          tex.flipY = false // Canvas Y-down matches SVG Y-down matches world Z-south
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
          tex.minFilter = THREE.LinearFilter
          clipTextures[clipId] = tex
        }
        console.log('[SvgMapLayers] ClipMasks:', Object.keys(clipTextures).join(', '))

        // Build merged geometry per layer
        const result = {}

        for (const [groupId, config] of Object.entries(SVG_LAYERS)) {
          const paths = buckets[groupId]
          if (!paths.length) { console.log(`[SvgMapLayers] ${groupId}: 0 paths`); continue }
          console.log(`[SvgMapLayers] ${groupId}: ${paths.length} paths`)

          const fillGeos = []
          const strokeGeos = []

          for (const path of paths) {
            const style = path.userData.style

            // Streets layer: fill the road surface shapes, skip stroke
            if (groupId === 'streets') {
              style.fill = '#000000'
              style.stroke = 'none'
            }

            // ── Fills (blocks, sidewalks) ──
            // Only fill when explicit fill attribute is present and not 'none'
            // Illustrator "Presentation Attributes" export includes fill= on every filled path
            const fc = style.fill
            if (fc && fc !== 'none' && fc !== 'transparent') {
              try {
                const shapes = SVGLoader.createShapes(path)
                for (const shape of shapes) {
                  const cleaned = cleanShape(shape)
                  if (!cleaned) continue
                  // curveSegments=1 — curves already flattened in cleanShape
                  const geo = new THREE.ShapeGeometry(cleaned, 1)
                  if (geo.attributes.position.count > 0) {
                    transformSvgToWorld(geo)
                    fillGeos.push(geo)
                  } else {
                    geo.dispose()
                  }
                }
              } catch (e) {
                console.warn(`[SvgMapLayers] fill error in ${groupId}:`, e)
              }
            }

            // ── Strokes (service roads, park paths, sidewalk edges) ──
            const sc = style.stroke
            if (sc && sc !== 'none' && sc !== 'transparent') {
              try {
                for (const subPath of path.subPaths) {
                  const pts = subPath.getPoints(12)
                  if (pts.length < 2) continue
                  const geo = SVGLoader.pointsToStroke(pts, style)
                  if (geo && geo.attributes.position.count > 0) {
                    transformSvgToWorld(geo)
                    strokeGeos.push(geo)
                  }
                }
              } catch (e) {
                console.warn(`[SvgMapLayers] stroke error in ${groupId}:`, e)
              }
            }
          }

          // Merge all fills and strokes for this layer
          const layer = { ...config, fillGeometry: null, strokeGeometry: null, clipGeometry: null }
          if (fillGeos.length) {
            layer.fillGeometry = mergeBufferGeometries(fillGeos)
            fillGeos.forEach(g => g.dispose())
          }
          if (strokeGeos.length) {
            layer.strokeGeometry = mergeBufferGeometries(strokeGeos)
            strokeGeos.forEach(g => g.dispose())
          }
          // Attach clip mask texture if this layer has a clipId
          if (config.clipId && clipTextures[config.clipId]) {
            layer.clipTexture = clipTextures[config.clipId]
          }
          if (layer.fillGeometry || layer.strokeGeometry) result[groupId] = layer
        }

        console.log('[SvgMapLayers]', Object.entries(result).map(([id, l]) =>
            `${id}: ${l.fillGeometry ? 'fills' : ''}${l.strokeGeometry ? '+strokes' : ''}`
          ).join(', '))
        setLayers(result)
      })
      .catch(e => console.error('[SvgMapLayers] failed:', e))
  }, [])

  if (!layers) return null

  return (
    <group>
      {Object.entries(layers).map(([id, layer]) => (
        <group key={id}>
          {layer.fillGeometry && (
            <mesh geometry={layer.fillGeometry} position={[0, layer.y, 0]} frustumCulled={false} receiveShadow>
              <meshStandardMaterial
                color={layer.color}
                roughness={0.85}
                side={THREE.DoubleSide}
                onBeforeCompile={layer.clipTexture ? makeClipShader(layer.clipTexture) : undefined}
              />
            </mesh>
          )}
          {layer.strokeGeometry && (
            <mesh geometry={layer.strokeGeometry} position={[0, layer.y + 0.01, 0]} frustumCulled={false} receiveShadow>
              <meshStandardMaterial
                color={layer.color}
                roughness={0.85}
                side={THREE.DoubleSide}
                onBeforeCompile={layer.clipTexture ? makeClipShader(layer.clipTexture) : undefined}
              />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

function VectorStreets() {
  const viewMode = useCamera((s) => s.viewMode)
  const hideGroundMarkings = viewMode === 'hero'

  return (
    <group>
      {/* Ground plane — black, soft circular fade at edges */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.2, 0]}
        receiveShadow
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (useCamera.getState().viewMode === 'browse') {
            const p = e.point
            useCamera.getState().enterPlanetarium(p.x, p.z)
          }
        }}
      >
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

      {/* SVG map layers — parsed as geometry from Illustrator SVG */}
      <SvgMapLayers />

    </group>
  )
}

export default VectorStreets
