// measure.mjs — a simplified slab beside the slab it came from: triangles, bytes, T-junctions, and the drawn surface's
// vertical error against the unsimplified one, read independently of the simplifier (dense area-weighted samples inside
// every original triangle of a class, plus every original vertex), at the town's terrainExag ceiling and at 0.
//   node --max-old-space-size=8192 scratch/ground-budget/simplify/measure.mjs --a=<original dir> --b=<simplified dir> --scene=<scene.json> [--n=2000000] [--tj]
import { readFileSync, statSync } from 'fs'
import { join } from 'path'
import { makeDrawnGround } from '../../../src/lib/drawnGround.js'
import { findTJunctions } from '../../../cartograph/groundConformity.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const A = arg('a'), B = arg('b'), N = +(arg('n') || 2e6), E = JSON.parse(readFileSync(arg('scene'), 'utf8')).terrainExag
if (!(E > 0)) throw new Error('measure: scene names no terrainExag')
const load = (d) => { const gj = JSON.parse(readFileSync(join(d, 'ground.json'), 'utf8')), b = readFileSync(join(d, gj.bin)); return { gj, AB: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), bytes: statSync(join(d, gj.bin)).size } }
const a = load(A), b = load(B)
const tris = (s) => s.gj.groups.reduce((n, g) => n + g.indexCount / 3, 0)
console.log(`A ${A}\n  T ${tris(a)} · bytes ${a.bytes}\nB ${B}\n  T ${tris(b)} · bytes ${b.bytes}`)
const CLASSES = { walk: (id) => id === 'sidewalk', curb: (id) => id === 'curb', ped: (id) => id === 'sidewalk' || id === 'curb' || id.startsWith('treelawn'), all: () => true }
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296
const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))]
for (const [name, is] of Object.entries(CLASSES)) {
  const pick = (g) => is(g.id)
  const sa = makeDrawnGround(a.gj, a.AB, { groups: pick }), sb = makeDrawnGround(b.gj, b.AB, { groups: pick })
  // area-weighted samples inside A's triangles, plus A's vertices
  const tri = []; let tot = 0
  for (const g of a.gj.groups) if (pick(g)) { const P = new Float32Array(a.AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(a.AB, g.indexByteOffset, g.indexCount)
    for (let t = 0; t < I.length; t += 3) { const i = I[t] * 3, j = I[t + 1] * 3, k = I[t + 2] * 3
      const ar = Math.abs((P[j] - P[i]) * (P[k + 2] - P[i + 2]) - (P[k] - P[i]) * (P[j + 2] - P[i + 2])) / 2; tot += ar; tri.push([P[i], P[i + 2], P[j], P[j + 2], P[k], P[k + 2], tot]) } }
  const pts = []
  for (let s = 0; s < N; s++) { const r = rnd() * tot; let lo = 0, hi = tri.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tri[m][6] < r) lo = m + 1; else hi = m }
    let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v } const T = tri[lo]
    pts.push([T[0] + u * (T[2] - T[0]) + v * (T[4] - T[0]), T[1] + u * (T[3] - T[1]) + v * (T[5] - T[1])]) }
  const nArea = pts.length
  for (const g of a.gj.groups) if (pick(g)) { const P = new Float32Array(a.AB, g.vertexByteOffset, g.vertexCount * 3); for (let v = 0; v < g.vertexCount; v++) pts.push([P[v * 3], P[v * 3 + 2]]) }
  // ⭐ where A covers a point with two different heights (a fold in the input: overlap.mjs), A has no one surface to
  //   compare against — those points are counted apart, never folded into the error
  const C = 1, grid = new Map(), TA = []
  for (const g of a.gj.groups) if (pick(g)) { const P = new Float32Array(a.AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(a.AB, g.indexByteOffset, g.indexCount), R = new Float32Array(a.AB, g.rawByteOffset, g.vertexCount)
    for (let t = 0; t < I.length; t += 3) { const v = [I[t], I[t + 1], I[t + 2]], tt = v.map(i => [P[i * 3], P[i * 3 + 2], R[i] * E + P[i * 3 + 1]]); const id = TA.push(tt) - 1
      for (let gx = Math.floor(Math.min(...tt.map(p => p[0])) / C); gx <= Math.floor(Math.max(...tt.map(p => p[0])) / C); gx++) for (let gz = Math.floor(Math.min(...tt.map(p => p[1])) / C); gz <= Math.floor(Math.max(...tt.map(p => p[1])) / C); gz++) { const k = gx * 1e6 + gz; const L = grid.get(k); if (L) L.push(id); else grid.set(k, [id]) } } }
  const spreadAt = (x, z) => { let lo = Infinity, hi = -Infinity
    for (const id of grid.get(Math.floor(x / C) * 1e6 + Math.floor(z / C)) || []) { const [[ax, az, ah], [bx, bz, bh], [cx, cz, ch]] = TA[id]
      const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az); if (d === 0) continue
      const wa = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / d, wb = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / d, wc = 1 - wa - wb
      if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue
      const h = ah * wa + bh * wb + ch * wc; lo = Math.min(lo, h); hi = Math.max(hi, h) }
    return hi - lo }
  const eE = [], e0 = [], eV = []; let miss = 0, multi = 0, multiMax = 0, worstV = null
  for (let i = 0; i < pts.length; i++) { const [x, z] = pts[i], pa = sa.partsAt(x, z), pb = sb.partsAt(x, z)
    if (!pa || !pb) { miss++; continue }
    const sp = spreadAt(x, z); if (sp > 1e-4) { multi++; multiMax = Math.max(multiMax, sp); continue }
    const dE = Math.abs((pb.raw - pa.raw) * E + (pb.y - pa.y)), d0 = Math.abs(pb.y - pa.y)
    if (i < nArea) { eE.push(dE); e0.push(d0) } else { eV.push(dE); if (!(worstV?.d >= dE)) worstV = { d: dE, x, z, a: pa.raw * E + pa.y, b: pb.raw * E + pb.y } } }
  for (const L of [eE, e0, eV]) L.sort((x, y) => x - y)
  const mm = (L) => `p50 ${(q(L, 0.5) * 1000).toFixed(2)} · p99 ${(q(L, 0.99) * 1000).toFixed(2)} · max ${(L[L.length - 1] * 1000).toFixed(2)} mm`
  console.log(`  ${name.padEnd(5)} T ${sa.triCount} → ${sb.triCount} · area samples ${nArea} @E=${E}: ${mm(eE)} · @E=0: ${mm(e0)} · at A's vertices: ${mm(eV)} · unsampled ${miss} · A multi-valued (excluded) ${multi}, spread ≤ ${(multiMax * 1000).toFixed(0)} mm${worstV ? ` · worst vertex at (${worstV.x.toFixed(3)}, ${worstV.z.toFixed(3)}): A ${worstV.a.toFixed(3)} · B ${worstV.b.toFixed(3)}` : ''}`)
}
if (process.argv.includes('--tj')) for (const [n, s] of [['A', a], ['B', b]]) {
  const gs = s.gj.groups.filter(g => g.partition).map(g => ({ id: g.id, positions: new Float32Array(s.AB, g.vertexByteOffset, g.vertexCount * 3), indices: new Uint32Array(s.AB, g.indexByteOffset, g.indexCount) }))
  const tj = findTJunctions(gs); console.log(`  T-junctions ${n}: total ${tj.total} · within ${tj.within} · cross ${tj.cross}`)
}
