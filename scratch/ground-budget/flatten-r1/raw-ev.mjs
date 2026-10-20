// raw-ev.mjs — at the off-edge vertices: which RAW land-evidence edges (ribbons.landEvidence, before the per-piece cut) pass
// there, and where each crosses the block edge exactly (float) — is the frozen vertex that crossing, rounded?
import { readFileSync } from 'fs'
const R = JSON.parse(readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/hipointedemun/clean/ribbons.json', 'utf8'))
const cases = [[[565.148, -167.371], [568.395, -169.348], [562.573, -165.802]], [[-243.535, -611.079], [-242.707, -617.629], [-245.046, -599.119]], [[126.363, -497.313], [126.96928524499472, -502.78234569447704], [126.09146324253082, -494.85790421251374]]]
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const X = (a, b, c, d) => { const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx; if (!den) return null
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den; return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? [a[0] + t * rx, a[1] + t * ry] : null }
for (const [P, e0, e1] of cases) { console.log('P', P.join(','))
  R.landEvidence.forEach((e, ei) => e.rings.forEach((r, ri) => r.forEach((a, k) => { const b = r[(k + 1) % r.length]; if (sd(P, a, b) > 0.05) return
    const x = X(a, b, e0, e1); console.log(`   ev ${ei} ${e.lu}/${e.src} ring ${ri} edge ${JSON.stringify(a)}→${JSON.stringify(b)} d ${(sd(P, a, b) * 1000).toFixed(2)} mm · crosses block edge at ${x ? x.map(v => v.toFixed(5)).join(',') + ' (|P−x| ' + (Math.hypot(x[0] - P[0], x[1] - P[1]) * 1000).toFixed(2) + ' mm)' : 'no'}`) }))) }
