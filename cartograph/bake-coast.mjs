#!/usr/bin/env node
/**
 * bake-coast.mjs — THE COAST IS WHERE THE LIDAR MEETS HIGH WATER (Jacob, 2026-10-11; go 2026-10-12;
 * BRIEF-the-coast-from-the-lidar).
 *
 * *"Can we compute the whole sheet for the lidar and find the actual moment of intersection with the shoreline … and
 * then discard the sheet?"* ⇒ The coast line is where the surveyed ground meets the town's HIGH-water level (the tide
 * datum where tidal, MHW by default; the authored lake level on a lake), and its height IS that level. The sheet that
 * finds it is thrown away once it has: one outline, from the lidar. It replaces OSM's coastline as ①'s coast source
 * and the drawn water's outline.
 *
 * ⭐⭐ THE DATUM CANNOT DEPEND ON THE LINE IT MOVES. The lidar and the water record are both NAVD88, so the line is
 * found from the two of them with no datum at all. bake-terrain then takes its datum from the water this file draws.
 *
 * ── HOW ────────────────────────────────────────────────────────────────────────
 *   1. THE COARSE SHEET — the lidar over the whole fetched square (the frame ① closes against, and what outer-coast
 *      carries on past the rim) at the terrain's step. Water = ground below high water CONNECTED to the square's edge:
 *      the coast doctrine (water that goes on beyond what we fetched), so a hollow or a diked marsh behind the shore
 *      stays dry. A mapped dike (man_made=dyke · embankment=yes · waterway=dam) holds the water.
 *   2. THE LINE — along the coarse sheet's wet/dry edge, the lidar is read again at its own finest pixel and the line is
 *      traced by marching squares where lidar − high = 0. Away from the edge the coarse sheet stands.
 *   3. THE WATER — the union, clipped to the square; only bodies that reach the square's edge are kept (the rest are
 *      hollows below high water, not the sea). Rings and holes below what the source resolves (two pixels square) go.
 *   4. THE ARCS — each water ring split where it runs along the square's edge: the open shoreline ① strokes as ink.
 *      ⛔ ① strokes the ARC, never the closed ring (square → filled, circle → annulus, Erie → 3 pieces, measured): the
 *      RING is the water face, excluded from the frame with the ink in one move; the ARC is the two-sided shore a
 *      slipway T's into. And the coast is not the disc: it is ground truth and closes faces; the circle stamps last.
 *
 * ── WHAT REFUSES, BY NAME ──────────────────────────────────────────────────────
 *   a water record and no OSM water to verify against · OSM water and no water record (waterDatums) · no lidar · a
 *   lidar that is not NAVD88 · the lidar and the OSM water disagreeing at a MAJORITY (less than half the OSM water is
 *   lidar-wet: the flattened water stands above high, printed as the gap) · no water reaching the square's edge.
 * ⛔ OSM is a VERIFIER here, never geometry (Boz's ruling, 2026-10-13): two independent sources that must agree.
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
import { elevationSpecs, openRasters, readWindow, sampleSources, demVerticalDatum, TERRAIN_STEP_M } from './elevationSources.mjs'
import { authoredWater, waterRecord } from './waterDatums.mjs'
import { waterLevels } from './waterLevel.mjs'
import { wetLoops } from './marchingSquares.mjs'
import { osmWaterToVerify } from './coastVerify.mjs'
import { CLIP_SCALE as SCALE } from '../src/lib/lattice.js'          // clipper units per metre: 1 mm

const { Clipper, Paths, Path, IntPoint, ClipType, PolyType, PolyFillType, PolyTree } = clipperLib

export const COAST_FILE = 'coast.json'
export const COAST_VERSION = 1

/** The square tile, in metres, the fine line is traced in. ⛔ Not a geometric value: tiles overlap by one sample and
 *  are unioned, so where their edges fall changes nothing; it bounds memory and one read's size. */
const TILE_M = 256

const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))); return p }
const fromPath = (path) => path.map(q => [q.X / SCALE, q.Y / SCALE])
const clip = (op, subj, clp, fill = PolyFillType.pftNonZero) => {
  const c = new Clipper(), out = new Paths()
  c.AddPaths(subj, PolyType.ptSubject, true)
  if (clp) c.AddPaths(clp, PolyType.ptClip, true)
  if (!c.Execute(op, out, fill, PolyFillType.pftNonZero)) throw new Error('bake-coast: a clipper operation FAILED')
  return out
}
const areaM2 = (paths) => paths.reduce((t, p) => t + Clipper.Area(p), 0) / (SCALE * SCALE)
const ringArea = (r) => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2)

