// sliver-181.mjs — the footway sliver at asphalt#66's slit chain: are its vertices iA / iA⁺ / stamp vertices of tile 181?
import { readFileSync } from 'fs'
import { stampTile } from '../../../src/lib/tileGround.js'
const T = JSON.parse(readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/public/baked/hipointedemun/shape.json', 'utf8')).tiles
const tri = [[126.19, -495.748], [126.363, -497.313], [126.856, -501.76]]
for (const [ti, st0] of T.entries()) { if (!st0?.iaFull?.length || !(st0.iaFull||[]).some(r => r.some((v,k) => { const b=r[(k+1)%r.length]; return Math.min(v[0],b[0])-1<126.3 && Math.max(v[0],b[0])+1>126.3 && Math.min(v[1],b[1])-1<-497 && Math.max(v[1],b[1])+1>-497 }))) continue; const st = T[ti], s2 = stampTile(st)
  for (const [nm, R] of [['iA', st.iA], ['iA+', s2.iA], ['iaFull', st.iaFull], ['iaFull+', s2.iaFull]])
    (R || []).forEach((r, ri) => r.forEach((v, k) => { for (const p of tri) { const d = Math.hypot(v[0] - p[0], v[1] - p[1]); if (d < 0.01) console.log(ti, nm, ri, k, v, 'd', d.toFixed(5), 'prev', r[(k - 1 + r.length) % r.length], 'next', r[(k + 1) % r.length]) } }))
  ;(st.evidenceByPiece || []).flat().forEach((e, ei) => (e?.rings || []).forEach((r, ri) => r.forEach((v, k) => { for (const p of tri) if (Math.hypot(v[0] - p[0], v[1] - p[1]) < 0.01) console.log('ev', ei, e.lu, ri, k, v) })))
}
{ const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
  for (const [ti, st] of T.entries()) { if (!st?.iaFull?.length) continue; let s2 = null
    for (const p of tri) for (const [nm, get] of [['iA', () => st.iA], ['iA+', () => (s2 ||= stampTile(st)).iA], ['iaFull', () => st.iaFull]]) (get() || []).forEach((r, ri) => r.forEach((a, k) => { const b = r[(k + 1) % r.length], d = sd(p, a, b); if (d < 0.05) console.log('tile', ti, nm, 'ring', ri, 'edge', k, JSON.stringify(a), JSON.stringify(b), 'P', p.join(','), 'd', d.toFixed(5)) })) } }
