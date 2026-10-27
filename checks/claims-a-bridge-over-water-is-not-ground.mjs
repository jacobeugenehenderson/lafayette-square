#!/usr/bin/env node
// CLAIM — AN OFF-GRADE SPAN OVER ①'S WATER IS NOT GROUND: a bridge is above the water, a tunnel below it, and neither is
// street-on-water (Boz's ruling B, Zob's read, 2026-10-27). `tileGround.js#splitOverWater` leaves such a span out of the street
// ink; the bank pieces end ON the coast, sharing the crossing; every vertex keeps its original index. It reads the grade off
// `gradeRuns` (cartograph/mintInputs.mjs: the skeleton's segmentWays, by streetClass.js#isOffGradeWay, mapped by anchorAt).
//   (1) PLANTED: a street running into a lake on ONE exactly attributed off-grade run — the mint mints, and no ink owned by
//       that street lies in the water past the coast's own stroke (2ε of the shoreline).
//   (2) the same street with its run AT GRADE, crossing the coast and ENDING in the water (a slipway): it STOPS AT THE COAST
//       (Boz's ruling, 2026-10-27: the coast is the high-water mark), leaves the ink, is no span (nothing painted past the coast)
//       and is RECORDED by name in protopolygon.endsInWater { street, segOrd, wetM, at }. MUTANT: the one-bank case taken for a
//       span (a pavement stub painted over the water) reads RED.
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
//   (6b) the same bridge with ASYMMETRIC sides (left 3 m, right 6 m): the overlay is the street's own strip, each side at its own
//       width (the side convention H's sweep uses). MUTANT: the sides swapped reads RED.
//   (9) a street that BENDS 40° on the bank just past its crossing: the overlay is the SPAN's own straight strip ∩ the water, the
//       bent street's pavement never reaching over it (Boz's ruling (A), 2026-10-27: the coast wins, for street and bridge alike).
//   (10) a street that turns 60° away from a shore just past the bank, and (14) one that runs on BESIDE the shore, its strip
//       overhanging the water: the overlay is the span's own straight strip between the left bank and the right bank's coast,
//       run on SQUARE across the street from the shore's corner — never the street's paint over the water past a bank (Boz).
//       MUTANT: the bank cut skipped paints the overhang — RED on both.
//   (11) a bank that WIGGLES across the strip's edge (the coast leaves the strip and comes back beside the crossing): the piece
//       meets the coast in two runs at one bank, so the overlay REFUSES by name. MUTANT: the closure skipped paints it — RED.
//   (12) a span that crosses a segOrd boundary (a chain meets the bridge in the middle of the water) has no one measure: the mint
//       REFUSES it by name (Zob). MUTANT: the refusal skipped mints it — RED.
//   (13) a street lying WHOLLY in the water, at grade, crosses no coast and was kept as ink there, silently: it is no bridge (no
//       bank, no tag — Jacob's (a) rules a CROSSING), so the mint REFUSES it by name (Boz, Zob). (13b) the same chain TAGGED off
//       grade (a bridge way split mid-span) is recorded and leaves the ink. MUTANTS: the wholly-wet case skipped (its ink kept in
//       the water) and the no-bank refusal skipped (a floating strip) — each RED.
//   (15) a HOOK bank: past the crossing the coast recedes back alongside the span (≈ 8.5 m back, 1 m across) and then turns away
//       inside the strip, so the cut runs on SQUARE across the street from the last coast point, never along that receding edge
//       (which would cut away water between the banks, beside the span). The overlay is the span's straight strip ∩ the water, whole.
//   (16) a street turning 130° AT the bank to hug the shore (the leak: 140.8 m² of its pavement over the water when the run-on
//       followed the chain): the overlay is the span's straight strip ∩ the water, nothing past the bank.
//       MUTANT: the run-on along the last coast edge reads RED (water between the banks cut away).
//   (4) over LAND nothing changes: the same street, its run off grade, with no water → the same ink as with no grade runs.
//   MUTANTS (6): the overlay disabled (a gap over the water) and the overlay not run on past the banks (butt ends at the crossing
//   vertices leave a triangle of water at each oblique bank) must each read RED.
//   MUTANT (always run): the mint copied with the split bypassed puts (1)'s street ink in the water — or (1) proves nothing.
//   node checks/claims-a-bridge-over-water-is-not-ground.mjs
import { mintProtopolygon, INK_EPS, bridgeOverlay, highwayBridges, differenceRings, unionRings } from '../src/lib/tileGround.js'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'
import { CLIP_SCALE } from '../src/lib/lattice.js'

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
  const rec = MP?.endsInWater || [], spansA = (MP?.offGradeSpans || []).filter(e => e.street === 'a')
  row(!r && wetInkOf(MP, 'a') === 0 && rec.length === 1 && rec[0].street === 'a' && rec[0].wetM > 0 && !spansA.length, `(2) the same run AT GRADE, ending in the water: ${r ? `REFUSED (${r.slice(0, 100)})` : `minted, ${wetInkOf(MP, 'a')} ink vertex(es) in the water, ${rec.length} ends-in-water record(s)${rec[0] ? ` (${rec[0].street}|${rec[0].segOrd}, ${rec[0].wetM} m at (${rec[0].at.join(', ')}))` : ''}, ${spansA.length} span(s) to paint`}`) }
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
  const sp = (M.offGradeSpans || []).find(e => e.street === 'r')
  return { span: sp && sp.banks?.[0] && sp.banks?.[1] ? sp : null, any: !!sp, wetInk: absA([W]) - absA(differenceRings([W], M.rings)), bound: INK_EPS * L * 1.01 + 1e-6 } }
