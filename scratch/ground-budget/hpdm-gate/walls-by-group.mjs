// walls-by-group.mjs — read-only: the wall test (claims-the-ground-meets-its-terrain's: excess > LATTICE_M and > lawn limit × span)
// on a slab's STORED terrain part, by group, with the drawn slope excess and the span. node walls-by-group.mjs <slab dir>…
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
for (const dir of process.argv.slice(2)) {
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const T = loadSceneTerrain(gj.look), raw = T.getElevationRaw, E = T.exag, lawn = resolveLawnNorm(gj.look, null).slopeMax
  const by = new Map(); let all = 0
  for (const g of gj.groups) { if (g.rawByteOffset == null) continue
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
    const ter = new Float64Array(g.vertexCount); for (let v = 0; v < g.vertexCount; v++) ter[v] = raw(P[v * 3], P[v * 3 + 2])
    const rec = { n: 0, tris: I.length / 3, small: 0, ex: [] }
    for (let k = 0; k < I.length; k += 3) { const a = I[k], b = I[k + 1], c = I[k + 2]
      const ex = (Math.max(R[a], R[b], R[c]) - Math.min(R[a], R[b], R[c])) * E - (Math.max(ter[a], ter[b], ter[c]) - Math.min(ter[a], ter[b], ter[c])) * E
      if (!(ex > LATTICE_M)) continue
      const span = Math.max(Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 2] - P[b * 3 + 2]), Math.hypot(P[b * 3] - P[c * 3], P[b * 3 + 2] - P[c * 3 + 2]), Math.hypot(P[c * 3] - P[a * 3], P[c * 3 + 2] - P[a * 3 + 2]))
      if (ex <= lawn * span) continue
      rec.n++; all++; if (ex < 0.05) rec.small++; rec.ex.push(ex) }
    if (rec.n) by.set(`${g.kind}:${g.id}`, rec) }
  console.log(`${dir.split('/').pop()}: ${all} wall(s) · ${[...by].sort((a, b) => b[1].n - a[1].n).slice(0, 9).map(([k, r]) => `${k} ${r.n} (< 5 cm ${r.small}, of ${r.tris} tris)`).join(' · ')}`)
}
