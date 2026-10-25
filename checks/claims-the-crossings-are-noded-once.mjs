#!/usr/bin/env node
// CLAIM — CROSSINGS ARE NODED ONCE, BY ONE HOME, AND THE NODING ENDS. Rings that only overlap (a tile's contours and the
// land-use evidence at the stamp; later the kerb creases and the partition) meet at crossings no ring carries. The one home
// is src/lib/latticeNode.js#nodeCrossings: snap rounding by hot pixels, one pass, never re-intersected.
// ⭐ FOUND 2026-10-25 (Splice): the stamp's own round-then-retest loop (tileGround.js#stampCrossings, deleted) did not
// settle on PTown's shore (OSM wetland / nature reserve crossing the water edge at 2.7–18°, Zob), and refused the pour.
// ASSERTS, file only, on fixtures (checks/fixtures/):
//   (a) the PTown capture (the stamp's input when it refused): the new rule settles; the FROZEN old rule still refuses it
//       (checks/fixtures/stamp-crossings-frozen-9764b474.mjs, the class's mutant)
//   (b) the same, minimised to the smallest set on which the old rule refuses
//   (c) on every fixture's output, computed HERE, never by the function judged: no proper crossing left between two rings
//       that may meet · every output vertex is an input vertex or a crossing point · every ring is the oracle's own routing
//       of it (every segment through every hot pixel it enters: honouring is universal), antennas removed
//   (d) the API fits the kerb crease cutter: a crease cell crossing two faces that share an edge, at a shallow angle, with
//       the T-join step: settles, and both faces carry the same points on the shared edge
//   (e) a hot pixel two segments of different pairs both pass through: both carry it
//   (f) exact at any extent: a PTown-length frame side and a 178 km near-parallel pair both settle (no extent refusal)
//   (g) no antenna: a reversal within a pixel, routed through its own vertices, comes out monotone at every rotation (one
//       antenna counted, the input vertex it took reported); a self-touch survives whole; an input retrace keeps the first
//       A's src with the second A's edge and reports the rest dropped
//   (h) OPEN PATHS (a centreline; BRIEF-the-ink-is-owned-by-its-labels §3.1, Zob's read): an open path crossing a ring is
//       noded on both with the crossing shared; it gains no closing segment; a path ENDING in A,B,A keeps its extent (the
//       return dropped and reported, the path still reaching B); an out-and-back keeps its far end; a near-miss T (a stem ending
//       on another path's interior, no shared vertex) routes the through path through the stem's end. MUTANT: the
//       out-and-back fed as a closed ring collapses (refused), so the open rule is what keeps it.
// MUTANTS (always run): each Number/BigInt switch forced to Number on a constructed long input must be wrong (crossOf
// misses a crossing; entersPixel enters a square the segment misses; alongOf ties two pixels 3 apart) and the live path
// right, judged by the oracle; exact ties must round half-up; the function's own verification (verifyNoded) must refuse planted bad outputs (the input un-noded; an invented
// vertex; an antenna), and nodeCrossings' body must call it before returning (read); the frozen old rule must refuse (a), (b).
//   node checks/claims-the-crossings-are-noded-once.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeCrossings, verifyNoded, crossOf, entersPixel, alongOf } from '../src/lib/latticeNode.js'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { stampCrossings as frozen } from './fixtures/stamp-crossings-frozen-9764b474.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url)), FX = join(HERE, 'fixtures')
const k = (p) => [Math.round(p[0] * CLIP_SCALE), Math.round(p[1] * CLIP_SCALE)]
let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }

