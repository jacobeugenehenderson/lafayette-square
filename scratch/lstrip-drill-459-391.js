// Q1 drill-in: Lafayette Avenue, blockKey "459.0,391.0", edgeOrds 0,1,2.
// Renders SVG showing owning blockRounded ring + the three entries' bands +
// overshoot vertex dots. Classifies overshoot vs boundary-noise vs real.
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

function blockKeyFromRing(ring) {
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity
  for (const p of ring) {
    if (p[0]<minX)minX=p[0]; if (p[0]>maxX)maxX=p[0]
    if (p[1]<minY)minY=p[1]; if (p[1]>maxY)maxY=p[1]
  }
  const cx = Math.round(((minX+maxX)/2)*2)/2
  const cy = Math.round(((minY+maxY)/2)*2)/2
  return `${cx.toFixed(1)},${cy.toFixed(1)}`
}
function pointInRing(p, ring) {
  const x = p[0], y = p[1]
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi)
    if (intersect) inside = !inside
  }
  return inside
}
// Signed perpendicular distance from p to nearest edge of ring; sign per
// pointInRing (negative = interior).
function signedDistToRing(p, ring) {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const ll = dx*dx + dy*dy
    let t = ll > 1e-12 ? ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / ll : 0
    if (t < 0) t = 0; else if (t > 1) t = 1
    const cx = a[0] + dx*t, cy = a[1] + dy*t
    const d = Math.hypot(p[0]-cx, p[1]-cy)
    if (d < best) best = d
  }
  return pointInRing(p, ring) ? -best : best
}

const KEY = '459.0,391.0'
const owning = v2.blockRounded.find(r => blockKeyFromRing(r) === KEY)
if (!owning) { console.error(`no blockRounded ring with key ${KEY}`); process.exit(1) }

const entries = v2.frontageBands.filter(fb =>
  fb && !fb.corner && fb.blockKey === KEY && [0,1,2].includes(fb.edgeOrd)
).sort((a,b) => a.edgeOrd - b.edgeOrd)
console.log(`owning ring: ${owning.length} vertices`)
console.log(`entries matching blockKey=${KEY} edgeOrd∈{0,1,2}: ${entries.length}`)
for (const e of entries) {
  const chain = ribbons.streets[e.chainIdx]
  console.log(`  chain="${chain.name}" side=${e.side} edgeOrd=${e.edgeOrd} tlRings=${e.treelawnRings.length} swRings=${e.sidewalkRings.length}`)
}

// Classify every band-ring vertex.
const classes = { inside: 0, boundary: 0, real: 0, large: 0 }
const overshootPts = []
for (const e of entries) {
  for (const k of ['treelawnRings', 'sidewalkRings']) {
    for (const r of (e[k] || [])) {
      for (const v of r) {
        const d = signedDistToRing(v, owning)
        if (d < -0.01) classes.inside++
        else if (d <= 0.01) classes.boundary++
        else if (d <= 0.5) { classes.real++; overshootPts.push({ v, d, kind: k, edgeOrd: e.edgeOrd }) }
        else { classes.large++; overshootPts.push({ v, d, kind: k, edgeOrd: e.edgeOrd }) }
      }
    }
  }
}
const totalV = classes.inside + classes.boundary + classes.real + classes.large
console.log(`\nVertex classification across the 3 entries:`)
console.log(`  inside (d < -0.01m):       ${classes.inside}/${totalV} (${(100*classes.inside/totalV).toFixed(1)}%)`)
console.log(`  boundary (|d| ≤ 0.01m):    ${classes.boundary}/${totalV} (${(100*classes.boundary/totalV).toFixed(1)}%)`)
console.log(`  real overshoot (0.01–0.5m):${classes.real}/${totalV} (${(100*classes.real/totalV).toFixed(1)}%)`)
console.log(`  LARGE overshoot (>0.5m):   ${classes.large}/${totalV} (${(100*classes.large/totalV).toFixed(1)}%)`)
if (overshootPts.length) {
  const maxD = overshootPts.reduce((m, o) => Math.max(m, o.d), 0)
  console.log(`  max overshoot distance: ${maxD.toFixed(3)}m`)
  console.log(`  top 5 overshoots:`)
  overshootPts.sort((a,b) => b.d - a.d).slice(0,5).forEach(o => {
    console.log(`    edgeOrd=${o.edgeOrd} kind=${o.kind} at (${o.v[0].toFixed(2)},${o.v[1].toFixed(2)}) d=${o.d.toFixed(3)}m`)
  })
}

