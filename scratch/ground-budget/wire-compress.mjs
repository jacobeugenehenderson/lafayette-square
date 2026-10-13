// Serving a slab compressed: size and decompress time (Node zlib, native like the browser's; a proxy, not the browser)
// for brotli q11 / q5 and gzip -9 on a slab's own bin (Brace, 2026-10-13). Read-only.
import { readFileSync } from 'fs'
import { gzipSync, gunzipSync, brotliCompressSync, brotliDecompressSync, constants as C } from 'zlib'
for (const dir of process.argv.slice(2)) {
  const bin = readFileSync(dir + '/ground.bin')
  for (const [name, comp, dec] of [
    ['brotli q11', b => brotliCompressSync(b, { params: { [C.BROTLI_PARAM_QUALITY]: 11, [C.BROTLI_PARAM_SIZE_HINT]: b.length } }), brotliDecompressSync],
    ['brotli q5', b => brotliCompressSync(b, { params: { [C.BROTLI_PARAM_QUALITY]: 5, [C.BROTLI_PARAM_SIZE_HINT]: b.length } }), brotliDecompressSync],
    ['gzip -9', b => gzipSync(b, { level: 9 }), gunzipSync]]) {
    let t = performance.now(); const c = comp(bin); const ct = performance.now() - t
    let best = Infinity; for (let r = 0; r < 4; r++) { t = performance.now(); const d = dec(c); best = Math.min(best, performance.now() - t); if (d.length !== bin.length) throw new Error('round trip') }
    console.log(`${dir} ${bin.length} B · ${name}: ${c.length} B (${(100 * c.length / bin.length).toFixed(1)}%) · compress ${(ct / 1000).toFixed(1)} s · decompress ${best.toFixed(0)} ms`)
  }
}
