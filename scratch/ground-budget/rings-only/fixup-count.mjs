// fixup-count.mjs — what the PolyTree + StrictlySimple difference spends its time on, counted (Boz, 2026-10-14): the
// FirstLeft fix-ups (calls, m_PolyOuts scanned per call, Poly2ContainsPoly1 calls, PointInPolygon vertex steps), by
// wrapping clipper-lib's prototype methods in this process only. The flatten's asphalt difference on Brace's dump.
// Reads only.   node fixup-count.mjs <dump.json>
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const C = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')('clipper-lib')
const d = JSON.parse(readFileSync(process.argv[2], 'utf8')), P = (a) => a.map(q => q.map(([X, Y]) => ({ X, Y })))
const K = { fl1: 0, fl2: 0, fl3: 0, scanned: 0, contains: 0, pipSteps: 0, maxOuts: 0, simpleSplits: 0, joinSplits: 0 }
const pr = C.Clipper.prototype, wrap = (name, f) => { const o = pr[name]; pr[name] = function (...a) { f.call(this, ...a); return o.apply(this, a) } }
wrap('FixupFirstLefts1', function () { K.fl1++; K.scanned += this.m_PolyOuts.length; K.maxOuts = Math.max(K.maxOuts, this.m_PolyOuts.length) })
wrap('FixupFirstLefts2', function () { K.fl2++; K.scanned += this.m_PolyOuts.length; K.maxOuts = Math.max(K.maxOuts, this.m_PolyOuts.length) })
wrap('FixupFirstLefts3', function () { K.fl3++; K.scanned += this.m_PolyOuts.length })
wrap('Poly2ContainsPoly1', function () { K.contains++ })
// PointInPolygon(pt, op): one walk of the container's ring per call
const pip = pr.PointInPolygon; pr.PointInPolygon = function (pt, op) { if (op && op.Next) { let n = 0, s = op; do { n++; s = s.Next } while (s !== op); K.pipSteps += n } return pip.call(this, pt, op) }
const c = new C.Clipper(); c.StrictlySimple = true
c.AddPaths(P(d.mine), C.PolyType.ptSubject, true); c.AddPaths(P(d.acc), C.PolyType.ptClip, true)
const t = new C.PolyTree(), t0 = performance.now()
c.Execute(C.ClipType.ctDifference, t, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftNonZero)
console.log(`[count] ${d.key} · ${((performance.now() - t0) / 1000).toFixed(1)} s (counting adds its own cost) · final outrecs ${c.m_PolyOuts.length} · max m_PolyOuts at a fix-up ${K.maxOuts}`)
console.log(`[count] FirstLefts1 ${K.fl1} · FirstLefts2 ${K.fl2} · FirstLefts3 ${K.fl3} · outrecs scanned ${K.scanned} · Poly2ContainsPoly1 ${K.contains} · PointInPolygon vertex steps ${K.pipSteps}`)
