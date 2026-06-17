// Edge-of-map probe (Brief F): validate that clipping face-streets to the
// boundary + injecting the subdivided boundary ring closes the perimeter faces
// in the extractFaces walk, WITHOUT disturbing interior tiles. Throwaway — proves
// the mechanism before editing derive.js / baking.
import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'

const rb = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const bd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url), 'utf8'))
const bpoly = bd.boundary

const faceStreets = (rb.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  .map(s => ({ points: s.points.map(p => [p[0], p[1]]), skelId: s.skelId || s.name }))

const signedArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return a / 2 }
const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1] } return [x / r.length, z / r.length] }
const ringKey = (r) => r.map(p => Math.round(p[0] * 1e3) + ',' + Math.round(p[1] * 1e3)).join('|')
// canonical key invariant to start-vertex + winding (for matching interior tiles)
const canonKey = (r) => {
  const pts = r.map(p => Math.round(p[0] * 1e3) + ',' + Math.round(p[1] * 1e3))
  const rots = []
  for (const seq of [pts, pts.slice().reverse()]) {
    for (let i = 0; i < seq.length; i++) rots.push(seq.slice(i).concat(seq.slice(0, i)).join('|'))
  }
  return rots.sort()[0]
}
const c = bd.center, R = bd.radius
const pip = (px, pz, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1]; if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside } return inside }

// ── Baseline ──
const baseTiles = extractFaces(faceStreets).filter(f => signedArea(f.ring) > 1e-3)
console.log(`baseline tiles: ${baseTiles.length}`)

// ── Clip streets to boundary + collect crossings per boundary edge ──
const n = bpoly.length
const crossingsOnEdge = Array.from({ length: n }, () => [])  // [{u, p}]
const segXedge = (ax, az, bx, bz, cx, cz, dx, dz) => {
  const rX = bx - ax, rZ = bz - az, sX = dx - cx, sZ = dz - cz
  const denom = rX * sZ - rZ * sX
  if (Math.abs(denom) < 1e-12) return null
  const t = ((cx - ax) * sZ - (cz - az) * sX) / denom
  const u = ((cx - ax) * rZ - (cz - az) * rX) / denom
  if (t <= 1e-9 || t >= 1 - 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return { t, u }
}
const clipStreet = (s) => {
  const pts = s.points, out = []
  let cur = pip(pts[0][0], pts[0][1], bpoly) ? [pts[0]] : null
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const xs = []
    for (let k = 0, j = n - 1; k < n; j = k++) {
      const hit = segXedge(a[0], a[1], b[0], b[1], bpoly[j][0], bpoly[j][1], bpoly[k][0], bpoly[k][1])
      if (hit) xs.push({ ...hit, edge: j, // edge from bpoly[j] -> bpoly[k]
        uOnEdge: hit.u })
    }
    xs.sort((p, q) => p.t - q.t)
    for (const x of xs) {
      const P = [a[0] + (b[0] - a[0]) * x.t, a[1] + (b[1] - a[1]) * x.t]
      crossingsOnEdge[x.edge].push({ u: x.uOnEdge, p: P })
      if (cur) { cur.push(P); if (cur.length >= 2) out.push(cur); cur = null }
      else { cur = [P] }
    }
    // arrive at b
    if (cur) cur.push(b)
    else if (pip(b[0], b[1], bpoly)) cur = [b]
  }
  if (cur && cur.length >= 2) out.push(cur)
  return out
}

const clippedStreets = []
let nPieces = 0, nDropped = 0
for (const s of faceStreets) {
  const pieces = clipStreet(s)
  if (!pieces.length) { nDropped++; continue }
  for (const pc of pieces) { clippedStreets.push({ points: pc, skelId: s.skelId }); nPieces++ }
}
console.log(`clipped: ${clippedStreets.length} pieces from ${faceStreets.length} streets (${nDropped} fully outside)`)

