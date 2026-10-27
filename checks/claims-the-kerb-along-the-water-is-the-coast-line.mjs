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
//       WATER_EDGE_SKEL) lies on ①'s water edge within one rounding AND is either a ① vertex (the frozen
//       `protopolygon.blocks`) or a vertex SHARED by the line's other readers: the land use (`luByClass`, the stamp's crossings;
//       Zob, 2026-10-26) or the tile's own shore cell (`inkCells`, tileGround#shareWaterRunIntoShore: the joins and any ②
//       vertex on ①'s line), or — on a face with no shore cell — the tile's own ring, which is the water line there. Anything
//       else is RED by name: off the line, or on it unshared.
//   (B) every ② kerb vertex with ONE water edge (where a street meets the coast) lies on a ① water edge, within the lattice's
//       one rounding (latticeNode#NODE_BOUND, read);
//   (C′) every ① coast vertex (both edges the water's) inside the SPAN of a ② water run appears in ② as a vertex. A run's
//       span is the stretch of ①'s ring between the run's two ends (where it joins a street, read by position on ①'s ring;
//       the whole ring for a run with no end). Dropped inside a span: RED (PTown block 11 v174, a collinear coast vertex,
//       2026-10-26). Outside every span the vertex lies under a carriageway, past a street's join with the water (Huron
//       wall-street-1, 21–47 m past its join): not part of the kerb, counted apart. By identity on ①'s ring, never a distance.
//   (R) AT THE RIM (Zob, 2026-10-26: the cells passed the circle uncut): (R1) no shore-cell vertex lies outside the disc
//       (`protopolygon.boundaryRing`) past the two-unit containment; (R2) no ink-cell ring is carried by two tiles (a rim tile's
//       pieces each carried the whole block's cells); (R3) every ink-cell vertex ON the rim is a vertex of its tile's ring (the
//       cut's crossings shared, so the asphalt and the cell meet at one point there).
//       RIM MUTANTS (copies of the producer): the circle skips the cells · a cut ring goes to the largest piece unrefused · the
//       cells' rim crossings are not shared · the cell cut drops collinear vertices. Each must read RED on a town or on its
//       planted row (two of them have one: a ring straddling two pieces; a collinear vertex inside the disc on a ring across it).
//   MUTANTS (always run): the producer copied with the coast clause of `rSrc` removed (the anchor must occur once) must go RED
//   on some town; a town where it stays GREEN has nothing on its coast to fillet and is said so. In process, per town: one
//   off-line vertex inserted mid-way along a ② water edge (pushed 2 units off it) must read RED as off the line, and one
//   on-line vertex shared by nothing must read RED as unshared.
//   node checks/claims-the-kerb-along-the-water-is-the-coast-line.mjs --slot=<who granted it> [<town> …]
// ⚠️ HEAVY: two producer builds per coast town (live and mutant). Not in npm test; runs in a granted slot and says who granted it.
// @args --slot=<granted>
// Exit 1 on any RED, a mutant that stays green everywhere, or no coast town · 2 with no --slot, or an anchor not found once.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { WATER_EDGE_SKEL, HWY_SKEL } from '../src/lib/tileGround.js'
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
// the three RIM mutants (Zob, 2026-10-26), each a copy of the producer with one step undone; each anchor must occur once
const RIM_MUTANTS = [
  ['the circle does not cut the cells', '  if (!across) return [r0]\n', '  return [r0]\n'],
  ['the cell cut drops collinear vertices', 'intersectRings([r0], [stamp], { preserveCollinear: true })', 'intersectRings([r0], [stamp])'],
  ['a cut cell ring goes to the largest piece, never refused', 'hit = a.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0)', 'hit = [a.indexOf(Math.max(...a))]'],
  ['the cells\' rim crossings are not shared into the ring', 'const sc = shareRimCrossings(r, ringOwners[i], flat, input, stamp); r = sc.ring; ringOwners[i] = sc.owners;', 'const sc = { added: 0 };'],
]
// the corner mutant: the far-end-on-the-water-run tie-break restored (it chose the wrong edge at PTown, 2026-10-26)
RIM_MUTANTS.push(['a thin cell\'s corner picked by the far end\'s key', '.filter(([u, w]) => edgeHolds(rr[u], rr[w], v))\n  return opts.length === 1 ? opts[0] : null',
  ".filter(([u, w]) => { const P = toClipper(rr[u]), Q = toClipper(rr[w]), q = toClipper(v), dx = Q.X - P.X, dy = Q.Y - P.Y, L2 = dx * dx + dy * dy; if (!L2) return false; const t = ((q.X - P.X) * dx + (q.Y - P.Y) * dy) / L2; return t > 0 && t < 1 })\n  const W = globalThis.__farWet || new Set(), Kk = (p) => { const c = toClipper(p); return c.X + ',' + c.Y }\n  const f = opts.length > 1 ? opts.filter(([u, w]) => W.has(Kk(rr[u === ic ? w : u]))) : opts\n  return f.length === 1 ? f[0] : null"])
