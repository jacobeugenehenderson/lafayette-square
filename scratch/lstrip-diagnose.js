// L-strip diagnostic probe. Classifies every frontageBands entry into the
// four H1-H4 buckets from RIBBONS.md §6.1.
//
// Usage: node scratch/lstrip-diagnose.js
// Output: scratch/lstrip-diagnose.csv + stdout roll-up.
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

// ─── helpers ──────────────────────────────────────────────────────────
function ringSignedArea(r) {
  let s = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])
  }
  return -s / 2
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
function blockKeyFromRing(ring) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of ring) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]
  }
  const cx = Math.round(((minX + maxX) / 2) * 2) / 2
  const cy = Math.round(((minY + maxY) / 2) * 2) / 2
  return `${cx.toFixed(1)},${cy.toFixed(1)}`
}
function segIntersect(a, b, c, d) {
  const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1], x3 = c[0], y3 = c[1], x4 = d[0], y4 = d[1]
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(den) < 1e-9) return false
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6
}
function ringSelfIntersects(r) {
  const n = r.length
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue
    if (segIntersect(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true
  }
  return false
}
function ringInteriorProbe(ring) {
  if (!ring || ring.length < 3) return null
  const ccw = ringSignedArea(ring) > 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-3) continue
    const px = ccw ? -dy / len : dy / len
    const py = ccw ?  dx / len : -dx / len
    const eps = 0.01
    return [(a[0] + b[0]) / 2 + px * eps, (a[1] + b[1]) / 2 + py * eps]
  }
  return null
}

// ─── indices ──────────────────────────────────────────────────────────
const blockRoundedKeySet = new Set()
const ringByKey = new Map()
for (const ring of v2.blockRounded) {
  const k = blockKeyFromRing(ring)
  blockRoundedKeySet.add(k)
  if (!ringByKey.has(k)) ringByKey.set(k, ring)
}

function adjacentLuOf(fb) {
  const ring = (fb.treelawnRings && fb.treelawnRings[0]) || (fb.sidewalkRings && fb.sidewalkRings[0])
  if (!ring) return { lu: null, probeFailed: true }
  const probe = ringInteriorProbe(ring)
  if (!probe) return { lu: null, probeFailed: true }
  for (const b of v2.blocks || []) {
    if (!b?.ring || b.ring.length < 3) continue
    if (pointInRing(probe, b.ring)) return { lu: b.lu || 'unknown', probeFailed: false }
  }
  return { lu: null, probeFailed: false }
}

function resolveMeasure(fb) {
  const chain = ribbons.streets[fb.chainIdx]
  const custom = design.blockCustoms?.[fb.blockKey]?.[fb.edgeOrd]
  const m = custom || chain.measure?.[fb.side] || {}
  return {
    terminal: m.terminal,
    tl: Number.isFinite(m.treelawn) ? m.treelawn : 0,
    sw: Number.isFinite(m.sidewalk) ? m.sidewalk : 0,
    fromCustom: !!custom,
  }
}