const AT = { a: 'a coast vertex exactly on the street', b: 'a street vertex exactly on the coast', c: 'a vertex the street and the coast share' }
for (const which of ['a', 'b', 'c']) { const R = atVertex(mintProtopolygon, which)
  row(!R.refused && !!R.span && R.wetInk <= R.bound, `(8${which}) ${AT[which]}: ${R.refused ? `REFUSED (${R.refused.slice(0, 100)})` : `${R.span ? `span r|${R.span.segOrd} recorded bank to bank (${R.span.wetM} m)` : R.any ? 'a span recorded, but NOT bank to bank (the street dropped whole)' : 'NO span recorded'}, the ink in the water ${R.wetInk.toFixed(3)} m² (the coast's own stroke ≤ ${R.bound.toFixed(3)})`}`) }
// the span's own strip, built here independently of the sweep: the street's rectangle along z = 0 (every planted span runs there),
// left −hl and right +hl, ∩ the water, the piece holding the span's centreline (Boz's ruling (A): nothing but the span's own strip)
const windIn = (p, r) => { let w = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
  if (zj <= p[1]) { if (zi > p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) > 0) w++ } else if (zi <= p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) < 0) w-- } return w !== 0 }
const straightRef = (W, span, hw = 4) => { const U = [[-150, -hw], [150, -hw], [150, hw], [-150, hw]], X = differenceRings([U], differenceRings([U], [W]))
  const mids = span.points.slice(1).map((q, k) => [(q[0] + span.points[k][0]) / 2, (q[1] + span.points[k][1]) / 2])
  return X.filter(r => mids.some(m => windIn(m, r))) }
