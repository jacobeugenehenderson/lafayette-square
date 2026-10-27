#!/usr/bin/env node
/**
 * bake-coast.mjs — THE COAST IS WHERE THE LIDAR MEETS HIGH WATER (Jacob, 2026-10-11; BRIEF-the-shore-is-one-line §1).
 *
 * *"Can we compute the whole sheet for the lidar and find the actual moment of intersection with the shoreline … and
 * then discard the sheet?"* ⇒ The coast is where the surveyed ground meets the town's HIGH-water level (the tide datum
 * where tidal, MHW by default; the authored lake level on a lake). The sheet that finds it is thrown away once it has:
 * one outline, from the lidar. It is ①'s coast source (derive.js reads clean/coast.json) and the drawn water's outline.
 * Ported from tern/coast-from-lidar's building blocks (not the branch), against today's readers.
 *
 * ⭐⭐ THE DATUM CANNOT DEPEND ON THE LINE IT MOVES. The lidar and the water record are both NAVD88, so the line is
 * found from the two of them with no datum at all (waterDatums.mjs#waterRecord with zero = 0).
 *
 * ── HOW ────────────────────────────────────────────────────────────────────────
 *   1. THE COARSE SHEET — the lidar over the whole fetched square (geography.mjs#localBB: the frame ① closes against)
 *      on the terrain's grid (TERRAIN_STEP_M, the box mean of level 0: elevationSources.mjs#rasterToGrid). Water = ground
 *      below high water CONNECTED to the square's edge, so a hollow or a diked marsh behind the shore stays dry. A mapped
 *      dike (man_made=dyke · embankment=yes · waterway=dam) holds the water. Where a tile holds no value the lidar had
 *      NO RETURN (it does not return off open water) and the water may enter; outside every tile there is NO COVERAGE
 *      and it may not (Boz's ruling, 2026-10-13).
 *   2. ⭐ THE DECKS ARE NOT GROUND (Jacob, 2026-10-25; structures.mjs). The lidar returns off a pier's deck, so a trace
 *      at high water would draw every pier as land. Every mapped deck (structures.mjs#deckStructures: DECK_KINDS, by tag,
 *      from every bucket; a line at OSM `width`, else f-ufc-main-walkway-width) is read as NO RETURN: the water may
 *      enter it and the coast runs under it. The deck itself is its own off-the-ground object, not this file's.
 *   3. THE LINE — along the coarse sheet's wet/dry edge, the lidar is read again at its own finest pixel and the line is
 *      traced by marching squares where lidar − high = 0. Away from the edge the coarse sheet stands.
 *   4. THE WATER — the union, clipped to the square; only bodies that reach the square's edge are kept (the rest are
 *      hollows below high water, not the sea). Rings and holes below what the source resolves (two pixels square) go.
 *      Outers are written counter-clockwise and holes clockwise (positive and negative signed area), so a nonzero fill
 *      in the mint reads a hole as a hole (▶ checks/claims-the-coast-is-the-lidars.mjs).
 *   5. THE ARCS — each water ring split where it runs along the square's edge: the open shoreline ① strokes as ink. An
 *      ISLAND is a hole in the water and its shore one CLOSED arc (first point = last).
 *
 * ── WHAT REFUSES, BY NAME ──────────────────────────────────────────────────────
 *   a water record and no OSM water to verify against · OSM water and no water record · no lidar · a lidar that is not
 *   NAVD88 · ⭐ WATER FLOWN ABOVE ITS HIGH LEVEL (Boz, 2026-10-25): the line would be the flown water's edge and the bank
 *   from there down to the water has no owner (the gusset that owned it is retired), so it refuses with the numbers and
 *   the call is Jacob's: the authored level or the flown edge · the lidar and the OSM water disagreeing at a MAJORITY ·
 *   no water reaching the square's edge.
 * ⛔ OSM is a VERIFIER here, never geometry (Boz's ruling, 2026-10-13): coastline.mjs#coastRings, the one reading of
 *   "this is water", and the lidar must agree. There is no fallback to it anywhere.
 *
 *   node cartograph/bake-coast.mjs --scene=<id> [--out-dir=<dir>]
 * Writes cartograph/data/<scene>/clean/coast.json (or <dir>/coast.json). An inland town (no water record, no OSM
 * water reaching the fetch's edge) gets `{ coast: false, why }`, never an absent file.
 */
import fs from 'fs'
import { join } from 'path'
import clipperLib from 'clipper-lib'
import { CARTOGRAPH_DIR } from './config.js'
import { requireExplicitMap } from './scene.js'
import { writeIfChanged } from './io.js'
import { geographyFor, projectorOf, metresPerDegree, localBB } from './geography.mjs'
import { elevationSpecs, openRasters, readWindow, rasterToGrid, sampleSources, inCoverage, pixelMetres, demVerticalDatum, TERRAIN_STEP_M, terrainLattice } from './elevationSources.mjs'
import { authoredWater, waterRecord } from './waterDatums.mjs'
import { waterLevels } from './waterLevel.mjs'
import { wetLoops, KIND } from './marchingSquares.mjs'
import { coastRings } from './coastline.mjs'
import { deckFootprints } from './structures.mjs'
import { CLIP_SCALE as SCALE } from '../src/lib/lattice.js'          // clipper units per metre: 1 mm
import { COAST_FILE, heldCells, ringViolations, ringsMeet } from './coastFile.mjs'
import { outlineCorner, INK_EPS } from '../src/lib/tileGround.js'
import { lidarToRecordM, FLIGHTS_FILE } from './fetch-lidar-flights.mjs'
import { discOf } from './boundaryRecords.mjs'

const { Clipper, ClipperOffset, Paths, Path, IntPoint, PolyTree, ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib

export const COAST_VERSION = 1

/** The square tile, in metres, the fine line is traced in. ⛔ Not a geometric value: every tile samples ONE global lattice
 *  (the square's origin, the source's own pixel) and keeps only the loops inside its own square, padded for reading only,
 *  so where its edges fall changes nothing; it bounds memory and one read's size. */
const TILE_M = 256

const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))); return p }
const fromPath = (path) => path.map(q => [q.X / SCALE, q.Y / SCALE])
const clip = (op, subj, clp, fill = PolyFillType.pftNonZero) => {
  if (!subj.length) return new Paths()                     // nothing in, nothing out: Clipper calls an empty subject a failure
  const c = new Clipper(), out = new Paths()
  c.AddPaths(subj, PolyType.ptSubject, true)
  if (clp) c.AddPaths(clp, PolyType.ptClip, true)
  if (!c.Execute(op, out, fill, PolyFillType.pftNonZero)) {
    const bad = [...subj, ...(clp || [])].reduce((t, p) => t + p.filter(q => !Number.isFinite(q.X) || !Number.isFinite(q.Y)).length, 0)
    throw new Error(`⛔ bake-coast: a clipper ${Object.keys(ClipType).find(k => ClipType[k] === op)} FAILED on ${subj.length} + ${(clp || []).length} path(s), ${bad} non-finite vertex(es)`)
  }
  return out
}
const areaM2 = (paths) => paths.reduce((t, p) => t + Clipper.Area(p), 0) / (SCALE * SCALE)
const signedArea = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const ringArea = (r) => Math.abs(signedArea(r))
/** The ring wound to `sign` (+1: positive signed area, an outer; −1: a hole). */
export const wound = (r, sign) => (Math.sign(signedArea(r)) === sign ? r : [...r].reverse())

