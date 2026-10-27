#!/usr/bin/env node
// CLAIM — AN OFF-GRADE SPAN OVER ①'S WATER IS NOT GROUND: a bridge is above the water, a tunnel below it, and neither is
// street-on-water (Boz's ruling B, Zob's read, 2026-10-27). `tileGround.js#splitOverWater` leaves such a span out of the street
// ink; the bank pieces end ON the coast, sharing the crossing; every vertex keeps its original index. It reads the grade off
// `gradeRuns` (cartograph/mintInputs.mjs: the skeleton's segmentWays, by streetClass.js#isOffGradeWay, mapped by anchorAt).
//   (1) PLANTED: a street running into a lake on ONE exactly attributed off-grade run — the mint mints, and no ink owned by
//       that street lies in the water past the coast's own stroke (2ε of the shoreline).
//   (2) the same street with its run AT GRADE leaves the ink too — OFF GRADE BY THE COAST (Jacob, 2026-10-27: "a") — and is
//       RECORDED, never silent: protopolygon.offGradeSpans carries it as { street, segOrd, kind: 'byCoast', hwy, wetM, points }
//       (every dropped span is recorded there, a tagged one as kind 'tagged').
//   (3) the same street with its off-grade run attributed BY ORDER REFUSES by name ("only an exactly attributed run decides").
//   (5) a segment whose ways DISAGREE on grade (a bridge way and its at-grade approach, simplified across the joint): the wet
//       piece is a TAGGED bridge — dropped, no off-grade-by-the-coast record — when it lies within the off-grade way's own extent
//       along the segment (`offExtents`), and REFUSES by name when it reaches past it (Zob, 2026-10-27: cleveland-road-east-2).
//   (6) PLANTED (Jacob, 2026-10-27: "b for now, deck later"): a non-highway bridge across an inlet with OBLIQUE banks. ① records
//       the span by identity (kind 'tagged', its centreline bank to bank) and its ink stays out of the water (the water face whole:
//       the ink in the water is the coast's own stroke, no more); `tileGround.js#bridgeOverlay` paints it across the water at the
//       street's measure, exactly the street's strip between the two banks (symmetric difference with that strip ≈ 0).
//   (7) PLANTED (Boz's ruling (iv)): a HIGHWAY bridge (grade-separated motorway) across the same inlet: ① records its span with
//       `hwy`, and `tileGround.js#highwayBridges` moves H ∩ the water holding that span out of the highway's paint into the
//       bridge's — the bridge is exactly H's strip between the banks, the highway left has nothing over the water, and the two
//       together are H (they meet on the coast). MUTANT: no split (the highway keeps its span over the water) reads RED.
//   (8) PLANTED (Boz, 2026-10-27: "a street that stays in the water silently is a Layer 0 defect"): the inlet's street crossing
//       the coast EXACTLY at a vertex — (a) a coast-arc vertex lying on the street, (b) a street vertex lying on the coast, (c) a
//       vertex both share (Zob's third form). Each is a crossing: the span is recorded and the street's ink leaves the water.
//       MUTANTS: the crossings read off the minted points alone (a, c) and a street's own vertex never marked a crossing (b)
//       each leave the street in the water — RED.
//   (4) over LAND nothing changes: the same street, its run off grade, with no water → the same ink as with no grade runs.
//   MUTANTS (6): the overlay disabled (a gap over the water) and the overlay not run on past the banks (butt ends at the crossing
//   vertices leave a triangle of water at each oblique bank) must each read RED.
//   MUTANT (always run): the mint copied with the split bypassed puts (1)'s street ink in the water — or (1) proves nothing.
//   node checks/claims-a-bridge-over-water-is-not-ground.mjs
import { mintProtopolygon, INK_EPS, bridgeOverlay, highwayBridges, differenceRings } from '../src/lib/tileGround.js'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const wind = (r, sign) => (Math.sign(sa(r)) === sign ? r : [...r].reverse())
const st = (id, pts, runs) => ({ skelId: id, name: id, points: pts, highway: 'residential', caps: { start: { degree: 1 }, end: { degree: 1 } }, ...(runs && { gradeRuns: runs }) })
const arc = [[-200, -100], [0, -104], [200, -100]]
const lake = wind([...arc, [200, -200], [-200, -200]], 1)
const boundary = Array.from({ length: 48 }, (_, i) => [190 * Math.cos(i / 48 * 2 * Math.PI), 190 * Math.sin(i / 48 * 2 * Math.PI)])
const bb = { x0: -200, x1: 200, z0: -200, z1: 200 }
const run = (over) => [{ from: 0, to: 1, ways: [1], offGrade: true, exact: true, by: 'exact', ...over }]
const streets = (runs) => { const s = [st('a', [[-100, 0], [-100, -150]], runs), st('b', [[100, 0], [100, -60]], [{ from: 0, to: 1, ways: [2], offGrade: false, exact: true, by: 'exact' }]),
  st('c', [[-150, 0], [-100, 0], [100, 0], [150, 0]], [{ from: 0, to: 3, ways: [3], offGrade: false, exact: true, by: 'exact' }])]
  s[0].caps.start.degree = 3; s[1].caps.start.degree = 3; return s }
