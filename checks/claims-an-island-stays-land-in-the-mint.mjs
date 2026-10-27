#!/usr/bin/env node
// CLAIM — AN ISLAND STAYS LAND IN THE MINT. The coast reaches ① in coastFile.mjs#readCoast's convention, checked at that one
// door: each water body's outer wound positive, each island (a hole in the water) negative (Zob, 2026-10-26: "the sign is the
// island"). The mint closes the land as frame − (ink ∪ water) by nonzero fill, so it turns the water to the ink's sign AS ONE —
// every ring reversed together when the ink is wound negative (`tileGround.js#mintProtopolygon`). It used to rewind each ring to
// the ink's sign on its own (the clockwise-lake guard, 2026-10-25), which turned an island hole into water. Supersedes
// claims-a-clockwise-lake-keeps-its-water: a wrongly wound lake is now refused at the door, before the mint.
//   (1) PLANTED: two streets running into a lake that holds an island, the lake positive and the island negative: the mint
//       returns the island as a land face (its area, less the ink at its shore).
//   (2) SOURCE: the mint turns the water by one flag, never ring by ring (read, so a deleted or changed line is RED).
//   (3) A lake handed to the mint wound NEGATIVE is refused by name: the sign rule (src/lib/coastSign.js, the one predicate
//       readCoast's door also reads) — the class the retired clockwise-lake check covered.
//   MUTANT (always run): the mint copied with the old per-ring rewind must lose the island (no land face there), or (1) proves
//   nothing.
//   node checks/claims-an-island-stays-land-in-the-mint.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const st = (id, pts) => ({ skelId: id, name: id, points: pts, highway: 'residential', caps: { start: { degree: 1 }, end: { degree: 1 } } })
const streets = [st('a', [[-100, 0], [-100, -150]]), st('b', [[100, 0], [100, -150]]), st('c', [[-150, 0], [-100, 0], [100, 0], [150, 0]])]
streets[0].caps.start.degree = 3; streets[1].caps.start.degree = 3
const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const wind = (r, sign) => (Math.sign(sa(r)) === sign ? r : [...r].reverse())
const arc = [[-200, -100], [0, -104], [200, -100]]
const lake = wind([...arc, [200, -200], [-200, -200]], 1)                         // readCoast's convention: the outer positive
const island = wind([[-40, -180], [40, -180], [40, -160], [-40, -160]], -1)       // …and the island negative
const ISLAND = Math.abs(sa(island))
const boundary = Array.from({ length: 48 }, (_, i) => [190 * Math.cos(i / 48 * 2 * Math.PI), 190 * Math.sin(i / 48 * 2 * Math.PI)])
const quiet = async (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f() } finally { console.log = l; console.warn = w } }
const mint = (mod) => quiet(() => mod.mintProtopolygon({ streets, boundary, bb: { x0: -200, x1: 200, z0: -200, z1: 200 }, coast: [lake, island], coastArcs: [arc, [...island, island[0]]] }))
// the land face inside the island: a block whose every vertex lies within the island's box
const islandFace = (MP) => MP.blocks.map((b, k) => ({ b, k })).filter(({ b }) => b.every(([x, z]) => x >= -40.01 && x <= 40.01 && z >= -180.01 && z <= -159.99))
  .map(({ b, k }) => Math.abs(sa(b)) - (MP.blockHoles[k] || []).reduce((u, h) => u + Math.abs(sa(h)), 0))

const live = await import('../src/lib/tileGround.js')
const L = islandFace(await mint(live))
row(L.length === 1 && L[0] > 0.98 * ISLAND && L[0] <= ISLAND, `(1) a lake (positive) holding an island (negative): the island returns as ${L.length} land face(s)${L.length ? `, ${L[0].toFixed(2)} m² of its ${ISLAND.toFixed(0)} m²` : ''}`)
// (3) A LAKE HANDED TO THE MINT WOUND NEGATIVE is refused by name (the one predicate, src/lib/coastSign.js; Boz, 2026-10-27):
// the class the retired clockwise-lake check covered, now refused at the mint as well as at readCoast's door
{ let refused = null; try { await quiet(() => live.mintProtopolygon({ streets, boundary, bb: { x0: -200, x1: 200, z0: -200, z1: 200 }, coast: [wind(lake, -1)], coastArcs: [arc] })) } catch (e) { refused = String(e.message) }
  row(!!refused && /break the sign rule/.test(refused), `(3) a lake handed to the mint wound negative is ${refused ? (/break the sign rule/.test(refused) ? 'REFUSED by name (the sign rule)' : `refused, but not by the sign rule (${refused.slice(0, 100)})`) : 'MINTED — the sign rule is not read'}`) }
const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
const LINE = 'const w = r.map(p => [p[0], p[1]]); if (flip) w.reverse()'
row(src.split(LINE).length === 2 && src.includes('const flip = inkSign < 0'), '(2) the mint turns the water by one flag (the ink\'s sign), never ring by ring')
// the mutant: ONE modified tileGround.js in its own temp dir, the old per-ring rewind restored, imports pointed at the live src/lib
{ const dir = mkdtempSync(join(tmpdir(), 'island-'))
  try {
    const LIB = join(ROOT, 'src/lib')
    writeFileSync(join(dir, 'tileGround.js'), src.replace(LINE, 'const w = r.map(p => [p[0], p[1]]); if (Math.sign(signedArea(w)) !== inkSign) w.reverse()')
      .replace(/from \x27(\.{1,2}\/[^\x27]+)\x27/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`)
      .replace(/from \x27clipper-lib\x27/g, `from "${import.meta.resolve('clipper-lib')}"`))
    const mut = await import(pathToFileURL(join(dir, 'tileGround.js')).href)
    let M = null, refused = null; try { M = islandFace(await mint(mut)) } catch (e) { refused = String(e.message).split('\n')[0].slice(0, 140) }
    const ok = !!refused || !(M.length === 1 && M[0] > 0.98 * ISLAND)
    row(ok, `mutant: with each ring rewound to the ink's sign, the island ${refused ? `is REFUSED (${refused})` : `returns ${M.length} land face(s)`} — must not be the island`)
  } finally { rmSync(dir, { recursive: true, force: true }) } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ an island stays land in the mint')
process.exit(red ? 1 : 0)
