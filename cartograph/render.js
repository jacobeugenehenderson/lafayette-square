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
  const streetsJson = JSON.parse(readFileSync(join(SRC_DATA, 'streets.json'), 'utf-8'))
  const curatedStreets = blockData.streets  // 35 named polylines with widths
  const allNamedStreets = streetsJson.streets || []  // fuller geometry (loops, multi-segment)

  // Load survey for pavement widths (block_shapes.json width = ROW, not pavement)
  const surveyData = JSON.parse(readFileSync(join(RAW_DIR, 'survey.json'), 'utf-8'))
  const surveyStreets = surveyData.streets || {}
  function pavementWidth(name, fallbackROW) {
    const s = surveyStreets[name]
    if (s?.pavementHalfWidth) return s.pavementHalfWidth * 2
    // No survey data: estimate pavement as ROW minus sidewalk zones
    if (fallbackROW) return Math.max(4, fallbackROW - 5.8) // 2 × 2.9m sidewalk zones
    return 12 // default residential
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

  // Detect divided roads: streets with opposing one-way pairs in OSM
  // These should use the OSM one-way segments (median emerges as gap)
  // instead of the single curated centerline
  const osmOneway = osmVehicular.filter(f => f.tags?.oneway === 'yes' && f.tags?.name)
  const onewayByName = {}
  for (const f of osmOneway) {
    const n = f.tags.name
    if (!onewayByName[n]) onewayByName[n] = []
    onewayByName[n].push(f)
  }
  // A street is divided if it has 2+ one-way segments that are:
  //   1. Roughly opposite bearing (~130°+)
  //   2. Close together (midpoints within ~25m perpendicular) — parallel carriageways
  // This distinguishes divided boulevards (Lafayette, Jefferson) from loop streets (Benton Place)
  const dividedNames = new Set()
  for (const [name, segs] of Object.entries(onewayByName)) {
    if (segs.length < 2) continue
    for (let i = 0; i < segs.length && !dividedNames.has(name); i++) {
      const c0 = segs[i].coords
      const dx0 = c0[c0.length-1].x - c0[0].x, dz0 = c0[c0.length-1].z - c0[0].z
      const len0 = Math.sqrt(dx0*dx0 + dz0*dz0)
      if (len0 < 10) continue
      const a0 = Math.atan2(dz0, dx0)
      const mx0 = (c0[0].x + c0[c0.length-1].x) / 2
      const mz0 = (c0[0].z + c0[c0.length-1].z) / 2

      for (let j = i + 1; j < segs.length; j++) {
        const c1 = segs[j].coords
        const dx1 = c1[c1.length-1].x - c1[0].x, dz1 = c1[c1.length-1].z - c1[0].z
        const len1 = Math.sqrt(dx1*dx1 + dz1*dz1)
        if (len1 < 10) continue
        const a1 = Math.atan2(dz1, dx1)

        // Opposite bearing?
        let angleDiff = Math.abs(a0 - a1)
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff
        if (angleDiff < 2.3) continue

        // Close together? Perpendicular distance between midpoints
        const nx = -dz0/len0, nz = dx0/len0  // normal to segment 0
        const mx1 = (c1[0].x + c1[c1.length-1].x) / 2
        const mz1 = (c1[0].z + c1[c1.length-1].z) / 2
        const perpDist = Math.abs((mx1-mx0)*nx + (mz1-mz0)*nz)

        if (perpDist < 25) {  // within 25m = divided boulevard
          dividedNames.add(name)
          break
        }
      }
    }
  }
  if (dividedNames.size) console.log(`    Divided roads (median): ${[...dividedNames].join(', ')}`)

  // Build segment list: { pts, width, oneway, name, type }
  const segments = []

  // Curated streets from block_shapes (authoritative widths)
  // For streets that also appear in streets.json with more segments (loops),
  // use streets.json geometry instead
  const streetsJsonNames = new Set()
  for (const s of allNamedStreets) if (s.name) streetsJsonNames.add(s.name)

  // Find streets with multiple segments in streets.json (loops, complex geometry)
  const multiSegNames = new Set()
  const segCountByName = {}
  for (const s of allNamedStreets) {
    if (!s.name) continue
    segCountByName[s.name] = (segCountByName[s.name] || 0) + 1
  }
  for (const [name, count] of Object.entries(segCountByName)) {
    if (count > 1) multiSegNames.add(name)
  }

  for (const st of curatedStreets) {
    if (dividedNames.has(st.name)) continue
    // If streets.json has multiple segments AND it's not a divided road, use streets.json
    if (multiSegNames.has(st.name) && !dividedNames.has(st.name)) continue
    segments.push({ pts: st.points, width: pavementWidth(st.name, st.width), oneway: false, name: st.name, type: st.type })
  }

  // Add multi-segment streets from streets.json (loops like Benton Place)
  // But NOT divided roads or loop streets — those use OSM segments directly
  const LOOP_STREETS = new Set(['Benton Place', 'Mackay Place'])
  for (const st of allNamedStreets) {
    if (!st.name || !multiSegNames.has(st.name)) continue
    if (dividedNames.has(st.name)) continue
    if (LOOP_STREETS.has(st.name)) continue  // handled from OSM below
    if (curatedNames.has(st.name) && !multiSegNames.has(st.name)) continue
    if (st.points.length < 2) continue
    const curated = curatedStreets.find(c => c.name === st.name)
    const width = pavementWidth(st.name, curated?.width || (st.type === 'primary' ? 20 : st.type === 'secondary' ? 16 : 12))
    segments.push({ pts: st.points, width, oneway: false, name: st.name, type: st.type || curated?.type || 'residential' })
  }

  for (const f of osmVehicular) {
    const name = f.tags?.name
    // Skip if curated covers this street AND it's not a divided road or loop street
    if (name && curatedNames.has(name) && !dividedNames.has(name) && !LOOP_STREETS.has(name)) continue
    const isCurve = name && CURVE_STREETS.has(name)
    const simplifyTol = (name && LOOP_STREETS.has(name)) ? 0.3 : isCurve ? 0 : 1.5
    const pts = simplifyTol > 0
      ? simplify(f.coords.map(c => [c.x, c.z]), simplifyTol)
      : f.coords.map(c => [c.x, c.z])
    const isOneway = f.tags?.oneway === 'yes'
    const hw = f.tags?.highway
    let width
    // Loop streets: use curated width (loop = 1x, stem = 2x)
    if (name && LOOP_STREETS.has(name)) {
      const curated = curatedStreets.find(c => c.name === name)
      const baseW = curated?.width || 4
      width = isOneway ? baseW : baseW * 2  // stem is two-way = 2x
    } else if (hw === 'primary' || hw === 'primary_link') width = isOneway ? 8 : 20
    else if (hw === 'secondary' || hw === 'secondary_link') width = isOneway ? 7 : 16
    else if (hw === 'tertiary' || hw === 'tertiary_link') width = isOneway ? 6 : 14
    else width = isOneway ? 5 : 12
    segments.push({ pts, width, oneway: isOneway, name: name || '', type: hw })
  }

  for (const f of osmAlleys) {
    segments.push({
      pts: simplify(f.coords.map(c => [c.x, c.z]), 1.5),
      width: 5, oneway: false, name: f.tags?.name || '', type: 'alley',
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
  // Normalize width per named street before chaining: all segments of the
  // same non-divided, non-loop street get the max width. This prevents stray
  // one-way tags from making one segment narrower than the rest.
  for (const [key, segs] of Object.entries(byKey)) {
    if (key.startsWith('_anon_') || segs.length < 2) continue
    if (dividedNames.has(key)) continue
    if (LOOP_STREETS.has(key)) continue  // loop streets need stem/loop width differentiation
    const maxWidth = Math.max(...segs.map(s => s.width))
    for (const s of segs) {
      s.width = maxWidth
      s.oneway = false
    }
    console.log(`    Normalized ${key}: ${segs.length} segs → width ${maxWidth}`)
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
    for (const b of (map.layers?.block || [])) {
      if (b.ring?.length >= 3) blockRings.push(b.ring.map(p => [p.x, p.z]))
    }
    for (const l of (map.layers?.lot || [])) {
      if (l.ring?.length >= 3) lotRings.push(l.ring.map(p => [p.x, p.z]))
    }
    console.log(`    ${blockRings.length} blocks, ${lotRings.length} lots`)

  }
  // Block fills in sidewalk color — the perimeter ring between block and lot IS the sidewalk
  {
    const paths = blockRings.map(ring => `    <path d="${polyD(ring)}" />`).join('\n')
    G.push(`  <g id="layer-sidewalk" class="layer">\n${paths}\n  </g>`)
  }
  // Lot fills on top — colored by dominant parcel land use
  {
    // Classify each lot by the dominant parcel use inside it
    function pointInPoly(px, pz, ring) {
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
        if (pointInPoly(pcx, pcz, ring)) {
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
      `    <path class="${lotUses[i]}" d="${polyD(ring)}" />`
    ).join('\n')
    G.push(`  <g id="layer-lot" class="layer">\n${paths}\n  </g>`)
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
    for (const seg of sorted) {
      const pts = seg.pts, w = seg.width
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
        // Pull back dead-end endpoints by half the road width so the
        // round cap circle sits inside the road, not spilling into sidewalk
        const startCap = needsRoundCap(pts[0], w, seg)
        const endCap = needsRoundCap(pts[pts.length - 1], w, seg)
        let drawPts = pts
        if (startCap || endCap) {
          drawPts = [...pts]
          if (startCap && drawPts.length >= 2) {
            const [a, b] = [drawPts[0], drawPts[1]]
            const dx = b[0] - a[0], dz = b[1] - a[1]
            const len = Math.sqrt(dx*dx + dz*dz)
            if (len > w / 2) {
              drawPts[0] = [a[0] + dx/len * w/2, a[1] + dz/len * w/2]
            }
          }
          if (endCap && drawPts.length >= 2) {
            const last = drawPts.length - 1
            const [a, b] = [drawPts[last], drawPts[last - 1]]
            const dx = b[0] - a[0], dz = b[1] - a[1]
            const len = Math.sqrt(dx*dx + dz*dz)
            if (len > w / 2) {
              drawPts[last] = [a[0] + dx/len * w/2, a[1] + dz/len * w/2]
            }
          }
        }
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
    G.push(`  <g id="layer-alley" class="layer">\n${[...alleyLines, ...alleyCaps].join('\n')}\n  </g>`)
    G.push(`  <g id="layer-curb" class="layer">\n${[...curbLines, ...curbCaps].join('\n')}\n  </g>`)
    G.push(`  <g id="layer-street" class="layer">\n${[...roadLines, ...roadCaps].join('\n')}\n  </g>`)
  }

  // Center stripes — two-way streets + divided road carriageways (they're still two-way roads)
  // Skip: alleys, and truly one-way streets that aren't part of a divided road
  {
    const stripes = []
    for (const seg of finalSegments) {
      if (seg.type === 'alley') continue
      if (seg.oneway && !dividedNames.has(seg.name)) continue  // one-way loop/place = no stripe
      const isMajor = seg.type === 'primary' || seg.type === 'secondary'
      stripes.push(`    <path class="${isMajor ? 'solid' : 'dashed'}" d="${lineD(seg.pts)}" />`)
    }
    if (stripes.length)
      G.push(`  <g id="layer-stripe" class="layer">\n${stripes.join('\n')}\n  </g>`)
  }

  // Labels (textPath along centerline)
  {
    const seen = new Set()
    const defs = [], texts = []
    let idx = 0
    for (const seg of finalSegments) {
      if (!seg.name || seg.type === 'alley' || seen.has(seg.name)) continue
      if (seg.pts.length < 2) continue
      seen.add(seg.name)
      const id = `st-${idx++}`
      // Straight line from start to end (no curving text)
      let start = seg.pts[0], end = seg.pts[seg.pts.length - 1]
      // Ensure left-to-right reading
      if (start[0] > end[0]) { const tmp = start; start = end; end = tmp }
      defs.push(`      <path id="${id}" d="M${R(start[0])},${R(start[1])} L${R(end[0])},${R(end[1])}" />`)
      texts.push(`    <text><textPath href="#${id}" startOffset="50%" text-anchor="middle">${seg.name}</textPath></text>`)
    }
    if (defs.length) {
      G.push(`  <g id="layer-labels" class="layer">\n    <defs>\n${defs.join('\n')}\n    </defs>\n${texts.join('\n')}\n  </g>`)
    }
  }

  // ── Buildings ──────────────────────────────────────────────────────
  let buildingCount = 0
  {
    const mapData = existsSync(join(CLEAN_DIR, 'map.json'))
      ? JSON.parse(readFileSync(join(CLEAN_DIR, 'map.json'), 'utf-8')) : null
    const bldgs = []
    for (const b of (mapData?.buildings || [])) {
      if (!b.ring || b.ring.length < 3) continue
      bldgs.push(`    <path d="${polyD(b.ring.map(p => [p.x, p.z]))}" />`)
    }
    buildingCount = bldgs.length
    if (bldgs.length)
      G.push(`  <g id="layer-building" class="layer">\n${bldgs.join('\n')}\n  </g>`)
  }

  // ── SVG ───────────────────────────────────────────────────────────
  const stripeCount = finalSegments.filter(s => s.type !== 'alley' && !s.oneway).length
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
    #layer-stripe path   { fill: none; stroke: var(--stripe, #c8b430); stroke-width: 0.6; stroke-linecap: round; }
    #layer-stripe .dashed { stroke-dasharray: 3 10; }
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
    #layer-building path { fill: var(--building, #2a2a28); stroke: var(--building-stroke, #1a1a18); stroke-width: 0.3; }
    #layer-labels text   { fill: var(--label-fill, var(--street, #3a3a38)); stroke: var(--label-stroke, none); stroke-width: 0.3; font-size: var(--label-size, 7px); font-family: -apple-system, sans-serif; dominant-baseline: central; }
    .layer { opacity: var(--layer-opacity, 1); }
  </style>
${G.join('\n\n')}
  <g id="layer-pen"></g>
</svg>`

  writeFileSync(join(CLEAN_DIR, 'map.svg'), svg)
  console.log(`  map.svg: ${Math.round(svg.length / 1024)} KB  (${w.toFixed(0)}×${h.toFixed(0)}m)`)

  // ── Layer defs ────────────────────────────────────────────────────
  const streetCount = sorted.filter(s => s.type !== 'alley').length
  const alleyCount = sorted.filter(s => s.type === 'alley').length
  const LD = [
    { id: 'ground',   label: 'Ground',    count: 1,                    fill: '#2a2a26' },
    { id: 'sidewalk', label: 'Sidewalks', count: blockRings.length,    fill: '#7a756a' },
    { id: 'lot',      label: 'Blocks',    count: lotRings.length,      fill: '#3a4a2a' },
    { id: 'curb',     label: 'Curb',      count: streetCount,          fill: '#555550' },
    { id: 'street',   label: 'Streets',   count: streetCount,          fill: '#3a3a38' },
    { id: 'alley',    label: 'Alleys',    count: alleyCount,           fill: '#353532' },
    { id: 'building', label: 'Buildings',  count: buildingCount,        fill: '#2a2a28' },
    { id: 'stripe',   label: 'Stripes',   count: stripeCount,          fill: '#c8b430' },
    { id: 'labels',   label: 'Labels',    count: labelCount,           fill: '#666666' },
  ]
  for (const l of LD) console.log(`    ${l.label}: ${l.count}`)

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
#panel{width:260px;background:#1a1a1a;border-left:1px solid #333;overflow-y:auto;padding:16px;flex-shrink:0}
#panel h1{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin-bottom:16px}
.sec{margin-bottom:16px;border-bottom:1px solid #282828;padding-bottom:12px}
.sec h2{font-size:12px;font-weight:600;color:#aaa;margin-bottom:8px}
.row{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.row label{font-size:11px;color:#777;width:55px;flex-shrink:0}
.row input[type=color]{width:28px;height:20px;border:1px solid #444;border-radius:2px;background:none;cursor:pointer;padding:0}
.row input[type=range]{flex:1;accent-color:#666}
.row .v{font-size:10px;color:#555;width:28px;text-align:right}
.tog{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.tog input{accent-color:#666}
.tog label{font-size:11px;color:#999;cursor:pointer;flex:1}
.tog .n{font-size:10px;color:#444}
#zoom{position:absolute;bottom:10px;left:10px;font-size:10px;color:#555;background:rgba(0,0,0,.7);padding:3px 7px;border-radius:3px}
#marker-bar{position:absolute;top:10px;left:10px;display:flex;gap:4px;z-index:10}
#marker-bar button{background:rgba(0,0,0,.8);color:#aaa;border:1px solid #444;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer}
#marker-bar button.active{background:#b44;color:#fff;border-color:#e66}
#marker-bar button:hover{border-color:#888}
#marker-status{position:absolute;bottom:10px;right:270px;font-size:11px;color:#888;background:rgba(0,0,0,.7);padding:4px 8px;border-radius:3px;z-index:10}
</style></head><body>
<div id="map">${svg}
<div id="marker-bar">
  <button id="marker-toggle">✏ Marker</button>
  <button id="marker-undo" style="display:none">↩ Undo</button>
  <button id="marker-clear" style="display:none">✕ Clear All</button>
</div>
<div id="marker-status"></div>
<div id="zoom">1.0x</div>
</div>
<div id="panel"><h1>Cartograph</h1>
<div class="sec" id="toggles"><h2>Layers</h2></div>
<div id="knobs"></div></div>
<script>
const LAYERS=${JSON.stringify(LD)};
const map=document.getElementById('map'),el=map.querySelector('svg');
let s=1,px=0,pz=0,drag=false,sx,sz,spx,spz;
function up(){el.style.transform='translate('+px+'px,'+pz+'px) scale('+s+')';document.getElementById('zoom').textContent=s.toFixed(1)+'x'}
{const r=map.getBoundingClientRect(),vb=el.viewBox.baseVal;s=Math.min(r.width/vb.width,r.height/vb.height)*.9;px=(r.width-vb.width*s)/2-vb.x*s;pz=(r.height-vb.height*s)/2-vb.y*s;up()}
map.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY>0?.9:1.1,r=map.getBoundingClientRect(),mx=e.clientX-r.left,mz=e.clientY-r.top;px=mx-(mx-px)*f;pz=mz-(mz-pz)*f;s*=f;up()},{passive:false});
map.addEventListener('pointerdown',e=>{if(markerActive)return;drag=true;sx=e.clientX;sz=e.clientY;spx=px;spz=pz});
addEventListener('pointermove',e=>{if(!drag)return;px=spx+(e.clientX-sx);pz=spz+(e.clientY-sz);up()});
addEventListener('pointerup',()=>{drag=false});
const tDiv=document.getElementById('toggles'),kDiv=document.getElementById('knobs');
LAYERS.forEach(L=>{
  const g=el.querySelector('#layer-'+L.id);
  const d=document.createElement('div');d.className='tog';
  d.innerHTML='<input type=checkbox checked id=t-'+L.id+'><label for=t-'+L.id+'>'+L.label+'</label><span class=n>'+L.count+'</span>';
  d.querySelector('input').onchange=e=>{if(g)g.style.display=e.target.checked?'':'none'};
  tDiv.appendChild(d);
  const sec=document.createElement('div');sec.className='sec';sec.innerHTML='<h2>'+L.label+'</h2>';
  const cr=document.createElement('div');cr.className='row';
  cr.innerHTML='<label>Color</label><input type=color value="'+L.fill+'">';
  cr.querySelector('input').oninput=e=>el.style.setProperty('--'+L.id,e.target.value);
  sec.appendChild(cr);
  kDiv.appendChild(sec);
});
// Curb width slider
const cw=document.createElement('div');cw.className='sec';cw.innerHTML='<h2>Curb</h2>';
const cwr=document.createElement('div');cwr.className='row';
cwr.innerHTML='<label>Width</label><input type=range min=0 max=3 step=.1 value=0.6><span class=v>0.6</span>';
const cws=cwr.querySelector('input'),cwv=cwr.querySelector('.v');
cws.oninput=()=>{el.style.setProperty('--curb-width',cws.value);cwv.textContent=parseFloat(cws.value).toFixed(1)};
cw.appendChild(cwr);
const cc=document.createElement('div');cc.className='row';
cc.innerHTML='<label>Color</label><input type=color value="#555550">';
cc.querySelector('input').oninput=e=>el.style.setProperty('--street-stroke',e.target.value);
cw.appendChild(cc);
kDiv.appendChild(cw);
// Labels
const lb=document.createElement('div');lb.className='sec';lb.innerHTML='<h2>Labels</h2>';
const lf=document.createElement('div');lf.className='row';
lf.innerHTML='<label>Fill</label><input type=color value="#3a3a38">';
lf.querySelector('input').oninput=e=>el.style.setProperty('--label-fill',e.target.value);
lb.appendChild(lf);
const ls=document.createElement('div');ls.className='row';
ls.innerHTML='<label>Stroke</label><input type=color value="#ffffff">';
ls.querySelector('input').oninput=e=>el.style.setProperty('--label-stroke',e.target.value);
lb.appendChild(ls);
const lsz=document.createElement('div');lsz.className='row';
lsz.innerHTML='<label>Size</label><input type=range min=3 max=14 step=.5 value=7><span class=v>7</span>';
const lsi=lsz.querySelector('input'),lsv=lsz.querySelector('.v');
lsi.oninput=()=>{el.style.setProperty('--label-size',lsi.value+'px');lsv.textContent=lsi.value};
lb.appendChild(lsz);
kDiv.appendChild(lb);
// Land use
const lu=document.createElement('div');lu.className='sec';lu.innerHTML='<h2>Land Use</h2>';
[{c:'residential',l:'Residential',v:'#3a4a2a'},{c:'commercial',l:'Commercial',v:'#4a4438'},
 {c:'vacant',l:'Vacant',v:'#2a3020'},{c:'vacant-com',l:'Vacant Com.',v:'#3a3830'},
 {c:'parking',l:'Parking',v:'#3a3a38'},{c:'institutional',l:'Institutional',v:'#3a3a4a'},
 {c:'recreation',l:'Recreation',v:'#2a3a1a'},{c:'industrial',l:'Industrial',v:'#4a4040'}
].forEach(t=>{
  const r=document.createElement('div');r.className='row';
  r.innerHTML='<label>'+t.l+'</label><input type=color value="'+t.v+'">';
  r.querySelector('input').oninput=e=>el.style.setProperty('--lot-'+t.c,e.target.value);
  lu.appendChild(r);
});
kDiv.appendChild(lu);
// Background
const bg=document.createElement('div');bg.className='sec';
bg.innerHTML='<h2>Background</h2><div class=row><label>Color</label><input type=color value="#1a1a18"></div>';
bg.querySelector('input').oninput=e=>el.querySelector('svg').style.background=e.target.value;
kDiv.appendChild(bg);

// ── Marker Tool ─────────────────────────────────────────────
const markerLayer=el.querySelector('#layer-pen');
const markerStatus=document.getElementById('marker-status');
let markerActive=false, markerDrawing=false, markerCur=[], markerStrokes=[];
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
</script></body></html>`

  writeFileSync(join(CLEAN_DIR, 'preview.html'), html)
  console.log(`  preview.html: ${Math.round(html.length / 1024)} KB`)

  const markerFile = join(CLEAN_DIR, 'marker_strokes.json')
  if (!existsSync(markerFile)) writeFileSync(markerFile, '[]')
  console.log('='.repeat(60))
}

main()
