// the staircase rule at PTown's two source-staircase sites, live (cand3.mjs), judged end to end. node scratch/cut-once/stair-retag-sites.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, Paths } = clipperLib
const C3 = await import('./cand3.mjs'), O = await import('./oracle.mjs')
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/provincetown-traced.json', import.meta.url), 'utf8')), parts = C3.partsOf(d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y))), 'p')
const clip = (pp, x0, y0, x1, y1) => { const c = new Clipper(), o = new Paths(); c.AddPaths(pp.map(r => r.map(q => new IntPoint(q.X, q.Y))), PolyType.ptSubject, true); c.AddPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([X, Y]) => new IntPoint(X, Y)), PolyType.ptClip, true); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const part = (x, y) => parts.find(pp => clip(pp, x * 1000 - 1, y * 1000 - 1, x * 1000 + 1, y * 1000 + 1).length) || parts[0]
for (const W of [10, 100]) for (const [x, y] of [[343.28, -204.639], [4986.648, -140.72]]) { const o = clip(part(x, y), x * 1000 - W * 500, y * 1000 - W * 500, x * 1000 + W * 500, y * 1000 + W * 500); let j = null, why = null
  try { j = O.judge(o, d.fineM, 'st') } catch (e) { why = String(e.message).replace(/^\[[^\]]*\]\s*⛔?\s*/, '').slice(0, 110) }
  console.log(`(${x}, ${y}) ${W} m: ${why ? 'REFUSED ' + why : `builds, e2e ${JSON.stringify(j.e2e)}`}`) }
