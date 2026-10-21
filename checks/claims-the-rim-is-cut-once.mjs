// claims-the-rim-is-cut-once.mjs — WHERE THE DRAWING MEETS THE DISC, EACH LINE IS CUT ONCE AND EVERY CROSSING IS SHARED
// (BRIEF-the-rim-is-cut-once, Boz 2026-10-21).
//
//   (A), the paint operands cut to the block before the differences, is RETIRED (Boz, 2026-10-21): (5)'s shared rim crossings
//      close B2's wedge at the rim themselves, and (A) left curb/land-use needles. Its intent (one crossing per line at the rim)
//      lives in rows (E).
//   2. (B) A RAY FROM BEYOND THE RIM READS THE DRAWING'S OWN RIM. HPDM tile 89 (fixture): the deformer, on that tile's own paint,
//      owns the point (−1250.07, 605.28), whose station lies past the rim. Read off the stencil's exact chord, the rounded
//      crossings left a wedge the ray (65° off the normal) read as ~1.1 mm of lot (B1: 341 points).
//   4. A STAMPED SHAPE IS NOT CLIPPED AGAIN. HPDM tiles 242, 234, 10, 5, 35 and 246 (five whose rings round past the stencil)
//      through `sectionOpen` (the finish the bake and Survey run), stamped with the stencil: no painted vertex on the rim that
//      the tiles' own painter did not draw. Clipping the paint to the same disc again re-cut the rim and minted a crossing
//      per class; gated on the ring reaching past the stencil, it still fired on half the rim tiles.
//   5. THE PAINT'S RIM IS THE RING'S RIM. HPDM tile 49 (fixture): every painted vertex on a rim edge is a vertex of the
//      painter's noded ring (its `rim`, live), and the deformer, reading that rim, owns (1113.03, 830.88), where each class's
//      own rounded rim crossing had left an unpainted wedge (7.7 mm along its oblique ray).
//      And on HPDM tile 242, B2's own wedge point is owned the same way (its curb/lawn pair stays 1.41 mm apart: the guard is the
//      consequence).
//   6. (F) THE BAKE CUTS ①'s PAINT ONCE TOO (B1, Mitre 2026-10-21). The same six tiles' finish, handed to the bake's own stencil
//      clip (`clipAllToStencil`, the real one) as the bake hands it (`cutOnce`, every item ①'s painter drew): no rim vertex
//      new to the finish. Clipped again to the stencil's exact chord, the rim re-rounded ~1 mm off the rim ring's own vertices
//      or lost them (HPDM tiles 134, 55: class 3's 53 'beyond' wedges). And bake-ground.js passes `cutOnce` exactly when the
//      tiles were stamped with this stencil (`sameStamp`, the recorded fact), from the items ①'s painter returned.
//   3. (C) THE TILE RING CARRIES THE BLOCK'S RIM CROSSINGS (synthetic): a ring and its block, cut by an oblique disc chord
//      separately, then `shareRimCrossings`: every block vertex on a rim edge of the ring is a ring vertex. Unshared, `ring − iA`
//      left LS tile 133 a 12.7 m, ≤ 0.166 mm needle.
// ⭐ MUTATION TEST: `--selftest` plants each wrong producer back (written to the OS temp dir) and expects its row RED: the bands
//   cut at the end · beyond read off the stencil · the crossings not shared · the bake's clip ignoring `cutOnce` · the bake
//   passing no `cutOnce`.
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
const loadRG = async (rgUrl) => import(rgUrl)
const rows = async (TG, DM, RG, BAKE) => {
  const { buildDeformer } = DM
  const paint = (x) => { const w = console.warn; console.warn = () => {}
    try { return TG.sectionPassProtoTile(x.tile, F.cw, { outer: 'LU', inner: 'SW' }, x.blockCustoms, x.cornerOverrides) } finally { console.warn = w } }
  const W = F.wedge
  // 4 — the tiles through the finish, stamped with the stencil: every rim vertex it paints is one their own painter drew
  const key = (v) => Math.round(v[0] * CLIP_SCALE) + ',' + Math.round(v[1] * CLIP_SCALE), Ts = [W.tile, ...F.outward.map(x => x.tile)]
  const rimOf = (t) => t.ring.map((a, k) => t.ringOwner[k]?.kind === 'rim' ? [a, t.ring[(k + 1) % t.ring.length]] : null).filter(Boolean), rims = Ts.flatMap(rimOf)
  const onAnyRim = (v) => rims.some(([a, b]) => segHolds(v, a, b)), own = new Set()
  let rimEdged = 0, entries = 0, mintedNone = 0
  for (const t of Ts) { const q = paint({ tile: t, blockCustoms: {}, cornerOverrides: {} })
    if (t.ringOwner?.some(o => o?.kind === 'rim')) { rimEdged++; if (q.rim?.ring?.length >= 3) { entries++; if (!q.rim.added) mintedNone++ } }
    for (const r of [...flat(q.curb), ...flat(q.Wacc), ...flat(q.tlByLu), ...flat(q.luByLu), ...flat(q.curbCut)]) for (const v of r) own.add(key(v)) }
  const lw = console.log, ww = console.warn; console.log = () => {}; console.warn = () => {}
  let SO; try { SO = TG.sectionOpen(Ts, F.cw, { outer: 'LU', inner: 'SW' }, F.stencil, {}, null, null, {}, { stampedWith: F.stencil }) } finally { console.log = lw; console.warn = ww }
  const finRim = [...SO.curb, ...SO.curbCut, ...SO.sidewalk, ...Object.values(SO.treelawnByLu || {}).flat(), ...Object.values(SO.luByClass || {}).flat()].flat().filter(onAnyRim), minted = finRim.filter(v => !own.has(key(v))).length
  // 6 — the same finish through the bake's own stencil clip, handed as the bake hands it: ①'s items, cut once
  const finItems = [...SO.curb, ...SO.curbCut, ...SO.sidewalk, ...Object.values(SO.treelawnByLu || {}).flat(), ...Object.values(SO.luByClass || {}).flat()]
  const byM = new Map([['paint', finItems.slice()]]), cc = RG.clipAllToStencil(byM, new Map(), F.stencil, { cutOnce: new Set(finItems) })
  const bakeRim = byM.get('paint').flatMap(it => Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]).flat().filter(onAnyRim), mintedBake = bakeRim.filter(v => !own.has(key(v))).length
  const wired = BAKE.includes("const once = sameStamp(stampedWith, stencil.clipPolygon) ? cutOnce : null") && BAKE.includes("clipAllToStencil(byMaterial, byFaceUse, stencil.clipPolygon, { cutOnce: once })")
    && /const cutOnce = new Set\(\[\.\.\.\[\.\.\.byMaterial\.values\(\)\]\.flat\(\), \.\.\.\[\.\.\.byFaceUse\.values\(\)\]\.flat\(\)\]\)\n  \/\/ Non-street ribbons/.test(BAKE.replace(/\n  \/\/ ⭐ EVERYTHING ABOVE[^\n]*\n  \/\/[^\n]*\n/, '\n'))
  // 2 — the deformer on tile 55's own paint, its point past-the-rim station
  const S = F.slice, s = paint(S), tiles = []; tiles[S.ti] = S.tile; for (let i = 0; i < S.ti; i++) tiles[i] ||= {}
  // the tile's own rim entry, as the bake hands every rim-edged tile's to the deformer (`nodeRimWithPaint`, minted or not)
  const r2 = []; r2[S.ti] = s.rim
  const D = buildDeformer({ town: F.scene, tiles, ink: [], raw: () => 0, line: { step: 1, heightAt: () => 0 }, stencil: F.stencil, limits: F.limits, legs: [{ tile: S.ti, perp: S.legs }], rims: r2,
    bands: { curb: [...flat(s.curb), ...flat(s.curbCut)], lawn: flat(s.tlByLu), walk: flat(s.Wacc) } })
  const [px, pz] = S.point, inPaint = D._inClass('walk', px, pz) || D._inClass('lawn', px, pz) || D._inClass('curb', px, pz)
  // 5 — tile 49 through the finish: its paint's rim vertices all on the noded ring, and the deformer, given that rim, owns the point
  const X = F.wedge49, lw2 = console.log, ww2 = console.warn; console.log = () => {}; console.warn = () => {}
  let S5; try { S5 = TG.sectionOpen([X.tile], F.cw, { outer: 'LU', inner: 'SW' }, F.stencil, {}, null, null, {}, { stampedWith: F.stencil }) } finally { console.log = lw2; console.warn = ww2 }
  const R5 = S5.rimRings?.[0], rk = new Set((R5?.ring || []).map(key)), rim5 = R5 ? R5.ring.map((a, k) => R5.owners[k]?.kind === 'rim' ? [a, R5.ring[(k + 1) % R5.ring.length]] : null).filter(Boolean) : []
  const off5 = [...S5.curb, ...S5.curbCut, ...S5.sidewalk, ...Object.values(S5.treelawnByLu || {}).flat(), ...Object.values(S5.luByClass || {}).flat()].flat().filter(v => rim5.some(([a, b]) => segHolds(v, a, b)) && !rk.has(key(v))).length
  const t5 = []; t5[X.ti] = X.tile; for (let i = 0; i < X.ti; i++) t5[i] ||= {}
  const r5 = []; r5[X.ti] = R5
  const D5 = buildDeformer({ town: F.scene, tiles: t5, ink: [], raw: () => 0, line: { step: 1, heightAt: () => 0 }, stencil: F.stencil, limits: F.limits, legs: [{ tile: X.ti, perp: X.legs }], rims: r5,
    bands: { curb: [...S5.curb, ...S5.curbCut], lawn: Object.values(S5.treelawnByLu || {}).flat(), walk: S5.sidewalk } })
  // 5b — B2 on tile 242 (Zob, 2026-10-21): the geometric pair is NOT closed (the lawn's crossing went into the curb, 1.41 mm
  // still), so its guard is the consequence: the deformer, reading the painter's noded rim, owns B2's wedge point
  let S6; { const l6 = console.log, w6 = console.warn; console.log = () => {}; console.warn = () => {}
    try { S6 = TG.sectionOpen([W.tile], F.cw, { outer: 'LU', inner: 'SW' }, F.stencil, {}, null, null, {}, { stampedWith: F.stencil }) } finally { console.log = l6; console.warn = w6 } }
  const t6 = []; t6[W.ti] = W.tile; for (let i = 0; i < W.ti; i++) t6[i] ||= {}
  const r6 = []; if (S6.rimRings?.[0]) r6[W.ti] = S6.rimRings[0]
  const D6 = buildDeformer({ town: F.scene, tiles: t6, ink: [], raw: () => 0, line: { step: 1, heightAt: () => 0 }, stencil: F.stencil, limits: F.limits, legs: [{ tile: W.ti, perp: W.legs || [] }], rims: r6,
    bands: { curb: [...S6.curb, ...S6.curbCut], lawn: Object.values(S6.treelawnByLu || {}).flat(), walk: S6.sidewalk } })
  const B2 = [-629.61, -1234.17], b2In = D6._inClass('walk', ...B2) || D6._inClass('lawn', ...B2) || D6._inClass('curb', ...B2)
  // 3 — synthetic: a 10 × 10 ring, its block inset 1 m, the disc's chord crossing both obliquely
  const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], ring0 = sq(0, 0, 10, 10), block0 = sq(1, 1, 9, 9)
  const stamp = [[-5, -5], [15, -5], [15, 7.3], [-5, 8.9]]                     // the chord from (15, 7.3) to (−5, 8.9)
  const ringC = intersectRings([ring0], [stamp])[0], blockC = intersectRings([block0], [stamp])
  const chordOwner = (a, b) => segHolds(a, stamp[2], stamp[3]) && segHolds(b, stamp[2], stamp[3]) ? { kind: 'rim' } : { skelId: 'l', side: 'left', segOrd: 0 }
  const owners = ringC.map((a, k) => chordOwner(a, ringC[(k + 1) % ringC.length]))
  const sh = TG.shareRimCrossings(ringC, owners, blockC, [block0], stamp), keys = new Set(sh.ring.map(v => v.join()))
  const onChord = blockC.flat().filter(v => segHolds(v, stamp[2], stamp[3]))
  return [
    [`(D) the six tiles through the finish paint ${finRim.length} rim vertex(es)`, finRim.length > 0],
    [`(D) none of them is new to the finish (minted by a second cut: ${minted})`, minted === 0],
    [`(B) the fixture point lies in tile 89's paint`, inPaint],
    [`(B) a ray from past the rim owns it (the drawing's own rim)`, D.unownedIn(px, pz) == null],
    [`(E) tile 49's paint noded the ring (${rim5.length} rim edge(s))`, !!R5 && rim5.length > 0],
    [`(E) every painted vertex on its rim is a vertex of the noded ring (off it: ${off5})`, off5 === 0],
    [`(E) the deformer, reading the noded rim, owns the wedge point (1113.03, 830.88)`, D5.unownedIn(...X.point) == null],
    [`(E) B2's wedge point (−629.61, −1234.17) lies in tile 242's paint`, b2In],
    [`(E) the deformer, on tile 242's noded paint and rim, owns it`, D6.unownedIn(...B2) == null],
    [`(F) the bake's stencil clip passes the finish's ${cc.kept} item(s) through (clipped ${cc.clipped})`, cc.kept === finItems.length && cc.clipped === 0],
    [`(F) no rim vertex new to the finish after the bake's clip (minted: ${mintedBake})`, mintedBake === 0],
    [`(F) bake-ground.js passes cutOnce (①'s items) exactly when the tiles were stamped with this stencil`, wired],
    [`(C) the synthetic block meets the chord at ${onChord.length} point(s)`, onChord.length >= 2],
    [`(C) every one of them is a vertex of the tile ring`, onChord.every(v => keys.has(v.join()))],
    // (F) the rim's positive name: EVERY rim-edged tile's paint carries a rim entry, minted or not (0c65681c)
    [`(F) every rim-edged tile carries a rim entry (${entries} of ${rimEdged}; ${mintedNone} minted nothing)`, rimEdged > 0 && entries === rimEdged && mintedNone > 0],
  ]
}
const self = process.argv.includes('--selftest')
const TGF = join(ROOT, 'src/lib/tileGround.js')
const DEF = join(ROOT, 'cartograph/groundDeformer.mjs')
const RGF = join(ROOT, 'src/lib/ribbonsGeometry.js')
const BAKEF = join(ROOT, 'cartograph/bake-ground.js')
const PKG = ['clipper', 'lib'].join('-')   // the painter's one bare import, re-pointed at the repo's own copy
const LIB = (m) => pathToFileURL(join(ROOT, 'src/lib', m)).href, SRC = (m) => pathToFileURL(join(ROOT, 'src', m)).href, CLIP = pathToFileURL(join(ROOT, 'node_modules/clipper-lib/clipper.js')).href
const must = (src, a) => { if (src.split(a).length !== 2) throw new Error(`selftest: the source no longer carries \`${a.slice(0, 80)}\` — re-aim the mutation`) }
const g = "globalThis.__RIM_MUT"
const T5 = '  if (!minted.length) return { ring, owners, added: 0 }'
const T9 = '  nodePaint((r) => insertOnEdges(r, null, minted, () => true).ring)'
const R9 = `  if (${g} !== 'nopaint') nodePaint((r) => insertOnEdges(r, null, minted, () => true).ring)`
const T10 = '  if (!minted.length) return { ring: st.ring, owners: st.ringOwner, block: st.iA || [], added: 0, far: 0, farMax: 0 }'
const R10 = `  if (!minted.length) return ${g} === 'nullrim' ? null : { ring: st.ring, owners: st.ringOwner, block: st.iA || [], added: 0, far: 0, farMax: 0 }`
const T8 = 'const reclip = hasStencil && !sameStamp(stampedWith, stencil)'
const R8 = `const reclip = hasStencil && (${g} === 'reclip' || !sameStamp(stampedWith, stencil))`
const G1 = '      if (cutOnce?.has(item)) { out.push(item); kept++; continue }', H1 = `      if (${g} !== 'clipall' && cutOnce?.has(item)) { out.push(item); kept++; continue }`
const B1 = '{ cutOnce: once }', B2 = '{ cutOnce: null }'
const D1 = "let beyond = !!tr?.rim && !pipRings(px + ux * eps, pz + uz * eps, [tr.rimRing])", D2 = "  const recOf = new Map(T.map(r => [r.ti, r]))"
// ⭐ one mutated copy of each module (checks/tier.mjs reads one temp-dir copy per writer), every mutation behind a switch read at call time
// the replacements, built here so the writers below are plain chains (checks/tier.mjs reads each writer's body)
const R5 = `  if (!minted.length || ${g} === 'unshared') return { ring, owners, added: 0 }`
const E1 = `let beyond = ${g} === 'stencil' ? (!!disc && !pipRings(px + ux * eps, pz + uz * eps, [disc])) : (!!tr?.rim && !pipRings(px + ux * eps, pz + uz * eps, [tr.rimRing]))`
const D3 = "for (const t of T) { const N = rims?.[t.ti],", E3 = `for (const t of T) { const N = ${g} === 'norims' ? null : rims?.[t.ti],`
const E2 = `  if (${g} === 'stencil') { segGrid.forEach((v, k) => segGrid.set(k, v.filter(s => s.cls !== 'beyond'))); if (disc) for (let i = 0; i < disc.length; i++) addSeg('beyond', disc[i], disc[(i + 1) % disc.length]) }\n${D2}`
const RE_PKG = new RegExp(`from '${PKG}'`, 'g'), TO_PKG = `from '${CLIP}'`
const RE_LIB = /from '\.\/([^']+)'/g, RE_SRC = /from '\.\.\/([^']+)'/g, RE_DLIB = /from '\.\.\/src\/lib\/([^']+)'/g
const toLib = (_, m) => `from '${LIB(m)}'`, toSrc = (_, m) => `from '${SRC(m)}'`
const mutantTG = () => { const tgSrc = readFileSync(TGF, 'utf8')
  const f = join(mkdtempSync(join(tmpdir(), 'rim-once-tg-')), 'tileGround.js')
  for (const a of [T5, T8, T9, T10]) must(tgSrc, a)
  writeFileSync(f, tgSrc.replace(T5, R5).replace(T9, R9).replace(T8, R8).replace(T10, R10).replace(RE_PKG, TO_PKG).replace(RE_LIB, toLib).replace(RE_SRC, toSrc))
  return pathToFileURL(f).href }
