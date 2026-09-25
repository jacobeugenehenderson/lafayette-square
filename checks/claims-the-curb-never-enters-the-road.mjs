#!/usr/bin/env node
// CLAIM — THE CURB NEVER ENTERS THE ROAD: no point of ② lies nearer a ① edge than that edge's own depth.
//
// ② is ① offset inward, each edge by its authored depth. So every point of ② is, by construction, at least
// that edge's depth from EVERY ① edge of its block — a point nearer than that is standing in the road.
// `RIBBONS §1` (2026-09-06): "self-intersection means the feature is GONE" — where a block is narrower than
// its two curbs, ② goes to ZERO there. What the code does instead (Plumb, 2026-09-24): the offset's
// self-union runs at pftNonZero, which fills winding −1, so the part of the offset that CROSSED ITSELF
// survives as a backwards lobe inside the road. huron's US 6 roundabout: the teardrop at a junction tip and
// the spiked wedge-island tips were this.
// ⛔ The survey-and-section gate cannot see it (it compares ② with itself); nothing else measured ② against ①.
//
// ASSERTS, per block ① hands to ② (outer + holes):
//   (1) every ② vertex keeps ≥ the depth of every ① edge;
//   (2) ② lies INSIDE its own ① block — an inward offset cannot leave it. (1) cannot see a band thrown far
//       from every edge; (2) can. Measured 2026-09-24: it happens at very acute ① vertices (6.7°, 8.1°,
//       11.3° on the worst blocks) — cause NOT established; the miter apex d/sin(θ/2) is the suspect.
//   · the depth is the one the offset ASKED FOR — `protoDepthByBlock`, recorded as `depthAt` is called,
//     never recomputed here (a `[start, end]` ramp is read as a ramp);
//   · where the nearest point of an edge is its END, the permitted depth is the smaller of the two edges
//     meeting there — the construction offsets a width step's vertex at their average;
//   · TOLERANCE, DECLARED FROM THE CONSTRUCTION: two Clipper grid steps (`SCALE`, read from tileGround.js).
// ⭐ Authored WIDTHS are loaded (the feed). The corner RADIUS is set to 0: the ease is a separate, authored
// rounding checked by its own gates, it runs after the union, and it cannot remove an overrun — so zero R
// leaves exactly the offset-and-union this claim is about, with no arc to tell apart from a lobe.
//
//   node checks/claims-the-curb-never-enters-the-road.mjs [scene…]
//   node checks/claims-the-curb-never-enters-the-road.mjs --selftest   (a real square block must be GREEN; the
//        same block with a ② vertex moved into the road, or a ② piece outside it, must be RED)
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import clipperLib from 'clipper-lib'
import { buildTileGround } from '../src/lib/tileGround.js'
import { feed, feedScenes } from '../scratch/_proto-feed.mjs'

const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
const SCALE = +src.match(/^const SCALE = (\d+)/m)?.[1]
if (!SCALE) { console.error('⛔ NOT CHECKED — SCALE not found in tileGround.js'); process.exit(2) }
const TOL = 2 / SCALE
const quiet = (f) => { const o = console.log, w = console.warn; console.log = console.warn = () => {}; try { return f() } finally { console.log = o; console.warn = w } }
const dAt = (d, end) => Array.isArray(d) ? (d[end] ?? 0) : (d ?? 0)

