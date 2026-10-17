// worst.mjs — where B departs from A by more than --tol inside one group: every containing triangle's height in A and in B
//   node scratch/ground-budget/simplify/worst.mjs --a= --b= --group=sidewalk --tol=0.0078 [--n=300000]
import { readFileSync } from 'fs'
import { join } from 'path'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const TOL = +arg('tol'), N = +(arg('n') || 3e5)
const load = (d) => { const gj = JSON.parse(readFileSync(join(d, 'ground.json'), 'utf8')), b = readFileSync(join(d, gj.bin)), AB = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  const g = gj.groups.find(g => g.id === arg('group'))
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  const grid = new Map(); for (let t = 0; t < I.length / 3; t++) { const xs = [0, 1, 2].map(k => P[I[3 * t + k] * 3]), zs = [0, 1, 2].map(k => P[I[3 * t + k] * 3 + 2])
    for (let gx = Math.floor(Math.min(...xs)); gx <= Math.floor(Math.max(...xs)); gx++) for (let gz = Math.floor(Math.min(...zs)); gz <= Math.floor(Math.max(...zs)); gz++) { const k = gx * 1e6 + gz; (grid.get(k) || grid.set(k, []).get(k)).push(t) } }
  const at = (x, z) => { const out = []; for (const t of grid.get(Math.floor(x) * 1e6 + Math.floor(z)) || []) { const [a, b, c] = [I[3 * t], I[3 * t + 1], I[3 * t + 2]]
    const d = (P[b * 3] - P[a * 3]) * (P[c * 3 + 2] - P[a * 3 + 2]) - (P[c * 3] - P[a * 3]) * (P[b * 3 + 2] - P[a * 3 + 2]); if (!d) continue
    const wa = ((P[b * 3] - x) * (P[c * 3 + 2] - z) - (P[c * 3] - x) * (P[b * 3 + 2] - z)) / d, wb = ((P[c * 3] - x) * (P[a * 3 + 2] - z) - (P[a * 3] - x) * (P[c * 3 + 2] - z)) / d, wc = 1 - wa - wb
    if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue
    out.push({ t, h: (R[a] * wa + R[b] * wb + R[c] * wc) + P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc, v: [a, b, c], sgn: Math.sign(d), area: Math.abs(d) / 2 }) } return out }
  return { P, I, R, at }
}
const A = load(arg('a')), B = load(arg('b'))
let s = 7, bad = 0; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296
const nt = A.I.length / 3
for (let i = 0; i < N; i++) { const t = Math.floor(rnd() * nt), [a, b, c] = [A.I[3 * t], A.I[3 * t + 1], A.I[3 * t + 2]]; let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v }
  const x = A.P[a * 3] + u * (A.P[b * 3] - A.P[a * 3]) + v * (A.P[c * 3] - A.P[a * 3]), z = A.P[a * 3 + 2] + u * (A.P[b * 3 + 2] - A.P[a * 3 + 2]) + v * (A.P[c * 3 + 2] - A.P[a * 3 + 2])
  const la = A.at(x, z), lb = B.at(x, z); if (!la.length || !lb.length) continue
  const ha = la.map(o => o.h), hb = lb.map(o => o.h)
  if (Math.max(...ha) - Math.min(...ha) > 1e-4) continue
  const e = Math.max(...hb.map(h => Math.abs(h - ha[0]))); if (e <= TOL) continue
  if (++bad <= 6) console.log(`(${x.toFixed(3)}, ${z.toFixed(3)}) A ${la.length} tri h ${ha[0].toFixed(4)} · B ${lb.length} tri h ${hb.map(h => h.toFixed(4)).join('/')} sgn ${lb.map(o => o.sgn).join('/')} area ${lb.map(o => o.area.toExponential(1)).join('/')} · err ${(e * 1000).toFixed(1)} mm`)
}
console.log(`over tol: ${bad} of ${N}`)
