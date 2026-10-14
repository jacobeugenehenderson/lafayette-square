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
// ⭐ AND IT IS NEVER NON-FINITE (Boz's ruling 2026-10-13): d63b43ea's heightAt returned NaN where an ease beside a run that
//   declares no line ends partway along a segment. The real site is a fixture (checks/fixtures/deformer-nan-huron.json).
// ⭐ MUTATION TEST: `--selftest` runs the same rows against one copy written to the OS temp dir carrying three mutations,
//   each caught by its own rows: the 1 mm lattice key planted back, an old-generation hit that returns another point's
//   answer, and the absorption interpolated into a station past the ease (d63b43ea's NaN).
//   node checks/claims-the-ground-height-is-a-function-of-the-point.mjs [--selftest]
import { ROOT } from './_scenes.mjs'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { makeElevationSampler } from '../src/lib/terrainCommon.js'

const rows = async (url) => {
  const { buildDeformer } = await import(url)
  const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], inner = sq(-5, -5, 5, 5)
  const make = (memoGeneration) => buildDeformer({ memoGeneration, tiles: [{ ring: sq(-10, -10, 10, 10), iA: [inner], iaFull: [inner], iaStamp: [[0, 0, 0, 0]], iaArc: [[null, null, null, null]], iaCap: [[null, null, null, null]], capCouplers: [],
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
    ...finiteRows(buildDeformer),
  ]
}
// ⭐ NEVER A NON-FINITE HEIGHT (Boz's ruling, 2026-10-13): d63b43ea's heightAt returned NaN where the ease beside a run that
// declares no line ends partway along a segment (its absorption interpolated into a station past the ease: 0 · NaN). The
// fixture is the real site, cut from Huron's dump (checks/fixtures/deformer-nan-huron.json, scratch/ground-budget/
// nan-fixture.mjs): tiles 9 and 10, their bands, and the terrain under the two points, sampled by the real sampler.
const finiteRows = (buildDeformer) => {
  const F = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures/deformer-nan-huron.json'), 'utf8')), P = F.terrain.patch
  const data = new Proxy({}, { get: (_, k) => { const idx = Number(k), j = Math.floor(idx / F.terrain.width) - P.j0, i = idx % F.terrain.width - P.i0
    return i >= 0 && j >= 0 && i < P.w && j < P.h ? P.data[j * P.w + i] : 0 } })
  const raw = makeElevationSampler({ width: F.terrain.width, height: F.terrain.height, bounds: F.terrain.bounds, data }).getElevationRaw
  const D = buildDeformer({ ...structuredClone(F.deform), raw })
  const ask = (x, z) => { try { const h = D.heightAt(x, z); return h == null || Number.isFinite(h) ? { ok: true, h } : { ok: false, why: `${h}` } } catch (e) { return { ok: false, why: e.message.slice(0, 90) } } }
  const at = F.points.map(([x, z]) => ask(x, z))
  // a 1 m grid over the region the fixture carries (150 m round its points: its bands and its terrain)
  let n = 0, drawn = 0; const bad = []
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const [x, z] of F.points) { x0 = Math.min(x0, x - 150); z0 = Math.min(z0, z - 150); x1 = Math.max(x1, x + 150); z1 = Math.max(z1, z + 150) }
  for (let x = Math.ceil(x0); x <= x1; x++) for (let z = Math.ceil(z0); z <= z1; z++) { n++; const r = ask(x, z); if (!r.ok) bad.push(`(${x}, ${z}) ${r.why}`); else if (r.h != null) drawn++ }
  return [
    [`the NaN site (Huron, ${F.points.map(p => `(${p.join(', ')})`).join(' · ')}): heightAt is finite there${at.some(r => !r.ok) ? ` — ${at.map(r => r.why ?? 'ok').join(' · ')}` : ''}`, at.every(r => r.ok) && at.some(r => r.h != null)],
    [`heightAt is finite over a 1 m grid round the site (${n} points, ${drawn} drawn)${bad.length ? ` — ${bad.length} not: ${bad.slice(0, 2).join(' · ')}` : ''}`, bad.length === 0 && drawn > 0],
  ]
}
const self = process.argv.includes('--selftest')
const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
// ⭐ ONE mutated copy carrying BOTH mutations (checks/tier.mjs reads one temp-dir `mutant`). Their effects are separable
// by construction: the lattice key moves only the two points 0.3 mm apart (rows 4–5), the old-generation answer only the
// small memo's sequence, whose points are 2 m apart (row 2), and the absorption only the fixture's site (the last two rows),
// so each verdict below names its own mutation.
const mutant = () => { const src = readFileSync(HOME, 'utf8'), key = 'const mk = `${x},${z}`', old = 'memoOld.has(mk) ? memoOld.get(mk) :'
  const hold = 'if (!Number.isFinite(A0) || !Number.isFinite(A1)) '   // ⛔ no `return` in this literal: tier.mjs cannot then read the mutant
  if (src.split(hold).length !== 2) throw new Error('selftest: groundDeformer.mjs no longer holds the absorption at a station past the ease — re-aim the mutation')
  if (src.split(key).length !== 2) throw new Error(`selftest: groundDeformer.mjs no longer keys its memo with \`${key}\` — re-aim the mutation`)
  if (src.split(old).length !== 2) throw new Error(`selftest: groundDeformer.mjs no longer reads its old generation with \`${old}\` — re-aim the mutation`)
  const f = join(mkdtempSync(join(tmpdir(), 'height-of-point-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(key, `const mk = \`\${Math.round(x * ${CLIP_SCALE})},\${Math.round(z * ${CLIP_SCALE})}\``)
    .replace(old, 'memoOld.has(mk) ? memoOld.values().next().value :').replace(hold, 'if (false) ')
    .replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
const R = await rows(self ? mutant() : pathToFileURL(HOME).href)
if (self) {
  const lattice = R, evict = R
  const show = (name, R) => { console.log(`  ${name}:`); for (const [m, ok] of R) console.log(`    ${ok ? '✅' : '⛔'} ${m}`) }
  show('the mutant: the 1 mm lattice key + an old-generation hit answering for another point', R)
  const c1 = lattice[3][1] && (!lattice[4][1] || !lattice[5][1]), c2 = evict[1][1] && !evict[2][1]
  console.log(c1 ? '✅ selftest: the 1 mm lattice key answers by sampling order (RED)' : '⛔ selftest: the check does not catch a lattice-keyed memo')
  console.log(c2 ? '✅ selftest: a wrong answer from the old generation is caught (RED)' : '⛔ selftest: the check does not catch a memo whose eviction changes an answer')
  const c3 = !R[R.length - 2][1] && !R[R.length - 1][1]
  console.log(c3 ? '✅ selftest: the absorption interpolated past the ease is caught (RED)' : '⛔ selftest: the check does not catch a non-finite height')
  process.exit(c1 && c2 && c3 ? 0 : 1) }
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the ground height is a finite function of the point' : '⛔ the deformer answers by sampling order, or not with a number'); process.exit(ok ? 0 : 1)
