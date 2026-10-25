// Splice probe: per ① block face (outer ring), how many chain-labelled edges fit the LEAVING convention (label i names
// edge i→i+1: the edge lies within ε + 2 grid of that chain's polyline) vs the ARRIVING one (label i names i−1→i).
// Lists faces where arriving fits better. Chains = ribbons.json streets (the oracle's own reference).
//   node scratch/splice/faceconv.mjs <frozen ribbons (streets)> <re-mint ribbons (protopolygon)>
import { readFileSync } from 'node:fs'
import { CLIP_SCALE } from '../../src/lib/lattice.js'
const [rf, pf] = process.argv.slice(2), St = JSON.parse(readFileSync(rf, 'utf8')).streets, P = JSON.parse(readFileSync(pf, 'utf8')).protopolygon
const tol = P.eps + 2 / CLIP_SCALE, byId = new Map(St.map(s => [s.skelId ?? s.name, s.points]))
const dSeg = (q, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(a[0] + t * dx - q[0], a[1] + t * dz - q[1]) }
const onChain = (id, q) => { const p = byId.get(id); if (!p) return null; for (let i = 0; i + 1 < p.length; i++) if (dSeg(q, p[i], p[i + 1]) <= tol) return true; return false }
let faces = 0, bad = []
P.blocks.forEach((r, k) => { const L = P.blockLabels[k], n = r.length; let lv = 0, ar = 0, judged = 0
  for (let i = 0; i < n; i++) { const a = r[i], b = r[(i + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 3 * P.eps) continue
    const oL = P.owners[L[i]]?.skelId, oA = P.owners[L[(i - 1 + n) % n]]?.skelId
    const x = onChain(oL, m), y = onChain(oA, m); if (x === null && y === null) continue
    judged++; if (x) lv++; if (y) ar++ }
  faces++; if (judged && ar > lv) bad.push(`b${k} n=${n} judged ${judged}: leaving ${lv} · arriving ${ar}`) })
console.log(`${pf.split('/').pop()}: ${faces} faces · ${bad.length} fit ARRIVING better`); for (const x of bad.slice(0, 8)) console.log('   ' + x)