/**
 * THE SHEET'S WATER: cells whose ground lies below high water (`w > 0`, w = high − ground) or that hold NO RETURN
 * (`nr`), CONNECTED, 4-way, to the grid's edge. A `held` cell (a mapped dike) is never entered.
 * @returns Uint8Array, 1 = water
 */
export function floodFromEdge(w, W, H, held = null, nr = null) {
  const wet = new Uint8Array(W * H), queue = new Int32Array(W * H)
  let qt = 0
  const seed = (k) => { if (!wet[k] && (w[k] > 0 || (nr && nr[k])) && !(held && held[k])) { wet[k] = 1; queue[qt++] = k } }
  for (let i = 0; i < W; i++) { seed(i); seed((H - 1) * W + i) }
  for (let j = 0; j < H; j++) { seed(j * W); seed(j * W + W - 1) }
  for (let qh = 0; qh < qt; qh++) {
    const k = queue[qh], i = k % W, j = (k - i) / W
    if (i > 0) seed(k - 1)
    if (i + 1 < W) seed(k + 1)
    if (j > 0) seed(k - W)
    if (j + 1 < H) seed(k + W)
  }
  return wet
}

/**
 * THE SHEET'S FIELD for the tracer (≤ 0 = water): lidar − high where the water reached, and on dry ground with a lidar
 * value, so the line is interpolated between two TRUE heights. ⛔ No stand-in values (a sentinel is not a value): a
 * reached cell with no lidar is KIND.NO_RETURN; an unreached one with none, KIND.NO_COVERAGE; ground below high water the
 * sea does not reach (a hollow, a held marsh) is KIND.DRY_BY_RULE. Each is NaN in `f` and named in `kind`.
 */
export function sheetField(wet, w) {
  const f = new Float32Array(wet.length), kind = new Uint8Array(wet.length)
  for (let k = 0; k < wet.length; k++) {
    const v = w[k]
    if (wet[k]) { if (Number.isFinite(v)) f[k] = -v; else { f[k] = NaN; kind[k] = KIND.NO_RETURN } }
    else if (!Number.isFinite(v)) { f[k] = NaN; kind[k] = KIND.NO_COVERAGE }
    else if (v >= 0) { f[k] = NaN; kind[k] = KIND.DRY_BY_RULE }       // unreached at or below high: dry by rule, its height moot
    else f[k] = -v                                                    // dry above high water: a true height
  }
  return { f, kind }
}

/**
 * THE WATER AS FLOWN — the guard. The finite cells bordering the no-return water the flood entered ARE the water as
 * flown (a hydro-flattened rim). If most stand ABOVE high water, the water was flown above its chosen level: the flood
 * at high stops on the water's own surface and the coast would be drawn offshore, or at the flown edge with a bank down
 * to the water that nothing owns. bakeCoast REFUSES on it, with these numbers (Boz, 2026-10-25).
 * @returns { n, above, share, gapM } — gapM is the median height of the above-high rim over high water
 */
export function waterAsFlown(wet, nr, w, W, H) {
  const above = []
  let n = 0
  for (let k = 0; k < W * H; k++) {
    if (!Number.isFinite(w[k])) continue
    const i = k % W, j = (k - i) / W
    const nb = [i > 0 && k - 1, i + 1 < W && k + 1, j > 0 && k - W, j + 1 < H && k + W]
    if (!nb.some(q => q !== false && wet[q] && nr[q])) continue
    n++
    if (w[k] < 0) above.push(-w[k])
  }
  above.sort((x, y) => x - y)
  return { n, above: above.length, share: n ? above.length / n : 0, gapM: above.length ? above[above.length >> 1] : null }
}

/**
 * The flattened water's level: the EXACT mode of `ground` (the lidar's own value) over the wet cells with a value, decks
 * excluded, reported on the water record's basis (+ toRecordM).
 * @returns { navd88, lidarM, toRecordM, share, cells } — share = the mode's count over every wet cell with a value; null with no mode
 */
export function flattenedWater(wet, deck, ground, toRecordM = 0) {
  const hist = new Map()
  let cells = 0
  for (let k = 0; k < wet.length; k++) {
    if (!wet[k] || deck[k] || !Number.isFinite(ground[k])) continue
    cells++
    const key = Math.fround(ground[k])                                  // the sheet is ONE value: its EXACT mode, no bucket (Zob)
    hist.set(key, (hist.get(key) || 0) + 1)
  }
  let mode = null, best = 0
  for (const [key, c] of hist) if (c > best) { best = c; mode = key }
  return best >= 2 ? { navd88: +(mode + toRecordM).toFixed(4), lidarM: mode, toRecordM, share: +(best / cells).toFixed(4), cells } : null
}

/**
 * THE SHEET'S INPUTS, per cell: `w` = high − ground; `nr` = NO RETURN (no value inside a tile, or a deck); `deck`.
 * ⭐ A deck cell is no return whatever the lidar read there (its deck), so the water runs under it. `ground` is the coarse
 * lidar (NaN = no value) and is cleared on a deck, in place. `covered(x, z)` tells no return from no coverage.
 */
export function markSheet({ ground, W, H, X, Z, highAt, onDeck, covered }) {
  const w = new Float32Array(W * H), nr = new Uint8Array(W * H), deck = new Uint8Array(W * H)
  let noLidar = 0, noCover = 0, deckCells = 0
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i
    if (onDeck(X(i), Z(j))) { ground[k] = NaN; w[k] = NaN; nr[k] = 1; deck[k] = 1; deckCells++; continue }
    w[k] = highAt(X(i), Z(j)) - ground[k]
    if (!Number.isFinite(ground[k])) { noLidar++; if (covered(X(i), Z(j))) nr[k] = 1; else noCover++ }
  }
  return { w, nr, deck, noLidar, noCover, deckCells }
}


/** The cells on the sheet's wet/dry edge: a wet cell beside a dry one with a lidar value, or the reverse. */
export function edgeCells(wet, w, W, H) {
  const out = []
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i
    if (!wet[k] && !Number.isFinite(w[k])) continue
    const nb = [i > 0 && k - 1, i + 1 < W && k + 1, j > 0 && k - W, j + 1 < H && k + W]
    if (nb.some(q => q !== false && wet[q] !== wet[k] && (wet[k] ? Number.isFinite(w[q]) : true))) out.push(k)
  }
  return out
}

/** The square's edge, within a millimetre (the clipper's own unit after the clip). */
const onSquare = (p, R) => Math.abs(p[0] - R.x0) < 1e-3 || Math.abs(p[0] - R.x1) < 1e-3 || Math.abs(p[1] - R.z0) < 1e-3 || Math.abs(p[1] - R.z1) < 1e-3

