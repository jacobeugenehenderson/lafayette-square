#!/usr/bin/env node
/**
 * bake-shore-median.mjs — THE SPACE BETWEEN THE DRAWN SHORELINE AND THE LIDAR'S WATERLINE.
 *
 * ⭐⭐ RULED 2026-10-04 (Jacob, BRIEF-the-shore-is-closed): the shore median is the road median's construction —
 * TWO separate lines and the ground between them, whose width varies by itself because the lines drift apart:
 *   · the DRAWN SHORELINE — the slab's `__water__` ink (`shoreRuns.mjs`), which is the drawn water's edge;
 *   · the LIDAR'S WATERLINE — where the surveyed ground meets the water the survey was flown at (y = 0, the
 *     terrain's datum). ⛔ Not a tide level and not the town's LOW/HIGH: the water moves INSIDE the median, it
 *     never bounds it.
 * Grain is ZERO at the lidar waterline and grows toward the drawn shoreline as the gap opens; where the two lines
 * touch, the treatment is SAND, never nothing. This step builds the REGION only. No treatment is decided here.
 *
 * ⭐ AT THE SOURCE'S FINEST LEVEL, NOT THE TERRAIN GRID (Jacob: "1 m"; "the finest detail possible"). Measured
 * 2026-10-04: on huron 62% of the drawn shore has a gap under one 5 m grid step, so the bake grid erases it. The
 * station spacing is the elevation source's own native pixel, read off the tile — never a number chosen here.
 *
 * ── HOW, per station on the drawn shore ──────────────────────────────────────
 *   1. Which side of the shore is the drawn water: `wetSideOf` (shore-armour.mjs), the revetment's own reader.
 *   2. Is the lidar dry or wet AT the station (above / at-or-below the datum's own 1 cm bucket, ABOVE_WATER_M)?
 *      dry ⇒ the lidar ground runs on into the drawn water: walk WATERWARD until it is wet ('seaward').
 *      wet ⇒ the lidar water reaches in behind the drawn shore: walk LANDWARD until it is dry ('landward').
 *   3. The walk's bound is DERIVED: the same walk on the terrain grid first (the whole town read once at the grid
 *      step), then at the finest level out to that crossing plus two grid steps — the coarse grid can misplace a
 *      crossing by one cell, and bilinear reads one more. ⛔ No distance constant.
 *   The median at that station is the strip from the station to the crossing, along the shore's normal.
 *   ⚠️ A TRANSECT, not a 2-D region growth: a lidar waterline that runs off the normal (a channel entering at an
 *   angle) is met where the normal meets it. Disclosed, not hidden: the step prints how many crossings it found.
 *
 * ── WHAT FAILS LOUDLY, BY NAME ────────────────────────────────────────────────
 *   'drawn-water-dry' — a waterward walk crossed the whole drawn water and the lidar showed no water in it (measured
 *   on huron 2026-10-04: a drawn strip ~12 m wide standing 0.25–0.5 m above the lake, then 4 km of land) ·
 *   'no-waterline' — no crossing within the derived bound · 'lidar-ends' — the source has no value before a
 *   crossing (lidar returns nothing off open water) · 'no-lidar' — none at the station itself · refused arcs by
 *   `wetSideOf`'s own kinds. Each is counted in metres of drawn shore and printed every bake.
 *
 *   node cartograph/bake-shore-median.mjs --scene=<id> [--look=<id>] [--out=<dir>]
 * Per face, per station: xs/zs (on the drawn shore) · ex/ez (the other end) · w (metres between) · k (KINDS index) ·
 * h (lidar metres above the datum at the station) · he (at the other end: the waterline, or the last lidar value read).
 * Writes public/baked/<look>/shore-median.json (or <dir>/shore-median.json). Reads the network (range requests) when
 * the town's elevation is a URL list, as bake-terrain does.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeIfChanged } from './io.js'
import { requireExplicitMap } from './scene.js'
import { wetSideOf, drawnWaterTest } from './shore-armour.mjs'
import { waterRuns, WATER_EDGE_SKEL, clipTraceToDisc, coastAgreement, resample, shoreFingerprint } from './shoreRuns.mjs'
import { elevationSpecs, openRasters, readWindow, sampleSources, ABOVE_WATER_M } from './elevationSources.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Station kinds — the codes the artifact carries per station (`k`), named here once. */
export const KINDS = ['seaward', 'landward', 'no-waterline', 'lidar-ends', 'no-lidar', 'drawn-water-dry']

