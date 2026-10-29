#!/usr/bin/env node
// CLAIM — A WAY'S OWN TAG DECIDES BEFORE THE COAST (Jacob, 2026-10-27, `r-a-way-tag-decides-before-byCoast`; Boz's vocabulary).
// ① used to judge a street piece in its water by grade tags alone: off grade → a span, else a bridge "by the coast". PTown's
// Breakwater (way 170402219, embankment=dyke, no bridge tag) was painted as a bridge, and refused at bridgeOverlay far from its
// cause. Now each way over the water is read through ONE vocabulary (src/cartograph/streetClass.js#structureOverWater: offGrade ·
// deck · ground · none · unknown, over the structural keys man_made, embankment, ford), carried per run by
// cartograph/mintInputs.mjs#gradeRunsOf (each way's own extent where a run's ways disagree, Zob), and splitOverWater refuses by
// name a deck the take-out missed, ground (an embankment, held as land by the coast bake: r-the-coast-bake-holds-an-embankment-as-land), and an unknown structural value, BEFORE the coast.
//   (1) THE VOCABULARY, read from the source function: pier → deck · embankment=dyke → ground · bridge+pier → offGrade ·
//       ford=yes → unknown · man_made=breakwater → unknown · surface=stone → none.
//   (2) SOURCE: gradeRunsOf carries `structure` through structureOverWater, and splitOverWater judges it before byCoast.
//   (3) PLANTS on a channel a street crosses bank to bank (the one-line check's plant), each verdict from (1)'s function:
//       untagged → a byCoast span · pier → refuses as a DECK · embankment → refuses as GROUND · ford → refuses naming ford=yes ·
//       a JOINT run (a pier way's extent on land, the wet piece on the untagged way) → a byCoast span · the same joint with the
//       pier's extent reaching into the water → refuses as a straddle.
//   MUTANTS (always run): deck read as none (a bridge) → the pier plant is a span, RED · the unknown value read as none → the
//   ford plant is a span, RED · the straddle test removed → the straddle plant passes, RED · the structure judged by RUN, not by
//   each way's extent → the joint plant refuses, RED.
//   node checks/claims-a-way-tag-decides-before-the-coast.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2

// (1) the vocabulary
const vocab = (V) => { const k = (t) => { const v = V.structureOverWater(t); return v && typeof v === 'object' ? `unknown ${v.unknown}` : String(v) }
  return { pier: k({ man_made: 'pier' }), dyke: k({ embankment: 'dyke' }), bridgePier: k({ bridge: 'yes', man_made: 'pier' }), ford: k({ ford: 'yes' }), breakwater: k({ man_made: 'breakwater' }), stone: k({ surface: 'stone' }) } }
{ const v = vocab(await import('../src/cartograph/streetClass.js'))
  const ok = v.pier === 'deck' && v.dyke === 'ground' && v.bridgePier === 'offGrade' && v.ford === 'unknown ford=yes' && v.breakwater === 'unknown man_made=breakwater' && v.stone === 'null'
  row(ok, `(1) the vocabulary: ${Object.entries(v).map(([a, b]) => `${a} → ${b}`).join(' · ')}`) }

// (2) the source: read once in gradeRunsOf, judged before byCoast in splitOverWater
{ const mi = readFileSync(join(ROOT, 'cartograph/mintInputs.mjs'), 'utf8'), tg = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
  const iS = tg.indexOf('function splitOverWater('), iG = tg.indexOf("if (runs.some(r => !Array.isArray(r.structure)))", iS), iC = tg.indexOf("spans.push(span('byCoast'))", iS)
  const ok = (mi.match(/structureOverWater\(/g) || []).length === 1 && /structureExtents/.test(mi) && iS >= 0 && iG > iS && iC > iG
  row(ok, `(2) gradeRunsOf reads the vocabulary once (with each way's extent on a joint run), and splitOverWater judges it before byCoast: ${ok}`) }

// (3) the plants
const side = { pavementHW: 5, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk', parking: 2.4 }
const st = (id, pts, extra = {}) => ({ skelId: id, roadId: id, throughId: id, name: id, points: pts, highway: 'residential', class: 'local', lanes: 2, oneway: false,
  measure: { left: { ...side }, right: { ...side }, symmetric: true, source: 'seed' }, seed: { cornerR: 4.5, pavementHW: 5 },
  marks: { centre: { kind: 'none' }, edges: { kind: null } }, caps: { start: { cap: null, degree: 2 }, end: { cap: null, degree: 2 } }, gradeRuns: [], ...extra })
const B = 200, sq = [[60, -100], [140, -100], [140, -160], [60, -160]]
const disc = Array.from({ length: 64 }, (_, i) => [180 * Math.cos(i / 32 * Math.PI), 180 * Math.sin(i / 32 * Math.PI)])
const A0 = [-3.844, -6.968], A1 = [9.173, 16.773], u = [A1[0] - A0[0], A1[1] - A0[1]], uL = Math.hypot(...u), off = [-u[1] / uL * 30, u[0] / uL * 30]
const bank = (o) => { const a = [A0[0] + o[0], A0[1] + o[1]], t0 = (-B - a[1]) / u[1], t1 = (B - a[1]) / u[1]
  return [[a[0] + t0 * u[0], -B], a, [A1[0] + o[0], A1[1] + o[1]], [a[0] + t1 * u[0], B]].map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]) }