/**
 * THE ARCS: a water ring split where it runs along the square's edge. Each maximal run of vertices off the edge, with
 * the edge vertex at each end, is one open shoreline. A ring with no vertex on the edge (an island) returns one CLOSED
 * loop, flagged `closed`.
 * @returns [{ pts, closed }]
 */
export function arcsOf(ring, R) {
  const n = ring.length, on = ring.map(p => onSquare(p, R))
  const first = on.indexOf(true)
  if (first < 0) return [{ pts: ring.map(p => [p[0], p[1]]), closed: true }]
  const out = []
  let cur = [[ring[first][0], ring[first][1]]]
  for (let s = 1; s <= n; s++) {
    const k = (first + s) % n
    cur.push([ring[k][0], ring[k][1]])
    if (!on[k]) continue
    if (cur.length > 2 || !alongSquare(cur[0], cur[1], R)) out.push({ pts: cur, closed: false })   // a shore, not the square's edge
    cur = [[ring[k][0], ring[k][1]]]
  }
  return out
}
/** Two edge vertices joined along ONE side of the square: a stretch of the square's edge, not a shore. */
const alongSquare = (a, b, R) => ['x0', 'x1'].some(s => Math.abs(a[0] - R[s]) < 1e-3 && Math.abs(b[0] - R[s]) < 1e-3) ||
                                 ['z0', 'z1'].some(s => Math.abs(a[1] - R[s]) < 1e-3 && Math.abs(b[1] - R[s]) < 1e-3)

/**
 * A water ring with every shore run simplified and every stretch of the square's edge kept: the ring the arcs are cut
 * from, so ① strokes exactly the edge it excludes (an arc and a ring that differ leave a sliver between ink and water).
 */
export function simplifyRing(ring, R, eps) {
  const on = ring.map(p => onSquare(p, R)), first = on.indexOf(true)
  if (first < 0) { const c = simplify([...ring, ring[0]], eps); return c.slice(0, -1) }
  const out = []
  let run = [ring[first]]
  for (let s = 1; s <= ring.length; s++) {
    const p = ring[(first + s) % ring.length]
    run.push(p)
    if (!on[(first + s) % ring.length]) continue
    out.push(...simplify(run, eps).slice(0, -1))
    run = [p]
  }
  return out
}

/** Douglas–Peucker on an open polyline, ends kept. */
export function simplify(pts, eps) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz)
    let best = -1, bd = eps
    for (let k = a + 1; k < b; k++) {
      const d = L ? Math.abs((pts[k][0] - ax) * dz - (pts[k][1] - az) * dx) / L : Math.hypot(pts[k][0] - ax, pts[k][1] - az)
      if (d > bd) { bd = d; best = k }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]) }
  }
  return pts.filter((_, k) => keep[k])
}

/**
 * The water bodies of a set of paths that reach the square's edge, as [{ outer, holes }], rings and holes under
 * `minM2` dropped. Bodies that do not reach the edge are returned apart, as `hollows`.
 */
