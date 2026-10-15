// seam-coincide.mjs — the tiles check's interior seams that are COVERED ON BOTH SIDES: is the far side's edge the same
// edge (endpoints within float32 noise, keyed apart by the 1 mm lattice's rounding) or a genuinely offset one? READ-ONLY.
//   node scratch/ground-height/seam-coincide.mjs <slab dir>
import { readFileSync } from 'fs'
import { join } from 'path'
import { LATTICE_M as WELD_QUANTUM_M } from '../../src/lib/lattice.js'
const dir = process.argv[2]
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const st = gj.stencil, Q = 1 / WELD_QUANTUM_M, key = (x, z) => `${Math.round(x * Q)},${Math.round(z * Q)}`
const edges = new Map()
for (const g of gj.groups.filter(g => g.partition === true)) {
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) for (let e = 0; e < 3; e++) {
    const a = I[i + e], b = I[i + (e + 1) % 3], A = [P[a * 3], P[a * 3 + 2]], B = [P[b * 3], P[b * 3 + 2]]
    const ka = key(...A), kb = key(...B); if (ka === kb) continue
    const k = ka < kb ? ka + '|' + kb : kb + '|' + ka, r = edges.get(k); if (r) r.n++; else edges.set(k, { n: 1, A, B, g: g.id })
  }
}
const once = [...edges.values()].filter(r => r.n === 1 && Math.hypot((r.A[0] + r.B[0]) / 2 - st.center[0], (r.A[1] + r.B[1]) / 2 - st.center[1]) < 0.95 * st.radius)
// grid the once-edges by midpoint
const C = 2, grid = new Map(); const ck = (x, z) => `${Math.floor(x / C)},${Math.floor(z / C)}`
for (const r of once) { const k = ck((r.A[0] + r.B[0]) / 2, (r.A[1] + r.B[1]) / 2); (grid.get(k) || grid.set(k, []).get(k)).push(r) }
const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
let twin = 0, twinMax = 0, none = 0; const offs = [], pairs = {}
for (const r of once) {
  const mx = (r.A[0] + r.B[0]) / 2, mz = (r.A[1] + r.B[1]) / 2, cx = Math.floor(mx / C), cz = Math.floor(mz / C)
  let best = Infinity, bo = null
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const o of grid.get(`${x},${z}`) || []) {
    if (o === r) continue
    const e = Math.max(Math.min(d(r.A, o.A), d(r.A, o.B)), Math.min(d(r.B, o.A), d(r.B, o.B)))
    if (e < best) { best = e; bo = o }
  }
  if (best < 0.002) { twin++; twinMax = Math.max(twinMax, best); offs.push(best); const k = [r.g, bo.g].sort().join(' | '); pairs[k] = (pairs[k] || 0) + 1 }
  else none++
}
offs.sort((a, b) => a - b)
console.log(`${dir}: ${once.length} interior once-used edge(s) (inside 0.95 R)`)
console.log(`  with a TWIN (another once-used edge whose two ends lie within 2 mm of its own): ${twin} · endpoint offset p50 ${(offs[Math.floor(offs.length / 2)] * 1000).toFixed(3)} mm p99 ${(offs[Math.floor(offs.length * 0.99)] * 1000).toFixed(3)} mm max ${(twinMax * 1000).toFixed(3)} mm`)
console.log(`  without a twin: ${none}`)
console.log(`  twin pairs by group: ${Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
// the no-twin edges: what lies across them? the nearest OTHER-group vertex to the edge's interior, and the nearest
// other once-edge's distance from this edge's midpoint (parallel offset)
const allV = []
for (const g of gj.groups.filter(g => g.partition === true)) { const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3); for (let v = 0; v < g.vertexCount; v++) allV.push([P[v * 3], P[v * 3 + 2], g.id]) }
const VG = new Map(); for (const v of allV) { const k = ck(v[0], v[1]); (VG.get(k) || VG.set(k, []).get(k)).push(v) }
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return [Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dz), u] }
const noTwin = once.filter(r => { const mx = (r.A[0] + r.B[0]) / 2, mz = (r.A[1] + r.B[1]) / 2, cx = Math.floor(mx / C), cz = Math.floor(mz / C)
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const o of grid.get(`${x},${z}`) || []) { if (o === r) continue
    if (Math.max(Math.min(d(r.A, o.A), d(r.A, o.B)), Math.min(d(r.B, o.A), d(r.B, o.B))) < 0.002) return false } return true })
const hist = { interiorVertexWithin5mm: 0, interiorVertex5to20mm: 0, parallelOnceEdgeWithin2mm: 0, nothingNear: 0 }; const ex = []
for (const r of noTwin.slice(0, 3000)) {
  const L = d(r.A, r.B); let bestV = Infinity
  const cx0 = Math.floor(Math.min(r.A[0], r.B[0]) / C) - 1, cx1 = Math.floor(Math.max(r.A[0], r.B[0]) / C) + 1, cz0 = Math.floor(Math.min(r.A[1], r.B[1]) / C) - 1, cz1 = Math.floor(Math.max(r.A[1], r.B[1]) / C) + 1
  if ((cx1 - cx0) * (cz1 - cz0) > 400) continue
  let par = Infinity
  for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
    for (const v of VG.get(`${x},${z}`) || []) { const [dd, u] = segD(v, r.A, r.B); if (u > 1e-6 && u < 1 - 1e-6 && d(v, r.A) > 0.002 && d(v, r.B) > 0.002) bestV = Math.min(bestV, dd) }
    for (const o of grid.get(`${x},${z}`) || []) if (o !== r) { const m = [(o.A[0] + o.B[0]) / 2, (o.A[1] + o.B[1]) / 2]; par = Math.min(par, segD(m, r.A, r.B)[0]) }
  }
  if (bestV < 0.005) hist.interiorVertexWithin5mm++; else if (bestV < 0.02) hist.interiorVertex5to20mm++; else if (par < 0.002) hist.parallelOnceEdgeWithin2mm++; else { hist.nothingNear++; if (ex.length < 6) ex.push(`${r.g} (${r.A.map(v => v.toFixed(3))}) → (${r.B.map(v => v.toFixed(3))}) ${L.toFixed(2)} m`) }
}
console.log(`  no-twin sample (≤3000): ${JSON.stringify(hist)}`)
for (const e of ex) console.log(`    nothing near: ${e}`)
// every once-edge endpoint: the nearest vertex of ANOTHER once-edge that is not the same lattice point — how far?
const endKeys = new Map(); for (const r of once) for (const p of [r.A, r.B]) { const k = key(...p); if (!endKeys.has(k)) endKeys.set(k, { p, g: new Set() }); endKeys.get(k).g.add(r.g) }
const EG = new Map(); for (const [k, e] of endKeys) { const c = ck(...e.p); (EG.get(c) || EG.set(c, []).get(c)).push([k, e]) }
const bins = { '<1mm': 0, '1-2mm': 0, '2-5mm': 0, '5-20mm': 0, '>20mm': 0 }; const pairN = {}
for (const [k, e] of endKeys) { let best = Infinity, bg = null; const [cx, cz] = [Math.floor(e.p[0] / C), Math.floor(e.p[1] / C)]
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const [k2, e2] of EG.get(`${x},${z}`) || []) { if (k2 === k) continue; const dd = d(e.p, e2.p); if (dd < best) { best = dd; bg = e2 } }
  const b = best < 0.001 ? '<1mm' : best < 0.002 ? '1-2mm' : best < 0.005 ? '2-5mm' : best < 0.02 ? '5-20mm' : '>20mm'; bins[b]++
  if (best < 0.005) { const pk = [[...e.g].join('+'), [...bg.g].join('+')].sort().join(' ~ '); pairN[pk] = (pairN[pk] || 0) + 1 } }
console.log(`  once-edge ENDPOINTS (${endKeys.size}), nearest other endpoint: ${JSON.stringify(bins)}`)
console.log(`  near-duplicate (< 5 mm) by group pair: ${Object.entries(pairN).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
// edges whose BOTH endpoints have nothing within 20 mm: which group lies across them (±1 mm off the midpoint)?
const TC = 5, tg = new Map()
for (const g of gj.groups.filter(g => g.partition === true)) { const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) { const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]])
    const x0 = Math.floor(Math.min(v[0][0], v[1][0], v[2][0]) / TC), x1 = Math.floor(Math.max(v[0][0], v[1][0], v[2][0]) / TC), z0 = Math.floor(Math.min(v[0][1], v[1][1], v[2][1]) / TC), z1 = Math.floor(Math.max(v[0][1], v[1][1], v[2][1]) / TC)
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 3000) continue
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 100003 + z; (tg.get(k) || tg.set(k, []).get(k)).push([g.id, v]) } } }
const covering = (x, z) => { const out = []; for (const [id, [a, b, c]] of tg.get(Math.floor(x / TC) * 100003 + Math.floor(z / TC)) || []) {
  const dd = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(dd) < 1e-14) continue
  const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / dd, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / dd
  if (l1 > 1e-9 && l2 > 1e-9 && 1 - l1 - l2 > 1e-9) out.push(id) } return out }
