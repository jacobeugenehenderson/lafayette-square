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
//   5. A VERTEX ON A STAMP LINE WHOSE RAY RUNS ALONG IT is read on both sides at ±LATTICE and held by the band on its other
//      side (Zob placed 81 of HPDM's 269 there; Boz ruled 2026-10-21); the mirror, already held, is untouched.
//   4. THE BAKE RECORDS AN UNOWNED VERTEX EXACTLY (groundDeformer.mjs#unownedKey, imported; terrainPart read): its key parses back
//      to the very floats, two vertices 1 mm apart are two records, terrainPart records through the key, and the refusal
//      writes the full list beside the slab. Keyed at 1 cm, HPDM's 1,234 could not be re-resolved (Zob, 2026-10-21).
// ⭐ MUTATION TEST: `--selftest` plants each wrong deformer back (written to the OS temp dir) and expects its row RED:
//   the exemption without the disc test (an edge inside the disc exempted) · a nearest-line fallback for an unowned point ·
//   the side read off the disc-cut block · a ray along a stamp line read on one side only · the 1 cm rounding restored to the unowned key (in the key and in terrainPart) ·
//   a stale unowned list left beside a good slab.
//   node checks/claims-the-height-code-owns-what-is-drawn.mjs [--selftest]
import { ROOT } from './_scenes.mjs'
import { unownedKey } from '../cartograph/groundDeformer.mjs'
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
  // 5: a vertex ON a stamp line (lot one side, walk the other) whose station is the line's foot on ②: its ray runs along the
  //    line, and the 10 µm sidestep reads the lot's side. Read on both sides at ±LATTICE, the walk holds it. The mirror (the
  //    sidestep already in the walk) is held by the first ray, and the second read never runs.
  const ib = [[-5, -5], [0, -5], [5, -5], [5, 5], [-5, 5]]
  const along = (walk) => buildDeformer({ town: 'selftest', tiles: [{ ring: sq(-10, -10, 10, 10), ringOwner: [0, 1, 2, 3].map(() => ({ skelId: 'l' })), iA: [ib], iaFull: [ib], iaStamp: [[0, 0, 0, 0, 0]],
      runs: [{ skelId: 'l', poly: [...ib, ib[0]] }] }], ink: [], raw: () => 0, line: { step: 1, heightAt: () => 1 },
    limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 }, bands: { curb: [], lawn: [], walk: [walk] } })
  const E = along(sq(0, -5, 5, -3)), W = along(sq(-5, -5, 0, -3))
  // 6: a SEAM: two owners (runs a and b, heights 1 and 2) whose rays each run along the same partition line from opposite
  //    ends, each sidestep in the lot; read on both sides, each holds its own walk. The point is both streets': their mean,
  //    and it is LISTED (owners, spread), never the first owner's height
  const sb = [[-5, -5], [0, -5], [5, -5], [5, -3], [-5, -3]]
  const SEAM = buildDeformer({ town: 'selftest', tiles: [{ ring: sq(-10, -10, 10, 10), ringOwner: [0, 1, 2, 3].map(() => ({ skelId: 'a' })), iA: [sb], iaFull: [sb], iaStamp: [[0, 0, 0, 1, 0]],
      runs: [{ skelId: 'a', poly: [[-5, -5], [5, -5]] }, { skelId: 'b', poly: [[5, -3], [-5, -3]] }] }], ink: [], raw: () => 0, line: { step: 1, heightAt: (id) => (id === 'a' ? 1 : 2) },
    limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 }, bands: { curb: [], lawn: [], walk: [sq(0, -5, 5, -3.9), sq(-5, -4.1, 0, -3)] } })
  const sh = SEAM.heightAt(0, -4), sl = SEAM.splits()
  // 7: THE RAY STARTS ON A BOUNDARY (HPDM (477.138, −466.781), Zob's geometry): the station is ON a curb's END edge, which
  //    leaves ②, and the ray runs along it; past the curb a sub-mm lot sliver lies between the walk and the ray's 10 µm
  //    side, and the point sits on the lawn's edge, whose line passes 1.2 mm off the station (so the point-on-edge test
  //    misses). Read a full step to the side, the walk and lawn hold it.
  const ST = buildDeformer({ town: 'selftest', tiles: [{ ring: sq(-10, -10, 10, 10), ringOwner: [0, 1, 2, 3].map(() => ({ skelId: 'l' })), iA: [inner], iaFull: [inner], iaStamp: [[0, 0, 0, 0]],
      runs: [{ skelId: 'l', poly: [...inner, inner[0]] }] }], ink: [], raw: () => 0, line: { step: 1, heightAt: () => 1 },
    limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 },
    bands: { curb: [sq(-5, -5, 0, -4.85)], walk: [sq(-5, -4.85, -0.0006, -4)], lawn: [[[-5, -4], [-0.0006, -4], [0.0006, -2], [-5, -2]]] } })
  return [
    ['a vertex on a stamp line whose ray runs along it is held by the band on its other side, never unowned', E.unownedIn(0, -4) == null && E.heightAt(0, -4) != null && E.ownerAt(0, -4) != null && E.stats.byBothSides === 1],
    ['the mirror, its sidestep already in the band, is held by the first ray (the both-sides read never runs)', W.unownedIn(0, -4) == null && W.heightAt(0, -4) != null && W.stats.byBothSides === 0],
    ['a seam point two owners both hold takes their mean, never the first owner\'s height', sh === 1.5 && SEAM.ownerAt(0, -4) === '0|0|r0+0|0|r1' && SEAM.stats.bothSidesSplit === 1],
    ['and it is listed: its exact position, both owners, and their spread', sl.length === 1 && sl[0].x === 0 && sl[0].z === -4 && sl[0].owners.length === 2 && sl[0].spread === 1],
    ['a ray that starts on a curb\'s end edge and runs along it is held by the band a full step to its side, never unowned', ST.unownedIn(-0.00002, -3) == null && ST.heightAt(-0.00002, -3) != null && ST.stats.byBothSides === 1],
    ['a rim ring whose longest ② edge lies outside the disc reads its side off ②: the walk takes up its share of the fall', hw != null && hw < 0],
    ['a frame edge wholly outside the disc: the deformer builds, and counts it exempt', !!D && D.stats.frameExempt === 1],
    ['the same frame edge inside the disc REFUSES', refuses(() => make({ disc: over }))],
    ['an unstamped edge outside the disc still REFUSES', refuses(() => make({ disc: clear, stamp0: null }))],
    ['a point in a drawn band that no band reaches is unowned, its height null', !!D && D.unownedIn(0, 3) != null && D.heightAt(0, 3) == null],
    ['a point in the lot beside it is owned (the fixture is live)', !!D && D.unownedIn(3, 4.5) == null && D.heightAt(3, 4.5) != null],
  ]
}
// 4. the bake's record of an unowned vertex: exact, and the full list written (bake-ground.js, read and imported)
const BAKE = readFileSync(join(ROOT, 'cartograph/bake-ground.js'), 'utf8')
const DELETE = 'if (!deformTally.unowned.size && existsSync(unownedPath)) { ' + 'rm' + 'Sync(unownedPath);'   // split: the source is read, never run
const RECORD = 'deformTally.unowned.set(unownedKey(P[v * 3], P[v * 3 + 2]), { x: P[v * 3], z: P[v * 3 + 2], tile: ti })'
const keyRows = (key, src) => { const x = 170.53456789012345, z = 1254.9123456789012, k = key(x, z), [kx, kz] = k.split(',').map(Number)
  return [['an unowned vertex is keyed at its exact position (the key parses back to the very floats)', kx === x && kz === z, k],
    ['two vertices 1 mm apart are two records', key(x, z) !== key(x + 0.001, z), `${key(x, z)} vs ${key(x + 0.001, z)}`],
    ['terrainPart records through the exact key, with x, z and tile', src.split(RECORD).length === 2, 'bake-ground.js terrainPart'],
    ['ground.json lists every seam split (the deformer\'s splits, with the both-sides count)', /bothSides: deform\.stats\.byBothSides, splits: deform\.splits\(\)/.test(src), 'bake-ground.js'],
    ['the refusal writes every unowned vertex beside the slab', /join\(outDir, 'ground\.unowned\.json'\)/.test(src) && /points: pts/.test(src), 'bake-ground.js'],
    ['a bake that owns every ped vertex removes a stale list (the uploader carries every file of a look dir)', src.includes(DELETE), 'bake-ground.js']] }