export function bodiesAtEdge(paths, R, minM2) {
  const c = new Clipper(); c.AddPaths(paths, PolyType.ptSubject, true)
  const tree = new PolyTree(); c.Execute(ClipType.ctUnion, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const bodies = [], hollows = []
  const walk = (node) => { for (const ch of node.Childs()) {
    const outer = fromPath(ch.Contour())
    const holes = ch.Childs().map(h => fromPath(h.Contour())).filter(h => ringArea(h) >= minM2)
    if (ringArea(outer) >= minM2) (outer.some(p => onSquare(p, R)) ? bodies : hollows).push({ outer, holes })
    for (const h of ch.Childs()) walk(h) } }
  walk(tree)
  return { bodies, hollows }
}

export async function bakeCoast({ scene, outDir = null, write = true }) {
  const mapDir = join(CARTOGRAPH_DIR, 'data', scene)
  const outPath = join(outDir || join(mapDir, 'clean'), COAST_FILE)
  for (const f of ['geography.json', 'neighborhood_boundary.json', 'raw/osm.json'])
    if (!fs.existsSync(join(mapDir, f))) throw new Error(`⛔ bake-coast: ${scene} has no ${f}. Fetch the town first.`)
  const read = (f) => JSON.parse(fs.readFileSync(join(mapDir, f), 'utf8'))
  const geo = geographyFor(scene), nb = read('neighborhood_boundary.json'), disc = discOf(nb, 'bake-coast'), osm = read('raw/osm.json')
  const { lonToM, latToM } = metresPerDegree(geo, 'bake-coast')
  const toLocal = projectorOf(geo)
  const toLL = (x, z) => [geo.lon + x / lonToM, geo.lat - z / latToM]
  const R = localBB(osm, toLocal)
  if (!R) throw new Error(`⛔ bake-coast: ${scene}'s raw/osm.json carries no bbox — the fetched square the coast closes against is unknown`)

  // ── IS THIS A COASTAL TOWN? Two records answer, and they must agree. ─────────────────────────────────────────────
  const osmWater = coastRings({ ground: osm.ground || {}, buildings: osm.buildings || [], center: [disc.cx, disc.cz], discR: disc.R, bb: R })
  const hasRecord = fs.existsSync(join(mapDir, 'raw', 'water-datums.json'))
  const out = { version: COAST_VERSION, scene, square: R }
  const save = () => { if (write) { fs.mkdirSync(join(outPath, '..'), { recursive: true }); writeIfChanged(outPath, JSON.stringify(out)) } }
  if (!osmWater.rings.length && !hasRecord) {
    Object.assign(out, { coast: false, why: 'no water record (raw/water-datums.json) and no OSM water reaching the fetched square\'s edge — an inland town' })
    save()
    console.log(`[bake-coast] ${scene}: inland — ${out.why}`)
    return out
  }
  if (!osmWater.rings.length)
    throw new Error(`⛔ bake-coast: ${scene} has a water record (raw/water-datums.json) and NO OSM water reaching the fetched square's edge to verify the lidar's coast against. An unverified coast is not drawn. ${osmWater.report.join(' ')}`)
  const levels = waterLevels(waterRecord({ mapDir, scene, auth: authoredWater(scene), wgs84ToLocal: toLocal, zero: 0 }))   // NAVD88
  // ⭐ ONE BASIS (2026-10-25): the lidar is delivered on its stated geoid (WESM), the water record on the current one, so
  // high is put on the LIDAR's basis (fetch-lidar-flights.mjs#lidarToRecordM; Huron −0.034 m), never a typed offset.
  const toRecordM = lidarToRecordM(fs.existsSync(join(mapDir, 'raw', FLIGHTS_FILE)) ? JSON.parse(fs.readFileSync(join(mapDir, 'raw', FLIGHTS_FILE), 'utf8')) : null, scene)
  const highAt = (x, z) => levels.highAt(x, z) - toRecordM

  // ── THE LIDAR, ON THE TERRAIN'S GRID ─────────────────────────────────────────────────────────────────────────────
  const specs = elevationSpecs(mapDir)
  if (!specs.length) throw new Error(`⛔ bake-coast: ${scene} has a coast and no elevation source (raw/elevation-sources.txt, raw/elevation/*.tif, raw/elevation.tif) — the coast is drawn from the lidar. ▶ node cartograph/fetch-dem.mjs --scene=${scene}`)
  const opened = await openRasters(specs, { cacheMB: 128 })
  const corners = [toLL(R.x0, R.z0), toLL(R.x1, R.z0), toLL(R.x0, R.z1), toLL(R.x1, R.z1)]
  const vd = demVerticalDatum(opened, corners)
  if (!vd) throw new Error(`⛔ bake-coast: ${scene}'s lidar names no NAVD88 vertical datum (${opened.map(S => S.label).join(', ')}), and the water record is NAVD88 — two vertical datums are never compared`)
  const G = TERRAIN_STEP_M
  const W = Math.ceil((R.x1 - R.x0) / G) + 1, H = Math.ceil((R.z1 - R.z0) / G) + 1
  const X = (i) => R.x0 + i * G, Z = (j) => R.z0 + j * G
  const { grid: ground } = await rasterToGrid(opened, { width: W, height: H, bounds: { minX: R.x0, maxX: X(W - 1), minZ: R.z0, maxZ: Z(H - 1) }, toLL, quiet: true })
  const decks = deckFootprints(osm.ground)
  const { w, nr, deck, noLidar, noCover, deckCells } = markSheet({ ground, W, H, X, Z, highAt, onDeck: decks.on, covered: (x, z) => inCoverage(opened, ...toLL(x, z)) })
  if (noLidar === W * H) throw new Error(`⛔ bake-coast: ${scene}'s lidar holds NO value anywhere over the fetched square — no coast can be drawn from it`)
  const { held, n: heldN } = heldCells(osm.ground, { W, H, x0: R.x0, z0: R.z0, step: G })
  const wet = floodFromEdge(w, W, H, held, nr)
  // the guard reads the lidar's OWN no-return water: a deck borders its own landward root, which is not the water's rim
  const guard = waterAsFlown(wet, nr.map((v, k) => v && !deck[k] ? 1 : 0), w, W, H)
  if (guard.share > 0.5) throw new Error(`⛔ bake-coast: ${scene} — the water was flown ABOVE its high level (${levels.highName}${levels.tidal ? ', tidal' : ', a lake'}): ${(100 * guard.share).toFixed(1)}% of the ${guard.n.toLocaleString()} lidar cells bordering the open water stand above high water, median ${guard.gapM.toFixed(2)} m. Flown above high by ${guard.gapM.toFixed(2)} m; NO OWNER FOR THE BANK from the flown edge down to the water. Whether the coast is the authored level or the flown edge is Jacob's call (BRIEF-the-shore-is-one-line), not the code's. ${gapLine(osmWater, ground, W, H, R, G, levels)}`)
  // ⭐ THE FLATTENED WATER — the terrain's datum (Boz's ruling (B), 2026-10-25): the 1 cm MODE of the lidar over the coarse
  // flood sheet, found from the lidar and the water record alone BEFORE any line is traced, so no line can move it.
  const flattened = flattenedWater(wet, deck, ground, toRecordM)
  if (!flattened) throw new Error(`⛔ bake-coast: ${scene} — the flood sheet holds no water with a lidar value whose level repeats (a mode of one sample is no mode), so there is no flattened water to take the terrain's datum from`)
  let nrIn = 0, nrOut = 0
  for (let k = 0; k < W * H; k++) if (nr[k]) { if (wet[k]) nrIn++; else nrOut++ }

  // ── THE FINE LINE, along the sheet's edge, at the source's own pixel ────────────────────────────────────────────
  const fine = Math.min(...opened.map(o => pixelMetres(o, toLL, disc.cx, disc.cz)))
  if (!(fine > 0 && Number.isFinite(fine))) throw new Error(`⛔ bake-coast: ${scene} — the lidar's pixel size could not be read`)
  const cellSq = (k, r) => { const i = k % W, j = (k - i) / W; return toPath([[X(i) - r, Z(j) - r], [X(i) + r, Z(j) - r], [X(i) + r, Z(j) + r], [X(i) - r, Z(j) + r]]) }
  const edge = edgeCells(wet, w, W, H)
  const band = clip(ClipType.ctUnion, edge.map(k => cellSq(k, 1.5 * G)), null)
  const sf = sheetField(wet, w)
  const sheet = clip(ClipType.ctUnion, wetLoops(sf.f, W, H, R.x0, R.z0, G, { kind: sf.kind }).map(toPath), null, PolyFillType.pftEvenOdd)
  const fineParts = new Paths()
  let tiles = 0, samples = 0, noValue = 0
  const crossings = {}                                       // the crossings each sentinel decided (marchingSquares.mjs#wetLoops)
  const tileKeys = new Set(edge.map(k => { const i = k % W, j = (k - i) / W; return `${Math.floor((X(i) - R.x0) / TILE_M)},${Math.floor((Z(j) - R.z0) / TILE_M)}` }))
  for (const key of tileKeys) {
    const [ti, tj] = key.split(',').map(Number)
    const tx = R.x0 + ti * TILE_M, tz = R.z0 + tj * TILE_M, pad = 2 * G
    // ⭐ ONE LATTICE (Zob's rule A, 2026-10-26): the samples are the square's global grid at the source's pixel, read over
    // the tile padded by `pad` (so its loops close past its edges), and only the loops inside the tile's OWN square are
    // kept: the tracer's own dry PAD (marchingSquares.mjs KIND.PAD) lies at least `pad` outside it, so none of its
    // crossings survives the clip. Neighbours then trace the same cells identically and meet exactly at the seam. (Each tile had sampled its
    // own lattice from its padded corner, and TILE_M / fine is not an integer, so overlaps were two different traces.)
    const sq = toPath([[tx, tz], [tx + TILE_M, tz], [tx + TILE_M, tz + TILE_M], [tx, tz + TILE_M]])
    const inTile = clip(ClipType.ctIntersection, [sq], band)
    if (!inTile.length) continue
    tiles++
    if (tiles % 100 === 0) console.log(`  [progress] coast tiles ${tiles} of ${tileKeys.size}`)
    const gi0 = Math.floor((tx - pad - R.x0) / fine), gi1 = Math.ceil((tx + TILE_M + pad - R.x0) / fine)
    const gj0 = Math.floor((tz - pad - R.z0) / fine), gj1 = Math.ceil((tz + TILE_M + pad - R.z0) / fine)
    const x0 = R.x0 + gi0 * fine, z0 = R.z0 + gj0 * fine, nx = gi1 - gi0 + 1, nz = gj1 - gj0 + 1, m = 2 * fine
    const xe = R.x0 + gi1 * fine, ze = R.z0 + gj1 * fine
    const win = await readWindow(opened, { cornersLL: [toLL(x0 - m, z0 - m), toLL(xe + m, z0 - m), toLL(x0 - m, ze + m), toLL(xe + m, ze + m)], quiet: true })
    const f = new Float32Array(nx * nz), kind = new Uint8Array(nx * nz)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = R.x0 + (gi0 + i) * fine, z = R.z0 + (gj0 + j) * fine, k = j * nx + i
      samples++
      if (decks.on(x, z)) { f[k] = NaN; kind[k] = KIND.DECK; continue }   // a deck: no return; the line is its ring
      const v = sampleSources(win, ...toLL(x, z))
      if (!Number.isFinite(v)) { noValue++; f[k] = NaN; kind[k] = inCoverage(opened, ...toLL(x, z)) ? KIND.NO_RETURN : KIND.NO_COVERAGE }   // no return: water; no coverage: dry
      else f[k] = v - highAt(x, z)                                         // ≤ 0 = below high water
    }
    win.length = 0
    const loops = wetLoops(f, nx, nz, x0, z0, fine, { kind, deckCross: decks.crossing, tally: crossings })
    if (loops.length) for (const q of clip(ClipType.ctIntersection, clip(ClipType.ctUnion, loops.map(toPath), null, PolyFillType.pftEvenOdd), inTile)) fineParts.push(q)
  }
  const square = [toPath([[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]])]
  const water = clip(ClipType.ctIntersection, clip(ClipType.ctUnion, [...clip(ClipType.ctDifference, sheet, band), ...fineParts], null), square)
  const minM2 = (2 * fine) ** 2
  const { bodies, hollows } = bodiesAtEdge(water, R, minM2)
  // ⭐ AN ISLAND IS KEPT IFF IT HOLDS A TERRAIN NODE (Jacob 2026-10-26, "build islands with the floor"; Boz's ruling, "the
  // field can't show it"): the field is drawn from its nodes, so an island holding none would be sunk below HIGH by the
  // ramp while ① drew land there. The lattice is the terrain's own (elevationSources.mjs#terrainLattice), never typed;
  // each one dropped is COUNTED and NAMED (coast.json islandsDropped), and its ground is the water's. ⭐ Judged on the ring
  // as WRITTEN (after simplifyRing and settleOnSource, below): a settled edge can leave an island's one node outside it.
  const lat = terrainLattice(nb), islandsDropped = []
  const holdsNode = (h) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const [x, z] of h) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
    for (let j = Math.max(0, Math.ceil((z0 - lat.bounds.minZ) / lat.sz)); j < lat.height && lat.Z(j) <= z1; j++)
      for (let i = Math.max(0, Math.ceil((x0 - lat.bounds.minX) / lat.sx)); i < lat.width && lat.X(i) <= x1; i++) if (inRing(lat.X(i), lat.Z(j), h)) return true
    return false }
  if (!bodies.length) throw new Error(`⛔ bake-coast: ${scene} — no ground below high water (${levels.highName}) reaches the fetched square's edge, so the lidar draws no coast, and OSM draws ${osmWater.rings.length} water ring(s). ${gapLine(osmWater, ground, W, H, R, G, levels)}`)

  // ── THE VERIFIER: OSM's water and the lidar's must agree, at a majority ─────────────────────────────────────────
  const wetPaths = bodies.flatMap(bd => [toPath(bd.outer), ...bd.holes.map(toPath)])
  const osmPaths = clip(ClipType.ctIntersection, clip(ClipType.ctUnion, osmWater.rings.map(toPath), null), square)
  const osmM2 = areaM2(osmPaths)
  const agreeM2 = areaM2(clip(ClipType.ctIntersection, osmPaths, wetPaths, PolyFillType.pftEvenOdd))
  const lidarOnlyM2 = areaM2(clip(ClipType.ctDifference, wetPaths, osmPaths, PolyFillType.pftEvenOdd))
  const deckOffOsmM2 = areaM2(clip(ClipType.ctDifference, decks.paths, osmPaths))
  const share = osmM2 > 0 ? agreeM2 / osmM2 : 0
  if (!(share >= 0.5)) throw new Error(`⛔ bake-coast: ${scene} — the lidar and OSM disagree about the water at a MAJORITY: only ${(100 * share).toFixed(1)}% of OSM's ${(osmM2 / 1e4).toFixed(1)} ha of water is below high water (${levels.highName}) and connected to the square's edge. ${gapLine(osmWater, ground, W, H, R, G, levels)}`)

  // ── THE ARCS: the shoreline ① strokes, cut from the rings simplified below half the source's pixel ───────────────
  const r3 = (r) => r.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)])
  const simple = bodies.map(bd => ({ outer: simplifyRing(bd.outer, R, fine / 2), holes: bd.holes.map(h => simplifyRing(h, R, fine / 2)) }))
  // ⭐ ON THE SOURCE, NOT ON THE TRACE: each kept vertex is bisected along its normal on the real sampler, within one
  // trace step (the trace interpolates between samples laid in TOWN metres, which is not the raster's grid).
  const settled = await settleOnSource(simple.flatMap(bd => [bd.outer, ...bd.holes]), R, fine, opened, toLL, highAt, decks.on)
  for (const bd of simple) { bd.outer = r3(wound(bd.outer, 1)); bd.holes = bd.holes.map(h => r3(wound(h, -1))) }
  for (const bd of simple) bd.holes = bd.holes.filter(h => { if (holdsNode(h)) return true
    let cx = 0, cz = 0; for (const p of h) { cx += p[0]; cz += p[1] } islandsDropped.push({ m2: +ringArea(h).toFixed(1), at: [Math.round(cx / h.length), Math.round(cz / h.length)] }); return false })
  // ⛔ EVERY RING IS SIMPLE AND ① CAN OUTLINE EVERY VERTEX, or the coast is not written (Boz's rulings, 2026-10-26): a ring
  // whose edges cross or fold back, or a vertex too acute for the ink (the mint's own outlineCorner at INK_EPS), is ①
  // stroked into an antenna, refused downstream far from its cause. Refused here, by name, at each place.
  // ⛔ AND NO TWO RINGS MEET (Boz's ruling, 2026-10-27): a hole across its body's outer, or one body across another.
  const labels = simple.flatMap((bd, bi) => [bd.outer, ...bd.holes].map((r, ri) => ({ r, name: `body ${bi} ring ${ri}` })))
  const bad = [...labels.flatMap(({ r, name }) => ringViolations(r, acuteAt).map(v => ({ ...v, where: `${name} edges ${v.a}/${v.b}` }))),
    ...ringsMeet(labels.map(l => l.r)).map(v => ({ ...v, where: `${labels[v.ra].name} edge ${v.a} / ${labels[v.rb].name} edge ${v.b}` }))]
  if (bad.length) throw new Error(`⛔ bake-coast: ${scene} — ${bad.length} place(s) where the traced coast is not simple rings apart (${[...new Set(bad.map(v => v.kind))].map(k => `${bad.filter(v => v.kind === k).length} ${k}`).join(' · ')}): ${bad.slice(0, 8).map(v => `${v.where} @(${v.at.map(Math.round).join(', ')})`).join(' · ')}${bad.length > 8 ? ` … +${bad.length - 8}` : ''}. Cause not established (the trace, simplifyRing or settleOnSource); the coast is not written.`)
  const arcs = [], islands = []
  for (const bd of simple) for (const ring of [bd.outer, ...bd.holes]) for (const a of arcsOf(ring, R)) {
    if (a.closed) { islands.push({ pts: a.pts.length, m2: Math.round(ringArea(a.pts)), at: a.pts[0].map(Math.round) }); arcs.push([...a.pts, a.pts[0]]); continue }
    arcs.push(a.pts)
  }
  Object.assign(out, {
    coast: true,
    from: `the lidar meets ${levels.highName} (${levels.tidal ? 'tidal' : 'lake'}; NAVD88 ${levels.range.high.map(v => v.toFixed(3)).join('…')} m), traced at ${+fine.toFixed(3)} m along a ${G} m sheet over the fetched square`,
    level: { high: levels.highName, low: levels.lowName, tidal: levels.tidal, navd88High: levels.range.high, navd88Low: levels.range.low },
    dem: vd, gridM: G, fineM: +fine.toFixed(3),
    flattened,
    water: simple,
    arcs, islands, islandFloor: { rule: 'holds a terrain node', lattice: { bounds: lat.bounds, width: lat.width, height: lat.height } }, islandsDropped,
    decks: { ...decks.count, footprintHa: +(decks.m2 / 1e4).toFixed(3), offOsmWaterHa: +(deckOffOsmM2 / 1e4).toFixed(3), cells: deckCells },
    verify: { osmWaterHa: +(osmM2 / 1e4).toFixed(2), lidarWetShareOfOsm: +share.toFixed(4), lidarWetWithoutOsmHa: +(lidarOnlyM2 / 1e4).toFixed(2) },
    guard: { rimCells: guard.n, aboveHigh: guard.above, share: +guard.share.toFixed(4), gapM: guard.gapM },
    settled: { moved: settled.moved, bounded: settled.bounded, unbracketed: settled.unbracketed, noValue: settled.noValue, sweepClamped: settled.sweepClamped, p50M: +settled.p50.toFixed(4), maxM: +settled.max.toFixed(4) },
    totals: { heldCells: heldN, noReturnEnteredHa: +(nrIn * G * G / 1e4).toFixed(1), noReturnNotReachedHa: +(nrOut * G * G / 1e4).toFixed(1), noCoverageHa: +(noCover * G * G / 1e4).toFixed(1), fineTiles: tiles, fineSamples: samples, fineNoValue: noValue, sentinelCrossings: crossings,
              hollows: hollows.length, hollowHa: +(hollows.reduce((t, h) => t + ringArea(h.outer), 0) / 1e4).toFixed(2) },
  })
  save()
  const T = out.totals, V = out.verify, D = out.decks
  console.log(`[bake-coast] ${scene}: ${out.from}`)
  console.log(`  ${bodies.length} water bod(ies) · ${arcs.length} shoreline arc(s), ${arcs.reduce((t, a) => t + a.length, 0).toLocaleString()} vertices · ${tiles} fine tile(s), ${samples.toLocaleString()} samples`)
  console.log(`  VERIFY: ${(100 * V.lidarWetShareOfOsm).toFixed(1)}% of OSM's ${V.osmWaterHa} ha of water is lidar-wet · ${V.lidarWetWithoutOsmHa} ha lidar-wet with no OSM water (reported, not refused)`)
  console.log(`  DECKS: ${D.areas} area(s) + ${D.lines} line(s) (${D.unmappedWidth} at the typical ${D.typicalWidthM ?? '—'} m, f-ufc-main-walkway-width) = ${D.footprintHa} ha read as no return; ${D.offOsmWaterHa} ha of it lies off OSM's water`)
  console.log(`  NO RETURN (inside a tile, no value): ${T.noReturnEnteredHa} ha entered by the water · ${T.noReturnNotReachedHa} ha not reached (land dropouts) · NO COVERAGE (outside every tile): ${T.noCoverageHa} ha, never entered`)
  console.log(`  THE FLATTENED WATER (the terrain's datum): NAVD88 ${flattened.navd88.toFixed(2)} m, the mode of ${flattened.cells.toLocaleString()} wet cell(s) with a value, share ${(100 * flattened.share).toFixed(1)}%`)
  console.log(`  THE WATER AS FLOWN: ${(100 * out.guard.share).toFixed(1)}% of ${out.guard.rimCells.toLocaleString()} cells bordering the open water stand above high water${out.guard.gapM != null ? ` (median ${out.guard.gapM.toFixed(2)} m above)` : ''} — the line is high water`)
  if (noValue) console.log(`  ${noValue.toLocaleString()} fine sample(s) along the line had no lidar value — no return traced as water, no coverage as dry`)
  if (hollows.length) console.log(`  ${hollows.length} hollow(s) below the line that the water does not reach (${T.hollowHa} ha) — dry, by the coast rule`)
  if (islandsDropped.length) console.log(`  ${islandsDropped.length} island(s) holding no terrain node DROPPED, their ground the water's: ${islandsDropped.slice(0, 8).map(d => `${d.m2} m² @(${d.at.join(', ')})`).join(' · ')}${islandsDropped.length > 8 ? ` … +${islandsDropped.length - 8}` : ''}`)
  if (islands.length) console.log(`  ${islands.length} island(s), each a hole in the water and a CLOSED shore arc (${(islands.reduce((t, s) => t + s.m2, 0) / 1e4).toFixed(2)} ha; smallest drawn = (2 × the source's pixel)² = ${minM2.toFixed(1)} m²)`)
  console.log(`  SETTLED on the source: ${settled.moved.toLocaleString()} vertex(es) bisected (moved p50 ${settled.p50.toFixed(3)} · max ${settled.max.toFixed(3)} m) · ${settled.unbracketed.toLocaleString()} with no crossing within a step, kept as traced · ${settled.noValue.toLocaleString()} with no value`)
  if (settled.sweepClamped.length) console.log(`  SWEEP-CLAMPED: ${settled.sweepClamped.length} settle move(s) cut short so no edge sweeps over a vertex: ${settled.sweepClamped.slice(0, 8).map(c => `${c.wantM}→${c.gotM} m @(${c.at.map(Math.round).join(', ')})`).join(' · ')}${settled.sweepClamped.length > 8 ? ` … +${settled.sweepClamped.length - 8}` : ''}`)
  console.log(`  ${!write ? 'NOT WRITTEN (dry run)' : 'wrote'} ${outPath}`)
  return out
}

