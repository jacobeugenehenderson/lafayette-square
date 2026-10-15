// mounds-at.mjs — where HPDM's known mounds (scratch/ground-height/mounds-hipointedemun.json, lidar rise ≥ 1 m behind a
// walk) sit on the distance-from-① curve. The station is ON the run (①); the walk's back edge wb is re-read on the served
// slab with mounds.mjs's own group test; the mound's 10% point is at wb + offset, its 90% at wb + offset + run.
import { readFileSync } from 'fs'
const root = new URL('../../../', import.meta.url).pathname
const rows = JSON.parse(readFileSync(root + 'scratch/ground-height/mounds-hipointedemun.json'))
const gj = JSON.parse(readFileSync(root + 'public/baked/hipointedemun/ground.json'))
const gb = readFileSync(root + 'public/baked/hipointedemun/ground.bin'); const AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const CELL = 10, grid = new Map()
for (const g of gj.groups) { if (g.partition === false) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) { const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]])
    const x0 = Math.floor(Math.min(v[0][0], v[1][0], v[2][0]) / CELL), x1 = Math.floor(Math.max(v[0][0], v[1][0], v[2][0]) / CELL), z0 = Math.floor(Math.min(v[0][1], v[1][1], v[2][1]) / CELL), z1 = Math.floor(Math.max(v[0][1], v[1][1], v[2][1]) / CELL)
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4000) continue
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 100003 + z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([g.id, v]) } } }
function groupAt(x, z) { for (const [id, [a, b, c]] of grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || []) {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-12) continue
  const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d
  if (l1 >= -1e-7 && l2 >= -1e-7 && 1 - l1 - l2 >= -1e-7) return id } return null }
const M = rows.filter(r => r.lid.rise >= 1), out = []
let noWalk = 0
for (const r of M) { let wf = null, wb = null
  for (let d = 0.25; d <= 45; d += 0.25) { const g = groupAt(r.x + r.n[0] * d, r.z + r.n[1] * d); if (g === 'sidewalk') { if (wf == null) wf = d; wb = d } else if (wf != null) break }
  if (wb == null) { noWalk++; continue }
  out.push({ start: wb + r.lid.offset, end: wb + r.lid.offset + r.lid.run, wb }) }
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))] }
const B = 4.9965
console.log(`HPDM mounds (lidar rise ≥ 1 m behind a walk): ${M.length} stations of ${rows.length} · walk re-found on the served slab at ${out.length} (${noWalk} not)`)
for (const [k, lab] of [['wb', 'walk back edge'], ['start', 'mound 10% point'], ['end', 'mound 90% point']]) { const a = out.map(o => o[k]); console.log(`  ${lab.padEnd(16)} from ①: p10 ${q(a, .1).toFixed(2)} · p50 ${q(a, .5).toFixed(2)} · p90 ${q(a, .9).toFixed(2)} m`) }
console.log(`  10% point inside walk back + B (${B} m, one grid step): ${out.filter(o => o.start <= o.wb + B).length} of ${out.length} · 90% point inside it: ${out.filter(o => o.end <= o.wb + B).length}`)