// ─── classify ─────────────────────────────────────────────────────────
const rows = []
let unknownKind = 0
let probeFailed = 0
for (const fb of v2.frontageBands) {
  if (!fb) continue
  const isArc = !!fb.corner
  const isStraight = !!fb.points && !isArc
  if (!isArc && !isStraight) { unknownKind++; continue }

  const allRings = [...(fb.treelawnRings || []), ...(fb.sidewalkRings || [])]
  let selfInt = false
  for (const r of allRings) { if (r && r.length >= 3 && ringSelfIntersects(r)) { selfInt = true; break } }

  let blockKeyDrifted = null
  let overshootsRing = null
  if (isStraight) {
    blockKeyDrifted = !blockRoundedKeySet.has(fb.blockKey)
    const owning = ringByKey.get(fb.blockKey)
    if (owning) {
      let any = false
      for (const r of allRings) {
        if (!r) continue
        for (const v of r) { if (!pointInRing(v, owning)) { any = true; break } }
        if (any) break
      }
      overshootsRing = any
    }
  }

  const lu = adjacentLuOf(fb)
  if (lu.probeFailed) probeFailed++

  const m = resolveMeasure(fb)
  const hasTerminalSidewalk = m.terminal === 'sidewalk'
  const bandRingCount = (fb.treelawnRings?.length || 0) + (fb.sidewalkRings?.length || 0)
  const zeroBands = bandRingCount === 0
  const chain = ribbons.streets[fb.chainIdx]

  rows.push({
    kind: isArc ? 'arc' : 'straight',
    chainIdx: fb.chainIdx,
    chainName: chain?.name || '',
    side: fb.side,
    blockKey: fb.blockKey,
    edgeOrd: fb.edgeOrd,
    segOrds: (fb.segOrds || (fb.corner ? [] : [])).join('|'),
    adjacentLu: lu.lu || '',
    selfInt: selfInt ? 1 : 0,
    overshootsRing: overshootsRing === null ? '' : (overshootsRing ? 1 : 0),
    blockKeyDrifted: blockKeyDrifted === null ? '' : (blockKeyDrifted ? 1 : 0),
    hasTerminalSidewalk: hasTerminalSidewalk ? 1 : 0,
    tlDepth: m.tl,
    swDepth: m.sw,
    bandRingCount,
    zeroBands: zeroBands ? 1 : 0,
    customs: m.fromCustom ? 1 : 0,
  })
}

// ─── write CSV ────────────────────────────────────────────────────────
const headers = Object.keys(rows[0] || {
  kind:'',chainIdx:'',chainName:'',side:'',blockKey:'',edgeOrd:'',segOrds:'',adjacentLu:'',
  selfInt:'',overshootsRing:'',blockKeyDrifted:'',hasTerminalSidewalk:'',tlDepth:'',swDepth:'',
  bandRingCount:'',zeroBands:'',customs:'',
})
const csvLines = [headers.join(',')]
for (const r of rows) {
  csvLines.push(headers.map(h => {
    const v = r[h]
    if (v == null) return ''
    const s = String(v)
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
  }).join(','))
}
writeFileSync(join(ROOT, 'scratch', 'lstrip-diagnose.csv'), csvLines.join('\n') + '\n')

// ─── roll-up ──────────────────────────────────────────────────────────
const total = rows.length
const straight = rows.filter(r => r.kind === 'straight')
const arc = rows.filter(r => r.kind === 'arc')
console.log(`\n=== L-strip diagnostic ===`)
console.log(`total frontageBands entries: ${total} (straight ${straight.length} + arc ${arc.length})`)
console.log(`unknown kind (neither points nor corner): ${unknownKind}`)
console.log(`adjacentLu probe failures (degenerate ring or no containing block): ${probeFailed} (${(100*probeFailed/total).toFixed(1)}%)`)

// per-LU breakdown
const luGroups = new Map()
for (const r of rows) {
  const k = r.adjacentLu || '(none)'
  if (!luGroups.has(k)) luGroups.set(k, [])
  luGroups.get(k).push(r)
}
console.log(`\n--- by adjacent LU ---`)
console.log(`  ${'lu'.padEnd(16)} ${'n'.padStart(4)}  selfInt overshoots driftKey missTerm zeroBands`)
const luOrder = [...luGroups.keys()].sort((a,b) => luGroups.get(b).length - luGroups.get(a).length)
for (const lu of luOrder) {
  const g = luGroups.get(lu)
  const n = g.length
  const si = g.filter(r => r.selfInt === 1).length
  const ov = g.filter(r => r.overshootsRing === 1).length
  const dk = g.filter(r => r.blockKeyDrifted === 1).length
  const mt = g.filter(r => r.hasTerminalSidewalk === 0).length
  const zb = g.filter(r => r.zeroBands === 1).length
  console.log(`  ${lu.padEnd(16)} ${String(n).padStart(4)}  ${String(si).padStart(7)} ${String(ov).padStart(10)} ${String(dk).padStart(8)} ${String(mt).padStart(8)} ${String(zb).padStart(9)}`)
}

