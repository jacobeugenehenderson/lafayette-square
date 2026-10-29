// Zob's (b): the w0 needle (water − deck) at PTown's antenna, followed through the take-out's stages: points sampled INSIDE the needle
// along its length, each tested against every stage (inside or not), so the stage that drops it is named, not inferred.
// node scratch/cut-once/antenna-wedge.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, Paths, JoinType, EndType } = clipperLib
const K = await import('../../cartograph/openClose.mjs')
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/ptown-antenna-crop.json', import.meta.url), 'utf8')), stepM = d.fineM, cellU = stepM * 1000
const toP = (r) => r.map(([x, z]) => new IntPoint(Math.round(x * 1000), Math.round(z * 1000)))
const op = (type, a, b) => { const k = new Clipper(), o = new Paths(); k.StrictlySimple = true; k.AddPaths(a, PolyType.ptSubject, true); if (b) k.AddPaths(b, PolyType.ptClip, true); k.Execute(type, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const grow = (src, dd) => { const co = new ClipperOffset(), o = new Paths(); co.AddPaths(src, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, dd); return o }
const water = d.water.map(toP), D = [toP(d.deck)], w0 = op(ClipType.ctDifference, water, D)
// the needle in w0: the vertex nearest the tip, and its two neighbours
let best = null; w0.forEach((r, k) => r.forEach((q, i) => { const dd = Math.hypot(q.X - 192008, q.Y - 63050); if (!best || dd < best.dd) best = { k, i, dd } }))
const R = w0[best.k], n = R.length, tip = R[best.i], a = R[(best.i - 1 + n) % n], b = R[(best.i + 1) % n]
console.log(`the w0 needle: tip (${tip.X},${tip.Y}), sides to (${a.X},${a.Y}) and (${b.X},${b.Y}); width at its base ${(Math.hypot(a.X - b.X, a.Y - b.Y)).toFixed(0)} u`)
const inside = (pp, x, y) => pp.reduce((t, r) => { let c = false; for (let s = 0, u = r.length - 1; s < r.length; u = s++) { const p = r[s], q = r[u]; if ((p.Y > y) !== (q.Y > y) && x < (q.X - p.X) * (y - p.Y) / (q.Y - p.Y) + p.X) c = !c } return t + (c ? Math.sign(Clipper.Area(r)) : 0) }, 0) > 0
// sample points inside the needle: along the bisector from the tip toward the base, at fractions of the shorter side
const L = Math.min(Math.hypot(a.X - tip.X, a.Y - tip.Y), Math.hypot(b.X - tip.X, b.Y - tip.Y)), ua = [(a.X - tip.X) / Math.hypot(a.X - tip.X, a.Y - tip.Y), (a.Y - tip.Y) / Math.hypot(a.X - tip.X, a.Y - tip.Y)], ub = [(b.X - tip.X) / Math.hypot(b.X - tip.X, b.Y - tip.Y), (b.Y - tip.Y) / Math.hypot(b.X - tip.X, b.Y - tip.Y)]
const pts = [0.05, 0.2, 0.5, 0.8].map(f => [tip.X + (ua[0] + ub[0]) / 2 * L * f, tip.Y + (ua[1] + ub[1]) / 2 * L * f])
const loc = op(ClipType.ctIntersection, w0, grow(D, 2 * cellU)), open = K.openAt(loc, stepM, 'loc'), g1 = grow(D, cellU)
const locMinusOpen = op(ClipType.ctDifference, loc, open), thin = op(ClipType.ctIntersection, locMinusOpen, g1)
const area = (ps) => ps.reduce((t, q) => t + Clipper.Area(q), 0), touching = thin.filter(q => Clipper.Area(q) > 0 && area(op(ClipType.ctIntersection, grow([q], 2), D)) > 0)
for (const [x, y] of pts) console.log(`  (${x.toFixed(0)}, ${y.toFixed(0)}): w0 ${inside(w0, x, y)} · grow(D, 2 cells) ${inside(grow(D, 2 * cellU), x, y)} · loc ${inside(loc, x, y)} · open ${inside(open, x, y)} · loc − open ${inside(locMinusOpen, x, y)} · grow(D, 1 cell) ${inside(g1, x, y)} · thin ${inside(thin, x, y)} · touching ${inside(touching, x, y)}`)
