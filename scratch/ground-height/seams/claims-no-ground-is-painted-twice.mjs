// ⏸ PARKED (reverted with its painter, 2026-10-12; cartograph/BACKLOG.md "no ground is painted twice"): belongs in checks/ once a cut passes the gate.
// claims-no-ground-is-painted-twice.mjs — THE PAINTER CUTS A TILE'S LAND-USE KEYS DISJOINT: no point is painted by two
// classes, and no ground inside the pieces is left unpainted between them (A10, one owner per point; Boz's ruling 2026-10-12).
//
// Derive's evidence regions sit on its own 1 cm grid and can overlap by millimetres (HPDM tile 76: OSM residential over a
// vacant parcel, 0.20 m², in ribbons.json `landEvidence`). Cut independently, both classes painted that ground: it drew
// twice and counted twice. `rekeyByPiece` now gives each class own ∩ its regions MINUS what earlier classes took, and
// `underived` the rest. Synthetic, in memory, through the real `rekeyByPiece`:
//   (a) two evidence regions overlapping by 3 mm → the classes do not overlap, the first in the evidence's order keeps it,
//       and the union is the whole tile;
//   (b) two evidence regions 2 mm apart → the gap is painted underived, not left out.
// ⭐ MUTATION TEST: `--selftest` runs the rows on tileGround.js with the subtraction removed (the old independent cut, in
//   memory, in a temp copy) and expects (a)'s overlap row RED.
//   node checks/claims-no-ground-is-painted-twice.mjs [--selftest]
import { ROOT } from './_scenes.mjs'
import { join, dirname } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const HOME = join(ROOT, 'src/lib/tileGround.js'), OWN = '\u0000own'
const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
const area = (rs) => Math.abs((rs || []).reduce((t, r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return t + a / 2 }, 0))

async function rows(url) {
  const { rekeyByPiece } = await import(url)
  const { intersectRings } = await import(pathToFileURL(join(ROOT, 'src/lib/buildBlockGeometryV2.js')).href)
  const tile = (A, B) => ({ iA: [sq(0, 0, 10, 10)], luByPiece: ['residential'],
    evidenceByPiece: [[{ lu: 'residential', ev: 'residential', rings: [A] }, { lu: 'vacant', ev: 'vacant', rings: [B] }]] })
  const a = rekeyByPiece(tile(sq(0, 0, 5.003, 10), sq(5, 0, 10, 10)), { [OWN]: [sq(0, 0, 10, 10)] })
  const b = rekeyByPiece(tile(sq(0, 0, 4.999, 10), sq(5.001, 0, 10, 10)), { [OWN]: [sq(0, 0, 10, 10)] })
  const allA = Object.values(a).flat(), allB = Object.values(b).flat()
  return [
    ['(a) overlapping evidence: the two classes paint no ground in common', area(intersectRings(a.residential || [], a.vacant || [])) < 1e-6],
    ['(a) the class first in the evidence order keeps the overlap (residential 50.03 m²)', Math.abs(area(a.residential) - 50.03) < 1e-3],
    ['(a) together they paint the whole tile once (100 m²)', Math.abs(allA.reduce((t, r) => t + area([r]), 0) - 100) < 1e-3],
    ['(b) a 2 mm gap between evidence regions is painted underived', Math.abs(area(b.underived) - 0.02) < 1e-3],
    ['(b) together they paint the whole tile once (100 m²)', Math.abs(allB.reduce((t, r) => t + area([r]), 0) - 100) < 1e-3],
  ]
}

const self = process.argv.includes('--selftest')
let url = pathToFileURL(HOME).href, tmp = null
if (self) {
  const src = readFileSync(HOME, 'utf8'), cut = 'const part = taken.length ? differenceRings(mine, taken) : mine'
  if (src.split(cut).length !== 2) throw new Error(`selftest: rekeyByPiece no longer reads \`${cut}\` — re-aim the mutation`)
  // the copy lives inside the repo (node_modules/.cache) so its bare imports resolve; its relative imports are made absolute
  const lib = dirname(HOME)
  mkdirSync(join(ROOT, 'node_modules/.cache'), { recursive: true }); tmp = mkdtempSync(join(ROOT, 'node_modules/.cache/painted-twice-'))
  const f = join(tmp, 'tileGround.js')
  writeFileSync(f, src.replace(cut, 'const part = mine').replace(/from '(\.\.?\/[^']+)'/g, (_, p) => `from '${pathToFileURL(join(lib, p)).href}'`))
  url = pathToFileURL(f).href
}
let R
try { R = await rows(url) } finally { if (tmp) rmSync(tmp, { recursive: true, force: true }) }
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
if (self) { const red = !R[0][1]; console.log(red ? '✅ selftest: the independent cut paints the overlap twice (RED)' : '⛔ selftest: the check does not catch the independent cut'); process.exit(red ? 0 : 1) }
const ok = R.every(r => r[1]); console.log(ok ? '✅ no ground is painted twice' : '⛔ the painter paints some ground twice, or leaves some out'); process.exit(ok ? 0 : 1)