// park vs non-park comparison
const park = rows.filter(r => r.adjacentLu === 'park')
const nonPark = rows.filter(r => r.adjacentLu !== 'park' && r.adjacentLu)
function profile(label, g) {
  if (!g.length) return `${label}: (empty)`
  const pct = (n) => `${n} (${(100*n/g.length).toFixed(1)}%)`
  return `${label} n=${g.length}: selfInt=${pct(g.filter(r=>r.selfInt===1).length)} overshoot=${pct(g.filter(r=>r.overshootsRing===1).length)} driftKey=${pct(g.filter(r=>r.blockKeyDrifted===1).length)} missTerm=${pct(g.filter(r=>r.hasTerminalSidewalk===0).length)} zeroBands=${pct(g.filter(r=>r.zeroBands===1).length)}`
}
console.log(`\n--- park vs non-park ---`)
console.log(profile('park-adjacent  ', park))
console.log(profile('other-adjacent ', nonPark))

// straight-only drift focus
const straightWithLu = straight.filter(r => r.adjacentLu)
const straightPark = straight.filter(r => r.adjacentLu === 'park')
console.log(`\n--- straight-only drift (H1) ---`)
console.log(`  all straight  : ${straight.filter(r=>r.blockKeyDrifted===1).length}/${straight.length} drifted, ${straight.filter(r=>r.overshootsRing===1).length} overshoot`)
console.log(`  park straight : ${straightPark.filter(r=>r.blockKeyDrifted===1).length}/${straightPark.length} drifted, ${straightPark.filter(r=>r.overshootsRing===1).length} overshoot`)

// SELFINT totals (parity with prior scan)
const allRingsTotal = rows.reduce((acc, r) => acc + r.bandRingCount, 0)
const selfIntFbs = rows.filter(r => r.selfInt === 1)
console.log(`\n--- SELFINT (H2) ---`)
console.log(`  entries with SELFINT ring: ${selfIntFbs.length} (${(100*selfIntFbs.length/total).toFixed(1)}%) of ${total}`)
console.log(`  total band rings scanned (tl+sw, fb-grouped): ${allRingsTotal}`)
console.log(`  prior scan baseline (all-band-selfint-scan.js): 49`)

// worst offenders
const park10 = park
  .map(r => ({ r, flags: r.selfInt + (r.overshootsRing===1?1:0) + (r.blockKeyDrifted===1?1:0) + (r.zeroBands===1?1:0) + (r.hasTerminalSidewalk===0?1:0) }))
  .filter(o => o.flags > 0)
  .sort((a,b) => b.flags - a.flags)
  .slice(0, 10)
console.log(`\n--- park-adjacent worst offenders (top 10 by total flag count) ---`)
for (const o of park10) {
  const flags = []
  if (o.r.selfInt) flags.push('SELFINT')
  if (o.r.overshootsRing === 1) flags.push('overshoot')
  if (o.r.blockKeyDrifted === 1) flags.push('driftKey')
  if (o.r.zeroBands === 1) flags.push('zeroBands')
  if (o.r.hasTerminalSidewalk === 0) flags.push('missTerm')
  console.log(`  ${o.r.kind.padEnd(8)} chain="${o.r.chainName}" side=${o.r.side} blockKey=${o.r.blockKey} edgeOrd=${o.r.edgeOrd} segOrds=[${o.r.segOrds}] tl=${o.r.tlDepth} sw=${o.r.swDepth} → ${flags.join(',')}`)
}

// hypothesis ranking
console.log(`\n--- hypothesis evidence ---`)
console.log(`H1 (D.7a blockKey drift on straight): ${straight.filter(r=>r.blockKeyDrifted===1).length}/${straight.length} straight fes drifted; ${straight.filter(r=>r.overshootsRing===1).length} measurable overshoots among non-drifted (${straight.filter(r=>r.overshootsRing!=='').length} testable)`)
console.log(`H2 (SELFINT band rings):              ${selfIntFbs.length} entries carry self-intersecting rings`)
console.log(`H3 (per-LU treelawn no translucent):  GEOMETRY-INVISIBLE — testable by absence of H1/H2/H4 evidence + grep on BlockGeometryV2Debug.jsx (see report)`)
console.log(`H4 (missing band emission):           zero-bands=${rows.filter(r=>r.zeroBands===1).length} entries; missTerm=${rows.filter(r=>r.hasTerminalSidewalk===0).length} entries`)

console.log(`\nCSV written to scratch/lstrip-diagnose.csv (${rows.length} rows)`)
