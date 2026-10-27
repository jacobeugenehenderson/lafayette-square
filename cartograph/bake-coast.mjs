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
import { elevationSpecs, openRasters, readWindow, rasterToGrid, sampleSources, inCoverage, pixelMetres, demVerticalDatum, TERRAIN_STEP_M, ABOVE_WATER_M } from './elevationSources.mjs'
import { authoredWater, waterRecord } from './waterDatums.mjs'
import { waterLevels } from './waterLevel.mjs'
import { wetLoops } from './marchingSquares.mjs'
import { coastRings } from './coastline.mjs'
import { deckStructures, defaultDeckWidthM } from './structures.mjs'
import { CLIP_SCALE as SCALE } from '../src/lib/lattice.js'          // clipper units per metre: 1 mm
import { COAST_FILE, heldCells } from './coastFile.mjs'
import { lidarToRecordM, FLIGHTS_FILE } from './fetch-lidar-flights.mjs'
import { discOf } from './boundaryRecords.mjs'

const { Clipper, ClipperOffset, Paths, Path, IntPoint, PolyTree, ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib

export const COAST_VERSION = 1

/** The square tile, in metres, the fine line is traced in. ⛔ Not a geometric value: tiles overlap by one sample and
 *  are unioned, so where their edges fall changes nothing; it bounds memory and one read's size. */
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
 * THE SHEET'S FIELD for the tracer (≤ 0 = water): lidar − high where the water reached; the same, kept just above 0,
 * on dry ground with a lidar value, so the line is interpolated between two TRUE heights; +1 where nothing is known
 * (no lidar) or where the ground lies below high water the sea does not reach (a hollow, a held marsh): dry by rule.
 */
export function sheetField(wet, w) {
  const f = new Float32Array(wet.length)
  for (let k = 0; k < wet.length; k++) f[k] = wet[k] ? (Number.isFinite(w[k]) ? -w[k] : -Number.EPSILON) : (Number.isFinite(w[k]) && w[k] <= 0 ? Math.max(-w[k], Number.EPSILON) : 1)
  return f
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
 * THE DECK FOOTPRINTS (structures.mjs#deckStructures): an area as mapped, a line buffered to its width (OSM `width`,
 * else structures.mjs#defaultDeckWidthM: the sourced typical width), butt ends. One union, as clipper paths, with a
 * point test for the samplers. ⛔ From the data's tags, never a site list.
 */
export function deckFootprints(osmGround) {
  const { areas, lines } = deckStructures(osmGround)
  let typical = null
  const paths = new Paths()
  for (const a of areas) paths.push(toPath(a.ring))
  let unmapped = 0
  for (const l of lines) {
    const wM = l.widthM ?? (typical ??= defaultDeckWidthM())
    if (l.widthM == null) unmapped++
    const co = new ClipperOffset(), out = new Paths()
    co.AddPath(toPath(l.line), JoinType.jtMiter, EndType.etOpenButt)
    co.Execute(out, (wM / 2) * SCALE)
    for (const p of out) paths.push(p)
  }
  const union = paths.length ? clip(ClipType.ctUnion, paths, null) : new Paths()
  const rings = union.map(fromPath)
  const boxes = rings.map(r => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } return [x0, x1, z0, z1] })
  // nonzero over the union's rings: an outer counts +1, a hole −1, so a point in a deck's courtyard is not on the deck
  const on = (x, z) => { let wn = 0; for (let k = 0; k < rings.length; k++) { const b = boxes[k]; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue; if (inRing(x, z, rings[k])) wn += Math.sign(signedArea(rings[k])) } return wn !== 0 }
  return { paths: union, on, count: { areas: areas.length, lines: lines.length, unmappedWidth: unmapped, typicalWidthM: typical }, m2: areaM2(union) }
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
  const geo = geographyFor(scene), disc = discOf(read('neighborhood_boundary.json'), 'bake-coast'), osm = read('raw/osm.json')
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
  const sheet = clip(ClipType.ctUnion, wetLoops(sheetField(wet, w), W, H, R.x0, R.z0, G).map(toPath), null, PolyFillType.pftEvenOdd)
  const fineParts = new Paths()
  let tiles = 0, samples = 0, noValue = 0
  const tileKeys = new Set(edge.map(k => { const i = k % W, j = (k - i) / W; return `${Math.floor((X(i) - R.x0) / TILE_M)},${Math.floor((Z(j) - R.z0) / TILE_M)}` }))
  for (const key of tileKeys) {
    const [ti, tj] = key.split(',').map(Number)
    const tx = R.x0 + ti * TILE_M, tz = R.z0 + tj * TILE_M, pad = 2 * G
    const sq = toPath([[tx - pad, tz - pad], [tx + TILE_M + pad, tz - pad], [tx + TILE_M + pad, tz + TILE_M + pad], [tx - pad, tz + TILE_M + pad]])
    const inTile = clip(ClipType.ctIntersection, [sq], band)
    if (!inTile.length) continue
    tiles++
    if (tiles % 100 === 0) console.log(`  [progress] coast tiles ${tiles} of ${tileKeys.size}`)
    const x0 = tx - pad, z0 = tz - pad, span = TILE_M + 2 * pad, m = 2 * fine
    const win = await readWindow(opened, { cornersLL: [toLL(x0 - m, z0 - m), toLL(x0 + span + m, z0 - m), toLL(x0 - m, z0 + span + m), toLL(x0 + span + m, z0 + span + m)], quiet: true })
    const n = Math.round(span / fine) + 1
    const f = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + i * fine, z = z0 + j * fine
      samples++
      if (decks.on(x, z)) { f[j * n + i] = -Number.EPSILON; continue }                     // a deck: no return, as the sheet reads it
      const v = sampleSources(win, ...toLL(x, z))
      if (!Number.isFinite(v)) { noValue++; f[j * n + i] = inCoverage(opened, ...toLL(x, z)) ? -Number.EPSILON : 1 }   // no return: water; no coverage: dry
      else f[j * n + i] = v - highAt(x, z)                                 // ≤ 0 = below high water
    }
    win.length = 0
    const loops = wetLoops(f, n, n, x0, z0, fine)
    if (loops.length) for (const q of clip(ClipType.ctIntersection, clip(ClipType.ctUnion, loops.map(toPath), null, PolyFillType.pftEvenOdd), inTile)) fineParts.push(q)
  }
  const square = [toPath([[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]])]
  const water = clip(ClipType.ctIntersection, clip(ClipType.ctUnion, [...clip(ClipType.ctDifference, sheet, band), ...fineParts], null), square)
  const minM2 = (2 * fine) ** 2
  const { bodies, hollows } = bodiesAtEdge(water, R, minM2)
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
    arcs, islands,
    decks: { ...decks.count, footprintHa: +(decks.m2 / 1e4).toFixed(3), offOsmWaterHa: +(deckOffOsmM2 / 1e4).toFixed(3), cells: deckCells },
    verify: { osmWaterHa: +(osmM2 / 1e4).toFixed(2), lidarWetShareOfOsm: +share.toFixed(4), lidarWetWithoutOsmHa: +(lidarOnlyM2 / 1e4).toFixed(2) },
    guard: { rimCells: guard.n, aboveHigh: guard.above, share: +guard.share.toFixed(4), gapM: guard.gapM },
    settled: { moved: settled.moved, unbracketed: settled.unbracketed, noValue: settled.noValue, p50M: +settled.p50.toFixed(4), maxM: +settled.max.toFixed(4) },
    totals: { heldCells: heldN, noReturnEnteredHa: +(nrIn * G * G / 1e4).toFixed(1), noReturnNotReachedHa: +(nrOut * G * G / 1e4).toFixed(1), noCoverageHa: +(noCover * G * G / 1e4).toFixed(1), fineTiles: tiles, fineSamples: samples, fineNoValue: noValue,
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
  if (islands.length) console.log(`  ${islands.length} island(s), each a hole in the water and a CLOSED shore arc (${(islands.reduce((t, s) => t + s.m2, 0) / 1e4).toFixed(2)} ha; smallest drawn = (2 × the source's pixel)² = ${minM2.toFixed(1)} m²)`)
  console.log(`  SETTLED on the source: ${settled.moved.toLocaleString()} vertex(es) bisected (moved p50 ${settled.p50.toFixed(3)} · max ${settled.max.toFixed(3)} m) · ${settled.unbracketed.toLocaleString()} with no crossing within a step, kept as traced · ${settled.noValue.toLocaleString()} with no value`)
  console.log(`  ${!write ? 'NOT WRITTEN (dry run)' : 'wrote'} ${outPath}`)
  return out
}

/**
 * Bisect every ring vertex off the square's edge along its normal on the real sampler, within ± one trace step, to
 * where lidar − high = 0. In place. A vertex with no sign change in that reach, or on a deck, keeps its traced place.
 */
async function settleOnSource(rings, R, step, opened, toLL, highAt, onDeck) {
  const T = TILE_M, groups = new Map()
  for (const ring of rings) for (let k = 0; k < ring.length; k++) {
    if (onSquare(ring[k], R)) continue
    const a = ring[(k - 1 + ring.length) % ring.length], b = ring[(k + 1) % ring.length]   // every normal off the TRACED ring
    const nx = -(b[1] - a[1]), nz = b[0] - a[0], n = Math.hypot(nx, nz) || 1
    const key = `${Math.floor(ring[k][0] / T)},${Math.floor(ring[k][1] / T)}`
    ;(groups.get(key) || groups.set(key, []).get(key)).push([ring, k, nx / n, nz / n])
  }
  const moved = []
  let unbracketed = 0, noValue = 0
  for (const [key, items] of groups) {
    const [i, j] = key.split(',').map(Number), m = 2 * step
    const win = await readWindow(opened, { cornersLL: [toLL(i * T - m, j * T - m), toLL(i * T + T + m, j * T - m), toLL(i * T - m, j * T + T + m), toLL(i * T + T + m, j * T + T + m)], quiet: true })
    const f = (x, z) => (onDeck(x, z) ? NaN : sampleSources(win, ...toLL(x, z)) - highAt(x, z))
    const next = items.map(([ring, k, nx, nz]) => {
      const p = ring[k]
      let lo = -step, hi = step, flo = f(p[0] + nx * lo, p[1] + nz * lo), fhi = f(p[0] + nx * hi, p[1] + nz * hi)
      if (!Number.isFinite(flo) || !Number.isFinite(fhi)) { noValue++; return null }
      if (!(flo * fhi < 0)) { unbracketed++; return null }
      for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2, fm = f(p[0] + nx * mid, p[1] + nz * mid); if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm } else hi = mid }
      const t = (lo + hi) / 2
      moved.push(Math.abs(t))
      return [p[0] + nx * t, p[1] + nz * t]
    })
    items.forEach(([ring, k], q) => { if (next[q]) ring[k] = next[q] })
    win.length = 0
  }
  moved.sort((x, y) => x - y)
  return { moved: moved.length, unbracketed, noValue, p50: moved.length ? moved[moved.length >> 1] : 0, max: moved.length ? moved[moved.length - 1] : 0 }
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