// ── the independent oracle: crossings, hot pixels and honouring, recomputed from the input ─────────────────────────────
// ALL BigInt, no switch: exact at any extent, so it judges the producer's two paths alike; the point rounds half-up
const I = BigInt
function crossesProperly(a, b, c, d) {
  const rx = I(b[0] - a[0]), ry = I(b[1] - a[1]), sx = I(d[0] - c[0]), sy = I(d[1] - c[1]), ex = I(c[0] - a[0]), ey = I(c[1] - a[1])
  let den = rx * sy - ry * sx, tn = ex * sy - ey * sx, un = ex * ry - ey * rx
  if (!den) return null
  if (den < 0n) { den = -den; tn = -tn; un = -un }
  if (!(tn > 0n && tn < den && un > 0n && un < den)) return null
  const half = (n) => { const q = 2n * n + den, e = 2n * den; return Number(q >= 0n ? q / e : -((-q + e - 1n) / e)) }
  return [half(I(a[0]) * den + rx * tn), half(I(a[1]) * den + ry * tn)]
}
const segsOf = (K) => K.flatMap((r, ri) => r.map((a, i) => ({ ri, a, b: r[(i + 1) % r.length] })))
const pairsOf = (S, pairs) => { const out = []; for (let u = 0; u < S.length; u++) for (let w = u + 1; w < S.length; w++) {
  const s = S[u], t = S[w]; if (s.ri === t.ri || !pairs(s.ri, t.ri)) continue
  if (Math.max(s.a[0], s.b[0]) < Math.min(t.a[0], t.b[0]) || Math.max(t.a[0], t.b[0]) < Math.min(s.a[0], s.b[0])) continue
  if (Math.max(s.a[1], s.b[1]) < Math.min(t.a[1], t.b[1]) || Math.max(t.a[1], t.b[1]) < Math.min(s.a[1], s.b[1])) continue
  out.push([s, t]) } return out }
const entersSquare = (a, b, X, Y) => { const ax = 2 * a[0], ay = 2 * a[1], bx = 2 * b[0], by = 2 * b[1], x0 = 2 * X - 1, x1 = 2 * X + 1, y0 = 2 * Y - 1, y1 = 2 * Y + 1
  if (Math.max(ax, bx) < x0 || Math.min(ax, bx) >= x1 || Math.max(ay, by) < y0 || Math.min(ay, by) >= y1) return false
  const dx = I(bx - ax), dy = I(by - ay), f = (x, y) => dx * I(y - ay) - dy * I(x - ax), v = [f(x0, y0), f(x1, y0), f(x0, y1), f(x1, y1)]
  return v.some(w => w <= 0n) && v.some(w => w >= 0n) }
