// claims-the-ground-height-is-a-function-of-the-point.mjs — THE DEFORMER'S ANSWER AT (x, z) DEPENDS ON (x, z) ALONE, never
// on which point was asked first.
//
// The class (Cairn's read, Boz's ruling 2026-10-12): `groundDeformer.mjs#resolve` memoized by the 1 mm lattice cell, so the
// first point into a cell answered for every later point in it: the height, the owner and the unowned verdict all followed
// the ORDER conformity happened to sample in. A town nobody looked at would bake a ground that changes when the sampling
// order does, with nothing to say so. The memo now keys the exact position.
// Synthetic, in memory: one tile whose ② rises along its edge; two road-side points 0.3 mm apart (one lattice cell), asked
// in both orders by two fresh deformers.
// ⭐ AND EVICTION CANNOT CHANGE AN ANSWER (Boz's ruling 2026-10-13): the memo is bounded by V8's Map cap, in two
//   generations. A deformer whose generation holds 2 answers is asked a sequence that turns it and hits the old generation,
//   and must answer exactly as the default-bound one does.
// ⭐ MUTATION TEST: `--selftest` runs the same rows against two mutants written to the OS temp dir and expects each RED:
//   the 1 mm lattice key planted back, and an old-generation hit that returns another point's answer.
//   node checks/claims-the-ground-height-is-a-function-of-the-point.mjs [--selftest]
import { ROOT } from './_scenes.mjs'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { CLIP_SCALE } from '../src/lib/lattice.js'

const rows = async (url) => {
  const { buildDeformer } = await import(url)
  const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], inner = sq(-5, -5, 5, 5)
  const make = (memoGeneration) => buildDeformer({ memoGeneration, tiles: [{ ring: sq(-10, -10, 10, 10), iA: [inner], iaFull: [inner], iaStamp: [[0, 0, 0, 0]],
    runs: [{ poly: [...inner, inner[0]], h: [0, 1, 2, 3, 0] }] }], raw: () => 0,
    limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 }, bands: { curb: [], walk: [], lawn: [] } })
  const P = [[0, -5.5], [0.0003, -5.5]]
  const ask = (D, pts) => pts.map(([x, z]) => [D.heightAt(x, z), D.ownerAt(x, z), D.unownedIn(x, z)])
  const fw = ask(make(), P), rv = ask(make(), [...P].reverse()).reverse()
  const Q = [-4, -2, 0, 2, 4].map(x => [x, -5.5]), seq = [0, 1, 2, 0, 1, 3, 4, 2, 0, 4, 3, 1].map(i => Q[i])
  const small = make(2), big = make(), es = ask(small, seq), eb = ask(big, seq)
  const refuses = (g) => { try { make(g); return false } catch (e) { return /V8's Map cap/.test(e.message) } }
  return [
    ['a generation that cannot hold one answer, or more than a Map can, is refused by name', refuses(0) && refuses(2 ** 24 + 1)],
    ['the eviction fixture is live: the small memo turned and the points differ in height', small.stats.memoTurns > 0 && big.stats.memoTurns === 0 && new Set(eb.map(r => r[0])).size === Q.length],
    ['a memo that evicts answers exactly as one that never does', es.every((r, i) => r.every((v, j) => v === eb[i][j]))],
    ['the fixture is live: the two points are in one 1 mm cell and the line rises between them', fw[0][0] != null && Math.round(P[0][0] * CLIP_SCALE) === Math.round(P[1][0] * CLIP_SCALE)],
    ['each point gets its own height (asked first or second)', fw[0][0] !== fw[1][0] && rv[0][0] !== rv[1][0]],
    ['forward and reversed agree on every height, owner and unowned verdict', fw.every((r, i) => r.every((v, j) => v === rv[i][j]))],
  ]
}
const self = process.argv.includes('--selftest')
const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
const mutant = (key, to, what) => { const src = readFileSync(HOME, 'utf8')
  if (src.split(key).length !== 2) throw new Error(`selftest: groundDeformer.mjs no longer has \`${key}\` — re-aim the ${what} mutation`)
  const f = join(mkdtempSync(join(tmpdir(), 'height-of-point-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(key, to)
    .replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
if (self) {
  const lattice = await rows(mutant('const mk = `${x},${z}`', `const mk = \`\${Math.round(x * ${CLIP_SCALE})},\${Math.round(z * ${CLIP_SCALE})}\``, 'lattice'))
  const evict = await rows(mutant('memoOld.has(mk) ? memoOld.get(mk) :', 'memoOld.has(mk) ? memoOld.values().next().value :', 'eviction'))
  const show = (name, R) => { console.log(`  ${name}:`); for (const [m, ok] of R) console.log(`    ${ok ? '✅' : '⛔'} ${m}`) }
  show('the 1 mm lattice key', lattice); show('an old-generation hit answering for another point', evict)
  const c1 = lattice[3][1] && (!lattice[4][1] || !lattice[5][1]), c2 = evict[1][1] && !evict[2][1]
  console.log(c1 ? '✅ selftest: the 1 mm lattice key answers by sampling order (RED)' : '⛔ selftest: the check does not catch a lattice-keyed memo')
  console.log(c2 ? '✅ selftest: a wrong answer from the old generation is caught (RED)' : '⛔ selftest: the check does not catch a memo whose eviction changes an answer')
  process.exit(c1 && c2 ? 0 : 1) }
const R = await rows(pathToFileURL(HOME).href)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the ground height is a function of the point' : '⛔ the deformer answers by sampling order'); process.exit(ok ? 0 : 1)