/**
 * Bisect every ring vertex off the square's edge along its normal on the real sampler, within ± one trace step, to
 * where lidar − high = 0. In place. A vertex with no sign change in that reach, or on a deck, keeps its traced place.
 * ⭐ BOUNDED BY THE RING'S OWN CLEARANCE (Zob, 2026-10-26: settle closed three spikes simplify left at 5–17°): on each side,
 * the reach is at most HALF the distance along the normal to the ring's nearest non-adjacent edge, so a vertex's own PATH
 * meets no other edge. Each vertex so limited is counted (`bounded`). That bounds the path, not the EDGES: see settleInOrder.
 */
export function clearances(ring, step) {
  const n = ring.length, G = Math.max(step, 1e-6), cells = new Map(), key = (i, j) => i + ',' + j
  for (let m = 0; m < n; m++) { const a = ring[m], b = ring[(m + 1) % n]
    for (let i = Math.floor(Math.min(a[0], b[0]) / G) - 1; i <= Math.floor(Math.max(a[0], b[0]) / G) + 1; i++)
      for (let j = Math.floor(Math.min(a[1], b[1]) / G) - 1; j <= Math.floor(Math.max(a[1], b[1]) / G) + 1; j++) { const q = key(i, j); if (!cells.has(q)) cells.set(q, []); cells.get(q).push(m) } }
  return ring.map((p, k) => {
    const a = ring[(k - 1 + n) % n], b = ring[(k + 1) % n], nx0 = -(b[1] - a[1]), nz0 = b[0] - a[0], L = Math.hypot(nx0, nz0) || 1, nx = nx0 / L, nz = nz0 / L
    let plus = Infinity, minus = Infinity
    const seen = new Set()
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const m of cells.get(key(Math.floor(p[0] / G) + di, Math.floor(p[1] / G) + dj)) || []) {
      if (seen.has(m) || m === k || m === (k - 1 + n) % n) continue; seen.add(m)   // the vertex's own two edges are not clearance
      const q = ring[m], r = ring[(m + 1) % n], ex = r[0] - q[0], ez = r[1] - q[1], den = nx * ez - nz * ex
      if (den === 0) continue
      const t = ((q[0] - p[0]) * ez - (q[1] - p[1]) * ex) / den, u = ((q[0] - p[0]) * nz - (q[1] - p[1]) * nx) / den
      if (u < 0 || u > 1) continue
      if (t >= 0) plus = Math.min(plus, t); else minus = Math.min(minus, -t)
    }
    return [minus, plus]
  })
}
// the mint's own test of whether ① can outline a vertex (tileGround.js#outlineCorner at INK_EPS): settle admits by it, and
// the refusal below asks it of every ring
const acuteAt = (o, p, q) => outlineCorner(o, [{ to: p }, { to: q }], INK_EPS).bad
async function settleOnSource(rings, R, step, opened, toLL, highAt, onDeck) {
  const T = TILE_M, groups = new Map()
  let bounded = 0
  for (const ring of rings) { const cl = clearances(ring, step)
    for (let k = 0; k < ring.length; k++) {
      if (onSquare(ring[k], R)) continue
      const a = ring[(k - 1 + ring.length) % ring.length], b = ring[(k + 1) % ring.length]   // every normal off the TRACED ring
      const nx = -(b[1] - a[1]), nz = b[0] - a[0], n = Math.hypot(nx, nz) || 1
      const lo = -Math.min(step, cl[k][0] / 2), hi = Math.min(step, cl[k][1] / 2)
      if (-lo < step || hi < step) bounded++
      const key = `${Math.floor(ring[k][0] / T)},${Math.floor(ring[k][1] / T)}`
      ;(groups.get(key) || groups.set(key, []).get(key)).push([ring, k, nx / n, nz / n, lo, hi])
    } }
  const moved = [], targets = new Map(rings.map(r => [r, new Array(r.length).fill(null)]))   // applied after every group, in ring order
  let unbracketed = 0, noValue = 0
  for (const [key, items] of groups) {
    const [i, j] = key.split(',').map(Number), m = 2 * step
    const win = await readWindow(opened, { cornersLL: [toLL(i * T - m, j * T - m), toLL(i * T + T + m, j * T - m), toLL(i * T - m, j * T + T + m), toLL(i * T + T + m, j * T + T + m)], quiet: true })
    const f = (x, z) => (onDeck(x, z) ? NaN : sampleSources(win, ...toLL(x, z)) - highAt(x, z))
    const next = items.map(([ring, k, nx, nz, lo0, hi0]) => {
      const p = ring[k]
      let lo = lo0, hi = hi0, flo = f(p[0] + nx * lo, p[1] + nz * lo), fhi = f(p[0] + nx * hi, p[1] + nz * hi)
      if (!Number.isFinite(flo) || !Number.isFinite(fhi)) { noValue++; return null }
      if (!(flo * fhi < 0)) { unbracketed++; return null }
      for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2, fm = f(p[0] + nx * mid, p[1] + nz * mid); if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm } else hi = mid }
      const t = (lo + hi) / 2
      return [p[0] + nx * t, p[1] + nz * t]
    })
    items.forEach(([ring, k], q) => { if (next[q]) targets.get(ring)[k] = next[q] })
    win.length = 0
  }
  const sweepClamped = []
  const s = settleInOrder(rings, rings.map(r => targets.get(r)), step, acuteAt); moved.push(...s.moved); sweepClamped.push(...s.clamped)
  moved.sort((x, y) => x - y)
  return { moved: moved.length, bounded, unbracketed, noValue, sweepClamped, p50: moved.length ? moved[moved.length >> 1] : 0, max: moved.length ? moved[moved.length - 1] : 0 }
}

