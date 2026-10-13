// What the index section would cost under other layouts, read from a slab's own manifest + bin (Brace, 2026-10-13):
//   · Uint16 for a group of ≤ 65,536 vertices (Uint32 kept above it) — no split
//   · Uint16 everywhere, splitting a bigger group into chunks of whole triangles in index order: the vertices each chunk
//     must repeat are counted (and their per-vertex bytes, read from which sections the group carries)
//   · delta + zigzag + LEB128 varint over each group's index stream (decoded on load)
//   · gzip -9 / brotli q11 of the whole bin, for the wire (whether the .bin is served compressed is not established)
//   node scratch/ground-budget/index-bytes.mjs <slab dir> [...]
import { readFileSync } from 'fs'
import { gzipSync, brotliCompressSync, constants } from 'zlib'
for (const dir of process.argv.slice(2)) {
  const m = JSON.parse(readFileSync(dir + '/ground.json', 'utf8')), bin = readFileSync(dir + '/ground.bin')
  const AB = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  let tris = 0, u32 = 0, u16keep = 0, split = 0, dupV = 0, dupB = 0, varint = 0, big = 0
  for (const g of m.groups) {
    const I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), nt = g.indexCount / 3
    const vB = 12 + (g.fieldByteOffset != null ? 8 : 0) + (g.rawByteOffset != null ? 20 : 0)
    tris += nt; u32 += g.indexCount * 4
    u16keep += g.indexCount * (g.vertexCount <= 65536 ? 2 : 4); if (g.vertexCount > 65536) big++
    // split: greedy chunks of whole triangles, each chunk ≤ 65,536 distinct vertices
    if (g.vertexCount <= 65536) split += g.indexCount * 2
    else { let seen = new Set(), owned = new Uint8Array(g.vertexCount), chunkV = 0
      for (let t = 0; t < nt; t++) { const tv = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], add = tv.filter(v => !seen.has(v)).length
        if (seen.size + add > 65536) { seen = new Set() }
        for (const v of tv) if (!seen.has(v)) { seen.add(v); if (owned[v]) { dupV++; dupB += vB } owned[v] = 1 } }
      split += g.indexCount * 2 }
    // delta-varint
    let prev = 0; for (let k = 0; k < I.length; k++) { const d = I[k] - prev; prev = I[k]; let z = d >= 0 ? d * 2 : -d * 2 - 1, n = 1; while (z >= 128) { z = Math.floor(z / 128); n++ } varint += n }
  }
  const gz = gzipSync(bin, { level: 9 }).length, br = brotliCompressSync(bin, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bin.length } }).length
  const b = (x) => `${(x / tris).toFixed(2)} B/tri`
  console.log(`${dir}: ${bin.length} B · ${tris} tris · indices today ${b(u32)} (Uint32)`)
  console.log(`  Uint16 where the group fits, else Uint32: ${b(u16keep)} (${big} group(s) above 65,536 verts)`)
  console.log(`  Uint16 everywhere, big groups split: ${b(split)} indices + ${dupV} repeated vertices (${b(dupB)}) = ${b(split + dupB)}`)
  console.log(`  delta-zigzag-varint: ${b(varint)}`)
  console.log(`  whole bin on the wire: gzip -9 ${gz} B (${(100 * gz / bin.length).toFixed(1)}%) · brotli 11 ${br} B (${(100 * br / bin.length).toFixed(1)}%)`)
}
