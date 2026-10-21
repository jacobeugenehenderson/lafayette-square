// claims-the-height-code-owns-what-is-drawn.mjs — THE DEFORMER GIVES NO HEIGHT IT DOES NOT OWN, AND REFUSES WHAT THE DRAWING
// NEEDS AND NOBODY OWNS (BRIEF-the-height-code-owns-what-is-drawn, Jacob 2026-10-20).
//
// Synthetic, in memory: one tile, a square ② whose bottom edge is the frame's (`__boundary__`, no line: the rim).
//   1. A FRAME EDGE OUTSIDE THE DRAWING HAS NO HEIGHT TO GIVE: with the disc clear of that edge, the deformer builds and counts
//      it exempt; with the disc over it, the same edge REFUSES (the frame must contain the disc), and so does the same edge
//      unstamped at all. No rim height, no fallback.
//   3. A RIM RING READS ITS SIDE OFF THE UNCUT ② (`iaFull`): a block whose longest ② edge lies outside the disc, a walk along
//      an edge inside it, the terrain falling inward. Read off ②, the walk takes up its share of the fall; read off the
//      disc-cut block (`iA`), every station's ray points into the road, finds no band, and the walk sits flat at the line.
//   2. A POINT IN A DRAWN BAND THAT NO BAND REACHES IS UNOWNED: a walk island with lot between it and ②, so no ray reaches it
//      and no leg's region holds it. It is named (`unownedIn`), its height null, never the nearer line's.
//   4. THE BAKE RECORDS AN UNOWNED VERTEX EXACTLY (bake-ground.js#unownedKey, imported; terrainPart read): its key parses back
//      to the very floats, two vertices 1 mm apart are two records, terrainPart records through the key, and the refusal
//      writes the full list beside the slab. Keyed at 1 cm, HPDM's 1,234 could not be re-resolved (Zob, 2026-10-21).
// ⭐ MUTATION TEST: `--selftest` plants each wrong deformer back (written to the OS temp dir) and expects its row RED:
//   the exemption without the disc test (an edge inside the disc exempted) · a nearest-line fallback for an unowned point ·
//   the side read off the disc-cut block · the 1 cm rounding restored to the unowned key (in the key and in terrainPart) ·
//   a stale unowned list left beside a good slab.
//   node checks/claims-the-height-code-owns-what-is-drawn.mjs [--selftest]
import { ROOT } from './_scenes.mjs'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const rows = async (url) => {
  const { buildDeformer } = await import(url)
  const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], inner = sq(-5, -5, 5, 5)
  // ② edge 0 runs (-5,-5)→(5,-5): the frame's run; the other three a street's
  const make = ({ disc, stamp0 = 1 }) => buildDeformer({ town: 'selftest',
    tiles: [{ ring: sq(-10, -10, 10, 10), ringOwner: [0, 1, 2, 3].map(() => ({ skelId: 'l' })), iA: [inner], iaFull: [inner], iaStamp: [[stamp0, 0, 0, 0]],
      runs: [{ skelId: 'l', poly: [...inner, inner[0]] }, { skelId: '__boundary__', noLine: 'rim', poly: [inner[0], inner[1]] }] }],
    ink: [], raw: () => 0, line: { step: 1, heightAt: (id) => (id === 'l' ? 1 : null) }, stencil: disc,
    limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 },
    bands: { curb: [], lawn: [], walk: [sq(-1, 2.5, 1, 3.5)] } })   // a walk island 1.5 m in from the top edge, lot between
  const refuses = (f) => { try { f(); return false } catch (e) { return /has no height/.test(e.message) } }
  const clear = sq(-20, -4, 20, 20), over = sq(-20, -20, 20, 20)        // the disc clear of edge 0, and the disc over it
  let D = null; try { D = make({ disc: clear }) } catch { D = null }
  // 3: ② a 100 × 10 m block, its long bottom edge outside a disc that starts 2 m above it; a walk along the top edge, inside
  const full = sq(-50, -5, 50, 5), cut = sq(-50, -3, 50, 5)
  const S = buildDeformer({ town: 'selftest', tiles: [{ ring: sq(-60, -15, 60, 15), ringOwner: [0, 1, 2, 3].map(() => ({ skelId: 'l' })), iA: [cut], iaFull: [full], iaStamp: [[0, 0, 0, 0]],
      runs: [{ skelId: 'l', poly: [...full, full[0]] }] }], ink: [], raw: (x, z) => -0.1 * (5 - z), line: { step: 1, heightAt: () => 0 }, stencil: sq(-70, -3, 70, 70),
    limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 }, bands: { curb: [], lawn: [], walk: [sq(-50, 3, 50, 5)] } })
  const hw = S.heightAt(0, 3.5)
  return [
    ['a rim ring whose longest ② edge lies outside the disc reads its side off ②: the walk takes up its share of the fall', hw != null && hw < 0],
    ['a frame edge wholly outside the disc: the deformer builds, and counts it exempt', !!D && D.stats.frameExempt === 1],
    ['the same frame edge inside the disc REFUSES', refuses(() => make({ disc: over }))],
    ['an unstamped edge outside the disc still REFUSES', refuses(() => make({ disc: clear, stamp0: null }))],
    ['a point in a drawn band that no band reaches is unowned, its height null', !!D && D.unownedIn(0, 3) != null && D.heightAt(0, 3) == null],
    ['a point in the lot beside it is owned (the fixture is live)', !!D && D.unownedIn(3, 4.5) == null && D.heightAt(3, 4.5) != null],
  ]
}
// 4. the bake's record of an unowned vertex: exact, and the full list written (bake-ground.js, read and imported)
const { unownedKey } = await import(pathToFileURL(join(ROOT, 'cartograph/bake-ground.js')).href)
const BAKE = readFileSync(join(ROOT, 'cartograph/bake-ground.js'), 'utf8')
const DELETE = 'if (!deformTally.unowned.size && existsSync(unownedPath)) { rmSync(unownedPath);'
const RECORD = 'deformTally.unowned.set(unownedKey(P[v * 3], P[v * 3 + 2]), { x: P[v * 3], z: P[v * 3 + 2], tile: ti })'
const keyRows = (key, src) => { const x = 170.53456789012345, z = 1254.9123456789012, k = key(x, z), [kx, kz] = k.split(',').map(Number)
  return [['an unowned vertex is keyed at its exact position (the key parses back to the very floats)', kx === x && kz === z, k],
    ['two vertices 1 mm apart are two records', key(x, z) !== key(x + 0.001, z), `${key(x, z)} vs ${key(x + 0.001, z)}`],
    ['terrainPart records through the exact key, with x, z and tile', src.split(RECORD).length === 2, 'bake-ground.js terrainPart'],
    ['the refusal writes every unowned vertex beside the slab', /join\(outDir, 'ground\.unowned\.json'\)/.test(src) && /points: pts/.test(src), 'bake-ground.js'],
    ['a bake that owns every ped vertex removes a stale list (the uploader carries every file of a look dir)', src.includes(DELETE), 'bake-ground.js']] }