/**
 * Move each vertex of `rings[r]` to `to[r][k]` (or leave it, where that is null), ring by ring and IN RING ORDER, so each is
 * judged against every vertex already SETTLED (its neighbours', and every other ring's: a hole may not sweep over its
 * body's outer). In place. `step` is the reach: a target farther than that is refused by name.
 * ⭐ A MOVE IS ADMISSIBLE ONLY IF NO OTHER EDGE MEETS THE TRIANGLES ITS TWO EDGES SWEEP, (p, p′, prev) and (p, p′, next)
 * (Boz's ruling, 2026-10-27; PTown, 10-27: a vertex moved 0.82 m along a clear normal and its edge to NEXT swept over
 * PREV). A vertex inside is the ruling's case; an edge through the path is the other, since `clearances` was measured on
 * the TRACED ring and the neighbours have settled since. An inadmissible move is clamped to the farthest fraction reached
 * without passing an inadmissible one, and COUNTED, by place. "Meets" includes coming
 * within √2 lattice steps: the ring is written on the 1/CLIP_SCALE lattice (r3's toFixed(3), the same millimetre), and
 * rounding moves the vertex and the edge's end each by at most half a diagonal, √2 × ½ mm apiece. Two segments that do not cross are closest at an end, so the margin is asked of an edge's ends against the
 * triangle and of the moved vertex against the edge (Zob, 10-27).
 * ⭐ AND EVERY CORNER IT TOUCHES STAYS INKABLE (Boz's ruling, 2026-10-27): the corners at prev, k and next must pass
 * `acuteAt`, the mint's own outlineCorner at INK_EPS (PTown, 10-27: the sweep clamp alone left v1961 at 0.85° on a 9.5 cm
 * leg, settle's targets there lying in reversed order). A traced vertex is never dropped; its move is clamped.
 */