// the island mutant: a CLOSED run (both ways round the cell wet) refused, as before rule (1) (Huron's 11.3 ha island, 2026-10-27)
// the keyless mutant: a water-run vertex with no bracket key is skipped (no place), as before (Huron's motorway banks, 2026-10-27)
RIM_MUTANTS.push(['a keyless water run skipped', '      else { const cands = []\n        rings.forEach((R2, a)', '      else if (false) { const cands = []\n        rings.forEach((R2, a)'])
// the join mutant: ②'s join at a depth-0 neighbour sought on the ADJACENT edge only (the chord), as before (Huron's Cleveland Road)
RIM_MUTANTS.push(['the depth-0 join on the adjacent edge only', '    if (!X && !(idMap?.hwy && (idMap.hwy[ia] || idMap.hwy[i]))) {', '    if (false) {'])
RIM_MUTANTS.push(['a closed run refused, both ways wet', '      const cands = []\n', "      if (okF && okB) throw new Error('[mutant] both ways round the cell are wet')\n      const cands = []\n"])
const rimMutants = []
for (const [name, a, b] of RIM_MUTANTS) {
  if (tgSrc.split(a).length !== 2) { console.log(`⛔ NOT CHECKED — the rim mutant's anchor (${name}) occurs ${tgSrc.split(a).length - 1} time(s) in tileGround.js, not once`); process.exit(2) }
  const d = mkdtempSync(join(tmpdir(), 'coast-rim-')); process.on('exit', () => rmSync(d, { recursive: true, force: true }))
  writeFileSync(join(d, 'tileGround.js'), tgSrc.replace(a, b)
    .replace(/from \x27(\.{1,2}\/[^\x27]+)\x27/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`)
    .replace(/from \x27clipper-lib\x27/g, `from "${import.meta.resolve('clipper-lib')}"`))
  rimMutants.push({ name, tg: await import(pathToFileURL(join(d, 'tileGround.js')).href), red: 0 }) }

// PLANTED (always run, no build): a cell ring straddling two disc pieces — the live producer refuses it; the "largest, unrefused"
// mutant assigns it. Without this the mutant could only differ from live on a town that already refuses (Boz, 2026-10-26).
{ const { cellPieceOf } = await import('../src/lib/tileGround.js'), M = rimMutants.find(m => m.name.startsWith('a cut cell ring'))
  const pieces = [[[0, 0], [10, 0], [10, 10], [0, 10]], [[10, 0], [20, 0], [20, 10], [10, 10]]], straddle = [[8, 4], [12, 4], [12, 6], [8, 6]], inOne = [[2, 2], [4, 2], [4, 4], [2, 4]]
  let live = null; try { live = cellPieceOf(straddle, pieces) } catch (e) { live = 'refused' }
  let mut = null; try { mut = M.tg.cellPieceOf(straddle, pieces) } catch (e) { mut = 'refused' }
  const one = cellPieceOf(inOne, pieces), ok = live === 'refused' && typeof mut === 'number' && one === 0
  console.log(`${ok ? '✅' : '⛔'} (R) planted rim tile: a ring straddling two pieces — live ${live === 'refused' ? 'REFUSES' : `assigns it to ${live}`}, the "largest, unrefused" mutant ${typeof mut === 'number' ? `assigns it to piece ${mut}` : 'refuses too (the mutant is vacuous)'}; a ring inside one piece goes to piece ${one}`)
  if (ok) M.red++; else { console.log('⛔ the planted rim tile cannot tell containment from largest — (R)\'s assignment is unproven'); process.exit(1) }
  // (R) planted, THE CUT KEEPS WHAT IS INSIDE (Zob): a cell ring across the rim carrying a collinear vertex inside the disc —
  // the live cut keeps it; cut without preserving collinear vertices, it is lost (the producer's own proof refuses)
  const { cutCellRing } = await import('../src/lib/tileGround.js'), C2 = rimMutants.find(m => m.name.startsWith('the cell cut drops'))
  const disc = [[0, 0], [10, 0], [10, 10], [0, 10]], cell = [[8, 2], [9, 2], [12, 2], [12, 4], [8, 4]]
  const kept = cutCellRing(cell, disc).flat().some(v => v[0] === 9 && v[1] === 2)
  let m2 = null; try { m2 = C2.tg.cutCellRing(cell, disc).flat().some(v => v[0] === 9 && v[1] === 2) ? 'kept' : 'lost' } catch (e) { m2 = 'refused' }
  const ok2 = kept && m2 !== 'kept'
  console.log(`${ok2 ? '✅' : '⛔'} (R) planted rim cut: a collinear vertex inside the disc on a ring across the rim — live ${kept ? 'keeps it' : 'LOSES it'}; without preserving collinear vertices ${m2 === 'refused' ? 'the producer refuses (its proof)' : m2}`)
  if (ok2) C2.red++; else { console.log('⛔ the planted rim cut cannot see a dropped collinear vertex'); process.exit(1) }
  // (A′) planted, A THIN CELL'S CORNER (PTown (204.406, 67.434), 2026-10-26): the bracket key c and its two cell edges; the point
  // lies 0.06 mm off one and 105 mm off the other, and both take its parameter. Live keeps the one that HOLDS it; the far-end
  // tie-break (the far end of the other edge is on the water run) picks the wrong one
  const { incidentEdgeHolding } = await import('../src/lib/tileGround.js'), C3 = rimMutants.find(m => m.name.startsWith('a thin cell'))
  const rr = [[199.773, 73.253], [204.472, 67.351], [195.439, 62.112]], vv = [204.406, 67.434]
  const live3 = incidentEdgeHolding(rr, 1, vv)
  globalThis.__farWet = new Set([Math.round(195.439 * CLIP_SCALE) + ',' + Math.round(62.112 * CLIP_SCALE)])
  const mut3 = C3.tg.incidentEdgeHolding(rr, 1, vv); delete globalThis.__farWet
  const ok3 = JSON.stringify(live3) === '[0,1]' && JSON.stringify(mut3) === '[1,2]'
  console.log(`${ok3 ? '✅' : '⛔'} (A′) planted thin-cell corner: live places it on edge ${JSON.stringify(live3)} (the one holding it, 0.06 mm); the far-end tie-break picks ${JSON.stringify(mut3)} (105 mm off)`)
  if (ok3) C3.red++; else { console.log('⛔ the planted corner cannot tell containment from the far-end key'); process.exit(1) }
  // (A′) planted, AN ISLAND (Huron's 11.3 ha island, 2026-10-27): its shore cell rings it, so the water run is CLOSED and both
  // ways round the cell are wet. A crossing v on the block's edge (0,0)→(100,0): live places it on that edge (the one HOLDING it);
  // the mutant that refuses a closed run, as before rule (1), refuses
  const { shareWaterRunIntoShore } = await import('../src/lib/tileGround.js'), C4 = rimMutants.find(m => m.name.startsWith('a closed run'))
  const sq = [[0, 0], [100, 0], [100, 100], [0, 100]], sea = [[-1, -1], [101, -1], [101, 101], [-1, 101]], vI = [50, 0]
  const iA = [[0, 0], vI, [100, 0], [100, 100], [0, 100]]
  const isle = { ring: sea, iA: [iA], iaFull: [iA], iaStamp: [iA.map(() => 0)], runs: [{ skelId: WATER_EDGE_SKEL, side: 'left', segOrd: 0 }], inkCells: [{ cls: 'shore', rings: [sq, sea] }] }
  let live4 = null, liveErr = null; try { live4 = shareWaterRunIntoShore(isle, 'planted island') } catch (e) { liveErr = String(e.message) }
  let mutErr = null; try { C4.tg.shareWaterRunIntoShore(isle, 'planted island') } catch (e) { mutErr = String(e.message) }
  const land = live4?.tile?.inkCells?.[0]?.rings?.[0] || [], at = land.findIndex(p => p[0] === 50 && p[1] === 0)
  const ok4 = !liveErr && at === 1 && !!mutErr
  console.log(`${ok4 ? '✅' : '⛔'} (A′) planted island: live ${liveErr ? `REFUSES (${liveErr.slice(0, 90)})` : at >= 0 ? `places v on the edge holding it (cell vertex ${at})` : 'does not place v'}; the closed-run-refused mutant ${mutErr ? 'refuses' : 'places it (vacuous)'}`)
  if (ok4) C4.red++; else { console.log('⛔ the planted island cannot tell rule (1) from a closed-run refusal'); process.exit(1) }
  // (A′) planted, A KEYLESS WATER RUN (Huron's land between two motorway bank ends, 2026-10-27): highway → water → highway, the
  // water run's two ends both H × water joins, no ① vertex on it; the shore cell's land edge runs past both. Live places both on
  // the one cell edge that holds them; the mutant that skips a keyless vertex refuses
  const C5 = rimMutants.find(m => m.name.startsWith('a keyless'))
  const bl = [[2, 0], [8, 0], [8, 10], [2, 10]]
  const keyless = { ring: [[-6, -1], [16, -1], [16, 12], [-6, 12]], iA: [bl], iaFull: [bl], iaStamp: [[0, 1, 1, 1]], runs: [{ skelId: WATER_EDGE_SKEL, side: 'left', segOrd: 0 }, { skelId: HWY_SKEL, side: 'left', segOrd: 0 }],
    inkCells: [{ cls: 'shore', rings: [[[-5, 0], [15, 0], [15, -0.005], [-5, -0.005]]] }] }
  let live5 = null, e5 = null; try { live5 = shareWaterRunIntoShore(keyless, 'planted keyless run') } catch (e) { e5 = String(e.message) }
  let m5 = null; try { C5.tg.shareWaterRunIntoShore(keyless, 'planted keyless run') } catch (e) { m5 = String(e.message) }
  const land5 = live5?.tile?.inkCells?.[0]?.rings?.[0] || [], has = (x) => land5.some(p => p[0] === x && p[1] === 0)
  const ok5 = !e5 && has(2) && has(8) && !!m5
  console.log(`${ok5 ? '✅' : '⛔'} (A′) planted keyless run: live ${e5 ? `REFUSES (${e5.slice(0, 90)})` : `places both joins on the cell edge holding them (${has(2) && has(8) ? 'both' : 'not both'})`}; the keyless-skipped mutant ${m5 ? 'refuses' : 'places them (vacuous)'}`)
  if (ok5) C5.red++; else { console.log('⛔ the planted keyless run cannot tell the rule from skipping it'); process.exit(1) }
  // (B) planted, ②'S JOIN AT A DEPTH-0 NEIGHBOUR (Huron's ① vertices at cleveland-road-east-0, 2026-10-27): a 0.22 m water sub-edge
  // after a coast bend, then a street 3.345 m deep. The miter falls behind the short edge's start; live seeks X along the water
  // RUN (① vertex 11 cut away, X on ① edge 9 → 10, on ①'s line); the adjacent-edge-only join keeps ① 11 and mints no X
  const { offsetRingByRects } = await import('../src/lib/tileGround.js'), C6 = rimMutants.find(m => m.name.startsWith('the depth-0 join'))
  const v9 = [740.462, 579.219], v10 = [736.211, 569.981], v11 = [736.160, 569.765], Pq = [735.876, 573.098], nq = [(Pq[0] - v11[0]) / 3.345, (Pq[1] - v11[1]) / 3.345], dq = [-nq[1], nq[0]]
  const v12 = [v11[0] + dq[0] * 30, v11[1] + dq[1] * 30], jr = [v9, v10, v11, v12, [v12[0] + nq[0] * 25, v12[1] + nq[1] * 25], [v9[0] + nq[0] * 25, v9[1] + nq[1] * 25]], jd = (k) => (k <= 1 ? 0 : k === 2 ? 3.345 : 2)
  const sdq = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
  const jOwn = (e) => (e <= 1 ? `${WATER_EDGE_SKEL}|right|0` : `street|left|${e}`)   // the water run is the water's, by identity
  // ⭐ RUN LABELLED (Zob, 2026-10-27): the defect was a LABEL — the chord's kind-1 line put the water's label on east-0's cap —
  // so the row reads the labels: every ② edge labelled with a water edge (① edge ≤ 1) lies on ①'s water line, both ends within
  // 2 mm of 9 → 10 → 11. The water identity rides `idMap.water`, the one flag every caller passes, labelled or not.
  const jWater = jr.map((_, e) => e <= 1), onWater = (p) => Math.min(sdq(p, v9, v10), sdq(p, v10, v11)) < 0.002
  const judgeJ = (M, labelled = true) => { const S = labelled ? {} : null, R = M.offsetRingByRects(jr, jd, false, S, null, { water: jWater }, jOwn), RR = R.rings || R, V = RR.flat()
    const offWater = !labelled ? null : RR.reduce((t, r, ri) => t + (S.edgeLabels?.[ri] || []).filter((e, k) => e != null && e <= 1 && !(onWater(r[k]) && onWater(r[(k + 1) % r.length]))).length, 0)
    return { RR, offWater, has11: V.some(p => Math.hypot(p[0] - v11[0], p[1] - v11[1]) < 0.002), X: V.filter(p => sdq(p, v9, v10) < 0.002 && Math.hypot(p[0] - v9[0], p[1] - v9[1]) > 0.01 && Math.hypot(p[0] - v10[0], p[1] - v10[1]) > 0.01 && Math.hypot(p[0] - 737.65, p[1] - 573.1) < 0.5) } }
  const L6 = judgeJ({ offsetRingByRects }), M6 = judgeJ(C6.tg), U6 = judgeJ({ offsetRingByRects }, false)
  const sameRings = (A, B) => A.length === B.length && A.every((r, i) => r.length === B[i].length && r.every((p, k) => p[0] === B[i][k][0] && p[1] === B[i][k][1]))
  const ok6 = !L6.has11 && L6.X.length === 1 && L6.offWater === 0 && M6.has11 && M6.offWater > 0
  console.log(`${ok6 ? '✅' : '⛔'} (B) planted depth-0 join, labelled: live ${L6.has11 ? 'KEEPS ① 11' : 'cuts ① 11 away'}, X on ①'s water edge ${L6.X.length ? `(${L6.X[0].map(v => v.toFixed(3)).join(', ')})` : 'NONE'}, ${L6.offWater} water-labelled ② edge(s) off ①'s water line; the adjacent-edge-only join ${M6.has11 ? 'keeps ① 11' : 'cuts it too'} and puts ${M6.offWater} water label(s) off the line ${M6.has11 && M6.offWater > 0 ? '(the old defect, seen)' : '(vacuous)'}`)
  // …and the row can fail: the same call with NO water flag (a caller that cannot say) builds the other corner
  const N6 = offsetRingByRects(jr, jd, false), okU = sameRings(U6.RR, L6.RR) && !sameRings(N6.rings || N6, L6.RR)
  console.log(`${okU ? '✅' : '⛔'} (B′) the same join UNLABELLED (no stamp, no owners, the water flag given — ③'s flood and guard): ${sameRings(U6.RR, L6.RR) ? 'the same rings, vertex for vertex' : 'DIFFERENT rings — ② and ③ build two corners'}; without the flag ${sameRings(N6.rings || N6, L6.RR) ? 'the same too (the row is vacuous)' : 'another corner (the row can fail)'}`)
  if (!okU) { console.log('⛔ the water join depends on which caller asked'); process.exit(1) }
  // (B″) SOURCE: every call of offsetRingByRects in tileGround.js hands it the water flag (`water:` in its arguments), so no
  // caller strikes a ring that carries water without saying which edges are (Zob, 2026-10-27: `ins` ×2 and blockAt did not)
  const calls = []; for (let at = tgSrc.indexOf('offsetRingByRects('); at >= 0; at = tgSrc.indexOf('offsetRingByRects(', at + 1)) {
    if (tgSrc.slice(Math.max(0, at - 16), at).includes('function ')) continue
    let dep = 0, k = at + 'offsetRingByRects'.length; for (; k < tgSrc.length; k++) { if (tgSrc[k] === '(') dep++; else if (tgSrc[k] === ')' && --dep === 0) break }
    calls.push({ line: tgSrc.slice(0, at).split('\n').length, args: tgSrc.slice(at, k + 1) }) }
  const bare = calls.filter(c => !/\bwater\b/.test(c.args))
  console.log(`${calls.length && !bare.length ? '✅' : '⛔'} (B″) ${calls.length} call(s) of offsetRingByRects in tileGround.js, ${bare.length} without the water flag${bare.length ? `: ${bare.map(c => c.args.slice(0, 70)).join(' · ')}` : ''}`)
  if (!calls.length || bare.length) process.exit(1)
  if (ok6) C6.red++; else { console.log('⛔ the planted depth-0 join cannot tell the run from the adjacent edge'); process.exit(1) } }
const K = (p) => [Math.round(p[0] * CLIP_SCALE), Math.round(p[1] * CLIP_SCALE)]
const key = (k) => k[0] + ',' + k[1]
const windXZ = (p, r) => { let w = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
  if (zj <= p[1]) { if (zi > p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) > 0) w++ } else if (zi <= p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) < 0) w-- } return w }

