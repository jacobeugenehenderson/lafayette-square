// inspect-tris.mjs — dump the sidewalk triangles near (x,z): vertices, raw terrain at each, y, edge lengths.
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'
const [scene, X, Z, R = 6, grp = 'sidewalk'] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname
const slab = join(root, 'public/baked', scene)
const gj = JSON.parse(readFileSync(join(slab, 'ground.json')))
const gb = readFileSync(join(slab, 'ground.bin')); const AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const T = loadSceneTerrain(scene)
for (const g of gj.groups.filter(g => g.id === grp)) {
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  let n = 0
  for (let i = 0; i < I.length && n < 12; i += 3) {
    const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]])
    const mx = (v[0][0] + v[1][0] + v[2][0]) / 3, mz = (v[0][2] + v[1][2] + v[2][2]) / 3
    if (Math.hypot(mx - X, mz - Z) > R) continue
    n++
    const e = [0, 1, 2].map(k => Math.hypot(v[k][0] - v[(k + 1) % 3][0], v[k][2] - v[(k + 1) % 3][2]).toFixed(2))
    const area = Math.abs((v[1][0] - v[0][0]) * (v[2][2] - v[0][2]) - (v[2][0] - v[0][0]) * (v[1][2] - v[0][2])) / 2
    console.log(`tri ${i / 3} area ${area.toFixed(3)} edges ${e}  ` + v.map(p => `(${p[0].toFixed(2)},${p[2].toFixed(2)}) y${p[1].toFixed(3)} raw${T.getElevationRaw(p[0], p[2]).toFixed(3)}`).join('  '))
  }
}
