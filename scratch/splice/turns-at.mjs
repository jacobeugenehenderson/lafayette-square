// Splice probe: on ①'s block rings, the vertices within R of a point with their TURN (degrees), the edge leaving each, and
// owner. To tell a real corner at the end of a true-geometry edge from a doubled one.   node turns-at.mjs <ribbons> x,z [R]
import { readFileSync } from 'node:fs'
const [f, at, Rs] = process.argv.slice(2), q = at.split(',').map(Number), R = +(Rs || 0.05), P = JSON.parse(readFileSync(f, 'utf8')).protopolygon
const rs = [...P.blocks.map((r, k) => [r, P.blockLabels[k], 'b' + k])]
for (const [r, L, id] of rs) { const n = r.length, idx = r.map((_, i) => i).filter(i => Math.hypot(r[i][0] - q[0], r[i][1] - q[1]) < R); if (!idx.length) continue
  for (let i = Math.min(...idx) - 1; i <= Math.max(...idx) + 1; i++) { const j = (i + n) % n, p = r[(j - 1 + n) % n], v = r[j], w = r[(j + 1) % n]
    const t = Math.atan2(w[1] - v[1], w[0] - v[0]) - Math.atan2(v[1] - p[1], v[0] - p[0]), o = P.owners[L[j]]
    console.log(`  ${id}[${j}] (${v.map(c => c.toFixed(3))}) turn ${(Math.atan2(Math.sin(t), Math.cos(t)) * 180 / Math.PI).toFixed(1).padStart(6)}° · edge → ${(Math.hypot(w[0] - v[0], w[1] - v[1]) * 1000).toFixed(1)} mm · ${o?.skelId}|${o?.side}`) } }
