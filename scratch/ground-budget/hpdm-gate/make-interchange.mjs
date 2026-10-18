// make-interchange.mjs <groundDeformer.mjs> — two COUNTERFACTUAL copies (probe only, never shipped) for the road beside a ② edge
// whose height is the terrain (a highway or bridge run's edge), when the road's ① owner is at-grade:
//   groundDeformer.cf-A.mjs  the road takes its street's line all the way to that ② (no sweep toward the terrain; the curb keeps it)
//   groundDeformer.cf-B.mjs  that ② edge takes the line of the tile's nearest at-grade ① owner at each of its points, not the terrain
// Anchors counted, or it throws; the lattice import is re-rooted.
import { readFileSync, writeFileSync } from 'fs'
const src = readFileSync(process.argv[2], 'utf8')
const make = (name, edits) => { let s = src
  for (const [a, b] of edits) { const k = s.split(a).length - 1; if (k !== 1) throw new Error(`make-interchange ${name}: anchor found ${k}× — ${a.slice(0, 80)}`); s = s.replace(a, b) }
  writeFileSync(new URL(`groundDeformer.cf-${name}.mjs`, import.meta.url), s.replace("'../src/lib/lattice.js'", "'../../../src/lib/lattice.js'")) }
const pushE = ['rings.push({ ring, Hat, stamp, arc, t: ti, k: ri })', 'rings.push({ ring, Hat, E, stamp, arc, t: ti, k: ri })']
make('A', [pushE, ['    const s = o1.d / W\n', '    const s = n.R.E[n.i]?.terrain && o1.o.ground ? 0 : o1.d / W\n']])
make('B', [pushE, ['  // ── THE INK: ① between the tiles, as owned pieces', `  for (const rec of T) for (const R of rec.rings) { const H0 = R.Hat, n = R.ring.length
    R.Hat = (i, u) => { if (!R.E[i]?.terrain) return H0(i, u); const p = R.ring[i], q = R.ring[(i + 1) % n], x = p[0] + (q[0] - p[0]) * u, z = p[1] + (q[1] - p[1]) * u
      const o = nearestOwned(rec.one, x, z, rec.diag); return o && o.o.ground && o.o.id !== '__rim__' ? o.o.at(x, z) : H0(i, u) } }
  // ── THE INK: ① between the tiles, as owned pieces`]])
console.log('make-interchange: groundDeformer.cf-A.mjs · groundDeformer.cf-B.mjs')
