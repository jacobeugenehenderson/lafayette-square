// fold-sites.mjs — at given points, every evidence / iA / iaFull vertex within 1 cm and every ring edge within 5 mm (shape.json, stamped live)
import { readFileSync } from 'fs'
import { stampTile } from '../../../src/lib/tileGround.js'
const T = JSON.parse(readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/public/baked/hipointedemun/shape.json', 'utf8')).tiles
const P = process.argv[2].split(';').map(s => s.split(',').map(Number))
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
for (const [ti, st] of T.entries()) { if (!st?.iaFull?.length) continue
  const s2 = stampTile(st)
  const sets = [['iA', st.iA], ['iA+', s2.iA], ['iaFull', st.iaFull]]
  ;(st.evidenceByPiece || []).forEach((l, pi) => (l || []).forEach((e, ei) => sets.push([`ev${pi}.${ei}:${e.lu}`, e.rings])))
  ;(s2.evidenceByPiece || []).forEach((l, pi) => (l || []).forEach((e, ei) => sets.push([`ev+${pi}.${ei}:${e.lu}`, e.rings])))
  for (const p of P) for (const [nm, R] of sets) (R || []).forEach((r, ri) => r.forEach((a, k) => { const b = r[(k + 1) % r.length], d = sd(p, a, b)
    if (d < 0.005) console.log(`tile ${ti} P ${p.join(',')} ${nm} ring ${ri} edge ${k}/${r.length} ${JSON.stringify(a)}→${JSON.stringify(b)} d ${(d * 1000).toFixed(2)} mm`) }))
}
