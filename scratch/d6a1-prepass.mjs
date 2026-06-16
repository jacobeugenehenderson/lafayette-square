// D6a.1 — buildCorridorOuterStrokes pre-pass (uniform stroke). Verify the rings
// are parallel to the welded chains at the outer pavementHW, continuous through
// the transition node. Uses the REAL strokeOpen primitive (clipper-lib, copied
// byte-for-byte from tileGround.js:223). Gate: ring boundary ≈ hw from chain.
import fs from 'fs'
import clipperLib from 'clipper-lib'

const SCALE = 1000
const toClipper = (p) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromClipper = (p) => [p.X / SCALE, p.Y / SCALE]
function strokeOpen(polyline, delta) {                       // === tileGround.js:223 ===
  if (!(delta > 1e-9) || !polyline || polyline.length < 2) return []
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)
  co.AddPath(polyline.map(toClipper), JoinType.jtRound, EndType.etOpenButt)
  const out = []
  co.Execute(out, delta * SCALE)
  return out.map(p => p.map(fromClipper))
}
function signedArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 } return a / 2 }
function ringBBox(r) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y } return [x0, y0, x1, y1] }

// ── THE PRE-PASS (candidate for tileGround.js) ─────────────────────────────
// Pure: (streets, measures, opts) → { rings, boxes, byCorridor }. No closure on
// per-frame opts. Welds each divided carriageway to its spine continuation and
// strokes the welded line UNIFORMLY at the carriageway's outer pavementHW.
function buildCorridorOuterStrokes(streets, measures, opts = {}) {
  const boxRadius = Number.isFinite(opts.boxRadius) ? opts.boxRadius : 14
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3
  const byId = new Map()
  streets.forEach((s, i) => { if (s?.skelId) byId.set(s.skelId, i) })
  const rings = [], boxes = [], byCorridor = new Map()

  for (let i = 0; i < streets.length; i++) {
    const s = streets[i]
    const ph = s?.phase
    if (!ph || !/^carriageway/.test(ph.role || '')) continue
    if (!ph.spineAtStart && !ph.spineAtEnd) continue
    let pts = s.points.map(p => [p[0], p[1]])
    const nodes = []
    // spineAtStart → spine continues before pts[0]
    if (ph.spineAtStart != null && byId.has(ph.spineAtStart)) {
      const node = pts[0]
      let sp = streets[byId.get(ph.spineAtStart)].points.map(p => [p[0], p[1]])
      if (same(sp[sp.length - 1], node)) {/* ok */}
      else if (same(sp[0], node)) sp.reverse()
      else sp = null
      if (sp) { nodes.push(node); pts = [...sp.slice(0, -1), ...pts] }
    }
    // spineAtEnd → spine continues after the last point
    if (ph.spineAtEnd != null && byId.has(ph.spineAtEnd)) {
      const node = pts[pts.length - 1]
      let sp = streets[byId.get(ph.spineAtEnd)].points.map(p => [p[0], p[1]])
      if (same(sp[0], node)) {/* ok */}
      else if (same(sp[sp.length - 1], node)) sp.reverse()
      else sp = null
      if (sp) { nodes.push(node); pts = [...pts, ...sp.slice(1)] }
    }
    if (!nodes.length) continue                              // fallback: nothing welded → no stroke (never worse than today)
    const m = measures[i]
    const inboard = s.innerSign === +1 ? 'right' : 'left'    // mirror effectiveMeasure
    const outboard = inboard === 'left' ? 'right' : 'left'
    const hw = m?.[outboard]?.pavementHW
    if (!(hw > 0.01)) continue                               // no outer pavement → nothing to stroke
    const strk = strokeOpen(pts, hw)                         // two-sided; tile intersect discards the median half (D6a.2)
    for (const r of strk) if (r.length >= 3) rings.push(r)
    for (const node of nodes) boxes.push({ c: node, r: boxRadius })
    const key = ph.pairKey || s.skelId
    if (!byCorridor.has(key)) byCorridor.set(key, [])
    byCorridor.get(key).push({ streetIdx: i, welded: pts, hw, outboard, nodes, ringCount: strk.length })
  }
  return { rings, boxes, byCorridor }
}

// ── VERIFY ─────────────────────────────────────────────────────────────────
const r = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const streets = (r.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
// mirror effectiveMeasure (tileGround.js:438) so the outer pavementHW matches live
function effectiveMeasure(s) {
  const m = s?.measure
  if (!m || s.anchor !== 'inner-edge' || !s.innerSign) return m
  const inboard = s.innerSign === +1 ? 'right' : 'left'
  const outboard = inboard === 'left' ? 'right' : 'left'
  let inb = m[inboard] || {}, out = m[outboard] || {}
  if (!(out.pavementHW > 0) && inb.pavementHW > 0) { const t = out; out = inb; inb = t }
  return { ...m, [outboard]: out, [inboard]: { ...inb, treelawn: 0, sidewalk: 0 } }
}
const measures = streets.map(effectiveMeasure)

const { rings, boxes, byCorridor } = buildCorridorOuterStrokes(streets, measures)
console.log(`pre-pass produced ${rings.length} stroke ring(s), ${boxes.length} transition box(es), ${byCorridor.size} corridor(s)\n`)

// distance from a point to a polyline
function distToPoly(pt, P) { let best = 1e9; for (let i = 0; i < P.length - 1; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1]; const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy || 1; let t = ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / L2; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(pt[0] - (ax + t * dx), pt[1] - (ay + t * dy))) } return best }

for (const [key, members] of byCorridor) {
  console.log(`corridor ${key}:`)
  for (const mem of members) {
    const s = streets[mem.streetIdx]
    // verify: every ring vertex of THIS carriageway's strokes is ≈ hw from its welded chain
    // (re-stroke this member alone so the rings map 1:1 to its chain)
    const strk = strokeOpen(mem.welded, mem.hw)
    let mn = 1e9, mx = -1e9, sum = 0, n = 0
    for (const ring of strk) for (const v of ring) { const d = distToPoly(v, mem.welded); mn = Math.min(mn, d); mx = Math.max(mx, d); sum += d; n++ }
    const dev = Math.max(Math.abs(mx - mem.hw), Math.abs(mn - mem.hw))
    console.log(`  ${s.skelId} (${s.phase.role}): hw=${mem.hw.toFixed(2)}  outboard=${mem.outboard}  welded ${mem.welded.length}pt → ${mem.ringCount} ring(s)`)
    console.log(`     boundary dist to chain: min ${mn.toFixed(2)} / mean ${(sum/n).toFixed(2)} / max ${mx.toFixed(2)}  →  max deviation from hw = ${dev.toFixed(2)}m  ${dev < 0.15 ? 'OK (parallel)' : '⚠ deviates'}`)
    console.log(`     nodes: ${mem.nodes.map(nd => `[${nd[0].toFixed(1)},${nd[1].toFixed(1)}]`).join(' ')}`)
  }
}
