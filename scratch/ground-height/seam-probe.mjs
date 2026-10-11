// seam-probe.mjs — for a sample of the tiling check's interior seam edges, is the ground on EACH side of the edge
// covered? A seam with an uncovered side is a true gap (a sliver of nothing); one covered on both sides is a seam the
// welding missed but no ray can pass. READ-ONLY.   node scratch/ground-height/seam-probe.mjs <town> [n=300] [offMm=1]
import { readFileSync } from 'fs'
import { join } from 'path'
import { WELD_QUANTUM_M } from '../../cartograph/groundConformity.js'
const [town, nS = '300', offS = '1'] = process.argv.slice(2), OFF = +offS / 1000
const dir = join(new URL('../../public/baked/', import.meta.url).pathname, town)
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const groups = gj.groups.filter(g => g.partition === true), st = gj.stencil
const Q = 1 / WELD_QUANTUM_M, key = (x, z) => `${Math.round(x * Q)},${Math.round(z * Q)}`
const edges = new Map(), tris = [], CELL = 10, grid = new Map()
for (const g of groups) {
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) {
    const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]]); const t = tris.push(v) - 1
    const x0 = Math.floor(Math.min(v[0][0], v[1][0], v[2][0]) / CELL), x1 = Math.floor(Math.max(v[0][0], v[1][0], v[2][0]) / CELL)
    const z0 = Math.floor(Math.min(v[0][1], v[1][1], v[2][1]) / CELL), z1 = Math.floor(Math.max(v[0][1], v[1][1], v[2][1]) / CELL)
    if ((x1 - x0 + 1) * (z1 - z0 + 1) < 20000) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 100003 + z; (grid.get(k) || grid.set(k, []).get(k)).push(t) }
    for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3], ka = key(...a), kb = key(...b); if (ka === kb) continue; const k = ka < kb ? ka + '|' + kb : kb + '|' + ka; const r = edges.get(k); if (r) r.n++; else edges.set(k, { n: 1, a, b, g: g.id }) }
  }
}
const covered = (x, z) => { for (const t of grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || []) { const [a, b, c] = tris[t]; const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-14) continue; const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d; if (l1 >= -1e-9 && l2 >= -1e-9 && 1 - l1 - l2 >= -1e-9) return true } return false }
const inner = [...edges.values()].filter(r => r.n === 1 && Math.hypot((r.a[0] + r.b[0]) / 2 - st.center[0], (r.a[1] + r.b[1]) / 2 - st.center[1]) < 0.95 * st.radius)
const step = Math.max(1, Math.floor(inner.length / +nS))
let both = 0, one = 0, none = 0, oneM = 0, sampledM = 0
const gapBy = {}
for (let i = 0; i < inner.length; i += step) {
  const r = inner[i], L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); if (L < 1e-6) continue
  const nx = -(r.b[1] - r.a[1]) / L, nz = (r.b[0] - r.a[0]) / L, mx = (r.a[0] + r.b[0]) / 2, mz = (r.a[1] + r.b[1]) / 2
  const s1 = covered(mx + nx * OFF, mz + nz * OFF), s2 = covered(mx - nx * OFF, mz - nz * OFF)
  sampledM += L
  if (s1 && s2) both++; else if (s1 || s2) { one++; oneM += L; gapBy[r.g] = (gapBy[r.g] || 0) + 1 } else none++
}
console.log(`${town}: ${inner.length} interior seam edges (inside 0.95 R); sampled ${both + one + none} at ±${OFF * 1000} mm off their middle:`)
console.log(`  covered on BOTH sides (no gap at ${OFF * 1000} mm) ${both} · ONE side uncovered (a true gap) ${one} · neither ${none}`)
console.log(`  true gaps by the edge's group: ${JSON.stringify(gapBy)}`)