// ── Subdivide boundary ring at crossings ──
const ring = []
for (let i = 0; i < n; i++) {
  ring.push([bpoly[i][0], bpoly[i][1]])
  const xs = crossingsOnEdge[i].sort((a, b) => a.u - b.u)
  for (const x of xs) ring.push(x.p)
}
ring.push([bpoly[0][0], bpoly[0][1]])  // close
const totalCrossings = crossingsOnEdge.reduce((a, e) => a + e.length, 0)
console.log(`boundary crossings: ${totalCrossings}, subdivided ring pts: ${ring.length}`)

// ── New walk ──
const faceStreets2 = [...clippedStreets, { points: ring, skelId: '__boundary__' }]
const newTiles = extractFaces(faceStreets2).filter(f => signedArea(f.ring) > 1e-3)
console.log(`new tiles: ${newTiles.length}`)

// ── Compare interior stability + characterize perimeter tiles ──
const baseKeys = new Set(baseTiles.map(t => canonKey(t.ring)))
const newKeys = new Map(); for (const t of newTiles) newKeys.set(canonKey(t.ring), t)
let kept = 0, gone = 0, added = 0
const addedTiles = []
for (const t of baseTiles) { if (newKeys.has(canonKey(t.ring))) kept++; else gone++ }
for (const t of newTiles) { if (!baseKeys.has(canonKey(t.ring))) { added++; addedTiles.push(t) } }
console.log(`interior stability: kept ${kept} / ${baseTiles.length} baseline tiles byte-identical; ${gone} changed/removed; ${added} new tiles`)

// how many added tiles touch the boundary (have a '__boundary__' edge)?
let withBoundaryEdge = 0
for (const t of addedTiles) {
  const idx = faceStreets2.length - 1  // boundary is last
  if (t.edges.some(e => e.streetIdx === idx)) withBoundaryEdge++
}
console.log(`new tiles with a boundary edge: ${withBoundaryEdge} / ${addedTiles.length}`)
// radial band of added tile centroids
const bands = { inner: 0, mid: 0, outer: 0 }
let addedArea = 0
for (const t of addedTiles) {
  const ct = centroid(t.ring); const d = Math.hypot(ct[0] - c[0], ct[1] - c[1])
  bands[d < R * 0.5 ? 'inner' : d < R * 0.85 ? 'mid' : 'outer']++
  addedArea += Math.abs(signedArea(t.ring))
}
console.log(`added tile centroid bands (R=${R}):`, bands, `| total added area ${(addedArea / 1e6).toFixed(2)} km²`)
// biggest added tiles
addedTiles.sort((a, b) => Math.abs(signedArea(b.ring)) - Math.abs(signedArea(a.ring)))
console.log('biggest added tiles (area m², centroid, #edges, #boundaryEdges):')
for (const t of addedTiles.slice(0, 8)) {
  const ct = centroid(t.ring); const idx = faceStreets2.length - 1
  const be = t.edges.filter(e => e.streetIdx === idx).length
  console.log(`  ${Math.round(Math.abs(signedArea(t.ring)))}  [${ct[0].toFixed(0)},${ct[1].toFixed(0)}]  edges=${t.ring.length}  bEdges=${be}`)
}

// classify the CHANGED/removed baseline tiles by radial band — interior must be untouched
console.log('\n--- changed/removed baseline tiles by band ---')
const changedBands = { inner: 0, mid: 0, outer: 0 }
const innerChanged = []
for (const t of baseTiles) {
  if (newKeys.has(canonKey(t.ring))) continue
  const ct = centroid(t.ring); const d = Math.hypot(ct[0]-c[0], ct[1]-c[1])
  // does this baseline tile extend OUTSIDE the boundary?
  const outside = t.ring.some(p => !pip(p[0], p[1], bpoly))
  const band = d < R*0.5 ? 'inner' : d < R*0.85 ? 'mid' : 'outer'
  changedBands[band]++
  if (band === 'inner' || !outside) innerChanged.push({ ct, d: Math.round(d), outside, area: Math.round(Math.abs(signedArea(t.ring))) })
}
console.log('changed bands:', changedBands)
console.log(`changed tiles that are FULLY INSIDE boundary (would be a real interior regression): ${innerChanged.length}`)
for (const x of innerChanged.slice(0,12)) console.log('  ', x)
