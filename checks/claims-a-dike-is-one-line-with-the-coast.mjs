#!/usr/bin/env node
// claims-a-dike-is-one-line-with-the-coast.mjs — IS AN EMBANKMENT'S EDGE THE COAST, ONE LINE, CUT ONCE?
//
// ⭐ THE INVARIANT (Jacob, 2026-10-28, `r-the-coast-bake-holds-an-embankment-as-land`; Boz's rulings the same day): the coast bake
// holds an embankment street's footprint as LAND while it traces, so the coast along a dike IS the dike's edge. This check holds,
// reading the code itself (structures.mjs, marchingSquares.mjs, bake-coast.mjs, coastFile.mjs, streetClass.js):
//   ① ONE VOCABULARY: streetClass.js#isEmbankment is embankment=* (dyke included, `no` excluded), and both its readers call it:
//      structureOverWater's 'ground' and coastFile.mjs#heldCells (a planted embankment=dyke way is held on the coarse sheet);
//   ② THE FOOTPRINT IS CUT ONCE: a planted embankment chain with a near-straight join (0.38°, the Breakwater's own) gives ONE vertex there, its ring
//      passes the coast's verifier ALONE (ringViolations at the ink), and its width is the pour measure's outer edge
//      (pourMeasureOf); a chain whose centreline folds back refuses by name;
//   ③ THE TRACE HOLDS IT: a HELD node's crossing to the water lies exactly on the held ring (marchingSquares.mjs#wetLoops);
//   ④ ALONG THE HELD RING THE COAST IS THE RING: a planted contact run with interior crossings and a 3 mm excursion becomes one
//      run on the ring (bake-coast.mjs#runsAlongHeld); a real departure (farther than one step) is kept; a run round a corner
//      takes the ring's own corner;
//   ⑤ A ROUNDING SLIVER erodes to nothing at the lattice's bound (structures.mjs#isRoundingSliver): a piece 1 u wide is a sliver,
//      3 u wide is not, and a long feature with a thin tail is a feature (the old mean width called it a sliver);
//   ⑥ PER TOWN with a coast.json: its `embankments` are what embankmentFootprints gives today, and no coast vertex lies within the
//      ink's width (2·INK_EPS) of a held ring without lying ON it (1 lattice unit).
//
// ▶ MUTANTS, built in (`--mutants`): each edits a copy of one module in the OS temp dir and must turn the check RED —
//     · heldCells back to embankment=yes only                      → ① RED
//     · the strip built by ClipperOffset again                     → ② RED
//     · the held crossing at the edge midpoint                     → ③ RED
//     · runsAlongHeld returning its rings untouched                → ④ RED
//     · the sliver rule back to the mean width against 2 units     → ⑤ RED
//
//   node checks/claims-a-dike-is-one-line-with-the-coast.mjs [--scene=<id> …] [--mutants]
// Read-only. Exits 1 on a finding.
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, scenes } from './_scenes.mjs'

const mutants = process.argv.includes('--mutants')
const towns = scenes('cartograph/data/<scene>/clean/skeleton.json', { argv: process.argv.slice(2).filter(a => a !== '--mutants') })
const HOMES = { structures: 'cartograph/structures.mjs', marching: 'cartograph/marchingSquares.mjs', coast: 'cartograph/bake-coast.mjs', coastFile: 'cartograph/coastFile.mjs' }
// the modules under test, through ONE loader: the real files, or a mutant's copy in the OS temp dir (`--mutants`)
const load = async (moduleUrl) => import(moduleUrl)
const EDIT = { file: null, a: null, b: null }   // the mutation's edit, set before its copy is made
const mutantUrl = () => { const home = join(ROOT, EDIT.file), src = readFileSync(home, 'utf8')
  if (!src.includes(EDIT.a)) throw new Error(`⛔ mutant target gone in ${EDIT.file}: ${JSON.stringify(EDIT.a).slice(0, 120)}`)
  const abs = (spec) => spec.startsWith('.') ? pathToFileURL(join(dirname(home), spec)).href : spec.includes(':') ? spec : import.meta.resolve(spec)
  const out = join(mkdtempSync(join(tmpdir(), 'dike-line-')), EDIT.file.split('/').pop())
  writeFileSync(out, src.replace(EDIT.a, EDIT.b).replace(/from '([^']+)'/g, (_, spec) => `from '${abs(spec)}'`))
  return pathToFileURL(out).href }
