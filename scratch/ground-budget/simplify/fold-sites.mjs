// fold-sites.mjs — every place a group covers the same xz twice: the pair of the group's own triangles that overlap
// (2D SAT, interior overlap deeper than LATTICE_M — the test simplify.mjs locks on), their overlap's centroid, and the
// height gap between the two (drawn at the town's terrainExag: raw·E + y), read at the overlap polygon's corners.
// Sorted by gap. Read-only. For Lath: rerun on a B + D slab when one is written (the B + D bake refuses today).
//   node scratch/ground-budget/simplify/fold-sites.mjs --slab=<dir> --scene=<scene.json> --out=<tsv>
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { LATTICE_M } from '../../../src/lib/lattice.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const dir = arg('slab'), E = JSON.parse(readFileSync(arg('scene'), 'utf8')).terrainExag
if (!(E > 0)) throw new Error('fold-sites: scene names no terrainExag')
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), b = readFileSync(join(dir, gj.bin)), AB = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const rows = []
for (const g of gj.groups) {
  if (g.rawByteOffset == null) throw new Error(`fold-sites: ${g.id} has no raw`)
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  const nt = I.length / 3, tri = (t) => [0, 1, 2].map(k => { const v = I[3 * t + k]; return [P[v * 3], P[v * 3 + 2], R[v] * E + P[v * 3 + 1]] })
  const area2 = (q) => (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1])
  // cell: twice the group's median triangle extent, so a cell holds a handful of triangles
  const ext = []; for (let t = 0; t < nt; t += Math.max(1, Math.floor(nt / 2000))) { const q = tri(t); ext.push(Math.max(...q.map(p => p[0])) - Math.min(...q.map(p => p[0])) + Math.max(...q.map(p => p[1])) - Math.min(...q.map(p => p[1]))) }
  ext.sort((x, y) => x - y); const C = Math.max(LATTICE_M, 2 * (ext[ext.length >> 1] || 1))
  const grid = new Map()
  for (let t = 0; t < nt; t++) { const q = tri(t); if (!area2(q)) continue
    for (let gx = Math.floor(Math.min(...q.map(p => p[0])) / C); gx <= Math.floor(Math.max(...q.map(p => p[0])) / C); gx++) for (let gz = Math.floor(Math.min(...q.map(p => p[1])) / C); gz <= Math.floor(Math.max(...q.map(p => p[1])) / C); gz++) {
      const k = gx * 1e6 + gz; const L = grid.get(k); if (L) L.push(t); else grid.set(k, [t]) } }
  const sep = (A, B) => { for (const [p, q] of [[A, B], [B, A]]) for (let k = 0; k < 3; k++) { const a = p[k], c = p[(k + 1) % 3], nx = c[1] - a[1], nz = a[0] - c[0], len = Math.hypot(nx, nz); if (!len) continue
    const pr = (s) => s.map(v => (v[0] * nx + v[1] * nz) / len), pp = pr(p), qq = pr(q)
    if (Math.min(Math.max(...pp), Math.max(...qq)) - Math.max(Math.min(...pp), Math.min(...qq)) <= LATTICE_M) return true } return false }
  // the overlap polygon (Sutherland–Hodgman, triangle against triangle), heights from each triangle's plane
  const clip = (S, C) => { let out = S.map(p => [p[0], p[1]]); const s = Math.sign(area2(C))
    for (let k = 0; k < 3 && out.length; k++) { const a = C[k], c = C[(k + 1) % 3], inn = (p) => s * ((c[0] - a[0]) * (p[1] - a[1]) - (c[1] - a[1]) * (p[0] - a[0])) >= 0
      const src = out; out = []
      for (let i = 0; i < src.length; i++) { const p = src[i], q = src[(i + 1) % src.length], ip = inn(p), iq = inn(q)
        if (ip) out.push(p)
        if (ip !== iq) { const d1 = (c[0] - a[0]) * (p[1] - a[1]) - (c[1] - a[1]) * (p[0] - a[0]), d2 = (c[0] - a[0]) * (q[1] - a[1]) - (c[1] - a[1]) * (q[0] - a[0]), t = d1 / (d1 - d2)
          out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]) } } }
    return out }
  const hAt = (q, x, z) => { const d = area2(q), wa = ((q[1][0] - x) * (q[2][1] - z) - (q[2][0] - x) * (q[1][1] - z)) / d, wb = ((q[2][0] - x) * (q[0][1] - z) - (q[0][0] - x) * (q[2][1] - z)) / d
    return q[0][2] * wa + q[1][2] * wb + q[2][2] * (1 - wa - wb) }
  for (const [cell, L] of grid) for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const s = L[i], t = L[j], A = tri(s), B = tri(t)
    // each pair once: only in the cell holding the corner of the two boxes' intersection (no Set — 2^24 entries cap)
    if (Math.floor(Math.max(Math.min(...A.map(p => p[0])), Math.min(...B.map(p => p[0]))) / C) * 1e6 + Math.floor(Math.max(Math.min(...A.map(p => p[1])), Math.min(...B.map(p => p[1]))) / C) !== cell) continue
    if (sep(A, B)) continue
    const poly = clip(A, B); if (!poly.length) continue
    let gap = 0; for (const [x, z] of poly) gap = Math.max(gap, Math.abs(hAt(A, x, z) - hAt(B, x, z)))
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cz = poly.reduce((a, p) => a + p[1], 0) / poly.length
    rows.push([g.id, s, t, cx.toFixed(3), cz.toFixed(3), gap]) }
}
rows.sort((a, b) => b[5] - a[5])
writeFileSync(arg('out'), ['# fold-sites ' + dir + ' · E ' + E + ' · overlap deeper than LATTICE_M · gap = drawn height difference at the overlap corners',
  'group\ttriA\ttriB\tcx\tcz\tgap_mm', ...rows.map(r => [...r.slice(0, 5), (r[5] * 1000).toFixed(1)].join('\t'))].join('\n') + '\n')
const by = {}; for (const r of rows) by[r[0]] = (by[r[0]] || 0) + 1
console.log(`fold-sites: ${rows.length} overlapping pairs · by group ${JSON.stringify(by)} · gap > 7.8 mm ${rows.filter(r => r[5] > 0.0078).length} · max ${(rows[0]?.[5] * 1000).toFixed(1)} mm → ${arg('out')}`)
