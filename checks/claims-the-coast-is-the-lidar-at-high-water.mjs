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
//   7. floodFromEdge enters every no-value cell (ignore `nr`)         → A2: the no-coverage hole floods
//   8. waterAsFlown counts only rim cells BELOW high                    → A2: the Huron rim stays at high
//   11. waterAsFlown skips the level test (a stepped rim is "one level")  → A2: the stepped rim draws
//   12. bake-coast's line stays at high where the rim is flown above it    → A2: the flattened band stays dry (and B on Huron)
//   13. lineSentence drops the tidal disclosure                           → A2: the surge flight is silent
//   14. gussetReach measures from high, not from the line                 → claims-the-gusset-is-recorded: the lake's reach
//   9. bake-coast skips settleOnSource (vertices left where the trace put them) → B: p90 5.8 mm on Provincetown
//   10. the mint is given the island's hole wound the SAME way as its body  → A3: the island drowns
//   6. bake-coast cuts arcs from the UNSIMPLIFIED ring and simplifies them alone → A (in the town: B's ring/arc drift)
//
//   node checks/claims-the-coast-is-the-lidar-at-high-water.mjs [--scene=<id>] [--no-lidar]
// --no-lidar skips part B's network read (A and C still run). Exits 1 on any failure.
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import clipperLib from 'clipper-lib'
import { floodFromEdge, sheetField, heldCells, edgeCells, arcsOf, bodiesAtEdge, simplifyRing, waterAsFlown, lineOfWater, lineSentence } from '../cartograph/bake-coast.mjs'
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
  // ① STROKES THE EDGE IT EXCLUDES: the arcs are cut from the simplified ring, so every arc vertex IS a ring vertex
  // (an arc simplified apart from its ring leaves a sliver between the ink and the water).
  const ring = bodies[0].outer, simple = simplifyRing(ring, R, 0.5), key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`
  const onRing = new Set(simple.map(key))
  const sArcs = arcsOf(simple, R)
  say(simple.length <= ring.length && sArcs.length && sArcs.every(a => a.pts.every(p => onRing.has(key(p)))), `every arc vertex is a vertex of its simplified water ring (${simple.length} of ${ring.length} kept)`)
  // EVERY RUN, NOT THE LONGEST (from the retired claims-a-closed-shore-still-yields-ink: Provincetown's coast yields
  // five runs, and "take the longest" threw 55 km away): a body that meets the square on two sides is TWO shores.
  const strait = [[0, 100], [0, 300], [150, 280], [400, 300], [400, 100], [250, 120]]
  const two = arcsOf(strait, R)
  say(two.length === 2 && two.every(a => !a.closed), `a body that meets the square on two sides yields two shores (${two.length})`)
  const isle = arcsOf([[100, 100], [200, 100], [200, 200], [100, 200]], R)
  say(isle.length === 1 && isle[0].closed, 'a ring that never meets the square is a CLOSED shore, flagged (an island), never stroked as an arc')
}

// ── A2. where the lidar has no value (Boz's ruling, 2026-10-13): a cell INSIDE a survey tile with no value is NO RETURN
// (lidar does not return off open water) and the water may enter it; a cell OUTSIDE every tile is NO COVERAGE and it may
// not. Decided from the tile rasters only. And the water AS FLOWN (Jacob, 2026-10-13, Huron: "yes"): the finite cells
// bordering the water the flood entered ARE the water as flown. If most stand above high, the line is that water's
// EDGE — the water's level is the higher of high and the flown water — and the gap is the gusset. It REFUSES only when
// the flown water is not one level. A tidal town flown above its high says so in words (Boz, 2026-10-13).
console.log('A2. no return · no coverage · the water as flown (synthetic)')
{
  const W = 60, H = 40, HIGH = 1, k = (i, j) => j * W + i
  const ground = new Float32Array(W * H), nr = new Uint8Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    ground[k(i, j)] = i < 20 ? NaN : 0.5 + 0.05 * (i - 20)            // open water with NO RETURN, then a beach rising through high at i = 30
    if (i < 20) nr[k(i, j)] = 1
  }
  for (let j = 30; j < H; j++) for (let i = 0; i < 20; i++) nr[k(i, j)] = 0       // the same edge, but OUTSIDE every tile: no coverage
  for (let j = 10; j < 14; j++) for (let i = 45; i < 49; i++) { ground[k(i, j)] = NaN; nr[k(i, j)] = 1 }   // a dark roof: no return, on land
  const w = new Float32Array(W * H)
  for (let q = 0; q < W * H; q++) w[q] = HIGH - ground[q]
  const wet = floodFromEdge(w, W, H, null, nr)
  say(wet[k(5, 5)] === 1, 'open water with no lidar return, inside a tile and reaching the edge, is water')
  say(wet[k(5, 35)] === 0, 'a no-value hole OUTSIDE every tile is never entered (no coverage is not water)')
  say(wet[k(46, 11)] === 0, 'a no-return dropout on land, not connected to the water, stays land')
  say(wet[k(25, 5)] === 1 && wet[k(35, 5)] === 0, 'the beach is water below high water and land above it')
  const g = Float32Array.from(w, v => HIGH - v)
  const ok = waterAsFlown(wet, nr, w, g, W, H)
  say(ok.n > 0 && ok.share <= 0.5 && ok.line === 'high', `water flown BELOW its high level: the line is high (${(100 * ok.share).toFixed(0)}% of ${ok.n} rim cells above it)`)
  // THE HURON SHAPE: a hydro-flattened band 9 cm ABOVE high, three cells wide, between the no-return water and the beach
  const w2 = new Float32Array(w)
  for (let j = 0; j < 30; j++) for (let i = 20; i < 23; i++) w2[k(i, j)] = -0.09
  for (let j = 0; j < 30; j++) for (let i = 23; i < 30; i++) w2[k(i, j)] = Math.min(w2[k(i, j)], -0.09 - 0.01 * (i - 22))   // the beach climbs from the band
  const g2 = Float32Array.from(w2, v => HIGH - v)
  const wet2 = floodFromEdge(w2, W, H, null, nr), fl = waterAsFlown(wet2, nr, w2, g2, W, H)
  say(fl.line === 'flown' && fl.level && Math.abs(fl.gapM - 0.09) < 1e-6 && Math.abs(fl.navd88Line - (HIGH + 0.09 + ABOVE_WATER_M)) < 1e-6,
    `water flown 9 cm ABOVE its high level is drawn at its own edge: line ${fl.line}, ${fl.navd88Line?.toFixed(3)} m (high ${HIGH} + the gap ${fl.gapM?.toFixed(3)} + ABOVE_WATER_M), ${(100 * fl.levelShare).toFixed(0)}% of the rim at one level`)
  const L2 = lineOfWater(fl, () => HIGH), w3 = new Float32Array(W * H)
  for (let q = 0; q < W * H; q++) w3[q] = Number.isFinite(w2[q]) ? L2(0, 0) - g2[q] : NaN
  const wet3 = floodFromEdge(w3, W, H, null, nr)
  say(wet3[k(21, 5)] === 1 && wet3[k(22, 5)] === 1 && wet3[k(23, 5)] === 0, 'the flattened band is water and the first cell above it is land: the line is the flown water\'s edge')
  say(wet3[k(5, 35)] === 0, '…and raising the level does not open the no-coverage hole')
  const w4 = new Float32Array(w2)                                         // a STEPPED rim: three flattened levels, none a majority
  for (let j = 0; j < 20; j++) for (let i = 20; i < 23; i++) w4[k(i, j)] = j < 10 ? -0.30 : -0.20
  const g4 = Float32Array.from(w4, v => HIGH - v), st = waterAsFlown(floodFromEdge(w4, W, H, null, nr), nr, w4, g4, W, H)
  say(st.line === 'flown' && !st.level, `water flown above high at THREE levels is not one plane to draw at: refused (${(100 * st.levelShare).toFixed(0)}% of the rim within ${ABOVE_WATER_M} m of its median)`)
  const tidal = lineSentence({ tidal: true, highName: 'MHW', range: { high: [1, 1] } }, { line: 'flown', gapM: 0.4, navd88Line: 1.405 }, 1, 5)
  say(/as flown \(tidal\), 0\.40 m above MHW/.test(tidal) && /not MHW/.test(tidal), `a TIDAL town flown above its high says so: "${tidal}"`)
  const lake = lineSentence({ tidal: false, highName: 'mean', range: { high: [1, 1] } }, { line: 'flown', gapM: 0.09, navd88Line: 1.095 }, 1, 5)
  say(/as flown \(lake\), 0\.09 m above mean/.test(lake) && /gusset/.test(lake), `a lake flown above its level says so: "${lake}"`)
  const atHigh = lineSentence({ tidal: true, highName: 'MHW', range: { high: [1, 1.2] } }, { line: 'high' }, 1, 5)
  say(!/flown/.test(atHigh), `a town flown below high says nothing of it: "${atHigh}"`)
}

// ── A3. AN ISLAND IS DRAWN (Boz's ruling, 2026-10-13): its shore is a CLOSED arc stroked by ① as a roundabout is
// (SKELETON 7c), and the water carries it as a HOLE wound opposite its body. Driven through the real mint.
console.log('A3. an island closes as land (the real mint, synthetic)')
{
  const { mintProtopolygon } = await import('../src/lib/tileGround.js')
  const ringArea = r => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
  const bb = { x0: -500, x1: 500, z0: -500, z1: 500 }
  const disc = Array.from({ length: 256 }, (_, i) => [480 * Math.cos(i / 128 * Math.PI), 480 * Math.sin(i / 128 * Math.PI)])
  const water = [[-500, -500], [0, -500], [0, 500], [-500, 500]], isle = [[-275, -25], [-225, -25], [-225, 25], [-275, 25]]
  const quiet = (f) => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
  const mint = (coast) => quiet(() => mintProtopolygon({ streets: [], boundary: disc, coast, coastArcs: [[[0, -500], [0, 500]], [...isle, isle[0]]], bb }))
  const blocks = (MP) => (MP.blocks || []).map(ringArea).sort((a, b) => a - b)
  const withHole = blocks(mint([water, [...isle].reverse()]))
  say(withHole.length === 2 && Math.abs(withHole[0] - 2500) < 5, `a 50 m island, a hole in the water with a closed shore arc, closes as a land block (${withHole.map(Math.round).join(' · ')} m²)`)
  const noHole = blocks(mint([water]))
  say(noHole.length === 1, `…and the same island with NO hole in the water is covered by it — the hole is what draws it (${noHole.length} block)`)
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
    if (!K.level?.line) { say(false, `${scene}: coast.json names no line (level.line) — baked before the water as flown was read. ▶ node cartograph/bake-coast.mjs --scene=${scene}`); continue }
    if (noLidar) continue
    const r = await lidarAlong(scene, K)
    say(r.known > 0 && r.p90 <= r.tolM, `${scene}: the lidar read back at ${r.known} station(s) along the line stands at ${K.level.line === 'flown' ? `the flown water's edge (${K.level.navd88Line} m)` : K.level.high}: |lidar − line| p50 ${r.p50.toFixed(3)} · p90 ${r.p90.toFixed(3)} m (≤ ${r.tolM} m)${r.unknown ? ` · ${r.unknown} station(s) with no lidar value` : ''}`)
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
  const lineAt = K.level.line === 'flown' ? () => K.level.navd88Line : L.highAt      // the line coast.json says it drew
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
    for (const p of pts) { const v = sampleSources(win, ...toLL(p[0], p[1])); if (Number.isFinite(v)) d.push(Math.abs(v - lineAt(p[0], p[1]))); else unknown++ }
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
