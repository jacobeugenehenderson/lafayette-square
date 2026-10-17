// wall-cells.mjs — WHERE the drawn walls are (a triangle rising > --lim m more than the terrain under it, drawn-vs-terrain.mjs's
// rule), as 2 m cells, for two slabs: cells in both, in A only, in B only. Read-only.
//   node --max-old-space-size=8192 scratch/ground-budget/simplify/wall-cells.mjs --a=<dir> --b=<dir> [--lim=0.5] [--cell=2]
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const LIM = +(arg('lim') || 0.5), C = +(arg('cell') || 2)
const cells = (dir) => {
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const T = loadSceneTerrain(gj.look), E = T.exag, out = new Map()
  for (const g of gj.groups) {   // a group with no aRaw is on the texture path: its lift is the terrain field at the vertex
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
    const R = g.rawByteOffset == null ? Float32Array.from({ length: g.vertexCount }, (_, v) => T.getElevationRaw(P[v * 3], P[v * 3 + 2])) : new Float32Array(AB, g.rawByteOffset, g.vertexCount)
    for (let k = 0; k < I.length; k += 3) { const vs = [I[k], I[k + 1], I[k + 2]], h = vs.map(v => P[v * 3 + 1] + R[v] * E), t = vs.map(v => T.getElevationRaw(P[v * 3], P[v * 3 + 2]) * E)
      const ex = (Math.max(...h) - Math.min(...h)) - (Math.max(...t) - Math.min(...t)); if (!(ex > LIM)) continue
      const cx = vs.reduce((s, v) => s + P[v * 3], 0) / 3, cz = vs.reduce((s, v) => s + P[v * 3 + 2], 0) / 3, key = `${Math.floor(cx / C)},${Math.floor(cz / C)}`
      const prev = out.get(key); if (!prev || prev.ex < ex) out.set(key, { ex, at: `${g.id} (${cx.toFixed(1)}, ${cz.toFixed(1)}) ${ex.toFixed(2)} m` }) } }
  return out }
const A = cells(arg('a')), B = cells(arg('b'))
const onlyA = [...A].filter(([k]) => !B.has(k)), onlyB = [...B].filter(([k]) => !A.has(k)), both = [...A.keys()].filter(k => B.has(k)).length
console.log(`wall cells (${C} m, > ${LIM} m): A ${A.size} · B ${B.size} · both ${both} · A only ${onlyA.length} · B only ${onlyB.length}`)
for (const [n, L] of [['A only', onlyA], ['B only', onlyB]]) { L.sort((x, y) => y[1].ex - x[1].ex); for (const [, v] of L.slice(0, 5)) console.log(`   ${n}: ${v.at}`) }
