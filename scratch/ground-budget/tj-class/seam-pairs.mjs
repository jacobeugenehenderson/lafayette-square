// seam-pairs.mjs — the gap check's interior seams (claims-the-ground-tiles-without-a-gap: used-once edges inside the disc,
// exact float32 identity, the rim excluded the check's way), each paired with the NEAREST used-once edge of the slab across
// from it (another edge whose midpoint is within W of this one's, not this edge itself), by group pair and by the gap's
// width (the distance from this edge's midpoint to that edge). Read-only.  node seam-pairs.mjs <slab dir> [W m = 0.05]
import { readFileSync } from 'fs'
import { join } from 'path'
const [dir, w] = process.argv.slice(2), W = Number(w || 0.05)
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), gb = readFileSync(join(dir, gj.bin || 'ground.bin'))
const AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength), st = gj.stencil
const key = (x, z) => `${x},${z}`, edges = new Map()
for (const g of gj.groups.filter(g => g.partition === true)) {
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) { const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]])
    for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3], ka = key(...a), kb = key(...b); if (ka === kb) continue
      const k = ka < kb ? ka + '|' + kb : kb + '|' + ka, r = edges.get(k); if (r) r.n++; else edges.set(k, { n: 1, a, b, g: g.id }) } } }
let rMax = 0
for (const r of edges.values()) if (r.n === 1) for (const p of [r.a, r.b]) rMax = Math.max(rMax, Math.hypot(p[0] - st.center[0], p[1] - st.center[1]))
const seams = []
for (const r of edges.values()) { if (r.n !== 1) continue
  const ra = Math.hypot(r.a[0] - st.center[0], r.a[1] - st.center[1]), rb = Math.hypot(r.b[0] - st.center[0], r.b[1] - st.center[1]), L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1])
  if (Math.min(ra, rb) >= rMax - L * L / (8 * rMax) - 1e-3) continue
  seams.push({ ...r, L, mx: (r.a[0] + r.b[0]) / 2, mz: (r.a[1] + r.b[1]) / 2 }) }
// across: the nearest OTHER seam edge to this one's midpoint (segment distance), within W
const cell = 2, grid = new Map(), ck = (x, z) => Math.floor(x / cell) * 1e7 + Math.floor(z / cell)
seams.forEach((s, i) => { for (const [x, z] of [s.a, s.b, [s.mx, s.mz]]) { const k = ck(x, z); let a = grid.get(k); if (!a) grid.set(k, a = new Set()); a.add(i) } })
const segD = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2)) : 0; return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz) }
const pairs = new Map(), widths = new Map()
for (const [i, s] of seams.entries()) {
  let best = Infinity, bj = -1
  for (let cx = Math.floor((s.mx - W) / cell); cx <= Math.floor((s.mx + W) / cell); cx++) for (let cz = Math.floor((s.mz - W) / cell); cz <= Math.floor((s.mz + W) / cell); cz++)
    for (const j of grid.get(cx * 1e7 + cz) || []) { if (j === i) continue; const o = seams[j]
      if (key(...o.a) === key(...s.a) && key(...o.b) === key(...s.b) || key(...o.a) === key(...s.b) && key(...o.b) === key(...s.a)) continue
      // not an edge that merely shares an endpoint and leaves at an angle: its distance at our midpoint
      const d = segD(s.mx, s.mz, o.a, o.b); if (d < best) { best = d; bj = j } }
  const across = best <= W ? seams[bj].g : '(nothing within W)'
  const pk = `${s.g} | ${across}`, p = pairs.get(pk) || pairs.set(pk, { n: 0, m: 0, d: [] }).get(pk); p.n++; p.m += s.L; if (best <= W) p.d.push(best)
  if (process.env.SHOW_PAIR === pk) (globalThis.__show ??= []).push(s)
}
const med = (a) => a.length ? a.sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : NaN
console.log(`${dir.split('/').pop()}: ${seams.length} interior seam edges, ${seams.reduce((t, s) => t + s.L, 0).toFixed(0)} m · pairs by metres (edge's group | nearest used-once edge across, within ${W} m · gap at the midpoint, median)`)
for (const [k, p] of [...pairs].sort((a, b) => b[1].m - a[1].m).slice(0, 14)) console.log(`   ${p.m.toFixed(0).padStart(7)} m · ${String(p.n).padStart(6)} · ${k} · ${(med(p.d) * 1000).toFixed(1)} mm`)
if (globalThis.__show) for (const e of globalThis.__show.sort((a, b) => b.L - a.L).slice(0, 12)) console.log(`      ${e.g}: (${e.a.map(v => v.toFixed(3))}) → (${e.b.map(v => v.toFixed(3))}) ${e.L.toFixed(2)} m`)
