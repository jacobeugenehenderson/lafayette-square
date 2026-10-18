// hybrid.mjs — read-only test of a hypothesis: a slab copy whose terrain part is slab A's, except the vertices of the groups NOT
// matched by --road (default asphalt|highway|stripe) where slab B differs, which take B's. node hybrid.mjs <A dir> <B dir> <out dir>
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
const [a, b, out] = process.argv.slice(2), gj = JSON.parse(readFileSync(join(a, 'ground.json'), 'utf8'))
const A = Buffer.from(readFileSync(join(a, gj.bin))), B = readFileSync(join(b, gj.bin)); let n = 0, by = {}
for (const g of gj.groups) { if (g.rawByteOffset == null || /^(asphalt|highway|stripe)$/.test(g.id)) continue
  const ra = new Float32Array(A.buffer, A.byteOffset + g.rawByteOffset, g.vertexCount), rb = new Float32Array(B.buffer, B.byteOffset + g.rawByteOffset, g.vertexCount)
  for (let v = 0; v < g.vertexCount; v++) if (Math.abs(ra[v] - rb[v]) > 1e-4) { ra[v] = rb[v]; n++; by[g.kind + ':' + g.id] = (by[g.kind + ':' + g.id] || 0) + 1 } }
mkdirSync(out, { recursive: true }); writeFileSync(join(out, gj.bin), A); copyFileSync(join(a, 'ground.json'), join(out, 'ground.json')); copyFileSync(join(a, 'shape.json'), join(out, 'shape.json'))
console.log(`hybrid: ${n} non-road vertices take B's · ${Object.entries(by).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
