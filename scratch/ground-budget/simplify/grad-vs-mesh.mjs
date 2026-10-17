// grad-vs-mesh.mjs — does a slab's stored aGrad match its OWN mesh? Recomputes the gradient pair exactly as
// bake-ground.js `terrainPart` does (area-weighted mean of the incident triangles' gradients of aRaw and of y), and
// compares the LIGHTING normal the shader builds (normalize(−(aGrad.xy·E + aGrad.zw), 1)) from the stored vs the
// recomputed pair. Per group: vertices whose normal differs by more than --deg. Read-only.
//   node --max-old-space-size=8192 scratch/ground-budget/simplify/grad-vs-mesh.mjs --slab=<dir> [--deg=10] [--show=6] [--mutate]
// --mutate: overwrites one vertex's stored aGrad with a 60° tilt in memory; it must then be reported.
import { readFileSync } from 'fs'
import { join } from 'path'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const dir = arg('slab'), DEG = +(arg('deg') || 10), SHOW = +(arg('show') || 6), MUT = process.argv.includes('--mutate')
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin))
const AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const sc = JSON.parse(readFileSync(join('public/baked', gj.look, 'scene.json'), 'utf8')), E = sc.terrainExag
if (!(E > 0)) throw new Error('grad-vs-mesh: the scene names no terrainExag')
const cosLim = Math.cos(DEG * Math.PI / 180)
let tot = 0, over = 0, worst = [], mutated = false
const nrm = (gx, gz) => { const l = Math.hypot(gx, 1, gz); return [-gx / l, 1 / l, -gz / l] }
for (const g of gj.groups) {
  if (g.gradByteOffset == null) continue
  const nv = g.vertexCount, P = new Float32Array(AB, g.vertexByteOffset, nv * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  const R = new Float32Array(AB, g.rawByteOffset, nv), S = new Float32Array(AB, g.gradByteOffset, nv * 4)
  if (MUT && !mutated && nv > 10) { S[5 * 4] = Math.tan(Math.PI / 3) / E; S[5 * 4 + 1] = 0; S[5 * 4 + 2] = 0; S[5 * 4 + 3] = 0; mutated = `${g.id} v5` }
  const G = new Float64Array(nv * 4), W = new Float64Array(nv)
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2]
    const e1x = P[b * 3] - P[a * 3], e1z = P[b * 3 + 2] - P[a * 3 + 2], e2x = P[c * 3] - P[a * 3], e2z = P[c * 3 + 2] - P[a * 3 + 2]
    const det = e1x * e2z - e2x * e1z, area = Math.abs(det) / 2; if (!(area > 0)) continue
    const gr = (h0, h1, h2) => { const d1 = h1 - h0, d2 = h2 - h0; return [(d1 * e2z - d2 * e1z) / det, (e1x * d2 - e2x * d1) / det] }
    const gd = gr(R[a], R[b], R[c]), gy = gr(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1])
    for (const v of [a, b, c]) { G[v * 4] += gd[0] * area; G[v * 4 + 1] += gd[1] * area; G[v * 4 + 2] += gy[0] * area; G[v * 4 + 3] += gy[1] * area; W[v] += area }
  }
  let o = 0
  for (let v = 0; v < nv; v++) {
    if (!(W[v] > 0)) continue
    const r = [0, 1, 2, 3].map(k => G[v * 4 + k] / W[v])
    const A = nrm(S[v * 4] * E + S[v * 4 + 2], S[v * 4 + 1] * E + S[v * 4 + 3]), B = nrm(r[0] * E + r[2], r[1] * E + r[3])
    const dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2]
    if (!(dot >= cosLim)) { o++; worst.push([Math.acos(Math.min(1, dot)) * 180 / Math.PI, `${g.id} v${v} (${P[v * 3].toFixed(1)}, ${P[v * 3 + 2].toFixed(1)}) stored tilt ${(Math.acos(A[1]) * 180 / Math.PI).toFixed(1)}° · own-mesh tilt ${(Math.acos(B[1]) * 180 / Math.PI).toFixed(1)}°`]) }
  }
  tot += nv; over += o
  if (o) console.log(`  ${(g.kind + ':' + g.id).padEnd(30)} ${o} of ${nv} (${(100 * o / nv).toFixed(2)}%)`)
}
console.log(`${dir}${mutated ? ` · MUTATED ${mutated}` : ''} · E ${E}: lighting normal off its own mesh by > ${DEG}°: ${over} of ${tot} vertices (${(100 * over / tot).toFixed(2)}%)`)
worst.sort((a, b) => b[0] - a[0]); for (const [d, s] of worst.slice(0, SHOW)) console.log(`   worst ${d.toFixed(1)}°: ${s}`)