export function settleInOrder(rings, to, step, acuteAt) {
  const margin = Math.SQRT2 / SCALE, moved = [], clamped = [], G = step + margin
  const cells = new Map(), key = (i, j) => i + ',' + j, cell = (v) => Math.floor(v / G)
  const walk = (p, q, each) => { const steps = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / G) || 1
    for (let s = 0; s <= steps; s++) each(cell(p[0] + (q[0] - p[0]) * s / steps), cell(p[1] + (q[1] - p[1]) * s / steps)) }
  // every EDGE is keyed in each cell its TRACED path passes through (± 1): a settled end is at most `step` from its traced
  // place, so a settled edge lies within G of its traced path
  rings.forEach((ring, r) => { const n = ring.length
    for (let k = 0; k < n; k++) if (to[r][k]) { const d = Math.hypot(to[r][k][0] - ring[k][0], to[r][k][1] - ring[k][1])
      if (!(d <= step)) throw new Error(`⛔ settleInOrder: a target ${d.toFixed(4)} m from its vertex @(${ring[k].map(v => v.toFixed(3)).join(', ')}), beyond the reach ${step} m`) }
    for (let e = 0; e < n; e++) walk(ring[e], ring[(e + 1) % n], (ci, cj) => { for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const q = key(i, j), list = cells.get(q) || cells.set(q, []).get(q); if (list[list.length - 1] !== r * 2 ** 26 + e) list.push(r * 2 ** 26 + e) } }) })
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const segD = (v, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const u = L2 ? Math.max(0, Math.min(1, ((v[0] - a[0]) * dx + (v[1] - a[1]) * dz) / L2)) : 0
    return Math.hypot(v[0] - a[0] - u * dx, v[1] - a[1] - u * dz) }
  const inTri = (v, a, b, c) => { const d1 = cr(a, b, v), d2 = cr(b, c, v), d3 = cr(c, a, v)
    return ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) || Math.min(segD(v, a, b), segD(v, b, c), segD(v, c, a)) <= margin }
  const cross = (p1, p2, q1, q2) => { const d1 = cr(q1, q2, p1), d2 = cr(q1, q2, p2), d3 = cr(p1, p2, q1), d4 = cr(p1, p2, q2)
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) }
  // does edge (s0, s1) meet the swept triangle (p, q, c)? An edge that shares the corner c with it (c's other edge) is judged
  // by its far end and by the side the vertex sweeps (p, q) alone; it meets the triangle at c by construction.
  const hits = (s0, s1, p, q, c, shared) => { if (segD(q, s0, s1) <= margin) return true
    if (shared) { const far = s0 === shared ? s1 : s0; return inTri(far, p, q, c) || cross(s0, s1, p, q) }
    return inTri(s0, p, q, c) || inTri(s1, p, q, c) || cross(s0, s1, p, q) || cross(s0, s1, q, c) || cross(s0, s1, c, p) }
  rings.forEach((ring, r) => { const n = ring.length
    for (let k = 0; k < n; k++) { if (!to[r][k]) continue
      const a = (k - 1 + n) % n, b = (k + 1) % n, p = ring[k], prev = ring[a], next = ring[b], want = Math.hypot(to[r][k][0] - p[0], to[r][k][1] - p[1])
      const at = (f) => [p[0] + (to[r][k][0] - p[0]) * f, p[1] + (to[r][k][1] - p[1]) * f]
      // the edges keyed in the cells along k's two edges as they stand: each swept triangle lies within the move (≤ step) of
      // one of them, and a sample lies within G/2 of every point of it, so three cells of slack reach every candidate's key
      const edges = new Set()
      for (const e of [prev, next]) walk(p, e, (ci, cj) => { for (let i = ci - 3; i <= ci + 3; i++) for (let j = cj - 3; j <= cj + 3; j++) for (const id of cells.get(key(i, j)) || []) edges.add(id) })
      edges.delete(r * 2 ** 26 + a); edges.delete(r * 2 ** 26 + k)   // not the two moving edges
      const list = [...edges].map(id => { const rr = Math.floor(id / 2 ** 26), e = id % 2 ** 26, R = rings[rr]
        return [R, e, rr === r && e === (a - 1 + n) % n ? prev : null, rr === r && e === b ? next : null] })
      const pp = ring[(k - 2 + n) % n], nn = ring[(k + 2) % n]
      const ok = (f) => { const q = at(f)
        if (acuteAt(prev, pp, q) || acuteAt(q, prev, next) || acuteAt(next, q, nn)) return false
        for (const [R, e, sharedPrev, sharedNext] of list) { const s0 = R[e], s1 = R[(e + 1) % R.length]
          if (hits(s0, s1, p, q, prev, sharedPrev) || hits(s0, s1, p, q, next, sharedNext)) return false }
        return true }
      let f = 1
      // inkability need not shrink monotonically as the move grows, so a fraction is admitted only if every fraction up to it
      // is: scanned from 0 in steps of at most the write lattice
      if (!ok(1)) { const df = Math.min(1, 1 / (SCALE * want)); f = 0; while (f + df < 1 && ok(f + df)) f += df
        clamped.push({ at: p.map(v => +v.toFixed(3)), wantM: +want.toFixed(4), gotM: +(want * f).toFixed(4) }) }
      if (f > 0) { ring[k] = at(f); moved.push(want * f) }
    } })
  return { moved, clamped }
}

