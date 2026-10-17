// resid.mjs — at a residual one-side vertex: the raw evidence edges passing within 1 mm (which groups), and their pairwise crossings
import { readFileSync } from 'fs'
const town = process.argv[2], P = process.argv[3].split(',').map(Number)
const ev = JSON.parse(readFileSync(`/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/${town}/clean/ribbons.json`, 'utf8')).landEvidence
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
ev.forEach((e, ei) => e.rings.forEach((r, ri) => r.forEach((a, k) => { const b = r[(k + 1) % r.length], d = sd(P, a, b); if (d < 0.001) console.log(`ev ${ei} ${e.lu}/${e.src}${e.crop != null ? '/crop=' + e.crop : ''} ring ${ri} ${JSON.stringify(a)}→${JSON.stringify(b)} d ${(d * 1000).toFixed(3)} mm`) })))