// → [{ p, need, got, edge }] — the ② vertices of one block nearer a ① edge than its depth
export function intrusions(rec) {
  // ⭐ each contour's ROAD SIDE: the outer ring's road lies inside it, a hole's outside it (it is dilated). An edge's
  // band is on that side ONLY — a street running INTO a block as a slit puts both its sides 2ε apart on one ring, each
  // with its own authored width, and a curb correctly at one side's width is not "in" the other side's road.
  const sa = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
  const contours = [{ ring: rec.ring, depth: rec.depth, hole: false }, ...(rec.holes || []).map(h => ({ ...h, hole: true }))]
  const E = []
  for (const c of contours) { const n = c.ring.length, left = (sa(c.ring) > 0) !== c.hole   // road side is to the LEFT of each edge
    for (let i = 0; i < n; i++) {
      const a = c.ring[i], b = c.ring[(i + 1) % n]
      // the depth the construction may place at each END: the smaller of the two edges meeting there
      const prev = c.depth[(i - 1 + n) % n], next = c.depth[(i + 1) % n]
      const pv = c.ring[(i - 1 + n) % n], nx = c.ring[(i + 2) % n]
      E.push({ a, b, left, pv, nx, dS: dAt(c.depth[i], 0), dE: dAt(c.depth[i], 1),
        endA: Math.min(dAt(c.depth[i], 0), dAt(prev, 1)), endB: Math.min(dAt(c.depth[i], 1), dAt(next, 0)) })
    }
  }
  const maxD = Math.max(0, ...E.map(e => Math.max(e.dS, e.dE)))
  const out = []
  for (const r of rec.curb || []) for (const p of r) {
    let worst = null
    for (const e of E) {
      if (Math.min(e.a[0], e.b[0]) - maxD > p[0] || Math.max(e.a[0], e.b[0]) + maxD < p[0] ||
          Math.min(e.a[1], e.b[1]) - maxD > p[1] || Math.max(e.a[1], e.b[1]) + maxD < p[1]) continue
      const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L2 = dx * dx + dy * dy
      const t = L2 ? ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / L2 : 0
      // the grid tolerance applies ALONG the edge too: a ② vertex on the perpendicular through an END (a width
      // step) has its foot at that end, not a grid step inside it
      const L = Math.sqrt(L2), atA = t * L <= TOL, atB = t * L >= L - TOL
      // one-sided: a foot inside the edge counts only on the edge's road side
      const onRoad = (u, w) => { const cr = (w[0] - u[0]) * (p[1] - u[1]) - (w[1] - u[1]) * (p[0] - u[0]); return (cr > 0) === e.left }
      if (!atA && !atB && t > 0 && t < 1) { if (!onRoad(e.a, e.b)) continue }
      // at a corner, on the road side of at least ONE of the two edges that meet there (both sides of a slit are not)
      else if ((atA || t <= 0) ? !(onRoad(e.a, e.b) || onRoad(e.pv, e.a)) : !(onRoad(e.a, e.b) || onRoad(e.b, e.nx))) continue
      const got = t <= 0 ? Math.hypot(p[0] - e.a[0], p[1] - e.a[1]) : t >= 1 ? Math.hypot(p[0] - e.b[0], p[1] - e.b[1])
        : Math.hypot(p[0] - e.a[0] - t * dx, p[1] - e.a[1] - t * dy)
      const need = atA ? e.endA : atB ? e.endB : e.dS + (e.dE - e.dS) * t
      if (got < need - TOL && (!worst || need - got > worst.need - worst.got)) worst = { p, need, got, edge: e }
    }
    if (worst) out.push(worst)
  }
  return out
}
// → m² of ② lying outside its own ① block (outer minus holes), pieces wider than the grid tolerance only
export function outside(rec) {
  if (!rec.curb?.length) return { area: 0, at: null }
  const toC = (r) => r.map(p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) }))
  const areaC = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.X * q.Y - q.X * p.Y } return Math.abs(a / 2) / SCALE / SCALE }
  const perim = (r) => r.reduce((a, p, i) => a + Math.hypot(r[(i + 1) % r.length].X - p.X, r[(i + 1) % r.length].Y - p.Y), 0) / SCALE
  const c = new clipperLib.Clipper()
  for (const r of rec.curb) if (r.length >= 3) c.AddPath(toC(r), clipperLib.PolyType.ptSubject, true)
  for (const r of [rec.ring, ...(rec.holes || []).map(h => h.ring)]) c.AddPath(toC(r), clipperLib.PolyType.ptClip, true)
  const o = []; c.Execute(clipperLib.ClipType.ctDifference, o, clipperLib.PolyFillType.pftNonZero, clipperLib.PolyFillType.pftEvenOdd)
  const big = o.filter(r => r.length >= 3 && 2 * areaC(r) / perim(r) > TOL)
  const w = big.sort((x, y) => areaC(y) - areaC(x))[0]
  return { area: big.reduce((a, r) => a + areaC(r), 0), at: w ? [w[0].X / SCALE, w[0].Y / SCALE] : null }
}
const build = (ribbons, o) => quiet(() => buildTileGround(ribbons, { grout: 'proto', protoProducer: true, smooth: 0, emitArtifact: true, cornerRadiusScale: 0, ...o }))

