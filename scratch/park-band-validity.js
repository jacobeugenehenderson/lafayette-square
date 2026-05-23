// Band-validity probe for Lafayette Park.
// Distinguish outcomes (A) degenerate / (B) valid+positioned / (C) valid but mispositioned.
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = 'lafayette-square'
const ribbons = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'ribbons.json'), 'utf-8'))
const design = JSON.parse(readFileSync(join(ROOT, 'public', 'looks', scene, 'design.json'), 'utf-8'))
const sten = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json'), 'utf-8'))
const center = sten.center, radius = sten.radius
const streetFade = sten.streetFade || null
const targetR = streetFade ? streetFade.outer + 50 : radius
const scale = radius > 0 ? targetR / radius : 1
const stencil = sten.boundary.map(([x, z]) => [center[0] + (x - center[0]) * scale, center[1] + (z - center[1]) * scale])

const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms: design.blockCustoms || null,
  blockLandUse: design.blockLandUse || null,
  curbWidth: design.curbWidth ?? 0.45,
})

function pointInRing(px, py, r) { let inside = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > py) !== (zj > py) && px < (xj - xi) * (py - zi) / (zj - zi) + xi) inside = !inside } return inside }
function ringSignedArea2D(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2 }
function bboxOf(r) { let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity; for (const p of r) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1] } return { minX, maxX, minZ, maxZ } }
function bboxContains(outer, inner, tol = 0.5) {
  return inner.minX >= outer.minX - tol && inner.maxX <= outer.maxX + tol
    && inner.minZ >= outer.minZ - tol && inner.maxZ <= outer.maxZ + tol
}
function segIntersect(a, b, c, d) {
  // proper intersection test, ignoring endpoint touches
  const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1], x3 = c[0], y3 = c[1], x4 = d[0], y4 = d[1]
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(den) < 1e-9) return false
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6
}
function selfIntersects(r) {
  const n = r.length
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue
    if (segIntersect(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return [i, j]
  }
  return null
}

// Lafayette Park's block ring (contains origin).
let parkIdx = -1
for (let i = 0; i < v2.blockSharp.length; i++) if (pointInRing(0, 0, v2.blockSharp[i])) { parkIdx = i; break }
const parkRing = v2.blockSharp[parkIdx]
const parkRounded = v2.blockRounded[parkIdx]
const parkBbox = bboxOf(parkRing)
const parkArea = ringSignedArea2D(parkRing)
console.log(`Lafayette Park: idx=${parkIdx} sharp.verts=${parkRing.length} rounded.verts=${parkRounded.length}`)
console.log(`  area=${parkArea.toFixed(1)} m² (sign=${parkArea >= 0 ? '+CCW' : '-CW'}) bbox=[${parkBbox.minX.toFixed(1)},${parkBbox.minZ.toFixed(1)}..${parkBbox.maxX.toFixed(1)},${parkBbox.maxZ.toFixed(1)}]`)

function blockKeyFromRing(ring) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of ring) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]) }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
  const x = Math.round(cx * 2) / 2, z = Math.round(cz * 2) / 2
  return `${x.toFixed(1)},${z.toFixed(1)}`
}
const parkKey = blockKeyFromRing(parkRing)
console.log(`  blockKey from blockSharp = "${parkKey}"`)
const parkRoundedKey = blockKeyFromRing(parkRounded)
console.log(`  blockKey from blockRounded = "${parkRoundedKey}"`)

// Locate park bands via geometry (centroid inside park) — not by blockKey.
function ringCentroid(r) {
  let cx = 0, cz = 0
  for (const p of r) { cx += p[0]; cz += p[1] }
  return [cx / r.length, cz / r.length]
}
function avgPointOfBand(fb) {
  const all = []
  for (const ring of (fb.treelawnRings || [])) all.push(...ring)
  for (const ring of (fb.sidewalkRings || [])) all.push(...ring)
  if (!all.length) return null
  return ringCentroid(all)
}

console.log(`\nAll frontageBands entries: ${v2.frontageBands.length}`)
const keys = {}
for (const fb of v2.frontageBands) { if (!fb) continue; keys[fb.blockKey] = (keys[fb.blockKey] || 0) + 1 }
const sortedKeys = Object.entries(keys).sort((a, b) => b[1] - a[1]).slice(0, 5)
console.log('top blockKeys among bands:', sortedKeys)

// Bands whose centroid lies inside the park ring
const parkBands = []
for (const fb of v2.frontageBands) {
  if (!fb) continue
  const p = avgPointOfBand(fb)
  if (!p) continue
  if (pointInRing(p[0], p[1], parkRing)) parkBands.push(fb)
}
// Also bands sharing chainIdx and side with the park's frontageEdges, regardless of key
const parkFEs = v2.frontageEdges.filter(fe => fe.blockKey === parkKey)
const parkFEsig = new Set(parkFEs.map(fe => `${fe.chainIdx}|${fe.side}`))
const parkBandsByFE = v2.frontageBands.filter(fb => fb && parkFEsig.has(`${fb.chainIdx}|${fb.side}`))
console.log(`\nbands by centroid-in-park: ${parkBands.length}`)
console.log(`bands by (chainIdx,side) match to park FEs: ${parkBandsByFE.length}`)
for (const fb of parkBandsByFE) {
  const chain = ribbons.streets[fb.chainIdx]
  console.log(`  fb blockKey=${fb.blockKey} edgeOrd=${fb.edgeOrd} chain="${chain?.name}" side=${fb.side} segOrds=[${fb.segOrds?.join(',')}] kind=${fb.kind || '?'}`)
}

