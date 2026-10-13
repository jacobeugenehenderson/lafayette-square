// Delta-zigzag-varint index decode cost in V8, on a slab's own indices: encode each group, then time decoding into a
// Uint32Array (best of 5 after a warm-up), and prove the round trip byte-identical (Brace, 2026-10-13).
import { readFileSync } from 'fs'
const dir = process.argv[2], m = JSON.parse(readFileSync(dir + '/ground.json', 'utf8')), bin = readFileSync(dir + '/ground.bin')
const AB = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const groups = m.groups.map(g => new Uint32Array(AB, g.indexByteOffset, g.indexCount))
const enc = groups.map(I => { const out = new Uint8Array(I.length * 5); let o = 0, prev = 0
  for (let k = 0; k < I.length; k++) { const d = I[k] - prev; prev = I[k]; let z = d >= 0 ? d * 2 : -d * 2 - 1
    while (z >= 128) { out[o++] = (z & 127) | 128; z = Math.floor(z / 128) } out[o++] = z }
  return out.slice(0, o) })
const decode = (E, n) => { const I = new Uint32Array(n); let o = 0, prev = 0, k = 0
  while (k < n) { let z = 0, s = 1, b; do { b = E[o++]; z += (b & 127) * s; s *= 128 } while (b & 128)
    prev += (z & 1) ? -(z + 1) / 2 : z / 2; I[k++] = prev } return I }
let best = Infinity, out
for (let r = 0; r < 6; r++) { const t = performance.now(); out = enc.map((E, i) => decode(E, groups[i].length)); const dt = performance.now() - t; if (r) best = Math.min(best, dt) }
const ok = out.every((I, i) => I.length === groups[i].length && I.every((v, k) => v === groups[i][k]))
const tris = groups.reduce((s, I) => s + I.length / 3, 0), bytes = enc.reduce((s, E) => s + E.length, 0)
console.log(`${dir}: ${tris} tris · encoded ${bytes} B (${(bytes / tris).toFixed(2)} B/tri) · decode best of 5 ${best.toFixed(1)} ms (${(best * 1e6 / tris).toFixed(1)} ns/tri) · round trip ${ok ? 'identical' : '⛔ DIFFERS'}`)