/** A ceiling for one finest-level read, in pixels — memory, and how many blocks one read asks the host for at once (S3
 *  drops connections when a read asks for too many). ⛔ Not a geometric parameter: it decides how the shore is
 *  CHUNKED for reading, and no result depends on it (a station's walk reads the same pixels whichever chunk holds it). */
const WINDOW_BUDGET_PX = 1 << 20

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
  const agree = coastAgreement(tm.datum, runs.length)
  if (agree === 'inland') {
    console.log(`[bake-shore-median] scene=${scene}: terrain datum "${tm.datum ?? 'unset'}" and no ${WATER_EDGE_SKEL} runs — inland. No median.`)
    return { faces: [], reason: 'no-coast' }
  }
  if (agree === 'stale-terrain') throw new Error(`bake-shore-median: ${scene} — the slab has ${runs.length} ${WATER_EDGE_SKEL} run(s) but the terrain datum is "${tm.datum}", not the water. The lidar's waterline is y = 0 only when the datum IS the water. ▶ re-bake the terrain, then run this again.`)
  if (!runs.length) {
    console.log(`[bake-shore-median] scene=${scene}: no ${WATER_EDGE_SKEL} runs in the slab — no drawn shoreline, no median.`)
    return { faces: [], reason: 'no-shoreline' }
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
  const coarseCross = (x, z, nx, nz, dry) => {
    for (let d = gridM; ; d += gridM) {
      const v = gridAt(x + nx * d, z + nz * d)
      if (v === undefined) return Infinity
      if (!Number.isFinite(v)) return d
      if ((v > ABOVE_WATER_M) !== dry) return d
    }
  }

  // ── The stations, per face of every arc in the drawing ──────────────────────────────────────────────────────────
  const faces = [], refused = []
  let outsideM = 0
  const clipped = []
  for (const r of runs) { const { inside, outsideM: cut } = clipTraceToDisc(r, discC, discR); outsideM += cut; clipped.push(...inside) }
  for (let idx = 0; idx < clipped.length; idx++) {
    const trace = clipped[idx]
    const len = trace.reduce((a, p, i) => i ? a + Math.hypot(p[0] - trace[i - 1][0], p[1] - trace[i - 1][1]) : 0, 0)
    const wet = wetSideOf(trace, inWater, gridM)
    if (!wet.side) { refused.push({ run: idx, lengthM: +len.toFixed(1), kind: wet.kind, why: wet.why }); continue }
    const path = resample(trace, stationM)
    for (const side of wet.side === 'both' ? ['left', 'right'] : [wet.side]) {
      // wetSideOf names RIGHT of the walk as (-tz, tx); the water normal points to the named side.
      const sgn = side === 'right' ? 1 : -1
      const st = []
      for (let i = 0; i < path.length; i++) {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)]
        const tx = b[0] - a[0], tz = b[1] - a[1], m = Math.hypot(tx, tz) || 1
        st.push({ x: path[i][0], z: path[i][1], nx: sgn * -tz / m, nz: sgn * tx / m })
      }
      faces.push({ run: idx, side, lengthM: len, st })
    }
  }

  // ── PASS B: the finest level, read in chunks along each face ────────────────────────────────────────────────────
  let windows = 0
  for (const f of faces) {
    // First, each station's two coarse bounds — waterward to the first wet cell, landward to the first dry one. The
    // coarse grid decides only how far to walk; the finest read decides the state and the crossing.
    for (const s of f.st) {
      const sea = coarseCross(s.x, s.z, s.nx, s.nz, true), land = coarseCross(s.x, s.z, -s.nx, -s.nz, false)
      s.boundSea = (Number.isFinite(sea) ? sea : gridM) + 2 * gridM
      s.boundLand = (Number.isFinite(land) ? land : gridM) + 2 * gridM
      s.bound = Math.max(s.boundSea, s.boundLand)   // the window must hold either walk
    }
    // Chunk the face so each finest window stays under the budget.
    let a = 0
    while (a < f.st.length) {
      let b = a, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
      const grow = (s) => { for (const d of [0, s.bound, -s.bound]) { const x = s.x + s.nx * d, z = s.z + s.nz * d; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } }
      grow(f.st[a])
      while (b + 1 < f.st.length) {
        const save = [x0, x1, z0, z1]
        grow(f.st[b + 1])
        if (((x1 - x0) / stationM + 4) * ((z1 - z0) / stationM + 4) > WINDOW_BUDGET_PX && b > a) { [x0, x1, z0, z1] = save; break }
        b++
      }
      const win = await readWindow(opened, { cornersLL: [toLL(x0, z0), toLL(x1, z0), toLL(x0, z1), toLL(x1, z1)], stepM: null, quiet: true })
      windows++
      if (windows % 25 === 0) console.log(`  … ${windows} finest window(s) read`)
      const at = (x, z) => sampleSources(win, ...toLL(x, z)) - baseElev
      for (let k = a; k <= b; k++) {
        const s = f.st[k]
        const h0 = at(s.x, s.z)
        s.h = h0
        if (!Number.isFinite(h0)) { s.kind = 'no-lidar'; s.w = 0; s.he = NaN; continue }
        const dry = h0 > ABOVE_WATER_M
        // dry: the lidar ground runs into the drawn water — walk waterward until wet. wet: walk landward until dry.
        const dir = dry ? 1 : -1
        let prev = h0, found = false
        const bound = dry ? s.boundSea : s.boundLand
        for (let d = stationM; d <= bound + 1e-9; d += stationM) {
          const v = at(s.x + dir * s.nx * d, s.z + dir * s.nz * d)
          if (!Number.isFinite(v)) { s.kind = 'lidar-ends'; s.w = d - stationM; s.he = prev; found = true; break }
          // ⛔ A waterward walk ends where the DRAWN water ends: past it is drawn land, and the median cannot reach
          // beyond the water it belongs to. The lidar showed no water across this drawn water — say so, by name.
          if (dry && !inWater(s.x + s.nx * d, s.z + s.nz * d)) { s.kind = 'drawn-water-dry'; s.w = d - stationM; s.he = prev; found = true; break }
          if ((v > ABOVE_WATER_M) !== dry) {
            // the crossing of ABOVE_WATER_M between the two samples, linearly — the waterline to a fraction of a pixel
            const t = (prev - ABOVE_WATER_M) / ((prev - v) || 1e-9)
            s.w = d - stationM + Math.max(0, Math.min(1, t)) * stationM
            s.kind = dry ? 'seaward' : 'landward'; s.he = ABOVE_WATER_M; found = true; break
          }
          prev = v
        }
        if (!found) { s.kind = 'no-waterline'; s.w = 0; s.he = NaN }
        s.dir = dir
      }
      win.length = 0
      a = b + 1
    }
  }

  // ── The artifact ────────────────────────────────────────────────────────────────────────────────────────────────
  const r2 = (v) => Math.round(v * 100) / 100
  const byKindM = Object.fromEntries(KINDS.map(k => [k, 0]))
  const widths = []
  let shoreM = 0
  const outFaces = faces.map(f => {
    const n = f.st.length, xs = [], zs = [], ex = [], ez = [], w = [], k = [], h = [], he = []
    for (let i = 0; i < n; i++) {
      const s = f.st[i]
      const own = ((i ? Math.hypot(s.x - f.st[i - 1].x, s.z - f.st[i - 1].z) : 0) + (i < n - 1 ? Math.hypot(f.st[i + 1].x - s.x, f.st[i + 1].z - s.z) : 0)) / 2
      shoreM += own; byKindM[s.kind] += own
      if (s.kind === 'seaward' || s.kind === 'landward') widths.push([s.w, own])
      const dir = s.dir || 1
      xs.push(r2(s.x)); zs.push(r2(s.z)); w.push(r2(s.w)); k.push(KINDS.indexOf(s.kind)); h.push(Number.isFinite(s.h) ? r2(s.h) : null); he.push(Number.isFinite(s.he) ? r2(s.he) : null)
      ex.push(r2(s.x + dir * s.nx * s.w)); ez.push(r2(s.z + dir * s.nz * s.w))
    }
    return { run: f.run, side: f.side, xs, zs, ex, ez, w, k, h, he }
  })
  // Width by metres of drawn shore, at the finest level.
  widths.sort((p, q) => p[0] - q[0])
  const tot = widths.reduce((t, p) => t + p[1], 0)
  const pct = (q) => { let acc = 0; for (const [v, m] of widths) { acc += m; if (acc >= q * tot) return r2(v) } return widths.length ? r2(widths[widths.length - 1][0]) : null }
  const bins = [0, stationM, 2 * gridM, 4 * gridM, 16 * gridM, Infinity]
  const histogram = bins.slice(1).map((hi, i) => ({ fromM: r2(bins[i]), toM: Number.isFinite(hi) ? r2(hi) : null,
    shoreM: r2(widths.filter(([v]) => v >= bins[i] && v < hi).reduce((t, p) => t + p[1], 0)) }))

  const out = {
    version: 1, scene, look: lookId,
    shoreFrom: 'drawn-water (the slab\'s __water__ ink)',
    // ⭐ Which shoreline this median was walked on (shoreRuns.mjs shoreFingerprint of shape.json). bake-ground paints
    // the median's sand only onto the SAME shoreline.
    shoreFingerprint: shoreFingerprint(shape),
    waterlineFrom: `the lidar at y = 0 (the terrain datum, ${tm.datum}; baseElev ${baseElev} m): above = more than ABOVE_WATER_M (${ABOVE_WATER_M} m)`,
    stationM: +stationM.toFixed(3), gridM: +gridM.toFixed(3), aboveWaterM: ABOVE_WATER_M,
    kinds: KINDS,
    totals: { shoreM: r2(shoreM), outsideM: r2(outsideM), byKindM: Object.fromEntries(Object.entries(byKindM).map(([k, v]) => [k, r2(v)])),
              refusedM: r2(refused.reduce((t, r) => t + r.lengthM, 0)), widthP50M: pct(0.5), widthP90M: pct(0.9), widthMaxM: widths.length ? r2(widths[widths.length - 1][0]) : null },
    histogram, refused, faces: outFaces,
  }

  let wrote = false
  if (write) { mkdirSync(outDir, { recursive: true }); wrote = writeIfChanged(outPath, JSON.stringify(out)) }
  const km = (m) => (m / 1000).toFixed(2)
  console.log(`[bake-shore-median] scene=${scene} look=${lookId}: ${outFaces.length} face(s) · stations every ${stationM.toFixed(2)} m (the source's own pixel) · ${windows} finest window(s)`)
  console.log(`  ⭐ MEDIAN: ${km(shoreM)} km of drawn shore · width p50 ${out.totals.widthP50M} m · p90 ${out.totals.widthP90M} m · max ${out.totals.widthMaxM} m`)
  console.log(`    lidar ground runs into the drawn water along ${km(byKindM.seaward)} km · lidar water reaches behind the drawn shore along ${km(byKindM.landward)} km`)
  console.log(`    ${histogram.map(b => `${b.fromM}–${b.toM ?? '∞'} m: ${km(b.shoreM)} km`).join(' · ')}`)
  for (const k of ['no-waterline', 'no-lidar']) if (byKindM[k] > 0) console.warn(`  ⛔ ${km(byKindM[k])} km of drawn shore: ${k} — the median is NOT KNOWN there`)
  if (byKindM['lidar-ends'] > 0) console.warn(`  ⚠️ ${km(byKindM['lidar-ends'])} km of drawn shore: lidar-ends — the median runs only as far as the lidar does`)
  if (byKindM['drawn-water-dry'] > 0) console.warn(`  ⚠️ ${km(byKindM['drawn-water-dry'])} km of drawn shore: drawn-water-dry — the lidar shows ground across the whole drawn water there; the median runs to its far edge`)
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
