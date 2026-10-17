// spike.mjs — at a point: the tile whose iaFull passes it; iA, iA⁺ and iaFull⁺ vertices along that line (in order), and the raw evidence vertices on it
import { readFileSync } from 'fs'
import { stampTile, prepareEvidence } from '../../../src/lib/tileGround.js'
const P = process.argv[2].split(',').map(Number)
const T = JSON.parse(readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/public/baked/hipointedemun/shape.json', 'utf8')).tiles
const groups = prepareEvidence(JSON.parse(readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/hipointedemun/clean/ribbons.json', 'utf8')).landEvidence)
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
for (const [ti, st] of T.entries()) { if (!st?.iaFull?.length) continue
  const hit = (R) => R.some(r => r.some((a, k) => sd(P, a, r[(k + 1) % r.length]) < 0.01)); if (!hit(st.iA || []) && !hit(st.iaFull)) continue
  const { tile } = stampTile(st, groups)
  for (const [nm, R] of [['iA', st.iA], ['iA+', tile.iA], ['iaFull', st.iaFull], ['iaFull+', tile.iaFull]]) R.forEach((r, ri) => r.forEach((a, k) => { if (Math.hypot(a[0] - P[0], a[1] - P[1]) < 12) console.log(`tile ${ti} ${nm} ring ${ri} v ${k}/${r.length} ${JSON.stringify(a)}`) }))
}
