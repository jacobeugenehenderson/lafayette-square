#!/usr/bin/env node
// CLAIM — AN OFF-GRADE SPAN OVER ①'S WATER IS NOT GROUND: a bridge is above the water, a tunnel below it, and neither is
// street-on-water (Boz's ruling B, Zob's read, 2026-10-27). `tileGround.js#splitOverWater` leaves such a span out of the street
// ink; the bank pieces end ON the coast, sharing the crossing; every vertex keeps its original index. It reads the grade off
// `gradeRuns` (cartograph/mintInputs.mjs: the skeleton's segmentWays, by streetClass.js#isOffGradeWay, mapped by anchorAt).
//   (1) PLANTED: a street running into a lake on ONE exactly attributed off-grade run — the mint mints, and no ink owned by
//       that street lies in the water past the coast's own stroke (2ε of the shoreline).
//   (2) the same street with its run AT GRADE leaves the ink too — OFF GRADE BY THE COAST (Jacob, 2026-10-27: "a") — and is
//       RECORDED in protopolygon.offGradeByCoast { street, segOrd, wetM, at }, never silent.
//   (3) the same street with its off-grade run attributed BY ORDER REFUSES by name ("only an exactly attributed run decides").
//   (4) over LAND nothing changes: the same street, its run off grade, with no water → the same ink as with no grade runs.
//   MUTANT (always run): the mint copied with the split bypassed puts (1)'s street ink in the water — or (1) proves nothing.
//   node checks/claims-a-bridge-over-water-is-not-ground.mjs
import { mintProtopolygon, INK_EPS } from '../src/lib/tileGround.js'
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
  const rec = MP?.offGradeByCoast || []
  row(!r && wetInkOf(MP, 'a') === 0 && rec.length === 1 && rec[0].street === 'a' && rec[0].wetM > 0, `(2) the same run AT GRADE: ${r ? `REFUSED (${r.slice(0, 100)})` : `minted, ${wetInkOf(MP, 'a')} ink vertex(es) in the water, ${rec.length} off-grade-by-the-coast record(s)${rec[0] ? ` (${rec[0].street}|${rec[0].segOrd}, ${rec[0].wetM} m at (${rec[0].at.join(', ')}))` : ''}`}`) }
{ const r = refusal(() => mint(streets(run({ exact: false, by: 'order' }))))
  row(!!r && /only an exactly attributed run/.test(r), `(3) the off-grade run attributed BY ORDER: ${r ? (/exactly attributed/.test(r) ? 'REFUSED by name' : `refused otherwise (${r.slice(0, 100)})`) : 'MINTED — an inferred attribution decided a drop'}`) }
{ const A = mint(streets(run({})), false), B = mint(streets(undefined).map(s => ({ ...s, gradeRuns: undefined })), false)
  const same = A.rings.length === B.rings.length && A.rings.every((r, i) => r.length === B.rings[i].length && r.every((p, k) => p[0] === B.rings[i][k][0] && p[1] === B.rings[i][k][1]))
  row(same, `(4) over land, the off-grade run changes nothing: ${A.rings.length} ink ring(s) either way, vertex for vertex ${same ? 'the same' : 'DIFFERENT'}`) }
{ const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8'), A = "const split = splitOverWater([...streets.map((st, ci) => ({ st, ci })), ...gradeSep.map(st => ({ st, ci: -1 }))], coast, coastChains, segOrdAt)"
  if (src.split(A).length !== 2) row(false, 'mutant: the split call is not in tileGround.js once — re-aim the anchor')
  else { const dir = mkdtempSync(join(tmpdir(), 'bridge-')), LIB = join(ROOT, 'src/lib')
    try { writeFileSync(join(dir, 'tileGround.js'), src.replace(A, "const split = { chains: [...streets.map((st, ci) => ({ st, ci })), ...gradeSep.map(st => ({ st, ci: -1 }))], coastChains, byCoast: [] }")
        .replace(/from \x27(\.{1,2}\/[^\x27]+)\x27/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`).replace(/from \x27clipper-lib\x27/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M = await import(pathToFileURL(join(dir, 'tileGround.js')).href)
      let MP = null; const r = refusal(() => { MP = quiet(() => M.mintProtopolygon({ streets: streets(run({})), boundary, bb, coast: [lake], coastArcs: [arc] })) })
      const n = MP ? wetInkOf(MP, 'a') : 0
      row(!!r || n > 0, `mutant: without the split, the street ${r ? `makes the mint refuse (${r.slice(0, 90)})` : `has ${n} ink vertex(es) in the water`} — RED as it must be`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ an off-grade span over the water is not ground')
process.exit(red ? 1 : 0)
