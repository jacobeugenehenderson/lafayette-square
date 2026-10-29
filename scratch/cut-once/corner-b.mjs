// Huron's P corner at (3235085, 791613): P's own two edges there (convex or reflex), and the open's TAKEN pieces near it, each with
// whether isRoundingSliver called it a sliver (kept in P, so the corner survives) and its widest interior distance
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { isRoundingSliver } from '../../cartograph/structures.mjs'
const { IntPoint, Clipper } = clipperLib
const C3 = await import('./cand3.mjs')
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/huron-traced.json', import.meta.url), 'utf8')), src = d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y)))
const r = C3.openCloseProvenance(src, d.fineM, 'huron'), V = [3235085, 791613]
for (const R of r.P) { const i = R.findIndex(q => q.X === V[0] && q.Y === V[1]); if (i < 0) continue
  const a = R[(i - 1 + R.length) % R.length], b = R[i], c = R[(i + 1) % R.length], u = [b.X - a.X, b.Y - a.Y], v = [c.X - b.X, c.Y - b.Y]
  const cr = u[0] * v[1] - u[1] * v[0], ccw = C3.area(R) > 0, turn = Math.atan2(cr, u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI
  console.log(JSON.stringify({ Pring: { area: +(C3.area(R) / 1e6).toFixed(1), n: R.length }, edgeIn: [[a.X, a.Y], [b.X, b.Y]], edgeOut: [[b.X, b.Y], [c.X, c.Y]], turnDeg: +turn.toFixed(3), convexWrtP: ccw ? cr > 0 : cr < 0, lensU: [+Math.hypot(...u).toFixed(1), +Math.hypot(...v).toFixed(1)] })) }
