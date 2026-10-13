// The deformer's H per ② vertex for one ring, replicated from groundDeformer.mjs's tile loop verbatim (stamped, then arc
// blends, then the neighbour fill), with each vertex's ORIGIN: stamped · blended · filled (Brace, 2026-10-13).
//   node scratch/ground-budget/ring-h.mjs <dump> <tile> <ring> <from> <to>
import { readFileSync } from 'fs'
const [dump, ti, ri, from, to] = process.argv.slice(2)
const t = JSON.parse(readFileSync(dump + '/deform.json', 'utf8')).tiles[+ti], runs = t.runs || [], sq = x => x * x
const hOfRun = (ri, p) => { const run = runs[ri]; if (!run || !Array.isArray(run.h)) return null
  let best = Infinity, out = null
  for (let i = 0; i + 1 < run.poly.length; i++) { const a = run.poly[i], b = run.poly[i + 1], ha = run.h[i], hb = run.h[i + 1]; if (ha == null || hb == null) continue
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
    const d2 = sq(p[0] - a[0] - u * dx) + sq(p[1] - a[1] - u * dz); if (d2 < best) { best = d2; out = ha + u * (hb - ha) } }
  if (out == null && run.poly.length === 1 && run.h[0] != null) out = run.h[0]
  return out }
const ring = t.iaFull[+ri], n = ring.length, H = new Array(n).fill(null), arc = t.iaArc?.[+ri] || [], stamp = t.iaStamp?.[+ri] || [], origin = new Array(n).fill(null)
for (let i = 0; i < n; i++) if (arc[i] == null && stamp[i] != null) { const h = hOfRun(stamp[i], ring[i]); if (h != null) { H[i] = h; origin[i] = 'stamped' } }
let skipped = 0
for (let i = 0; i < n; i++) {
  if (arc[i] == null || arc[(i + n - 1) % n] === arc[i]) continue
  let j = i; const id = arc[i], span = []
  while (arc[j % n] === id && span.length < n) { span.push(j % n); j++ }
  const before = (i + n - 1) % n, after = j % n
  const hb = H[before] ?? (stamp[before] != null ? hOfRun(stamp[before], ring[before]) : null), ha = H[after] ?? (stamp[after] != null ? hOfRun(stamp[after], ring[after]) : null)
  if (hb == null || ha == null) { skipped++; continue }
  const pts = [before, ...span, after]; let L = 0; const cum = [0]
  for (let k = 1; k < pts.length; k++) { L += Math.hypot(ring[pts[k]][0] - ring[pts[k - 1]][0], ring[pts[k]][1] - ring[pts[k - 1]][1]); cum.push(L) }
  span.forEach((v, k) => { H[v] = L > 0 ? hb + (ha - hb) * cum[k + 1] / L : hb; origin[v] = 'blended' })
}
const known = H.filter(h => h != null).length
if (known < n) for (let pass = 0; pass < n && H.some(h => h == null); pass++) for (let i = 0; i < n; i++) if (H[i] == null) {
  const a = H[(i + n - 1) % n], b = H[(i + 1) % n]; if (a != null || b != null) { H[i] = a != null && b != null ? (a + b) / 2 : (a ?? b); origin[i] = 'filled' } }
console.log(`ring ${ri}: ${n} vertices · arcs skipped (a tangent with no height) ${skipped} · filled ${origin.filter(o => o === 'filled').length}`)
for (let i = +from; i <= +to; i++) console.log(`  v ${i} (${ring[i].map(v => v.toFixed(2))}) arc ${arc[i]} stamp ${stamp[i]} H ${H[i]?.toFixed(3)} ${origin[i]}`)