// ─── SVG ─────────────────────────────────────────────────────────────
// Compute bbox.
let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity
function bbExtend(p){ if(p[0]<minX)minX=p[0]; if(p[0]>maxX)maxX=p[0]; if(p[1]<minY)minY=p[1]; if(p[1]>maxY)maxY=p[1] }
for (const v of owning) bbExtend(v)
for (const e of entries) for (const k of ['treelawnRings','sidewalkRings']) for (const r of (e[k]||[])) for (const v of r) bbExtend(v)
const pad = 4
minX -= pad; maxX += pad; minY -= pad; maxY += pad
const W = 1200, H = Math.round(W * (maxY - minY) / (maxX - minX))
function xs(x){ return (x - minX) / (maxX - minX) * W }
function ys(y){ return H - (y - minY) / (maxY - minY) * H } // flip Y (screen down)
function ringPath(r){ return 'M ' + r.map(p => `${xs(p[0]).toFixed(2)},${ys(p[1]).toFixed(2)}`).join(' L ') + ' Z' }
const colors = ['#d62728', '#1f77b4', '#2ca02c'] // edgeOrd 0,1,2
const svg = []
svg.push(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`)
svg.push(`<rect width="${W}" height="${H}" fill="#fafafa"/>`)
// owning ring — gray fill, dark stroke
svg.push(`<path d="${ringPath(owning)}" fill="#ddd" stroke="#333" stroke-width="0.8"/>`)
// owning ring vertices as small dots
for (const v of owning) svg.push(`<circle cx="${xs(v[0]).toFixed(2)}" cy="${ys(v[1]).toFixed(2)}" r="1.2" fill="#666"/>`)
// each entry's bands
for (const e of entries) {
  const c = colors[e.edgeOrd] || '#888'
  for (const r of (e.treelawnRings || [])) svg.push(`<path d="${ringPath(r)}" fill="${c}33" stroke="${c}" stroke-width="0.6"/>`)
  for (const r of (e.sidewalkRings || [])) svg.push(`<path d="${ringPath(r)}" fill="${c}66" stroke="${c}" stroke-width="0.6" stroke-dasharray="3,2"/>`)
}
// overshoot vertices — red dot, size by magnitude
for (const o of overshootPts) {
  const r = o.d > 0.5 ? 3.5 : 2.0
  svg.push(`<circle cx="${xs(o.v[0]).toFixed(2)}" cy="${ys(o.v[1]).toFixed(2)}" r="${r}" fill="#ff0000" stroke="#7a0000" stroke-width="0.5"/>`)
}
// legend
svg.push(`<g font-family="monospace" font-size="14" fill="#222">`)
svg.push(`<text x="10" y="20">blockKey=${KEY} — owning blockRounded ring (${owning.length} vertices)</text>`)
let y = 40
entries.forEach((e, i) => {
  const chain = ribbons.streets[e.chainIdx]
  svg.push(`<text x="10" y="${y}" fill="${colors[e.edgeOrd]}">edgeOrd=${e.edgeOrd} chain="${chain.name}" side=${e.side} tl=${e.treelawnRings.length} sw=${e.sidewalkRings.length}</text>`)
  y += 18
})
svg.push(`<text x="10" y="${y+10}" fill="#a00">red dots = overshoot vertices (${classes.real + classes.large} total; max d=${overshootPts.length?overshootPts[0].d.toFixed(3):'n/a'}m)</text>`)
svg.push(`</g></svg>`)
writeFileSync(join(ROOT, 'scratch', 'lafayette-459-391.svg'), svg.join('\n'))
console.log(`\nSVG written to scratch/lafayette-459-391.svg`)
