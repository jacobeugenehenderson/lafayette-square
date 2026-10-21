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

const rows = async (tgUrl, defUrl) => {
  const TG = await import(tgUrl), { buildDeformer } = await import(defUrl)
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
const TGF = join(ROOT, 'src/lib/tileGround.js'), DEF = join(ROOT, 'cartograph/groundDeformer.mjs')
const relink = (src, dir) => src.replace(/from 'clipper-lib'/g, `from '${pathToFileURL(join(ROOT, 'node_modules/clipper-lib/clipper.js')).href}'`).replace(/from '\.\/([^']+)'/g, (_, m) => `from '${pathToFileURL(join(ROOT, dir, m)).href}'`).replace(/from '\.\.\/([^']+)'/g, (_, m) => `from '${pathToFileURL(join(ROOT, dir, '..', m)).href}'`)
const must = (src, a) => { if (src.split(a).length !== 2) throw new Error(`selftest: the source no longer carries \`${a.slice(0, 80)}\` — re-aim the mutation`) }
// ⭐ ONE mutated copy of each module (checks/tier.mjs reads one temp-dir `mutant`), every mutation behind a switch read at call time
const mutant = () => { const tg = readFileSync(TGF, 'utf8'), df = readFileSync(DEF, 'utf8'), dir = mkdtempSync(join(tmpdir(), 'rim-once-'))
  const T1 = 'const curbB = inBlock(curbOuter), pedB = inBlock(pedOuter), luB = inBlock(luIn0)', T2 = 'W = bandCut(LV_wf.rings, inBlock(LV_wf.rings), LV_wt.rings, inBlock(LV_wt.rings))'
  const T3 = 'Wacc:   cutByStamp(st, Wall, sp),', T4 = 'tlByLu: rekeyByPiece(st, { [key]: less(Wp.length ? differenceRings(env, Wp) : env) }, sp),', T6 = 'curb:   cutByStamp(st, less(bandCut(curbOuter, curbB, pedOuter, pedB)), sp),', T7 = 'luByLu: rekeyByPiece(st, { [key]: less(luIn) }, sp),', T5 = '  if (!minted.length) return { ring, owners, added: 0 }'
  const D1 = "let beyond = !!tr?.rim && !pipRings(px + ux * eps, pz + uz * eps, [tr.ring])", D2 = "  const recOf = new Map(T.map(r => [r.ti, r]))"
  for (const a of [T1, T2, T3, T4, T5, T6, T7]) must(tg, a); for (const a of [D1, D2]) must(df, a)
  const g = "globalThis.__RIM_MUT"
  writeFileSync(join(dir, 'tileGround.js'), relink(tg
    .replace(T1, `const __end = ${g} === 'end', curbB = __end ? curbOuter : inBlock(curbOuter), pedB = __end ? pedOuter : inBlock(pedOuter), luB = __end ? luIn0 : inBlock(luIn0)`)
    .replace(T2, `W = ${g} === 'end' ? band(LV_wf.rings, LV_wt.rings) : bandCut(LV_wf.rings, inBlock(LV_wf.rings), LV_wt.rings, inBlock(LV_wt.rings))`)
    .replace(T3, `Wacc:   cutByStamp(st, ${g} === 'end' ? inBlock(Wall) : Wall, sp),`)
    .replace(T4, `tlByLu: rekeyByPiece(st, { [key]: (${g} === 'end' ? inBlock : (x) => x)(less(Wp.length ? differenceRings(env, Wp) : env)) }, sp),`)
    .replace(T7, `luByLu: rekeyByPiece(st, { [key]: (${g} === 'end' ? inBlock : (x) => x)(less(luIn)) }, sp),`)
    .replace(T6, `curb:   cutByStamp(st, (${g} === 'end' ? inBlock : (x) => x)(less(bandCut(curbOuter, curbB, pedOuter, pedB))), sp),`)
    .replace(T5, `  if (!minted.length || ${g} === 'unshared') return { ring, owners, added: 0 }`), 'src/lib'))
  writeFileSync(join(dir, 'groundDeformer.mjs'), relink(df
    .replace(D1, `let beyond = ${g} === 'stencil' ? (!!disc && !pipRings(px + ux * eps, pz + uz * eps, [disc])) : (!!tr?.rim && !pipRings(px + ux * eps, pz + uz * eps, [tr.ring]))`)
    .replace(D2, `  if (${g} === 'stencil') { segGrid.forEach((v, k) => segGrid.set(k, v.filter(s => s.cls !== 'beyond'))); if (disc) for (let i = 0; i < disc.length; i++) addSeg('beyond', disc[i], disc[(i + 1) % disc.length]) }\n${D2}`), 'cartograph'))
  return [pathToFileURL(join(dir, 'tileGround.js')).href, pathToFileURL(join(dir, 'groundDeformer.mjs')).href] }
if (self) { const [tg, df] = mutant(); let bad = 0
  for (const [k, name, row] of [['end', 'the bands cut at the end, past the rim', 1], ['stencil', "beyond read off the stencil's chord", 3], ['unshared', 'the block\'s rim crossings not shared with the ring', 5]]) {
    globalThis.__RIM_MUT = k; const R = await rows(tg, df), red = !R[row][1]
    if (!red) bad++; console.log(`  ${red ? '✅' : '⛔'} mutant · ${name}: ${red ? 'RED, as it must be' : 'still GREEN — the check cannot see it'} (${R[row][0]})`) }
  globalThis.__RIM_MUT = null; const R0 = await rows(tg, df); if (!R0.every(r => r[1])) { bad++; console.log('  ⛔ the mutated copies, switched off, are not GREEN — the mutation changed more than its switch') }
  process.exit(bad ? 1 : 0) }
const R = await rows(pathToFileURL(TGF).href, pathToFileURL(DEF).href)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ the rim is cut once' : '⛔ the rim is cut more than once: a crossing is not shared'); process.exit(ok ? 0 : 1)
