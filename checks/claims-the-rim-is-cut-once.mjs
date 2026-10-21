// claims-the-rim-is-cut-once.mjs — WHERE THE DRAWING MEETS THE DISC, EACH LINE IS CUT ONCE AND EVERY CROSSING IS SHARED
// (BRIEF-the-rim-is-cut-once, Boz 2026-10-21).
//
//   1. (A) THE BANDS MEET THE RIM AT ONE CROSSING EACH. HPDM tile 242 (fixture): painted, the curb, lawn and walk vertices
//      that lie on the block's rim are either the same point or at least two lattice steps apart. Cut at the END, a difference
//      taken past the rim minted a vertex on the lawn's copy of the line it shares with the curb, and the cut turned its
//      tilt into a 1.41 mm pair (B2: 261 unowned points).
//   2. (B) A RAY FROM BEYOND THE RIM READS THE DRAWING'S OWN RIM. HPDM tile 89 (fixture): the deformer, on that tile's own paint,
//      owns the point (−1250.07, 605.28), whose station lies past the rim. Read off the stencil's exact chord, the rounded
//      crossings left a wedge the ray (65° off the normal) read as ~1.1 mm of lot (B1: 341 points).
//   3. (C) THE TILE RING CARRIES THE BLOCK'S RIM CROSSINGS (synthetic): a ring and its block, cut by an oblique disc chord
//      separately, then `shareRimCrossings`: every block vertex on a rim edge of the ring is a ring vertex. Unshared, `ring − iA`
//      left LS tile 133 a 12.7 m, ≤ 0.166 mm needle.
// ⭐ MUTATION TEST: `--selftest` plants each wrong producer back (written to the OS temp dir) and expects its row RED: the bands
//   cut at the end · beyond read off the stencil · the crossings not shared.
//   node checks/claims-the-rim-is-cut-once.mjs [--selftest]
import { ROOT } from './_scenes.mjs'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { intersectRings } from '../src/lib/buildBlockGeometryV2.js'

const F = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures/rim-cut-once-hpdm.json'), 'utf8'))
const U = 2 / CLIP_SCALE   // two lattice steps: the boolean's own containment
const flat = (v) => Array.isArray(v) ? v : Object.values(v || {}).flat()
const segHolds = (q, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; if (!L2) return false
  const u = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2; return u > -1e-9 && u < 1 + 1e-9 && Math.abs((q[0] - a[0]) * dz - (q[1] - a[1]) * dx) / Math.sqrt(L2) <= U }

