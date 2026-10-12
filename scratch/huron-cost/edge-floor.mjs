// Per ped group of a slab: the longest-edge distribution of its triangles, against the refine floor (minEdge) the
// slab's groundShape records. A triangle whose longest edge is ≤ 2× minEdge stopped at (or one bisection from) the
// floor; above that, the tolerance stopped it. Read-only.
//   node scratch/huron-cost/edge-floor.mjs <slab dir>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const dir = process.argv[2]
const j = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
const bin = readFileSync(join(dir, 'ground.bin'))
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const ped = (k) => /^(sidewalk|curb|curbCut|treelawn:.*)$/.test(k)
const rows = []
for (const g of j.groups) {
  const key = `${g.kind}:${g.id}`
  const sh = j.groundShape.groups[key]; if (!sh) continue
  const P = new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(ab, g.indexByteOffset, g.indexCount)
  const min = sh.minEdgeM ?? 0
  const bins = [0, 0, 0, 0]   // ≤ 1.01×min · ≤ 2.02×min · ≤ 6 m · > 6 m
  let n = 0
  for (let t = 0; t < I.length; t += 3) {
    let L = 0
    for (let k = 0; k < 3; k++) { const a = I[t + k] * 3, b = I[t + (k + 1) % 3] * 3; L = Math.max(L, Math.hypot(P[a] - P[b], P[a + 2] - P[b + 2])) }
    n++; bins[L <= 1.01 * min ? 0 : L <= 2.02 * min ? 1 : L <= 6 ? 2 : 3]++
  }
  rows.push({ key, ped: ped(g.id) || ped(key.slice(4)), n, min, bins })
}
const sum = (f) => rows.filter(f).reduce((s, r) => { s.n += r.n; r.bins.forEach((v, i) => s.bins[i] += v); return s }, { n: 0, bins: [0, 0, 0, 0] })
for (const [lab, f] of [['ped bands', r => r.ped], ['everything else', r => !r.ped]]) {
  const s = sum(f)
  console.log(`${lab}: ${s.n} tris · longest ≤ 1.01×floor ${s.bins[0]} · ≤ 2.02×floor ${s.bins[1]} · ≤ 6 m ${s.bins[2]} · > 6 m ${s.bins[3]}`)
}
for (const r of rows.filter(r => r.ped).sort((a, b) => b.n - a.n).slice(0, 4)) console.log(`   ${r.key} (floor ${r.min.toFixed(3)} m): ${r.n} · ${r.bins.join(' / ')}`)