const far = once.filter(r => { for (const p of [r.A, r.B]) { const [cx, cz] = [Math.floor(p[0] / C), Math.floor(p[1] / C)]; const k = key(...p)
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const [k2, e2] of EG.get(`${x},${z}`) || []) if (k2 !== k && d(p, e2.p) < 0.02) return false } return true })
const how = {}; let overlap = 0
for (const r of far.slice(0, 2000)) { const mx = (r.A[0] + r.B[0]) / 2, mz = (r.A[1] + r.B[1]) / 2, L = d(r.A, r.B); if (L < 1e-6) continue
  const nx = -(r.B[1] - r.A[1]) / L * 0.001, nz = (r.B[0] - r.A[0]) / L * 0.001
  const s1 = covering(mx + nx, mz + nz), s2 = covering(mx - nx, mz - nz)
  const k = `${r.g}: [${[...new Set(s1)].sort().join('+') || '∅'}] | [${[...new Set(s2)].sort().join('+') || '∅'}]`; how[k] = (how[k] || 0) + 1
  if (s1.length > 1 || s2.length > 1) overlap++ }
console.log(`  far-ended seams: ${far.length}; sampled ${Math.min(far.length, 2000)} — with an OVERLAP (two groups' interiors at one point) on a side: ${overlap}`)
for (const [k, v] of Object.entries(how).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`    ${v} × ${k}`)