// one loader per module, each with its own one parameter, so checks/tier.mjs can follow every import to its source
const loadTG = async (tgUrl) => import(tgUrl)
const loadDEF = async (defUrl) => import(defUrl)
const rows = async (TG, DM) => {
  const { buildDeformer } = DM
  const paint = (x) => { const w = console.warn; console.warn = () => {}
    try { return TG.sectionPassProtoTile(x.tile, F.cw, { outer: 'LU', inner: 'SW' }, x.blockCustoms, x.cornerOverrides) } finally { console.warn = w } }
  // 1 — the rim vertices of each class, and the near-miss pairs between classes
  const W = F.wedge, o = paint(W), rim = W.tile.ring.map((a, k) => W.tile.ringOwner[k]?.kind === 'rim' ? [a, W.tile.ring[(k + 1) % W.tile.ring.length]] : null).filter(Boolean)
  const onRim = (v) => rim.some(([a, b]) => segHolds(v, a, b))
  const cls = { curb: flat(o.curb), lawn: flat(o.tlByLu), walk: flat(o.Wacc) }, pts = {}
  for (const [k, rs] of Object.entries(cls)) pts[k] = rs.flat().filter(onRim)
  let near = 0, pairsSeen = 0; const ks = Object.keys(pts)
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) for (const p of pts[ks[i]]) for (const q of pts[ks[j]]) {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d <= U) { pairsSeen++; if (d > 0) near++ } }
  // 2 — the deformer on tile 55's own paint, its point past-the-rim station
  const S = F.slice, s = paint(S), tiles = []; tiles[S.ti] = S.tile; for (let i = 0; i < S.ti; i++) tiles[i] ||= {}
  const D = buildDeformer({ town: F.scene, tiles, ink: [], raw: () => 0, line: { step: 1, heightAt: () => 0 }, stencil: F.stencil, limits: F.limits, legs: [{ tile: S.ti, perp: S.legs }],
    bands: { curb: [...flat(s.curb), ...flat(s.curbCut)], lawn: flat(s.tlByLu), walk: flat(s.Wacc) } })
  const [px, pz] = S.point, inPaint = D._inClass('walk', px, pz) || D._inClass('lawn', px, pz) || D._inClass('curb', px, pz)
  // 3 — synthetic: a 10 × 10 ring, its block inset 1 m, the disc's chord crossing both obliquely
  const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], ring0 = sq(0, 0, 10, 10), block0 = sq(1, 1, 9, 9)
  const stamp = [[-5, -5], [15, -5], [15, 7.3], [-5, 8.9]]                     // the chord from (15, 7.3) to (−5, 8.9)
  const ringC = intersectRings([ring0], [stamp])[0], blockC = intersectRings([block0], [stamp])
  const chordOwner = (a, b) => segHolds(a, stamp[2], stamp[3]) && segHolds(b, stamp[2], stamp[3]) ? { kind: 'rim' } : { skelId: 'l', side: 'left', segOrd: 0 }
  const owners = ringC.map((a, k) => chordOwner(a, ringC[(k + 1) % ringC.length]))
  const sh = TG.shareRimCrossings(ringC, owners, blockC, [block0], stamp), keys = new Set(sh.ring.map(v => v.join()))
  const onChord = blockC.flat().filter(v => segHolds(v, stamp[2], stamp[3]))
  return [
    [`(A) tile 242 is live: ${pairsSeen} cross-class rim vertex pair(s) within two lattice steps`, pairsSeen > 0],
    [`(A) every one of them is the same point (near misses: ${near})`, near === 0],
    [`(B) the fixture point lies in tile 89's paint`, inPaint],
    [`(B) a ray from past the rim owns it (the drawing's own rim)`, D.unownedIn(px, pz) == null],
    [`(C) the synthetic block meets the chord at ${onChord.length} point(s)`, onChord.length >= 2],
    [`(C) every one of them is a vertex of the tile ring`, onChord.every(v => keys.has(v.join()))],
  ]
}
const self = process.argv.includes('--selftest')
const TGF = join(ROOT, 'src/lib/tileGround.js')
const DEF = join(ROOT, 'cartograph/groundDeformer.mjs')
const PKG = ['clipper', 'lib'].join('-')   // the painter's one bare import, re-pointed at the repo's own copy
const LIB = (m) => pathToFileURL(join(ROOT, 'src/lib', m)).href, SRC = (m) => pathToFileURL(join(ROOT, 'src', m)).href, CLIP = pathToFileURL(join(ROOT, 'node_modules/clipper-lib/clipper.js')).href
const must = (src, a) => { if (src.split(a).length !== 2) throw new Error(`selftest: the source no longer carries \`${a.slice(0, 80)}\` — re-aim the mutation`) }
const g = "globalThis.__RIM_MUT"
const T1 = 'const curbB = inBlock(curbOuter), pedB = inBlock(pedOuter), luB = inBlock(luIn0)', T2 = 'W = bandCut(LV_wf.rings, inBlock(LV_wf.rings), LV_wt.rings, inBlock(LV_wt.rings))'
const T3 = 'Wacc:   cutByStamp(st, Wall, sp),', T4 = 'tlByLu: rekeyByPiece(st, { [key]: less(Wp.length ? differenceRings(env, Wp) : env) }, sp),', T5 = '  if (!minted.length) return { ring, owners, added: 0 }'
const T6 = 'curb:   cutByStamp(st, less(bandCut(curbOuter, curbB, pedOuter, pedB)), sp),', T7 = 'luByLu: rekeyByPiece(st, { [key]: less(luIn) }, sp),'
const D1 = "let beyond = !!tr?.rim && !pipRings(px + ux * eps, pz + uz * eps, [tr.ring])", D2 = "  const recOf = new Map(T.map(r => [r.ti, r]))"
// ⭐ one mutated copy of each module (checks/tier.mjs reads one temp-dir copy per writer), every mutation behind a switch read at call time
// the replacements, built here so the writers below are plain chains (checks/tier.mjs reads each writer's body)
const R1 = `const __end = ${g} === 'end', curbB = __end ? curbOuter : inBlock(curbOuter), pedB = __end ? pedOuter : inBlock(pedOuter), luB = __end ? luIn0 : inBlock(luIn0)`
const R2 = `W = ${g} === 'end' ? band(LV_wf.rings, LV_wt.rings) : bandCut(LV_wf.rings, inBlock(LV_wf.rings), LV_wt.rings, inBlock(LV_wt.rings))`
const R3 = `Wacc:   cutByStamp(st, ${g} === 'end' ? inBlock(Wall) : Wall, sp),`
const R4 = `tlByLu: rekeyByPiece(st, { [key]: (${g} === 'end' ? inBlock : (x) => x)(less(Wp.length ? differenceRings(env, Wp) : env)) }, sp),`
const R7 = `luByLu: rekeyByPiece(st, { [key]: (${g} === 'end' ? inBlock : (x) => x)(less(luIn)) }, sp),`
const R6 = `curb:   cutByStamp(st, (${g} === 'end' ? inBlock : (x) => x)(less(bandCut(curbOuter, curbB, pedOuter, pedB))), sp),`
const R5 = `  if (!minted.length || ${g} === 'unshared') return { ring, owners, added: 0 }`
const E1 = `let beyond = ${g} === 'stencil' ? (!!disc && !pipRings(px + ux * eps, pz + uz * eps, [disc])) : (!!tr?.rim && !pipRings(px + ux * eps, pz + uz * eps, [tr.ring]))`
const E2 = `  if (${g} === 'stencil') { segGrid.forEach((v, k) => segGrid.set(k, v.filter(s => s.cls !== 'beyond'))); if (disc) for (let i = 0; i < disc.length; i++) addSeg('beyond', disc[i], disc[(i + 1) % disc.length]) }\n${D2}`
const RE_PKG = new RegExp(`from '${PKG}'`, 'g'), TO_PKG = `from '${CLIP}'`
const RE_LIB = /from '\.\/([^']+)'/g, RE_SRC = /from '\.\.\/([^']+)'/g, RE_DLIB = /from '\.\.\/src\/lib\/([^']+)'/g
const toLib = (_, m) => `from '${LIB(m)}'`, toSrc = (_, m) => `from '${SRC(m)}'`
const mutantTG = () => { const tgSrc = readFileSync(TGF, 'utf8')
  const f = join(mkdtempSync(join(tmpdir(), 'rim-once-tg-')), 'tileGround.js')
  for (const a of [T1, T2, T3, T4, T5, T6, T7]) must(tgSrc, a)
  writeFileSync(f, tgSrc.replace(T1, R1).replace(T2, R2).replace(T3, R3).replace(T4, R4).replace(T7, R7).replace(T6, R6).replace(T5, R5).replace(RE_PKG, TO_PKG).replace(RE_LIB, toLib).replace(RE_SRC, toSrc))
  return pathToFileURL(f).href }
