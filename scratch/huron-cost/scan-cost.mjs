// The cost of one pass of conformity's T-junction scan (`makeGrid#onSegment`, 4 m cells), modelled on a slab: for every
// boundary edge of the welded union, the cells its bounding box covers and the boundary vertices those cells hold
// (each one a distance test). Read-only; models one pass, not the number of passes.
//   node scratch/huron-cost/scan-cost.mjs <slab dir>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const dir = process.argv[2], CELL = 4
const j = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
const bin = readFileSync(join(dir, 'ground.bin')), ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const wk = (x, z) => (Math.round(x * 1000) + 2 ** 23) * 2 ** 24 + (Math.round(z * 1000) + 2 ** 23)
const cnt = new Map(), pos = new Map()
for (const g of j.groups) {
  if (!g.partition) continue
  const P = new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(ab, g.indexByteOffset, g.indexCount)
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = I[t + k], b = I[t + (k + 1) % 3], ka = wk(P[a * 3], P[a * 3 + 2]), kb = wk(P[b * 3], P[b * 3 + 2]); if (ka === kb) continue
    pos.set(ka, [P[a * 3], P[a * 3 + 2]]); pos.set(kb, [P[b * 3], P[b * 3 + 2]])
    const e = ka < kb ? `${ka}:${kb}` : `${kb}:${ka}`; cnt.set(e, (cnt.get(e) || 0) + 1)
  }
}
const edges = [], bv = new Set()
for (const [e, n] of cnt) if (n === 1) { const [a, b] = e.split(':').map(Number); edges.push([pos.get(a), pos.get(b)]); bv.add(a); bv.add(b) }
const grid = new Map(), ck = (cx, cz) => cx * 1e7 + cz
for (const k of bv) { const [x, z] = pos.get(k), c = ck(Math.floor(x / CELL), Math.floor(z / CELL)); grid.set(c, (grid.get(c) || 0) + 1) }
let cells = 0, tests = 0, top = []
for (const [[ax, az], [bx, bz]] of edges) {
  const x0 = Math.floor(Math.min(ax, bx) / CELL), x1 = Math.floor(Math.max(ax, bx) / CELL), z0 = Math.floor(Math.min(az, bz) / CELL), z1 = Math.floor(Math.max(az, bz) / CELL)
  let c = 0, v = 0
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) { c++; v += grid.get(ck(cx, cz)) || 0 }
  cells += c; tests += v; top.push([v, Math.hypot(bx - ax, bz - az)])
}
top.sort((a, b) => b[0] - a[0])
const share = (n) => top.slice(0, n).reduce((s, [v]) => s + v, 0) / tests
console.log(`${dir}: ${edges.length} boundary edges · ${bv.size} boundary vertices · one scan pass: ${cells} cell visits · ${tests} vertex tests · top 100 edges ${(100 * share(100)).toFixed(1)}% of the tests (longest of them ${Math.max(...top.slice(0, 100).map(t => t[1])).toFixed(0)} m)`)
