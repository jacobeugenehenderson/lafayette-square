#!/usr/bin/env node
/**
 * bake-shore-median.mjs — THE SPACE BETWEEN THE DRAWN SHORELINE AND THE LIDAR'S WATERLINE.
 *
 * ⭐⭐ RULED 2026-10-04 (Jacob, BRIEF-the-shore-is-closed): the shore median is the road median's construction —
 * TWO separate lines and the ground between them, whose width varies by itself because the lines drift apart:
 *   · the DRAWN SHORELINE — the drawn water's edge (`clean/map.json#layers.water`, whose edge is the slab's
 *     `__water__` ink, `shoreRuns.mjs`);
 *   · the LIDAR'S WATERLINE — where the surveyed ground meets the water the survey was flown at (y = 0, the
 *     terrain's datum). ⛔ Not a tide level and not the town's LOW/HIGH: the water moves INSIDE the median.
 * Where the two lines touch the treatment is SAND, never nothing. This step builds the REGION only.
 *
 * ⭐⭐ THE WATERLINE IS TRACED AS ONE CONTINUOUS LINE (Jacob, 2026-10-05: "trace the lidar waterline as one continuous
 * line across the 1 m lidar"). The first cut walked a transect out from every 1 m station and joined the landing
 * points; neighbouring walks landed metres apart wherever the waterline bent, so the median's outer edge was a
 * sawtooth — measured 9.5 hairpins (> 135°) per km on huron, 7 per km on provincetown, against 0 on the drawn
 * shoreline. Retired; the line is now a contour.
 *
 * ── HOW ────────────────────────────────────────────────────────────────────────
 *   1. THE BAND — how far from the drawn shoreline to look. Along each shoreline arc the terrain grid (the whole
 *      town read once at its own step) is walked both ways to its first change of state; the band reaches that far
 *      plus two grid steps (the coarse grid can misplace a crossing by a cell, bilinear reads one more). ⛔ No
 *      distance constant.
 *   2. THE LIDAR'S WATER — inside the band, the source is sampled on a regular 1 m grid in town metres, at its own
 *      finest level, and the water's edge (ABOVE_WATER_M: the datum's own 1 cm bucket) is traced by MARCHING SQUARES
 *      into closed polygons — a line with sub-pixel corners, not a staircase of pixels.
 *   3. THE MEDIAN — where the drawing and the lidar DISAGREE, inside the band, touching the drawn shoreline:
 *        'seaward'  = drawn water the lidar shows dry (the lidar ground runs on into the drawn water)
 *        'landward' = drawn land the lidar shows wet (the lidar water reaches in behind the drawn shore)
 *      Disagreement that does not touch the shoreline (an inland puddle, a dry islet far out) is not this median.
 *   ⭐ The grid step is the source's own pixel in metres (measured at the town's centre), never a number chosen here.
 *
 * ── WHAT IS SAID, BY NAME ──────────────────────────────────────────────────────
 *   arcs `wetSideOf` refuses (stub · ink without water) · band area where the source has NO value (the median is
 *   NOT KNOWN there: cut out of both regions, printed in hectares) · where the two lines drift farthest apart.
 *
 *   node cartograph/bake-shore-median.mjs --scene=<id> [--look=<id>] [--out=<dir>]
 * Writes public/baked/<look>/shore-median.json (or <dir>/shore-median.json): `regions.seaward|landward` as
 * [{ outer, holes }] in town metres, and `shoreFingerprint`, the shoreline it was traced against (bake-ground paints
 * the median as sand only onto that same shoreline). Reads the network (range requests) when the town's elevation is
 * a URL list, as bake-terrain does.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import clipperLib from 'clipper-lib'
import { writeIfChanged } from './io.js'
import { requireExplicitMap } from './scene.js'
import { wetSideOf, drawnWaterTest } from './shore-armour.mjs'
import { waterRuns, WATER_EDGE_SKEL, clipTraceToDisc, coastVerdict, resample, shoreFingerprint } from './shoreRuns.mjs'
import { elevationSpecs, openRasters, readWindow, sampleSources, ABOVE_WATER_M } from './elevationSources.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { Clipper, ClipperOffset, Paths, Path, IntPoint, ClipType, PolyType, PolyFillType, PolyTree, JoinType, EndType } = clipperLib
const SCALE = 1000                                                  // clipper units per metre: 1 mm
const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))); return p }
const toRing = (path) => path.map(q => [Math.round(q.X / SCALE * 100) / 100, Math.round(q.Y / SCALE * 100) / 100])
const run = (op, subj, clip, fill = PolyFillType.pftNonZero) => {
  const c = new Clipper(), out = new Paths()
  c.AddPaths(subj, PolyType.ptSubject, true)
  if (clip) c.AddPaths(clip, PolyType.ptClip, true)
  if (!c.Execute(op, out, fill, PolyFillType.pftNonZero)) throw new Error('bake-shore-median: a clipper operation FAILED')
  return out
}
const ringArea = (r) => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
// Paths → [{ outer, holes }] (a PolyTree walk). `minM2`: a ring smaller than this is below what the source resolves and
// is dropped (an outer with its holes; a hole alone) — the caller passes (2 × the source pixel)², two samples across.
const toItems = (paths, minM2 = 0) => {
  const c = new Clipper(); c.AddPaths(paths, PolyType.ptSubject, true)
  const tree = new PolyTree(); c.Execute(ClipType.ctUnion, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const out = []
  const walk = (node) => { for (const ch of node.Childs()) {
    const outer = toRing(ch.m_polygon)
    if (ringArea(outer) >= minM2) out.push({ outer, holes: ch.Childs().map(h => toRing(h.m_polygon)).filter(h => ringArea(h) >= minM2) })
    for (const h of ch.Childs()) walk(h) } }
  walk(tree)
  return out
}
const areaOf = (paths) => paths.reduce((t, p) => t + Clipper.Area(p), 0) / (SCALE * SCALE)

/** The square tile, in metres, that the 1 m grid is sampled in. ⛔ Not a geometric value: the tiles overlap by one
 *  sample and are unioned, so where the tile edges fall changes nothing; it bounds memory and one read's size. */
