// site-dump.mjs — every partition triangle with a corner within R of (x, z) on a served slab, in mm about the site. Read-only.
//   node site-dump.mjs <town> <x> <z> [R m = 0.02]
import { readFileSync } from 'fs'
const [town, sx, sz, r] = process.argv.slice(2), x0 = Number(sx), z0 = Number(sz), R = Number(r || 0.02)
const dir = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/public/baked/' + town, gj = JSON.parse(readFileSync(dir + '/ground.json', 'utf8')), b = readFileSync(dir + '/' + (gj.bin || 'ground.bin'))
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
for (const g of gj.groups.filter(g => g.partition)) { const P = new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(ab, g.indexByteOffset, g.indexCount)
  for (let t = 0; t < I.length; t += 3) { const v = [0, 1, 2].map(k => [P[I[t + k] * 3], P[I[t + k] * 3 + 2]])
    if (v.some(([x, z]) => Math.hypot(x - x0, z - z0) < R)) console.log(g.id.padEnd(22), v.map(([x, z]) => `(${((x - x0) * 1000).toFixed(2)}, ${((z - z0) * 1000).toFixed(2)})`).join(' ')) } }
