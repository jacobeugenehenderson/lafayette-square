// quantize.mjs — WHAT WOULD THE FAR SHORE WEIGH QUANTIZED? (Boz, 2026-10-29, for Jacob's ruling on the nested lattice's bytes.)
// Read-only, off the baked bins (public/baked/<id>/revetment-far*.bin + the table). Per chunk, in the bin's own order:
//   · positions (far and band) to 16 bits per axis within the chunk's own bounds; max error reported, against 1 mm
//   · normals octahedral, 2 × int16 (and 2 × int8 for comparison); max angle error reported
//   · pins as before (f32 × 4), the band's normal as before, the index u16 where a chunk has < 65,536 vertices
// gzip is node's zlib default level, the same measure the bake prints. Nothing is written.
// ▶ node scratch/far-shore/quantize.mjs --look=<id>
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
const look = process.argv.find(a => a.startsWith('--look='))?.slice(7), dir = `public/baked/${look}`
const doc = JSON.parse(readFileSync(`${dir}/revetment-far.json`, 'utf8'))
const bins = Object.fromEntries(['revetment-far.bin', 'revetment-far-unseen.bin'].map(n => { const b = readFileSync(`${dir}/${n}`); return [n, b] }))
const f32 = (b, o, n) => new Float32Array(b.buffer.slice(b.byteOffset + o, b.byteOffset + o + n * 4))
let posErr = 0, bandErr = 0, n16Err = 0, n8Err = 0
const q16 = (P) => { const v = P.length / 3, out = new Uint16Array(P.length)
  for (let c = 0; c < 3; c++) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < v; i++) { lo = Math.min(lo, P[i * 3 + c]); hi = Math.max(hi, P[i * 3 + c]) }
    const s = hi > lo ? (hi - lo) / 65535 : 1
    for (let i = 0; i < v; i++) { const q = Math.round((P[i * 3 + c] - lo) / s); out[i * 3 + c] = q; const e = Math.abs(lo + q * s - P[i * 3 + c]); if (P === cur.pos) posErr = Math.max(posErr, e); else bandErr = Math.max(bandErr, e) } }
  return out }
const oct = (N, bits) => { const v = N.length / 3, M = 2 ** (bits - 1) - 1, out = bits === 16 ? new Int16Array(v * 2) : new Int8Array(v * 2)
  for (let i = 0; i < v; i++) { let x = N[i * 3], y = N[i * 3 + 1], z = N[i * 3 + 2]; const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; x /= l; y /= l; z /= l
    let u = x, w = z; if (y < 0) { u = (1 - Math.abs(z)) * Math.sign(x || 1); w = (1 - Math.abs(x)) * Math.sign(z || 1) }
    const qu = Math.round(u * M), qw = Math.round(w * M); out[i * 2] = qu; out[i * 2 + 1] = qw
    // decode, and the angle to the original
    let du = qu / M, dw = qw / M, dy = 1 - Math.abs(du) - Math.abs(dw), dx = du, dz = dw
    if (dy < 0) { dx = (1 - Math.abs(dw)) * Math.sign(du || 1); dz = (1 - Math.abs(du)) * Math.sign(dw || 1) }
    const dl = Math.hypot(dx, dy, dz), ol = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1
    const a = Math.acos(Math.max(-1, Math.min(1, (dx * N[i * 3] + dy * N[i * 3 + 1] + dz * N[i * 3 + 2]) / (dl * ol)))) * 180 / Math.PI
    if (bits === 16) n16Err = Math.max(n16Err, a); else n8Err = Math.max(n8Err, a) }
  return out }
let cur = null
const buf = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)
for (const name of Object.keys(bins)) {
  const b = bins[name], q = [], q8 = []
  for (const c of doc.chunks.filter(c => c.bin === name)) {
    const v = c.vertexCount, o = c.offsets
    cur = { pos: f32(b, o.pos, v * 3), band: f32(b, o.band, v * 3), normal: f32(b, o.normal, v * 3) }
    const pos = q16(cur.pos), band = q16(cur.band), n16 = oct(cur.normal, 16), n8 = oct(cur.normal, 8)
    const pin = b.subarray(o.pin, o.pin + v * 16), up = b.subarray(o.bandNormal, o.bandNormal + v * 12)
    const I = new Uint32Array(b.buffer.slice(b.byteOffset + o.index, b.byteOffset + o.index + c.indexCount * 4)), idx = v < 65536 ? Uint16Array.from(I) : I
    q.push(buf(pos), buf(n16), pin, buf(band), up, buf(idx)); q8.push(buf(pos), buf(n8), pin, buf(band), up, buf(idx))
  }
  const mb = (x) => (gzipSync(x).length / 1e6).toFixed(2)
  console.log(`  ${look} ${name}: gzip ${mb(b)} MB as baked → ${mb(Buffer.concat(q))} MB quantized (normals oct16) · ${mb(Buffer.concat(q8))} MB (oct8)`)
}
console.log(`  ${look}: max position error ${(posErr * 1000).toFixed(3)} mm (band ${(bandErr * 1000).toFixed(3)} mm), against the 1 mm lattice · normal error oct16 ${n16Err.toFixed(3)}°, oct8 ${n8Err.toFixed(2)}°`)