const near = bank([0, 0]), far = bank(off)
let channel = [...near, ...far.slice().reverse()]; if (sa(channel) < 0) channel = channel.reverse()
// the street crosses the channel bank to bank: its wet piece runs from s ≈ 36.5 m to s ≈ 66.7 m along its 87 m
const OVER = [[30.3, -20.1], [-40.7, 30.2]]
const mint = (tg, runs) => { try { const MP = quiet(() => tg.mintProtopolygon({ streets: [...sq.map((a, i) => st('s' + i, [a, sq[(i + 1) % 4]])), st('over', OVER, { caps: { start: { cap: 'round', degree: 1 }, end: { cap: 'round', degree: 1 } }, gradeRuns: runs })],
    bb: { x0: -B, x1: B, z0: -B, z1: B }, boundary: disc, coast: [channel], coastArcs: [near, far.slice().reverse()] })); return { spans: MP.offGradeSpans.filter(s => s.street === 'over').map(s => s.kind) } } catch (e) { return { why: String(e.message) } } }
const one = (v) => [{ from: 0, to: 1, ways: [1], structure: [v], offGrade: false, exact: true, by: 'exact' }]
const joint = (v, ext) => [{ from: 0, to: 1, ways: [1, 2], structure: [v, null], structureMixed: true, structureExtents: [{ way: 1, v, extent: ext }], offGrade: false, exact: true, by: 'exact' }]
const plants = (tg, V) => { const s = V.structureOverWater
  return { none: mint(tg, one(s({}))), pier: mint(tg, one(s({ man_made: 'pier' }))), dyke: mint(tg, one(s({ embankment: 'dyke' }))), ford: mint(tg, one(s({ ford: 'yes' }))),
    joint: mint(tg, joint(s({ man_made: 'pier' }), [0, 20])), straddle: mint(tg, joint(s({ man_made: 'pier' }), [0, 50])) } }
const said = (r) => r.why ? `refuses (${r.why.replace(/^\[①\] ⛔ /, '').slice(0, 90)})` : `mints, span(s) ${JSON.stringify(r.spans)}`
const judge = (P) => ({
  none: !P.none.why && P.none.spans.includes('byCoast'),
  pier: /is a DECK by its own tag/.test(P.pier.why || ''),
  dyke: /is GROUND \(an embankment\) by its own tag/.test(P.dyke.why || ''),
  ford: /ford=yes, outside the over-water vocabulary/.test(P.ford.why || ''),
  joint: !P.joint.why && P.joint.spans.includes('byCoast'),
  straddle: /straddles the end of way 1/.test(P.straddle.why || '') })
const TG = await import('../src/lib/tileGround.js'), VC = await import('../src/cartograph/streetClass.js')
{ const P = plants(TG, VC), J = judge(P)
  row(J.none, `(3) untagged, bank to bank: ${said(P.none)}`)
  row(J.pier, `(3) a pier way the take-out missed: ${said(P.pier)}`)
  row(J.dyke, `(3) an embankment over the water: ${said(P.dyke)}`)
  row(J.ford, `(3) a ford: ${said(P.ford)}`)
  row(J.joint, `(3) a joint run, the pier way's extent on land and the wet piece on the untagged way: ${said(P.joint)}`)
  row(J.straddle, `(3) the same joint, the pier's extent reaching into the water: ${said(P.straddle)}`) }