/**
 * THE SHEET'S WATER: cells whose ground lies below high water (`w > 0`, w = high − ground) CONNECTED, 4-way, to the
 * grid's edge. A NaN cell (no lidar) and a `held` cell (a mapped dike) are never entered.
 * @returns Uint8Array, 1 = water
 */
export function floodFromEdge(w, W, H, held = null) {
  const wet = new Uint8Array(W * H), queue = new Int32Array(W * H)
  let qt = 0
  const seed = (k) => { if (!wet[k] && w[k] > 0 && !(held && held[k])) { wet[k] = 1; queue[qt++] = k } }
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
  for (let k = 0; k < wet.length; k++) f[k] = wet[k] ? -w[k] : (Number.isFinite(w[k]) && w[k] <= 0 ? Math.max(-w[k], Number.EPSILON) : 1)
  return f
}

/** Mapped lines that hold water, drawn into the grid in half-cell steps (an 8-connected line a 4-way fill cannot cross). */
export function heldCells(osmGround, grid) {
  const { W, H, x0, z0, step } = grid
  const held = new Uint8Array(W * H)
  let n = 0
  for (const bucket of Object.values(osmGround || {})) {
    if (!Array.isArray(bucket)) continue
    for (const f of bucket) {
      const t = f?.tags || {}
      if (!(t.man_made === 'dyke' || t.embankment === 'yes' || t.waterway === 'dam')) continue
      const c = (f.coords || []).filter(q => Number.isFinite(q.x) && Number.isFinite(q.z))
      for (let m = 1; m < c.length; m++) {
        const L = Math.hypot(c[m].x - c[m - 1].x, c[m].z - c[m - 1].z), steps = Math.max(1, Math.ceil(L / (step / 2)))
        for (let u = 0; u <= steps; u++) {
          const i = Math.round((c[m - 1].x + (c[m].x - c[m - 1].x) * u / steps - x0) / step)
          const j = Math.round((c[m - 1].z + (c[m].z - c[m - 1].z) * u / steps - z0) / step)
          if (i >= 0 && j >= 0 && i < W && j < H && !held[j * W + i]) { held[j * W + i] = 1; n++ }
        }
      }
    }
  }
  return { held, n }
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
 * loop, flagged, because ① must never stroke a closed ring (it fragments; the header, step 4).
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
 * `minM2` dropped. Bodies that do not reach the edge are returned apart, as `hollows` (ground below high water that the
 * sea does not reach), counted by the caller.
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
  const read = (f) => JSON.parse(fs.readFileSync(join(mapDir, f), 'utf8'))
  for (const f of ['geography.json', 'neighborhood_boundary.json', 'raw/osm.json'])
    if (!fs.existsSync(join(mapDir, f))) throw new Error(`⛔ bake-coast: ${scene} has no ${f}. Fetch the town first.`)
  const geo = read('geography.json'), bnd = read('neighborhood_boundary.json'), osm = read('raw/osm.json')
  const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
  const toLocal = (lon, lat) => [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]
  const bx = osm.bbox
  if (!bx) throw new Error(`⛔ bake-coast: ${scene}'s raw/osm.json carries no bbox — the fetched square the coast closes against is unknown`)
  const a = toLocal(bx.minLon, bx.maxLat), b = toLocal(bx.maxLon, bx.minLat)
  const R = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }

  // ── IS THIS A COASTAL TOWN? Two records answer, and they must agree. ─────────────────────────────────────────────
  const osmWater = osmWaterToVerify({ osm, center: bnd.center, discR: bnd.radius, bb: R })
  const hasRecord = fs.existsSync(join(mapDir, 'raw', 'water-datums.json'))
  const out = { version: COAST_VERSION, scene, square: R }
  if (!osmWater.rings.length && !hasRecord) {
    Object.assign(out, { coast: false, why: 'no water record (raw/water-datums.json) and no OSM water reaching the fetched square\'s edge — an inland town' })
    if (write) { fs.mkdirSync(join(outPath, '..'), { recursive: true }); writeIfChanged(outPath, JSON.stringify(out)) }
    console.log(`[bake-coast] ${scene}: inland — ${out.why}`)
    return out
  }
  if (!osmWater.rings.length)
    throw new Error(`⛔ bake-coast: ${scene} has a water record (raw/water-datums.json) and NO OSM water reaching the fetched square's edge to verify the lidar's coast against. An unverified coast is not drawn. ${osmWater.report.join(' ')}`)
  const levels = waterLevels(waterRecord({ mapDir, scene, auth: authoredWater(scene), wgs84ToLocal: toLocal, zero: 0 }))   // NAVD88

  // ── THE LIDAR ────────────────────────────────────────────────────────────────────────────────────────────────────
  const specs = elevationSpecs(mapDir)
  if (!specs.length) throw new Error(`⛔ bake-coast: ${scene} has a coast and no elevation source (raw/elevation-sources.txt, raw/elevation/*.tif, raw/elevation.tif) — the coast is drawn from the lidar. ▶ node cartograph/fetch-dem.mjs --scene=${scene}`)
  const opened = await openRasters(specs, { cacheMB: 128 })
  const corners = [toLL(R.x0, R.z0), toLL(R.x1, R.z0), toLL(R.x0, R.z1), toLL(R.x1, R.z1)]
  const G = TERRAIN_STEP_M
  const W = Math.ceil((R.x1 - R.x0) / G) + 1, H = Math.ceil((R.z1 - R.z0) / G) + 1
  const coarse = await readWindow(opened, { cornersLL: corners, stepM: G, atLL: toLL(R.x0, R.z0), toLL: toLL(R.x0 + G, R.z0), quiet: true })
  const vd = demVerticalDatum(coarse, corners)
  if (!vd) throw new Error(`⛔ bake-coast: ${scene}'s lidar names no NAVD88 vertical datum (${coarse.map(S => S.label).join(', ')}), and the water record is NAVD88 — two vertical datums are never compared`)
  const X = (i) => R.x0 + i * G, Z = (j) => R.z0 + j * G
  const ground = new Float32Array(W * H), w = new Float32Array(W * H)
  let noLidar = 0
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = sampleSources(coarse, ...toLL(X(i), Z(j))), k = j * W + i
    ground[k] = v; w[k] = levels.highAt(X(i), Z(j)) - v
    if (!Number.isFinite(v)) noLidar++
  }
  coarse.length = 0
  if (noLidar === W * H) throw new Error(`⛔ bake-coast: ${scene}'s lidar holds NO value anywhere over the fetched square — no coast can be drawn from it`)
  const { held, n: heldN } = heldCells(osm.ground, { W, H, x0: R.x0, z0: R.z0, step: G })
  const wet = floodFromEdge(w, W, H, held)

  // ── THE FINE LINE, along the sheet's edge, at the source's own pixel ────────────────────────────────────────────
  const [cx, cz] = bnd.center
  let fine = Infinity
  for (const o of opened) {
    const p = o.proj.to(...toLL(cx, cz)), q = o.proj.to(...toLL(cx + 1, cz))
    fine = Math.min(fine, Math.abs(o.base.getResolution()[0]) / Math.hypot(q[0] - p[0], q[1] - p[1]))
  }
  if (!(fine > 0 && Number.isFinite(fine))) throw new Error(`⛔ bake-coast: ${scene} — the lidar's pixel size could not be read`)
  const cellSq = (k, r) => { const i = k % W, j = (k - i) / W; return toPath([[X(i) - r, Z(j) - r], [X(i) + r, Z(j) - r], [X(i) + r, Z(j) + r], [X(i) - r, Z(j) + r]]) }
  const edge = edgeCells(wet, w, W, H)
  const band = clip(ClipType.ctUnion, edge.map(k => cellSq(k, 1.5 * G)), null)
  const fc = sheetField(wet, w)
  const sheet = clip(ClipType.ctUnion, wetLoops(fc, W, H, R.x0, R.z0, G).map(toPath), null, PolyFillType.pftEvenOdd)
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
    const win = await readWindow(opened, { cornersLL: [toLL(x0 - m, z0 - m), toLL(x0 + span + m, z0 - m), toLL(x0 - m, z0 + span + m), toLL(x0 + span + m, z0 + span + m)], stepM: null, quiet: true })
    const n = Math.round(span / fine) + 1
    const f = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + i * fine, z = z0 + j * fine, v = sampleSources(win, ...toLL(x, z))
      samples++
      if (!Number.isFinite(v)) { noValue++; f[j * n + i] = 1 }           // no value: DRY here; counted, and the sheet's NaN rule is the same
      else f[j * n + i] = v - levels.highAt(x, z)                          // ≤ 0 = below high water
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
  const share = osmM2 > 0 ? agreeM2 / osmM2 : 0
  if (!(share >= 0.5)) throw new Error(`⛔ bake-coast: ${scene} — the lidar and OSM disagree about the water at a MAJORITY: only ${(100 * share).toFixed(1)}% of OSM's ${(osmM2 / 1e4).toFixed(1)} ha of water is below high water (${levels.highName}) and connected to the square's edge. ${gapLine(osmWater, ground, W, H, R, G, levels)}`)

  // ── THE ARCS: the shoreline ① strokes, simplified below half the source's pixel (detail finer than the source) ──
  const arcs = [], islands = []
  for (const bd of bodies) for (const ring of [bd.outer, ...bd.holes]) for (const a of arcsOf(ring, R)) {
    if (a.closed) { islands.push({ pts: a.pts.length, m2: Math.round(ringArea(a.pts)), at: a.pts[0].map(Math.round) }); continue }
    arcs.push(simplify(a.pts, fine / 2).map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]))
  }
  const r3 = (r) => r.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)])
  Object.assign(out, {
    coast: true,
    from: `the lidar meets ${levels.highName} (${levels.tidal ? 'tidal' : 'lake'}; NAVD88 ${levels.range.high.map(v => v.toFixed(3)).join('…')} m), traced at ${+fine.toFixed(3)} m along a ${G} m sheet over the fetched square`,
    level: { high: levels.highName, low: levels.lowName, tidal: levels.tidal, navd88High: levels.range.high, navd88Low: levels.range.low },
    dem: vd, gridM: G, fineM: +fine.toFixed(3),
    water: bodies.map(bd => ({ outer: r3(bd.outer), holes: bd.holes.map(r3) })),
    arcs, islands,
    verify: { osmWaterHa: +(osmM2 / 1e4).toFixed(2), lidarWetShareOfOsm: +share.toFixed(4), lidarWetWithoutOsmHa: +(lidarOnlyM2 / 1e4).toFixed(2) },
    totals: { heldCells: heldN, noLidarHa: +(noLidar * G * G / 1e4).toFixed(1), fineTiles: tiles, fineSamples: samples, fineNoValue: noValue,
              hollows: hollows.length, hollowHa: +(hollows.reduce((t, h) => t + ringArea(h.outer), 0) / 1e4).toFixed(2) },
  })
  if (write) { fs.mkdirSync(join(outPath, '..'), { recursive: true }); writeIfChanged(outPath, JSON.stringify(out)) }
  const T = out.totals, V = out.verify
  console.log(`[bake-coast] ${scene}: ${out.from}`)
  console.log(`  ${bodies.length} water bod(ies) · ${arcs.length} shoreline arc(s), ${arcs.reduce((t, a) => t + a.length, 0).toLocaleString()} vertices · ${tiles} fine tile(s), ${samples.toLocaleString()} samples`)
  console.log(`  VERIFY: ${(100 * V.lidarWetShareOfOsm).toFixed(1)}% of OSM's ${V.osmWaterHa} ha of water is lidar-wet · ${V.lidarWetWithoutOsmHa} ha lidar-wet with no OSM water (reported, not refused)`)
  if (T.noLidarHa) console.warn(`  ⚠️ ${T.noLidarHa} ha of the square has NO lidar value — the sheet does not enter it (neither water nor land is known there)`)
  if (noValue) console.warn(`  ⚠️ ${noValue.toLocaleString()} fine sample(s) along the line had no lidar value — traced as dry`)
  if (hollows.length) console.log(`  ${hollows.length} hollow(s) below high water that the water does not reach (${T.hollowHa} ha) — dry, by the coast rule`)
  if (islands.length) console.warn(`  ⛔ ${islands.length} island(s) — a closed shore ① cannot stroke: ${islands.slice(0, 5).map(s => `${s.m2} m² at (${s.at})`).join(' · ')}`)
  console.log(`  ${!write ? 'NOT WRITTEN (dry run)' : 'wrote'} ${outPath}`)
  return out
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
