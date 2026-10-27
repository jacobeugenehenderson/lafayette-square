#!/usr/bin/env node
// CLAIM — ALONG THE WATER, ②'S KERB IS ①'S COAST LINE ITSELF: ONE LINE, READ BY BOTH SIDES, NEVER A SECOND NEAR-COPY.
//
// ①'s coast is the high-water mark (Jacob, 2026-10-25). Nothing offsets a curb from it (RIBBONS §1): a water edge has depth 0,
// and its corners are SHARP, street × coast included (Boz, 2026-10-26, Zob's read). The regression this catches: ②'s ease gave
// coast vertices the street class-seed radius (`rSrc` → `protoRAt` had H-3's highway exclusion and no water case), so the
// coast came back as fillet arcs, a second construction of ①'s line up to 0.39 units off it and crossing it (Huron tile 24,
// 2026-10-26). The asphalt (tile − iA − shore cells) kept the strip between the two lines, the land use read ②'s copy, the
// shore read ①'s, and the stack's noding reconciled them afterwards (claims-no-edge-is-drawn-twice: +3.9 km on Huron).
// Read off the producer's own output (`buildTileGround`, the town's authoring loaded), per coast town:
//   (A) every ② kerb vertex (`iaFull`) whose two edges are both stamped to the water (`iaStamp` → `runs[].skelId` ===
//       WATER_EDGE_SKEL) IS a ① vertex (the frozen `protopolygon.blocks`), on the lattice, exactly;
//   (B) every ② kerb vertex with ONE water edge (where a street meets the coast) lies on a ① water edge, within the lattice's
//       one rounding (latticeNode#NODE_BOUND, read);
//   (C) every ① vertex whose two edges are both the water's, inside a tile's painted face, appears in ②.
//   MUTANT (always run): the producer copied with the coast clause of `rSrc` removed (the anchor must occur once) must go RED
//   on some town; a town where it stays GREEN has nothing on its coast to fillet and is said so.
//   node checks/claims-the-kerb-along-the-water-is-the-coast-line.mjs --slot=<who granted it> [<town> …]
// ⚠️ HEAVY: two producer builds per coast town (live and mutant). Not in npm test; runs in a granted slot and says who granted it.
// @args --slot=<granted>
// Exit 1 on any RED, a mutant that stays green everywhere, or no coast town · 2 with no --slot, or an anchor not found once.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { WATER_EDGE_SKEL } from '../src/lib/tileGround.js'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { NODE_BOUND } from '../src/lib/latticeNode.js'
import { ROOT } from './_scenes.mjs'

