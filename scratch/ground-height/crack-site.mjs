// crack-site.mjs — at one point: the ground triangle covering it, and every other group's vertex within 20 mm of that
// triangle's edges (a near-T), with its offset and the height step it makes at exag 1. READ-ONLY.
//   node scratch/ground-height/crack-site.mjs <slab dir> <scene> <x> <z>
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'
const [dir, scene, X, Z] = [process.argv[2], process.argv[3], +process.argv[4], +process.argv[5]]
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const r = loadSceneTerrain(scene).getElevationRaw
const G = gj.groups.map(g => ({ id: g.id, P: new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I: new Uint32Array(AB, g.indexByteOffset, g.indexCount), part: g.partition }))
let hit = null
for (const g of G) for (let i = 0; i < g.I.length && !hit; i += 3) {
  const v = [g.I[i], g.I[i + 1], g.I[i + 2]].map(k => [g.P[k * 3], g.P[k * 3 + 2]]); const [a, b, c] = v
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-12) continue
  const l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Z - c[1])) / d, l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Z - c[1])) / d
  if (l1 >= 0 && l2 >= 0 && 1 - l1 - l2 >= 0 && g.part !== false) hit = { g: g.id, v }
}
if (!hit) { console.log(`${dir}: NOTHING covers (${X}, ${Z})`); process.exit(0) }
const L = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1])
console.log(`${dir.split('/').slice(-2).join('/')}: (${X}, ${Z}) is covered by ${hit.g}, edges ${[0, 1, 2].map(e => L(hit.v[e], hit.v[(e + 1) % 3]).toFixed(2)).join(' / ')} m`)
let n = 0, maxStep = 0
for (let e = 0; e < 3; e++) {
  const A = hit.v[e], B = hit.v[(e + 1) % 3], dx = B[0] - A[0], dz = B[1] - A[1], LL = Math.hypot(dx, dz)
  for (const g of G) { if (g.id === hit.g || g.part === false) continue
    for (let k = 0; k < g.P.length / 3; k++) { const p = [g.P[k * 3], g.P[k * 3 + 2]], t = ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / (LL * LL); if (t <= 0.001 || t >= 0.999) continue
      const off = Math.abs((p[0] - A[0]) * dz - (p[1] - A[1]) * dx) / LL; if (off > 0.02 || off < 1e-9) continue
      const step = Math.abs(r(...A) * (1 - t) + r(...B) * t - r(...p)); maxStep = Math.max(maxStep, step); n++ } }
}
console.log(`  other groups' vertices 0–20 mm off its edges (not on them): ${n} · largest height step at exag 1: ${maxStep.toFixed(3)} m`)