function oracle(inRings, outRings, pairs) {
  const Kin = inRings.map(r => r.map(k)), hot = new Set(Kin.flat().map(q => q.join(',')))
  for (const [s, t] of pairsOf(segsOf(Kin), pairs)) { const X = crossesProperly(s.a, s.b, t.a, t.b); if (X) hot.add(X.join(',')) }
  const Kout = outRings.map(o => o.map(v => v.k))
  const invented = Kout.flat().filter(q => !hot.has(q.join(','))).length
  let left = 0; for (const [s, t] of pairsOf(segsOf(Kout), pairs)) if (crossesProperly(s.a, s.b, t.a, t.b)) left++
  // honouring, judged as a WHOLE RING: the oracle routes every INPUT segment through every hot pixel whose square it enters
  // (in order along it, exact), drops repeats and then removes antennas A,B,A by its own rule (rescan to none, never the
  // producer's stack), and the output must be that ring, cyclically. `skipped` counts the rings that are not.
  const H = [...hot].map(s => s.split(',').map(Number)); let skipped = 0
  Kin.forEach((r, ri) => { let e = []
    r.forEach((a, i) => { const b = r[(i + 1) % r.length]; e.push(a)
      const via = []
      for (const [X, Y] of H) { if ((X === a[0] && Y === a[1]) || (X === b[0] && Y === b[1])) continue
        if (Math.max(a[0], b[0]) + 1 < X || Math.min(a[0], b[0]) - 1 > X || Math.max(a[1], b[1]) + 1 < Y || Math.min(a[1], b[1]) - 1 > Y) continue
        if (entersSquare(a, b, X, Y)) via.push({ q: [X, Y], t: I(X - a[0]) * I(b[0] - a[0]) + I(Y - a[1]) * I(b[1] - a[1]) }) }
      via.sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0)).forEach(v => e.push(v.q)) })
    const eq = (u, w) => u[0] === w[0] && u[1] === w[1]
    for (let again = true; again && e.length >= 3;) { again = false
      for (let n = 0; n < e.length && e.length >= 3; n++) { const m = e.length, u = e[(n - 1 + m) % m], v = e[n], w = e[(n + 1) % m]
        if (eq(v, w)) { e.splice(n, 1); again = true; break }
        if (eq(u, w)) { e = e.filter((_, j) => j !== n && j !== (n + 1) % m); again = true; break } } }
    const o = outRings[ri].map(v => v.k), key = (x) => x.join(','), oo = o.map(key).join(';')
    const same = o.length === e.length && e.some((_, s0) => e.map((_, j) => key(e[(s0 + j) % e.length])).join(';') === oo)
    if (!same) skipped++ })
  return { invented, left, skipped, hot: hot.size }
}
// a pair no double can judge: |r| ≈ 2^27.4 units, den = 2 exactly (constructed by extended gcd; t crosses s at its midpoint)
const LONG = { s: { a: [0, 0], b: [177916448, 186387159] }, t: { a: [39126151, 40988971], b: [138790297, 145398188] } }
const stampPairs = (items) => (a, b) => (items[a].kind === 'ev') !== (items[b].kind === 'ev')
const run = (items, pairs, opts = {}) => { try { return { R: nodeCrossings(items.map(x => ({ p: x.r, tag: x.kind })), { pairs, who: 'check', ...opts }) } } catch (e) { return { err: e.message } } }
const oldRefuses = (items) => { try { frozen(items.map(x => x.r), (a, b) => (items[a].kind === 'ev') === (items[b].kind === 'ev')); return false } catch (e) { return /did not settle/.test(e.message) } }

