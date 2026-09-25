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
//   node checks/claims-the-curb-never-enters-the-road.mjs --selftest   (a square block must be GREEN; a block
//        that necks narrower than its two curbs must be RED — seen to work both ways)
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
  const contours = [{ ring: rec.ring, depth: rec.depth }, ...(rec.holes || [])]
  const E = []
  for (const c of contours) { const n = c.ring.length
    for (let i = 0; i < n; i++) {
      const a = c.ring[i], b = c.ring[(i + 1) % n]
      // the depth the construction may place at each END: the smaller of the two edges meeting there
      const prev = c.depth[(i - 1 + n) % n], next = c.depth[(i + 1) % n]
      E.push({ a, b, dS: dAt(c.depth[i], 0), dE: dAt(c.depth[i], 1),
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
      const got = t <= 0 ? Math.hypot(p[0] - e.a[0], p[1] - e.a[1]) : t >= 1 ? Math.hypot(p[0] - e.b[0], p[1] - e.b[1])
        : Math.hypot(p[0] - e.a[0] - t * dx, p[1] - e.a[1] - t * dy)
      const need = t <= 0 ? e.endA : t >= 1 ? e.endB : e.dS + (e.dE - e.dS) * t
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
  const m = { left: { pavementHW: 4, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' }, right: { pavementHW: 4, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk' } }
  const line = (id, ...pts) => ({ skelId: id, name: id, highway: 'residential', oneway: false, points: pts, measure: m, gradeSeparated: false })
  const W = [line('w', [-100, -200], [-100, 200]), line('e', [100, -200], [100, 200])]
  const square = [...W, line('n', [-200, -100], [200, -100]), line('s', [-200, 100], [200, 100])]
  // a block that NECKS to 6 m between two 4 m half-width streets — its curbs cross there, so ② must go to zero
  const neck = [...W, line('n', [-200, -30], [-100, -30], [0, -3], [100, -30], [200, -30]), line('s', [-200, 30], [-100, 30], [0, 3], [100, 30], [200, 30])]
  // a 6° sliver between two 4 m streets, closed where it is 4.2 m wide — narrower than its two curbs, so ②
  // must go to ZERO; the same sliver closed at 10.5 m wide is clean (measured 2026-09-24)
  const t6 = Math.tan(6 * Math.PI / 180)
  const sliver = [line('a', [-300, 0], [300, 0]), line('b', [-300, -300 * t6], [300, 300 * t6]), line('c', [40, -300], [40, 300]), line('d', [-240, -300], [-240, 300])]
  const count = (streets) => { const tg = build({ streets }, { curbWidth: 0.1524 }); const B = Object.values(tg.protoDepthByBlock || {})
    return B.length ? { road: B.reduce((s, rec) => s + intrusions(rec).length, 0), out: B.reduce((s, rec) => s + outside(rec).area, 0) } : null }
  const sq = count(square), nk = count(neck), sl = count(sliver)
  if (!sq || !nk || !sl) { console.log('⛔ SELFTEST could not build a synthetic ① block (no protoDepthByBlock)'); process.exit(2) }
  console.log(`selftest: square block → ${sq.road || sq.out > 0 ? `⛔ ${sq.road} in the road, ${sq.out.toFixed(2)} m² outside` : '✅ clear'}`)
  console.log(`selftest: necked block → ${nk.road ? `✅ red (${nk.road} vertex(es) in the road)` : '⛔ still green — (1) is blind'}`)
  console.log(`selftest: 6° sliver → ${sl.out > 0 ? `✅ red (${sl.out.toFixed(1)} m² of ② outside its block)` : '⛔ still green — (2) is blind'}`)
  process.exit(!sq.road && !(sq.out > 0) && nk.road > 0 && sl.out > 0 ? 0 : 1)
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
