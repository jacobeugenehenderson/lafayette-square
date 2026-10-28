#!/usr/bin/env node
// CLAIM — THE COAST IS ONE LINE ON THE LATTICE (Boz's ruling, 2026-10-27; ②'s shareIntoFull lesson, in ①). ① holds the shoreline
// twice: the coast ARC (its centreline, stroked into ink) and the WATER RING (the boolean's water). `splitOverWater` writes each
// street × coast crossing into the arc, rounded to the lattice; written into the arc alone it sat up to a unit off the ring's
// straight edge, and the two copies enclosed an ink-less cell that joined no face (Huron, cleveland-road-east-0 at (815.256,
// 576.511), 0.593 mm off: absorbInk refused it on a 1 mm move of the coast — a lottery any trace can draw). Now each such point is
// inserted into the water-ring edge that holds it (insertOnEdges, the boolean's own containment; a ring's per-edge `deck` tag rides
// the split), and one that no water edge holds refuses by name.
//   (1) PLANT: a channel whose street crosses it bank to bank: every crossing the arc took is a VERTEX of the water ring ①
//       hands back (protopolygon.waterRings), and the mint passes.
//   (2) HURON: its v3 coast with the water opened and closed as 7ee75e5a does (scratch/coast-fragility/plant-huron-1mm/coast.json,
//       md5 f10a37ee…, uncommitted derived data; its absence is RED, by name), the town's own inputs (mintInputs): the mint passes.
//   MUTANT (always run): the water rings NOT given the crossings → (1) a crossing is no water vertex, RED · (2) Huron refuses at
//   absorbInk, at the cell (815.256, 576.511), RED.
//   ⛔ Not reproduced by a synthetic plant: a street ending on, or crossing, a straight coast edge, swept 6 m in 0.7 mm steps, never
//   opened the ink-less cell in the mutant, so (2) carries the refusal on the real coast. (1) is the invariant, planted.
//   node checks/claims-the-coast-is-one-line-on-the-lattice.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const K = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)

// (1) the plant: a channel along Huron's own edge direction, 30 m wide, a street crossing it bank to bank (off grade by the coast)
const side = { pavementHW: 5, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk', parking: 2.4 }
const st = (id, pts, extra = {}) => ({ skelId: id, roadId: id, throughId: id, name: id, points: pts, highway: 'residential', class: 'local', lanes: 2, oneway: false,
  measure: { left: { ...side }, right: { ...side }, symmetric: true, source: 'seed' }, seed: { cornerR: 4.5, pavementHW: 5 },
  marks: { centre: { kind: 'none' }, edges: { kind: null } }, caps: { start: { cap: null, degree: 2 }, end: { cap: null, degree: 2 } }, ...extra })
const B = 200, sq = [[60, -100], [140, -100], [140, -160], [60, -160]]
const disc = Array.from({ length: 64 }, (_, i) => [180 * Math.cos(i / 32 * Math.PI), 180 * Math.sin(i / 32 * Math.PI)])
const A0 = [-3.844, -6.968], A1 = [9.173, 16.773], u = [A1[0] - A0[0], A1[1] - A0[1]], uL = Math.hypot(...u), off = [-u[1] / uL * 30, u[0] / uL * 30]
const bank = (o) => { const a = [A0[0] + o[0], A0[1] + o[1]], t0 = (-B - a[1]) / u[1], t1 = (B - a[1]) / u[1]
  return [[a[0] + t0 * u[0], -B], a, [A1[0] + o[0], A1[1] + o[1]], [a[0] + t1 * u[0], B]].map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]) }
const near = bank([0, 0]), far = bank(off)
let channel = [...near, ...far.slice().reverse()]; if (sa(channel) < 0) channel = channel.reverse()
const streets = [...sq.map((a, i) => st('s' + i, [a, sq[(i + 1) % 4]])), st('over-the-channel', [[30.3, -20.1], [-40.7, 30.2]], { caps: { start: { cap: 'round', degree: 1 }, end: { cap: 'round', degree: 1 } }, gradeRuns: [] })]
const plant = (tg) => { let MP = null, why = null
  try { MP = quiet(() => tg.mintProtopolygon({ streets, bb: { x0: -B, x1: B, z0: -B, z1: B }, boundary: disc, coast: [channel], coastArcs: [near, far.slice().reverse()] })) } catch (e) { why = String(e.message) }
  if (!MP) return { why }
  const water = new Set((MP.waterRings || []).flatMap(r => r.map(K))), arcV = (MP.centrelines || []).filter(c => c.points.some(p => water.has(K(p)))).flatMap(c => c.points)
  const crossings = (MP.offGradeSpans || []).flatMap(s => [s.points[0], s.points[s.points.length - 1]].filter((_, i) => s.banks[i]))
  return { crossings, missing: crossings.filter(p => !water.has(K(p))), arcOff: arcV.length }
}

