// Probe — find park block, count arc spans per ring, log corner records
// at T-intersection pass-through vertices.
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadStencil(scene) {
  const path = join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(path)) return null
  const s = JSON.parse(readFileSync(path, 'utf-8'))
  if (!s.boundary?.length) return null
  const center = s.center || [0, 0]
  const radius = s.radius || 1
  const streetFade = s.streetFade || null
  const targetR = streetFade ? streetFade.outer + 50 : radius
  const scale = radius > 0 ? targetR / radius : 1
  const cx = center[0], cz = center[1]
  return s.boundary.map(([x, z]) => [cx + (x - cx) * scale, cz + (z - cz) * scale])
}

const scene = 'lafayette-square'
const ribbonsPath = join(ROOT, 'src', 'data', 'ribbons.json')
const designPath  = join(ROOT, 'public', 'looks', scene, 'design.json')
const ribbons = JSON.parse(readFileSync(ribbonsPath, 'utf-8'))
const design  = existsSync(designPath) ? JSON.parse(readFileSync(designPath, 'utf-8')) : {}
const stencil = loadStencil(scene)

console.log('[probe] ribbons streets:', ribbons.streets?.length, 'faces:', ribbons.faces?.length, 'intersections:', ribbons.intersections?.length)

const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms:    design.blockCustoms    || null,
  blockLandUse:    design.blockLandUse    || null,
  curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : 0.45,
})

const blockSharp = v2.blockSharp
const blockRounded = v2.blockRounded
const corners = v2.corners
console.log('[probe] blockSharp rings:', blockSharp.length, 'blockRounded rings:', blockRounded.length, 'corners:', corners.length)

// Identify park ring: pick the face whose use === 'park' (LS), get centroid.
const parkFace = (ribbons.faces || []).find(f => f.use === 'park')
let parkCentroid = null
if (parkFace?.ring) {
  let cx = 0, cy = 0
  for (const p of parkFace.ring) { cx += p[0]; cy += p[1] }
  parkCentroid = [cx / parkFace.ring.length, cy / parkFace.ring.length]
  console.log('[probe] park face centroid:', parkCentroid)
}

// Helper: even-odd PIR
function pointInRing(px, py, r) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], zi = r[i][1]
    const xj = r[j][0], zj = r[j][1]
    if ((zi > py) !== (zj > py) && px < (xj - xi) * (py - zi) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

// Find park ring index in blockSharp: ring whose centroid encloses parkCentroid AND has the largest area near parkCentroid.
let parkIdx = -1
if (parkCentroid) {
  for (let i = 0; i < blockSharp.length; i++) {
    if (pointInRing(parkCentroid[0], parkCentroid[1], blockSharp[i])) {
      parkIdx = i
      break
    }
  }
}
console.log('[probe] park ring index (blockSharp):', parkIdx)

if (parkIdx >= 0) {
  const sharp = blockSharp[parkIdx]
  const rounded = blockRounded[parkIdx]
  console.log(`[probe] park blockSharp vertices: ${sharp.length}  blockRounded vertices: ${rounded?.length}`)
}

// Replicate applyRoundCornersToRing's pass-1 match + cross filter on the park ring,
// counting how many vertices end up as corner-spans, and what their alignment looks like.
function ringSignedArea2D(r) {
  let s = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])
  }
  return s
}
function unit(v) { const m = Math.hypot(v[0], v[1]) || 1; return [v[0]/m, v[1]/m] }

