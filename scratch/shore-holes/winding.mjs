// Ground triangles that FACE DOWN (Argon, read-only): in a y-up scene an upward triangle's normal (b−a)×(c−a) has y > 0;
// one with y < 0 is culled from above by a single-sided material — a triangle-shaped hole. Per group, and near points.
//   node scratch/shore-holes/winding.mjs <town> [x,z,r …]
import { readFileSync } from 'node:fs'
const [town, ...pts] = process.argv.slice(2)
const g = JSON.parse(readFileSync(`public/baked/${town}/ground.json`, 'utf8')), bin = readFileSync(`public/baked/${town}/ground.bin`)
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const near = pts.map((s) => s.split(',').map(Number)), nearN = near.map(() => ({ down: 0, all: 0 }))
let total = 0, down = 0, degen = 0; const per = []
for (const grp of g.groups) {
  const pos = new Float32Array(ab, grp.vertexByteOffset, grp.vertexCount * 3), idx = new Uint32Array(ab, grp.indexByteOffset, grp.indexCount)
  let d = 0, n = 0, z0 = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2]
    const ny = uz * vx - ux * vz   // y of (b−a)×(c−a)
    n++; if (Math.abs(ny) < 1e-9) { z0++; continue } if (ny < 0) d++
    const cx = (pos[a] + pos[b] + pos[c]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3
    near.forEach(([x, z, r], k) => { if (Math.hypot(cx - x, cz - z) <= r) { nearN[k].all++; if (ny < 0) nearN[k].down++ } })
  }
  total += n; down += d; degen += z0
  if (d) per.push(`${grp.kind}:${grp.id} ${d}/${n}`)
}
console.log(`${town}: ${down} of ${total} ground triangles face DOWN · ${degen} degenerate`)
console.log('  by group (down/all):', per.join(' · ') || 'none')
near.forEach(([x, z, r], k) => console.log(`  within ${r} m of (${x}, ${z}): ${nearN[k].down} down of ${nearN[k].all}`))
