// claims-the-ground-height-is-a-function-of-the-point.mjs — THE DEFORMER'S ANSWER AT (x, z) DEPENDS ON (x, z) ALONE, never
// on which point was asked first.
//
// The class (Cairn's read, Boz's ruling 2026-10-12): `groundDeformer.mjs#resolve` memoized by the 1 mm lattice cell, so the
// first point into a cell answered for every later point in it: the height, the owner and the unowned verdict all followed
// the ORDER conformity happened to sample in. A town nobody looked at would bake a ground that changes when the sampling
// order does, with nothing to say so. The memo now keys the exact position.
// Synthetic, in memory: one tile whose ② rises along its edge; two road-side points 0.3 mm apart (one lattice cell), asked
// in both orders by two fresh deformers.
// ⭐ MUTATION TEST: `--selftest` runs the same rows against the deformer with the 1 mm lattice key planted back (written to
//   the OS temp dir) and expects them RED.
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
  const make = () => buildDeformer({ tiles: [{ ring: sq(-10, -10, 10, 10), iA: [inner], iaFull: [inner], iaStamp: [[0, 0, 0, 0]],
    runs: [{ poly: [...inner, inner[0]], h: [0, 1, 2, 3, 0] }] }], raw: () => 0,
    limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 }, bands: { curb: [], walk: [], lawn: [] } })
  const P = [[0, -5.5], [0.0003, -5.5]]
  const ask = (D, pts) => pts.map(([x, z]) => [D.heightAt(x, z), D.ownerAt(x, z), D.unownedIn(x, z)])
  const fw = ask(make(), P), rv = ask(make(), [...P].reverse()).reverse()
  return [
    ['the fixture is live: the two points are in one 1 mm cell and the line rises between them', fw[0][0] != null && Math.round(P[0][0] * CLIP_SCALE) === Math.round(P[1][0] * CLIP_SCALE)],
    ['each point gets its own height (asked first or second)', fw[0][0] !== fw[1][0] && rv[0][0] !== rv[1][0]],
    ['forward and reversed agree on every height, owner and unowned verdict', fw.every((r, i) => r.every((v, j) => v === rv[i][j]))],
  ]
}
const self = process.argv.includes('--selftest')
const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
const mutant = () => { const src = readFileSync(HOME, 'utf8'), key = 'const mk = `${x},${z}`'
  if (src.split(key).length !== 2) throw new Error(`selftest: groundDeformer.mjs no longer keys its memo with \`${key}\` — re-aim the mutation`)
  const f = join(mkdtempSync(join(tmpdir(), 'height-of-point-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(key, `const mk = \`\${Math.round(x * ${CLIP_SCALE})},\${Math.round(z * ${CLIP_SCALE})}\``)
    .replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
const R = await rows(self ? mutant() : pathToFileURL(HOME).href)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
if (self) { const caught = R[0][1] && (!R[1][1] || !R[2][1])
  console.log(caught ? '✅ selftest: the 1 mm lattice key answers by sampling order (RED)' : '⛔ selftest: the check does not catch a lattice-keyed memo'); process.exit(caught ? 0 : 1) }
const ok = R.every(r => r[1])
console.log(ok ? '✅ the ground height is a function of the point' : '⛔ the deformer answers by sampling order'); process.exit(ok ? 0 : 1)
