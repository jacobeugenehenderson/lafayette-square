#!/usr/bin/env node
/**
 * Cartograph — Render to SVG + preview HTML
 *
 * Build-up approach, one layer at a time:
 *   1. Ground — base rectangle
 *   2. Streets — centerline buffers, unioned, fill + curb stroke
 *
 * Sources:
 *   - block_shapes.json  → curated street centerlines with widths + types
 *   - osm.json           → corridor streets, oneway tags for divided roads
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import clipperLib from 'clipper-lib'
import { smoothLine } from './smooth.js'
import { CLEAN_DIR, wgs84ToLocal, RAW_DIR, BBOX } from './config.js'
import { nodeEdges } from './node.js'
import { polygonize } from './polygonize.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DATA = join(__dirname, '..', 'src', 'data')

const { Clipper, ClipperOffset, Paths, IntPoint,
        ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib

const SCALE = 100
const ARC_TOL = 0.01 * SCALE

// ── SVG path helpers ────────────────────────────────────────────────

function R(v) { return (Math.round(v * 10) / 10).toFixed(1) }

function polyD(ring, holes) {
  let d = ring.map((p, i) => `${i === 0 ? 'M' : 'L'}${R(p[0])},${R(p[1])}`).join(' ') + ' Z'
  if (holes) for (const h of holes)
    d += ' ' + h.map((p, i) => `${i === 0 ? 'M' : 'L'}${R(p[0])},${R(p[1])}`).join(' ') + ' Z'
  return d
}

function smoothPolyD(ring, tension = 0.4) {
  if (ring.length < 4) return polyD(ring)
  return smoothLine(ring.map(p => ({ x: p[0], z: p[1] })), tension, true)
}

// Convert polygon ring to SVG path with cubic bezier rounded corners.
// Straight edges stay as L commands; corners become C commands.
// radius = max pullback distance from corner vertex along each edge.
function bezierPolyD(ring, holes, radius = 4.5) {
  function bezierRing(pts, r) {
    if (pts.length < 3) return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${R(p[0])},${R(p[1])}`).join(' ') + ' Z'
    const n = pts.length
    const segments = []
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n]
      const curr = pts[i]
      const next = pts[(i + 1) % n]
      // Edge vectors
      const dxIn = curr[0] - prev[0], dzIn = curr[1] - prev[1]
      const dxOut = next[0] - curr[0], dzOut = next[1] - curr[1]
      const lenIn = Math.sqrt(dxIn * dxIn + dzIn * dzIn)
      const lenOut = Math.sqrt(dxOut * dxOut + dzOut * dzOut)
      if (lenIn < 0.01 || lenOut < 0.01) { segments.push({ type: 'L', x: curr[0], z: curr[1] }); continue }
      // Angle between edges (dot product of unit vectors)
      const dot = (dxIn * dxOut + dzIn * dzOut) / (lenIn * lenOut)
      // If nearly straight (dot > 0.95 ≈ <18°), just a line point
      if (dot > 0.95) { segments.push({ type: 'L', x: curr[0], z: curr[1] }); continue }
      // Corner: pull back along each edge by min(radius, edge/2)
      const pullIn = Math.min(r, lenIn * 0.45)
      const pullOut = Math.min(r, lenOut * 0.45)
      const startX = curr[0] - (dxIn / lenIn) * pullIn
      const startZ = curr[1] - (dzIn / lenIn) * pullIn
      const endX = curr[0] + (dxOut / lenOut) * pullOut
      const endZ = curr[1] + (dzOut / lenOut) * pullOut
      segments.push({ type: 'C', startX, startZ, cx1: curr[0], cz1: curr[1], cx2: curr[0], cz2: curr[1], endX, endZ })
    }
    // Build SVG path
    let d = ''
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]
      if (s.type === 'L') {
        if (i === 0) d += `M${R(s.x)},${R(s.z)}`
        else d += ` L${R(s.x)},${R(s.z)}`
      } else {
        // Before the bezier curve, line to the start point
        if (i === 0) d += `M${R(s.startX)},${R(s.startZ)}`
        else d += ` L${R(s.startX)},${R(s.startZ)}`
        d += ` C${R(s.cx1)},${R(s.cz1)} ${R(s.cx2)},${R(s.cz2)} ${R(s.endX)},${R(s.endZ)}`
      }
    }
    // Close: line back to the first point
    if (segments[0]?.type === 'C') d += ` L${R(segments[0].startX)},${R(segments[0].startZ)}`
    d += ' Z'
    return d
  }
  let d = bezierRing(ring, radius)
  if (holes) for (const h of holes) d += ' ' + bezierRing(h, radius)
  return d
}

function smoothCompoundD(ring, holes, tension = 0.4) {
  let d = smoothPolyD(ring, tension)
  if (holes) for (const h of holes) d += ' ' + smoothPolyD(h, tension)
  return d
}

function lineD(pts) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${R(p[0])},${R(p[1])}`).join(' ')
}

function smoothLineD(pts, tension = 0.4) {
  if (pts.length < 3) return lineD(pts)
  return smoothLine(pts.map(p => ({ x: p[0], z: p[1] })), tension, false)
}

// ── Aerial tile helpers (Esri World Imagery, XYZ / Web Mercator) ───
// Tiles are placed in local meters via wgs84ToLocal. A single zoom
// level is precomputed for the bbox; the preview toggles them on.

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z
  const x = Math.floor((lon + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return [x, y]
}

function tileToLonLat(x, y, z) {
  const n = 2 ** z
  const lon = x / n * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)))
  return [lon, latRad * 180 / Math.PI]
}

function buildAerialTiles(bbox, z) {
  const [xMin, yMin] = lonLatToTile(bbox.minLon, bbox.maxLat, z) // NW corner
  const [xMax, yMax] = lonLatToTile(bbox.maxLon, bbox.minLat, z) // SE corner
  const tiles = []
  for (let tx = xMin; tx <= xMax; tx++) {
    for (let ty = yMin; ty <= yMax; ty++) {
      const [nwLon, nwLat] = tileToLonLat(tx, ty, z)
      const [seLon, seLat] = tileToLonLat(tx + 1, ty + 1, z)
      const [x0, z0] = wgs84ToLocal(nwLon, nwLat)
      const [x1, z1] = wgs84ToLocal(seLon, seLat)
      tiles.push({
        x: +x0.toFixed(2),
        z: +z0.toFixed(2),
        w: +(x1 - x0).toFixed(2),
        h: +(z1 - z0).toFixed(2),
        u: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`,
      })
    }
  }
  return tiles
}

// ── Clipper helpers ─────────────────────────────────────────────────

function toCP(ring) { return ring.map(p => new IntPoint(Math.round(p[0] * SCALE), Math.round(p[1] * SCALE))) }
function fromCP(path) { return path.map(pt => [pt.X / SCALE, pt.Y / SCALE]) }

function bufferLine(pts, halfWidth) {
  const path = pts.map(p => new IntPoint(Math.round(p[0] * SCALE), Math.round(p[1] * SCALE)))
  const co = new ClipperOffset()
  co.ArcTolerance = ARC_TOL
  co.AddPath(path, JoinType.jtRound, EndType.etOpenRound)
  const out = new Paths()
  co.Execute(out, halfWidth * SCALE)
  return out
}

function unionPaths(pathSets) {
  const all = new Paths()
  for (const ps of pathSets) for (let i = 0; i < ps.length; i++) all.push(ps[i])
  if (all.length === 0) return new Paths()
  const c = new Clipper()
  c.AddPaths(all, PolyType.ptSubject, true)
  const out = new Paths()
  c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out
}

function toCompound(cpPaths) {
  const outers = [], holes = []
  for (let i = 0; i < cpPaths.length; i++) {
    const area = Clipper.Area(cpPaths[i]), ring = fromCP(cpPaths[i])
    if (area >= 0) outers.push({ ring, cp: cpPaths[i] })
    else holes.push({ ring, cp: cpPaths[i] })
  }
  return outers.map(o => {
    const myH = holes.filter(h => Clipper.PointInPolygon(h.cp[0], o.cp) !== 0).map(h => h.ring)
    return { ring: o.ring, holes: myH.length ? myH : null }
  })
}

// ── Polyline smoothing (Catmull-Rom subdivision) ────────────────────
// Adds interpolated points along curves so SVG strokes render smoothly.
function smoothPolyline(pts, subdivisions = 4) {
  if (pts.length < 3) return pts
  const result = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[Math.min(pts.length - 1, i + 1)]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    // Only subdivide if there's a meaningful angle change
    const dx1 = p2[0] - p1[0], dz1 = p2[1] - p1[1]
    const dx0 = p1[0] - p0[0], dz0 = p1[1] - p0[1]
    const len0 = Math.sqrt(dx0*dx0 + dz0*dz0), len1 = Math.sqrt(dx1*dx1 + dz1*dz1)
    const dot = len0 > 0.1 && len1 > 0.1 ? (dx0*dx1 + dz0*dz1) / (len0*len1) : 1
    const segs = dot < 0.95 ? subdivisions : 1  // subdivide curves, skip straight segments
    for (let t = 1; t <= segs; t++) {
      const s = t / segs
      const s2 = s * s, s3 = s2 * s
      const x = 0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*s + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*s2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*s3)
      const z = 0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*s + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*s2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*s3)
      result.push([x, z])
    }
  }
  return result
}

// ── Polyline simplification (Douglas-Peucker) ───────────────────────

function simplify(pts, tolerance) {
  if (pts.length <= 2) return pts
  const a = pts[0], b = pts[pts.length - 1]
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  let maxDist = 0, maxIdx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    let dist
    if (len2 < 1e-6) {
      dist = Math.sqrt((p[0]-a[0])**2 + (p[1]-a[1])**2)
    } else {
      const t = ((p[0]-a[0])*dx + (p[1]-a[1])*dz) / len2
      dist = Math.sqrt((p[0]-(a[0]+t*dx))**2 + (p[1]-(a[1]+t*dz))**2)
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }
  if (maxDist <= tolerance) return [a, b]
  const left = simplify(pts.slice(0, maxIdx + 1), tolerance)
  const right = simplify(pts.slice(maxIdx), tolerance)
  return [...left.slice(0, -1), ...right]
}

// ══════════════════════════════════════════════════════════════════════

function main() {
  console.log('cartograph/render.js — build-up')
  mkdirSync(CLEAN_DIR, { recursive: true })

  // ── Load data ──────────────────────────────────────────────────────
  const blockData = JSON.parse(readFileSync(join(SRC_DATA, 'block_shapes.json'), 'utf-8'))
  const curatedStreets = blockData.streets || []  // hand-tuned centerlines + ROW widths

  // Neighborhood boundary — defines what's visible
  const boundaryData = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data', 'neighborhood_boundary.json'), 'utf-8'))
  const hoodBoundary = boundaryData.boundary.map(([x, z]) => ({ x, z }))

  function pointInPoly(px, pz, ring) {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, zi = ring[i].z
      const xj = ring[j].x, zj = ring[j].z
      if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi)
        inside = !inside
    }
    return inside
  }

  // Expanded boundary (100m outward) for the border ring zone —
  // needs to reach block centroids on the far side of boundary streets
  const expandedBoundary = (() => {
    const cx = hoodBoundary.reduce((s, p) => s + p.x, 0) / hoodBoundary.length
    const cz = hoodBoundary.reduce((s, p) => s + p.z, 0) / hoodBoundary.length
    return hoodBoundary.map(p => {
      const dx = p.x - cx, dz = p.z - cz
      const dist = Math.sqrt(dx * dx + dz * dz)
      return { x: p.x + dx * 100 / dist, z: p.z + dz * 100 / dist }
    })
  })()

  // Survey: real pavement measurements (curb-to-curb)
  const surveyData = JSON.parse(readFileSync(join(RAW_DIR, 'survey.json'), 'utf-8'))
  const surveyStreets = surveyData.streets || {}
  function pavementWidth(name, curatedROW) {
    // 1. Survey measurement (curb-to-curb) — most trusted
    const s = surveyStreets[name]
    if (s?.pavementHalfWidth) return s.pavementHalfWidth * 2
    // 2. Curated ROW → estimate pavement by subtracting sidewalk zones
    if (curatedROW > 8) return Math.max(4, curatedROW - 5.8) // 2 × 2.9m sidewalk zones
    // 3. Default: 10m — typical residential pavement in Lafayette Square
    return 10
  }

  let osmHW = []
  if (existsSync(join(RAW_DIR, 'osm.json'))) {
    const osm = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf-8'))
    osmHW = osm.ground?.highway || []
  }

  // ── Densify curved streets + extend LaSalle in OSM data ──────
  // Same treatment as derive.js — smooth S 18th arc and connect LaSalle
  function catmullRomCoord(p0, p1, p2, p3, t) {
    const t2 = t*t, t3 = t2*t
    return {
      x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      z: 0.5 * ((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3)
    }
  }
  function densifyCoords(coords, maxSegLen) {
    if (coords.length < 2) return coords
    const result = [coords[0]]
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i-1)]
      const p1 = coords[i]
      const p2 = coords[i+1]
      const p3 = coords[Math.min(coords.length-1, i+2)]
      const segLen = Math.hypot(p2.x-p1.x, p2.z-p1.z)
      const steps = Math.max(1, Math.ceil(segLen / maxSegLen))
      for (let s = 1; s <= steps; s++) {
        result.push(catmullRomCoord(p0, p1, p2, p3, s/steps))
      }
    }
    return result
  }
  const CURVE_STREETS = new Set(['West 18th Street'])
  for (const f of osmHW) {
    const name = f.tags?.name
    if (name && CURVE_STREETS.has(name) && f.coords?.length >= 2) {
      f.coords = densifyCoords(f.coords, 3)
    }
    if (name === 'Lasalle Street' && f.coords?.length >= 2) {
      const last = f.coords[f.coords.length - 1]
      if (Math.abs(last.x - 492.1) < 1 && Math.abs(last.z - (-395.1)) < 1) {
        f.coords.push({ x: 506.6, z: -391.1 })
      }
    }
  }

  // Sidewalk polylines (OSM footway=sidewalk)
  const osmSidewalks = osmHW.filter(f =>
    f.tags?.highway === 'footway' && f.tags?.footway === 'sidewalk' && f.coords?.length >= 2
  )

  // Blocks + lots
  const blocks = blockData.blocks.filter(b => !b.isPark)
  const parkBlock = blockData.blocks.find(b => b.isPark)

  // Corridor blocks from pipeline
  let corridorBlocks = [], parcels = []
  if (existsSync(join(CLEAN_DIR, 'map.json'))) {
    const map = JSON.parse(readFileSync(join(CLEAN_DIR, 'map.json'), 'utf-8'))
    const curCentroids = blocks.map(b => b.centroid || [
      b.lot.reduce((s,p) => s+p[0],0)/b.lot.length,
      b.lot.reduce((s,p) => s+p[1],0)/b.lot.length,
    ])
    const sw = map.layers?.sidewalk || [], lot = map.layers?.lot || []
    for (let i = 0; i < sw.length; i++) {
      const ring = sw[i].ring
      const cx = ring.reduce((s,p) => s+p.x,0)/ring.length
      const cz = ring.reduce((s,p) => s+p.z,0)/ring.length
      if (curCentroids.some(([x,z]) => Math.abs(cx-x)<40 && Math.abs(cz-z)<40)) continue
      corridorBlocks.push({
        lot: lot[i] ? lot[i].ring.map(p => [p.x, p.z]) : ring.map(p => [p.x, p.z]),
      })
    }
    parcels = map.layers?.parcel || []
  }
  console.log(`  ${osmSidewalks.length} sidewalks, ${blocks.length}+${corridorBlocks.length} blocks, ${parcels.length} parcels`)

  // ── Viewport ──────────────────────────────────────────────────────
  const [bMinX, bMinZ] = wgs84ToLocal(BBOX.minLon, BBOX.maxLat)
  const [bMaxX, bMaxZ] = wgs84ToLocal(BBOX.maxLon, BBOX.minLat)
  const pad = 10
  const minX = bMinX - pad, minZ = bMinZ - pad
  const maxX = bMaxX + pad, maxZ = bMaxZ + pad
  const w = maxX - minX, h = maxZ - minZ

  // ══════════════════════════════════════════════════════════════════
  // LAYER 1: Ground (base rectangle)
  // ══════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════
  // LAYER 2: Streets
  //
  // Strategy:
  //   - Two-way streets: buffer centerline by half the ROW width
  //   - One-way streets (divided boulevard halves): buffer by full
  //     carriageway width — the median emerges as the gap between them
  //   - Union everything into one compound shape
  //   - Render with fill + curb stroke on edges
  //   - Center stripe + labels from centerlines
  // ══════════════════════════════════════════════════════════════════

  console.log('  [2] Streets...')

  // Collect all street segments: curated first, then OSM for corridor
  const curatedNames = new Set(curatedStreets.map(s => s.name))

  // OSM vehicular streets (for corridor coverage)
  const osmVehicularTypes = new Set([
    'residential', 'primary', 'primary_link', 'secondary', 'secondary_link',
    'tertiary', 'tertiary_link', 'unclassified',
  ])
  const osmVehicular = osmHW.filter(f =>
    osmVehicularTypes.has(f.tags?.highway) && f.coords?.length >= 2
  )
  // OSM alleys
  const osmAlleys = osmHW.filter(f =>
    f.tags?.highway === 'service' && f.tags?.service === 'alley' && f.coords?.length >= 2
  )

  // Detect divided roads: streets with opposing one-way pairs in OSM.
  // A street is divided if:
  //   1. It has 2+ one-way segments with opposite bearing and close proximity
  //   2. The majority of its total length is one-way segments (not just turn arrows)
  function segLength(coords) {
    let len = 0
    for (let i = 1; i < coords.length; i++)
      len += Math.sqrt((coords[i].x - coords[i-1].x)**2 + (coords[i].z - coords[i-1].z)**2)
    return len
  }
  const osmByName = {}
  for (const f of osmVehicular) {
    const n = f.tags?.name
    if (!n) continue
    if (!osmByName[n]) osmByName[n] = []
    osmByName[n].push(f)
  }
  const dividedNames = new Set()
  for (const [name, segs] of Object.entries(osmByName)) {
    const onewaySegs = segs.filter(f => f.tags?.oneway === 'yes')
    if (onewaySegs.length < 2) continue

    // Check: do one-way segments make up >50% of total length?
    const totalLen = segs.reduce((s, f) => s + segLength(f.coords), 0)
    const onewayLen = onewaySegs.reduce((s, f) => s + segLength(f.coords), 0)
    if (onewayLen / totalLen < 0.5) continue

    // Check: are there opposing one-way pairs (not just same-direction)?
    let hasOpposing = false
    for (let i = 0; i < onewaySegs.length && !hasOpposing; i++) {
      const c0 = onewaySegs[i].coords
      const dx0 = c0[c0.length-1].x - c0[0].x, dz0 = c0[c0.length-1].z - c0[0].z
      const len0 = Math.sqrt(dx0*dx0 + dz0*dz0)
      if (len0 < 10) continue
      for (let j = i + 1; j < onewaySegs.length; j++) {
        const c1 = onewaySegs[j].coords
        const dx1 = c1[c1.length-1].x - c1[0].x, dz1 = c1[c1.length-1].z - c1[0].z
        const len1 = Math.sqrt(dx1*dx1 + dz1*dz1)
        if (len1 < 10) continue
        let angleDiff = Math.abs(Math.atan2(dz0, dx0) - Math.atan2(dz1, dx1))
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff
        if (angleDiff < 2.3) continue
        const nx = -dz0/len0, nz = dx0/len0
        const perpDist = Math.abs(
          ((c1[0].x+c1[c1.length-1].x)/2 - (c0[0].x+c0[c0.length-1].x)/2) * nx +
          ((c1[0].z+c1[c1.length-1].z)/2 - (c0[0].z+c0[c0.length-1].z)/2) * nz
        )
        if (perpDist < 25) { hasOpposing = true; break }
      }
    }
    if (hasOpposing) dividedNames.add(name)
  }
  // Force-include known divided boulevards regardless of one-way percentage
  for (const name of ['Lafayette Avenue', 'Chouteau Avenue', 'Park Avenue', 'Russell Boulevard'])
    dividedNames.add(name)
  if (dividedNames.size) console.log(`    Divided roads (median): ${[...dividedNames].join(', ')}`)

  // Build segment list: { pts, width, oneway, name, type }
  //
  // Width precedence (for all streets uniformly):
  //   1. survey.json pavement measurement (via pavementWidth)
  //   2. block_shapes.json curated ROW → pavement estimate (ROW - 5.8m)
  //   3. Default: 12m residential
  //
  // Geometry precedence:
  //   1. Curated centerlines (block_shapes.json) — hand-tuned, authoritative
  //   2. OSM — used for non-curated streets, divided roads, and loop streets
  //
  const segments = []
  const LOOP_STREETS = new Set(['Benton Place', 'Mackay Place'])

  // Index curated streets by name for width lookup (even when using OSM geometry)
  const curatedByName = {}
  for (const st of curatedStreets) {
    curatedByName[st.name] = st
  }

  // Track which streets are covered by geometry
  const coveredByGeometry = new Set()

  // ── Centerlines.json: highest priority (surveyor-edited data) ──
  let surveyorStreets = []
  const centerlinesPath = join(RAW_DIR, 'centerlines.json')
  if (existsSync(centerlinesPath)) {
    try {
      const cl = JSON.parse(readFileSync(centerlinesPath, 'utf-8'))
      surveyorStreets = cl.streets || []
    } catch { /* ignore parse errors */ }
  }

  if (surveyorStreets.length > 0) {
    console.log(`    Using centerlines.json: ${surveyorStreets.length} streets`)
    for (const st of surveyorStreets) {
      if (st.disabled) continue
      if (!st.points || st.points.length < 2) continue

      // Get active points (skip hidden nodes)
      const hidden = new Set(st.hiddenNodes || [])
      let pts = hidden.size > 0
        ? st.points.filter((_, i) => !hidden.has(i))
        : st.points
      if (pts.length < 2) continue

      // Map surveyor types to render types
      const type = st.type === 'service' ? 'alley' : st.type
      const curatedROW = curatedByName[st.name]?.width
      const width = pavementWidth(st.name, curatedROW)

      segments.push({
        pts, width,
        oneway: !!st.oneway,
        name: st.name || '',
        type,
      })
      if (st.name) coveredByGeometry.add(st.name)
    }
  } else {
    // ── Fallback: curated streets from block_shapes.json ──
    for (const st of curatedStreets) {
      if (dividedNames.has(st.name) || LOOP_STREETS.has(st.name)) continue
      segments.push({
        pts: st.points,
        width: pavementWidth(st.name, st.width),
        oneway: false, name: st.name, type: st.type,
      })
      coveredByGeometry.add(st.name)
    }
  }

  // ── OSM vehicular streets: fill gaps + divided/loop geometry ──
  for (const f of osmVehicular) {
    const name = f.tags?.name
    // Skip streets already covered by surveyor or curated geometry
    if (name && coveredByGeometry.has(name)) continue

    const isOneway = f.tags?.oneway === 'yes'
    const isCurve = name && CURVE_STREETS.has(name)
    const isLoop = name && LOOP_STREETS.has(name)
    const simplifyTol = isLoop ? 0.3 : isCurve ? 0 : 1.5
    const pts = simplifyTol > 0
      ? simplify(f.coords.map(c => [c.x, c.z]), simplifyTol)
      : f.coords.map(c => [c.x, c.z])

    // Width determination:
    //   Loop streets: curated base width (loop=1x stem=2x)
    //   Divided roads (one-way): lane count × 3.35m per carriageway
    //   Other: pavementWidth (survey > curated ROW > default)
    let width
    if (isLoop) {
      const baseW = curatedByName[name]?.width || 4
      width = isOneway ? baseW : baseW * 2
    } else if (name && dividedNames.has(name)) {
      // Divided road carriageway: use survey full-road width / 2
      const curatedROW = curatedByName[name]?.width
      width = pavementWidth(name, curatedROW) / 2
    } else {
      const curatedROW = curatedByName[name]?.width
      width = pavementWidth(name, curatedROW)
      if (isOneway) width = width / 2
    }

    segments.push({
      pts, width, oneway: isOneway,
      name: name || '', type: f.tags?.highway,
    })
  }

  // ── Alleys (only if not already covered by centerlines.json) ──
  for (const f of osmAlleys) {
    const name = f.tags?.name
    if (name && coveredByGeometry.has(name)) continue
    segments.push({
      pts: simplify(f.coords.map(c => [c.x, c.z]), 1.5),
      width: 5, oneway: false, name: name || '', type: 'alley',
    })
  }

  // ── Filter + chain segments ────────────────────────────────────────
  // 1. Drop very short unnamed segments (OSM stubs, turn lanes, artifacts)
  const MIN_LEN = 10  // meters
  function polyLength(pts) {
    let len = 0
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i-1][0], dz = pts[i][1] - pts[i-1][1]
      len += Math.sqrt(dx*dx + dz*dz)
    }
    return len
  }
  // Drop short segments — named or not — unless they're the only segment for that street name
  const nameCount = {}
  for (const s of segments) if (s.name) nameCount[s.name] = (nameCount[s.name] || 0) + 1

  const before = segments.length
  const filtered = segments.filter(s => {
    const len = polyLength(s.pts)
    // Always keep segments over minimum length
    if (len >= MIN_LEN) return true
    // Keep short segments if they're the ONLY segment for their name (it's a real short street)
    if (s.name && nameCount[s.name] === 1) return true
    // Drop short unnamed segments and short duplicates
    return false
  })
  console.log(`    Filtered: ${before} → ${filtered.length} (dropped ${before - filtered.length} short stubs)`)

  // 2. Chain same-name, same-width segments into continuous polylines
  //    so joins don't create double round-caps
  function chainSegments(segs) {
    const SNAP = 3  // meters — endpoints within this distance are joined
    const result = []
    const used = new Set()

    for (let i = 0; i < segs.length; i++) {
      if (used.has(i)) continue
      used.add(i)
      let chain = [...segs[i].pts]

      // Extend forward
      let changed = true
      while (changed) {
        changed = false
        const tail = chain[chain.length - 1]
        for (let j = 0; j < segs.length; j++) {
          if (used.has(j)) continue
          const pts = segs[j].pts
          const dHead = Math.hypot(pts[0][0]-tail[0], pts[0][1]-tail[1])
          const dTail = Math.hypot(pts[pts.length-1][0]-tail[0], pts[pts.length-1][1]-tail[1])
          if (dHead < SNAP) {
            chain.push(...pts.slice(1)); used.add(j); changed = true; break
          }
          if (dTail < SNAP) {
            chain.push(...[...pts].reverse().slice(1)); used.add(j); changed = true; break
          }
        }
      }
      // Extend backward
      changed = true
      while (changed) {
        changed = false
        const head = chain[0]
        for (let j = 0; j < segs.length; j++) {
          if (used.has(j)) continue
          const pts = segs[j].pts
          const dHead = Math.hypot(pts[0][0]-head[0], pts[0][1]-head[1])
          const dTail = Math.hypot(pts[pts.length-1][0]-head[0], pts[pts.length-1][1]-head[1])
          if (dTail < SNAP) {
            chain = [...pts.slice(0, -1), ...chain]; used.add(j); changed = true; break
          }
          if (dHead < SNAP) {
            chain = [...[...pts].reverse().slice(0, -1), ...chain]; used.add(j); changed = true; break
          }
        }
      }
      result.push({ ...segs[i], pts: chain })
    }
    return result
  }

  // Group by name only (not width) — short connectors between intersections
  // often have different road class tags but are the same street
  const byKey = {}
  for (const seg of filtered) {
    const key = seg.name || `_anon_${byKey.length}`
    if (!byKey[key]) byKey[key] = []
    byKey[key].push(seg)
  }
  // Normalize width per named street before chaining.
  // Non-divided: all segments get the max width (prevents stray tag discontinuities).
  // Divided: normalize one-way segments by median width (filters intersection lane bloat).
  for (const [key, segs] of Object.entries(byKey)) {
    if (key.startsWith('_anon_') || segs.length < 2) continue
    if (LOOP_STREETS.has(key)) continue  // loop streets need stem/loop width differentiation

    if (dividedNames.has(key)) {
      // Divided roads: all segments get uniform carriageway width from survey/2
      const w = segs[0].width  // already computed as pavementWidth/2
      for (const s of segs) s.width = w
      console.log(`    Normalized ${key} (divided): ${segs.length} segs → ${w.toFixed(1)}m per carriageway`)
    } else {
      const maxWidth = Math.max(...segs.map(s => s.width))
      for (const s of segs) {
        s.width = maxWidth
        s.oneway = false
      }
      console.log(`    Normalized ${key}: ${segs.length} segs → width ${maxWidth}`)
    }
  }

  const chained = []
  for (const segs of Object.values(byKey)) {
    if (segs.length === 1) { chained.push(segs[0]); continue }
    chained.push(...chainSegments(segs))
  }
  // Close loops: if a chain's start and end are within snap distance, close it
  for (const seg of chained) {
    const pts = seg.pts
    if (pts.length >= 4) {
      const d = Math.hypot(pts[0][0] - pts[pts.length-1][0], pts[0][1] - pts[pts.length-1][1])
      if (d < 5 && d > 0) {
        pts.push([...pts[0]])  // close the loop
        seg.isLoop = true
      }
    }
  }

  // Special widths for loop street entrances
  // Loop streets like Benton Place have a stem that carries two-way traffic
  // The stem should be wider than the loop itself
  // Loop streets come from OSM with separate stem + loop segments.
  // The stem is two-way (wider), the loop is one-way.
  // No special width handling needed — OSM oneway tags handle it.

  // Post-chain filter: drop short chains that are just connector stubs
  const preFilter = chained.length
  const chainFiltered = chained.filter(s => {
    const len = polyLength(s.pts)
    if (len >= MIN_LEN) return true
    // Short chain — keep if it's the only one with this name
    const sameNameCount = chained.filter(c => c.name === s.name).length
    if (s.name && sameNameCount === 1) return true
    return false
  })
  console.log(`    Chained: ${filtered.length} → ${preFilter} → ${chainFiltered.length} polylines`)

  // Replace chained with filtered version
  const finalSegments = chainFiltered

  // 3. Detect which endpoints are "dead ends" (not near any other segment endpoint)
  //    Only dead ends get round caps
  const allEndpoints = []
  for (const seg of finalSegments) {
    allEndpoints.push(seg.pts[0], seg.pts[seg.pts.length - 1])
  }
  function isDeadEnd(pt) {
    let nearby = 0
    for (const ep of allEndpoints) {
      if (Math.abs(ep[0] - pt[0]) < 5 && Math.abs(ep[1] - pt[1]) < 5) nearby++
    }
    return nearby <= 1  // only this segment's own endpoint
  }

  // ══════════════════════════════════════════════════════════════════
  // Build SVG — streets as stroked centerlines
  // ══════════════════════════════════════════════════════════════════

  console.log('  Building SVG...')
  const G = []
  let spikeLayerSvg = ''

  // Ground
  G.push(`  <g id="layer-ground" class="layer">
    <rect x="${R(minX)}" y="${R(minZ)}" width="${R(w)}" height="${R(h)}" />
  </g>`)

  // ══════════════════════════════════════════════════════════════════
  // LAYER 4: Blocks — from pipeline's parcel-union-per-face blocks
  // ══════════════════════════════════════════════════════════════════
  console.log('  [4] Blocks + lots from pipeline...')
  let blockRings = [], lotRings = []
  if (existsSync(join(CLEAN_DIR, 'map.json'))) {
    const map = JSON.parse(readFileSync(join(CLEAN_DIR, 'map.json'), 'utf-8'))
    // Explicitly hidden blocks (marked with X in preview)
    const hiddenBlocks = new Set([34,42,56,58,79,86,110,111,114,127,136,174,182,208,212,221,242,243,244,246,249,271,293,314,316,321,325,328,334,346,370,385,386,389,399,401])

    let blockAll = 0, lotAll = 0
    for (let bi = 0; bi < (map.layers?.block || []).length; bi++) {
      const b = map.layers.block[bi]
      if (b.ring?.length < 3) continue
      blockAll++
      if (hiddenBlocks.has(bi)) continue
      // Include block if ANY vertex touches the boundary
      let touches = false
      for (const p of b.ring) {
        if (pointInPoly(p.x, p.z, hoodBoundary)) { touches = true; break }
      }
      if (!touches) continue
      blockRings.push(b.ring.map(p => [p.x, p.z]))
    }
    for (let li = 0; li < (map.layers?.lot || []).length; li++) {
      const l = map.layers.lot[li]
      if (l.ring?.length < 3) continue
      lotAll++
      if (hiddenBlocks.has(li)) continue
      let touches = false
      for (const p of l.ring) {
        if (pointInPoly(p.x, p.z, hoodBoundary)) { touches = true; break }
      }
      if (!touches) continue
      lotRings.push(l.ring.map(p => [p.x, p.z]))
    }
    console.log(`    ${blockRings.length}/${blockAll} blocks, ${lotRings.length}/${lotAll} lots`)

  }
  // Block fills in sidewalk color — the perimeter ring between block and lot IS the sidewalk
  {
    const paths = blockRings.map(ring => `    <path d="${bezierPolyD(ring)}" />`).join('\n')
    G.push(`  <g id="layer-sidewalk" class="layer">\n${paths}\n  </g>`)
  }
  // Lot fills on top — colored by dominant parcel land use
  {
    // Classify each lot by the dominant parcel use inside it
    function pipArray(px, pz, ring) {
      let inside = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1]
        if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi)
          inside = !inside
      }
      return inside
    }
    const lotUses = lotRings.map(ring => {
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
      const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length
      const counts = {}
      for (const p of parcels) {
        const pr = p.ring
        const pcx = pr.reduce((s, pt) => s + pt.x, 0) / pr.length
        const pcz = pr.reduce((s, pt) => s + pt.z, 0) / pr.length
        if (pipArray(pcx, pcz, ring)) {
          const u = p.use || 'residential'
          counts[u] = (counts[u] || 0) + 1
        }
      }
      let best = 'residential', bestN = 0
      for (const [u, n] of Object.entries(counts)) {
        if (n > bestN) { best = u; bestN = n }
      }
      return best
    })
    const paths = lotRings.map((ring, i) =>
      `    <path class="${lotUses[i]}" d="${bezierPolyD(ring)}" />`
    ).join('\n')
    G.push(`  <g id="layer-lot" class="layer">\n${paths}\n  </g>`)
  }

  // SPIKE: street-offset block outlines (red dashed) for visual comparison
  {
    const mapData = existsSync(join(CLEAN_DIR, 'map.json'))
      ? JSON.parse(readFileSync(join(CLEAN_DIR, 'map.json'), 'utf-8')) : null
    const spikeBlocks = mapData?.layers?.spike || []
    if (spikeBlocks.length > 0) {
      const spikeRings = []
      for (const s of spikeBlocks) {
        if (s.ring?.length < 3) continue
        let touches = false
        for (const p of s.ring) {
          if (pointInPoly(p.x, p.z, hoodBoundary)) { touches = true; break }
        }
        if (!touches) continue
        spikeRings.push(s.ring.map(p => [p.x, p.z]))
      }
      if (spikeRings.length > 0) {
        const paths = spikeRings.map(ring =>
          `    <path d="${bezierPolyD(ring)}" style="fill:none;stroke:#00ffff;stroke-width:0.3;opacity:1" />`
        ).join('\n')
        // Rendered later — stored for end of SVG so it draws on top of everything
        spikeLayerSvg = `  <g id="layer-spike" class="layer">\n${paths}\n  </g>`
        console.log(`    [SPIKE] ${spikeRings.length} street-offset outlines rendered`)
      }
    }
  }

  // Park — rendered on top of lots so it paints over any block/lot beneath
  {
    const mapData = existsSync(join(CLEAN_DIR, 'map.json'))
      ? JSON.parse(readFileSync(join(CLEAN_DIR, 'map.json'), 'utf-8')) : null
    const parkPaths = []
    for (const p of (mapData?.layers?.park || [])) {
      if (p.ring?.length >= 3) parkPaths.push(`    <path d="${polyD(p.ring.map(pt => [pt.x, pt.z]))}" />`)
    }
    if (parkPaths.length)
      G.push(`  <g id="layer-park" class="layer">\n${parkPaths.join('\n')}\n  </g>`)
  }

  // Sort: alleys first, then by width (narrow under wide)
  const sorted = [...finalSegments].sort((a, b) => {
    if (a.type === 'alley' && b.type !== 'alley') return -1
    if (a.type !== 'alley' && b.type === 'alley') return 1
    return a.width - b.width
  })

  // Detect endpoints that need round caps:
  //   1. True dead end (no other segment nearby)
  //   2. Meets a wider street (butt cap would show inside the wider road)
  // Check proximity to entire polylines, not just endpoints
  const CAP_SNAP = 8
  function distToPolyline(pt, pts) {
    let best = Infinity
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][1], bx = pts[i+1][0], bz = pts[i+1][1]
      const dx = bx - ax, dz = bz - az, len2 = dx*dx + dz*dz
      if (len2 < 1e-6) { best = Math.min(best, Math.hypot(pt[0]-ax, pt[1]-az)); continue }
      const t = Math.max(0, Math.min(1, ((pt[0]-ax)*dx + (pt[1]-az)*dz) / len2))
      best = Math.min(best, Math.hypot(pt[0]-(ax+t*dx), pt[1]-(az+t*dz)))
    }
    return best
  }
  function needsRoundCap(pt, myWidth, mySeg) {
    let nearbyCount = 0, maxNearbyWidth = 0
    for (const seg of sorted) {
      if (seg === mySeg) continue
      if (seg.type === 'alley') continue  // alleys don't count — a dead-end street with a passing alley is still a dead end
      const d = distToPolyline(pt, seg.pts)
      if (d < CAP_SNAP) {
        nearbyCount++
        if (seg.width > maxNearbyWidth) maxNearbyWidth = seg.width
      }
    }
    if (nearbyCount === 0) return true                    // dead end
    if (maxNearbyWidth > myWidth + 2) return true         // meets a wider street
    return false
  }

  // At L-junctions (corners), add a circle to fill the gap left by butt
  // caps meeting at an angle. Skip T-junctions (endpoint meets INTERIOR
  // of through street, not its endpoint) — the through street's stroke
  // already covers the junction.
  function distToEndpoints(pt, pts) {
    return Math.min(
      Math.hypot(pt[0] - pts[0][0], pt[1] - pts[0][1]),
      Math.hypot(pt[0] - pts[pts.length-1][0], pt[1] - pts[pts.length-1][1])
    )
  }
  const junctionCaps = []
  for (const seg of sorted) {
    if (seg.type === 'alley') continue
    const w = seg.width
    for (const pt of [seg.pts[0], seg.pts[seg.pts.length - 1]]) {
      for (const other of sorted) {
        if (other === seg || other.type === 'alley') continue
        const d = distToPolyline(pt, other.pts)
        if (d < CAP_SNAP) {
          // T-junction: our endpoint is near the other street's interior
          // but NOT near its endpoints. Skip — through street covers it.
          const endDist = distToEndpoints(pt, other.pts)
          if (endDist > CAP_SNAP * 2) continue
          junctionCaps.push({ pt, width: Math.max(w, other.width) })
        }
      }
    }
  }

  // Streets: curb underneath, road on top, round caps only at dead ends
  // Alleys rendered in a separate layer
  {
    const curbLines = [], curbCaps = []
    const roadLines = [], roadCaps = []
    const alleyLines = [], alleyCaps = []
    const centerOutline = [], centerLines = []
    for (const seg of sorted) {
      const pts = seg.pts, w = seg.width
      // Centerline layer: the raw polyline before buffering, with a
      // dark outline + white interior for visibility over aerial.
      {
        const d = lineD(pts)
        centerOutline.push(`    <path d="${d}" class="co" />`)
        centerLines.push(`    <path d="${d}" class="cl" />`)
      }
      const isAlley = seg.type === 'alley'

      if (isAlley) {
        // Pull back dead-end alley endpoints so round cap doesn't spill into sidewalk
        const aStartCap = needsRoundCap(pts[0], w, seg)
        const aEndCap = needsRoundCap(pts[pts.length - 1], w, seg)
        let aPts = pts
        if (aStartCap || aEndCap) {
          aPts = [...pts]
          if (aStartCap && aPts.length >= 2) {
            const [a, b] = [aPts[0], aPts[1]]
            const dx = b[0]-a[0], dz = b[1]-a[1], len = Math.sqrt(dx*dx+dz*dz)
            if (len > w/2) aPts[0] = [a[0]+dx/len*w/2, a[1]+dz/len*w/2]
          }
          if (aEndCap && aPts.length >= 2) {
            const last = aPts.length-1
            const [a, b] = [aPts[last], aPts[last-1]]
            const dx = b[0]-a[0], dz = b[1]-a[1], len = Math.sqrt(dx*dx+dz*dz)
            if (len > w/2) aPts[last] = [a[0]+dx/len*w/2, a[1]+dz/len*w/2]
          }
        }
        alleyLines.push(`    <path d="${lineD(aPts)}" style="stroke-width:${w.toFixed(1)}" />`)
        const start = aPts[0], end = aPts[aPts.length - 1]
        if (aStartCap) {
          alleyCaps.push(`    <circle cx="${R(start[0])}" cy="${R(start[1])}" r="${R(w / 2)}" />`)
        }
        if (aEndCap) {
          alleyCaps.push(`    <circle cx="${R(end[0])}" cy="${R(end[1])}" r="${R(w / 2)}" />`)
        }
      } else {
        const startCap = needsRoundCap(pts[0], w, seg)
        const endCap = needsRoundCap(pts[pts.length - 1], w, seg)
        let drawPts = pts
        curbLines.push(`    <path d="${lineD(drawPts)}" style="stroke-width:${(w + 1.2).toFixed(1)}" />`)
        roadLines.push(`    <path d="${lineD(drawPts)}" style="stroke-width:${w.toFixed(1)}" />`)
        const start = drawPts[0], end = drawPts[drawPts.length - 1]
        if (startCap) {
          curbCaps.push(`    <circle cx="${R(start[0])}" cy="${R(start[1])}" r="${R((w + 1.2) / 2)}" />`)
          roadCaps.push(`    <circle cx="${R(start[0])}" cy="${R(start[1])}" r="${R(w / 2)}" />`)
        }
        if (endCap) {
          curbCaps.push(`    <circle cx="${R(end[0])}" cy="${R(end[1])}" r="${R((w + 1.2) / 2)}" />`)
          roadCaps.push(`    <circle cx="${R(end[0])}" cy="${R(end[1])}" r="${R(w / 2)}" />`)
        }
      }
    }
    // Junction smoothing circles (wider street's radius at T-junction points)
    for (const jc of junctionCaps) {
      curbCaps.push(`    <circle cx="${R(jc.pt[0])}" cy="${R(jc.pt[1])}" r="${R((jc.width + 1.2) / 2)}" />`)
      roadCaps.push(`    <circle cx="${R(jc.pt[0])}" cy="${R(jc.pt[1])}" r="${R(jc.width / 2)}" />`)
    }
    G.push(`  <g id="layer-alley" class="layer fade-outside">\n${[...alleyLines, ...alleyCaps].join('\n')}\n  </g>`)
    G.push(`  <g id="layer-curb" class="layer fade-outside">\n${[...curbLines, ...curbCaps].join('\n')}\n  </g>`)
    G.push(`  <g id="layer-street" class="layer fade-outside">\n${[...roadLines, ...roadCaps].join('\n')}\n  </g>`)
    G.push(`  <g id="layer-centerline" class="layer" style="display:none">\n${[...centerOutline, ...centerLines].join('\n')}\n  </g>`)
  }

  // ── Street markings (from pipeline map.json) ─────────────────────
  // All markings come from the curated pipeline data, not re-derived here.
  let stripeCount = 0, edgeCount = 0, bikeCount = 0
  {
    const mapData = existsSync(join(CLEAN_DIR, 'map.json'))
      ? JSON.parse(readFileSync(join(CLEAN_DIR, 'map.json'), 'utf-8')) : null

    // Helper: offset a polyline left or right
    function offsetLine(coords, offset, side) {
      const pts = []
      for (let i = 0; i < coords.length; i++) {
        const prev = coords[Math.max(0, i - 1)]
        const next = coords[Math.min(coords.length - 1, i + 1)]
        const dx = next.x - prev.x, dz = next.z - prev.z
        const len = Math.sqrt(dx * dx + dz * dz) || 1
        pts.push([coords[i].x + side * (-dz / len) * offset, coords[i].z + side * (dx / len) * offset])
      }
      return pts
    }

    // Center stripes (yellow)
    if (mapData?.layers?.centerStripe) {
      const stripes = []
      for (const s of mapData.layers.centerStripe) {
        if (!s.coords || s.coords.length < 2) continue
        const cls = s.dashed ? 'dashed' : 'solid'
        stripes.push(`    <path class="${cls}" d="${lineD(s.coords.map(c => [c.x, c.z]))}" />`)
      }
      stripeCount = stripes.length
      if (stripes.length)
        G.push(`  <g id="layer-stripe" class="layer fade-outside">\n${stripes.join('\n')}\n  </g>`)
    }

    // Parking edge lines (white dashed, offset from centerline)
    if (mapData?.layers?.parkingLine) {
      const edges = []
      for (const pl of mapData.layers.parkingLine) {
        if (!pl.coords || pl.coords.length < 2 || !pl.offset) continue
        for (const side of [-1, 1]) {
          edges.push(`    <path d="${lineD(offsetLine(pl.coords, pl.offset, side))}" />`)
        }
      }
      edgeCount = edges.length
      if (edges.length)
        G.push(`  <g id="layer-edgeline" class="layer fade-outside">\n${edges.join('\n')}\n  </g>`)
    }

    // Bike lanes (green, offset from centerline)
    if (mapData?.layers?.bikeLane) {
      const bikes = []
      for (const bl of mapData.layers.bikeLane) {
        if (!bl.coords || bl.coords.length < 2 || !bl.offset) continue
        for (const side of [-1, 1]) {
          bikes.push(`    <path d="${lineD(offsetLine(bl.coords, bl.offset, side))}" />`)
        }
      }
      bikeCount = bikes.length
      if (bikes.length)
        G.push(`  <g id="layer-bikelane" class="layer fade-outside">\n${bikes.join('\n')}\n  </g>`)
    }
  }

  // Labels (textPath along actual street centerline, sized to fit within street width)
  {
    const seen = new Set()
    const defs = [], texts = []
    let idx = 0
    for (const seg of finalSegments) {
      if (!seg.name || seg.type === 'alley' || seen.has(seg.name)) continue
      if (seg.pts.length < 2) continue
      seen.add(seg.name)
      const id = `st-${idx++}`

      // Use actual street centerline points (not just start→end)
      let pts = [...seg.pts]
      // Ensure left-to-right reading direction
      if (pts[0][0] > pts[pts.length - 1][0]) pts.reverse()

      // Build path from all points
      const pathParts = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${R(p[0])},${R(p[1])}`)
      defs.push(`      <path id="${id}" d="${pathParts.join(' ')}" />`)

      // Font size: scale to ~60% of street width, clamped
      const fontSize = Math.max(3, Math.min(7, seg.width * 0.55))
      // Background stroke width: enough to create solid rectangle behind text
      const bgStroke = fontSize * 1.1

      texts.push(`    <text class="label-bg" style="font-size:${fontSize.toFixed(1)}px;stroke-width:${bgStroke.toFixed(1)}"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${seg.name}</textPath></text>`)
      texts.push(`    <text class="label-fg" style="font-size:${fontSize.toFixed(1)}px"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${seg.name}</textPath></text>`)
    }
    if (defs.length) {
      G.push(`  <g id="layer-labels" class="layer">\n    <defs>\n${defs.join('\n')}\n    </defs>\n${texts.join('\n')}\n  </g>`)
    }
  }

  // ── Buildings (only inside neighborhood boundary) ──────────────────
  let buildingCount = 0
  {
    const mapData = existsSync(join(CLEAN_DIR, 'map.json'))
      ? JSON.parse(readFileSync(join(CLEAN_DIR, 'map.json'), 'utf-8')) : null
    const bldgs = []
    let totalBuildings = 0
    for (const b of (mapData?.buildings || [])) {
      if (!b.ring || b.ring.length < 3) continue
      totalBuildings++
      // Show buildings inside the neighborhood boundary
      const cx = b.ring.reduce((s, p) => s + p.x, 0) / b.ring.length
      const cz = b.ring.reduce((s, p) => s + p.z, 0) / b.ring.length
      if (!pointInPoly(cx, cz, hoodBoundary)) continue
      bldgs.push(`    <path d="${polyD(b.ring.map(p => [p.x, p.z]))}" />`)
    }
    buildingCount = bldgs.length
    console.log(`    Buildings: ${buildingCount}/${totalBuildings} in neighborhood`)
    if (bldgs.length)
      G.push(`  <g id="layer-building" class="layer">\n${bldgs.join('\n')}\n  </g>`)
  }

  // Spike outlines on top of everything
  if (spikeLayerSvg) G.push(spikeLayerSvg)

  // ── SVG ───────────────────────────────────────────────────────────
  const labelCount = new Set(finalSegments.filter(s => s.name && s.type !== 'alley').map(s => s.name)).size

  const svg = `<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${R(minX)} ${R(minZ)} ${R(w)} ${R(h)}"
     width="${w.toFixed(0)}" height="${h.toFixed(0)}">
  <style>
    svg { background: #1a1a18; }
    #layer-ground rect   { fill: var(--ground, #2a2a26); }
    #layer-curb path     { fill: none; stroke: var(--curb, #555550); stroke-linecap: butt; stroke-linejoin: round; }
    #layer-curb circle   { fill: var(--curb, #555550); }
    #layer-street path   { fill: none; stroke: var(--street, #3a3a38); stroke-linecap: butt; stroke-linejoin: round; }
    #layer-street circle { fill: var(--street, #3a3a38); }
    #layer-alley path    { fill: none; stroke: var(--alley, #353532); stroke-linecap: butt; stroke-linejoin: round; }
    #layer-alley circle  { fill: var(--alley, #353532); }
    #layer-stripe path      { fill: none; stroke: var(--stripe, #c8b430); stroke-width: 0.6; stroke-linecap: round; }
    #layer-stripe .dashed   { stroke-dasharray: 3 10; }
    #layer-edgeline path    { fill: none; stroke: var(--edgeline, #888); stroke-width: 0.3; stroke-linecap: round; stroke-dasharray: 2 4; }
    #layer-bikelane path    { fill: none; stroke: var(--bikelane, #4a8); stroke-width: 0.8; stroke-linecap: round; }
    #layer-sidewalk path  { fill: var(--sidewalk, #7a756a); stroke: none; }
    #layer-lot path              { fill: var(--lot, #3a4a2a); stroke: none; }
    #layer-lot path.residential  { fill: var(--lot-residential, #3a4a2a); }
    #layer-lot path.commercial   { fill: var(--lot-commercial, #4a4438); }
    #layer-lot path.vacant       { fill: var(--lot-vacant, #2a3020); }
    #layer-lot path.vacant-commercial { fill: var(--lot-vacant-com, #3a3830); }
    #layer-lot path.parking      { fill: var(--lot-parking, #3a3a38); }
    #layer-lot path.institutional { fill: var(--lot-institutional, #3a3a4a); }
    #layer-lot path.recreation   { fill: var(--lot-recreation, #2a3a1a); }
    #layer-lot path.industrial   { fill: var(--lot-industrial, #4a4040); }
    #layer-park path             { fill: var(--park, #2a4a1a); stroke: none; }
    #layer-building path { fill: var(--building, #2a2a28); stroke: var(--building-stroke, #1a1a18); stroke-width: 0.3; }
    #layer-centerline path.co { fill: none; stroke: #000; stroke-width: 1.6; opacity: 0.65; stroke-linecap: round; stroke-linejoin: round; }
    #layer-centerline path.cl { fill: none; stroke: var(--centerline, #fff); stroke-width: 0.55; opacity: 0.95; stroke-linecap: round; stroke-linejoin: round; }
    #layer-labels text       { font-family: -apple-system, sans-serif; font-weight: 600; dominant-baseline: central; letter-spacing: 0.5px; }
    #layer-labels .label-bg  { fill: var(--street, #3a3a38); stroke: var(--street, #3a3a38); stroke-linejoin: round; stroke-linecap: round; }
    #layer-labels .label-fg  { fill: #fff; }
    .layer { opacity: var(--layer-opacity, 1); }
    .fade-outside { mask: url(#hood-fade); }
    #layer-aerial { opacity: var(--aerial-opacity, 1); }
    #layer-aerial image { image-rendering: auto; }
    #layer-measure line          { fill: none; stroke-linecap: butt; }
    #layer-measure line.m-outline{ stroke: #000; opacity: 0.55; }
    #layer-measure line.m-live   { stroke: #fff; stroke-dasharray: 1.5 1; opacity: 0.8; }
    #layer-measure circle        { fill: none; stroke: #fff; }
    #layer-measure circle.m-sel  { fill: #fc0; stroke: #000; }
    #layer-measure text          { fill: #fff; font-family: -apple-system, sans-serif; font-weight: 600;
                                   dominant-baseline: central; text-anchor: middle;
                                   stroke: #000; stroke-width: 0.6; paint-order: stroke; }
  </style>
  <defs>
    <mask id="hood-fade">
      <rect x="${R(minX)}" y="${R(minZ)}" width="${R(w)}" height="${R(h)}" fill="black" />
      <path d="${polyD(expandedBoundary.map(p => [p.x, p.z]))}" fill="white" filter="url(#blur-fade)" />
    </mask>
    <filter id="blur-fade"><feGaussianBlur stdDeviation="15" /></filter>
  </defs>
  <g id="layer-aerial" class="layer" style="display:none"></g>
${G.join('\n\n')}
  <g id="layer-measure"></g>
  <g id="layer-surveyor"></g>
  <g id="layer-pen"></g>
</svg>`

  writeFileSync(join(CLEAN_DIR, 'map.svg'), svg)
  console.log(`  map.svg: ${Math.round(svg.length / 1024)} KB  (${w.toFixed(0)}×${h.toFixed(0)}m)`)

  // ── Layer defs ────────────────────────────────────────────────────
  const streetCount = sorted.filter(s => s.type !== 'alley').length
  const alleyCount = sorted.filter(s => s.type === 'alley').length
  const LD = [
    { id: 'aerial',   label: 'Aerial',    count: 0,                    fill: '#446688', noColor: true },
    { id: 'ground',   label: 'Ground',    count: 1,                    fill: '#2a2a26' },
    { id: 'sidewalk', label: 'Sidewalks', count: blockRings.length,    fill: '#7a756a' },
    { id: 'lot',      label: 'Blocks',    count: lotRings.length,      fill: '#3a4a2a' },
    { id: 'park',     label: 'Park',      count: 1,                    fill: '#2a4a1a' },
    { id: 'curb',     label: 'Curb',      count: streetCount,          fill: '#555550' },
    { id: 'street',   label: 'Streets',   count: streetCount,          fill: '#3a3a38' },
    { id: 'alley',    label: 'Alleys',    count: alleyCount,           fill: '#353532' },
    { id: 'building', label: 'Buildings',  count: buildingCount,        fill: '#2a2a28' },
    { id: 'stripe',   label: 'Center Lines', count: stripeCount,       fill: '#c8b430' },
    { id: 'edgeline', label: 'Edge Lines', count: edgeCount,           fill: '#888888' },
    { id: 'bikelane', label: 'Bike Lanes', count: bikeCount,           fill: '#44aa88' },
    { id: 'centerline', label: 'Centerlines', count: streetCount+alleyCount, fill: '#ffffff' },
    { id: 'labels',   label: 'Labels',    count: labelCount,           fill: '#666666' },
  ]
  for (const l of LD) console.log(`    ${l.label}: ${l.count}`)

  // ── Aerial tiles (Esri World Imagery) ─────────────────────────────
  // Two levels so the sharp one only loads when zoomed in:
  //   z=18 → ~0.6m/px, always visible (small count, base layer)
  //   z=20 → ~0.15m/px, overlay that kicks in above a zoom threshold
  // Each level is viewport-culled by the browser so even the big set
  // only fetches tiles that intersect the current pan/zoom window.
  const aerialLevels = [
    { z: 18, minScale: 0,   tiles: buildAerialTiles(BBOX, 18) },
    { z: 20, minScale: 2.5, tiles: buildAerialTiles(BBOX, 20) },
  ]
  for (const L of aerialLevels)
    console.log(`  Aerial z=${L.z}: ${L.tiles.length} tiles (minScale ${L.minScale})`)

  // ── Preview HTML ──────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Cartograph — Streets</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#111;color:#ddd;display:flex;height:100vh;overflow:hidden}
#map{flex:1;overflow:hidden;position:relative;cursor:grab}
#map:active{cursor:grabbing}
#map svg{position:absolute;transform-origin:0 0}
#panel{width:250px;background:#1a1a1a;border-left:1px solid #333;overflow-y:auto;padding:12px;flex-shrink:0}
#panel h1{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#555;margin-bottom:12px}
.sec{margin-bottom:10px;border-bottom:1px solid #282828;padding-bottom:8px}
.sec h2{font-size:11px;font-weight:600;color:#888;margin-bottom:6px}
.lyr{display:flex;align-items:center;gap:4px;margin-bottom:2px;height:22px}
.lyr input[type=checkbox]{accent-color:#666;margin:0;flex-shrink:0}
.lyr label{font-size:10px;color:#999;cursor:pointer;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lyr .n{font-size:9px;color:#444;width:24px;text-align:right;flex-shrink:0}
.lyr input[type=color]{width:20px;height:16px;border:1px solid #444;border-radius:2px;background:none;cursor:pointer;padding:0;flex-shrink:0}
.lyr button{font-size:8px;color:#555;background:none;border:1px solid #333;border-radius:2px;cursor:pointer;padding:0 3px;height:16px;flex-shrink:0}
.lyr button:hover{color:#aaa;border-color:#555}
.row{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.row label{font-size:10px;color:#666;width:45px;flex-shrink:0}
.row input[type=color]{width:20px;height:16px;border:1px solid #444;border-radius:2px;background:none;cursor:pointer;padding:0}
.row input[type=range]{flex:1;accent-color:#666}
.row .v{font-size:9px;color:#555;width:24px;text-align:right}
#zoom{position:absolute;bottom:10px;left:10px;font-size:10px;color:#555;background:rgba(0,0,0,.7);padding:3px 7px;border-radius:3px}
#marker-bar{position:absolute;top:10px;left:10px;display:flex;gap:4px;z-index:10;flex-wrap:wrap;max-width:420px}
#marker-bar button{background:rgba(0,0,0,.8);color:#aaa;border:1px solid #444;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer}
#marker-bar button.active{background:#b44;color:#fff;border-color:#e66}
#marker-bar button.surveyor.active{background:#286;color:#fff;border-color:#4a8}
#marker-bar button.measure.active{background:#088;color:#fff;border-color:#0ee}
#marker-bar button:hover{border-color:#888}
#marker-status{position:absolute;bottom:10px;right:270px;font-size:11px;color:#888;background:rgba(0,0,0,.7);padding:4px 8px;border-radius:3px;z-index:10}
#attribution{position:absolute;bottom:10px;left:10px;font-size:9px;color:#777;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:2px;z-index:10;pointer-events:none;display:none}
#measure-list{max-height:200px;overflow-y:auto;margin-top:4px}
#measure-list .mrow{display:flex;align-items:center;gap:4px;font-size:10px;padding:2px 0;border-bottom:1px solid #242424}
#measure-list .mrow input[type=text]{flex:1;background:#222;border:1px solid #333;color:#bbb;font-size:10px;padding:2px 4px;border-radius:2px;min-width:0}
#measure-list .mrow .len{color:#0cc;font-variant-numeric:tabular-nums;white-space:nowrap}
#measure-list .mrow button{font-size:9px;color:#777;background:none;border:1px solid #333;border-radius:2px;cursor:pointer;padding:0 4px;height:16px}
#measure-list .mrow button:hover{color:#c66;border-color:#555}
#measure-list .mrow.selected{background:#0a2a2a}
#measure-list .segs{margin:2px 0 6px 8px;border-left:1px solid #242424;padding-left:6px}
#measure-list .seg{display:flex;align-items:center;gap:4px;font-size:10px;padding:1px 0}
#measure-list .seg .swatch{width:10px;height:10px;border-radius:2px;border:1px solid #333;flex-shrink:0;cursor:pointer}
#measure-list .seg .segnum{color:#555;width:18px;font-variant-numeric:tabular-nums;text-align:right}
#measure-list .seg select{flex:1;background:#222;border:1px solid #333;color:#bbb;font-size:10px;padding:1px 3px;border-radius:2px;min-width:0}
#measure-list .seg .len{color:#8aa;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:50px;text-align:right}
#measure-list .seg.selected{background:#0a2a2a}
</style></head><body>
<div id="map">${svg}
<div id="marker-bar">
  <button id="marker-toggle">✏ Marker</button>
  <button id="marker-undo" style="display:none">↩ Undo</button>
  <button id="marker-clear" style="display:none">✕ Clear All</button>
  <button id="surveyor-toggle" class="surveyor">📐 Surveyor</button>
  <button id="measure-toggle" class="measure">📏 Measure</button>
</div>
<div id="marker-status"></div>
<div id="attribution">Imagery © Esri, Maxar, Earthstar Geographics</div>
<div id="zoom">1.0x</div>
</div>
<div id="panel"><h1>Cartograph</h1>
<div class="sec" id="layers"><h2>Layers</h2></div>
<div class="sec" id="landuse"><h2>Land Use</h2></div>
<div class="sec" id="extra"></div>
<div class="sec" id="surveyor-sec" style="display:none">
<h2>Surveyor</h2>
<div id="sv-info" style="font-size:10px;color:#555;padding:4px 0">Click a street to select it. Drag nodes to edit.</div>
<div id="sv-meta" style="display:none">
<div class="lyr"><label style="width:40px;font-size:10px;color:#666">Name</label><input type="text" id="sv-name" style="flex:1;background:#222;border:1px solid #333;color:#bbb;font-size:10px;padding:2px 4px;border-radius:2px"></div>
<div class="lyr"><label style="width:40px;font-size:10px;color:#666">Type</label><select id="sv-type" style="flex:1;background:#222;border:1px solid #333;color:#bbb;font-size:10px;padding:1px 3px;border-radius:2px">
<option value="residential">Residential</option><option value="secondary">Secondary</option><option value="primary">Primary</option><option value="service">Service/Alley</option><option value="footway">Footway</option><option value="cycleway">Cycleway</option><option value="pedestrian">Pedestrian</option><option value="steps">Steps</option>
</select></div>
<div class="lyr"><input type="checkbox" id="sv-oneway"><label for="sv-oneway" style="font-size:10px;color:#666">One-way</label></div>
<div class="lyr"><input type="checkbox" id="sv-deadend"><label for="sv-deadend" style="font-size:10px;color:#666">Dead-end</label></div>
<div class="lyr"><input type="checkbox" id="sv-loop"><label for="sv-loop" style="font-size:10px;color:#666">Loop</label></div>
<div class="lyr"><label style="font-size:10px;color:#666;width:50px">Smooth</label><input type="range" id="sv-smooth" min="0" max="100" value="0" style="flex:1;accent-color:#88f"><span id="sv-smooth-val" style="font-size:9px;color:#555;width:28px;text-align:right">0</span></div>
<div style="margin-top:6px;display:flex;gap:4px">
<button id="sv-del-node" style="font-size:9px;color:#777;background:none;border:1px solid #333;border-radius:2px;cursor:pointer;padding:2px 6px">Toggle Node</button>
<button id="sv-del-street" style="font-size:9px;color:#c66;background:none;border:1px solid #333;border-radius:2px;cursor:pointer;padding:2px 6px">Toggle Street</button>
<button id="sv-revert" style="font-size:9px;color:#88f;background:none;border:1px solid #333;border-radius:2px;cursor:pointer;padding:2px 6px">Revert to Original</button>
</div>
<div id="sv-status" style="font-size:9px;color:#555;margin-top:4px"></div>
</div>
</div>
<div class="sec" id="measure-sec" style="display:none"><h2>Measurements <span id="measure-count" style="color:#444;font-weight:400"></span></h2><div id="measure-list"></div></div>
</div>
<script>
const LAYERS=${JSON.stringify(LD)};
const AERIAL_LEVELS=${JSON.stringify(aerialLevels)};
const SURVEY=${JSON.stringify(Object.fromEntries(
  Object.entries(surveyStreets).map(([name, s]) => [name, {
    pavementHalfWidth: s.pavementHalfWidth,
    rowWidth: s.rowWidth,
    source: s.source,
  }])
))};
const map=document.getElementById('map'),el=map.querySelector('svg');
let s=1,px=0,pz=0,drag=false,sx,sz,spx,spz;
// Hoisted mode state so pointer handlers can reference it
let measureActive=false, markerActive=false, spaceDown=false;
function up(){el.style.transform='translate('+px+'px,'+pz+'px) scale('+s+')';document.getElementById('zoom').textContent=s.toFixed(1)+'x'}
{const r=map.getBoundingClientRect(),vb=el.viewBox.baseVal;s=Math.min(r.width/vb.width,r.height/vb.height)*.9;px=(r.width-vb.width*s)/2;pz=(r.height-vb.height*s)/2;up()}
map.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY>0?.9:1.1,r=map.getBoundingClientRect(),mx=e.clientX-r.left,mz=e.clientY-r.top;px=mx-(mx-px)*f;pz=mz-(mz-pz)*f;s*=f;up()},{passive:false});
map.addEventListener('pointerdown',e=>{
  // Marker/measure/surveyor modes block pan, unless user holds space to override
  if((markerActive||measureActive||surveyorActive)&&!spaceDown)return;
  drag=true;sx=e.clientX;sz=e.clientY;spx=px;spz=pz;
});
addEventListener('pointermove',e=>{if(!drag)return;px=spx+(e.clientX-sx);pz=spz+(e.clientY-sz);up()});
addEventListener('pointerup',()=>{drag=false});

// ── Layers: toggle + name + count + color + reset — one row each
const layerDiv=document.getElementById('layers');
LAYERS.forEach(L=>{
  const g=el.querySelector('#layer-'+L.id);
  // Respect any inline display:none so the checkbox matches initial visibility
  const startHidden=g&&g.style.display==='none';
  const d=document.createElement('div');d.className='lyr';
  const cb=document.createElement('input');cb.type='checkbox';cb.checked=!startHidden;cb.id='t-'+L.id;
  cb.onchange=e=>{
    if(g)g.style.display=e.target.checked?'':'none';
    if(L.id==='aerial'){
      document.getElementById('attribution').style.display=e.target.checked?'':'none';
      updateAerialTiles();
    }
  };
  const lb=document.createElement('label');lb.htmlFor='t-'+L.id;lb.textContent=L.label;
  const n=document.createElement('span');n.className='n';n.textContent=L.count;
  if(L.noColor){
    d.append(cb,lb,n);
  }else{
    const cp=document.createElement('input');cp.type='color';cp.value=L.fill;
    cp.oninput=e=>el.style.setProperty('--'+L.id,e.target.value);
    const rst=document.createElement('button');rst.textContent='↺';rst.title='Reset color';
    rst.onclick=()=>{cp.value=L.fill;el.style.setProperty('--'+L.id,L.fill)};
    d.append(cb,lb,n,cp,rst);
  }
  layerDiv.appendChild(d);
});

// ── Land Use colors — compact rows
const luDiv=document.getElementById('landuse');
[{c:'residential',l:'Residential',v:'#3a4a2a'},{c:'commercial',l:'Commercial',v:'#4a4438'},
 {c:'vacant',l:'Vacant',v:'#2a3020'},{c:'vacant-com',l:'Vacant Com.',v:'#3a3830'},
 {c:'parking',l:'Parking',v:'#3a3a38'},{c:'institutional',l:'Institutional',v:'#3a3a4a'},
 {c:'recreation',l:'Recreation',v:'#2a3a1a'},{c:'industrial',l:'Industrial',v:'#4a4040'}
].forEach(t=>{
  const d=document.createElement('div');d.className='lyr';
  const lb=document.createElement('label');lb.textContent=t.l;lb.style.paddingLeft='20px';
  const cp=document.createElement('input');cp.type='color';cp.value=t.v;
  cp.oninput=e=>el.style.setProperty('--lot-'+t.c,e.target.value);
  const rst=document.createElement('button');rst.textContent='↺';rst.title='Reset';
  rst.onclick=()=>{cp.value=t.v;el.style.setProperty('--lot-'+t.c,t.v)};
  d.append(lb,cp,rst);
  luDiv.appendChild(d);
});

// ── Extra controls: background
const exDiv=document.getElementById('extra');
{const d=document.createElement('div');d.className='lyr';
const lb=document.createElement('label');lb.textContent='Background';
const cp=document.createElement('input');cp.type='color';cp.value='#1a1a18';
cp.oninput=e=>{el.style.background=e.target.value};
const rst=document.createElement('button');rst.textContent='↺';rst.title='Reset';
rst.onclick=()=>{cp.value='#1a1a18';el.style.background='#1a1a18'};
d.append(lb,cp,rst);exDiv.appendChild(d)}

// ── Aerial tiles: multi-level, viewport-lazy ────────────────
// Each level has its own <g> sub-group, appended in ascending
// zoom order so higher-res tiles draw on top. A level only
// creates tiles when the current SVG scale s >= level.minScale,
// and only those that intersect the current viewport (plus pad).
const aerialLayer=el.querySelector('#layer-aerial');
const SVG_NS='http://www.w3.org/2000/svg';
const aerialGroups=AERIAL_LEVELS.map(L=>{
  const g=document.createElementNS(SVG_NS,'g');
  g.setAttribute('id','layer-aerial-z'+L.z);
  aerialLayer.appendChild(g);
  return {...L,group:g,created:new Set()};
});
function updateAerialTiles(){
  if(aerialLayer.style.display==='none')return;
  const r=map.getBoundingClientRect(),vb=el.viewBox.baseVal;
  const x0=-px/s+vb.x, x1=(r.width-px)/s+vb.x;
  const z0=-pz/s+vb.y, z1=(r.height-pz)/s+vb.y;
  const padX=(x1-x0)*0.3, padZ=(z1-z0)*0.3;
  for(const L of aerialGroups){
    if(s<L.minScale)continue;
    for(const t of L.tiles){
      if(L.created.has(t.u))continue;
      if(t.x+t.w<x0-padX||t.x>x1+padX||t.z+t.h<z0-padZ||t.z>z1+padZ)continue;
      const img=document.createElementNS(SVG_NS,'image');
      img.setAttribute('href',t.u);
      img.setAttribute('x',t.x);
      img.setAttribute('y',t.z);
      img.setAttribute('width',t.w);
      img.setAttribute('height',t.h);
      img.setAttribute('preserveAspectRatio','none');
      L.group.appendChild(img);
      L.created.add(t.u);
    }
  }
}

// ── Marker Tool ─────────────────────────────────────────────
const markerLayer=el.querySelector('#layer-pen');
const markerStatus=document.getElementById('marker-status');
let markerDrawing=false, markerCur=[], markerStrokes=[];
fetch('/markers').then(r=>r.json()).then(d=>{markerStrokes=d;updateButtons();renderMarker()}).catch(()=>{});
function saveMarkers(){
  fetch('/markers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(markerStrokes)}).catch(()=>{});
}

function screenToMap(ex,ey){
  const r=map.getBoundingClientRect(),vb=el.viewBox.baseVal;
  const sx=(ex-r.left-px)/s, sz=(ey-r.top-pz)/s;
  return{x:vb.x+sx*vb.width/el.width.baseVal.value, z:vb.y+sz*vb.height/el.height.baseVal.value};
}

function renderMarker(){
  let h='';
  const all=[...markerStrokes];
  if(markerCur.length>1) all.push(markerCur);
  for(const stroke of all){
    const d='M'+stroke.map(p=>p.x.toFixed(1)+','+p.z.toFixed(1)).join('L');
    h+='<path d="'+d+'" fill="none" stroke="rgba(255,60,60,0.6)" stroke-width="'+(4/s).toFixed(2)+'" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  markerLayer.innerHTML=h;
}

function updateButtons(){
  const show=markerStrokes.length?'':'none';
  document.getElementById('marker-undo').style.display=show;
  document.getElementById('marker-clear').style.display=show;
}

document.getElementById('marker-toggle').onclick=()=>{
  markerActive=!markerActive;
  document.getElementById('marker-toggle').classList.toggle('active',markerActive);
  map.style.cursor=markerActive?'crosshair':'grab';
  markerStatus.textContent=markerActive?'Draw on the map to mark areas.':'';
  renderMarker();
};

map.style.touchAction='none';
map.addEventListener('pointerdown',e=>{
  if(!markerActive)return;
  if(e.target.closest('#panel')||e.target.closest('#marker-bar'))return;
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  map.setPointerCapture(e.pointerId);
  markerDrawing=true;
  drag=false;
  const p=screenToMap(e.clientX,e.clientY);
  markerCur=[{x:Math.round(p.x*10)/10,z:Math.round(p.z*10)/10}];
},true);

map.addEventListener('pointermove',e=>{
  if(!markerDrawing)return;
  const p=screenToMap(e.clientX,e.clientY);
  markerCur.push({x:Math.round(p.x*10)/10,z:Math.round(p.z*10)/10});
  renderMarker();
});

map.addEventListener('pointerup',e=>{
  if(!markerDrawing)return;
  markerDrawing=false;
  if(markerCur.length>1){
    markerStrokes.push(markerCur);
    saveMarkers();
    markerStatus.textContent=markerStrokes.length+' stroke(s)';
  }
  markerCur=[];
  updateButtons();
  renderMarker();
});

document.getElementById('marker-undo').onclick=()=>{
  markerStrokes.pop();
  saveMarkers();
  markerStatus.textContent=markerStrokes.length?markerStrokes.length+' stroke(s)':'';
  updateButtons();
  renderMarker();
};
document.getElementById('marker-clear').onclick=()=>{
  markerStrokes=[];
  saveMarkers();
  markerStatus.textContent='Cleared.';
  updateButtons();
  renderMarker();
};
updateButtons();
renderMarker();

// ── Measurement Tool ────────────────────────────────────────
// Click-click to place a measurement line. Shows length in m + ft.
// Arrow keys nudge the selected endpoint (0.15m, shift = 1m).
// Measurements persist to data/raw/measurements.json via /measurements.
const measureLayer=el.querySelector('#layer-measure');
const measureList=document.getElementById('measure-list');
const measureCount=document.getElementById('measure-count');
const measureToggleBtn=document.getElementById('measure-toggle');

// ── Materials palette ─────────────────────────────────────
// id used in data, label for dropdown, color drawn on map.
const MATERIALS=[
  {id:'none',     label:'—',         color:'#0ff'},
  {id:'asphalt',  label:'Asphalt',   color:'#2a2a2a'},
  {id:'concrete', label:'Concrete',  color:'#d0d0d0'},
  {id:'brick',    label:'Brick',     color:'#c4623a'},
  {id:'cobble',   label:'Cobble',    color:'#8a6e50'},
  {id:'grass',    label:'Grass',     color:'#3a8a3a'},
  {id:'gravel',   label:'Gravel',    color:'#b8a470'},
  {id:'dirt',     label:'Dirt',      color:'#6b5439'},
  {id:'building', label:'Building',  color:'#8a3a8a'},
  {id:'water',    label:'Water',     color:'#3a6aaa'},
];
const MAT_BY_ID=Object.fromEntries(MATERIALS.map(m=>[m.id,m]));
function matColor(id){return (MAT_BY_ID[id]||MAT_BY_ID.none).color}

// ── Data model ────────────────────────────────────────────
// Each measurement is a single straight line with endpoints p1,p2,
// parametric waypoints ts ∈ (0,1), and a per-segment materials array
// of length ts.length+1.
let measurements=[];
let placingFirst=null;        // {x,z} during click-click placement
let measureHover=null;        // live cursor for placement preview
let selectedPoint=null;       // null | {id, type:'end'|'wp'|'seg', which?, index?}
let dragState=null;           // mirror of selectedPoint while drag is active

fetch('/measurements').then(r=>r.json()).then(d=>{
  measurements=((d&&d.measurements)||[]).map(m=>{
    const ts=m.ts||[];
    const mats=m.materials&&m.materials.length===ts.length+1
      ? m.materials
      : new Array(ts.length+1).fill('none');
    return {...m, ts, materials: mats};
  });
  renderMeasurements();renderMeasureList();
}).catch(()=>{});

function saveMeasurements(){
  fetch('/measurements',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({measurements})}).catch(()=>{});
}
function dist(a,b){const dx=b.x-a.x,dz=b.z-a.z;return Math.sqrt(dx*dx+dz*dz)}
function fmtLen(m){return m.toFixed(2)+'m / '+(m*3.28084).toFixed(2)+'ft'}
function lineLen(m){return dist(m.p1,m.p2)}
function wpPos(m,t){return{x:m.p1.x+t*(m.p2.x-m.p1.x), z:m.p1.z+t*(m.p2.z-m.p1.z)}}
function projectT(m,p){
  const dx=m.p2.x-m.p1.x, dz=m.p2.z-m.p1.z;
  const L2=dx*dx+dz*dz;
  if(L2<1e-9)return 0;
  return ((p.x-m.p1.x)*dx+(p.z-m.p1.z)*dz)/L2;
}
function distToLine(m,p){
  const t=Math.max(0,Math.min(1,projectT(m,p)));
  return dist(p,wpPos(m,t));
}

// Hit test: endpoints first, then waypoints, then line bodies.
// Returns {m, hit:{id,type,which?,index?}} or null.
function hitTest(p,thresh){
  for(const m of measurements){
    if(dist(p,m.p1)<thresh)return{m,hit:{id:m.id,type:'end',which:'p1'}};
    if(dist(p,m.p2)<thresh)return{m,hit:{id:m.id,type:'end',which:'p2'}};
    for(let i=0;i<m.ts.length;i++)
      if(dist(p,wpPos(m,m.ts[i]))<thresh)return{m,hit:{id:m.id,type:'wp',index:i}};
  }
  for(const m of measurements){
    if(distToLine(m,p)<thresh){
      const t=Math.max(0.01,Math.min(0.99,projectT(m,p)));
      return{m,hit:{id:m.id,type:'line',t}};
    }
  }
  return null;
}

function isSelected(id,type,extra){
  const sp=selectedPoint;
  if(!sp||sp.id!==id||sp.type!==type)return false;
  if(type==='end')return sp.which===extra;
  if(type==='wp')return sp.index===extra;
  return false;
}

function renderMeasurements(){
  if(!measureActive){measureLayer.innerHTML='';return}
  const sw    =(1.4/s).toFixed(2);
  const swOut =(2.2/s).toFixed(2);
  // Dots sized in screen pixels (constant on-screen size via /s)
  const drDotN=4/s, drSelN=5/s;
  const drDot =drDotN.toFixed(2);
  const drSel =drSelN.toFixed(2);
  const drWp  =drDot;
  const dotSw =(0.55/s).toFixed(2);
  const fs    =(7/s).toFixed(2);
  const strokeLbl=(0.4/s).toFixed(2);
  const off   =(2.5/s);
  let h='';
  for(const m of measurements){
    const L=lineLen(m);
    if(L<0.001)continue;
    const dx=m.p2.x-m.p1.x, dz=m.p2.z-m.p1.z;
    const nx=-dz/(L||1), nz=dx/(L||1);
    // Outline under the whole line for contrast on aerial
    h+='<line class="m-outline" x1="'+m.p1.x+'" y1="'+m.p1.z+'" x2="'+m.p2.x+'" y2="'+m.p2.z+'" stroke-width="'+swOut+'"/>';
    // Per-segment colored strokes by material. 'none' draws nothing —
    // the dark outline still shows the line position.
    const bounds=[0,...m.ts,1];
    for(let i=0;i<bounds.length-1;i++){
      const matId=(m.materials&&m.materials[i])||'none';
      if(matId==='none')continue;
      const a=wpPos(m,bounds[i]), b=wpPos(m,bounds[i+1]);
      const segSel=isSelected(m.id,'seg',i);
      h+='<line x1="'+a.x.toFixed(2)+'" y1="'+a.z.toFixed(2)+'" x2="'+b.x.toFixed(2)+'" y2="'+b.z.toFixed(2)+'" stroke="'+matColor(matId)+'" stroke-width="'+(segSel?swOut:sw)+'"/>';
    }
    // Total length label, perpendicular off the midpoint
    const midP=wpPos(m,0.5);
    const tlx=(midP.x+nx*off).toFixed(2);
    const tlz=(midP.z+nz*off).toFixed(2);
    h+='<text x="'+tlx+'" y="'+tlz+'" font-size="'+fs+'" stroke-width="'+strokeLbl+'">Σ '+fmtLen(L)+'</text>';
    // Endpoint dots (hollow; filled when selected)
    const sel1=isSelected(m.id,'end','p1');
    const sel2=isSelected(m.id,'end','p2');
    h+='<circle'+(sel1?' class="m-sel"':'')+' cx="'+m.p1.x+'" cy="'+m.p1.z+'" r="'+(sel1?drSel:drDot)+'" stroke-width="'+dotSw+'"/>';
    h+='<circle'+(sel2?' class="m-sel"':'')+' cx="'+m.p2.x+'" cy="'+m.p2.z+'" r="'+(sel2?drSel:drDot)+'" stroke-width="'+dotSw+'"/>';
    // Waypoint dots (smaller; hollow; filled when selected)
    for(let i=0;i<m.ts.length;i++){
      const wp=wpPos(m,m.ts[i]);
      const selW=isSelected(m.id,'wp',i);
      h+='<circle'+(selW?' class="m-sel"':'')+' cx="'+wp.x.toFixed(2)+'" cy="'+wp.z.toFixed(2)+'" r="'+(selW?drSel:drWp)+'" stroke-width="'+dotSw+'"/>';
    }
  }
  // Live preview during initial placement
  if(placingFirst&&measureHover){
    h+='<line class="m-live" x1="'+placingFirst.x+'" y1="'+placingFirst.z+'" x2="'+measureHover.x+'" y2="'+measureHover.z+'" stroke-width="'+sw+'" stroke-dasharray="'+(1.5/s).toFixed(2)+' '+(0.8/s).toFixed(2)+'"/>';
    h+='<circle cx="'+placingFirst.x+'" cy="'+placingFirst.z+'" r="'+drDot+'" stroke-width="'+dotSw+'"/>';
    const lenPrev=dist(placingFirst,measureHover);
    const mx=(placingFirst.x+measureHover.x)/2, mz=(placingFirst.z+measureHover.z)/2;
    h+='<text x="'+mx.toFixed(2)+'" y="'+mz.toFixed(2)+'" font-size="'+fs+'" stroke-width="'+strokeLbl+'">'+fmtLen(lenPrev)+'</text>';
  }
  measureLayer.innerHTML=h;
}

function renderMeasureList(){
  measureCount.textContent=measurements.length?'('+measurements.length+')':'';
  measureList.innerHTML='';
  if(!measurements.length){
    measureList.innerHTML='<div style="font-size:10px;color:#555;padding:4px 0">Click 📏 Measure, then click two points to place a line. Click along the line to add waypoints. Drag any point to move it. Hold space to pan.</div>';
    return;
  }
  for(const m of measurements){
    const row=document.createElement('div');row.className='mrow'+(selectedPoint&&selectedPoint.id===m.id?' selected':'');
    const ti=document.createElement('input');ti.type='text';ti.value=m.name||'';ti.placeholder='name…';
    ti.oninput=e=>{m.name=e.target.value;saveMeasurements()};
    const len=document.createElement('span');len.className='len';
    const wpN=m.ts.length?' · '+m.ts.length+'pt':'';
    len.textContent=lineLen(m).toFixed(2)+'m'+wpN;
    const selBtn=document.createElement('button');selBtn.textContent='◉';selBtn.title='Select p2 for nudging';
    selBtn.onclick=()=>{selectedPoint={id:m.id,type:'end',which:'p2'};renderMeasurements();renderMeasureList()};
    const del=document.createElement('button');del.textContent='✕';del.title='Delete';
    del.onclick=()=>{
      measurements=measurements.filter(x=>x.id!==m.id);
      if(selectedPoint&&selectedPoint.id===m.id)selectedPoint=null;
      saveMeasurements();renderMeasurements();renderMeasureList();
    };
    row.append(ti,len,selBtn,del);
    measureList.appendChild(row);

    // Segment sub-table
    const segsDiv=document.createElement('div');segsDiv.className='segs';
    const L=lineLen(m);
    const bounds=[0,...m.ts,1];
    for(let i=0;i<bounds.length-1;i++){
      const segLen=L*(bounds[i+1]-bounds[i]);
      const seg=document.createElement('div');
      seg.className='seg'+(isSelected(m.id,'seg',i)?' selected':'');
      const curMat=(m.materials&&m.materials[i])||'none';
      const sw=document.createElement('span');sw.className='swatch';sw.style.background=matColor(curMat);
      sw.title='Highlight on map';
      sw.onclick=()=>{
        if(isSelected(m.id,'seg',i))selectedPoint=null;
        else selectedPoint={id:m.id,type:'seg',index:i};
        renderMeasurements();renderMeasureList();
      };
      const num=document.createElement('span');num.className='segnum';num.textContent='§'+(i+1);
      const sel=document.createElement('select');
      for(const mat of MATERIALS){
        const o=document.createElement('option');o.value=mat.id;o.textContent=mat.label;
        if(mat.id===curMat)o.selected=true;
        sel.appendChild(o);
      }
      sel.onchange=e=>{
        if(!m.materials)m.materials=new Array(bounds.length-1).fill('none');
        m.materials[i]=e.target.value;
        sw.style.background=matColor(e.target.value);
        saveMeasurements();renderMeasurements();
      };
      const slen=document.createElement('span');slen.className='len';slen.textContent=segLen.toFixed(2)+'m';
      seg.append(sw,num,sel,slen);
      segsDiv.appendChild(seg);
    }
    measureList.appendChild(segsDiv);
  }
}

// Measure mode = a distinct view: aerial imagery on, vector layers off,
// measurement interactions enabled. Stores pre-mode layer visibility
// so exiting restores whatever the user had showing.
let preMeasureVis=null;
function setLayerVis(id,on){
  const g=el.querySelector('#layer-'+id);
  const cb=document.getElementById('t-'+id);
  if(cb)cb.checked=on;
  if(g)g.style.display=on?'':'none';
  if(id==='aerial'){
    document.getElementById('attribution').style.display=on?'':'none';
    if(on)updateAerialTiles();
  }
}
function enterMeasureMode(){
  preMeasureVis={};
  for(const L of LAYERS){
    const cb=document.getElementById('t-'+L.id);
    preMeasureVis[L.id]=cb?cb.checked:true;
    if(L.id!=='aerial')setLayerVis(L.id,false);
  }
  // Hide the dev spike-outline layer too — it's not in LAYERS but
  // draws cyan block outlines that shouldn't clutter the measure view.
  const spikeG=el.querySelector('#layer-spike');
  if(spikeG){preMeasureVis.__spike=spikeG.style.display!=='none';spikeG.style.display='none'}
  // Show centerlines as reference overlay over the aerial
  setLayerVis('centerline',true);
  // Turn on aerial for measurement context
  setLayerVis('aerial',true);
  document.getElementById('measure-sec').style.display='';
  measureActive=true;
  measureToggleBtn.classList.add('active');
  // disable marker if it was on
  if(markerActive){
    markerActive=false;
    document.getElementById('marker-toggle').classList.toggle('active',false);
  }
  map.style.cursor='crosshair';
  markerStatus.textContent='Click two points to measure. Arrow keys nudge selected end.';
  renderMeasurements();
}
function exitMeasureMode(){
  if(preMeasureVis){
    for(const L of LAYERS)setLayerVis(L.id,preMeasureVis[L.id]);
    const spikeG=el.querySelector('#layer-spike');
    if(spikeG&&preMeasureVis.__spike)spikeG.style.display='';
    preMeasureVis=null;
  }
  document.getElementById('measure-sec').style.display='none';
  measureActive=false;
  measureFirst=null;measureHover=null;
  selectedId=null;
  measureToggleBtn.classList.remove('active');
  map.style.cursor='grab';
  markerStatus.textContent='';
  renderMeasurements();
}
measureToggleBtn.onclick=()=>{
  if(measureActive)exitMeasureMode();else enterMeasureMode();
};

function applyDrag(p){
  if(!dragState)return;
  const m=measurements.find(x=>x.id===dragState.id);
  if(!m)return;
  if(dragState.type==='end'){
    if(dragState.which==='p1')m.p1={x:p.x,z:p.z};
    else m.p2={x:p.x,z:p.z};
  }else if(dragState.type==='wp'){
    let t=projectT(m,p);
    // Clamp between neighboring waypoints so ts stays sorted and
    // the index/materials mapping stays stable during drag.
    const idx=dragState.index;
    const prevT=idx>0?m.ts[idx-1]:0;
    const nextT=idx<m.ts.length-1?m.ts[idx+1]:1;
    const eps=0.001;
    t=Math.max(prevT+eps,Math.min(nextT-eps,t));
    m.ts[idx]=+t.toFixed(4);
  }
}

map.addEventListener('pointerdown',e=>{
  if(!measureActive)return;
  if(spaceDown)return;  // space held → let pan handler take over
  if(e.target.closest('#panel')||e.target.closest('#marker-bar'))return;
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  drag=false;
  map.setPointerCapture(e.pointerId);
  const p=screenToMap(e.clientX,e.clientY);
  const snap={x:+p.x.toFixed(2),z:+p.z.toFixed(2)};
  const thresh=Math.max(1.2,2.5/s);

  // Completing a placement always wins
  if(placingFirst){
    if(dist(placingFirst,snap)>0.05){
      const m={id:Date.now(),p1:placingFirst,p2:snap,name:'',ts:[],materials:['none']};
      measurements.push(m);
      selectedPoint={id:m.id,type:'end',which:'p2'};
      saveMeasurements();
      renderMeasureList();
      markerStatus.textContent='Added '+fmtLen(lineLen(m))+'. Click along the line to add waypoints.';
    }
    placingFirst=null;measureHover=null;
    renderMeasurements();
    return;
  }

  const hit=hitTest(snap,thresh);
  if(hit){
    if(hit.hit.type==='line'){
      // Insert waypoint at projected t, splitting segment and inheriting material
      const m=hit.m;
      const t=+hit.hit.t.toFixed(4);
      // Find which segment t falls within (before splice)
      const bounds=[0,...m.ts,1];
      let segIdx=0;
      for(let i=0;i<bounds.length-1;i++){
        if(t>bounds[i]&&t<bounds[i+1]){segIdx=i;break}
      }
      m.ts.splice(segIdx,0,t);
      if(!m.materials)m.materials=new Array(bounds.length-1).fill('none');
      // New waypoint splits segment segIdx → segIdx, segIdx+1 (both inherit)
      m.materials.splice(segIdx+1,0,m.materials[segIdx]);
      selectedPoint={id:m.id,type:'wp',index:segIdx};
      dragState={...selectedPoint};
      saveMeasurements();
    }else{
      selectedPoint={id:hit.m.id,type:hit.hit.type,which:hit.hit.which,index:hit.hit.index};
      dragState={...selectedPoint};
    }
    renderMeasurements();renderMeasureList();
    return;
  }

  // Nothing hit → start placing a new measurement
  placingFirst=snap;
  measureHover=snap;
  renderMeasurements();
},true);

map.addEventListener('pointermove',e=>{
  if(!measureActive)return;
  if(dragState){
    const p=screenToMap(e.clientX,e.clientY);
    applyDrag({x:+p.x.toFixed(2),z:+p.z.toFixed(2)});
    renderMeasurements();
    return;
  }
  if(placingFirst){
    const p=screenToMap(e.clientX,e.clientY);
    measureHover={x:+p.x.toFixed(2),z:+p.z.toFixed(2)};
    renderMeasurements();
  }
});

map.addEventListener('pointerup',e=>{
  if(dragState){
    saveMeasurements();
    dragState=null;
    renderMeasurements();renderMeasureList();
  }
});

// Space held in measure/surveyor mode → temporarily pan instead of draw
addEventListener('keydown',e=>{
  if(e.code==='Space'&&(measureActive||surveyorActive)&&!spaceDown){
    if(e.target.tagName==='INPUT')return;
    e.preventDefault();
    spaceDown=true;
    map.style.cursor='grab';
  }
});
addEventListener('keyup',e=>{
  if(e.code==='Space'&&spaceDown){
    spaceDown=false;
    if(measureActive||surveyorActive)map.style.cursor='crosshair';
  }
});

// Keyboard nudging (arrow keys) and waypoint deletion
addEventListener('keydown',e=>{
  if(!selectedPoint)return;
  if(e.target.tagName==='INPUT')return;
  const m=measurements.find(x=>x.id===selectedPoint.id);
  if(!m)return;

  if(e.key==='Escape'){selectedPoint=null;renderMeasurements();renderMeasureList();return}
  if((e.key==='Delete'||e.key==='Backspace')&&selectedPoint.type==='wp'){
    e.preventDefault();
    const idx=selectedPoint.index;
    m.ts.splice(idx,1);
    // Merge two segments: drop the right-hand one, keep the left material
    if(m.materials)m.materials.splice(idx+1,1);
    selectedPoint=null;
    saveMeasurements();renderMeasurements();renderMeasureList();
    return;
  }

  const step=e.shiftKey?1.0:0.15;
  let dx=0,dz=0;
  if(e.key==='ArrowLeft')dx=-step;
  else if(e.key==='ArrowRight')dx=step;
  else if(e.key==='ArrowUp')dz=-step;
  else if(e.key==='ArrowDown')dz=step;
  else return;
  e.preventDefault();

  if(selectedPoint.type==='end'){
    const pt=selectedPoint.which==='p1'?m.p1:m.p2;
    pt.x=+(pt.x+dx).toFixed(2);
    pt.z=+(pt.z+dz).toFixed(2);
  }else if(selectedPoint.type==='wp'){
    // Nudge in world coords, reproject onto line (waypoint slides along it)
    const cur=wpPos(m,m.ts[selectedPoint.index]);
    const moved={x:cur.x+dx,z:cur.z+dz};
    let t=projectT(m,moved);
    t=Math.max(0.001,Math.min(0.999,t));
    m.ts[selectedPoint.index]=+t.toFixed(4);
    m.ts.sort((a,b)=>a-b);
    selectedPoint.index=m.ts.indexOf(+t.toFixed(4));
  }
  saveMeasurements();renderMeasurements();renderMeasureList();
});

// ── Surveyor Mode ────────────────────────────────────────────
const surveyorLayer=el.querySelector('#layer-surveyor');
const surveyorToggleBtn=document.getElementById('surveyor-toggle');
let surveyorActive=false;
let preSurveyorVis=null;
let centerlineData={streets:[]};
let svOriginals=new Map(); // id → original points snapshot (frozen, never modified)
let svSelected=null;   // index into centerlineData.streets
let svSelNode=null;     // index into selected street's points
let svDrag=null;        // {streetIdx, nodeIdx} during drag

// Standards constants (inlined from standards.js for browser)
const FT=0.3048;
const SV_STREETS={
  residential:{laneWidth:10*FT,parkingWidth:7*FT,gutterWidth:1.5*FT,lanes:2},
  secondary:{laneWidth:11*FT,parkingWidth:7*FT,gutterWidth:1.5*FT,lanes:2},
  primary:{laneWidth:11*FT,parkingWidth:8*FT,gutterWidth:1.5*FT,lanes:4},
  service:{laneWidth:7.5*FT,parkingWidth:0,gutterWidth:0,lanes:2},
  footway:{laneWidth:3*FT,parkingWidth:0,gutterWidth:0,lanes:1},
  cycleway:{laneWidth:5*FT,parkingWidth:0,gutterWidth:0,lanes:1},
  pedestrian:{laneWidth:5*FT,parkingWidth:0,gutterWidth:0,lanes:1},
  steps:{laneWidth:4*FT,parkingWidth:0,gutterWidth:0,lanes:1},
};
const SV_TREELAWN=4.5*FT, SV_SIDEWALK=5*FT, SV_CURB=6*0.0254;
function svCrossSection(type, name){
  const sp=SV_STREETS[type]||SV_STREETS.residential;
  const halfLanes=(sp.lanes/2)*sp.laneWidth;
  const defaultPav=halfLanes+sp.parkingWidth+sp.gutterWidth;
  // Use survey measurement if available (actual measured pavement half-width)
  const sv=name&&SURVEY[name];
  const pav=sv?.pavementHalfWidth||defaultPav;
  return {pavement:pav, curb:pav+SV_CURB, treelawn:pav+SV_CURB+SV_TREELAWN, sidewalk:pav+SV_CURB+SV_TREELAWN+SV_SIDEWALK};
}

// Load centerlines
fetch('/centerlines').then(r=>r.json()).then(d=>{
  centerlineData=d&&d.streets?d:{streets:[]};
  for(const st of centerlineData.streets){
    svOriginals.set(st.id, st._original||st.points.map(p=>[p[0],p[1]]));
  }
}).catch(()=>{});

function saveCenterlines(){
  fetch('/centerlines',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(centerlineData)}).catch(()=>{});
}

function distToPolyline(pts,p){
  let best=Infinity;
  for(let i=0;i<pts.length-1;i++){
    const ax=pts[i][0],az=pts[i][1],bx=pts[i+1][0],bz=pts[i+1][1];
    const dx=bx-ax,dz=bz-az,len2=dx*dx+dz*dz;
    if(len2<1e-6){best=Math.min(best,Math.hypot(p.x-ax,p.z-az));continue}
    const t=Math.max(0,Math.min(1,((p.x-ax)*dx+(p.z-az)*dz)/len2));
    best=Math.min(best,Math.hypot(p.x-(ax+t*dx),p.z-(az+t*dz)));
  }
  return best;
}

function offsetPolyline(pts,dist,side){
  const result=[];
  for(let i=0;i<pts.length;i++){
    const prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)];
    const dx=next[0]-prev[0],dz=next[1]-prev[1];
    const len=Math.sqrt(dx*dx+dz*dz)||1;
    result.push([pts[i][0]+side*(-dz/len)*dist, pts[i][1]+side*(dx/len)*dist]);
  }
  return result;
}

// Catmull-Rom SVG path (from smooth.js) with variable tension
function svSmoothPath(pts,tension){
  if(pts.length<3) return 'M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L');
  const alpha=tension||0.5;
  const p=[
    [2*pts[0][0]-pts[1][0], 2*pts[0][1]-pts[1][1]],
    ...pts,
    [2*pts[pts.length-1][0]-pts[pts.length-2][0], 2*pts[pts.length-1][1]-pts[pts.length-2][1]]
  ];
  let d='M'+pts[0][0].toFixed(1)+','+pts[0][1].toFixed(1);
  for(let i=0;i<pts.length-1;i++){
    const p0=p[i],p1=p[i+1],p2=p[i+2],p3=p[i+3];
    const c1x=p1[0]+(p2[0]-p0[0])/(6/alpha), c1z=p1[1]+(p2[1]-p0[1])/(6/alpha);
    const c2x=p2[0]-(p3[0]-p1[0])/(6/alpha), c2z=p2[1]-(p3[1]-p1[1])/(6/alpha);
    d+=' C'+c1x.toFixed(1)+','+c1z.toFixed(1)+' '+c2x.toFixed(1)+','+c2z.toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);
  }
  return d;
}

// Densify polyline via Catmull-Rom (same formula as smooth.js)
// tension: 0=sharp polyline, 0.5=standard, 1.0+=very round
function svDensifySmooth(pts,tension){
  if(pts.length<3)return pts;
  const alpha=Math.max(0.01,tension);
  // Phantom endpoints (mirror first/last segment)
  const p=[
    [2*pts[0][0]-pts[1][0], 2*pts[0][1]-pts[1][1]],
    ...pts,
    [2*pts[pts.length-1][0]-pts[pts.length-2][0], 2*pts[pts.length-1][1]-pts[pts.length-2][1]]
  ];
  const result=[pts[0]];
  const STEPS=8;
  for(let i=0;i<pts.length-1;i++){
    const p0=p[i],p1=p[i+1],p2=p[i+2],p3=p[i+3];
    // Catmull-Rom tangents scaled by alpha (same as smooth.js: cp = p1 + (p2-p0)/(6/alpha))
    const m1x=(p2[0]-p0[0])*alpha/2, m1z=(p2[1]-p0[1])*alpha/2;
    const m2x=(p3[0]-p1[0])*alpha/2, m2z=(p3[1]-p1[1])*alpha/2;
    for(let j=1;j<=STEPS;j++){
      const t=j/STEPS,t2=t*t,t3=t2*t;
      // Hermite basis
      const h00=2*t3-3*t2+1, h10=t3-2*t2+t, h01=-2*t3+3*t2, h11=t3-t2;
      result.push([
        h00*p1[0]+h10*m1x+h01*p2[0]+h11*m2x,
        h00*p1[1]+h10*m1z+h01*p2[1]+h11*m2z
      ]);
    }
  }
  return result;
}
function svSilhouetteD(pts,dist){
  const left=offsetPolyline(pts,dist,+1);
  const right=offsetPolyline(pts,dist,-1);
  return 'M'+[...left,...right.reverse()].map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')+'Z';
}
// Get active (non-hidden) points for a street
function svActivePoints(st){
  const hidden=new Set(st.hiddenNodes||[]);
  if(hidden.size===0)return st.points;
  return st.points.filter((_,i)=>!hidden.has(i));
}
function renderSurveyor(){
  if(!surveyorActive){surveyorLayer.innerHTML='';return}
  let h='';
  const sw=1.4/s;

  // Selected street only: centerline + nodes
  if(svSelected!==null){
    const st=centerlineData.streets[svSelected];
    if(!st||st.disabled){svSelected=null;svSelNode=null;renderSurveyorPanel();return}
    const pts=svActivePoints(st);
    const hidden=new Set(st.hiddenNodes||[]);

    // Centerline (uses active points, optionally smoothed)
    const lineD=st.smooth>0?svSmoothPath(pts,st.smooth):'M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L');
    h+='<path d="'+lineD+'" fill="none" stroke="#000" stroke-width="'+(sw*1.8).toFixed(2)+'" opacity="0.5" stroke-linecap="round" stroke-linejoin="round"/>';
    h+='<path d="'+lineD+'" fill="none" stroke="#0ff" stroke-width="'+sw.toFixed(2)+'" opacity="0.9" stroke-linecap="round" stroke-linejoin="round"/>';

    // Nodes — all points, hidden ones shown dimmed
    const nr=Math.max(2,4/s);
    for(let i=0;i<st.points.length;i++){
      const sel=i===svSelNode;
      const isHidden=hidden.has(i);
      const fill=sel?'#fc0':isHidden?'rgba(255,80,80,0.4)':'none';
      const stroke=sel?'#000':isHidden?'rgba(255,80,80,0.5)':'#fff';
      const opacity=isHidden?'0.5':'1';
      h+='<circle cx="'+st.points[i][0].toFixed(1)+'" cy="'+st.points[i][1].toFixed(1)+'" r="'+(sel?nr*1.3:isHidden?nr*0.7:nr).toFixed(1)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+(0.5/s).toFixed(2)+'" opacity="'+opacity+'"/>';
    }
  }
  surveyorLayer.innerHTML=h;
}

function renderSurveyorPanel(){
  const meta=document.getElementById('sv-meta');
  const info=document.getElementById('sv-info');
  const status=document.getElementById('sv-status');
  if(svSelected===null){
    meta.style.display='none';
    info.style.display='';
    status.textContent='';
    return;
  }
  const st=centerlineData.streets[svSelected];
  if(!st){svSelected=null;meta.style.display='none';info.style.display='';return}
  meta.style.display='';
  info.style.display='none';
  document.getElementById('sv-name').value=st.name||'';
  document.getElementById('sv-type').value=st.type||'residential';
  document.getElementById('sv-oneway').checked=!!st.oneway;
  document.getElementById('sv-deadend').checked=!!st.deadEnd;
  document.getElementById('sv-loop').checked=!!st.loop;
  const smoothVal=Math.round((st.smooth||0)*100);
  document.getElementById('sv-smooth').value=smoothVal;
  document.getElementById('sv-smooth-val').textContent=smoothVal;
  const cs=svCrossSection(st.type,st.name);
  status.textContent=st.points.length+' nodes · '+st.source+' · pav='+cs.pavement.toFixed(1)+'m sw='+cs.sidewalk.toFixed(1)+'m'+(svSelNode!==null?' · node '+svSelNode:'');
}

function enterSurveyorMode(){
  if(measureActive)exitMeasureMode();
  if(markerActive){markerActive=false;document.getElementById('marker-toggle').classList.remove('active')}
  preSurveyorVis={};
  for(const L of LAYERS){
    const cb=document.getElementById('t-'+L.id);
    preSurveyorVis[L.id]=cb?cb.checked:true;
    setLayerVis(L.id,false);
  }
  const spikeG=el.querySelector('#layer-spike');
  if(spikeG){preSurveyorVis.__spike=spikeG.style.display!=='none';spikeG.style.display='none'}
  // Show aerial + centerlines only — everything else hidden so you see through to imagery
  setLayerVis('aerial',true);
  setLayerVis('centerline',true);
  surveyorActive=true;
  surveyorToggleBtn.classList.add('active');
  document.getElementById('surveyor-sec').style.display='';
  map.style.cursor='crosshair';
  markerStatus.textContent='Click a street to select. Drag nodes to edit. Space to pan.';
  renderSurveyor();
}
function exitSurveyorMode(){
  saveCenterlines();
  surveyorActive=false;
  svSelected=null;svSelNode=null;svDrag=null;
  surveyorToggleBtn.classList.remove('active');
  document.getElementById('surveyor-sec').style.display='none';
  markerStatus.textContent='Rebuilding map...';
  surveyorToggleBtn.disabled=true;
  // Rebuild the preview from updated centerlines, then reload
  fetch('/rebuild',{method:'POST'}).then(r=>r.json()).then(d=>{
    if(d.ok)window.location.reload();
    else{markerStatus.textContent='Rebuild failed';surveyorToggleBtn.disabled=false}
  }).catch(()=>{markerStatus.textContent='Rebuild failed';surveyorToggleBtn.disabled=false});
}
surveyorToggleBtn.onclick=()=>{
  if(surveyorActive)exitSurveyorMode();else enterSurveyorMode();
};

// Surveyor metadata handlers
document.getElementById('sv-name').oninput=e=>{if(svSelected!==null){centerlineData.streets[svSelected].name=e.target.value;saveCenterlines()}};
document.getElementById('sv-type').onchange=e=>{if(svSelected!==null){centerlineData.streets[svSelected].type=e.target.value;saveCenterlines();renderSurveyor();renderSurveyorPanel()}};
document.getElementById('sv-oneway').onchange=e=>{if(svSelected!==null){centerlineData.streets[svSelected].oneway=e.target.checked;saveCenterlines()}};
document.getElementById('sv-deadend').onchange=e=>{if(svSelected!==null){centerlineData.streets[svSelected].deadEnd=e.target.checked;saveCenterlines()}};
document.getElementById('sv-loop').onchange=e=>{if(svSelected!==null){centerlineData.streets[svSelected].loop=e.target.checked;saveCenterlines()}};
document.getElementById('sv-smooth').oninput=e=>{
  if(svSelected===null)return;
  const v=+e.target.value/100;
  centerlineData.streets[svSelected].smooth=v;
  document.getElementById('sv-smooth-val').textContent=e.target.value;
  renderSurveyor();
};
document.getElementById('sv-smooth').onchange=e=>{if(svSelected!==null)saveCenterlines()};
document.getElementById('sv-del-node').onclick=()=>{
  if(svSelected===null||svSelNode===null)return;
  const st=centerlineData.streets[svSelected];
  // Toggle node hidden (disabled) instead of deleting
  if(!st.hiddenNodes)st.hiddenNodes=[];
  const idx=svSelNode;
  const hIdx=st.hiddenNodes.indexOf(idx);
  if(hIdx>=0){st.hiddenNodes.splice(hIdx,1)}  // un-hide
  else{st.hiddenNodes.push(idx)}               // hide
  svSelNode=null;
  saveCenterlines();renderSurveyor();renderSurveyorPanel();
};
document.getElementById('sv-del-street').onclick=()=>{
  if(svSelected===null)return;
  const st=centerlineData.streets[svSelected];
  st.disabled=!st.disabled;
  svSelected=null;svSelNode=null;
  saveCenterlines();renderSurveyor();renderSurveyorPanel();
};
document.getElementById('sv-revert').onclick=()=>{
  if(svSelected===null){markerStatus.textContent='No street selected';return}
  const st=centerlineData.streets[svSelected];
  if(!st._original){markerStatus.textContent='No original data for '+st.name;return}
  st.points=st._original.map(p=>[p[0],p[1]]);
  st.hiddenNodes=[];
  st.disabled=false;
  svSelNode=null;
  markerStatus.textContent='Reverted: '+st.name+' ('+st._original.length+' pts)';
  saveCenterlines();renderSurveyor();renderSurveyorPanel();
};

// Surveyor pointer handlers
map.addEventListener('pointerdown',e=>{
  if(!surveyorActive||spaceDown)return;
  if(e.target.closest('#panel')||e.target.closest('#marker-bar'))return;
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  drag=false;
  map.setPointerCapture(e.pointerId);
  const p=screenToMap(e.clientX,e.clientY);
  const nodeThresh=Math.max(1.2,3/s);
  const lineThresh=Math.max(2,5/s);

  // 1. Check selected street's nodes
  if(svSelected!==null){
    const st=centerlineData.streets[svSelected];
    if(st){
      for(let i=0;i<st.points.length;i++){
        if(Math.hypot(p.x-st.points[i][0],p.z-st.points[i][1])<nodeThresh){
          svSelNode=i;
          svDrag={streetIdx:svSelected,nodeIdx:i};
          renderSurveyor();renderSurveyorPanel();return;
        }
      }
    }
  }

  // 2. Check all street polylines
  let bestDist=Infinity,bestIdx=-1;
  for(let i=0;i<centerlineData.streets.length;i++){
    const d=distToPolyline(centerlineData.streets[i].points,p);
    if(d<lineThresh&&d<bestDist){bestDist=d;bestIdx=i}
  }
  if(bestIdx>=0){
    svSelected=bestIdx;svSelNode=null;svDrag=null;
    renderSurveyor();renderSurveyorPanel();return;
  }

  // 3. Empty → deselect
  svSelected=null;svSelNode=null;svDrag=null;
  renderSurveyor();renderSurveyorPanel();
},true);

map.addEventListener('pointermove',e=>{
  if(!svDrag)return;
  const p=screenToMap(e.clientX,e.clientY);
  const st=centerlineData.streets[svDrag.streetIdx];
  if(st)st.points[svDrag.nodeIdx]=[+(p.x.toFixed(2)),+(p.z.toFixed(2))];
  renderSurveyor();
});

map.addEventListener('pointerup',e=>{
  if(!svDrag)return;
  svDrag=null;
  saveCenterlines();renderSurveyor();renderSurveyorPanel();
});

// Surveyor keyboard
addEventListener('keydown',e=>{
  if(!surveyorActive||svSelected===null)return;
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
  const st=centerlineData.streets[svSelected];
  if(!st)return;

  if(e.key==='Escape'){svSelected=null;svSelNode=null;renderSurveyor();renderSurveyorPanel();return}
  if((e.key==='Delete'||e.key==='Backspace')&&svSelNode!==null){
    e.preventDefault();
    // Toggle node hidden instead of deleting
    if(!st.hiddenNodes)st.hiddenNodes=[];
    const hIdx=st.hiddenNodes.indexOf(svSelNode);
    if(hIdx>=0){st.hiddenNodes.splice(hIdx,1)}else{st.hiddenNodes.push(svSelNode)}
    svSelNode=null;
    saveCenterlines();renderSurveyor();renderSurveyorPanel();return;
  }
  if(svSelNode===null)return;
  const step=e.shiftKey?1.0:0.15;
  let dx=0,dz=0;
  if(e.key==='ArrowLeft')dx=-step;
  else if(e.key==='ArrowRight')dx=step;
  else if(e.key==='ArrowUp')dz=-step;
  else if(e.key==='ArrowDown')dz=step;
  else return;
  e.preventDefault();
  st.points[svSelNode]=[+(st.points[svSelNode][0]+dx).toFixed(2),+(st.points[svSelNode][1]+dz).toFixed(2)];
  saveCenterlines();renderSurveyor();renderSurveyorPanel();
});

// Re-render measurements + surveyor + spawn new aerial tiles after pan/zoom
const _up=up;up=function(){_up();renderMeasurements();renderSurveyor();updateAerialTiles()};

renderMeasurements();
renderMeasureList();
</script></body></html>`

  writeFileSync(join(CLEAN_DIR, 'preview.html'), html)
  console.log(`  preview.html: ${Math.round(html.length / 1024)} KB`)

  const markerFile = join(CLEAN_DIR, 'marker_strokes.json')
  if (!existsSync(markerFile)) writeFileSync(markerFile, '[]')
  console.log('='.repeat(60))
}

main()