/** The refusal's measurement: the flattened water's level under OSM's water (its 1 cm mode) against high water there. */
function gapLine(osmWater, ground, W, H, R, G, levels) {
  const hist = new Map(), hi = new Map()
  for (const ring of osmWater.rings) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
    for (let j = Math.max(0, Math.ceil((z0 - R.z0) / G)); j < H && R.z0 + j * G <= z1; j++) for (let i = Math.max(0, Math.ceil((x0 - R.x0) / G)); i < W && R.x0 + i * G <= x1; i++) {
      const x = R.x0 + i * G, z = R.z0 + j * G, v = ground[j * W + i]
      if (!Number.isFinite(v) || !inRing(x, z, ring)) continue
      const key = Math.round(v * 100)
      hist.set(key, (hist.get(key) || 0) + 1); hi.set(key, (hi.get(key) || 0) + levels.highAt(x, z))
    }
  }
  let mode = null, best = 0
  for (const [k, c] of hist) if (c > best) { best = c; mode = k }
  if (mode == null) return 'OSM\'s water holds no lidar value to compare.'
  const flat = mode / 100, high = hi.get(mode) / best
  return `Under OSM's water the lidar's flattened surface stands at ${flat.toFixed(2)} m NAVD88 and high water (${levels.highName}) at ${high.toFixed(2)} m: the water was flown ${(flat - high >= 0 ? (flat - high).toFixed(2) + ' m ABOVE' : (high - flat).toFixed(2) + ' m below')} its high level.`
}
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }

async function main() {
  const scene = requireExplicitMap('bake-coast')
  const outDir = process.argv.slice(2).map(a => a.match(/^--out-dir=(.+)$/)).find(Boolean)?.[1] || null
  await bakeCoast({ scene, outDir })
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message || e); process.exit(1) })
