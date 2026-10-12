// claims-a-band-is-the-pieces-that-hold-it.mjs — THE GROUND DEFORMER READS A POINT AS IN A CLASS (walk · lawn · curb)
// WHEN SOME PAINTED PIECE OF THAT CLASS HOLDS IT — never by parity across the whole class.
//
// The painter can lay two pieces of one class over each other (two land uses' lawns along an evidence edge, a curb and a
// curb cut). Even-odd over every ring of the class reads their overlap as OUT, a lot that is not there; the ped band
// ends at it and every walk point past it has no owner, which the bake throws on (measured, HPDM 2026-10-12: the whole
// treelawn:vacant | treelawn:residential seam class). Parity belongs to one piece: its outer and its holes.
// Synthetic, in memory: two lawn squares overlapping by 2 mm, a third with a hole.
// ⭐ MUTATION TEST: `--selftest` runs the same rows against the deformer with every piece given ONE id (in memory, written
//   to the OS temp dir) — class-wide parity, the code before — and expects the overlap rows RED, the hole and gap rows GREEN.
//   node checks/claims-a-band-is-the-pieces-that-hold-it.mjs [--selftest]
import { ROOT } from './_scenes.mjs'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const rows = async (url) => {
  const { buildDeformer } = await import(url)
  const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
  const D = buildDeformer({ tiles: [], raw: () => 0, limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 },
    bands: { curb: [], walk: [], lawn: [{ outer: sq(0, 0, 1.002, 1), holes: [] }, { outer: sq(1, 0, 2, 1), holes: [] }, { outer: sq(3, 0, 5, 1), holes: [sq(3.5, 0.2, 4.5, 0.8)] }] } })
  const B = D._bandsAlong(0.01, 0.5, 1, 0, 2.5).filter(b => b.to - b.from > 1e-6)
  return [
    ['a point where two lawn pieces overlap is lawn', D._inClass('lawn', 1.001, 0.5)],
    ['a ray across the overlap reads one lawn band, no lot inside it', B[0].cls === 'lawn' && Math.abs(B[0].to - 1.99) < 1e-6],
    ['a piece\'s own hole is still a hole', !D._inClass('lawn', 4, 0.5)],
    ['between pieces that do not touch is lot', !D._inClass('lawn', 2.5, 0.5)],
  ]
}
const self = process.argv.includes('--selftest')
const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
const mutant = () => { const src = readFileSync(HOME, 'utf8'), one = 'const item = nItems++'
  if (src.split(one).length !== 2) throw new Error(`selftest: groundDeformer.mjs no longer numbers its pieces with \`${one}\` — re-aim the mutation`)
  const f = join(mkdtempSync(join(tmpdir(), 'band-pieces-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(one, 'const item = (nItems++, 0)').replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
const R = await rows(self ? mutant() : pathToFileURL(HOME).href)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
if (self) { const red = !R[0][1] && !R[1][1], kept = R[2][1] && R[3][1]
  console.log(red && kept ? '✅ selftest: class-wide parity reads the overlap as lot (RED), and the hole and the gap still read right' : '⛔ selftest: the check does not catch class-wide parity'); process.exit(red && kept ? 0 : 1) }
const ok = R.every(r => r[1])
console.log(ok ? '✅ a band is the pieces that hold it' : '⛔ the deformer reads a class by parity across its pieces'); process.exit(ok ? 0 : 1)