const MAIN = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (MAIN && process.argv.includes('--selftest')) {
  // ⭐ THE INSTRUMENT IS MUTATION-TESTED, NOT THE CONSTRUCTION: a real square block must be green, and the
  // same block with one ② vertex moved INTO the road, or with a ② piece placed OUTSIDE it, must be red.
  const m = { left: { pavementHW: 4, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' }, right: { pavementHW: 4, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' } }
  const line = (id, ...pts) => ({ skelId: id, name: id, highway: 'residential', oneway: false, points: pts, measure: m, gradeSeparated: false })
  const W = [line('w', [-100, -200], [-100, 200]), line('e', [100, -200], [100, 200])]
  const square = [...W, line('n', [-200, -100], [200, -100]), line('s', [-200, 100], [200, 100])]
  // and the two shapes the defect was found on — reported, so the construction's state is visible here too
  const neck = [...W, line('n', [-200, -30], [-100, -30], [0, -3], [100, -30], [200, -30]), line('s', [-200, 30], [-100, 30], [0, 3], [100, 30], [200, 30])]
  const t6 = Math.tan(6 * Math.PI / 180)
  const sliver = [line('a', [-300, 0], [300, 0]), line('b', [-300, -300 * t6], [300, 300 * t6]), line('c', [40, -300], [40, 300]), line('d', [-240, -300], [-240, 300])]
  const recs = (streets) => Object.values(build({ streets }, { curbWidth: 0.1524 }).protoDepthByBlock || {})
  const B = recs(square).filter(r => r.curb?.length)
  if (!B.length) { console.log('⛔ SELFTEST could not build a synthetic ① block (no protoDepthByBlock)'); process.exit(2) }
  const rec = B.sort((x, y) => Math.abs(y.curb[0].length) - Math.abs(x.curb[0].length))[0]
  const clean = intrusions(rec).length + (outside(rec).area > 0 ? 1 : 0)
  const C = rec.curb[0], cx = C.reduce((s, p) => s + p[0], 0) / C.length, cz = C.reduce((s, p) => s + p[1], 0) / C.length
  const mid = rec.ring.reduce((s, p) => [s[0] + p[0] / rec.ring.length, s[1] + p[1] / rec.ring.length], [0, 0])
  // (1) mutant: the ② vertex nearest ① pushed halfway to it — standing in the road
  const k = C.map((p, i) => [i, Math.hypot(p[0] - cx, p[1] - cz)]).sort((x, y) => y[1] - x[1])[0][0]
  const R0 = rec.ring[rec.ring.map((q, i) => [i, Math.hypot(q[0] - C[k][0], q[1] - C[k][1])]).sort((x, y) => x[1] - y[1])[0][0]]
  const road = { ...rec, curb: [C.map((p, i) => i === k ? [(p[0] + R0[0]) / 2, (p[1] + R0[1]) / 2] : p)] }
  // (2) mutant: a 2 m square of ② beyond the block's far corner
  const far = rec.ring.map(q => [q, Math.hypot(q[0] - mid[0], q[1] - mid[1])]).sort((x, y) => y[1] - x[1])[0][0]
  const ox = far[0] + Math.sign(far[0] - mid[0]) * 3, oz = far[1] + Math.sign(far[1] - mid[1]) * 3
  const out = { ...rec, curb: [...rec.curb, [[ox, oz], [ox + 2, oz], [ox + 2, oz + 2], [ox, oz + 2]]] }
  const r1 = intrusions(road).length, r2 = outside(out).area
  console.log(`selftest: square block → ${clean ? `⛔ ${clean} finding(s) on a clean block` : '✅ clear'}`)
  console.log(`selftest: a ② vertex moved into the road → ${r1 ? `✅ red (${r1})` : '⛔ still green — (1) is blind'}`)
  console.log(`selftest: a ② piece outside its block → ${r2 > 0 ? `✅ red (${r2.toFixed(1)} m²)` : '⛔ still green — (2) is blind'}`)
  const nk = recs(neck), sl = recs(sliver)
  console.log(`   (construction, reported) necked block: ${nk.reduce((a, r) => a + intrusions(r).length, 0)} in the road · 6° sliver: ${sl.reduce((a, r) => a + outside(r).area, 0).toFixed(1)} m² outside`)
  process.exit(!clean && r1 > 0 && r2 > 0 ? 0 : 1)
}

