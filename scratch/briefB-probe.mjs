#!/usr/bin/env node
// Brief B probe — the perpendicular-join protrusion at Hickory near Benton.
// Marked case: world ~[20,-402] (marker_strokes #4 bbox x[4..41] z[-426..-380]).
// Question (the §3 derivation-first gate): is this genuinely filletRing rounding
// an EMERGENT (non-corner) vertex into a lobe, or something else (FILL, width-step,
// centerline)? Probe the junctionMap identity + the SHAPE iA geometry there.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))

const TARGET = [20, -402]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ── 1. junctionMap nodes near the target ───────────────────────────────────
const jm = ribbons.junctionMap
console.log(`junctionMap: ${jm?.nodes?.length || 0} nodes`)
const near = (jm?.nodes || [])
  .map(n => ({ n, d: dist(n.at, TARGET) }))
  .filter(x => x.d < 30).sort((a, b) => a.d - b.d)
console.log(`\n=== junction nodes within 30m of [${TARGET}] ===`)
for (const { n, d } of near) {
  const legNames = (n.legs || []).map(l => `${l.chain}/${l.end}`).join(', ')
  console.log(`\n  node @[${n.at.map(v => v.toFixed(1))}] d=${d.toFixed(1)}m  kinds=[${[...(n.kinds || [])]}]  deg(legs)=${(n.legs || []).length}`)
  console.log(`    legs: ${legNames}`)
  console.log(`    continuity=${n.continuity?.length || 0}  deTaper=${n.deTaper?.length || 0}  apron=${n.apron ? 'YES' : 'no'}  cornersAdjacent=${n.cornersAdjacent?.length || 0}`)
  for (const c of (n.cornersAdjacent || [])) {
    console.log(`      corner: a=${c.a.chain}/${c.a.end}${c.a.half ? ':' + c.a.half : ''}/${c.a.side}  b=${c.b.chain}/${c.b.end}${c.b.half ? ':' + c.b.half : ''}/${c.b.side}`)
  }
}

// which chains pass within 8m of the target
console.log(`\n=== chains passing within 8m of [${TARGET}] ===`)
for (const s of ribbons.streets) {
  let best = Infinity, bestPt = null
  for (const p of (s.points || [])) { const d = dist(p, TARGET); if (d < best) { best = d; bestPt = p } }
  if (best < 8) console.log(`  ${(s.skelId || '').padEnd(26)} ${(s.name || '').padEnd(20)} role=${s.phase?.role || '-'}  nearest=${best.toFixed(1)}m @[${bestPt.map(v => v.toFixed(0))}]`)
}

// ── 2. SHAPE geometry: iA rings near the target ─────────────────────────────
const r = buildTileGround(ribbons, {
  curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, blockCustoms: design.blockCustoms,
  emitArtifact: true,
})
const tiles = r._shapeArtifact || []

// turn angle (deg) at vertex i of a ring
function turnDeg(ring, i) {
  const n = ring.length
  const A = ring[(i - 1 + n) % n], V = ring[i], B = ring[(i + 1) % n]
  let ix = V[0] - A[0], iy = V[1] - A[1], ox = B[0] - V[0], oy = B[1] - V[1]
  const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy)
  if (li < 1e-6 || lo < 1e-6) return { deg: 0, leg: Math.min(li, lo) }
  ix /= li; iy /= li; ox /= lo; oy /= lo
  const cross = ix * oy - iy * ox
  const turn = Math.acos(Math.max(-1, Math.min(1, ix * ox + iy * oy)))
  return { deg: turn * 180 / Math.PI, cross, leg: Math.min(li, lo) }
}

