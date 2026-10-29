#!/usr/bin/env node
// CLAIM — A COAST FEATURE FINER THAN ITS TRACE IS NOT DRAWN (Boz's ruling, 2026-10-27, on Zob's read of PTown's spit). The lidar is
// traced at its own pixel (`fineM`), so a spike or a gap narrower than one cell is not something it resolved. PTown's coast carried
// a 6 cm × 2.6 m spike at a 0.999 m step: ① minted it as a needle whose tip read the bare water ring (wIdx) between two coast-ink
// edges, and ② could neither stamp it (two owners at one retrace) nor shore it (the stamp cut 23 mm of coast out of iaFull that iA
// kept). The fix is at the INPUT, by the decks' own rule: bake-coast opens then closes the traced water at the step
// (`structures.mjs#openCloseAtStep`, the one method the decks also call), before simplify and settle. Two guards ride with it:
// ②'s run key holds one water as ONE run, side-blind (a deck's water its own), and the stamp refuses, at its cause, an antenna
// that drops a water run's tip that iA keeps.
//   (1) SOURCE: bake-coast opens and closes the traced water through openCloseAtStep, before simplifyRing and settleOnSource;
//       deckFootprints calls the same function; the erode/dilate is written once (openClose.mjs#morph), and no clipper
//       erode/dilate is left beside it (structures, bake-coast, coastFile, mintInputs).
//   (2) PLANT: PTown's own coast at the spit (water ring 0, vertices 1100–1159, less (−3600, −1270); the arc run to the frame),
//       opened and closed at PTown's step and simplified below half of it, as the bake does: ① mints no bare water edge, and the ground (mint, stamp, shore, the whole pass)
//       BUILDS, with the water as ONE run per tile, side null.
//   MUTANTS (always run):
//   · the open/close removed (openCloseAtStep keeps the water as traced) → ① mints the bare edge, and the stamp's water guard
//     REFUSES at the tip;
//   · that guard removed too → the refusal leaves the stamp (it moves downstream, away from its cause);
//   · and the side put back in the water key → the stamp refuses at the RETRACE (two owners), PTown's bake of 03d836b7.
//   node checks/claims-a-coast-finer-than-its-trace-is-not-drawn.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2