const self = process.argv.includes('--selftest')
const HOME = join(ROOT, 'cartograph/groundDeformer.mjs')
const EXEMPT = "&& outsideDisc(ring[i], ring[(i + 1) % n])) exempt[i] = 1", UNOWNED = "if (inBand(x, z)) {\n      const H = []", SIDE = "pipRings(mx + m0 * 0.01, mz + m1 * 0.01, t.full)", BOTH = 'const vs = [LATTICE + off, -LATTICE - off]', FIRST = 'if (vs.length) H.push(', STATION = 'if (dq <= LATTICE && !(onIa(s.a) && onIa(s.b)))'
// ⭐ ONE mutated copy (checks/tier.mjs reads one temp-dir `mutant`) carrying both mutations behind a switch read at call time
const mutant = () => { const src = readFileSync(HOME, 'utf8')
  for (const a of [EXEMPT, UNOWNED, SIDE, BOTH, FIRST, STATION]) if (src.split(a).length !== 2) throw new Error(`selftest: groundDeformer.mjs no longer carries \`${a.slice(0, 70)}\` — re-aim the mutation`)
  const f = join(mkdtempSync(join(tmpdir(), 'height-owns-')), 'groundDeformer.mjs')
  writeFileSync(f, src.replace(EXEMPT, "&& (globalThis.__MUT === 'exempt' || outsideDisc(ring[i], ring[(i + 1) % n]))) exempt[i] = 1")
    .replace(UNOWNED, "if (inBand(x, z) && globalThis.__MUT !== 'fallback') {\n      const H = []")
    .replace(BOTH, "const vs = (globalThis.__MUT === 'oneside' ? [] : [LATTICE + off, -LATTICE - off])")
    .replace(FIRST, "if (vs.length && !(globalThis.__MUT === 'first' && H.length)) H.push(")
    .replace(STATION, "if (globalThis.__MUT !== 'nostation' && dq <= LATTICE && !(onIa(s.a) && onIa(s.b)))")
    .replace(SIDE, "pipRings(mx + m0 * 0.01, mz + m1 * 0.01, globalThis.__MUT === 'side' ? t.iA : t.full)")
    .replace(/from '\.\.\/src\/lib\/lattice\.js'/, `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`))
  return pathToFileURL(f).href }
const MUTANTS = { exempt: 'the exemption without the disc test (an edge inside the disc exempted)', fallback: 'a nearest-line fallback for an unowned point', side: 'the side read off the disc-cut block (iA)', oneside: 'a ray along a stamp line read on one side only (today\'s 10 µm sidestep)', first: 'the first owner that holds a seam wins (the order decides)', nostation: 'no both-sides read for a ray that starts on a band edge leaving ②' }
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
