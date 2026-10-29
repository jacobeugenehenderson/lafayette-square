// which parts of P have no part of the output inside them (removed whole by the open), with each one's area and widest point
// (the largest distance from its interior to its own boundary, sampled): narrower than 2h everywhere is the open's definition
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseProvenance, area } from './cand3.mjs'
const { IntPoint } = clipperLib
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/huron-traced.json', import.meta.url), 'utf8')), src = d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y)))
const r = openCloseProvenance(src, d.fineM, 'huron'), h = d.fineM / 2 * 1000
const inR = (x, y, q) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const a = q[i], b = q[j]; if ((a.Y > y) !== (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) c = !c } return c }
for (const o of r.P.filter(q => area(q) > 0)) {
  const hit = r.rings.some(q => area(q) > 0 && q.some(v => inR(v.X, v.Y, o)))
  if (hit) continue
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const v of o) { x0 = Math.min(x0, v.X); y0 = Math.min(y0, v.Y); x1 = Math.max(x1, v.X); y1 = Math.max(y1, v.Y) }
  const dB = (x, y) => { let m = Infinity; for (let i = 0; i < o.length; i++) { const a = o[i], b = o[(i + 1) % o.length], ex = b.X - a.X, ey = b.Y - a.Y, L2 = ex * ex + ey * ey, t = L2 ? Math.max(0, Math.min(1, ((x - a.X) * ex + (y - a.Y) * ey) / L2)) : 0; m = Math.min(m, Math.hypot(x - a.X - t * ex, y - a.Y - t * ey)) } return m }
  let wide = 0; const N = 40; for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * j / N; if (inR(x, y, o)) wide = Math.max(wide, dB(x, y)) }
  console.log(JSON.stringify({ vanished: [o[0].X / 1000, o[0].Y / 1000], m2: +(area(o) / 1e6).toFixed(3), vertices: o.length, maxInteriorDistU: +wide.toFixed(1), h: +h.toFixed(1), narrowerThan2h: wide < h }))
}
