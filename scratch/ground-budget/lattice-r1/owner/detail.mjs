// detail.mjs <town> <x,z> [r] — at a site: the tile's corner records before → after within r (apex, r), and the iaFull vertices
// only-before / only-after within r, each with whether it lies on (within 1 mm of) the OTHER capture's ring edges — a vertex
// inserted on an existing edge (collinear) versus a moved contour.
import { readFileSync } from 'fs'
const [T, at, rr] = process.argv.slice(2), c = at.split(',').map(Number), R = +(rr || 15), J = (x) => JSON.parse(readFileSync(`../cap-u${x}-${T}.json`, 'utf8'))
const A = J('before'), B = J('after')
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const onRings = (p, rings) => rings.some(r => r.some((a, k) => sd(p, a, r[(k + 1) % r.length]) <= 0.001))
for (const [nm, D, O] of [['before', A, B], ['after', B, A]]) {
  for (const t of D.tiles) { const fs = (t.fillets || []).filter(f => Math.hypot(f.apex[0] - c[0], f.apex[1] - c[1]) <= R); const vs = t.iaFull.flat().filter(v => Math.hypot(v[0] - c[0], v[1] - c[1]) <= R)
    if (!fs.length && !vs.length) continue
    const u = O.tiles.find(x => x.ring0.join(',') === t.ring0.join(',')), other = new Set(u.iaFull.flat().map(v => v.join(',')))
    const only = vs.filter(v => !other.has(v.join(','))), col = only.filter(v => onRings(v, u.iaFull)).length
    console.log(`${nm}: tile ${t.ring0.map(x => x.toFixed(1))} · corners ${fs.map(f => `(${f.apex.map(x => x.toFixed(2))}) r ${f.r.toFixed(3)}`).join(' · ') || '—'} · iaFull within ${R} m: ${vs.length}, only here ${only.length} (${col} of them on the other capture's ring edges)`) } }