if (parkIdx >= 0) {
  const TOL = 0.5
  const ring = blockSharp[parkIdx]
  const n = ring.length
  const ringSign = ringSignedArea2D(ring) >= 0 ? +1 : -1
  console.log(`[probe] park ringSign=${ringSign}`)

  const matched = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    for (const c of corners) {
      if (Math.hypot(ring[i][0] - c.point[0], ring[i][1] - c.point[1]) < TOL) {
        matched[i] = c; break
      }
    }
  }
  const matchCount = matched.filter(Boolean).length
  console.log(`[probe] matched corner records on park ring: ${matchCount}`)

  let passConvex = 0
  const details = []
  for (let i = 0; i < n; i++) {
    const m = matched[i]
    if (!m) continue
    const prev = ring[(i - 1 + n) % n]
    const cur = ring[i]
    const next = ring[(i + 1) % n]
    const inDir = unit([cur[0]-prev[0], cur[1]-prev[1]])
    const outDir = unit([next[0]-cur[0], next[1]-cur[1]])
    const cross = inDir[0]*outDir[1] - inDir[1]*outDir[0]
    const convex = cross * ringSign > 0
    if (convex) passConvex++

    // Align: m.T_A / m.T_B are leg outward tangents. Ring approaches cur from inDir,
    // departs along outDir.  Test both natural and reversed.
    const TA = m.T_A, TB = m.T_B
    const dotInTA = -(inDir[0]*TA[0] + inDir[1]*TA[1])  // arrival ≈ -T_A
    const dotOutTB = outDir[0]*TB[0] + outDir[1]*TB[1]  // departure ≈ +T_B
    const dotInTB = -(inDir[0]*TB[0] + inDir[1]*TB[1])
    const dotOutTA = outDir[0]*TA[0] + outDir[1]*TA[1]
    const alignA = Math.max(dotInTA, dotInTB)
    const alignB = Math.max(dotOutTA, dotOutTB)
    details.push({
      i, cross: +cross.toFixed(3), convex, alignA: +alignA.toFixed(2), alignB: +alignB.toFixed(2),
      pt: [+cur[0].toFixed(1), +cur[1].toFixed(1)],
    })
  }
  console.log(`[probe] convex-passing vertices on park ring: ${passConvex}`)
  console.log('[probe] sample details (up to 30):')
  for (const d of details.slice(0, 30)) console.log('  ', d)

  // Count arcMeta spans by walking blockRounded (we don't have arcMeta exported,
  // but we can re-run applyRoundCornersToRing's exit -- the result.ring vertex
  // count delta is a coarse signal). Use length delta:
  const rounded = blockRounded[parkIdx]
  console.log(`[probe] sharp ring=${ring.length}  rounded ring=${rounded?.length}  delta=${(rounded?.length || 0) - ring.length}`)
  // Each span replaces (start..end) input verts with arc samples; coarse
  // estimate of span count not derivable from length alone but the
  // convex-passing count IS the span count.
  console.log(`[probe] ⇒ EXPECTED arc spans on park: 4 (real park corners). Observed: ${passConvex}`)
}

// Sanity: also dump a "typical" non-park residential ring's convex-passing count for comparison.
{
  // Pick the largest residential ring that doesn't enclose park centroid.
  let bigIdx = -1, bigArea = 0
  for (let i = 0; i < blockSharp.length; i++) {
    if (i === parkIdx) continue
    const a = Math.abs(ringSignedArea2D(blockSharp[i]))
    if (a > bigArea) { bigArea = a; bigIdx = i }
  }
  if (bigIdx >= 0) {
    const TOL = 0.5
    const ring = blockSharp[bigIdx]
    const n = ring.length
    const ringSign = ringSignedArea2D(ring) >= 0 ? +1 : -1
    const matched = new Array(n).fill(null)
    for (let i = 0; i < n; i++) for (const c of corners) {
      if (Math.hypot(ring[i][0]-c.point[0], ring[i][1]-c.point[1]) < TOL) { matched[i] = c; break }
    }
    let passConvex = 0
    for (let i = 0; i < n; i++) {
      const m = matched[i]; if (!m) continue
      const prev = ring[(i-1+n)%n], cur = ring[i], next = ring[(i+1)%n]
      const inDir = unit([cur[0]-prev[0], cur[1]-prev[1]])
      const outDir = unit([next[0]-cur[0], next[1]-cur[1]])
      const cross = inDir[0]*outDir[1] - inDir[1]*outDir[0]
      if (cross * ringSign > 0) passConvex++
    }
    console.log(`[probe] biggest non-park ring idx=${bigIdx}  verts=${ring.length}  convex-passing=${passConvex}`)
  }
}
