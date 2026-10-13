// claims-the-coast-is-the-lidar-at-high-water.mjs
//
// ⭐⭐ THE COAST IS WHERE THE LIDAR MEETS HIGH WATER (Jacob, 2026-10-11; BRIEF-the-coast-from-the-lidar). Three parts:
//   A. THE CONSTRUCTION, on a synthetic town (no network): a beach sloping through high water, a hollow below high water
//      behind a dune, and a marsh whose only way to the sea is closed by a mapped dike. The water is the beach's sea and
//      nothing else; every traced vertex stands AT high water; every arc runs off the square at both ends.
//   B. THE TOWNS: for each town with a water record, `clean/coast.json` exists, says `coast: true`, and the lidar read
//      back along its arcs stands at high water there (the source read again, never the artifact trusted).
//   C. ONE SOURCE: no bake reads OSM's coast as geometry. Only bake-coast imports coastVerify.mjs, and its export
//      returns no arcs.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. floodFromEdge seeds every cell below high, not only the edge's   → A: the hollow floods
//   2. heldCells skips every line (`continue` always)                     → A: the marsh floods through the dike
//   3. arcsOf keeps a run along the square's edge (drop the alongSquare test) → A: an arc lies on the square
//   3b. arcsOf returns only its first run (`return out.slice(0, 1)`)          → A: the strait yields one shore
//   4. bake-coast traces `v - lowAt` instead of `v - highAt`             → B: the lidar along the line stands off high
//   5. derive.js imports coastVerify.mjs                                  → C
//
//   node checks/claims-the-coast-is-the-lidar-at-high-water.mjs [--scene=<id>] [--no-lidar]
// --no-lidar skips part B's network read (A and C still run). Exits 1 on any failure.
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import clipperLib from 'clipper-lib'
import { floodFromEdge, sheetField, heldCells, edgeCells, arcsOf, bodiesAtEdge } from '../cartograph/bake-coast.mjs'
import { COAST_FILE } from '../cartograph/coastFile.mjs'
import { wetLoops } from '../cartograph/marchingSquares.mjs'
import { CLIP_SCALE as SCALE } from '../src/lib/lattice.js'
import { elevationSpecs, openRasters, readWindow, sampleSources, ABOVE_WATER_M } from '../cartograph/elevationSources.mjs'
import { authoredWater, waterRecord } from '../cartograph/waterDatums.mjs'
import { waterLevels } from '../cartograph/waterLevel.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const only = args.map(a => a.match(/^--scene=(.+)$/)).find(Boolean)?.[1]
const noLidar = args.includes('--no-lidar')
let failed = false
const say = (ok, msg) => { if (!ok) failed = true; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }

// ── A. the construction, on a synthetic town ─────────────────────────────────────────────────────────────────────────
console.log('A. the construction (synthetic)')
{
  const G = 5, W = 81, H = 81, HIGH = 1                                  // a 400 m square, high water at 1 m
  const R = { x0: 0, x1: 400, z0: 0, z1: 400 }
  // Every feature is LINEAR between grid samples (ramps one cell wide), so a vertex interpolated on a grid edge is
  // exactly where the synthetic ground crosses high water — the property the town's lidar has between its samples.
  const beach = (x) => 0.02 * (x - 120) + HIGH                           // crosses high water at x = 120
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t))
  const box = (x, z, x0, x1, z0, z1) => Math.min(1, Math.max(0, (x - x0 + G) / G), Math.max(0, (x1 + G - x) / G), Math.max(0, (z - z0 + G) / G), Math.max(0, (z1 + G - z) / G))
  const ground = (x, z) => {
    let g = beach(x)
    g = lerp(g, 0.5, box(x, z, 250, 300, 120, 200))                      // a hollow behind the dune: below high, cut off
    if (x >= 120) g = lerp(g, 0.5, box(x, z, 115, 230, 310, 330))         // a channel from the beach to a marsh…
    return g
  }
  const w = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) w[j * W + i] = HIGH - ground(i * G, j * G)
  // …closed by a mapped dike across the channel at x = 160
  const osmGround = { barrier: [{ tags: { man_made: 'dyke' }, coords: [{ x: 160, z: 290 }, { x: 160, z: 350 }] }] }
  const { held, n } = heldCells(osmGround, { W, H, x0: 0, z0: 0, step: G })
  const wet = floodFromEdge(w, W, H, held)
  const at = (x, z) => wet[Math.round(z / G) * W + Math.round(x / G)]
  say(n > 0, `the dike is drawn into the grid (${n} cells)`)
  say(at(50, 50) === 1, 'the sea at (50, 50) is water')
  say(at(275, 160) === 0 && ground(275, 160) < HIGH, 'the hollow behind the dune at (275, 160) stays dry: below high water, but the sea does not reach it')
  say(at(200, 320) === 0 && ground(200, 320) < HIGH, 'the marsh behind the dike at (200, 320) stays dry: the dike holds')
  say(at(140, 320) === 1 && ground(140, 320) < HIGH, 'the channel on the sea side of the dike at (140, 320) is water')

  const fc = sheetField(wet, w)
  const C = clipperLib
  const toPath = (r) => r.map(([x, z]) => ({ X: Math.round(x * SCALE), Y: Math.round(z * SCALE) }))
  const c = new C.Clipper(); c.AddPaths(wetLoops(fc, W, H, 0, 0, G).map(toPath), C.PolyType.ptSubject, true)
  const sheet = new C.Paths(); c.Execute(C.ClipType.ctUnion, sheet, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftNonZero)
  const sq = [toPath([[0, 0], [400, 0], [400, 400], [0, 400]])]
  const c2 = new C.Clipper(); c2.AddPaths(sheet, C.PolyType.ptSubject, true); c2.AddPaths(sq, C.PolyType.ptClip, true)
  const water = new C.Paths(); c2.Execute(C.ClipType.ctIntersection, water, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)
  const { bodies } = bodiesAtEdge(water, R, (2 * G) ** 2)
  say(bodies.length === 1, `one water body reaches the square's edge (${bodies.length})`)
  const arcs = bodies.flatMap(b => [b.outer, ...b.holes].flatMap(r => arcsOf(r, R)))
  const on = (p) => [p[0] - 0, 400 - p[0], p[1] - 0, 400 - p[1]].some(d => Math.abs(d) < 1e-3)
  say(arcs.length > 0 && arcs.every(a => !a.closed && on(a.pts[0]) && on(a.pts[a.pts.length - 1])), `every arc is open and runs off the square at both ends (${arcs.length})`)
  const side = (p, q) => [[0, 0], [0, 400], [1, 0], [1, 400]].some(([c, v]) => Math.abs(p[c] - v) < 1e-3 && Math.abs(q[c] - v) < 1e-3)
  say(arcs.every(a => a.pts.slice(1, -1).every(p => !on(p)) && a.pts.every((p, k) => !k || !side(a.pts[k - 1], p))), 'no arc runs along the square\'s edge (no vertex on it but the ends, no segment along a side)')
  let worst = 0, n2 = 0
  // the dike is the one place the line is NOT at high water: it is drawn where the map holds the water (within a cell)
  for (const a of arcs) for (const p of a.pts.slice(1, -1)) { if (Math.abs(p[0] - 160) <= G) continue; n2++; worst = Math.max(worst, Math.abs(ground(p[0], p[1]) - HIGH)) }
  say(n2 > 0 && worst < 1e-3, `every traced vertex off the dike stands at high water: worst |ground − high| ${worst.toFixed(5)} m over ${n2} vertices`)
  say(edgeCells(wet, w, W, H).length > 0, 'the sheet has a wet/dry edge to refine along')
  // EVERY RUN, NOT THE LONGEST (from the retired claims-a-closed-shore-still-yields-ink: Provincetown's coast yields
  // five runs, and "take the longest" threw 55 km away): a body that meets the square on two sides is TWO shores.
  const strait = [[0, 100], [0, 300], [150, 280], [400, 300], [400, 100], [250, 120]]
  const two = arcsOf(strait, R)
  say(two.length === 2 && two.every(a => !a.closed), `a body that meets the square on two sides yields two shores (${two.length})`)
  const isle = arcsOf([[100, 100], [200, 100], [200, 200], [100, 200]], R)
  say(isle.length === 1 && isle[0].closed, 'a ring that never meets the square is a CLOSED shore, flagged (an island), never stroked as an arc')
}

// ── B. the towns ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('B. the towns')
{
  const dataDir = join(ROOT, 'cartograph', 'data')
  const scenes = fs.readdirSync(dataDir).filter(s => (!only || s === only) && fs.existsSync(join(dataDir, s, 'raw', 'water-datums.json')))
  if (!scenes.length) say(false, `no town with a water record${only ? ` named ${only}` : ''} — nothing to read`)
  for (const scene of scenes) {
    const p = join(dataDir, scene, 'clean', COAST_FILE)
    if (!fs.existsSync(p)) { say(false, `${scene}: has a water record and no clean/${COAST_FILE} — its coast is not drawn from the lidar. ▶ node cartograph/bake-coast.mjs --scene=${scene}`); continue }
    const K = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (!K.coast) { say(false, `${scene}: has a water record and coast.json says no coast (${K.why})`); continue }
    say(K.arcs?.length > 0, `${scene}: ${K.arcs.length} arc(s), ${K.water.length} water bod(ies), drawn ${K.from}`)
    if (noLidar) continue
    const r = await lidarAlong(scene, K)
    say(r.known > 0 && r.p90 <= r.tolM, `${scene}: the lidar read back at ${r.known} station(s) along the line stands at ${K.level.high}: |lidar − high| p50 ${r.p50.toFixed(3)} · p90 ${r.p90.toFixed(3)} m (≤ ${r.tolM} m)${r.unknown ? ` · ${r.unknown} station(s) with no lidar value` : ''}`)
  }
}