// (a) + (b): the PTown capture, whole and minimised
for (const [name, file] of [['(a) PTown capture', 'ptown-stamp-crossings.json'], ['(b) PTown, minimised', 'ptown-stamp-crossings-min.json']]) {
  const p = join(FX, file)
  if (!existsSync(p)) { row(false, `${name}: NOT CHECKED — ${file} is missing`); continue }
  const items = JSON.parse(readFileSync(p, 'utf8')).items, pairs = stampPairs(items), r = run(items, pairs), was = oldRefuses(items)
  row(was, `${name}: the frozen round-then-retest rule refuses it (the class): ${was}`)
  if (r.err) { row(false, `${name}: nodeCrossings REFUSED — ${r.err}`); continue }
  const o = oracle(items.map(x => x.r), r.R, pairs)
  row(!o.left && !o.invented && !o.skipped, `${name}: settles · ${items.length} rings · ${r.R.crossings} crossings, ${o.hot} hot pixels · left crossing ${o.left} · invented ${o.invented} · rings unlike the oracle's routing ${o.skipped}`)
}
// (d) the API fit for the kerb crease cutter: two faces sharing x = 10, a thin crease cell crossing both at ~1.1°
{
  const F1 = [[0, 0], [10, 0], [10, 10], [0, 10]], F2 = [[10, 0], [20, 0], [20, 10], [10, 10]]
  const C = [[-1, 4.8], [21, 5.2], [21, 5.203], [-1, 4.803]]
  const items = [{ kind: 'partition', r: F1 }, { kind: 'partition', r: F2 }, { kind: 'cell', r: C }]
  const pairs = (a, b) => a !== b && (items[a].kind === 'cell' || items[b].kind === 'cell')
  const r = run(items, pairs, { tjoin: true })
  if (r.err) row(false, `(d) crease × partition (API fit): nodeCrossings REFUSED — ${r.err}`)
  else { const on = (o) => o.filter(v => v.k[0] === 10 * CLIP_SCALE && v.k[1] > 0 && v.k[1] < 10 * CLIP_SCALE).map(v => v.k[1]).sort((x, y) => x - y).join(',')
    const o = oracle(items.map(x => x.r), r.R, pairs), same = on(r.R[0]) === on(r.R[1]) && on(r.R[0]).length > 0
    row(!o.left && !o.invented && same, `(d) crease × partition (API fit, t-join on): settles · the shared edge carries the same points on both faces (${on(r.R[0])}) : ${same} · left ${o.left} · invented ${o.invented}`) }
}
// (e) universal honouring: a contour C and an evidence ring B both pass within half a step of an evidence vertex v of A;
// A × B is not a pair that meets, so only universal honouring routes B through v
{
  const A = [[5, 5], [5, 8], [3, 8]], Cc = [[0, 0.0003], [10, 10.0003], [10, 12], [0, 12]].map(([x, y]) => [x, Math.round(y * 1000) / 1000])
  const B = [[0, -0.0004], [10, 9.9996], [12, 9], [2, -1]].map(([x, y]) => [x, Math.round(y * 1000) / 1000])
  const items = [{ kind: 'ev', r: A }, { kind: 'full', r: Cc }, { kind: 'ev', r: B }], pairs = stampPairs(items), r = run(items, pairs)
  if (r.err) row(false, `(e) universal honouring: nodeCrossings REFUSED — ${r.err}`)
  else { const has = (o) => o.some(v => v.k[0] === 5000 && v.k[1] === 5000), o = oracle(items.map(x => x.r), r.R, pairs)
    row(has(r.R[1]) && has(r.R[2]) && !o.skipped && !o.left, `(e) universal honouring: the contour carries v ${has(r.R[1])} · the evidence ring that may not meet v's ring carries v ${has(r.R[2])} · skipped ${o.skipped} · left ${o.left}`) }
}
// (f) EXACT AT ANY EXTENT: PTown's frame side (17,662.32 m on one segment, past the 2^24-unit guard that refused it) crossed by
// an evidence ring at a shallow angle, and the constructed pair below as rings: both settle, judged by the BigInt oracle
{
  const side = [[-8830.568, -8831.16], [-8830.568, 8831.16], [-8000, 8831.16], [-8000, -8831.16]]
  const ev = [[-8840, -3000], [-8820, 6000], [-8820.005, 6000.01]]
  for (const [name, items] of [['PTown-length frame side', [{ kind: 'full', r: side }, { kind: 'ev', r: ev }]],
    ['the near-parallel 178 km pair', [{ kind: 'full', r: [LONG.s.a, LONG.s.b, [LONG.s.b[0], 0]].map(q => q.map(v => v / CLIP_SCALE)) }, { kind: 'ev', r: [LONG.t.a, LONG.t.b, [LONG.t.b[0] + 7, LONG.t.b[1] - 3]].map(q => q.map(v => v / CLIP_SCALE)) }]]]) {
    const pairs = stampPairs(items), r = run(items, pairs)
    if (r.err) { row(false, `(f) ${name}: nodeCrossings REFUSED — ${r.err}`); continue }
    const o = oracle(items.map(x => x.r), r.R, pairs)
    row(r.R.crossings > 0 && !o.left && !o.invented && !o.skipped, `(f) ${name}: settles · ${r.R.crossings} crossing(s) · left ${o.left} · invented ${o.invented} · skipped ${o.skipped}`) }
}
// MUTANTS of the arithmetic (Zob's ruling): (a) a pair past 2^25 whose crossing only exact arithmetic sees (den = 2, products
// near 2^55), with the producer's switch forced to Number: it must disagree with the oracle, and the live path must not;
// (b) exact ties: the point rounds half-up (⌊v + ½⌋), on both signs and on the long pair (whose y is …579.5)
{
  const truth = crossesProperly(LONG.s.a, LONG.s.b, LONG.t.a, LONG.t.b), live = crossOf(LONG.s, LONG.t), forced = crossOf(LONG.s, LONG.t, true)
  const eq = (p, q) => (p && q ? p[0] === q[0] && p[1] === q[1] : p === q)
  row(truth && eq(live, truth) && !eq(forced, truth), `mutant (a): the 178 km near-parallel pair: oracle ${JSON.stringify(truth)} · live ${JSON.stringify(live)} · forced to Number ${JSON.stringify(forced)} (must differ)`)
  const ties = [[[0, 0], [2, 1], [1, 0], [1, 2], [1, 1]], [[0, 0], [-2, -1], [-1, 0], [-1, -2], [-1, 0]], [LONG.s.a, LONG.s.b, LONG.t.a, LONG.t.b, [88958224, 93193580]]]
  const got = ties.map(([a, b, c, d, want]) => ({ want, p: crossOf({ a, b }, { a: c, b: d }), o: crossesProperly(a, b, c, d) }))
  row(got.every(g => eq(g.p, g.want) && eq(g.o, g.want)), `mutant (b): exact ties round half-up: ${got.map(g => `${JSON.stringify(g.p)} (want ${JSON.stringify(g.want)})`).join(' · ')}`)
}
// (c) and (d) of the same: entersPixel (a pixel whose nearest corner lies a hair off a 2^27-unit line: f = 2 exactly,
// products near 2^56) and alongOf (a shallow 2^28-unit segment entering two pixels of one column, numerators 3 apart near 2^55)
{
  const s = { a: [0, 0], b: [151525005, 154181984] }, h = { X: 85037280, Y: 86528403 }, truth = entersSquare(s.a, s.b, h.X, h.Y)
  const live = entersPixel(s, h), forced = entersPixel(s, h, true)
  row(live === truth && forced !== truth, `mutant (c): entersPixel on a 2^27-unit line: oracle ${truth} · live ${live} · forced to Number ${forced} (must differ)`)
  const t = { a: [0, 0], b: [268435457, 3] }, h1 = { X: 223696214, Y: 2 }, h2 = { X: 223696214, Y: 3 }
  const exact = (q) => I(q.X) * I(t.b[0]) + I(q.Y) * I(t.b[1]), want = exact(h1) < exact(h2)
  const both = entersSquare(t.a, t.b, h1.X, h1.Y) && entersSquare(t.a, t.b, h2.X, h2.Y)
  const l = alongOf(t, h1) < alongOf(t, h2), f = alongOf(t, h1, true) < alongOf(t, h2, true)
  row(both && want && l && !f, `mutant (d): alongOf, two pixels of one column both entered (${both}): oracle orders them ${want} · live ${l} · forced to Number ${f} (must differ)`)
}
// (g) NO ANTENNA: HPDM tile 144's 2 mm reversal (x −621.601 → −621.599 → −621.603), which routing through the ring's own
// vertices turned into the retrace A,B,A,B (2026-10-25). At every rotation of the ring (the seam): the output has no
// retrace, the reversal reads monotone, one antenna is counted and the input vertex it took is reported. A self-touch
// (A…loop…A, area between) survives whole.
{
  const z = [[-619.047, -94.707], [-621.601, -94.336], [-621.599, -94.336], [-621.603, -94.335], [-626.14, -93.83], [-626, -80], [-619, -80]]
  const far = [[0, 0], [1, 0], [1, 1]], retrace = (o) => o.some((v, n) => { const u = o[(n - 1 + o.length) % o.length].k, w = o[(n + 1) % o.length].k; return u[0] === w[0] && u[1] === w[1] })
  const res = z.map((_, r) => { const items = [{ kind: 'full', r: [...z.slice(r), ...z.slice(0, r)] }, { kind: 'ev', r: far }], x = run(items, stampPairs(items))
    if (x.err) return { err: x.err }
    const o = x.R[0], i = o.findIndex(v => v.k[0] === -619047), seq = [1, 2, 3].map(d => o[(i + d) % o.length].k[0])
    return { ok: !retrace(o) && seq.join() === '-621599,-621601,-621603' && x.R.counts['full ✂ antenna'] === 1 && x.R.dropped[0].length === 1, seq } })
  row(res.every(r => r.ok), `(g) no antenna: the 2 mm reversal at every rotation (${res.length}): ${res.map(r => r.err ? `REFUSED ${r.err.slice(0, 60)}` : r.ok ? 'monotone' : `⛔ ${r.seq}`).join(' · ')}`)
  const st = [[0, 0], [4, 0], [2, 2], [4, 4], [0, 4], [2, 2]], items = [{ kind: 'full', r: st }, { kind: 'ev', r: far.map(([x, y]) => [x + 50, y]) }], t = run(items, stampPairs(items))
  row(!t.err && t.R[0].length === st.length && !t.R.counts['full ✂ antenna'], `(g) a self-touch survives whole: ${t.err ? 'REFUSED ' + t.err : `${t.R[0].length} of ${st.length} vertices, antennas ${t.R.counts['full ✂ antenna'] || 0}`}`)
  // the input itself retraces (A, B, A all input vertices): the survivor keeps the FIRST A's src and the SECOND A's edge;
  // B and the second A are reported dropped, and the survivor as relabelled (Zob's ruling)
  const ab = [[0, 0], [5, 0], [5.001, 0], [5, 0], [5, 5]], it2 = [{ kind: 'full', r: ab }, { kind: 'ev', r: far.map(([x, y]) => [x + 50, y]) }], u = run(it2, stampPairs(it2))
  const sv = u.R?.[0].find(v => v.k[0] === 5000 && v.k[1] === 0)
  row(!u.err && sv?.src === 1 && sv?.edge === 3 && u.R.dropped[0].join() === '2,3' && u.R.relabelled[0].length === 1 && u.R[0].length === 3,
    `(g) an input retrace: survivor src ${sv?.src} edge ${sv?.edge} (want 1, 3) · dropped [${u.R?.dropped[0]}] (want 2,3) · relabelled ${JSON.stringify(u.R?.relabelled[0])}${u.err ? ' · REFUSED ' + u.err : ''}`)
}
// (h) open paths
open: {
  const all = () => true, ps = (o) => o.map(v => v.k.join(',')).join(' ')
  const tryN = (rs) => { try { return { R: nodeCrossings(rs, { pairs: all, who: '(h)' }) } } catch (e) { return { err: e.message } } }
  const x = tryN([{ tag: 'ring', p: [[0, 0], [10, 0], [10, 10], [0, 10]] }, { tag: 'line', open: true, p: [[-5, 5], [15, 5]] }])
  row(!x.err && ps(x.R[1]) === '-5000,5000 0,5000 10000,5000 15000,5000' && x.R[0].some(v => v.k.join() === '10000,5000') && x.R[0].some(v => v.k.join() === '0,5000'),
    `(h) an open path across a ring: noded on both, the crossings shared, no closing segment: ${x.err || ps(x.R[1])}`)
  const e = tryN([{ tag: 'tail', open: true, p: [[0, 0], [5, 0], [8, 0], [5, 0]] }])
  row(!e.err && ps(e.R[0]) === '0,0 5000,0 8000,0' && e.R.dropped[0].join() === '3', `(h) a path ending in A,B,A keeps its extent: ${e.err || ps(e.R[0])} · dropped [${e.R?.dropped[0]}] (want 3)`)
  const ob = tryN([{ tag: 'oab', open: true, p: [[0, 0], [5, 0], [0, 0]] }])
  row(!ob.err && ob.R[0].some(v => v.k.join() === '5000,0') && ob.R[0].length === 2, `(h) an out-and-back keeps its far end: ${ob.err || ps(ob.R[0])}`)
  const t = tryN([{ tag: 'through', open: true, p: [[0, 0], [10, 0.003]] }, { tag: 'stem', open: true, p: [[5, 5], [5, 0.001]] }])
  row(!t.err && t.R[0].some(v => v.k.join() === '5000,1'), `(h) a near-miss T: the through path is routed through the stem's end (5,0.001): ${t.err || ps(t.R[0])}`)
  const m = tryN([{ tag: 'oab-as-ring', p: [[0, 0], [5, 0], [0, 0]] }])
  row(!!m.err, `mutant (h): the out-and-back fed as a CLOSED ring collapses (must refuse): ${m.err ? m.err.slice(0, 90) : 'NOT REFUSED — the open rule is not what keeps it'}`)
}
// MUTANTS of the function's own verification (latticeNode.js#verifyNoded, which nodeCrossings runs on every output),
// handed planted bad outputs: the INPUT un-noded (its crossings still there) and a real output with one invented vertex
mutants: {
  const items = JSON.parse(readFileSync(join(FX, 'ptown-stamp-crossings-min.json'), 'utf8')).items, pairs = stampPairs(items)
  const K = items.map(x => x.r.map(k)), tags = items.map(x => x.kind), hot = new Map(K.flat().map(q => [q.join(','), true]))
  const refusal = (f) => { try { f(); return '' } catch (e) { return e.message } }
  const m1 = refusal(() => verifyNoded(K, K.map(r => r.map(q => ({ k: q }))), pairs, tags, 'mutant', hot))
  row(/still cross/.test(m1), `mutant: the un-noded input as output ⇒ the verification refuses: ${m1 ? m1.split(' — ')[0].slice(0, 110) : 'NO REFUSAL (the sweep is blind)'}`)
  const n = run(items, pairs)
  if (n.err) { row(false, `mutant: NOT CHECKED — nodeCrossings refused the minimised fixture: ${n.err}`); break mutants }
  const R = n.R, hot2 = new Map(R.flat().map(v => [v.k.join(','), true]))
  const planted = R.map((o, ri) => (ri ? o : [...o.slice(0, 1), { k: [o[0].k[0] + 1, o[0].k[1] + 1] }, ...o.slice(1)]))
  const m2 = refusal(() => verifyNoded(K, planted, pairs, tags, 'mutant', hot2))
  row(/invented/.test(m2), `mutant: one invented vertex planted ⇒ the verification refuses: ${m2 ? m2.split(' — ')[0].slice(0, 110) : 'NO REFUSAL'}`)
  const ant = R.map((o, ri) => (ri ? o : [...o.slice(0, 2), o[0], ...o.slice(2)]))                    // A,B,A planted
  const m3 = refusal(() => verifyNoded(K, ant, pairs, tags, 'mutant', hot2))
  const lost = R.map((o, ri) => (ri ? o : o.filter(v => v.src != null || v !== o.find(w => w.src == null))))      // one routed vertex dropped
  const ob = oracle(items.map(x => x.r), lost, pairs).skipped
  row(ob === 1, `mutant: one routed vertex removed from the output ⇒ the oracle finds ${ob} ring(s) unlike its routing (must be 1)`)
  row(/antenna/.test(m3), `mutant: an antenna A,B,A planted ⇒ the verification refuses: ${m3 ? m3.split(' — ')[0].slice(0, 110) : 'NO REFUSAL'}`)
}
// and nodeCrossings RUNS that verification on every output: read from its body, the call sits before its return
{
  const src = readFileSync(join(HERE, '../src/lib/latticeNode.js'), 'utf8'), at = src.indexOf('export function nodeCrossings(')
  const body = at < 0 ? '' : src.slice(at, src.indexOf('\n}\n', at)), v = body.search(/\bverifyNoded\(/), ret = body.lastIndexOf('return R')
  row(v >= 0 && ret > v, `nodeCrossings' body calls verifyNoded before it returns: ${at < 0 ? 'NOT CHECKED — nodeCrossings not found in latticeNode.js' : v >= 0 && ret > v}`)
}
console.log(red ? '\n⛔ RED — a crossing is not noded once, the noding did not end, or a mutant was not caught'
  : '\n✅ GREEN — crossings are noded once by one home, the noding ends, and the guarantee is re-proven independently')
process.exit(red ? 1 : 0)
