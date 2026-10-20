// ring-H.mjs — the H a tile's ② ring carries, computed with groundDeformer.mjs buildDeformer's own steps (the line's h
// through each vertex's stamp · corner arcs blended by arclength · the rest filled from neighbours), COPIED here because
// the deformer keeps it in a closure. Read-only; prints vertices [from..to] with what set each one's H.
//   node scratch/ground-budget/simplify/ring-H.mjs --shape=<shape.json> --tile=<i> [--ring=0] --from=<v> --to=<v>
import { readFileSync } from 'fs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const tiles = JSON.parse(readFileSync(arg('shape'), 'utf8')).tiles, t = tiles[+arg('tile')], ri = +(arg('ring') || 0)
const sh = JSON.parse(readFileSync(arg('shape'), 'utf8')), T = loadSceneTerrain(arg('town') || 'hipointedemun')
const sq = (x) => x * x, runs = t.runs || []
const hOfRun = (k, p) => { const run = runs[k]; if (!run || !Array.isArray(run.h)) return null
  let best = Infinity, out = null
  for (let i = 0; i + 1 < run.poly.length; i++) { const a = run.poly[i], b = run.poly[i + 1], ha = run.h[i], hb = run.h[i + 1]; if (ha == null || hb == null) continue
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
    const d2 = sq(p[0] - a[0] - u * dx) + sq(p[1] - a[1] - u * dz); if (d2 < best) { best = d2; out = ha + u * (hb - ha) } }
  if (out == null && run.poly.length === 1 && run.h[0] != null) out = run.h[0]
  return out }
const ring = t.iaFull[ri], n = ring.length, H = new Array(n).fill(null), why = new Array(n).fill(''), arc = t.iaArc?.[ri] || [], stamp = t.iaStamp?.[ri] || []
for (let i = 0; i < n; i++) if (arc[i] == null && stamp[i] != null) { const h = hOfRun(stamp[i], ring[i]); if (h != null) { H[i] = h; why[i] = 'line' } }
for (let i = 0; i < n; i++) {
  if (arc[i] == null || arc[(i + n - 1) % n] === arc[i]) continue
  let j = i; const id = arc[i], span = []
  while (arc[j % n] === id && span.length < n) { span.push(j % n); j++ }
  const before = (i + n - 1) % n, after = j % n
  const hb = H[before] ?? (stamp[before] != null ? hOfRun(stamp[before], ring[before]) : null), ha = H[after] ?? (stamp[after] != null ? hOfRun(stamp[after], ring[after]) : null)
  if (hb == null || ha == null) continue
  const pts = [before, ...span, after]; let L = 0; const cum = [0]
  for (let k = 1; k < pts.length; k++) { L += Math.hypot(ring[pts[k]][0] - ring[pts[k - 1]][0], ring[pts[k]][1] - ring[pts[k - 1]][1]); cum.push(L) }
  span.forEach((v, k) => { H[v] = L > 0 ? hb + (ha - hb) * cum[k + 1] / L : hb; why[v] = `arc ${id}: v${before} ${hb.toFixed(2)} → v${after} ${ha.toFixed(2)} over ${L.toFixed(1)} m` })
}
for (let pass = 0; pass < n && H.some(h => h == null); pass++) for (let i = 0; i < n; i++) if (H[i] == null) {
  const a = H[(i + n - 1) % n], b = H[(i + 1) % n]; if (a != null || b != null) { H[i] = a != null && b != null ? (a + b) / 2 : (a ?? b); why[i] = `filled (pass ${pass})` } }
for (let i = +arg('from'); i <= +arg('to'); i++) { const k = (i + n) % n
  console.log(`v${k} (${ring[k][0].toFixed(1)}, ${ring[k][1].toFixed(1)}) H ${H[k]?.toFixed(2)} · terrain ${T.getElevationRaw(ring[k][0], ring[k][1]).toFixed(2)} · run ${stamp[k] ?? '-'} ${stamp[k] != null ? runs[stamp[k]].skelId : ''} · arc ${arc[k] ?? '-'} · ${why[k]}`) }
