// slit-producer.mjs — the ground's true gaps (seam edges with nothing 1 mm to one side): are they ON THE LATTICE, and do
// they run along a street CENTRELINE (① is built from back-to-back offsets of each chain at ε)? READ-ONLY.
//   node scratch/ground-height/slit-producer.mjs <town> [n=400]
import { readFileSync } from 'fs'
import { join } from 'path'
import { WELD_QUANTUM_M } from '../../cartograph/groundConformity.js'
const [town, nS = '400'] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname, dir = join(root, 'public/baked', town)
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const ribP = town === 'lafayette-square' ? join(root, 'src/data/ribbons.json') : join(root, 'cartograph/data', town, 'clean/ribbons.json')
const rib = JSON.parse(readFileSync(ribP))
const st = gj.stencil, Q = 1 / WELD_QUANTUM_M, key = (x, z) => `${Math.round(x * Q)},${Math.round(z * Q)}`
const edges = new Map(), tris = [], CELL = 10, grid = new Map()
for (const g of gj.groups.filter(g => g.partition === true)) {
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
// centrelines: every street, alley, path (and the grade-separated) polyline, segment grid
const lines = [...(rib.streets || []), ...(rib.alleys || []), ...(rib.paths || [])].map(s => s.points).filter(p => p?.length >= 2)
const sg = new Map(); const SC = 20
for (const p of lines) for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1]; for (let x = Math.floor(Math.min(a[0], b[0]) / SC); x <= Math.floor(Math.max(a[0], b[0]) / SC); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / SC); z <= Math.floor(Math.max(a[1], b[1]) / SC); z++) { const k = x * 100003 + z; (sg.get(k) || sg.set(k, []).get(k)).push([a, b]) } }
const dLine = (x, z) => { let best = Infinity; const cx = Math.floor(x / SC), cz = Math.floor(z / SC); for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) for (const [a, b] of sg.get(gx * 100003 + gz) || []) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-18, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)) } return best }
const offLattice = (p) => Math.max(Math.abs(p[0] * Q - Math.round(p[0] * Q)), Math.abs(p[1] * Q - Math.round(p[1] * Q))) / Q
const inner = [...edges.values()].filter(r => r.n === 1 && Math.hypot((r.a[0] + r.b[0]) / 2 - st.center[0], (r.a[1] + r.b[1]) / 2 - st.center[1]) < 0.95 * st.radius)
const step = Math.max(1, Math.floor(inner.length / +nS))
const gaps = []
for (let i = 0; i < inner.length; i += step) {
  const r = inner[i], L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); if (L < 1e-6) continue
  const nx = -(r.b[1] - r.a[1]) / L, nz = (r.b[0] - r.a[0]) / L, mx = (r.a[0] + r.b[0]) / 2, mz = (r.a[1] + r.b[1]) / 2
  const s1 = covered(mx + nx * 0.001, mz + nz * 0.001), s2 = covered(mx - nx * 0.001, mz - nz * 0.001)
  if (s1 === s2) continue
  // the gap's width: march into the uncovered side until something covers
  const sgn = s1 ? -1 : 1; let w = null
  for (let d = 0.001; d <= 0.5; d += 0.0005) if (covered(mx + sgn * nx * d, mz + sgn * nz * d)) { w = d; break }
  gaps.push({ g: r.g, L, w, cl: dLine(mx, mz), lat: Math.max(offLattice(r.a), offLattice(r.b)) })
}
const q = (a, ps) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return ps.map(p => s.length ? s[Math.floor(p * (s.length - 1))] : NaN) }
const f = (v, k = 1000, u = ' mm') => Number.isFinite(v) ? (v * k).toFixed(1) + u : '—'
console.log(`${town}: ${gaps.length} true gaps in a sample of ${Math.ceil(inner.length / step)} seam edges`)
const [w50, w90] = q(gaps.map(g => g.w), [0.5, 0.9]); console.log(`  gap width p50 ${f(w50)} p90 ${f(w90)} · wider than 0.5 m (or closed by nothing): ${gaps.filter(g => g.w == null).length}`)
const [c50, c90] = q(gaps.map(g => g.cl), [0.5, 0.9]); console.log(`  distance from the edge's middle to the nearest centreline: p50 ${f(c50)} p90 ${f(c90)} · within 10 mm: ${gaps.filter(g => g.cl < 0.01).length}/${gaps.length}`)
const [l50, l90] = q(gaps.map(g => g.lat), [0.5, 0.9]); console.log(`  edge endpoints off the 1 mm lattice: p50 ${f(l50)} p90 ${f(l90)} (float32 noise is ~0.1–0.25 mm)`)
const by = {}; for (const g of gaps) { const k = `${g.g}|${g.cl < 0.01 ? 'on a centreline' : 'not on a centreline'}`; by[k] = (by[k] || 0) + 1 }
console.log('  by group × centreline:', JSON.stringify(by))