const mutantRG = () => { const rgSrc = readFileSync(RGF, 'utf8')
  const g3 = join(mkdtempSync(join(tmpdir(), 'rim-once-rg-')), 'ribbonsGeometry.js')
  must(rgSrc, G1)
  writeFileSync(g3, rgSrc.replace(G1, H1).replace(RE_PKG, TO_PKG).replace(RE_LIB, toLib).replace(RE_SRC, toSrc))
  return pathToFileURL(g3).href }
const mutantDEF = () => { const dfSrc = readFileSync(DEF, 'utf8')
  const g2 = join(mkdtempSync(join(tmpdir(), 'rim-once-def-')), 'groundDeformer.mjs')
  for (const a of [D1, D2, D3]) must(dfSrc, a)
  writeFileSync(g2, dfSrc.replace(D1, E1).replace(D2, E2).replace(D3, E3).replace(RE_DLIB, toLib))
  return pathToFileURL(g2).href }
if (self) { const tgCopy = mutantTG()
  const dfCopy = mutantDEF()
  const rgCopy = mutantRG()
  const BAKE0 = readFileSync(BAKEF, 'utf8'); must(BAKE0, B1)
  const bakeOf = () => globalThis.__RIM_MUT === 'nocutonce' ? BAKE0.replace(B1, B2) : BAKE0
  let bad = 0
  for (const [k, name, row] of [['reclip', 'a stamped shape clipped to the stencil again in the finish', 1], ['stencil', "beyond read off the stencil's chord", 3], ['norims', "the painter's noded rim dropped from the deformer (tile 49)", 6], ['nullrim', 'a rim-edged tile that mints nothing given no rim entry (the painter before 0c65681c)', 14], ['nopaint', "the painted pieces not noded with the rim crossings (B2, tile 242)", 8], ['unshared', 'the block\'s rim crossings not shared with the ring', 13], ['clipall', "the bake's stencil clip cutting ①'s paint again (cutOnce ignored)", 10], ['nocutonce', 'bake-ground.js passing no cutOnce to its stencil clip', 11]]) {
    // a mutant the deformer REFUSES (a rim-edged tile with no rim entry, groundDeformer.mjs) is caught as loudly as a RED row
    globalThis.__RIM_MUT = k; let R, red
    try { R = await rows(await loadTG(tgCopy), await loadDEF(dfCopy), await loadRG(rgCopy), bakeOf()); red = !R[row][1] }
    catch (e) { if (!/gave it no rim entry/.test(e.message)) throw e; R = { [row]: [`refused by the deformer: ${e.message.slice(0, 90)}`] }; red = true }
    if (!red) bad++; console.log(`  ${red ? '✅' : '⛔'} mutant · ${name}: ${red ? 'RED, as it must be' : 'still GREEN — the check cannot see it'} (${R[row][0]})`) }
  globalThis.__RIM_MUT = null; const R0 = await rows(await loadTG(tgCopy), await loadDEF(dfCopy), await loadRG(rgCopy), bakeOf()); if (!R0.every(r => r[1])) { bad++; console.log('  ⛔ the mutated copies, switched off, are not GREEN — the mutation changed more than its switch') }
  process.exit(bad ? 1 : 0) }
const R = await rows(await loadTG(pathToFileURL(TGF).href), await loadDEF(pathToFileURL(DEF).href), await loadRG(pathToFileURL(RGF).href), readFileSync(BAKEF, 'utf8'))
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the rim is cut once' : '⛔ the rim is cut more than once: a crossing is not shared'); process.exit(ok ? 0 : 1)
