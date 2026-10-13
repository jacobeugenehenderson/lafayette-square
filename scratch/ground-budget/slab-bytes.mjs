// Per-section byte accounting of a ground slab, read from its own manifest (never restated).
// usage: node scratch/ground-budget/slab-bytes.mjs <dir holding ground.json + ground.bin> [...]
import { readFileSync, statSync } from 'fs'
import { join } from 'path'
for (const dir of process.argv.slice(2)) {
  const m = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf-8'))
  const bytes = statSync(join(dir, 'ground.bin')).size
  let v = 0, idx = 0, fieldV = 0, rawV = 0
  for (const g of m.groups) { v += g.vertexCount; idx += g.indexCount; if (g.fieldByteOffset != null) fieldV += g.vertexCount; if (g.rawByteOffset != null) rawV += g.vertexCount }
  const tris = idx / 3
  const sec = { positions: v * 12, indices: idx * 4, fieldId: fieldV * 4, fieldEdge: fieldV * 4, terrainRaw: rawV * 4, terrainGrad: rawV * 16 }
  const sum = Object.values(sec).reduce((a, b) => a + b, 0)
  console.log(`${dir}\n  bytes ${bytes} (sections sum ${sum}${sum === bytes ? '' : ' ⛔ MISMATCH'}) · tris ${tris} · verts ${v} · v/tri ${(v / tris).toFixed(3)} · B/tri ${(bytes / tris).toFixed(2)}`)
  for (const [k, b] of Object.entries(sec)) console.log(`    ${k.padEnd(12)} ${String(b).padStart(10)} B  ${(b / tris).toFixed(2)} B/tri  ${(100 * b / bytes).toFixed(1)}%`)
  console.log(`  groups ${m.groups.length} · partition-only verts ${m.groups.filter(g => g.partition).reduce((s, g) => s + g.vertexCount, 0)} · deform ${m.deform ? 'yes' : 'no'} · shore ${m.shore ? JSON.stringify(m.shore).slice(0, 80) : 'none'}`)
}
