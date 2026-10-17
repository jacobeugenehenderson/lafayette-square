// vertex-anomaly.mjs — at the original vertices where measure.mjs reads B far from A: is it the surface, or the sampler?
// Compares drawnGround's partsAt (barycentric tolerance 1e-4) with a strict one (1e-7) on A and on B, per group class.
//   node scratch/ground-budget/simplify/vertex-anomaly.mjs --a= --b= --group=<id> --tol=<m>
import { readFileSync } from 'fs'
import { join } from 'path'
import { makeDrawnGround } from '../../../src/lib/drawnGround.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const TOL = +arg('tol'), id = arg('group')
const load = (d) => { const gj = JSON.parse(readFileSync(join(d, 'ground.json'), 'utf8')), b = readFileSync(join(d, gj.bin)); return { gj, AB: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } }
const a = load(arg('a')), b = load(arg('b'))
const strict = (s) => { const g = s.gj.groups.find(g => g.id === id), P = new Float32Array(s.AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(s.AB, g.indexByteOffset, g.indexCount), R = new Float32Array(s.AB, g.rawByteOffset, g.vertexCount)
  const grid = new Map(); for (let t = 0; t < I.length / 3; t++) { const xs = [0, 1, 2].map(k => P[I[3 * t + k] * 3]), zs = [0, 1, 2].map(k => P[I[3 * t + k] * 3 + 2])
    for (let gx = Math.floor(Math.min(...xs)); gx <= Math.floor(Math.max(...xs)); gx++) for (let gz = Math.floor(Math.min(...zs)); gz <= Math.floor(Math.max(...zs)); gz++) { const k = gx * 1e6 + gz; (grid.get(k) || grid.set(k, []).get(k)).push(t) } }
  return (x, z) => { const hs = []; for (const t of grid.get(Math.floor(x) * 1e6 + Math.floor(z)) || []) { const [p, q, r] = [I[3 * t], I[3 * t + 1], I[3 * t + 2]]
    const d = (P[q * 3] - P[p * 3]) * (P[r * 3 + 2] - P[p * 3 + 2]) - (P[r * 3] - P[p * 3]) * (P[q * 3 + 2] - P[p * 3 + 2]); if (!d) continue
    const wa = ((P[q * 3] - x) * (P[r * 3 + 2] - z) - (P[r * 3] - x) * (P[q * 3 + 2] - z)) / d, wb = ((P[r * 3] - x) * (P[p * 3 + 2] - z) - (P[p * 3] - x) * (P[r * 3 + 2] - z)) / d, wc = 1 - wa - wb
    if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue; hs.push(R[p] * wa + R[q] * wb + R[r] * wc + P[p * 3 + 1] * wa + P[q * 3 + 1] * wb + P[r * 3 + 1] * wc) } return hs } }
const pick = (g) => g.id === id, la = makeDrawnGround(a.gj, a.AB, { groups: pick }), lb = makeDrawnGround(b.gj, b.AB, { groups: pick }), sa = strict(a), sb = strict(b)
const g = a.gj.groups.find(g => g.id === id), P = new Float32Array(a.AB, g.vertexByteOffset, g.vertexCount * 3)
let loose = 0, strictBad = 0, both = 0, worst = 0
for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2], ha = la.heightAt(x, z, 1), hb = lb.heightAt(x, z, 1); if (ha == null || hb == null) continue
  const A = sa(x, z), B = sb(x, z); if (!A.length || !B.length || Math.max(...A) - Math.min(...A) > 1e-4) continue
  const dl = Math.abs(hb - ha) > TOL, ds = Math.max(...B.map(h => Math.abs(h - A[0]))); if (dl) loose++; if (ds > TOL) { strictBad++; console.log(`  (${x.toFixed(3)}, ${z.toFixed(3)}) A ${A[0].toFixed(4)} · B [${B.map(h => h.toFixed(4)).join(", ")}]`) } if (dl && ds > TOL) both++; worst = Math.max(worst, ds) }
console.log(`${id}: vertices over ${TOL * 1000} mm by drawnGround.partsAt ${loose} · by a strict sampler ${strictBad} (both ${both}) · strict max ${(worst * 1000).toFixed(2)} mm`)