const TILE_M = 256

/**
 * MARCHING SQUARES over one tile's grid: the closed loops of f ≤ 0 (wet). The grid is padded with a DRY ring so every
 * loop closes inside the tile; loops are returned unoriented and must be filled EVEN-ODD (a hole is a loop inside a loop).
 * @param f  Float32Array (nx × nz, row-major by z), x0/z0 the first sample's town metres, step metres
 */
export function wetLoops(f, nx, nz, x0, z0, step) {
  const NX = nx + 2, NZ = nz + 2, g = new Float32Array(NX * NZ).fill(1)   // the dry pad
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) g[(j + 1) * NX + i + 1] = f[j * nx + i]
  const X = (i) => x0 + (i - 1) * step, Z = (j) => z0 + (j - 1) * step
  const val = (i, j) => g[j * NX + i]
  // an edge's crossing point and its key: 'h' edges join (i,j)-(i+1,j), 'v' edges join (i,j)-(i,j+1)
  const pt = new Map()
  const cross = (kind, i, j) => {
    const key = `${kind}${i},${j}`
    if (!pt.has(key)) {
      const a = val(i, j), b = kind === 'h' ? val(i + 1, j) : val(i, j + 1), t = a / (a - b)
      pt.set(key, kind === 'h' ? [X(i) + t * step, Z(j)] : [X(i), Z(j) + t * step])
    }
    return key
  }
  const segs = []
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const tl = val(i, j) <= 0, tr = val(i + 1, j) <= 0, br = val(i + 1, j + 1) <= 0, bl = val(i, j + 1) <= 0
    const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0)
    if (code === 0 || code === 15) continue
    const T = () => cross('h', i, j), R = () => cross('v', i + 1, j), Bm = () => cross('h', i, j + 1), L = () => cross('v', i, j)
    switch (code) {
      case 1: case 14: segs.push([L(), Bm()]); break
      case 2: case 13: segs.push([Bm(), R()]); break
      case 3: case 12: segs.push([L(), R()]); break
      case 4: case 11: segs.push([T(), R()]); break
      case 6: case 9: segs.push([T(), Bm()]); break
      case 7: case 8: segs.push([L(), T()]); break
      // saddles: the cell's mean decides which diagonal pair joins
      case 5: { const m = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4
        if (m <= 0) { segs.push([L(), T()]); segs.push([Bm(), R()]) } else { segs.push([L(), Bm()]); segs.push([T(), R()]) } break }
      case 10: { const m = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4
        if (m <= 0) { segs.push([L(), Bm()]); segs.push([T(), R()]) } else { segs.push([L(), T()]); segs.push([Bm(), R()]) } break }
    }
  }
  // stitch: every edge key is shared by exactly two segments (the pad guarantees it)
  const at = new Map()
  segs.forEach((s, k) => { for (const e of s) (at.get(e) || at.set(e, []).get(e)).push(k) })
  const used = new Uint8Array(segs.length), loops = []
  for (let k0 = 0; k0 < segs.length; k0++) {
    if (used[k0]) continue
    const loop = []
    let k = k0, from = segs[k0][0]
    while (!used[k]) {
      used[k] = 1
      const to = segs[k][0] === from ? segs[k][1] : segs[k][0]
      loop.push(pt.get(from))
      from = to
      const nxt = at.get(to).find(q => !used[q])
      if (nxt === undefined) break
      k = nxt
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

export async function bakeShoreMedian({ scene, look, outDir: outDirArg = null, write = true }) {
  const lookId = look || scene
  const mapDir = join(ROOT, 'cartograph', 'data', scene)
  const shapePath = join(ROOT, 'public', 'baked', lookId, 'shape.json')
  const tMetaPath = join(mapDir, 'clean', 'terrain.json')
  const mapPath = join(mapDir, 'clean', 'map.json')
  const geoPath = join(mapDir, 'geography.json')
  const bndPath = join(mapDir, 'neighborhood_boundary.json')
  const outDir = outDirArg || join(ROOT, 'public', 'baked', lookId)
  const outPath = join(outDir, 'shore-median.json')
  for (const [p, what] of [[shapePath, 'shape.json'], [tMetaPath, 'clean/terrain.json'], [mapPath, 'clean/map.json'], [geoPath, 'geography.json'], [bndPath, 'neighborhood_boundary.json']]) {
    if (!existsSync(p)) throw new Error(`bake-shore-median: ${scene} has no ${what} (${p}). Pour the town first.`)
  }
  const tm = JSON.parse(readFileSync(tMetaPath, 'utf8'))
  const shape = JSON.parse(readFileSync(shapePath, 'utf8'))
  const runs = waterRuns(shape)

  // ⭐ The same three outcomes as the revetment, for the same reason: the slab and the terrain must agree about the coast.
  const cv = coastVerdict(tm, shape)
  if (cv.said) console.log(`[bake-shore-median] scene=${scene}: ${cv.said}`)
  const agree = cv.agree
  if (agree === 'inland') {
    console.log(`[bake-shore-median] scene=${scene}: terrain datum "${tm.datum ?? 'unset'}" and no ${WATER_EDGE_SKEL} runs — inland. No median.`)
    return { regions: null, reason: 'no-coast' }
  }
  if (agree === 'stale-terrain') throw new Error(`bake-shore-median: ${scene} — the slab has ${runs.length} ${WATER_EDGE_SKEL} run(s) but the terrain datum is "${tm.datum}", not the water. The lidar's waterline is y = 0 only when the datum IS the water. ▶ re-bake the terrain, then run this again.`)
  if (!runs.length) {
    console.log(`[bake-shore-median] scene=${scene}: no ${WATER_EDGE_SKEL} runs in the slab — no drawn shoreline, no median.`)
    return { regions: null, reason: 'no-shoreline' }
  }
  const baseElev = tm.baseElev
  if (!Number.isFinite(baseElev)) throw new Error(`bake-shore-median: ${scene}'s terrain.json has no baseElev — the lidar's water cannot be found without it`)

  const geo = JSON.parse(readFileSync(geoPath, 'utf8'))
  // The same formula bake-terrain uses (its localToWgs84): the town's own frame, read from its geography.json.
  const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]

  const bnd = JSON.parse(readFileSync(bndPath, 'utf8'))
  const discC = bnd.center, discR = bnd.radius
  if (!Array.isArray(discC) || !(discR > 0)) throw new Error(`bake-shore-median: ${scene}'s neighborhood_boundary.json has no usable center/radius`)
  const waterRings = (JSON.parse(readFileSync(mapPath, 'utf8')).layers?.water || [])
    .filter(w => Array.isArray(w?.ring) && w.ring.length >= 3).map(w => w.ring.map(p => [p.x ?? p[0], p.z ?? p[1]]))
  if (!waterRings.length) throw new Error(`bake-shore-median: ${scene} — ${runs.length} shoreline run(s) but clean/map.json draws no water. Re-pour.`)
  const inWater = drawnWaterTest(waterRings)

  const specs = elevationSpecs(mapDir)
  if (!specs.length) throw new Error(`bake-shore-median: ${scene} has no elevation source (raw/elevation-sources.txt, raw/elevation/*.tif, raw/elevation.tif). ▶ see bake-terrain's message for what to fetch.`)
  // ⭐ Many overlapping windows along one shore: each source keeps its fetched blocks, so a block is fetched once.
  const opened = await openRasters(specs, { cacheMB: 128 })

  // ⭐ THE STATION SPACING IS THE SOURCE'S OWN PIXEL, in metres, measured at the town's centre (a pixel may be in
  // degrees). The finest source sets it.
  const [cx, cz] = discC
  let stationM = Infinity
  for (const o of opened) {
    const a = o.proj.to(...toLL(cx, cz)), b = o.proj.to(...toLL(cx + 1, cz))
    const unitsPerM = Math.hypot(b[0] - a[0], b[1] - a[1])
    stationM = Math.min(stationM, Math.abs(o.base.getResolution()[0]) / unitsPerM)
  }
  if (!(stationM > 0 && Number.isFinite(stationM))) throw new Error(`bake-shore-median: ${scene} — could not read the elevation source's pixel size`)

  // ── PASS A: the whole town at the terrain grid, once — it bounds every finest-level walk ─────────────────────────
  const { width: W, height: H, bounds: B } = tm
  const sx = (B.maxX - B.minX) / (W - 1), sz = (B.maxZ - B.minZ) / (H - 1), gridM = Math.min(sx, sz)
  const corners = [toLL(B.minX, B.minZ), toLL(B.maxX, B.minZ), toLL(B.minX, B.maxZ), toLL(B.maxX, B.maxZ)]
  const coarse = await readWindow(opened, { cornersLL: corners, stepM: gridM, atLL: toLL(B.minX, B.minZ), toLL: toLL(B.minX + gridM, B.minZ), quiet: true })
  const grid = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) grid[j * W + i] = sampleSources(coarse, ...toLL(B.minX + sx * i, B.minZ + sz * j)) - baseElev
  coarse.length = 0
  const gridAt = (x, z) => {
    const i = Math.round((x - B.minX) / sx), j = Math.round((z - B.minZ) / sz)
    return (i < 0 || j < 0 || i >= W || j >= H) ? undefined : grid[j * W + i]   // undefined = off the grid; NaN = no lidar
  }
  // The coarse walk: the first change of state along (nx, nz), in grid steps; Infinity if none before leaving the grid.
  const coarseCross = (x, z, nx, nz, dry, stop = null) => {
    for (let d = gridM; ; d += gridM) {
      const v = gridAt(x + nx * d, z + nz * d)
      if (v === undefined) return Infinity
      if (stop && stop(x + nx * d, z + nz * d)) return d
      if (!Number.isFinite(v)) return d
      if ((v > ABOVE_WATER_M) !== dry) return d
    }
  }

  // ── THE BAND: along every shoreline arc in the drawing, as far as the terrain grid says the lines drift apart ─────
  const refused = []
  let outsideM = 0, shoreM = 0
  const clipped = []
  for (const r of runs) { const { inside, outsideM: cut } = clipTraceToDisc(r, discC, discR); outsideM += cut; clipped.push(...inside) }
  const bandParts = new Paths(), shorePts = [], far = []
  for (let idx = 0; idx < clipped.length; idx++) {
    const trace = clipped[idx]
    const len = trace.reduce((a, p, i) => i ? a + Math.hypot(p[0] - trace[i - 1][0], p[1] - trace[i - 1][1]) : 0, 0)
    const wet = wetSideOf(trace, inWater, gridM)
    if (!wet.side) { refused.push({ run: idx, lengthM: +len.toFixed(1), kind: wet.kind, why: wet.why }); continue }
    shoreM += len
    for (const p of resample(trace, stationM)) shorePts.push(p)
    // per grid step along the arc, how far the lines drift apart there: from a station the coarse grid reads DRY, walk
    // toward the drawn water until it reads wet; from one it reads WET, walk inland until it reads dry. Only the side the
    // median lies on is walked (a walk the other way runs on into the hinterland and makes the band a town).
    const path = resample(trace, gridM)
    const sides = wet.side === 'both' ? [1, -1] : [wet.side === 'right' ? 1 : -1]   // wetSideOf names RIGHT as (-tz, tx)
    const reach = path.map((p, i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)]
      const tx = b[0] - a[0], tz = b[1] - a[1], m = Math.hypot(tx, tz) || 1
      const g = gridAt(p[0], p[1]), dry = Number.isFinite(g) && g > ABOVE_WATER_M
      let r = gridM
      for (const sg of sides) {
        const ux = sg * -tz / m, uz = sg * tx / m                     // toward the drawn water
        // a walk toward the water ENDS where the drawn water ends: the median belongs to the water it borders (huron,
        // 2026-10-04: a drawn strip the lidar shows dry, then 4 km of land beyond it)
        const d = dry ? coarseCross(p[0], p[1], ux, uz, true, (x, z) => !inWater(x, z)) : coarseCross(p[0], p[1], -ux, -uz, false)
        if (Number.isFinite(d)) r = Math.max(r, d)
      }
      far.push({ r, x: p[0], z: p[1] })
      return r + 2 * gridM
    })
    for (let a = 0; a < path.length - 1; ) {
      let b = a + 1, R = Math.max(reach[a], reach[b])
      while (b + 1 < path.length && Math.max(R, reach[b + 1]) <= R * 1.5) { b++; R = Math.max(R, reach[b]) }
      const co = new ClipperOffset(), out = new Paths()
      co.AddPath(toPath(path.slice(a, b + 1)), JoinType.jtRound, EndType.etOpenRound)
      co.Execute(out, R * SCALE)
      for (const q of out) bandParts.push(q)
      a = b
    }
  }
  const band = run(ClipType.ctUnion, bandParts, null)
  const drawn = run(ClipType.ctUnion, waterRings.map(toPath), null)

  // ── THE LIDAR'S WATER, traced on a 1 m grid in tiles over the band ─────────────────────────────────────────────
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity
  for (const p of band) for (const q of p) { bx0 = Math.min(bx0, q.X / SCALE); bx1 = Math.max(bx1, q.X / SCALE); bz0 = Math.min(bz0, q.Y / SCALE); bz1 = Math.max(bz1, q.Y / SCALE) }
  const step = stationM, wetParts = new Paths(), unknownParts = new Paths()
  let tiles = 0, samples = 0, noValue = 0
  for (let tz = Math.floor(bz0 / TILE_M) * TILE_M; tz < bz1; tz += TILE_M) for (let tx = Math.floor(bx0 / TILE_M) * TILE_M; tx < bx1; tx += TILE_M) {
    const sq = toPath([[tx, tz], [tx + TILE_M, tz], [tx + TILE_M, tz + TILE_M], [tx, tz + TILE_M]])
    const inTile = run(ClipType.ctIntersection, [sq], band)
    if (!inTile.length) continue
    tiles++
    if (tiles % 50 === 0) console.log(`  [progress] waterline tiles ${tiles}`)
    const m = 2 * step
    const win = await readWindow(opened, { cornersLL: [toLL(tx - m, tz - m), toLL(tx + TILE_M + m, tz - m), toLL(tx - m, tz + TILE_M + m), toLL(tx + TILE_M + m, tz + TILE_M + m)], stepM: null, quiet: true })
    const n = Math.round(TILE_M / step) + 2                           // one sample of overlap into the next tile
    const f = new Float32Array(n * n), u = new Float32Array(n * n).fill(1)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = sampleSources(win, ...toLL(tx + i * step, tz + j * step)) - baseElev
      samples++
      if (!Number.isFinite(v)) { noValue++; f[j * n + i] = 1; u[j * n + i] = -1 }   // no value: NOT KNOWN (cut out, below)
      else f[j * n + i] = v - ABOVE_WATER_M
    }
    win.length = 0
    const loops = wetLoops(f, n, n, tx, tz, step)
    if (loops.length) for (const q of run(ClipType.ctUnion, loops.map(toPath), null, PolyFillType.pftEvenOdd)) wetParts.push(q)
    const holes = wetLoops(u, n, n, tx, tz, step)
    if (holes.length) for (const q of run(ClipType.ctUnion, holes.map(toPath), null, PolyFillType.pftEvenOdd)) unknownParts.push(q)
  }
  const wet = run(ClipType.ctUnion, wetParts, null)
  const unknown = run(ClipType.ctUnion, unknownParts, null)
  const unknownM2 = areaOf(run(ClipType.ctIntersection, unknown, band))

  // ── THE MEDIAN: drawing and lidar disagree, inside the band, touching the drawn shoreline ────────────────────────
  const known = run(ClipType.ctDifference, band, unknown)
  const inBand = (paths) => run(ClipType.ctIntersection, paths, known)
  const touching = (paths) => {
    const tol = 1.5 * step
    const keep = new Paths()
    for (const p of toItems(paths)) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (const [x, z] of p.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
      const ring = toPath(p.outer)
      const hit = shorePts.some(([x, z]) => x >= x0 - tol && x <= x1 + tol && z >= z0 - tol && z <= z1 + tol &&
        (Clipper.PointInPolygon(new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE)), ring) !== 0 ||
         p.outer.some((a, i) => { const b = p.outer[(i + 1) % p.outer.length], dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz
           const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0
           return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) <= tol })))
      if (hit) { keep.push(ring); for (const h of p.holes) keep.push(toPath(h)) }
    }
    return keep
  }
  const seaward = touching(inBand(run(ClipType.ctDifference, drawn, wet)))
  const landward = touching(inBand(run(ClipType.ctDifference, wet, drawn)))
  const seaM2 = areaOf(run(ClipType.ctUnion, seaward, null, PolyFillType.pftEvenOdd)), landM2 = areaOf(run(ClipType.ctUnion, landward, null, PolyFillType.pftEvenOdd))

  // ── The artifact ────────────────────────────────────────────────────────────────────────────────────────────────
  // ⭐ Below what the source resolves: a region (or hole) smaller than two samples square is lidar noise, not a shore —
  // measured on huron 2026-10-05, 289 of the outline's 508 hairpins were in rings under 4 m² (at 1 m).
  const minM2 = (2 * step) ** 2
  const regions = { seaward: toItems(seaward, minM2), landward: toItems(landward, minM2) }
  const out = {
    version: 2, scene, look: lookId,
    shoreFrom: 'drawn-water (clean/map.json#layers.water; its edge is the slab\'s __water__ ink)',
    waterlineFrom: `the lidar at y = 0 (the terrain datum, ${tm.datum}; baseElev ${baseElev} m), traced by marching squares at ${+step.toFixed(3)} m: above = more than ABOVE_WATER_M (${ABOVE_WATER_M} m)`,
    shoreFingerprint: shoreFingerprint(shape),
    stationM: +stationM.toFixed(3), gridM: +gridM.toFixed(3), aboveWaterM: ABOVE_WATER_M,
    totals: { shoreM: +shoreM.toFixed(1), outsideM: +outsideM.toFixed(1), refusedM: +refused.reduce((t, r) => t + r.lengthM, 0).toFixed(1),
              seawardM2: Math.round(seaM2), landwardM2: Math.round(landM2), meanWidthM: +((seaM2 + landM2) / Math.max(1, shoreM)).toFixed(2),
              tiles, samples, noValueSamples: noValue, unknownM2: Math.round(unknownM2) },
    regions, refused,
  }

  let wrote = false
  if (write) { mkdirSync(outDir, { recursive: true }); wrote = writeIfChanged(outPath, JSON.stringify(out)) }
  const km = (m) => (m / 1000).toFixed(2), ha = (m2) => (m2 / 1e4).toFixed(2)
  console.log(`[bake-shore-median] scene=${scene} look=${lookId}: the lidar waterline traced at ${step.toFixed(2)} m (the source's own pixel) over ${tiles} tile(s), ${samples.toLocaleString()} samples`)
  console.log(`  ⭐ MEDIAN: ${km(shoreM)} km of drawn shore · ${ha(seaM2)} ha where the lidar ground runs into the drawn water (${regions.seaward.length} region(s)) · ${ha(landM2)} ha where the lidar water reaches behind it (${regions.landward.length}) · mean width ${out.totals.meanWidthM} m`)
  if (noValue) console.warn(`  ⛔ ${ha(unknownM2)} ha of the band has NO lidar value (${noValue.toLocaleString()} samples) — the median is NOT KNOWN there and is not drawn`)
  far.sort((a, b) => b.r - a.r)
  console.log(`    the lines drift farthest apart at: ${far.slice(0, 3).map(q => `${Math.round(q.r)} m at (${Math.round(q.x)}, ${Math.round(q.z)})`).join(' · ')}`)
  for (const r of refused) console.warn(`  ⛔ refused run #${r.run} (${r.lengthM} m): ${r.kind} — ${r.why}`)
  if (outsideM > 0) console.log(`    ${km(outsideM)} km of shoreline outside the drawing (beyond the ${Math.round(discR)} m disc) — not walked`)
  console.log(`  ${!write ? 'NOT WRITTEN (dry run)' : wrote ? 'wrote' : 'unchanged'} ${outPath} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`)
  return out
}

async function main() {
  const scene = requireExplicitMap('bake-shore-median')
  let look = null, outDir = null
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--look=(.+)$/); if (m) look = m[1]
    const o = arg.match(/^--out=(.+)$/); if (o) outDir = o[1]
  }
  await bakeShoreMedian({ scene, look, outDir })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