console.log(`\n=== iA (curb-line / asphalt-inner) vertices within 12m of [${TARGET}] ===`)
let lobeFound = false
for (const t of tiles) {
  if (!t.iA) continue
  for (let ri = 0; ri < t.iA.length; ri++) {
    const ring = t.iA[ri]
    const idxNear = []
    for (let i = 0; i < ring.length; i++) if (dist(ring[i], TARGET) < 12) idxNear.push(i)
    if (!idxNear.length) continue
    // look for a run of close-spaced vertices forming a convex bulge = a fillet arc/lobe
    const sharp = idxNear.map(i => ({ i, ...turnDeg(ring, i) })).filter(x => x.deg > 12)
    const arcRun = idxNear.length    // dense run count near node
    const area = Math.abs(ring.reduce((s, p, i) => { const j = (i + 1) % ring.length; return s + p[0] * ring[j][1] - ring[j][0] * p[1] }, 0)) / 2
    console.log(`  tile ${t.id ?? '?'} iA[${ri}] ringPts=${ring.length} area=${area.toFixed(0)}m²  near-vtx=${idxNear.length}  sharp(>12°)=${sharp.length}`)
    for (const s of sharp.slice(0, 12)) {
      console.log(`      v${s.i} @[${ring[s.i].map(v => v.toFixed(1))}] turn=${s.deg.toFixed(0)}° leg=${s.leg.toFixed(2)}m ${s.cross > 0 ? 'convex' : 'concave'}`)
    }
    // a tiny dense ring entirely near the node = the lobe
    if (ring.length >= 10 && area < 200 && idxNear.length > ring.length * 0.5) {
      console.log(`      ⚠️  LOBE CANDIDATE: small dense ring (${ring.length} pts, ${area.toFixed(0)}m²) clustered at the node`)
      lobeFound = true
    }
  }
}
console.log(`\nlobe candidate in SHAPE iA: ${lobeFound ? 'YES' : 'no — check FILL layers'}`)

// ── 3. asphalt + apron (_jPolys) + FILL layers near the target ──────────────
const ringNear = (ring, R = 12) => ring.some(p => dist(p, TARGET) < R)
const ringArea = (ring) => Math.abs(ring.reduce((s, p, i) => { const j = (i + 1) % ring.length; return s + p[0] * ring[j][1] - ring[j][0] * p[1] }, 0)) / 2

console.log(`\n=== asphalt rings near node ===`)
for (const ring of (r.asphalt || [])) if (ring.length >= 3 && ringNear(ring)) {
  const sharp = ring.map((_, i) => ({ i, ...turnDeg(ring, i) })).filter(x => x.deg > 12 && dist(ring[x.i], TARGET) < 12)
  console.log(`  asphalt ring pts=${ring.length} area=${ringArea(ring).toFixed(0)}m²  sharp-near=${sharp.length}`)
  for (const s of sharp.slice(0, 10)) console.log(`     v${s.i} @[${ring[s.i].map(v=>v.toFixed(1))}] turn=${s.deg.toFixed(0)}° ${s.cross>0?'convex':'concave'} leg=${s.leg.toFixed(2)}`)
}

console.log(`\n=== aprons (_jPolys) near node ===`)
for (const poly of (r._jPolys || [])) {
  const rings = Array.isArray(poly[0][0]) ? poly : [poly]
  for (const ring of rings) if (ring.length >= 3 && ringNear(ring)) {
    console.log(`  apron ring pts=${ring.length} area=${ringArea(ring).toFixed(0)}m²  bbox=[${Math.min(...ring.map(p=>p[0])).toFixed(0)},${Math.min(...ring.map(p=>p[1])).toFixed(0)}..${Math.max(...ring.map(p=>p[0])).toFixed(0)},${Math.max(...ring.map(p=>p[1])).toFixed(0)}]`)
  }
}

console.log(`\n=== FILL layers (small rings) near node ===`)
const fillLayers = []
for (const ring of (r.sidewalk || [])) fillLayers.push(['sidewalk', ring])
for (const [k, rings] of Object.entries(r.treelawnByLu || {})) for (const ring of (rings || [])) fillLayers.push([`treelawn:${k}`, ring])
for (const [name, ring] of fillLayers) {
  if (ring.length < 3 || !ringNear(ring, 10)) continue
  const a = ringArea(ring)
  const w = Math.max(...ring.map(p=>p[0])) - Math.min(...ring.map(p=>p[0]))
  const h = Math.max(...ring.map(p=>p[1])) - Math.min(...ring.map(p=>p[1]))
  const slim = a < 300 || (Math.min(w,h) > 0 && Math.max(w,h)/Math.min(w,h) > 6)
  console.log(`  ${name.padEnd(22)} pts=${ring.length} area=${a.toFixed(0)}m² ${w.toFixed(0)}×${h.toFixed(0)}m ${slim?'⚠️ SLIVER':''}`)
}