// (1) the source
{ const bc = readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8'), stx = readFileSync(join(ROOT, 'cartograph/structures.mjs'), 'utf8')
  const at = (s, t) => s.indexOf(t), calls = bc.split('openCloseAtStep(traced, fine').length - 1
  const order = calls === 1 && at(bc, 'openCloseAtStep(traced, fine') < at(bc, 'simplifyRing(bd.outer') && at(bc, 'openCloseAtStep(traced, fine') < at(bc, 'settleOnSource(simple')
  // the water is the open/close's output: through the embankments' exact cut and the run along their rings (bake-coast.mjs#runsAlongHeld), nothing else
  const water = /const opened2 = clip\(ClipType\.ctIntersection, clip\(ClipType\.ctUnion, oc\.paths[\s\S]*?const water0 = [^\n]*opened2[\s\S]*?const water = along \? along\.rings\.map\(toPath\) : water0/.test(bc)
  const deck = /export function deckFootprints[\s\S]*?openCloseAtStep\(paths, stepM/.test(stx)
  const oc = readFileSync(join(ROOT, 'cartograph/openClose.mjs'), 'utf8'), erode = oc.split('export function morph(').length - 1
  const elsewhere = ['structures.mjs', 'bake-coast.mjs', 'coastFile.mjs', 'mintInputs.mjs'].filter(f => { try { return /off\(off\(|grow\(grow\(/.test(readFileSync(join(ROOT, 'cartograph', f), 'utf8')) } catch { return false } })
  row(order && water && deck && erode === 1 && !elsewhere.length, `(1) bake-coast opens and closes the traced water through openCloseAtStep (${calls} call), before simplify and settle: ${order} · the water is its output: ${water} · deckFootprints calls the same function: ${deck} · the erode/dilate written once (openClose.mjs#morph ${erode} of 1, none beside it${elsewhere.length ? `; ALSO in ${elsewhere.join(', ')}` : ''})`) }

// (2) the plant: PTown's spit, translated; the water lies left of the coast, the arc run out to the frame at both ends
const T = [[-126.165,-58.281],[-124.995,-57.218],[-120.776,-57.428],[-117.779,-56.529],[-115.78,-57.121],[-112.783,-56.352],[-99.317,-49.287],[-91.786,-42.849],[-86.248,-41.313],[-82.819,-38.208],[-73.658,-36.314],[-68.823,-33.115],[-65.824,-32.405],[-59.844,-26.463],[-53.835,-23.701],[-48.855,-23.721],[-44.386,-22.35],[-41.842,-20.318],[-43.281,-19.321],[-37.296,-19.373],[-26.848,-10.909],[-23.867,-6.771],[-16.881,-6.798],[-12.915,-4.466],[-9.84,-5.358],[-6.893,-3.411],[-4.4,-0.247],[2.132,1.006],[1.932,6.34],[4.562,6.24],[1.095,6.45],[-3.915,4.038],[-6.226,1.707],[-6.913,-0.704],[-13.878,2.449],[-20.789,2.282],[-30.902,-5.51],[-37.871,-8.564],[-40.871,-8.823],[-44.875,-11.655],[-49.64,-13.298],[-52.226,-15.139],[-51.048,-16.324],[-51.8,-16.911],[-56.756,-18.164],[-66.528,-23.294],[-69.118,-23.945],[-68.398,-22.382],[-62.083,-19.345],[-61.013,-16.301],[-57.755,-12.286],[-52.846,-11.957],[-40.872,-7.34],[-39.871,-5.817],[-30.441,-1.387],[-27.631,1.653],[-23.799,3.365],[-23.809,4.489],[-27.05,4.692],[-27.99,4.12]]
const TIP = [4.562, 6.24], FINE = 0.9987867588490528            // PTown's coast.json fineM, the step its coast was traced at
const B = 200, square = [[-B, -B], [B, -B], [B, B], [-B, B]]
const side = { pavementHW: 5, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk', parking: 2.4 }
const st = (id, pts) => ({ skelId: id, roadId: id, throughId: id, name: id, points: pts, highway: 'residential', class: 'local', lanes: 2, oneway: false,
  measure: { left: { ...side }, right: { ...side }, symmetric: true, source: 'seed' }, seed: { cornerR: 4.5, pavementHW: 5 },
  marks: { centre: { kind: 'none' }, edges: { kind: null } }, caps: { start: { cap: null, degree: 2 }, end: { cap: null, degree: 2 } } })
const sq = [[60, -100], [140, -100], [140, -160], [60, -160]], streets = sq.map((a, i) => st('s' + i, [a, sq[(i + 1) % 4]]))
const disc = Array.from({ length: 64 }, (_, i) => [180 * Math.cos(i / 32 * Math.PI), 180 * Math.sin(i / 32 * Math.PI)])
const evidence = [{ lu: 'beach', src: 'osm', tag: 'natural:sand', rings: [[[-40, -40], [-20, -40], [-20, -20], [-40, -20], [-40, -40]]] }]
const { MARKING_LOOK } = await import('../src/cartograph/streetMarkings.js')
const { default: CL } = await import('clipper-lib'), SC = 1000
const P = (r) => r.map(([x, z]) => ({ X: Math.round(x * SC), Y: Math.round(z * SC) }))
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
function plant(tg, stx) {
  const arc = [[-B, T[0][1]], ...T, [T[T.length - 1][0], B]]
  const traced = [...arc, [-B, B]]; if (sa(traced) <= 0) throw new Error('plant: the water must lie left of the coast')
  const oc = stx.openCloseAtStep([P(traced)], FINE, 'the plant\'s water')
  const c = new CL.Clipper(), o = new CL.Paths(); c.AddPaths(oc.paths, CL.PolyType.ptSubject, true); c.AddPath(P(square), CL.PolyType.ptClip, true)
  c.Execute(CL.ClipType.ctIntersection, o, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero)
  if (o.length !== 1) throw new Error(`plant: the water is ${o.length} rings after its open/close`)
  // then simplified below half the step, as bake-coast does next (bake-coast.mjs#simplifyRing); settle reads the lidar and is not planted
  let water = simplifyRing(o[0].map(v => [v.X / SC, v.Y / SC]), { x0: -B, x1: B, z0: -B, z1: B }, FINE / 2).map(q => [+q[0].toFixed(3), +q[1].toFixed(3)]); if (sa(water) < 0) water.reverse()
  const k = water.findIndex(p => p[0] === -B && p[1] === B), n = water.length, coastArc = Array.from({ length: n - 1 }, (_, i) => water[(k + 1 + i) % n])
  let MP = null, R = null, why = null
  try { quiet(() => { MP = tg.mintProtopolygon({ streets, bb: { x0: -B, x1: B, z0: -B, z1: B }, boundary: disc, coast: [water], coastArcs: [coastArc] })
    R = tg.buildTileGround({ streets, markingLook: MARKING_LOOK, protopolygon: MP, landEvidence: evidence }, { smooth: 0, curbWidth: 0.15, curbedMinWidth: { m: 0.3 }, stencil: disc }) }) } catch (e) { why = String(e.message) }
  const bare = MP ? MP.blocks.reduce((t, b, i) => t + [MP.blockLabels[i], ...(MP.blockHoleLabels[i] || [])].flat().filter(l => MP.owners[l]?.water && MP.owners[l].srcIdx === -1).length, 0) : null
  // the water runs, and any two consecutive edges of one ring stamped to two water runs of one deck
  let runs = new Set(), sides = new Set(), split = 0
  for (const [ti, t] of (R?.protoShapeTiles || []).entries()) (t.iaStamp || []).forEach(s => (s || []).forEach((x, e) => { const a = t.runs?.[x], b = t.runs?.[s[(e + 1) % s.length]]
    if (a?.skelId === '__water__') { runs.add(ti + ':' + x); sides.add(String(a.side)) }
    if (a?.skelId === '__water__' && b?.skelId === '__water__' && x !== s[(e + 1) % s.length] && (a.deck ?? null) === (b.deck ?? null)) split++ }))
  return { why, bare, runs: runs.size, sides: [...sides], split, opened: oc.openedPieces.features }
}
const tg = await import('../src/lib/tileGround.js'), stx = await import('../cartograph/structures.mjs'), { simplifyRing } = await import('../cartograph/bake-coast.mjs')
{ const p = plant(tg, stx), tip = p.opened.find(o => o.lenM > 2)
  row(!p.why && p.bare === 0 && p.runs >= 1 && p.split === 0 && p.sides.every(s => s === 'null') && !!tip,
    `(2) PTown's spit, opened and closed at its step (${p.opened.length} piece(s) taken, the spike ${tip ? `${tip.m2} m² × ${tip.lenM} m` : 'NOT among them'}): ① mints ${p.bare} bare water edge(s) · the ground ${p.why ? `REFUSED (${p.why.slice(0, 140)})` : `BUILDS, the water ${p.runs} run(s), side ${p.sides.join('/')}, ${p.split} split(s)`}`) }

// the mutants: a module copied into its own temp dir with one anchor replaced, its relative imports pointed at the live tree
function mutant(rel, edits) {
  let src = readFileSync(join(ROOT, rel), 'utf8')
  for (const [a, b] of edits) { if (src.split(a).length !== 2) return { err: `the anchor is not in ${rel} once — re-aim it: ${a.slice(0, 60)}` }; src = src.replace(a, b) }
  const dir = mkdtempSync(join(tmpdir(), 'coastfine-')), base = join(ROOT, rel, '..')
  src = src.replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(base, r)).href}"`).replace(/from 'clipper-lib'/g, `from "${import.meta.resolve('clipper-lib')}"`)
  writeFileSync(join(dir, rel.split('/').pop()), src); return { dir, file: join(dir, rel.split('/').pop()) }
}
const NO_OPEN = ['  return { paths: kept, opened,', '  return { paths, opened,']
const NO_GUARD = ['if ((wetEdge(x.ri, q) || wetEdge(x.ri, (q - 1 + m) % m)) && kept.has(K)) throw', 'if (false) throw']
const SIDED = ['const key = !o ? null : isWater ? `${WATER_EDGE_SKEL}${', 'const key = !o ? null : isWater ? `${WATER_EDGE_SKEL}|${o.side}${']
async function withMutants(stxEdits, tgEdits, f) {
  const a = stxEdits ? mutant('cartograph/structures.mjs', stxEdits) : null, b = tgEdits ? mutant('src/lib/tileGround.js', tgEdits) : null
  try { if (a?.err || b?.err) return f(null, null, a?.err || b?.err)
    return f(a ? await import(pathToFileURL(a.file).href) : stx, b ? await import(pathToFileURL(b.file).href) : tg) }
  finally { for (const m of [a, b]) if (m?.dir) rmSync(m.dir, { recursive: true, force: true }) }
}
const atTip = (why) => why && why.includes(`(${TIP.join(', ')})`)
await withMutants([NO_OPEN], null, (S, G, err) => { if (err) return row(false, `mutant (open/close removed): ${err}`)
  const p = plant(G, S), ok = p.bare >= 1 && /the noding removed an antenna through .* on a WATER run, and the block \(iA\) keeps that point/.test(p.why || '') && atTip(p.why)
  row(ok, `mutant: the open/close removed → ① mints ${p.bare} bare water edge(s); ${p.why ? (ok ? 'the stamp REFUSES at the tip by its water guard, RED as it must be' : `refused, not by the water guard at the tip (${p.why.slice(0, 140)})`) : 'BUILT — the plant proves nothing'}`) })
await withMutants([NO_OPEN], [NO_GUARD], (S, G, err) => { if (err) return row(false, `mutant (the guard removed): ${err}`)
  const p = plant(G, S), ok = !!p.why && !/\[tileGround\]\[stamp\]/.test(p.why)
  row(ok, `mutant: and the stamp's water guard removed → ${p.why ? (ok ? `the refusal leaves the stamp, downstream of its cause (${p.why.slice(0, 90)}…), RED` : `still refused at the stamp (${p.why.slice(0, 120)})`) : 'BUILT — the guard is not what refuses'}`) })
await withMutants([NO_OPEN], [NO_GUARD, SIDED], (S, G, err) => { if (err) return row(false, `mutant (the side in the key): ${err}`)
  const p = plant(G, S), ok = /two owners at one retrace/.test(p.why || '')
  row(ok, `mutant: and the side put back in the water key → ${p.why ? (ok ? 'the stamp refuses at the RETRACE (two owners), RED as it must be' : `refused, not at the retrace (${p.why.slice(0, 120)})`) : 'BUILT — the key is not what splits the run'}`) })
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ a coast finer than its trace is not drawn')
process.exit(red ? 1 : 0)
