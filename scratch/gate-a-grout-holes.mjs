#!/usr/bin/env node
/**
 * GATE A of the grout build (RIBBONS §1, ruled 2026-09-04). READ-ONLY, touches no src.
 *
 * THE ONE QUESTION: stroke every chain at ε, unite, subtract from the stencil —
 * DOES THE HOLE COUNT MATCH THE BLOCK COUNT?
 *
 * No widths, no authoring, no offsets. If it does not match, the model is wrong before
 * anything else matters. If it matches on LS AND on a town nobody has authored, that is the
 * strongest single result available for the grout.
 *
 * ⭐ The stencil is derived from the ARTIFACT — the union of the frozen tile rings — not from
 * extent config, so this ports to any town with a bake.
 * ⛔ SCOPE: topology only. IDENTITY is not tested here; the mechanism for it already exists
 *    (`unionRingLabelled` / the A06 labelled boolean, tileGround.js:429/:344) and belongs to
 *    Gate B, where the strokes carry their authored widths.
 * ⛔ ε is a DECLARATION, not a tolerance — its only requirement is clearing the integer floor
 *    of the stage that would freeze it (prebake, 1 cm). Default 5 cm; sweep with --eps.
 *
 *   node scratch/gate-a-grout-holes.mjs [scene ...] [--eps 0.05] [--keep-grade-separated]
 */
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { Clipper, ClipperOffset, JoinType, EndType, ClipType, PolyType, PolyFillType, PolyTree } = clipperLib

const args = process.argv.slice(2)
const EPS = args.includes('--eps') ? Number(args[args.indexOf('--eps') + 1]) : 0.05
const KEEPGS = args.includes('--keep-grade-separated')
const scenes = args.filter(a => !a.startsWith('--') && !/^[\d.]+$/.test(a))
const SCENES = scenes.length ? scenes : ['lafayette-square', 'hipointe-demun', 'altadena']
const SCALE = 1000, ARC = 0.01 * SCALE
const toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i].X * r[j].Y - r[j].X * r[i].Y } return a / 2 / (SCALE * SCALE) }
const o = console.log

o(`GATE A — grout hole count vs block count.  ε = ${EPS} m  (prebake integer floor 0.01 m)\n`)
for (const scene of SCENES) {
  const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
  if (!fs.existsSync(RIB)) { o(`${scene}: missing ${RIB} — SKIPPED LOUDLY\n`); continue }
  const rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
  const tiles = rb.tiles || []
  if (!tiles.length) { o(`${scene}: no frozen tiles — SKIPPED LOUDLY\n`); continue }

  // ── the STENCIL, from the artifact: the union of the frozen tile rings.
  const cl0 = new Clipper()
  for (const t of tiles) if (t.ring?.length >= 3) cl0.AddPath(t.ring.map(toC), PolyType.ptSubject, true)
  const stencil = []
  cl0.Execute(ClipType.ctUnion, stencil, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

  // ── the GROUT: every chain stroked at ε, united.
  const streets = rb.streets.filter(s => s.points?.length >= 2 && (KEEPGS || !s.gradeSeparated))
  const co = new ClipperOffset(2.0, ARC)
  for (const s of streets) co.AddPath(s.points.map(toC), JoinType.jtRound, EndType.etOpenRound)
  const grout = []
  co.Execute(grout, EPS * SCALE)

  // ── blocks = stencil − grout
  const cl = new Clipper()
  cl.AddPaths(stencil, PolyType.ptSubject, true)
  cl.AddPaths(grout, PolyType.ptClip, true)
  const tree = new PolyTree()
  cl.Execute(ClipType.ctDifference, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const all = Clipper.PolyTreeToPaths(tree)
  const outers = [], holes = []
  for (const p of all) (area(p) > 0 ? outers : holes).push(p)
  const A = outers.map(area).map(Math.abs)
  const SLIVER = 1.0                        // m² — below this is not a city block
  const real = A.filter(a => a >= SLIVER)
  const slivers = A.filter(a => a < SLIVER)

  // ── POLYGON-FIRST checks 1-2, applied to the NEW rings
  const K = p => `${p.X},${p.Y}`
  let repeated = 0, zeroArea = 0
  for (const p of outers) {
    if (Math.abs(area(p)) < 1e-6) zeroArea++
    const seen = new Set(); let dup = false
    for (const q of p) { const k = K(q); if (seen.has(k)) dup = true; seen.add(k) }
    if (dup) repeated++
  }
  // ── WHERE DO THE EXTRAS COME FROM? Each new ring's centroid must fall inside exactly ONE
  // frozen tile. If every one does, the grout SUBDIVIDES frozen tiles — it invents no region,
  // and a surplus means the freeze MERGED faces the grout separates.
  const cen = p2 => { let a = 0, cx = 0, cy = 0; for (let i = 0; i < p2.length; i++) { const j = (i + 1) % p2.length; const cr = p2[i].X * p2[j].Y - p2[j].X * p2[i].Y; a += cr; cx += (p2[i].X + p2[j].X) * cr; cy += (p2[i].Y + p2[j].Y) * cr } a /= 2; return a ? [cx / (6 * a) / SCALE, cy / (6 * a) / SCALE] : [p2[0].X / SCALE, p2[0].Y / SCALE] }
  const inRing = (q, rg) => { let ins = false; for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) { const xi = rg[i][0], zi = rg[i][1], xj = rg[j][0], zj = rg[j][1]; if ((zi > q[1]) !== (zj > q[1]) && q[0] < (xj - xi) * (q[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
  const hits = new Map(); let orphan = 0
  for (const p2 of outers) {
    if (Math.abs(area(p2)) < SLIVER) continue
    const c = cen(p2)
    let owner = -1
    for (let ti = 0; ti < tiles.length; ti++) if (tiles[ti].ring?.length >= 3 && inRing(c, tiles[ti].ring)) { owner = ti; break }
    if (owner < 0) orphan++
    else hits.set(owner, (hits.get(owner) || 0) + 1)
  }
  const split = [...hits.values()].filter(v => v > 1).length
  const unhit = tiles.length - hits.size
  const groutArea = grout.map(area).reduce((a, b) => a + Math.abs(b), 0)
  o(`${scene}`)
  o(`   chains stroked ${streets.length}${KEEPGS ? '' : ` (grade-separated excluded: ${rb.streets.length - streets.length})`}   grout area ${groutArea.toFixed(1)} m²`)
  o(`   frozen tiles           : ${tiles.length}`)
  o(`   grout holes (>= ${SLIVER} m²) : ${real.length}     ${real.length === tiles.length ? '✅ MATCH' : `⛔ ${real.length > tiles.length ? '+' : ''}${real.length - tiles.length}`}`)
  o(`   sub-${SLIVER}m² slivers      : ${slivers.length}${slivers.length ? `  (largest ${Math.max(...slivers).toFixed(3)} m²)` : ''}`)
  o(`   ⛔ rings with a REPEATED VERTEX (Check 2 — the slit) : ${repeated}`)
  o(`   ⛔ rings with ZERO AREA        (Check 1)             : ${zeroArea}`)
  o(`   new rings landing in NO frozen tile (invented region) : ${orphan}`)
  o(`   frozen tiles SUBDIVIDED by the grout (>1 new ring)    : ${split}   frozen tiles with no new ring: ${unhit}`)
  o(`   block area total ${real.reduce((a, b) => a + b, 0).toFixed(0)} m²   frozen tile-ring total ${tiles.map(t => Math.abs(area(t.ring.map(toC)))).reduce((a, b) => a + b, 0).toFixed(0)} m²\n`)
}
