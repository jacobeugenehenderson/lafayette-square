// regions.mjs — who paints each of the ground truth's points (why.mjs's interior points, results-2026-10-14.txt) in a slab.
//   node regions.mjs <slab dir> <town>   → per point: the partition groups whose triangles hold it, and what the truth says
import { readFileSync } from 'fs'
import { join } from 'path'
const [dir, town] = process.argv.slice(2)
const TRUTH = {
  huron: [
    { at: [-1021.284, 2022.914], truth: ['curbCut'], was: 'sidewalk painted twice under curbCut' },
    { at: [197.397, 626.013], truth: ['curbCut'], was: 'sidewalk painted twice under curbCut' },
    { at: [1415.494, 2504.339], truth: ['wood'], was: 'wood painted by no one (even-odd cancelled)' },
    { at: [-884.931, 1193.376], truth: ['agricultural'], was: 'face:underived painted twice under agricultural' },
  ],
  hipointedemun: [{ at: [178.661, 1253.121], truth: ['treelawn:residential'], was: 'treelawn:residential painted by no one' }],
}[town]
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
const gb = readFileSync(join(dir, gj.bin || 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
let bad = 0
for (const p of TRUTH) {
  const hit = []
  for (const g of gj.groups.filter(g => g.partition === true)) {
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
    for (let i = 0; i < I.length; i += 3) {
      const [a, b, c] = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]])
      const s = (u, v) => (v[0] - u[0]) * (p.at[1] - u[1]) - (v[1] - u[1]) * (p.at[0] - u[0])
      const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a)
      if ((d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0)) hit.push(g.id)
    }
  }
  const ok = hit.length === p.truth.length && hit.every((h, i) => h === p.truth[i])
  if (!ok) bad++
  console.log(`  ${ok ? 'as truth' : '⛔ NOT truth'}  (${p.at.join(', ')}) painted by ${hit.join(' + ') || 'NOTHING'} · truth ${p.truth.join(' + ')} · HEAD's defect: ${p.was}`)
}
process.exit(bad ? 1 : 0)
