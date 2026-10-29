// one closedK disagreement traced (Zob, 2026-10-29): every stage's boundary within R of a point, ours and the definition's, on
// Huron's traced water; each of our closedK vertices with the emission rule that drew it (cand3.mjs#ORIGIN) and its edge's tag.
// node scratch/cut-once/trace-at.mjs X Y [R]   (metres; R in units, default 1500)
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, ClipperOffset, Clipper, ClipType, PolyType, PolyFillType, Paths, JoinType, EndType } = clipperLib
const G = await import('./gate.mjs'), C3 = await import('./cand3.mjs')
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/huron-traced.json', import.meta.url), 'utf8'))
const [X, Y, R = 1500] = process.argv.slice(2).map(Number), cx = X * 1000, cy = Y * 1000, F = 1000, h = d.fineM / 2 * 1000
const r = C3.openCloseProvenance(G.ip(d.traced), d.fineM, 'huron')
const up = (pp) => pp.map(p => p.map(q => new IntPoint(q.X * F, q.Y * F)))
const off = (pp, dl) => { const co = new ClipperOffset(2), o = new Paths(); co.AddPaths(pp, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, dl); return o }
const un = (a) => { const c = new Clipper(), o = new Paths(); c.AddPaths(a, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const near = (pp, s = 1) => pp.flatMap((ring, k) => ring.map((q, i) => ({ k, i, x: q.X / s, y: q.Y / s })).filter(v => Math.hypot(v.x - cx, v.y - cy) <= R))
const fmt = (v) => [Math.round(v.x), Math.round(v.y)]
console.log('ours dilate', JSON.stringify(near(C3.STAGES.dilate).map(fmt)))
console.log('ref closedK (from our dilate)', JSON.stringify(near(un([...up(C3.STAGES.open), ...off(up(C3.STAGES.dilate), -h * F)]), F).map(fmt)))
const CK = C3.STAGES.closedK
for (const v of near(CK)) { const ring = CK[v.k], q = ring[v.i], w = ring[(v.i + 1) % ring.length]
  console.log('ours closedK', v.k, v.i, [q.X, q.Y], '→', [w.X, w.Y], C3.ORIGIN.get(q.X + ',' + q.Y) || '-', JSON.stringify(q.tag ?? null).slice(0, 140)) }
