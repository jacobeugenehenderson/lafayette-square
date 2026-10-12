// Search small lattice-rounded configurations for the Huron class: conformAndRefine's output that findTJunctions rejects.
// Group S: a stack of near-parallel strips (lattice endpoints, mm apart) converging along a long edge; group U: a polygon
// whose edge runs ~4–5 mm off. Uniform refinement forces bisection. Prints the first red seeds.
import { conformAndRefine, findTJunctions } from '../../cartograph/groundConformity.js'
let seed = +process.argv[2] || 1
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const mm = (v) => Math.round(v * 1000) / 1000
let found = 0
for (let trial = 0; trial < 20000 && found < 3; trial++) {
  const s0 = seed, L = mm(4 + rnd() * 8), ang = rnd() * Math.PI, ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux
  const P = (t, o) => [mm(t * ux + o * nx), mm(t * uz + o * nz)]
  const offs = [0]; const k = 2 + Math.floor(rnd() * 4); for (let i = 0; i < k; i++) offs.push(offs[offs.length - 1] + mm(0.0005 + rnd() * 0.002))
  const skew = () => mm((rnd() - 0.5) * 0.003)
  const lines = offs.map(o => [P(0, o + skew()), P(L, o + skew())])
  const S = [{ outer: [P(0, -1), P(L, -1), lines[0][1], lines[0][0]] }]
  for (let i = 0; i + 1 < lines.length; i++) S.push({ outer: [lines[i][0], lines[i][1], lines[i + 1][1], lines[i + 1][0]] })
  const top = offs[offs.length - 1], g = mm(0.004 + rnd() * 0.0015), a = mm(rnd() * L * 0.6), b = mm(a + 0.5 + rnd() * (L - a - 0.5))
  const U = [{ outer: [P(a, top + g), P(b, top + g), P(b, top + 1), P(a, top + 1)] }]
  const max = 0.5 + rnd() * 3
  let out
  try { out = conformAndRefine([{ polys: S, refine: { mode: 'uniform', maxEdge: max } }, { polys: U, refine: null }]) } catch (e) { continue }
  const tj = findTJunctions(out.map((o, i) => ({ id: ['S', 'U'][i], ...o })))
  if (tj.cross) { found++; console.log(JSON.stringify({ seed: s0, L, ang, offs, lines, g, a, b, max, tj: { total: tj.total, within: tj.within, cross: tj.cross, first: tj.found[0] } })) }
}
console.log('found', found)
