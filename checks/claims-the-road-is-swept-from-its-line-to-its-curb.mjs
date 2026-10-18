// claims-the-road-is-swept-from-its-line-to-its-curb.mjs — A ROAD POINT'S HEIGHT RUNS FROM ITS OWN STREET'S LINE ON ① TO ②'s
// HEIGHT AT THE CURB, continuous wherever the owner changes, and the ink between the tiles takes its owners' lines.
//
// The class (Jacob's look at HPDM on :5174, Boz 2026-10-17): the road read the nearest ② span's height and the ink drew the
// terrain, so the carriageway creased on its centreline (`claims-the-road-meets-itself-across-its-centreline.mjs`) and the
// stripe sank or stood off it. `groundDeformer.mjs#road` sweeps D = (1 − s)·L + s·H②, s = d① / (d① + d②), L the owners'
// blend of ①'s own edges (`ringOwner`); `#onInk` gives the ink its owners' lines. Any town: the rows are the deformer's
// contract, in memory, on a synthetic tile whose two ① owners meet at a corner on different grades and whose ② stands
// 0.3 m off its line (so the sweep's two ends differ).
// ⭐ MUTATION TEST: `--selftest` plants four defects (written to the OS temp dir) and expects each RED: the nearest owner
//   alone (a Voronoi step on the bisector) · pure 1/d weights (a far owner's weight drops to 0 in a step where its reach ends) · the road read as ① straight
//   across (a step at the curb) · the ink drawn as terrain.
//   node checks/claims-the-road-is-swept-from-its-line-to-its-curb.mjs [--selftest]
import { ROOT } from './_scenes.mjs'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const LINES = { A: (p) => 0.1 * (p[0] - 10) + 1, B: (p) => -0.05 * (p[1] + 10) + 1, C: () => 1, D: () => 1 }
LINES.Acurb = (p) => LINES.A(p) + 0.3; LINES.Bcurb = (p) => LINES.B(p) + 0.3
const rows = async (url) => {
  const { buildDeformer } = await import(url)
  const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], inner = sq(-5, -5, 5, 5)
  const D = buildDeformer({ town: 'selftest',
    tiles: [{ ring: sq(-10, -10, 10, 10), ringOwner: ['A', 'B', 'C', 'D'].map(skelId => ({ skelId })), iA: [inner], iaFull: [inner], iaStamp: [[0, 1, 2, 3]],
      runs: ['Acurb', 'Bcurb', 'C', 'D'].map(skelId => ({ skelId })) }],
    ink: [{ rings: [sq(-10, -10.01, 9.99, -10)], owners: ['A'] }, { rings: [sq(10, -9.99, 10.01, 10)], owners: ['B'] },
          { rings: [sq(9.99, -10.01, 10.01, -9.99)], owners: ['A', 'B'] }],
    raw: () => 3, line: { step: 1, heightAt: (id, p) => LINES[id]?.(p) ?? null },
    limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 }, bands: { curb: [], walk: [], lawn: [] } })
  const h = (x, z) => D.heightAt(x, z), e = 1e-6
  // away from the corner (P = (0, −7.5): d① 2.5, d② 2.5, owner B 10 m off, beyond the road's width): the sweep of A's line
  const far = 0.5 * LINES.A([0, -7.5]) + 0.5 * LINES.Acurb([0, -5])
  const step = (a, b) => (a == null || b == null) ? Infinity : Math.abs(a - b)
  return [
    ['the fixture is live: ② stands 0.3 m off its line, and A and B differ at the bisector', Math.abs(LINES.Acurb([0, -5]) - LINES.A([0, -5])) > 0.29 && Math.abs(LINES.A([8, -8]) - LINES.B([8, -8])) > 0.05],
    ['on ①, the road is its owner\'s line (it meets its ink with no step)', step(h(0, -10 + e), h(0, -10 - 0.005)) < 1e-4 && step(h(0, -10 - 0.005), LINES.A([0, -10.005])) < 1e-12],
    ['at ②, the road is ②\'s height (it meets the curb with no step)', step(h(0, -5 - e), h(0, -5 + e)) < 1e-4 && step(h(0, -5 - e), LINES.Acurb([0, -5])) < 1e-4],
    ['across the bisector of two ① owners the road is continuous', step(h(8 + 1e-5, -8), h(8 - 1e-5, -8)) < 1e-4],
    ['beyond the road\'s width from a corner, the road is its one owner\'s sweep exactly', step(h(0, -7.5), far) < 1e-12],
    // (5, −7.5): owner B is exactly the road's width away (d_B = W = 5), where its reach ends
    ['where a far owner\'s reach ends, the road is continuous', step(h(5 - 1e-5, -7.5), h(5 + 1e-5, -7.5)) < 1e-4],
    ['the ink between tiles takes its owner\'s line', step(h(0, -10.005), LINES.A([0, -10.005])) < 1e-12 && step(h(10.005, 0), LINES.B([10.005, 0])) < 1e-12],
    ['a crossing meets each owner\'s own ink with no step', step(h(9.99 - e, -10.005), h(9.99 + e, -10.005)) < 1e-4 && step(h(10.005, -9.99 + e), h(10.005, -9.99 - e)) < 1e-4],
  ]
}
const self = process.argv.includes('--selftest')
const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
const MUTANTS = [
  ['the nearest owner alone', 'return { v: s >= 1 ? n.H : (1 - s) * lineBlend(by, x, z, W) + s * n.H', 'return { v: s >= 1 ? n.H : (1 - s) * o1.o.at(x, z) + s * n.H', 'across the bisector'],
  ['pure 1/d weights', '(W === Infinity ? 1 : Math.max(0, W - d))', '1', 'reach ends'],
  ['the road read as ① straight across', 'const s = o1.d / W', 'const s = 0', 'at ②'],
  ['the ink drawn as terrain', 'if (!t) return onInk(x, z)', 'if (!t) { stats.outside++; return NONE }', 'the ink between tiles'],
]
const mutant = (from, to) => { const src = readFileSync(HOME, 'utf8')
  if (src.split(from).length !== 2) throw new Error(`selftest: groundDeformer.mjs no longer reads \`${from}\` exactly once — re-aim the mutation`)
  const f = join(mkdtempSync(join(tmpdir(), 'road-swept-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(from, to).replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
if (self) { let all = true
  for (const [name, from, to, row] of MUTANTS) { const R = await rows(mutant(from, to)), hit = R.find(r => r[0].includes(row))
    const caught = R[0][1] && hit && !hit[1]; all &&= caught
    console.log(`  ${caught ? '✅' : '⛔'} ${name}: "${hit?.[0] ?? row}" ${caught ? 'RED' : 'not caught'}`) }
  console.log(all ? '✅ selftest: every planted defect is caught' : '⛔ selftest: a planted defect passes'); process.exit(all ? 0 : 1) }
const R = await rows(pathToFileURL(HOME).href)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the road is swept from its line to its curb' : '⛔ the road is not swept from its line to its curb'); process.exit(ok ? 0 : 1)
