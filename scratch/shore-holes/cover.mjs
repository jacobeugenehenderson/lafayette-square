// Which ground groups cover a point in plan (Argon, read-only): public/baked/<town>/ground.{json,bin}, every triangle of
// every group, point-in-triangle in XZ — and, where covered, the group's drawn raw height there (barycentric y + terrain).
//   node scratch/shore-holes/cover.mjs <town> x,z [x,z …]
import { readFileSync } from 'node:fs'
const [town, ...pts] = process.argv.slice(2)
const g = JSON.parse(readFileSync(`public/baked/${town}/ground.json`, 'utf8')), bin = readFileSync(`public/baked/${town}/ground.bin`)
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const P = pts.map((s) => s.split(',').map(Number))
const hits = P.map(() => [])
for (const grp of g.groups) {
  const pos = new Float32Array(ab, grp.vertexByteOffset, grp.vertexCount * 3), idx = new Uint32Array(ab, grp.indexByteOffset, grp.indexCount)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2]
    const minx = Math.min(ax, bx, cx), maxx = Math.max(ax, bx, cx), minz = Math.min(az, bz, cz), maxz = Math.max(az, bz, cz)
    P.forEach(([x, z], k) => {
      if (x < minx || x > maxx || z < minz || z > maxz) return
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (!d) return
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) return
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
      hits[k].push(`${grp.kind}:${grp.id}${ny < 0 ? ' [FACES DOWN]' : ''}`)
    })
  }
}
P.forEach(([x, z], k) => console.log(`(${x}, ${z}): ${hits[k].length ? [...new Set(hits[k])].join(', ') : '⛔ NO ground triangle covers it'}`))
