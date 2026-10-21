// claims-the-ground-height-is-a-function-of-the-point.mjs — THE DEFORMER'S ANSWER AT (x, z) DEPENDS ON (x, z) ALONE, never
// on which point was asked first.
//
// The class (Cairn's read, Boz's ruling 2026-10-12): `groundDeformer.mjs#resolve` memoized by the 1 mm lattice cell, so the
// first point into a cell answered for every later point in it: the height, the owner and the unowned verdict all followed
// the ORDER conformity happened to sample in. A town nobody looked at would bake a ground that changes when the sampling
// order does, with nothing to say so. The memo now keys the exact position.
// Synthetic, in memory: one tile whose ② rises along its edge; two road-side points 0.3 mm apart (one lattice cell), asked
// in both orders by two fresh deformers.
// ⭐ AND ACROSS A TURN OF THE MEMO (2026-10-21): at V8's Map cap the memo is cleared (`V8_MAP_MAX_ENTRIES`). A deformer
//   with a 2-answer cap, asked a sequence that turns it and then re-asks a point cleared out of it (a recompute, not a hit),
//   answers every height, owner and unowned verdict exactly as an uncapped one, and never holds more than its cap. A cap of
//   0 or past V8's is refused by name.
// ⭐ MUTATION TEST: `--selftest` runs the same rows against two planted mutants (written to the OS temp dir) and expects each
//   RED: the 1 mm lattice key, and a turn that does not clear (the memo grows past its cap).
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
  const make = (memoCap) => buildDeformer({ town: "selftest", ...(memoCap != null ? { memoCap } : {}), tiles: [{ ring: sq(-10, -10, 10, 10), ringOwner: [0, 1, 2, 3].map(() => ({ skelId: 'l' })), iA: [inner], iaFull: [inner], iaStamp: [[0, 0, 0, 0]],
    runs: [{ skelId: 'l', poly: [...inner, inner[0]] }] }], ink: [], raw: () => 0, line: { step: 1, heightAt: (id, p) => p[0] + 5 },
    limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 }, bands: { curb: [], walk: [], lawn: [] } })
  const P = [[0, -5.5], [0.0003, -5.5]]
  const ask = (D, pts) => pts.map(([x, z]) => [D.heightAt(x, z), D.ownerAt(x, z), D.unownedIn(x, z)])
  const fw = ask(make(), P), rv = ask(make(), [...P].reverse()).reverse()
  // the turn: four distinct road-side points, then the first again (cleared out of a 2-answer memo by then: a recompute)
  const Q = [[0, -5.5], [1, -5.5], [2, -5.5], [3, -5.5], [0, -5.5]]
  const capped = make(2), log = console.warn; console.warn = () => {}
  let tq, sizes; try { tq = Q.map(([x, z]) => { const r = [capped.heightAt(x, z), capped.ownerAt(x, z), capped.unownedIn(x, z)]; return r }); sizes = capped._memoSize() } finally { console.warn = log }
  const uq = ask(make(), Q)
  const refused = (cap) => { try { make(cap); return false } catch (e) { return /V8's Map cap/.test(e.message) } }
  return [
    ['the fixture is live: the two points are in one 1 mm cell and the line rises between them', fw[0][0] != null && Math.round(P[0][0] * CLIP_SCALE) === Math.round(P[1][0] * CLIP_SCALE)],
    ['each point gets its own height (asked first or second)', fw[0][0] !== fw[1][0] && rv[0][0] !== rv[1][0]],
    ['forward and reversed agree on every height, owner and unowned verdict', fw.every((r, i) => r.every((v, j) => v === rv[i][j]))],
    ['the turn fixture is live: a 2-answer memo turned, and the re-asked point was cleared out of it (recomputed)', capped.stats.memoTurns >= 2 && tq[4][0] != null],
    ['across the turn every height, owner and unowned verdict equals an uncapped deformer\'s', tq.every((r, i) => r.every((v, j) => v === uq[i][j]))],
    ['the memo never holds more than its cap', sizes <= 2],
    ['a cap of 0 and a cap past V8\'s Map limit are refused by name', refused(0) && refused(2 ** 24 + 1)],
  ]
}
const self = process.argv.includes('--selftest')
const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
// ⭐ ONE mutated copy (checks/tier.mjs reads one temp-dir `mutant`, never a loop variable fed to import()) carrying both
//   mutations behind a switch read at call time: 'lattice' plants the 1 mm memo key, 'noclear' a turn that does not clear
const KEY = 'const mk = unownedKey(x, z)', CLEAR = 'memo.clear(); stats.memoTurns++'
const mutant = () => { const src = readFileSync(HOME, 'utf8')
  for (const a of [KEY, CLEAR]) if (src.split(a).length !== 2) throw new Error(`selftest: groundDeformer.mjs no longer carries \`${a}\` once — re-aim the mutation`)
  const f = join(mkdtempSync(join(tmpdir(), 'height-of-point-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(KEY, `const mk = globalThis.__MUT === 'lattice' ? \`\${Math.round(x * ${CLIP_SCALE})},\${Math.round(z * ${CLIP_SCALE})}\` : unownedKey(x, z)`)
    .replace(CLEAR, "if (globalThis.__MUT !== 'noclear') memo.clear(); stats.memoTurns++")
    .replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
if (self) {
  const MURL = mutant()
  globalThis.__MUT = 'lattice'
  const L = await rows(MURL), lattice = L[0][1] && (!L[1][1] || !L[2][1])
  console.log(lattice ? '✅ selftest: the 1 mm lattice key answers by sampling order (RED)' : '⛔ selftest: the check does not catch a lattice-keyed memo')
  globalThis.__MUT = 'noclear'
  const N = await rows(MURL), noclear = N[3][1] && !N[5][1]
  console.log(noclear ? '✅ selftest: a turn that does not clear lets the memo grow past its cap (RED)' : '⛔ selftest: the check does not catch a turn that does not clear')
  process.exit(lattice && noclear ? 0 : 1) }
const R = await rows(pathToFileURL(HOME).href)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the ground height is a function of the point' : '⛔ the deformer answers by sampling order'); process.exit(ok ? 0 : 1)