// MUTANTS: each a modified copy in its own temp dir, its imports pointed at the live tree
const verdict = (name, J, P, k, what) => row(!J[k], `mutant: ${name} → ${what}: ${said(P[k])} — ${!J[k] ? 'RED as it must be' : 'the row proves nothing'}`)
{ const src1 = readFileSync(join(ROOT, 'src/cartograph/streetClass.js'), 'utf8'), ANCHOR1 = "if (has('man_made') && DECK_KINDS.includes(t.man_made)) return 'deck'"
  if (src1.split(ANCHOR1).length !== 2) row(false, 'mutant (deck read as none): the anchor is not in streetClass.js once — re-aim it')
  else { const dir1 = mkdtempSync(join(tmpdir(), 'waytag-deck-'))
    try { writeFileSync(join(dir1, 'streetClass.js'), src1.replace(ANCHOR1, "if (has('man_made') && DECK_KINDS.includes(t.man_made)) return null").replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(ROOT, 'src/cartograph', r)).href}"`).replace(/from 'clipper-lib'/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M1 = await import(pathToFileURL(join(dir1, 'streetClass.js')).href), P = plants(TG, M1); verdict('deck read as none (a bridge)', judge(P), P, 'pier', 'the pier plant')
    } finally { rmSync(dir1, { recursive: true, force: true }) } } }
{ const src2 = readFileSync(join(ROOT, 'src/cartograph/streetClass.js'), 'utf8'), ANCHOR2 = "for (const k of ['man_made', 'ford']) if (has(k)) return { unknown: `${k}=${t[k]}` }"
  if (src2.split(ANCHOR2).length !== 2) row(false, 'mutant (the unknown value read as none): the anchor is not in streetClass.js once — re-aim it')
  else { const dir2 = mkdtempSync(join(tmpdir(), 'waytag-unknown-'))
    try { writeFileSync(join(dir2, 'streetClass.js'), src2.replace(ANCHOR2, '').replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(ROOT, 'src/cartograph', r)).href}"`).replace(/from 'clipper-lib'/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M2 = await import(pathToFileURL(join(dir2, 'streetClass.js')).href), P = plants(TG, M2); verdict('the unknown value read as none', judge(P), P, 'ford', 'the ford plant')
    } finally { rmSync(dir2, { recursive: true, force: true }) } } }
{ const src3 = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8'), ANCHOR3 = 'if (!(x.extent[0] <= lo + 1e-9 && hi <= x.extent[1] + 1e-9)) throw'
  if (src3.split(ANCHOR3).length !== 2) row(false, 'mutant (the straddle test removed): the anchor is not in tileGround.js once — re-aim it')
  else { const dir3 = mkdtempSync(join(tmpdir(), 'waytag-straddle-'))
    try { writeFileSync(join(dir3, 'tileGround.js'), src3.replace(ANCHOR3, 'if (false) throw').replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(ROOT, 'src/lib', r)).href}"`).replace(/from 'clipper-lib'/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M3 = await import(pathToFileURL(join(dir3, 'tileGround.js')).href), P = plants(M3, VC); verdict('the straddle test removed', judge(P), P, 'straddle', 'the straddle plant')
    } finally { rmSync(dir3, { recursive: true, force: true }) } } }
{ const src4 = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8'), ANCHOR4 = 'if (!r.structureMixed) return r.structure.length'
  if (src4.split(ANCHOR4).length !== 2) row(false, 'mutant (the structure judged by run): the anchor is not in tileGround.js once — re-aim it')
  else { const dir4 = mkdtempSync(join(tmpdir(), 'waytag-byrun-'))
    try { writeFileSync(join(dir4, 'tileGround.js'), src4.replace(ANCHOR4, 'if (true) return r.structure.length').replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(ROOT, 'src/lib', r)).href}"`).replace(/from 'clipper-lib'/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M4 = await import(pathToFileURL(join(dir4, 'tileGround.js')).href), P = plants(M4, VC); verdict('the structure judged by RUN', judge(P), P, 'joint', 'the joint plant')
    } finally { rmSync(dir4, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : "\n✅ a way's own tag decides before the coast")
process.exit(red ? 1 : 0)