// The lidar, read again at its own finest pixel at every arc vertex inside the disc (the drawing), grouped into windows.
// ⭐ The tolerance is ABOVE_WATER_M — half the 1 cm bucket the datum is found in: the line is traced where the bilinear
// lidar crosses high water and simplified only by dropping vertices, so a kept vertex stands on the crossing.
async function lidarAlong(scene, K) {
  const mapDir = join(ROOT, 'cartograph', 'data', scene)
  const rd = (f) => JSON.parse(fs.readFileSync(join(mapDir, f), 'utf8'))
  const geo = rd('geography.json'), bnd = rd('neighborhood_boundary.json')
  const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
  const toLocal = (lon, lat) => [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]
  const L = waterLevels(waterRecord({ mapDir, scene, auth: authoredWater(scene), wgs84ToLocal: toLocal, zero: 0 }))
  const opened = await openRasters(elevationSpecs(mapDir), { cacheMB: 128 })
  const T = 256, groups = new Map()
  for (const a of K.arcs) for (const p of a.slice(1, -1)) {
    if (Math.hypot(p[0] - bnd.center[0], p[1] - bnd.center[1]) > bnd.radius) continue
    const key = `${Math.floor(p[0] / T)},${Math.floor(p[1] / T)}`
    ;(groups.get(key) || groups.set(key, []).get(key)).push(p)
  }
  const d = []
  let unknown = 0
  for (const [key, pts] of groups) {
    const [i, j] = key.split(',').map(Number), m = 4
    const win = await readWindow(opened, { cornersLL: [toLL(i * T - m, j * T - m), toLL(i * T + T + m, j * T - m), toLL(i * T - m, j * T + T + m), toLL(i * T + T + m, j * T + T + m)], stepM: null, quiet: true })
    for (const p of pts) { const v = sampleSources(win, ...toLL(p[0], p[1])); if (Number.isFinite(v)) d.push(Math.abs(v - L.highAt(p[0], p[1]))); else unknown++ }
    win.length = 0
  }
  d.sort((a, b) => a - b)
  const q = (f) => d.length ? d[Math.min(d.length - 1, Math.floor(f * d.length))] : NaN
  return { known: d.length, unknown, p50: q(0.5), p90: q(0.9), tolM: ABOVE_WATER_M }
}

// ── C. one source ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('C. one source')
{
  const files = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '_archive' || e.name === 'data' || e.name.startsWith('.')) continue
    const f = join(d, e.name)
    if (e.isDirectory()) walk(f); else if (/\.(m?js|jsx)$/.test(e.name)) files.push(f) } }
  walk(join(ROOT, 'cartograph')); walk(join(ROOT, 'src'))
  const importers = files.filter(f => /coastVerify\.mjs['"]/.test(fs.readFileSync(f, 'utf8'))).map(f => f.slice(ROOT.length + 1))
  say(importers.length === 1 && importers[0] === 'cartograph/bake-coast.mjs', `only bake-coast imports OSM's water (${importers.join(', ') || 'none'})`)
  const legacy = files.filter(f => /\bcoastRings\s*\(|coastline\.mjs['"]/.test(fs.readFileSync(f, 'utf8')) && !f.endsWith('coastVerify.mjs')).map(f => f.slice(ROOT.length + 1))
  say(!legacy.length, `nothing calls coastRings or imports coastline.mjs outside the instrument${legacy.length ? `: ${legacy.join(', ')}` : ''}`)
  const v = fs.readFileSync(join(ROOT, 'cartograph', 'coastVerify.mjs'), 'utf8')
  const body = (v.match(/export function osmWaterToVerify[\s\S]*?\n\}/) || [''])[0]
  say(/return \{ rings: c\.rings, report: c\.report \}/.test(body) && !/arcs/.test(body.replace(/No arcs[^\n]*/g, '')), 'the verifier returns rings and a report, no arcs')
  for (const [f, re, what] of [['cartograph/derive.js', /COAST_FILE|coast\.json/, 'derive.js reads coast.json'],
                               ['cartograph/bake-terrain.js', /COAST_FILE|coast\.json/, 'bake-terrain reads coast.json'],
                               ['cartograph/bake-coast-distance.js', /COAST_FILE|coast\.json/, 'bake-coast-distance reads coast.json']])
    say(re.test(fs.readFileSync(join(ROOT, f), 'utf8')), what)
}

console.log(failed ? '\n⛔ RED' : '\n✅ GREEN')
process.exit(failed ? 1 : 0)
