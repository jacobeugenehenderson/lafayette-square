// groups-at.mjs --slabs=a,b --at='x,z;…' [--r=2] — per site, the groups each slab draws within r (vertex counts)
import { readFileSync } from 'fs'
import { join } from 'path'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const r = +(arg('r') || 2), AT = arg('at').split(';').map(p => p.split(',').map(Number))
for (const dir of arg('slabs').split(',')) { const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  console.log(`== ${dir.split('/').at(-1)}`)
  for (const [x, z] of AT) { const by = new Map()
    for (const g of gj.groups) { const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3); let n = 0
      for (let v = 0; v < g.vertexCount; v++) if (Math.hypot(P[v * 3] - x, P[v * 3 + 2] - z) <= r) n++
      if (n) by.set(`${g.kind}:${g.id}`, n) }
    console.log(`  (${x}, ${z}): ${[...by].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(' · ') || 'nothing'}`) } }