const self = process.argv.includes('--selftest')
const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
const EXEMPT = "&& outsideDisc(ring[i], ring[(i + 1) % n])) exempt[i] = 1", UNOWNED = "if (inBand(x, z)) { stats.unowned++;", SIDE = "pipRings(mx + m0 * 0.01, mz + m1 * 0.01, t.full)"
// ⭐ ONE mutated copy (checks/tier.mjs reads one temp-dir `mutant`) carrying both mutations behind a switch read at call time
const mutant = () => { const src = readFileSync(HOME, 'utf8')
  for (const a of [EXEMPT, UNOWNED, SIDE]) if (src.split(a).length !== 2) throw new Error(`selftest: groundDeformer.mjs no longer carries \`${a.slice(0, 70)}\` — re-aim the mutation`)
  const f = join(mkdtempSync(join(tmpdir(), 'height-owns-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(EXEMPT, "&& (globalThis.__MUT === 'exempt' || outsideDisc(ring[i], ring[(i + 1) % n]))) exempt[i] = 1")
    .replace(UNOWNED, "if (inBand(x, z) && globalThis.__MUT !== 'fallback') { stats.unowned++;")
    .replace(SIDE, "pipRings(mx + m0 * 0.01, mz + m1 * 0.01, globalThis.__MUT === 'side' ? t.iA : t.full)")
    .replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
const MUTANTS = { exempt: 'the exemption without the disc test (an edge inside the disc exempted)', fallback: 'a nearest-line fallback for an unowned point', side: 'the side read off the disc-cut block (iA)' }
if (self) { let bad = 0; const url = mutant()
  for (const [k, name] of Object.entries(MUTANTS)) { globalThis.__MUT = k; const R = await rows(url), red = R.some(r => !r[1])
    if (!red) bad++; console.log(`  ${red ? '✅' : '⛔'} mutant · ${name}: ${red ? 'RED, as it must be' : 'still GREEN — the check cannot see it'}${red ? ` (${R.filter(r => !r[1]).map(r => r[0]).join(' · ')})` : ''}`) }
  const rounded = (x, z) => `${x.toFixed(2)},${z.toFixed(2)}`, roundedSrc = BAKE.replace(RECORD, 'deformTally.unowned.set(`${P[v * 3].toFixed(2)},${P[v * 3 + 2].toFixed(2)}`, ti)')
  const K = keyRows(rounded, roundedSrc), red = roundedSrc !== BAKE && K.some(r => !r[1]); if (!red) bad++
  console.log(`  ${red ? '✅' : '⛔'} mutant · the 1 cm rounding restored to the unowned key: ${red ? 'RED, as it must be' : 'still GREEN — the check cannot see it'}${red ? ` (${K.filter(r => !r[1]).map(r => r[0]).join(' · ')})` : ''}`)
  const kept = keyRows(unownedKey, BAKE.replace(DELETE, 'if (false) {')), redKept = kept.some(r => !r[1]); if (!redKept) bad++
  console.log(`  ${redKept ? '✅' : '⛔'} mutant · a stale unowned list left beside a good slab: ${redKept ? 'RED, as it must be' : 'still GREEN — the check cannot see it'}`)
  process.exit(bad ? 1 : 0) }
const R = [...await rows(pathToFileURL(HOME).href), ...keyRows(unownedKey, BAKE)]
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the height code owns what is drawn' : '⛔ the deformer gives a height it does not own, or owns one the drawing lacks'); process.exit(ok ? 0 : 1)