// (2) Huron, on the plant coast
const PLANT = join(ROOT, 'scratch/coast-fragility/plant-huron-1mm'), MD5 = 'f10a37eefc06cfdb451e469a25f8c989', CELL = '(815.256, 576.511)'
const huronArgs = async () => {
  if (!existsSync(join(PLANT, 'coast.json'))) return { err: `the plant ${join(PLANT, 'coast.json')} is absent — Huron NOT checked` }
  const md5 = createHash('md5').update(readFileSync(join(PLANT, 'coast.json'))).digest('hex'); if (md5 !== MD5) return { err: `the plant's md5 is ${md5}, not ${MD5} — a different coast, NOT checked` }
  // the town's own inputs (mintInputsOf's reads), with the plant dir as the clean dir its one coast read comes from
  const { ribbonsPathOf } = await import('../cartograph/scene.js'), { mintInputs } = await import('../cartograph/mintInputs.mjs'), { localBB, projectorOf, geographyFor } = await import('../cartograph/geography.mjs'), BR = await import('../cartograph/boundaryRecords.mjs')
  const D = join(ROOT, 'cartograph/data/huron'), rd = (f) => JSON.parse(readFileSync(join(D, f), 'utf8'))
  const osm = rd('raw/osm.json'), bb = localBB(osm, projectorOf(geographyFor('huron'))), { disc: hd } = BR.splitBoundary(rd('neighborhood_boundary.json'), 'huron')
  const MI = mintInputs({ ribbonStreets: JSON.parse(readFileSync(ribbonsPathOf('huron'), 'utf8')).streets, skeletonStreets: rd('clean/skeleton.json').streets || [], osm, bb, disc: hd, discAt: BR.discOf(hd, 'huron'), cleanDir: PLANT, who: 'claims-the-coast-is-one-line' })
  return { args: { streets: MI.streets, gradeSep: MI.gradeSep, boundary: MI.boundary, coast: MI.coast, coastArcs: MI.coastArcs, bb: MI.bb } }
}
const H = await huronArgs()
const huron = (tg) => { if (H.err) return { err: H.err }; try { quiet(() => tg.mintProtopolygon(H.args)); return { why: null } } catch (e) { return { why: String(e.message) } } }

const tg = await import('../src/lib/tileGround.js')
{ const p = plant(tg); row(!p.why && p.crossings.length >= 2 && !p.missing.length,
    `(1) a street crossing a channel bank to bank: ${p.why ? `REFUSED (${p.why.slice(0, 140)})` : `${p.crossings.length} crossing(s) the arc took, ${p.missing.length} not a water-ring vertex — the mint passes`}`) }
{ const h = huron(tg); row(!h.err && !h.why, `(2) Huron's v3 coast with the water opened and closed (the plant), its own inputs: ${h.err ? h.err : h.why ? `REFUSED (${h.why.slice(0, 160)})` : 'mints'}`) }

// MUTANT: the water rings not given the crossings
{ const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8'), ANCHOR = '  if (Array.isArray(coast) && coast.length) coast = split.waterRings'
  if (src.split(ANCHOR).length !== 2) row(false, 'mutant: the shared insertion is not in tileGround.js once — re-aim the anchor')
  else { const dir = mkdtempSync(join(tmpdir(), 'oneline-')), LIB = join(ROOT, 'src/lib')
    try { writeFileSync(join(dir, 'tileGround.js'), src.replace(ANCHOR, '  void 0')
        .replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`).replace(/from 'clipper-lib'/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const M = await import(pathToFileURL(join(dir, 'tileGround.js')).href)
      const p = plant(M), bit1 = !p.why && p.missing.length > 0
      row(bit1, `mutant: the water not given the crossings → (1) ${p.why ? `refused (${p.why.slice(0, 100)})` : `${p.missing.length} of ${p.crossings.length} crossing(s) are no water-ring vertex`}${bit1 ? ', RED as it must be' : ' — the row proves nothing'}`)
      const h = huron(M), bit2 = !h.err && /\[absorb\]/.test(h.why || '') && (h.why || '').includes(CELL)
      row(bit2, `mutant: and (2) Huron → ${h.err ? h.err : h.why ? (bit2 ? `refuses at absorbInk at ${CELL}, RED as it must be` : `refused, not at the cell (${h.why.slice(0, 120)})`) : 'MINTS — the row proves nothing'}`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the coast is one line on the lattice')
process.exit(red ? 1 : 0)