const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
let red = false
for (const scene of (MAIN ? (named.length ? named : feedScenes()) : [])) {
  const f = feed(scene); if (!f) { red = true; continue }
  const tg = build(f.ribbons, { curbWidth: f.curbWidth ?? 0, blockCustoms: f.blockCustoms })
  const blocks = Object.entries(tg.protoDepthByBlock || {})
  if (!blocks.length) { console.log(`── ${scene}   ⛔ NOT CHECKED — the build recorded no ② depths (no ① producer?)`); red = true; continue }
  const O = tg.protoOwners || [], rows = []
  let nV = 0, nB = 0, nO = 0, aO = 0; const outRows = []
  for (const [k, rec] of blocks) {
    const o = outside(rec); if (o.area > 0) { nO++; aO += o.area; outRows.push({ k, ...o }) }
    const hits = intrusions(rec); if (!hits.length) continue
    nB++; nV += hits.length
    const w = hits.sort((x, y) => (y.need - y.got) - (x.need - x.got))[0]
    rows.push({ k, n: hits.length, w })
  }
  console.log(`── ${scene} ── ${blocks.length} block(s) · (1) ${nB} with ② inside the road · ${nV} vertex(es) ${nB ? '⛔' : '✅'}${f.curbWidth == null ? '  (no authored curbWidth — irrelevant to ②)' : ''}`)
  for (const r of rows.sort((x, y) => (y.w.need - y.w.got) - (x.w.need - x.w.got)).slice(0, 10))
    console.log(`   ⛔ block ${r.k}: ${r.n} vertex(es) — worst ${(r.w.need - r.w.got).toFixed(2)} m into the road at (${r.w.p[0].toFixed(1)}, ${r.w.p[1].toFixed(1)}) (depth ${r.w.need.toFixed(2)}, got ${r.w.got.toFixed(2)})`)
  console.log(`   (2) ${nO} block(s) whose ② leaves its own ① block · ${aO.toFixed(1)} m² ${nO ? '⛔' : '✅'}`)
  for (const r of outRows.sort((x, y) => y.area - x.area).slice(0, 5)) console.log(`   ⛔ block ${r.k}: ${r.area.toFixed(1)} m² outside, near (${r.at[0].toFixed(1)}, ${r.at[1].toFixed(1)})`)
  if (nB || nO) red = true
}
if (MAIN) console.log(red ? '\n⛔ Some curb stands in the road — where the offset crossed itself it must go to zero, not survive backwards.' : '\n✅ No curb enters the road.')
if (MAIN) process.exit(red ? 1 : 0)
