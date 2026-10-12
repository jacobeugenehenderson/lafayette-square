// Sub-lattice twins in a slab's partition: distinct float32 XZ positions that share one 1 mm weld key (the key
// findTJunctions welds by). conformAndRefine's closer tells its vertices apart by id and never welds a refinement
// midpoint, so at a twin the closer and the detector can disagree about which vertices are on the boundary. Read-only.
//   node scratch/huron-cost/weld-twins.mjs <slab dir>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const dir = process.argv[2]
const j = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
const bin = readFileSync(join(dir, 'ground.bin')), ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const byKey = new Map()
let verts = 0
for (const g of j.groups) {
  if (!g.partition) continue
  const P = new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3)
  for (let i = 0; i < g.vertexCount; i++) {
    const x = P[i * 3], z = P[i * 3 + 2], k = Math.round(x * 1000) * 1e8 + Math.round(z * 1000), e = x + ',' + z
    let s = byKey.get(k); if (!s) byKey.set(k, s = new Map()); if (!s.has(e)) s.set(e, `${g.kind}:${g.id}`); verts++
  }
}
let twins = 0, keys = 0; const by = new Map(); let ex = null
for (const s of byKey.values()) if (s.size > 1) { keys++; twins += s.size; const gs = [...new Set(s.values())].sort().join(' + '); by.set(gs, (by.get(gs) || 0) + 1); ex ??= [...s.keys()] }
console.log(`${dir}: ${verts} partition vertices · ${byKey.size} weld keys · ${keys} key(s) holding ${twins} distinct positions`)
for (const [gs, n] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${n} · ${gs}`)
if (ex) console.log(`   e.g. ${ex.join(' · ')}`)