const slot = process.argv.find(a => a.startsWith('--slot='))?.slice('--slot='.length)
if (!slot) { console.log('⛔ NOT RUN — heavy: pass --slot=<who granted it> (two producer builds per coast town; never in npm test)'); process.exit(2) }
console.log(`(heavy run, slot granted by ${slot})`)
// the mutant: ONE modified tileGround.js in its own temp dir, the coast clause removed, imports pointed at the live src/lib
const CLAUSE = '(isWaterLab(labs[i]) || isWaterLab(labs[(i - 1 + ring.length) % ring.length]))\n          ? (protoRZero.water++, 0)\n          : '
const tgSrc = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
if (tgSrc.split(CLAUSE).length !== 2) { console.log(`⛔ NOT CHECKED — the coast clause of rSrc occurs ${tgSrc.split(CLAUSE).length - 1} time(s) in tileGround.js, not once — re-aim the mutant's anchor`); process.exit(2) }
const LIB = join(ROOT, 'src/lib')
const mutDir = mkdtempSync(join(tmpdir(), 'coast-kerb-'))
process.on('exit', () => rmSync(mutDir, { recursive: true, force: true }))
writeFileSync(join(mutDir, 'tileGround.js'), tgSrc.replace(CLAUSE, '')
  .replace(/from \x27(\.{1,2}\/[^\x27]+)\x27/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`)
  .replace(/from \x27clipper-lib\x27/g, `from "${import.meta.resolve('clipper-lib')}"`))
const mutant = await import(pathToFileURL(join(mutDir, 'tileGround.js')).href)

const K = (p) => [Math.round(p[0] * CLIP_SCALE), Math.round(p[1] * CLIP_SCALE)]
const key = (k) => k[0] + ',' + k[1]
const windXZ = (p, r) => { let w = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
  if (zj <= p[1]) { if (zi > p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) > 0) w++ } else if (zi <= p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) < 0) w-- } return w }

// ①'s coast: its vertices with both edges the water's, and its water edges (lattice units)
function coastOf(fp) {
  const isW = (l) => l != null && fp.owners[l]?.skelId === WATER_EDGE_SKEL
  const both = new Map(), edges = []
  const rings = (fp.blocks || []).map((r, k) => [r, fp.blockLabels?.[k] || []]).concat((fp.blockHoles || []).flatMap((hs, k) => hs.map((h, j) => [h, fp.blockHoleLabels?.[k]?.[j] || []])))
  for (const [r, L] of rings) r.forEach((p, i) => { const n = r.length
    if (isW(L[i])) edges.push([K(p), K(r[(i + 1) % n])])
    if (isW(L[i]) && isW(L[(i - 1 + n) % n])) both.set(key(K(p)), p) })
  return { both, edges }
}
function judge(tiles, C) {
  const vSet = new Set([...C.both.keys()]), all = new Set()
  const onEdge = (k) => C.edges.some(([a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (!L2) return false
    const t = ((k[0] - a[0]) * dx + (k[1] - a[1]) * dy) / L2; if (t < 0 || t > 1) return false
    const cr = (k[0] - a[0]) * dy - (k[1] - a[1]) * dx; return cr * cr <= NODE_BOUND * NODE_BOUND * L2 })
  let A = 0, Abad = [], B = 0, Bbad = []
  for (const t of tiles) (t.iaFull || []).forEach((ring, si) => { const st = t.iaStamp?.[si]; if (!st) return
    const n = ring.length, w = (e) => t.runs?.[st[e]]?.skelId === WATER_EDGE_SKEL
    ring.forEach((p, i) => { const k = K(p); all.add(key(k))
      const wi = w(i), wp = w((i - 1 + n) % n)
      if (wi && wp) { A++; if (!vSet.has(key(k))) Abad.push(p) }
      else if (wi || wp) { B++; if (!onEdge(k)) Bbad.push(p) } }) })
  // (C) ① coast vertices inside a tile's painted face, missing from ②
  let Cn = 0; const Cbad = []
  for (const [kk, p] of C.both) { if (!tiles.some(t => t.ring && windXZ(p, t.ring) !== 0)) continue; Cn++; if (!all.has(kk)) Cbad.push(p) }
  return { A, Abad, B, Bbad, Cn, Cbad }
}
const say = (J, label) => {
  const at = (ps) => ps.slice(0, 4).map(p => `(${p.map(v => v.toFixed(3)).join(', ')})`).join(' · ')
  console.log(`  ${J.Abad.length ? '⛔' : '✅'} (A)${label} ${J.A} ② kerb vertex(es) between two water edges · ${J.Abad.length} not a ① vertex${J.Abad.length ? ` (e.g. ${at(J.Abad)})` : ''}`)
  console.log(`  ${J.Bbad.length ? '⛔' : '✅'} (B)${label} ${J.B} ② kerb vertex(es) where a street meets the water · ${J.Bbad.length} off ①'s water edge past one rounding${J.Bbad.length ? ` (e.g. ${at(J.Bbad)})` : ''}`)
  console.log(`  ${J.Cbad.length ? '⛔' : '✅'} (C)${label} ${J.Cn} ① coast vertex(es) in a tile · ${J.Cbad.length} missing from ②${J.Cbad.length ? ` (e.g. ${at(J.Cbad)})` : ''}`)
  return J.Abad.length + J.Bbad.length + J.Cbad.length }

let red = 0, towns = 0, mutRed = 0
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
for (const scene of feedScenes(process.argv.slice(2).filter(a => !a.startsWith('--')))) {
  const f = feed(scene); if (!f) continue
  const fp = f.ribbons.protopolygon, C = fp && coastOf(fp)
  if (!C?.edges.length) continue                     // no coast in ①: nothing to judge here
  console.log(`\n── ${scene}: ① carries ${C.edges.length} water edge(s), ${C.both.size} coast vertex(es)`)
  towns++
  let R; try { R = quiet(() => buildProto(f)) } catch (e) { console.log(`  ⛔ the producer refused — nothing checked: ${String(e.message).split('\n')[0].slice(0, 200)}`); red++; continue }
  if (say(judge(R.protoShapeTiles, C), '')) red++
  let M; try { M = quiet(() => buildProto(f, { tg: mutant })) } catch (e) { console.log(`  ✅ mutant (the coast clause removed): the producer refused (${String(e.message).split('\n')[0].slice(0, 120)}) — counted RED`); mutRed++; continue }
  const J = judge(M.protoShapeTiles, C), bad = J.Abad.length + J.Bbad.length + J.Cbad.length
  if (bad) mutRed++
  console.log(`  ${bad ? '✅' : '⚪'} mutant (the coast clause of rSrc removed): ${bad ? `RED as it must be — (A) ${J.Abad.length} · (B) ${J.Bbad.length} · (C) ${J.Cbad.length}` : 'GREEN here — no coast corner on this town takes a fillet without the clause'}`)
}
if (!towns) { console.log('\n⛔ no town with a coast in ① — nothing was checked'); red++ }
else if (!mutRed) { console.log('\n⛔ the mutant stayed GREEN on every town — the check cannot see a filleted coast'); red++ }
console.log(red ? `\n⛔ ${red} RED` : '\n✅ along the water, ②\'s kerb is ①\'s coast line itself')
process.exit(red ? 1 : 0)