const mint = (S, water = true) => quiet(() => mintProtopolygon({ streets: S, boundary, bb, ...(water ? { coast: [lake], coastArcs: [arc] } : {}) }))
// ink owned by street 'a' in the water past the coast's own stroke: a vertex of an ① ink ring labelled 'a' with z below the shore − 2ε
const shoreZ = (x) => -100 - 4 * (1 - Math.abs(x) / 200)
const wetInkOf = (MP, id) => { let n = 0; MP.rings.forEach((r, ri) => r.forEach((p, k) => { const o = MP.owners[MP.labels[ri][k]]; if (o?.skelId === id && p[1] < shoreZ(p[0]) - 2 * INK_EPS - 1e-6) n++ })); return n }
const refusal = (f) => { try { f(); return null } catch (e) { return String(e.message) } }

{ let MP = null; const r = refusal(() => { MP = mint(streets(run({}))) })
  row(!r && MP && wetInkOf(MP, 'a') === 0, `(1) an exact off-grade run into the lake: ${r ? `REFUSED (${r.slice(0, 120)})` : `minted, ${wetInkOf(MP, 'a')} vertex(es) of 'a''s ink in the water`}`) }
{ let MP = null; const r = refusal(() => { MP = mint(streets(run({ offGrade: false }))) })
  const rec = (MP?.offGradeSpans || []).filter(e => e.kind === 'byCoast')
  row(!r && wetInkOf(MP, 'a') === 0 && rec.length === 1 && rec[0].street === 'a' && rec[0].wetM > 0, `(2) the same run AT GRADE: ${r ? `REFUSED (${r.slice(0, 100)})` : `minted, ${wetInkOf(MP, 'a')} ink vertex(es) in the water, ${rec.length} off-grade-by-the-coast record(s)${rec[0] ? ` (${rec[0].street}|${rec[0].segOrd}, ${rec[0].wetM} m)` : ''}`}`) }
{ const r = refusal(() => mint(streets(run({ exact: false, by: 'order' }))))
  row(!!r && /only an exactly attributed run/.test(r), `(3) the off-grade run attributed BY ORDER: ${r ? (/exactly attributed/.test(r) ? 'REFUSED by name' : `refused otherwise (${r.slice(0, 100)})`) : 'MINTED — an inferred attribution decided a drop'}`) }
{ const mixed = (ext) => [{ from: 0, to: 1, ways: [1, 2], offGrade: false, mixed: true, offExtents: [ext], exact: true, by: 'exact' }]
  let MP = null; const r = refusal(() => { MP = mint(streets(mixed([0, 150]))) })
  const kinds = (MP?.offGradeSpans || []).map(e => e.kind).join(',')
  row(!r && wetInkOf(MP, 'a') === 0 && kinds === 'tagged', `(5a) a mixed-grade segment whose off-grade way spans the wet piece: ${r ? `REFUSED (${r.slice(0, 100)})` : `dropped as a TAGGED bridge, recorded as [${kinds}]`}`)
  const r2 = refusal(() => mint(streets(mixed([0, 120]))))
  row(!!r2 && /past the off-grade way's own extent/.test(r2), `(5b) the off-grade way stops 30 m short of the wet piece's end: ${r2 ? (/past the off-grade way/.test(r2) ? 'REFUSED by name' : `refused otherwise (${r2.slice(0, 100)})`) : 'MINTED — a wet piece past the bridge way was dropped silently'}`) }
{ const A = mint(streets(run({})), false), B = mint(streets(undefined).map(s => ({ ...s, gradeRuns: undefined })), false)
  const same = A.rings.length === B.rings.length && A.rings.every((r, i) => r.length === B.rings[i].length && r.every((p, k) => p[0] === B.rings[i][k][0] && p[1] === B.rings[i][k][1]))
  row(same, `(4) over land, the off-grade run changes nothing: ${A.rings.length} ink ring(s) either way, vertex for vertex ${same ? 'the same' : 'DIFFERENT'}`) }
// (6) a bridge across an inlet with OBLIQUE banks (x = −60 + 50(z + 100)/160 and 20 + 50(z + 100)/160), the street at z = 0, 4 m a side
const inletArc = [[-200, -100], [-60, -100], [-10, 60], [25, 64], [70, 60], [20, -100], [200, -100]]
const inlet = wind([...inletArc, [200, -200], [-200, -200]], 1)
const xl = (z) => -60 + 50 * (z + 100) / 160, xr = (z) => 20 + 50 * (z + 100) / 160
const strip = [[xl(-4), -4], [xr(-4), -4], [xr(4), 4], [xl(4), 4]]          // the street's strip between the banks: the bridge, exactly
const inletStreets = () => { const s = [st('p', [[-150, 0], [-150, 120]], [{ from: 0, to: 1, ways: [1], offGrade: false, exact: true, by: 'exact' }]),
  st('q', [[150, 0], [150, 120]], [{ from: 0, to: 1, ways: [2], offGrade: false, exact: true, by: 'exact' }]),
  st('r', [[-150, 0], [150, 0]], [{ from: 0, to: 1, ways: [3], offGrade: true, exact: true, by: 'exact' }])]
  s[0].caps.start.degree = 2; s[1].caps.start.degree = 2; return s }
const absA = (rs) => Math.abs(rs.reduce((t, r) => t + sa(r), 0))
const symDiff = (rs) => absA(differenceRings(rs, [strip])) + absA(differenceRings([strip], rs))
const MPi = quiet(() => mintProtopolygon({ streets: inletStreets(), boundary, bb, coast: [inlet], coastArcs: [inletArc] }))
const SP = MPi.offGradeSpans || [], arcLen = inletArc.reduce((t, p, k) => k ? t + Math.hypot(p[0] - inletArc[k - 1][0], p[1] - inletArc[k - 1][1]) : 0, 0)
const inkInWater = absA(MPi.rings.length ? [inlet].map(r => r) : []) - absA(differenceRings([inlet], MPi.rings))
const bridgeOf = (fn) => { try { const B = quiet(() => fn(SP, MPi.waterRings, () => 4)); return B.length ? B[0].rings : [] } catch (e) { return String(e.message) } }
{ const B = bridgeOf(bridgeOverlay), d = typeof B === 'string' ? null : symDiff(B)
  row(SP.length === 1 && SP[0].street === 'r' && SP[0].kind === 'tagged' && SP[0].hwy === false && SP[0].points.length >= 2 && inkInWater <= INK_EPS * arcLen * 1.01 + 1e-6 && d != null && d < 1e-3,
    `(6) a bridge across an inlet with oblique banks: ① records ${SP.map(e => `${e.street}|${e.segOrd} ${e.kind}${e.hwy ? ' (H)' : ''} ${e.wetM} m`).join(' · ') || 'NO span'}; the ink in the water ${inkInWater.toFixed(3)} m² (the coast's own stroke ≤ ${(INK_EPS * arcLen).toFixed(3)}); the overlay ${d == null ? `REFUSES (${String(B).slice(0, 100)})` : `differs from the street's strip bank to bank by ${d.toFixed(4)} m² of ${absA([strip]).toFixed(0)}`}`) }
{ const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8'), A = "const split = splitOverWater([...streets.map((st, ci) => ({ st, ci })), ...gradeSep.map(st => ({ st, ci: -1 }))], coast, coastChains, segOrdAt, (x) => x.ci < 0 && HWY_CLASS.has(x.st?.highway))"
  if (src.split(A).length !== 2) row(false, 'mutant: the split call is not in tileGround.js once — re-aim the anchor')
  else { const dir = mkdtempSync(join(tmpdir(), 'bridge-')), LIB = join(ROOT, 'src/lib')
    try { writeFileSync(join(dir, 'tileGround.js'), src.replace(A, "const split = { chains: [...streets.map((st, ci) => ({ st, ci })), ...gradeSep.map(st => ({ st, ci: -1 }))], coastChains, spans: [] }")
        .replace(/from \x27(\.{1,2}\/[^\x27]+)\x27/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`).replace(/from \x27clipper-lib\x27/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M = await import(pathToFileURL(join(dir, 'tileGround.js')).href)
      let MP = null; const r = refusal(() => { MP = quiet(() => M.mintProtopolygon({ streets: streets(run({})), boundary, bb, coast: [lake], coastArcs: [arc] })) })
      const n = MP ? wetInkOf(MP, 'a') : 0
      row(!!r || n > 0, `mutant: without the split, the street ${r ? `makes the mint refuse (${r.slice(0, 90)})` : `has ${n} ink vertex(es) in the water`} — RED as it must be`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
// (7) a grade-separated motorway at z = 30 across the inlet, H its strip 6 m a side
const Hm = [[-150, 24], [150, 24], [150, 36], [-150, 36]], Hstrip = [[xl(24), 24], [xr(24), 24], [xr(36), 36], [xl(36), 36]]
const hwyGs = { ...st('m', [[-150, 30], [150, 30]], [{ from: 0, to: 1, ways: [4], offGrade: true, exact: true, by: 'exact' }]), highway: 'motorway', gradeSeparated: true }
const MPh = quiet(() => mintProtopolygon({ streets: inletStreets(), gradeSep: [hwyGs], boundary, bb, coast: [inlet], coastArcs: [inletArc] }))
const SPh = (MPh.offGradeSpans || []).filter(e => e.street === 'm')
const splitH = (fn) => { try { const B = fn(MPh.offGradeSpans, [Hm], MPh.waterRings).flatMap(b => b.rings); return { B, rest: B.length ? differenceRings([Hm], B) : [Hm] } } catch (e) { return String(e.message) } }
const judgeH = (R) => typeof R === 'string' ? null : { d: absA(differenceRings(R.B, [Hstrip])) + absA(differenceRings([Hstrip], R.B)),
  wet: absA(R.rest) - absA(differenceRings(R.rest, [inlet])), sum: absA(R.rest) + absA(R.B) - absA([Hm]) }
{ const R = splitH(highwayBridges), J = judgeH(R)
  row(SPh.length === 1 && SPh[0].hwy === true && J && J.d < 1e-3 && Math.abs(J.wet) < 1e-3 && Math.abs(J.sum) < 1e-3,
    `(7) a highway bridge across the inlet: ① records ${SPh.map(e => `${e.street}|${e.segOrd} ${e.kind}${e.hwy ? ' (H)' : ''}`).join(' · ') || 'NO span'}; ${J ? `the bridge differs from H's strip between the banks by ${J.d.toFixed(4)} m², the highway left has ${J.wet.toFixed(4)} m² over the water, together they are H ± ${J.sum.toFixed(4)} m²` : `REFUSES (${String(R).slice(0, 100)})`}`) }
// (8) the crossing AT a vertex: (a) the banks carry a vertex exactly on the street (z = 0); (b) the street carries one exactly on each bank
const arcOnStreet = [...inletArc.slice(0, 2), [xl(0), 0], ...inletArc.slice(2, 5), [xr(0), 0], ...inletArc.slice(5)]
const waterOnStreet = wind([...arcOnStreet, [200, -200], [-200, -200]], 1)
const streetOnArc = () => inletStreets().map(x => x.skelId !== 'r' ? x : { ...x, points: [[-150, 0], [xl(0), 0], [xr(0), 0], [150, 0]], gradeRuns: [{ from: 0, to: 3, ways: [3], offGrade: true, exact: true, by: 'exact' }] })
const atVertex = (mint, which) => { const arcV = which !== 'b', stV = which !== 'a', W = arcV ? waterOnStreet : inlet, arc = arcV ? arcOnStreet : inletArc
  let M = null; try { M = quiet(() => mint({ streets: stV ? streetOnArc() : inletStreets(), boundary, bb, coast: [W], coastArcs: [arc] })) } catch (e) { return { refused: String(e.message) } }
  const L = arc.reduce((t, p, k) => k ? t + Math.hypot(p[0] - arc[k - 1][0], p[1] - arc[k - 1][1]) : 0, 0)
  return { span: (M.offGradeSpans || []).find(e => e.street === 'r'), wetInk: absA([W]) - absA(differenceRings([W], M.rings)), bound: INK_EPS * L * 1.01 + 1e-6 } }
const AT = { a: 'a coast vertex exactly on the street', b: 'a street vertex exactly on the coast', c: 'a vertex the street and the coast share' }
for (const which of ['a', 'b', 'c']) { const R = atVertex(mintProtopolygon, which)
  row(!R.refused && !!R.span && R.wetInk <= R.bound, `(8${which}) ${AT[which]}: ${R.refused ? `REFUSED (${R.refused.slice(0, 100)})` : `${R.span ? `span r|${R.span.segOrd} recorded (${R.span.wetM} m)` : 'NO span recorded'}, the ink in the water ${R.wetInk.toFixed(3)} m² (the coast's own stroke ≤ ${R.bound.toFixed(3)})`}`) }
{ const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
  for (const [name, a, b] of [['the overlay disabled (a gap over the water)', 'for (const sp of spans) { if (sp.hwy) continue', 'for (const sp of spans) { continue'],
                              ['the overlay not run on past the banks', 'let E = 2 * Math.max(hl, hr), A = clip(E)', 'let E = 0, A = clip(E)'],
                              ['H not split (the highway keeps its span over the water)', '  const H = (spans || []).filter(x => x.hwy)\n', '  const H = []\n'],
                              ['(a) the crossings read off the minted points alone', "for (const v of out[n]) { const k = v.k[0] + ',' + v.k[1]; if (onStreet.has(k)) crossKeys.add(k) }", 'for (const v of out[n]) if (v.src == null) crossKeys.add(v.k[0] + \',\' + v.k[1])'],
                              ['(b) a street\'s own vertex never marked a crossing', "edge: v.src, ...(c && { cross: true }) })", 'edge: v.src })']]) {
    if (src.split(a).length !== 2) { row(false, `mutant (6) ${name}: its anchor is not in tileGround.js once — re-aim it`); continue }
    const dir = mkdtempSync(join(tmpdir(), 'bridge6-')), LIB = join(ROOT, 'src/lib')
    try { writeFileSync(join(dir, 'tileGround.js'), src.replace(a, b)
        .replace(/from \x27(\.{1,2}\/[^\x27]+)\x27/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`).replace(/from \x27clipper-lib\x27/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M = await import(pathToFileURL(join(dir, 'tileGround.js')).href)
      if (name.startsWith('(a)') || name.startsWith('(b)')) for (const w of name[1] === 'a' ? ['a', 'c'] : ['b']) { const R = atVertex(M.mintProtopolygon, w)
        row(!!R.refused || !R.span || R.wetInk > R.bound, `mutant (8${w}) ${name.slice(4)}: ${R.refused ? `refuses (${R.refused.slice(0, 80)})` : `${R.span ? 'span recorded' : 'NO span'}, ${R.wetInk.toFixed(3)} m² of ink in the water`} — RED as it must be`) }
      if (name.startsWith('(a)') || name.startsWith('(b)')) continue
      if (name.startsWith('H not split')) { const J = judgeH(splitH(M.highwayBridges))
        row(!J || J.wet > 1, `mutant (7) ${name}: ${J ? `the highway keeps ${J.wet.toFixed(2)} m² over the water` : 'refuses'} — RED as it must be`); continue }
      const B = bridgeOf(M.bridgeOverlay), d = typeof B === 'string' ? null : symDiff(B)
      row(d == null || d > 1, `mutant (6) ${name}: ${d == null ? `refuses (${String(B).slice(0, 80)})` : `differs from the street's strip by ${d.toFixed(2)} m²`} — RED as it must be`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ an off-grade span over the water is not ground')
process.exit(red ? 1 : 0)