const real = async (k) => load(pathToFileURL(join(ROOT, HOMES[k])).href)

const STEP = 0.9987867588490528
const CF0 = await real('coastFile'), SC = (await import('../src/lib/tileGround.js')), SP = await import('../src/cartograph/streetProfiles.js')
const SCL = await import('../cartograph/derive.js'), { CLIP_SCALE } = await import('../src/lib/lattice.js'), SCLS = await import('../src/cartograph/streetClass.js')
const acuteAt = (o, p, q) => SC.outlineCorner(o, [{ to: p }, { to: q }], SC.INK_EPS).bad
const segD = (v, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((v[0] - a[0]) * dx + (v[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(v[0] - a[0] - t * dx, v[1] - a[1] - t * dz) }
const ringD = (p, r) => { let m = Infinity; for (let i = 0; i < r.length; i++) m = Math.min(m, segD(p, r[i], r[(i + 1) % r.length])); return m }

// ⓘ a planted embankment chain: a path-class street of one way tagged embankment=dyke, its centreline bending 0.38° at one point (the Breakwater's c5)
const SEED = { seededClass: 'path', pavementHW: 0.91, treelawn: 0, sidewalk: 0, cornerR: 4.5, rowHalf: 1.06, pedRealm: false }
const bend = (deg) => { const a = deg * Math.PI / 180; return [[0, 0], [100, 0], [100 + 100 * Math.cos(a), 100 * Math.sin(a)]] }
const chainOf = (pts) => ({ id: 'plant', name: 'Plant', class: 'path', seed: SEED, points: pts.map(([x, z]) => ({ x, z })), segmentWays: [{ from: 0, to: pts.length - 1, ways: [1] }], ways: { 1: { embankment: 'dyke', highway: 'footway' } } })

async function findings(M, out = () => {}) {
  const bad = [], S = M.structures, MS = M.marching, BC = M.coast, CF = M.coastFile
  // ① one vocabulary
  { const sc = readFileSync(join(ROOT, 'src/cartograph/streetClass.js'), 'utf8')
    if (!/if \(isEmbankment\(t\)\) return 'ground'/.test(sc)) bad.push('① structureOverWater does not read isEmbankment')
    if (!SCLS.isEmbankment({ embankment: 'dyke' }) || SCLS.isEmbankment({ embankment: 'no' })) bad.push('① isEmbankment is not embankment=* (dyke in, no out)')
    const W = 9, g = { highway: [{ tags: { embankment: 'dyke', highway: 'footway' }, coords: [{ x: 0, z: 20 }, { x: 40, z: 20 }] }] }
    const { n } = CF.heldCells(g, { W, H: W, x0: 0, z0: 0, step: 5 })
    if (!(n > 0)) bad.push('① heldCells does not hold an embankment=dyke way')
    out(`① isEmbankment(dyke) ${SCLS.isEmbankment({ embankment: 'dyke' })} · (no) ${SCLS.isEmbankment({ embankment: 'no' })} · heldCells holds a dyke way at ${n} cell(s)`) }
  // ② the footprint, cut once
  { const std = () => { throw new Error('no swept class here') }
    const e = S.embankmentFootprints([chainOf(bend(0.38))], { overlay: {}, std, tessellate: SCL.tessellateAdaptive, stepM: STEP })
    const r = e.rings[0], v = r ? CF.ringViolations(r, acuteAt, 2 * SC.INK_EPS) : ['no ring']
    const atBend = r ? r.filter(p => Math.hypot(p[0] - 100, p[1]) < 1.5).length : 0
    const outerM = SP.pourMeasureOf(chainOf(bend(0.38)), null, std).measure.left.pavementHW
    if (!r || r.length !== 6) bad.push(`② the planted 0.38° strip is ${r?.length ?? 0} vertices, not 6 (two ends × two, one join a side)`)
    if (atBend !== 2) bad.push(`② ${atBend} vertices at the 0.38° join, not one a side`)
    if (v.length) bad.push(`② the planted strip fails the coast's verifier alone (${v.length})`)
    if (Math.abs(e.embankments[0]?.outerM - outerM) > 1e-9) bad.push(`② the strip's outer edge ${e.embankments[0]?.outerM} m is not the pour measure's ${outerM} m`)
    let fold = false; try { S.embankmentFootprints([chainOf([[0, 0], [100, 0], [99.5, 0.2]])], { overlay: {}, std, tessellate: SCL.tessellateAdaptive, stepM: STEP }) } catch (x) { fold = /fold|turns back/.test(x.message) }
    if (!fold) bad.push('② a centreline that folds back does not refuse by name')
    out(`② planted 0.38° strip: ${r?.length ?? 0} vertices, ${atBend} at the join, verifier ${v.length}, outer ${e.embankments[0]?.outerM} m (pour ${outerM}) · fold refuses: ${fold}`) }
  // ③ the trace holds it: a 3 × 3 grid, the middle row held, the rest wet; the held ring is the strip z ∈ [0.8, 1.2]
  { const ring = [[-1, 0.8], [3, 0.8], [3, 1.2], [-1, 1.2]]
    const cross = (a, b) => { let best = null; for (let i = 0; i < 4; i++) { const p = ring[i], q = ring[(i + 1) % 4], dx = b[0] - a[0], dz = b[1] - a[1], ex = q[0] - p[0], ez = q[1] - p[1], den = dx * ez - dz * ex; if (!den) continue
      const t = ((p[0] - a[0]) * ez - (p[1] - a[1]) * ex) / den, u = ((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / den; if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, p: [a[0] + t * dx, a[1] + t * dz] } } return best?.p ?? null }
    const f = new Float32Array(9).fill(-1), kind = new Uint8Array(9); for (let i = 3; i < 6; i++) { f[i] = NaN; kind[i] = MS.KIND.HELD }
    const loops = MS.wetLoops(f, 3, 3, 0, 0, 1, { kind, heldCross: cross })
    const pts = loops.flat(), onRing = pts.filter(p => Math.abs(p[1] - 0.8) < 1e-9 || Math.abs(p[1] - 1.2) < 1e-9).length, mid = pts.filter(p => Math.abs(p[1] - 0.5) < 1e-9 || Math.abs(p[1] - 1.5) < 1e-9).length
    if (!onRing || mid) bad.push(`③ a held node's crossings are not on the held ring (${onRing} on it, ${mid} at an edge midpoint)`)
    out(`③ held crossings: ${onRing} on the ring · ${mid} at a midpoint`) }
  // ④ along the held ring the coast is the ring
  { const held = [[[0, 0], [20, 0], [20, 2], [0, 2]]]
    const W = [[-5, -10], [25, -10], [25, 0], [18, 0], [12, 0], [10.5, -0.003], [10, -0.002], [9.5, 0], [6, 0], [2, 0], [-5, 0]]
    const a = BC.runsAlongHeld([W], held, STEP), A = a.rings[0]
    if (!(A.length === 6 && a.runs === 1)) bad.push(`④ the planted contact run is ${a.runs} run(s), ${A.length} vertices, not one run of 6`)
    const W2 = [[-5, -10], [25, -10], [25, 0], [18, 0], [12, 0], [11, -3], [9, -3], [8, 0], [2, 0], [-5, 0]], b = BC.runsAlongHeld([W2], held, STEP)
    if (b.rings[0].length !== W2.length) bad.push('④ a departure 3 m from the ring was taken for an excursion')
    const W3 = [[30, -10], [30, 10], [20, 1.5], [20, 1], [19, 0], [10, 0], [10, -10]], c = BC.runsAlongHeld([W3], held, STEP)
    if (!c.rings[0].some(p => p[0] === 20 && p[1] === 0)) bad.push('④ a run round a corner does not take the ring\'s own corner (20, 0)')
    out(`④ planted run: ${a.runs} run, ${A.length} vertices (${a.dropped} crossing(s), ${a.excursions} excursion(s) dropped) · a 3 m departure kept: ${b.rings[0].length === W2.length} · the corner taken: ${c.rings[0].some(p => p[0] === 20 && p[1] === 0)}`) }
  // ⑤ the rounding sliver
  { const P = (r) => r.map(([X, Y]) => ({ X, Y }))
    const one = S.isRoundingSliver([P([[0, 0], [1000, 0], [1000, 1], [0, 1]])]), three = S.isRoundingSliver([P([[0, 0], [1000, 0], [1000, 3], [0, 3]])])
    // a 10 u blob with a 1 u tail 4000 u long: its mean width (area / longer side) is under 2 u, yet it is a feature
    const tail = S.isRoundingSliver([P([[0, 0], [10, 0], [10, 4], [4010, 4], [4010, 5], [10, 5], [10, 10], [0, 10]])])
    if (!one) bad.push('⑤ a piece 1 u wide is not a sliver'); if (three) bad.push('⑤ a piece 3 u wide is called a sliver'); if (tail) bad.push('⑤ a feature with a thin tail is called a sliver')
    out(`⑤ sliver: 1 u ${one} · 3 u ${three} · a feature with a thin tail ${tail}`) }
  // ⑥ per town
  for (const t of towns) { const cp = join(ROOT, 'cartograph/data', t, 'clean/coast.json'); if (!existsSync(cp)) { out(`⑥ ${t}: no coast.json — NOT CHECKED`); continue }
    const doc = JSON.parse(readFileSync(cp, 'utf8')); if (doc.version !== CF.COAST_VERSION) { out(`⑥ ${t}: coast.json is version ${doc.version}, the kit reads ${CF.COAST_VERSION} — NOT CHECKED (re-bake the coast)`); continue }
    if (!doc.coast) { out(`⑥ ${t}: an inland coast.json`); continue }
    const d = join(ROOT, 'cartograph/data', t), ov = existsSync(join(d, 'clean/overlay.json')) ? JSON.parse(readFileSync(join(d, 'clean/overlay.json'), 'utf8')).streets || {} : {}
    let std = null; const stdF = () => std ??= SP.highwayStandard(JSON.parse(readFileSync(join(ROOT, 'references/registry.json'), 'utf8')), SP.townState(JSON.parse(readFileSync(join(d, 'raw/osm.json'), 'utf8'))), new Map())
    const e = S.embankmentFootprints(JSON.parse(readFileSync(join(d, 'clean/skeleton.json'), 'utf8')).streets, { overlay: ov, std: stdF, tessellate: SCL.tessellateAdaptive, stepM: doc.fineM })
    const rec = doc.embankments?.held || [], same = JSON.stringify(rec.map(x => [x.street, x.outerM])) === JSON.stringify(e.embankments.map(x => [x.street, x.outerM]))
    if (!same) bad.push(`⑥ ${t}: coast.json's embankments (${rec.map(x => x.street)}) are not what embankmentFootprints gives (${e.embankments.map(x => x.street)})`)
    // a coast vertex within the ink's width of a held ring must lie ON it: closer and off it, ① strokes two lines as one
    let onN = 0, off = [], ds = []
    for (const r of doc.water.flatMap(b => [b.outer, ...b.holes])) for (const p of r) for (const h of e.rings) { const dd = ringD(p, h)
      if (dd <= 1 / CLIP_SCALE + 1e-9) onN++; else if (dd < 2 * SC.INK_EPS) off.push([p, dd]); else if (dd <= doc.fineM) ds.push(dd) }
    if (off.length) bad.push(`⑥ ${t}: ${off.length} coast vertex(es) within the ink (${2 * SC.INK_EPS} m) of a held ring yet off it: ${off.slice(0, 4).map(([p, dd]) => `(${p.join(', ')}) ${(dd * 1000).toFixed(1)} mm`).join(' · ')}`)
    out(`⑥ ${t}: ${e.embankments.length} embankment(s) · ${onN} coast vertices ON a held ring · ${off.length} within the ink and off it · ${ds.length} farther, within one step (the coast leaving the dike; nearest ${ds.length ? (Math.min(...ds) * 1000).toFixed(1) + ' mm' : '—'})`) }
  return bad
}

const MUTANTS = [
  { what: 'heldCells back to embankment=yes only', file: HOMES.coastFile, a: "t.man_made === 'dyke' || isEmbankment(t) ||", b: "t.man_made === 'dyke' || t.embankment === 'yes' ||" },
  { what: 'the strip built by ClipperOffset again', file: HOMES.structures, a: '      raw.push(stripOf(P, outer[0], who)) }', b: '      const co = new ClipperOffset(), o = new Paths(); co.AddPath(toPath(P), JoinType.jtMiter, EndType.etOpenButt); co.Execute(o, outer[0] * SCALE); raw.push(...o) }' },
  { what: 'the held crossing at the edge midpoint', file: HOMES.marching, a: 'const [d, o] = ka === KIND.HELD ? [pa, pb] : [pb, pa], c = heldCross ? heldCross(d, o) : null', b: 'const [d, o] = ka === KIND.HELD ? [pa, pb] : [pb, pa], c = heldCross ? [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2] : null' },
  { what: 'runsAlongHeld returning its rings untouched', file: HOMES.coast, a: 'export function runsAlongHeld(rings, held, stepM) {', b: 'export function runsAlongHeld(rings, held, stepM) { return { rings, runs: 0, dropped: 0, excursions: 0 }' },
  { what: 'the sliver rule back to the mean width', file: HOMES.structures, a: '  return o.every(q => Clipper.Area(q) <= 0)\n}', b: '  const A = pp.reduce((t, q) => t + Clipper.Area(q), 0), xs = pp[0].map(q => q.X), ys = pp[0].map(q => q.Y); return !(A / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) > 2)\n}' },
]

console.log('claims-a-dike-is-one-line-with-the-coast')
const R = { structures: await real('structures'), marching: await real('marching'), coast: await real('coast'), coastFile: CF0 }
const bad = await findings(R, (l) => console.log('  ' + l))
for (const b of bad) console.log(`  ⛔ ${b}`)
let miss = 0
if (mutants) for (const m of MUTANTS) {
  Object.assign(EDIT, { file: m.file, a: m.a, b: m.b })
  const key = Object.keys(HOMES).find(k => HOMES[k] === m.file), M = { ...R, [key]: await load(mutantUrl()) }
  const r = await findings(M)
  console.log(`  mutant · ${m.what}: ${r.length ? `RED ✅ (${r.length})${r.map(x => '\n      ' + x).join('')}` : '⛔ STAYED GREEN'}`)
  if (!r.length) miss++ }
console.log(bad.length || miss ? `⛔ ${bad.length} finding(s)${mutants ? `, ${miss} mutant(s) not caught` : ''}` : `✅ a dike is one line with the coast, cut once${mutants ? ', and every mutant is RED' : ''}`)
process.exit(bad.length || miss ? 1 : 0)