// Validity sweep across the candidate band set (centroid in park OR FE-matched)
const candidates = Array.from(new Set([...parkBands, ...parkBandsByFE]))
console.log(`\n--- VALIDITY SWEEP (n=${candidates.length}) ---`)
const report = []
for (const fb of candidates) {
  const chain = ribbons.streets[fb.chainIdx]
  const groups = {
    treelawn: fb.treelawnRings || [],
    sidewalk: fb.sidewalkRings || [],
    asphalt: fb.asphaltRings || [],
  }
  const rec = { key: fb.blockKey, edgeOrd: fb.edgeOrd, chain: chain?.name, side: fb.side, kind: fb.kind, issues: [], rings: {} }
  for (const [name, rings] of Object.entries(groups)) {
    rec.rings[name] = rings.map(ring => {
      const verts = ring.length
      const area = ringSignedArea2D(ring)
      const bb = bboxOf(ring)
      const inside = bboxContains(parkBbox, bb, 2)
      const si = selfIntersects(ring)
      const issues = []
      if (verts < 3) issues.push('VERT<3')
      if (Math.abs(area) < 0.5) issues.push('AREA<0.5')
      if (!inside) issues.push('BBOX_OUT')
      if (si) issues.push(`SELFINT@${si[0]},${si[1]}`)
      if (issues.length) rec.issues.push(`${name}:${issues.join(',')}`)
      return { verts, area: +area.toFixed(2), bb: [+bb.minX.toFixed(1), +bb.minZ.toFixed(1), +bb.maxX.toFixed(1), +bb.maxZ.toFixed(1)], inside, si }
    })
  }
  report.push(rec)
  console.log(`  [${rec.chain} ${rec.side} edgeOrd=${rec.edgeOrd}] tl=${rec.rings.treelawn.length} sw=${rec.rings.sidewalk.length} asph=${rec.rings.asphalt.length} kind=${rec.kind || '?'} ${rec.issues.length ? 'ISSUES: ' + rec.issues.join(' | ') : 'ok'}`)
  for (const [g, arr] of Object.entries(rec.rings)) {
    for (const r of arr) console.log(`     ${g}: verts=${r.verts} area=${r.area} bbox=[${r.bb.join(',')}] inside=${r.inside} si=${r.si || 'no'}`)
  }
}

// SVG output
const svgPath = join(ROOT, 'scratch', 'park-band.svg')
const all = [parkRing, parkRounded]
for (const fb of candidates) for (const k of ['treelawnRings', 'sidewalkRings', 'asphaltRings']) for (const r of (fb[k] || [])) all.push(r)
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
for (const r of all) for (const p of r) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1] }
const pad = 10
minX -= pad; maxX += pad; minZ -= pad; maxZ += pad
const W = 1000, H = Math.round(W * (maxZ - minZ) / (maxX - minX))
const sx = x => (x - minX) / (maxX - minX) * W
const sz = z => H - (z - minZ) / (maxZ - minZ) * H
function poly(r, stroke, fill, w = 1, op = 1) {
  if (!r || r.length < 2) return ''
  return `<polygon points="${r.map(p => `${sx(p[0]).toFixed(1)},${sz(p[1]).toFixed(1)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" fill-opacity="${op}" />`
}
const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f']
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff">`
svg += `<text x="8" y="16" font-size="12">Lafayette Park bands — parkBbox=[${parkBbox.minX.toFixed(0)},${parkBbox.minZ.toFixed(0)}..${parkBbox.maxX.toFixed(0)},${parkBbox.maxZ.toFixed(0)}]</text>`
svg += poly(parkRing, '#000', 'none', 1.5)
svg += poly(parkRounded, '#888', 'none', 1)
let ci = 0
for (const fb of candidates) {
  const c = colors[ci++ % colors.length]
  for (const r of (fb.asphaltRings || [])) svg += poly(r, c, '#444', 0.5, 0.15)
  for (const r of (fb.treelawnRings || [])) svg += poly(r, c, '#2ca02c', 0.8, 0.35)
  for (const r of (fb.sidewalkRings || [])) svg += poly(r, c, '#ccc', 0.8, 0.5)
  const cn = ribbons.streets[fb.chainIdx]?.name || '?'
  const p = avgPointOfBand(fb)
  if (p) svg += `<text x="${sx(p[0])}" y="${sz(p[1])}" font-size="10" fill="${c}">${cn} ${fb.side} eo=${fb.edgeOrd}</text>`
}
svg += '</svg>'
writeFileSync(svgPath, svg)
console.log(`\nSVG written: ${svgPath}`)
