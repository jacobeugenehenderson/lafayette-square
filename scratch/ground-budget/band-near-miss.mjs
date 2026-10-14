// band-near-miss.mjs — SAME-CLASS PAINTED PIECES THAT COME WITHIN A LATTICE OF EACH OTHER WITHOUT TOUCHING. READ-ONLY, COUNTS
// ONLY (Tern, 2026-10-14; Boz). Over a dump of the deformer's own input (deform.json, the bands as painted). Found at Huron's
// fox-road: two treelawn pieces 0.8 mm apart with a 0.9 mm sliver between them, which the deformer's ray read as lot
// (checks/claims-the-ray-reads-the-bands-the-point-test-reads.mjs).
//   · per class (curb · lawn · walk): every vertex of a piece against the edges of the OTHER pieces of its class; a vertex
//     IDENTICAL to one of theirs is a shared corner (abutting pieces); otherwise its distance to their nearest edge is binned
//     below one lattice step. ⚠️ Rounding to the 1 mm grid can leave a vertex up to ~0.7 mm off a skew edge it shares, so
//     the low bins mix shared edges with true gaps; read the bins, not a total.
//   · SLIVERS: pieces narrower than the lattice (2·area / perimeter < one step).
//   node --max-old-space-size=6000 scratch/ground-budget/band-near-miss.mjs <dump dir>
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const { CLIP_SCALE } = await import(R + 'src/lib/lattice.js'), LATTICE = 1 / CLIP_SCALE
const D = JSON.parse(readFileSync(process.argv[2] + '/deform.json', 'utf8'))
const rings = (it) => it.outer ? [it.outer, ...(it.holes || [])] : [it]
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1] } return s / 2 }
const perim = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]) } return s }
const BINS = [0.25, 0.5, 0.75, 1].map(f => f * LATTICE), CELL = 4
for (const cls of ['curb', 'lawn', 'walk']) {
  const P = D.bands[cls], grid = new Map(), vkey = new Map()
  P.forEach((it, pi) => rings(it).forEach(r => { for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], s = { a, b, pi }
    const k = `${Math.round(a[0] * CLIP_SCALE)},${Math.round(a[1] * CLIP_SCALE)}`; (vkey.get(k) || vkey.set(k, new Set()).get(k)).add(pi)
    const x0 = Math.floor((Math.min(a[0], b[0]) - LATTICE) / CELL), x1 = Math.floor((Math.max(a[0], b[0]) + LATTICE) / CELL), z0 = Math.floor((Math.min(a[1], b[1]) - LATTICE) / CELL), z1 = Math.floor((Math.max(a[1], b[1]) + LATTICE) / CELL)
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const g = x * 1000003 + z; (grid.get(g) || grid.set(g, []).get(g)).push(s) } } }))
  const bins = BINS.map(() => 0), pairs = BINS.map(() => new Set()); let shared = 0, slivers = 0, sliverArea = 0
  P.forEach((it, pi) => {
    const o = rings(it)[0]; const A = Math.abs(area(o)), L = perim(o); if (L > 0 && 2 * A / L < LATTICE) { slivers++; sliverArea += A }
    for (const r of rings(it)) for (const p of r) {
      const k = `${Math.round(p[0] * CLIP_SCALE)},${Math.round(p[1] * CLIP_SCALE)}`; if ([...(vkey.get(k) || [])].some(q => q !== pi)) { shared++; continue }
      let best = Infinity, bq = -1
      for (const s of grid.get(Math.floor(p[0] / CELL) * 1000003 + Math.floor(p[1] / CELL)) || []) { if (s.pi === pi) continue
        const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dz) / L2)) : 0
        const d = Math.hypot(p[0] - s.a[0] - u * dx, p[1] - s.a[1] - u * dz); if (d < best) { best = d; bq = s.pi } }
      const b = BINS.findIndex(x => best <= x); if (b >= 0) { bins[b]++; pairs[b].add(pi < bq ? `${pi}|${bq}` : `${bq}|${pi}`) } } })
  console.log(`${cls}: ${P.length} piece(s) · vertices shared exactly with another piece ${shared} · a vertex within a lattice of ANOTHER piece's edge, not shared, by distance: ${BINS.map((x, i) => `≤${(x * 1000).toFixed(2)} mm ${bins[i]} (${pairs[i].size} piece pairs)`).join(' · ')} · SLIVERS narrower than the lattice ${slivers} (${sliverArea.toFixed(3)} m²)`)
}
