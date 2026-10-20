// dump3-read.mjs — reads dump3.json (bake-ground.dump3.js, Boz's question 2026-10-14): at each throw point, are the slivers
// already in mine/acc as they enter the difference, or does the difference make them? Prints, per point:
//  · the output rings near it (area, vertices) and, for the sliver ones, each vertex's distance to the nearest mine and acc edge;
//  · near-coincident edge pairs between this layer's items and the items ABOVE it (any step before), by polygon
//    (group#item.ring): nearly parallel, overlapping along their length, apart by > 0 and ≤ GAP lattice units.
//   node dump3-read.mjs [dump3.json] [--gap=8]
import { readFileSync } from 'fs'
const D = JSON.parse(readFileSync(process.argv.find(a => a.endsWith('.json')) || new URL('./dump3.json', import.meta.url), 'utf8'))
const GAP = +(process.argv.find(a => a.startsWith('--gap='))?.slice(6) ?? 8)
const segs = (xy) => xy.map((b, i) => [xy[(i + xy.length - 1) % xy.length], b])
const segsOf = (p) => p.q.windowed ? p.q.edges.map(e => [e.a, e.b]) : segs(p.q)
const sd = ([px, py], [a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)) : 0; return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy) }
const names = ['underived orphan', 'recreation twisted', 'recreation met']
for (const [pi, P] of D.pts.entries()) {
  const own = pi === 0 ? 'mat:treelawn:underived' : 'mat:treelawn:recreation'
  console.log(`\n=== point ${pi} (${names[pi]}) at (${(P[0] / 1000).toFixed(3)}, ${(P[1] / 1000).toFixed(3)}) · layer ${own}`)
  const ps = D.paths.filter(p => p.pt === pi && p.group === own)
  for (const w of ['mine', 'acc', 'out']) console.log(`  ${w}: ${ps.filter(p => p.what === w).map(p => `#${p.qi} ${p.n}v ${(p.A / 1e6).toFixed(6)} m²`).join(' · ') || '—'}`)
  const mineS = ps.filter(p => p.what === 'mine').flatMap(segsOf), accS = ps.filter(p => p.what === 'acc').flatMap(segsOf)
  for (const o of ps.filter(p => p.what === 'out' && !p.q.windowed && Math.abs(p.A) < 1e6)) {   // the out rings under 1 m²
    console.log(`  out #${o.qi} (${o.n}v, ${o.A} units²):`)
    for (const v of o.q) console.log(`     (${v[0]}, ${v[1]})  → mine ${Math.min(...mineS.map(s => sd(v, s))).toFixed(3)} · acc ${Math.min(...accS.map(s => sd(v, s))).toFixed(3)} units`) }
  // near-coincident edges: this layer's items vs items above (earlier steps)
  const it = D.items.filter(x => x.pt === pi), ownStep = it.find(x => x.group === own)?.step
  const mineI = it.filter(x => x.group === own), above = it.filter(x => x.step < ownStep)
  const pairs = []
  for (const m of mineI) for (const [a, b] of segs(m.ringXY)) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L || sd(P, [a, b]) > D.R) continue
    for (const u of above) for (const [c, d] of segs(u.ringXY)) { const M = Math.hypot(d[0] - c[0], d[1] - c[1]); if (!M) continue
      const sin = Math.abs((b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])) / (L * M); if (sin > 0.02) continue
      const gap = Math.max(sd(c, [a, b]), sd(d, [a, b])) < Math.max(sd(a, [c, d]), sd(b, [c, d])) ? Math.max(sd(c, [a, b]), sd(d, [a, b])) : Math.max(sd(a, [c, d]), sd(b, [c, d]))
      const g0 = Math.min(sd(a, [c, d]), sd(b, [c, d]), sd(c, [a, b]), sd(d, [a, b]))
      if (g0 > GAP) continue
      // overlap along the line
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, t = (p) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy
      const lo = Math.max(0, Math.min(t(c), t(d))), hi = Math.min(L, Math.max(t(c), t(d))); if (hi - lo <= 0) continue
      pairs.push({ m: `${m.group}#${m.idx}.${m.ring}`, u: `${u.group}#${u.idx}.${u.ring}`, gapMin: g0, gapMax: gap, overlap: hi - lo, sin, a, b, c, d }) } }
  pairs.sort((p, q) => p.gapMin - q.gapMin)
  const equal = pairs.filter(p => p.gapMax === 0).length
  console.log(`  near-coincident edge pairs (this layer vs above, ≤ ${GAP} units, overlapping): ${pairs.length} · exactly shared ${equal} · apart by > 0: ${pairs.length - equal}`)
  for (const p of pairs.filter(p => p.gapMax > 0).slice(0, 12)) console.log(`     ${p.m}  vs  ${p.u}  · gap ${p.gapMin.toFixed(3)}…${p.gapMax.toFixed(3)} units over ${(p.overlap / 1000).toFixed(3)} m · sin ${p.sin.toExponential(1)} · [${p.a}]→[${p.b}] / [${p.c}]→[${p.d}]`)
}