const mutantDEF = () => { const dfSrc = readFileSync(DEF, 'utf8')
  const g2 = join(mkdtempSync(join(tmpdir(), 'rim-once-def-')), 'groundDeformer.mjs')
  for (const a of [D1, D2]) must(dfSrc, a)
  writeFileSync(g2, dfSrc.replace(D1, E1).replace(D2, E2).replace(RE_DLIB, toLib))
  return pathToFileURL(g2).href }
if (self) { const tgCopy = mutantTG()
  const dfCopy = mutantDEF()
  let bad = 0
  for (const [k, name, row] of [['end', 'the bands cut at the end, past the rim', 1], ['stencil', "beyond read off the stencil's chord", 3], ['unshared', 'the block\'s rim crossings not shared with the ring', 5]]) {
    globalThis.__RIM_MUT = k; const R = await rows(await loadTG(tgCopy), await loadDEF(dfCopy)), red = !R[row][1]
    if (!red) bad++; console.log(`  ${red ? '✅' : '⛔'} mutant · ${name}: ${red ? 'RED, as it must be' : 'still GREEN — the check cannot see it'} (${R[row][0]})`) }
  globalThis.__RIM_MUT = null; const R0 = await rows(await loadTG(tgCopy), await loadDEF(dfCopy)); if (!R0.every(r => r[1])) { bad++; console.log('  ⛔ the mutated copies, switched off, are not GREEN — the mutation changed more than its switch') }
  process.exit(bad ? 1 : 0) }
const R = await rows(await loadTG(pathToFileURL(TGF).href), await loadDEF(pathToFileURL(DEF).href))
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the rim is cut once' : '⛔ the rim is cut more than once: a crossing is not shared'); process.exit(ok ? 0 : 1)