const diffTo = (A, R) => absA(differenceRings(A, R)) + absA(differenceRings(R, A))
// the lattice's own allowance: one grid step (CLIP_SCALE) along the reference's whole boundary — every vertex is rounded once
const perim = (R) => R.reduce((t, r) => t + r.reduce((u, p, k) => u + Math.hypot(r[(k + 1) % r.length][0] - p[0], r[(k + 1) % r.length][1] - p[1]), 0), 0)
const gridTol = (R) => perim(R) / CLIP_SCALE
// (6b) asymmetric sides, on (6)'s inlet: the strip from z = −3 (left) to z = +6 (right)
const asymStrip = [[xl(-3), -3], [xr(-3), -3], [xr(6), 6], [xl(6), 6]]
const asymOf = (fn) => { try { const B = quiet(() => fn(SP, MPi.waterRings, (_, side) => (side === 'left' ? 3 : 6))); return B.length ? diffTo(B[0].rings, [asymStrip]) : null } catch (e) { return String(e.message) } }
{ const d = asymOf(bridgeOverlay)
  row(typeof d === 'number' && d < gridTol([asymStrip]), `(6b) the same bridge, left 3 m and right 6 m: ${typeof d === 'number' ? `the overlay differs from the street's own strip (−3 … +6) by ${d.toFixed(4)} m² (the 1 mm grid allows ${gridTol([asymStrip]).toFixed(3)})` : `REFUSES (${String(d).slice(0, 100)})`}`) }
// (9) the bend on the bank, (10) the turn away from a shore — each its own inlet, its own street r
const bendArc = inletArc, bendWater = inlet, bendR = [[-150, 0], [51.55, 0], [51.55 + 100 * Math.cos(40 * Math.PI / 180), 100 * Math.sin(40 * Math.PI / 180)]]
const shoreArc = [[-200, -100], [-60, -100], [-10, 60], [25, 64], [70, 60], [55, -3], [200, -3]], shoreWater = wind([...shoreArc, [200, -200], [-200, -200]], 1)
const shoreR = [[-150, 0], [57, 0], [57 + 50 * Math.cos(60 * Math.PI / 180), 50 * Math.sin(60 * Math.PI / 180)]]
const bentCase = (arc, W, R) => { const S = inletStreets().map(x => x.skelId !== 'r' ? x : { ...x, points: R, caps: { start: { degree: 2 }, end: { degree: 1 } }, gradeRuns: [{ from: 0, to: R.length - 1, ways: [3], offGrade: true, exact: true, by: 'exact' }] })
  const M = quiet(() => mintProtopolygon({ streets: S, boundary, bb, coast: [W], coastArcs: [arc] })), sp = (M.offGradeSpans || []).find(e => e.street === 'r')
  return { M, sp, ref: sp ? straightRef(W, sp) : [] } }
const CASES = { 9: ['a street bending 40° on the bank just past its crossing', bentCase(bendArc, bendWater, bendR)] }
const bentOf = (fn, C) => { try { const B = quiet(() => fn(C.M.offGradeSpans, C.M.waterRings, () => 4)); const b = B.find(x => x.street === 'r'); return b ? diffTo(b.rings, C.ref) : 'no bridge' } catch (e) { return String(e.message) } }
for (const [k, [what, C]] of Object.entries(CASES)) { const d = bentOf(bridgeOverlay, C)
  row(!!C.sp && C.ref.length === 1 && typeof d === 'number' && d < gridTol(C.ref), `(${k}) ${what}: ${C.sp ? `span r|${C.sp.segOrd} (${C.sp.wetM} m)` : 'NO span'}; ${typeof d === 'number' ? `the overlay differs from the span's own strip ∩ the water by ${d.toFixed(4)} m² of ${absA(C.ref).toFixed(1)} (the 1 mm grid allows ${gridTol(C.ref).toFixed(3)})` : `REFUSES (${String(d).slice(0, 110)})`}`) }
// (11) the right bank zigzags across the strip's +4 m edge beside the crossing
const wiggleArc = [[-200, -100], [-60, -100], [-10, 60], [25, 64], [70, 60], [53.5, 3], [60, 5.5], [52, 2], [20, -100], [200, -100]]
const wiggleCase = (() => { const W = wind([...wiggleArc, [200, -200], [-200, -200]], 1)
  const M = quiet(() => mintProtopolygon({ streets: inletStreets(), boundary, bb, coast: [W], coastArcs: [wiggleArc] })); return { M, sp: (M.offGradeSpans || []).find(e => e.street === 'r') } })()
const wiggleOf = (fn) => { try { quiet(() => fn(wiggleCase.M.offGradeSpans, wiggleCase.M.waterRings, () => 4)); return null } catch (e) { return String(e.message) } }
{ const r = wiggleOf(bridgeOverlay)
  row(!!wiggleCase.sp && !!r && /not one through each/.test(r), `(11) a bank zigzagging across the strip's edge: ${r ? (/not one through each/.test(r) ? `REFUSED by name (${r.slice(r.indexOf('meets'), r.indexOf('meets') + 60)}…)` : `refused otherwise (${r.slice(0, 100)})`) : 'PAINTED — the closure did not fire'}`) }
// (12) a bridge with a junction in the middle of the water: r carries a vertex at (10, 0) where j ends (its own span runs north)
const midJoin = () => inletStreets().map(x => x.skelId !== 'r' ? x : { ...x, points: [[-150, 0], [10, 0], [150, 0]], gradeRuns: [{ from: 0, to: 2, ways: [3], offGrade: true, exact: true, by: 'exact' }] })
  .concat([{ ...st('j', [[10, 0], [10, 100]], [{ from: 0, to: 1, ways: [5], offGrade: true, exact: true, by: 'exact' }]), caps: { start: { degree: 3 }, end: { degree: 1 } } }])
const segOrdRefusal = (mint) => { try { quiet(() => mint({ streets: midJoin(), boundary, bb, coast: [inlet], coastArcs: [inletArc] })); return null } catch (e) { return String(e.message) } }
{ const r = segOrdRefusal(mintProtopolygon)
  row(!!r && /crosses a segOrd boundary/.test(r), `(12) a bridge with a junction mid-water: ${r ? (/segOrd boundary/.test(r) ? 'REFUSED by name (no one measure)' : `refused otherwise (${r.slice(0, 100)})`) : 'MINTED — painted at the first segment\'s width'}`) }
// (13) w lies wholly inside the inlet, at grade
const wholly = (mint) => { let M = null; try { M = quiet(() => mint({ streets: [...inletStreets(), st('w', [[0, 10], [20, 10]], [{ from: 0, to: 1, ways: [6], offGrade: false, exact: true, by: 'exact' }])], boundary, bb, coast: [inlet], coastArcs: [inletArc] })) } catch (e) { return { refused: String(e.message) } }
  const ink = M.rings.reduce((t, r, ri) => t + r.filter((_, k) => M.owners[M.labels[ri][k]]?.skelId === 'w').length, 0)
  return { sp: (M.offGradeSpans || []).find(e => e.street === 'w'), ink } }
{ const R = wholly(mintProtopolygon)
  row(!!R.refused && /lying wholly in the water/.test(R.refused), `(13) a street wholly in the water, at grade: ${R.refused ? (/lying wholly in the water/.test(R.refused) ? 'REFUSED by name (no bank, no tag: not a bridge)' : `refused otherwise (${R.refused.slice(0, 100)})`) : `${R.sp ? 'RECORDED — a floating strip' : 'NOT recorded'}, ${R.ink} ink vertex(es) of it left`}`) }
// (10) and (14) on the shore inlet: the stretch is the strip between the left bank (x = xl(z)) and the right bank's edge
// (70, 60) → (55, −3) run on straight below the shore's corner: x = 55 + 15 (z + 3) / 63
// the stretch: the span's own strip ∩ the water (`straightRef`, independent of the sweep), less everything past the right bank —
// its coast edge (70, 60) → (55, −3) down to the shore's corner, then SQUARE across the street (x = 55) where the coast turns along it
const xR = (z) => 55 + 15 * (z + 3) / 63, pastRight = [[55, -300], [300, -300], [300, 300], [xR(300), 300], [55, -3]]
const SHORE = { 10: ['a street turning 60° away from a shore just past the bank', bentCase(shoreArc, shoreWater, shoreR)], 14: ['a street running on beside the shore, its strip over the water', bentCase(shoreArc, shoreWater, [[-150, 0], [150, 0]])] }
const shoreOf = (fn, C) => { try { const B = quiet(() => fn(C.M.offGradeSpans, C.M.waterRings, () => 4)); const b = B.find(x => x.street === 'r'); return b ? b.rings : 'no bridge' } catch (e) { return String(e.message) } }
const stretchOf = (C) => differenceRings(C.ref, [pastRight])
for (const [k, [what, C]] of Object.entries(SHORE)) { const B = shoreOf(bridgeOverlay, C), S = stretchOf(C), d = typeof B === 'string' ? null : diffTo(B, S)
  const over = typeof B === 'string' ? null : absA(differenceRings(B, S))
  row(!!C.sp && S.length === 1 && d != null && d < gridTol(S), `(${k}) ${what}: ${d == null ? `REFUSES (${String(B).slice(0, 110)})` : `the overlay differs from the span's own stretch bank to bank by ${d.toFixed(4)} m² of ${absA(S).toFixed(1)} (the grid allows ${gridTol(S).toFixed(3)}), ${over.toFixed(4)} m² of it past a bank`}`) }
// (13b) the wholly-wet chain TAGGED off grade
{ let M = null, r = null; try { M = quiet(() => mintProtopolygon({ streets: [...inletStreets(), st('w', [[0, 10], [20, 10]], [{ from: 0, to: 1, ways: [6], offGrade: true, exact: true, by: 'exact' }])], boundary, bb, coast: [inlet], coastArcs: [inletArc] })) } catch (e) { r = String(e.message) }
  const sp = M?.offGradeSpans?.find(e => e.street === 'w'), ink = M ? M.rings.reduce((t, q, ri) => t + q.filter((_, k) => M.owners[M.labels[ri][k]]?.skelId === 'w').length, 0) : null
  row(!r && sp?.kind === 'tagged' && ink === 0, `(13b) the same chain tagged off grade (a bridge way split mid-span): ${r ? `REFUSED (${r.slice(0, 100)})` : `recorded ${sp ? `${sp.street}|${sp.segOrd} ${sp.kind}` : 'NOT'}, ${ink} ink vertex(es) left`}`) }
// (15) the hook: the right bank (70, 60) → (62, 1) → (45, −1) → (35, −1) → (35, −100)
const hookArc = [[-200, -100], [-60, -100], [-10, 60], [25, 64], [70, 60], [62, 1], [45, -1], [35, -1], [35, -100], [200, -100]], hookWater = wind([...hookArc, [200, -200], [-200, -200]], 1)
const HOOK = bentCase(hookArc, hookWater, [[-150, 0], [150, 0]])
const hookOf = (fn) => { const B = shoreOf(fn, HOOK); return typeof B === 'string' ? B : diffTo(B, HOOK.ref) }
{ const d = hookOf(bridgeOverlay)
  row(!!HOOK.sp && HOOK.ref.length === 1 && typeof d === 'number' && d < gridTol(HOOK.ref), `(15) a hook bank receding beside the span: ${typeof d === 'number' ? `the overlay differs from the span's strip ∩ the water by ${d.toFixed(4)} m² of ${absA(HOOK.ref).toFixed(1)} (the grid allows ${gridTol(HOOK.ref).toFixed(3)})` : `REFUSES (${d.slice(0, 110)})`}`) }
// (16) the 130° turn at the bank: the right bank (−5, 62) → (51.25, 0) → (20, −100), the street turning at (51.25, 0) up along it
const turnArc = [[-200, -100], [-60, -100], [-10, 60], [-5, 62], [51.25, 0], [20, -100], [200, -100]], turnWater = wind([...turnArc, [200, -200], [-200, -200]], 1)
const T130 = bentCase(turnArc, turnWater, [[-150, 0], [51.25, 0], [51.25 + 60 * Math.cos(130 * Math.PI / 180), 60 * Math.sin(130 * Math.PI / 180)]])
{ const B = shoreOf(bridgeOverlay, T130), d = typeof B === 'string' ? null : diffTo(B, T130.ref), past = typeof B === 'string' ? null : absA(differenceRings(B, T130.ref))
  row(!!T130.sp && T130.ref.length === 1 && d != null && d < gridTol(T130.ref), `(16) a street turning 130° at the bank to hug the shore: ${d == null ? `REFUSES (${String(B).slice(0, 110)})` : `the overlay differs from the span's own strip ∩ the water by ${d.toFixed(4)} m² (the grid allows ${gridTol(T130.ref).toFixed(3)}), ${past.toFixed(4)} m² past the bank (it was 140.8 when the run-on followed the chain)`}`) }
{ const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
  for (const [name, a, b] of [['the overlay disabled (a gap over the water)', 'for (const sp of spans) { if (sp.hwy) continue', 'for (const sp of spans) { continue'],
                              ['the overlay not run on past the banks', 'const line = [...(b0 ? [run(b0)] : []), ...P, ...(b1 ? [run(b1)] : [])]', 'const line = P'],
                              ['the wholly-wet case skipped', "    if (!V.some(v => v.cross) && !(V.length >= 2 && wet(", "    if (!V.some(v => v.cross) && true || !(V.length >= 2 && wet("],
                              ['the one-bank case taken for a span', '      if (!part[0].cross || !part[part.length - 1].cross) { const m', '      if (false) { const m'],
                              ['the cut run on along the last coast edge', 'const b = o[o.length - 1], sb = sOf(b); o.push([b[0] + nn[0] * (sgn * R - sb), b[1] + nn[1] * (sgn * R - sb)])', 'const a = o[o.length - 2], b = o[o.length - 1], sa = sOf(a), sb = sOf(b), t = (sgn * R - sa) / (sb - sa); o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])'],
                              ['the no-bank refusal skipped', '      if (!part[0].cross && !part[part.length - 1].cross) throw', '      if (false) throw'],
                              ['the bank cut skipped', '    const A = (fars.length ?', '    const A = (false ?'],
                              ['the segOrd refusal skipped', '      if (ords.length > 1) throw', '      if (false) throw'],
                              ['the closure skipped', '    if (!closed) throw', '    if (false) throw'],
                              ['the sides swapped', 'sweepHighway(line, { spans: [{ hw: hl }] }, { spans: [{ hw: hr }] })', 'sweepHighway(line, { spans: [{ hw: hr }] }, { spans: [{ hw: hl }] })'],
                              ['H not split (the highway keeps its span over the water)', '  const H = (spans || []).filter(x => x.hwy)\n', '  const H = []\n'],
                              ['(a) the crossings read off the minted points alone', "for (const v of out[n]) { const k = v.k[0] + ',' + v.k[1]; if (onStreet.has(k)) crossKeys.add(k) }", 'for (const v of out[n]) if (v.src == null) crossKeys.add(v.k[0] + \',\' + v.k[1])'],
                              ['(b) a street\'s own vertex never marked a crossing', "edge: v.src, ...(c && { cross: true }) })", 'edge: v.src })']]) {
    if (src.split(a).length !== 2) { row(false, `mutant (6) ${name}: its anchor is not in tileGround.js once — re-aim it`); continue }
    const dir = mkdtempSync(join(tmpdir(), 'bridge6-')), LIB = join(ROOT, 'src/lib')
    try { writeFileSync(join(dir, 'tileGround.js'), src.replace(a, b)
        .replace(/from \x27(\.{1,2}\/[^\x27]+)\x27/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`).replace(/from \x27clipper-lib\x27/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M = await import(pathToFileURL(join(dir, 'tileGround.js')).href)
      if (name.startsWith('(a)') || name.startsWith('(b)')) for (const w of name[1] === 'a' ? ['a', 'c'] : ['b']) { const R = atVertex(M.mintProtopolygon, w)
        row(!!R.refused || !R.span || R.wetInk > R.bound, `mutant (8${w}) ${name.slice(4)}: ${R.refused ? `refuses (${R.refused.slice(0, 80)})` : `${R.span ? 'span recorded bank to bank' : R.any ? 'the street dropped whole, not bank to bank' : 'NO span'}, ${R.wetInk.toFixed(3)} m² of ink in the water`} — RED as it must be`) }
      if (name.startsWith('(a)') || name.startsWith('(b)')) continue
      if (name === 'the wholly-wet case skipped' || name === 'the no-bank refusal skipped') { const R = wholly(M.mintProtopolygon)
        row(!R.refused || !/lying wholly in the water/.test(R.refused), `mutant (13) ${name}: ${R.refused ? `refuses otherwise (${R.refused.slice(0, 80)})` : `${R.sp ? 'recorded, a floating strip' : 'NOT recorded'}, ${R.ink} ink vertex(es) in the water`} — RED as it must be`); continue }
      if (name === 'the one-bank case taken for a span') { let MP = null; try { MP = quiet(() => M.mintProtopolygon({ streets: streets(run({ offGrade: false })), boundary, bb, coast: [lake], coastArcs: [arc] })) } catch (e) {}
        const n = (MP?.offGradeSpans || []).filter(e => e.street === 'a').length
        row(!MP || n > 0 || !(MP.endsInWater || []).length, `mutant (2) ${name}: ${MP ? `${n} span(s) to paint for the slipway, ${(MP.endsInWater || []).length} ends-in-water record(s)` : 'refuses'} — RED as it must be`); continue }
      if (name === 'the cut run on along the last coast edge') { const d = hookOf(M.bridgeOverlay)
        row(typeof d !== 'number' || d > 1, `mutant (15) ${name}: ${typeof d === 'number' ? `cuts away ${d.toFixed(2)} m² of water between the banks` : `refuses (${d.slice(0, 80)})`} — RED as it must be`); continue }
      if (name === 'the bank cut skipped') { for (const [k, [, C]] of Object.entries(SHORE)) { const B = shoreOf(M.bridgeOverlay, C), over = typeof B === 'string' ? null : absA(differenceRings(B, stretchOf(C)))
          row(over == null || over > 1, `mutant (${k}) ${name}: ${over == null ? `refuses (${String(B).slice(0, 80)})` : `paints ${over.toFixed(2)} m² past a bank`} — RED as it must be`) } continue }
      if (name === 'the segOrd refusal skipped') { const r = segOrdRefusal(M.mintProtopolygon)
        row(!r || !/segOrd boundary/.test(r), `mutant (12) ${name}: ${r ? `refuses otherwise (${r.slice(0, 80)})` : 'mints the span at one width'} — RED as it must be`); continue }
      if (name === 'the closure skipped') { const r = wiggleOf(M.bridgeOverlay)
        row(!r || !/not one through each/.test(r), `mutant (11) ${name}: ${r ? `refuses otherwise (${r.slice(0, 80)})` : 'paints the zigzag bank'} — RED as it must be`); continue }
      if (name === 'the sides swapped') { const d = asymOf(M.bridgeOverlay)
        row(typeof d !== 'number' || d > 1, `mutant (6b) ${name}: ${typeof d === 'number' ? `differs from the street's own strip by ${d.toFixed(2)} m²` : `refuses (${String(d).slice(0, 80)})`} — RED as it must be`); continue }
      if (name.startsWith('H not split')) { const J = judgeH(splitH(M.highwayBridges))
        row(!J || J.wet > 1, `mutant (7) ${name}: ${J ? `the highway keeps ${J.wet.toFixed(2)} m² over the water` : 'refuses'} — RED as it must be`); continue }
      const B = bridgeOf(M.bridgeOverlay), d = typeof B === 'string' ? null : symDiff(B)
      row(d == null || d > 1, `mutant (6) ${name}: ${d == null ? `refuses (${String(B).slice(0, 80)})` : `differs from the street's strip by ${d.toFixed(2)} m²`} — RED as it must be`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ an off-grade span over the water is not ground')
process.exit(red ? 1 : 0)
