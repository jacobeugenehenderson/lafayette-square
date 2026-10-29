// one take-out disagreement traced: the deck's open input (loc), the definition's open and ours, within R of a point; each of our
// vertices with the emission rule that drew it (cand3.mjs#ORIGIN). node scratch/cut-once/takeout-trace.mjs DECK X Y [R]
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Paths, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib
process.argv[1] = 'not-main'
const T = await import('./takeout.mjs'), C3 = await import('./cand3.mjs'), S = await import('../../cartograph/structures.mjs')
const [DK, X, Y, R = 1500] = process.argv.slice(2).map(Number), cx = X * 1000, cy = Y * 1000
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const coast = fx('ptown-coast'), sd = fx('ptown-street-decks'), stepM = coast.fineM
T.takeOutCandidate(coast.water.flatMap(bd => [bd.outer, ...bd.holes]), coast.arcs || [], sd.rings, stepM)
const loc = T.INPUTS.find(x => x.kind === 'open' && x.k === DK).input, h = stepM / 2 * 1000
const off = (pp, d) => { const co = new ClipperOffset(2), o = new Paths(); co.AddPaths(pp, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, d); return o }
const op = (t, a, b) => { const c = new Clipper(), o = new Paths(); c.AddPaths(a, PolyType.ptSubject, true); if (b) c.AddPaths(b, PolyType.ptClip, true); c.Execute(t, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const near = (pp) => pp.flatMap((r, k) => r.map((q, i) => ({ k, i, q })).filter(v => Math.hypot(v.q.X - cx, v.q.Y - cy) <= R))
console.log('loc', JSON.stringify(near(loc).map(v => [v.k, v.i, v.q.X, v.q.Y])))
console.log('ref open (integer, 1 mm)', JSON.stringify(near(op(ClipType.ctIntersection, off(off(loc, -h), h), loc)).map(v => [v.q.X, v.q.Y])))
const o = C3.openAt(loc, stepM, 'trace')
console.log('ours open', JSON.stringify(near(o).map(v => [v.q.X, v.q.Y, C3.ORIGIN.get(v.q.X + ',' + v.q.Y) || '-'])))
// the disagreement pieces themselves (the definition 1000× finer, as takeout.mjs judges), any vertex within R
const F = 1000, up = (pp) => pp.map(p => p.map(q => new IntPoint(q.X * F, q.Y * F))), I = up(loc), REF = op(ClipType.ctIntersection, off(off(I, -h * F), h * F), I), K = up(o)
for (const [side, d] of [['candidate only', op(ClipType.ctDifference, K, REF)], ['definition only', op(ClipType.ctDifference, REF, K)]]) for (const r of d) {
  const pts = r.map(q => [Math.round(q.X / F), Math.round(q.Y / F)]); if (Math.abs(Clipper.Area(r)) / F / F < 1e4) continue
  console.log(side, (Clipper.Area(r) / F / F / 1e6).toFixed(4), 'm²', JSON.stringify(pts)) }
// every ring of loc and ours that has a vertex within R: their full outline, in order
for (const [nm, pp] of [['loc', loc], ['ours', o]]) pp.forEach((r, k) => { if (r.some(q => Math.hypot(q.X - cx, q.Y - cy) <= R)) console.log(nm, k, r.length, 'pts', (Clipper.Area(r) / 1e6).toFixed(3), 'm²', JSON.stringify(r.map(q => [q.X, q.Y]))) })
// the EDGES (not only vertices) of loc, ours and the definition passing within R of the point
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
for (const [nm, pp, s] of [['loc', loc, 1], ['ours', o, 1], ['definition', REF, F]]) pp.forEach((r, k) => r.forEach((q, i) => { const w = r[(i + 1) % r.length], A = [q.X / s, q.Y / s], B = [w.X / s, w.Y / s]
  if (segD([cx, cy], A, B) <= R) console.log('EDGE', nm, k, i, JSON.stringify(A.map(Math.round)), '→', JSON.stringify(B.map(Math.round)), nm === 'ours' ? (C3.ORIGIN.get(q.X + ',' + q.Y) || '-') + '/' + (C3.ORIGIN.get(w.X + ',' + w.Y) || '-') : '') }))