// ①'s coast: its vertices with both edges the water's, and its water edges (lattice units)
function coastOf(fp) {
  const isW = (l) => l != null && fp.owners[l]?.skelId === WATER_EDGE_SKEL
  const both = new Map(), edges = [], ringsOut = []
  const rings = (fp.blocks || []).map((r, k) => [r, fp.blockLabels?.[k] || []]).concat((fp.blockHoles || []).flatMap((hs, k) => hs.map((h, j) => [h, fp.blockHoleLabels?.[k]?.[j] || []])))
  for (const [r, L] of rings) { const ri = ringsOut.push({ K: r.map(K), n: r.length }) - 1
    r.forEach((p, i) => { const n = r.length
      if (isW(L[i])) edges.push([K(p), K(r[(i + 1) % n]), ri, i])
      if (isW(L[i]) && isW(L[(i - 1 + n) % n])) both.set(key(K(p)), p) }) }
  const at = new Map(); ringsOut.forEach((o, ri) => o.K.forEach((k, i) => at.set(key(k), [ri, i])))
  return { both, edges, rings: ringsOut, at }
}
// ⭐ IN THE DRAWING ONLY (Boz's slot, 2026-10-27, measured on Huron at 2de92999): a rim tile's ② (`iaFull`) is the block's whole
// kerb, uncut, while everything that reads the line (the cells, the land use) is cut at the circle. Past the disc no sharer exists:
// all 137 of Huron's "unshared" (A) vertices lay outside it, 52 carried twice by a block's two rim pieces. (A) and (B) judge a
// vertex only inside the disc or on its rim (`inDrawing`); the ones outside are counted apart, never judged.
function judge(tiles, C, lu, disc) {
  const inDrawing = (p) => !disc?.length || windXZ(p, disc) !== 0 || disc.some((a, i) => { const b = disc[(i + 1) % disc.length], A = K(a), B = K(b), k = K(p), dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy
    if (!L2) return false; const t = ((k[0] - A[0]) * dx + (k[1] - A[1]) * dy) / L2; if (t < 0 || t > 1) return false; const cr = (k[0] - A[0]) * dy - (k[1] - A[1]) * dx; return cr * cr <= 4 * L2 })
  const vSet = new Set([...C.both.keys()]), all = new Set()
  const shared = new Set(); for (const rs of Object.values(lu || {})) for (const r of rs || []) for (const p of r || []) shared.add(key(K(p)))
  for (const t of tiles) for (const c of (t.inkCells || [])) if (c.cls === 'shore') for (const r of c.rings) for (const p of r) shared.add(key(K(p)))
  // a face with NO shore cell (it borders no ink: a bb corner between the water and the frame) has the water line as its own ring,
  // so there the RING is the sharer (Boz's ruled case, 2026-10-26)
  for (const t of tiles) if (!(t.inkCells || []).some(c => c.cls === 'shore')) for (const p of (t.ring || [])) shared.add(key(K(p)))
  const onEdge = (k) => C.edges.some(([a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (!L2) return false
    const t = ((k[0] - a[0]) * dx + (k[1] - a[1]) * dy) / L2; if (t < 0 || t > 1) return false
    const cr = (k[0] - a[0]) * dy - (k[1] - a[1]) * dx; return cr * cr <= NODE_BOUND * NODE_BOUND * L2 })
  let A = 0, Abad = [], Aoff = [], Aunshared = [], B = 0, Bbad = [], outside = 0
  for (const t of tiles) (t.iaFull || []).forEach((ring, si) => { const st = t.iaStamp?.[si]; if (!st) return
    const n = ring.length, w = (e) => t.runs?.[st[e]]?.skelId === WATER_EDGE_SKEL
    ring.forEach((p, i) => { const k = K(p); all.add(key(k))
      const wi = w(i), wp = w((i - 1 + n) % n)
      if ((wi || wp) && !inDrawing(p)) { outside++; return }
      if (wi && wp) { A++; if (!onEdge(k)) { Aoff.push(p); Abad.push(p) } else if (!vSet.has(key(k)) && !shared.has(key(k))) { Aunshared.push(p); Abad.push(p) } }
      else if (wi || wp) { B++; if (!onEdge(k)) Bbad.push(p) } }) })
  // (C′) the ① spans the ② water runs cover: a run vertex's POSITION on ①'s ring (a ① vertex: its index; on a ① water edge:
  // index + t), the span walked from the run's first position to its last in the direction its positions step
  const posOf = (k) => { const v = C.at.get(key(k)); if (v) return { ri: v[0], x: v[1] }
    for (const [a, b, ri, i] of C.edges) { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (!L2) continue
      const t = ((k[0] - a[0]) * dx + (k[1] - a[1]) * dy) / L2; if (t < 0 || t > 1) continue
      const cr = (k[0] - a[0]) * dy - (k[1] - a[1]) * dx; if (cr * cr <= NODE_BOUND * NODE_BOUND * L2) return { ri, x: i + t } }
    return null }
  const covered = new Set()
  for (const t of tiles) (t.iaFull || []).forEach((ring, si) => { const st = t.iaStamp?.[si]; if (!st) return
    const n = ring.length, w = (e) => t.runs?.[st[e]]?.skelId === WATER_EDGE_SKEL
    let s0 = -1; for (let e = 0; e < n; e++) if (w(e) && !w((e - 1 + n) % n)) { s0 = e; break }
    const runs = []
    if (s0 < 0) { if (w(0)) runs.push({ all: true, vs: ring }) }
    else for (let k = 0, e = s0; k < n;) { if (!w(e)) { e = (e + 1) % n; k++; continue }
      const vs = [ring[e]]; while (k < n && w(e)) { vs.push(ring[(e + 1) % n]); e = (e + 1) % n; k++ } runs.push({ vs }) }
    for (const R of runs) { const P = R.vs.map(q => posOf(K(q))).filter(Boolean); if (!P.length) continue
      const ri = P[0].ri, m = C.rings[ri].n
      if (R.all) { for (let i = 0; i < m; i++) covered.add(key(C.rings[ri].K[i])); continue }
      // the direction: the sign of the first non-zero step, taken the short way round
      let dir = 0; for (let j = 1; j < P.length && !dir; j++) { let d = P[j].x - P[j - 1].x; if (d > m / 2) d -= m; if (d < -m / 2) d += m; dir = Math.sign(d) }
      if (!dir) continue
      const a = P[0].x, b = P[P.length - 1].x, span = ((dir > 0 ? b - a : a - b) % m + m) % m
      for (let i = 0; i < m; i++) { const off = ((dir > 0 ? i - a : a - i) % m + m) % m; if (off > 0 && off < span) covered.add(key(C.rings[ri].K[i])) } } })
  let Cn = 0, under = 0; const Cbad = []
  for (const [kk, p] of C.both) { if (!tiles.some(t => t.ring && windXZ(p, t.ring) !== 0)) continue
    if (!covered.has(kk)) { under++; continue }
    Cn++; if (!all.has(kk)) Cbad.push(p) }
  return { A, Abad, Aoff, Aunshared, B, Bbad, Cn, Cbad, under, outside }
}
function rimJudge(tiles, B) {
  const out = [], seen = new Map(); let cells = 0, twice = 0
  const onB = (p) => { const k = K(p); for (let i = 0; i < B.length; i++) { const a = K(B[i]), b = K(B[(i + 1) % B.length]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy
    if (!L2) continue; const t = ((k[0] - a[0]) * dx + (k[1] - a[1]) * dy) / L2; if (t < 0 || t > 1) continue
    const cr = (k[0] - a[0]) * dy - (k[1] - a[1]) * dx; if (cr * cr <= 4 * L2) return true } return false }
  let rimV = 0; const unshared = []
  tiles.forEach((t, ti) => { const ringKeys = new Set((t.ring || []).map(p => key(K(p))))
    ;(t.inkCells || []).forEach(c => c.rings.forEach(r => { for (const p of r) if (B?.length && onB(p)) { rimV++; if (!ringKeys.has(key(K(p)))) unshared.push(p) } })) })
  tiles.forEach((t, ti) => (t.inkCells || []).forEach(c => c.rings.forEach(r => { cells++
    const sig = r.map(p => key(K(p))).sort().join(';'), was = seen.get(sig); if (was != null && was !== ti) twice++; else seen.set(sig, ti)
    if (B?.length && c.cls === 'shore') for (const p of r) if (windXZ(p, B) === 0 && !onB(p)) out.push(p) })))
  return { cells, out, twice, rimV, unshared } }
const say = (J, label) => {
  const at = (ps) => ps.slice(0, 4).map(p => `(${p.map(v => v.toFixed(3)).join(', ')})`).join(' · ')
  console.log(`  ${J.Abad.length ? '⛔' : '✅'} (A)${label} ${J.A} ② kerb vertex(es) between two water edges · ${J.Aoff.length} off ①'s water edge${J.Aoff.length ? ` (e.g. ${at(J.Aoff)})` : ''} · ${J.Aunshared.length} on it but neither a ① vertex nor a stamp-shared one${J.Aunshared.length ? ` (e.g. ${at(J.Aunshared)})` : ''} · ${J.outside} water-run vertex(es) outside the disc (a rim tile's uncut ②; not judged)`)
  console.log(`  ${J.Bbad.length ? '⛔' : '✅'} (B)${label} ${J.B} ② kerb vertex(es) where a street meets the water · ${J.Bbad.length} off ①'s water edge past one rounding${J.Bbad.length ? ` (e.g. ${at(J.Bbad)})` : ''}`)
  console.log(`  ${J.Cbad.length ? '⛔' : '✅'} (C′)${label} ${J.Cn} ① coast vertex(es) on ②'s kerb line · ${J.Cbad.length} missing from ② as a vertex${J.Cbad.length ? ` (e.g. ${at(J.Cbad)})` : ''} · ${J.under} under a carriageway (not kerb; counted, not judged)`)
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
  if (say(judge(R.protoShapeTiles, C, R.luByClass, fp.boundaryRing), '')) red++
  { const J = rimJudge(R.protoShapeTiles, fp.boundaryRing); if (J.out.length || J.twice || J.unshared.length) red++
    console.log(`  ${J.out.length || J.twice || J.unshared.length ? '⛔' : '✅'} (R) at the rim: ${J.cells} ink-cell ring(s) · ${J.out.length} shore-cell vertex(es) outside the disc${J.out.length ? ` (e.g. ${J.out.slice(0, 3).map(p => `(${p.map(v => v.toFixed(3)).join(', ')})`).join(' · ')})` : ''} · ${J.twice} ring(s) carried by two tiles · (R3) ${J.rimV} cell vertex(es) on the rim, ${J.unshared.length} not the tile ring's${J.unshared.length ? ` (e.g. ${J.unshared.slice(0, 3).map(p => `(${p.map(v => v.toFixed(3)).join(', ')})`).join(' · ')})` : ''}`)
    for (const m of rimMutants) { let MM = null, refused = null; try { MM = quiet(() => buildProto(f, { tg: m.tg })) } catch (e) { refused = String(e.message).split('\n')[0].slice(0, 120) }
      const X = MM && rimJudge(MM.protoShapeTiles, fp.boundaryRing), seen = !!refused || (X && (X.out.length > J.out.length || X.twice > J.twice || X.unshared.length > J.unshared.length))
      if (seen) m.red++
      console.log(`  ${seen ? '✅' : '⚪'} rim mutant (${m.name}): ${refused ? `the producer refused (${refused}) — RED` : seen ? `RED — outside ${X.out.length} · twice ${X.twice} · unshared on the rim ${X.unshared.length}` : 'GREEN on this town (not exercised here)'}`) }
    // mutant: one rim tile's cells handed to a second tile, and one cell vertex pushed 1 m outside the disc
    const t0 = R.protoShapeTiles.findIndex(t => t.inkCells?.some(c => c.cls === 'shore')), t1 = R.protoShapeTiles.findIndex((t, i) => i !== t0)
    if (t0 >= 0 && fp.boundaryRing?.length) {
      // two separate mutations — one tile's cells handed to a second (carried twice), and a cell vertex 1 m past the rim (outside).
      // ⛔ Not both on one copy: the pushed vertex changed the ring's signature, so "carried twice" could never fire (slot 12)
      const twin = R.protoShapeTiles.map((t, i) => i === t1 ? { ...t, inkCells: R.protoShapeTiles[t0].inkCells } : t)
      const b = fp.boundaryRing, cx = b.reduce((u, q) => u + q[0], 0) / b.length, cz = b.reduce((u, q) => u + q[1], 0) / b.length, far = b.reduce((m, q) => Math.max(m, Math.hypot(q[0] - cx, q[1] - cz)), 0)
      const past = R.protoShapeTiles.map((t, i) => i !== t0 ? t : { ...t, inkCells: t.inkCells.map((c, j) => c.cls !== 'shore' || c !== t.inkCells.find(x => x.cls === 'shore') ? c : { ...c, rings: [[...c.rings[0], [cx + far + 1, cz]]] }) })
      const Mt = rimJudge(twin, b), Mp = rimJudge(past, b), M = { twice: Mt.twice, out: Mp.out }, ok = Mt.twice > J.twice && Mp.out.length > J.out.length
      if (!ok) red++
      console.log(`  ${ok ? '✅' : '⛔'} mutant (R): a tile's cells handed to a second tile, and a cell vertex 1 m past the rim → ${M.twice} carried twice, ${M.out.length} outside — ${ok ? 'RED as it must be' : '(R) is blind'}`) } }
  // in-process mutants on the town's own ②: a vertex inserted mid-way along one water edge, (i) 2 units off it, (ii) on it
  { const t = R.protoShapeTiles.find(t => (t.iaFull || []).some((r, si) => t.iaStamp?.[si]?.some((s, e) => t.runs?.[s]?.skelId === WATER_EDGE_SKEL && t.runs?.[t.iaStamp[si][(e - 1 + r.length) % r.length]]?.skelId === WATER_EDGE_SKEL)))
    if (!t) console.log('  ⚪ mutants (planted vertex): no ② water run to plant on — not judged')
    else { const si = t.iaFull.findIndex((r, si) => t.iaStamp?.[si]?.some((s, e) => t.runs?.[s]?.skelId === WATER_EDGE_SKEL && t.runs?.[t.iaStamp[si][(e - 1 + r.length) % r.length]]?.skelId === WATER_EDGE_SKEL))
      const r = t.iaFull[si], st = t.iaStamp[si], e = st.findIndex((s, e) => t.runs?.[s]?.skelId === WATER_EDGE_SKEL && t.runs?.[st[(e - 1 + r.length) % r.length]]?.skelId === WATER_EDGE_SKEL && Math.hypot(r[(e + 1) % r.length][0] - r[e][0], r[(e + 1) % r.length][1] - r[e][1]) > 10 / CLIP_SCALE)
      const plant = (off) => { const a = r[e], b = r[(e + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L
        const m = [(a[0] + b[0]) / 2 + nx * off / CLIP_SCALE, (a[1] + b[1]) / 2 + nz * off / CLIP_SCALE].map(v => Math.round(v * CLIP_SCALE) / CLIP_SCALE)
        const ring = [...r.slice(0, e + 1), m, ...r.slice(e + 1)], stamp = [...st.slice(0, e + 1), st[e], ...st.slice(e + 1)]
        return R.protoShapeTiles.map(x => x !== t ? x : { ...t, iaFull: t.iaFull.map((q, j) => j === si ? ring : q), iaStamp: t.iaStamp.map((q, j) => j === si ? stamp : q) }) }
      if (e < 0) console.log('  ⚪ mutants (planted vertex): no water edge long enough to plant on — not judged')
      else { const off = judge(plant(2), C, R.luByClass, fp.boundaryRing), on = judge(plant(0), C, R.luByClass, fp.boundaryRing), J0 = judge(R.protoShapeTiles, C, R.luByClass, fp.boundaryRing)
        const okOff = off.Aoff.length > J0.Aoff.length, okOn = on.Aunshared.length > J0.Aunshared.length
        if (!okOff || !okOn) red++
        console.log(`  ${okOff ? '✅' : '⛔'} mutant (a vertex 2 units off a ② water edge): ${okOff ? 'RED as off the line, as it must be' : 'not seen — (A) is blind off the line'}`)
        console.log(`  ${okOn ? '✅' : '⛔'} mutant (a vertex ON a ② water edge, shared by nothing): ${okOn ? 'RED as unshared, as it must be' : 'not seen — (A) is blind to an unshared vertex'}`)
        // (C′): one ① coast vertex deleted from ② (its two water edges merged) must read missing, never "under a carriageway"
        // a vertex INSIDE a run (its two neighbours ① coast vertices on water edges too): dropping a run's end moves the run's span
        const coastAt = (i) => { const n = r.length, j = (i + n) % n; return C.both.has(key(K(r[j]))) && t.runs?.[st[j]]?.skelId === WATER_EDGE_SKEL && t.runs?.[st[(j - 1 + n) % n]]?.skelId === WATER_EDGE_SKEL }
        const v = r.findIndex((_, i) => coastAt(i - 1) && coastAt(i) && coastAt(i + 1))
        if (v < 0) console.log('  ⚪ mutant (a ① coast vertex dropped from ②): none to drop on this ring — not judged')
        // ⛔ from EVERY tile ring that carries its key: a block's two rim pieces both carry its ② (Huron: v in tiles 0 and 1), so
        // dropped from one it stayed in the other and the mutant could not bite (the gate on 2de92999)
        else { const vk = key(K(r[v])), drop = (q, sq) => { const keep = q.map(p => key(K(p)) !== vk); return [q.filter((_, i) => keep[i]), sq.filter((_, i) => keep[i])] }
          const tiles2 = R.protoShapeTiles.map(x => !(x.iaFull || []).some(q => q.some(p => key(K(p)) === vk)) ? x : { ...x, iaFull: x.iaFull.map((q, j) => drop(q, x.iaStamp[j])[0]), iaStamp: x.iaStamp.map((sq, j) => drop(x.iaFull[j], sq)[1]) })
          const dr = judge(tiles2, C, R.luByClass, fp.boundaryRing), okD = dr.Cbad.length > J0.Cbad.length
          if (!okD) red++
          console.log(`  ${okD ? '✅' : '⛔'} mutant (a ① coast vertex dropped from ②): ${okD ? 'RED as missing, as it must be' : 'not seen — (C′) reads a dropped vertex as under a carriageway'}`) } } } }
  let M; try { M = quiet(() => buildProto(f, { tg: mutant })) } catch (e) { console.log(`  ✅ mutant (the coast clause removed): the producer refused (${String(e.message).split('\n')[0].slice(0, 120)}) — counted RED`); mutRed++; continue }
  const J = judge(M.protoShapeTiles, C, M.luByClass, fp.boundaryRing), bad = J.Abad.length + J.Bbad.length + J.Cbad.length
  if (bad) mutRed++
  console.log(`  ${bad ? '✅' : '⚪'} mutant (the coast clause of rSrc removed): ${bad ? `RED as it must be — (A) ${J.Abad.length} · (B) ${J.Bbad.length} · (C′) ${J.Cbad.length}` : 'GREEN here — no coast corner on this town takes a fillet without the clause'}`)
}
if (!towns) { console.log('\n⛔ no town with a coast in ① — nothing was checked'); red++ }
else if (!mutRed) { console.log('\n⛔ the mutant stayed GREEN on every town — the check cannot see a filleted coast'); red++ }
for (const m of rimMutants) if (towns && !m.red) { console.log(`\n⛔ rim mutant (${m.name}) stayed GREEN on every town — (R) cannot see it`); red++ }
console.log(red ? `\n⛔ ${red} RED` : '\n✅ along the water, ②\'s kerb is ①\'s coast line itself')
process.exit(red ? 1 : 0)
