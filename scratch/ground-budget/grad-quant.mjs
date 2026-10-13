// What storing aGrad at lower precision costs ON SCREEN: the angle between the shader's normal from the float32 gradient
// and from a quantized one (terrainShader.js TERRAIN_NORMAL_BAKED: n = normalize(-(g.xy·uExag + g.zw), 1)), over every
// vertex of a slab that carries the deformer's sections, at several uExag (Brace, 2026-10-13). Read-only.
//   node scratch/ground-budget/grad-quant.mjs <slab dir> [exag,...]
import { readFileSync } from 'fs'
const [dir, ex = '1,2,4'] = process.argv.slice(2), exags = ex.split(',').map(Number)
const m = JSON.parse(readFileSync(dir + '/ground.json', 'utf8')), bin = readFileSync(dir + '/ground.bin')
const AB = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const G = []; for (const g of m.groups) if (g.gradByteOffset != null) G.push(new Float32Array(AB, g.gradByteOffset, g.vertexCount * 4))
const nv = G.reduce((s, a) => s + a.length / 4, 0)
const all = new Float32Array(nv * 4); let o = 0; for (const a of G) { all.set(a, o); o += a.length }
// how much of zw (the mesh's own y gradient: the kerb) is ever nonzero
let zwNZ = 0; for (let v = 0; v < nv; v++) if (all[v * 4 + 2] !== 0 || all[v * 4 + 3] !== 0) zwNZ++
const maxAbs = [0, 1, 2, 3].map(k => { let mx = 0; for (let v = 0; v < nv; v++) mx = Math.max(mx, Math.abs(all[v * 4 + k])); return mx })
// an int scheme's scale: the p99.99 |∂| of the component (beyond it the value clamps — those vertices show in the max)
const scale = [0, 1, 2, 3].map(k => { const a = new Float64Array(nv); for (let v = 0; v < nv; v++) a[v] = Math.abs(all[v * 4 + k]); a.sort(); return a[Math.floor(nv * 0.9999)] })
const steep = [1, 10, 100].map(t => { let c = 0; for (let v = 0; v < nv; v++) if (Math.hypot(all[v * 4], all[v * 4 + 1]) > t) c++; return `|∇D| > ${t}: ${c}` })
console.log(`  int scale (p99.99 |∂|) per component ${scale.map(v => v.toFixed(4))} · ${steep.join(' · ')}`)
console.log(`${dir}: ${nv} vertices with aGrad · zw nonzero on ${zwNZ} (${(100 * zwNZ / nv).toFixed(2)}%) · max |∂| per component ${maxAbs.map(v => v.toFixed(3))}`)
const f16 = (x) => { const b = new Float32Array([x]), u = new Uint32Array(b.buffer)[0]; // round to nearest half-float, back to float
  const s = u >>> 31, e = ((u >>> 23) & 255) - 127 + 15, mant = u & 0x7fffff
  if (e <= 0) { const sub = Math.round(Math.abs(x) / 2 ** -24) * 2 ** -24; return s ? -sub : sub }
  if (e >= 31) return s ? -65504 : 65504
  const r = Math.round(mant / 8192) / 1024; return (s ? -1 : 1) * (1 + r) * 2 ** (e - 15) }
const qi = (k, M) => (x) => scale[k] > 0 ? Math.max(-M, Math.min(M, Math.round(x / scale[k] * M))) / M * scale[k] : 0
const i16 = (k) => qi(k, 32767), i8 = (k) => qi(k, 127)
const schemes = [['half-float ×4 (8 B/v)', [f16, f16, f16, f16]], ['int16 ×4, one scale per component per slab (8 B/v)', [0, 1, 2, 3].map(i16)],
  ['int8 ×4, one scale per component per slab (4 B/v)', [0, 1, 2, 3].map(i8)],
  ['half-float ∂D only, zw dropped (4 B/v; exact only where zw is 0)', [f16, f16, () => 0, () => 0]]]
const nrm = (gx, gz) => { const L = Math.hypot(gx, 1, gz); return [-gx / L, 1 / L, -gz / L] }
for (const [name, q] of schemes) for (const e of exags) {
  const ang = new Float64Array(nv)
  for (let v = 0; v < nv; v++) { const a = all.subarray(v * 4, v * 4 + 4)
    const n0 = nrm(a[0] * e + a[2], a[1] * e + a[3]), n1 = nrm(q[0](a[0]) * e + q[2](a[2]), q[1](a[1]) * e + q[3](a[3]))
    ang[v] = Math.acos(Math.min(1, n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2])) * 180 / Math.PI }
  ang.sort(); console.log(`  ${name.padEnd(52)} uExag ${e}: normal error p50 ${ang[nv >> 1].toExponential(2)}° · p99 ${ang[Math.floor(nv * .99)].toExponential(2)}° · max ${ang[nv - 1].toExponential(2)}°`)
}
