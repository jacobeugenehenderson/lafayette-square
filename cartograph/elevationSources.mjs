/**
 * elevationSources.mjs — ONE READER FOR A TOWN'S ELEVATION RASTERS.
 *
 * Moved out of `bake-terrain.js` (2026-10-04, BRIEF-the-shore-is-closed step 1) so a second bake can read the same
 * lidar the same way. One copy of the CRS handling, the no-data rule and the way a raster becomes a grid
 * (`rasterToGrid`) — a second copy is how two bakes come to disagree about where the ground is.
 *
 * `openRasters` reads only the headers (once per bake); `readWindow` reads one window from them, always at level 0;
 * `rasterToGrid` puts a town's rasters onto its terrain grid.
 */
import fs from 'fs'
import { join } from 'path'
import { fromFile, fromUrl } from 'geotiff'

// USGS 3DEP no-data sentinel. The 1/3 arc-second product uses a large
// negative float; treat anything below -1000 m as missing.
export const NODATA_THRESHOLD = -1000

/** Above the water = above the water datum's own 1 cm bucket (`bake-terrain` waterDatum): a hydro-flattened
 *  sample reads ±0.005 m. Metres. ⭐ Not a tolerance chosen here — half the bucket the datum was found in. */
export const ABOVE_WATER_M = 0.005

/**
 * Where a town's elevation lives — the three forms `bake-terrain` accepts, in this order:
 *   raw/elevation-sources.txt — one URL per line, read by HTTP RANGE REQUEST
 *   raw/elevation/*.tif       — a directory of tiles, mosaicked
 *   raw/elevation.tif         — a single tile
 * @returns [{ kind: 'url'|'file', ref }] — empty when the town has none (the caller says so, loudly).
 */
export function elevationSpecs(mapDir) {
  const TIF_DIR = join(mapDir, 'raw', 'elevation')
  const URL_LIST = join(mapDir, 'raw', 'elevation-sources.txt')
  const TIF_PATH = join(mapDir, 'raw', 'elevation.tif')
  const specs = []
  if (fs.existsSync(URL_LIST)) {
    for (const line of fs.readFileSync(URL_LIST, 'utf8').split('\n')) {
      const u = line.trim()
      if (u && !u.startsWith('#')) specs.push({ kind: 'url', ref: u })
    }
  }
  if (fs.existsSync(TIF_DIR) && fs.statSync(TIF_DIR).isDirectory()) {
    for (const f of fs.readdirSync(TIF_DIR).sort()) {
      if (/\.tiff?$/i.test(f)) specs.push({ kind: 'file', ref: join(TIF_DIR, f) })
    }
  }
  if (!specs.length && fs.existsSync(TIF_PATH)) specs.push({ kind: 'file', ref: TIF_PATH })
  return specs
}

// ⭐⭐ A DEM IS NOT NECESSARILY IN DEGREES, AND THE FILE KNOWS WHICH. (2026-09-21)
//
// `intake-rows.mjs` claimed for two months that this reader was "source-agnostic —
// any GeoTIFF". It was not: it read `getOrigin()`/`getResolution()` as lon/lat and
// so accepted exactly one product, USGS 3DEP 1/3 arc-second. ⛔ Every USGS **1 m**
// lidar tile is UTM — metres — so the better data was unreadable by construction.
//
// ⭐ THE CRS IS READ OFF THE TILE, never assumed and never configured: GeoTIFF
// carries `ProjectedCSTypeGeoKey`, and an EPSG code names the zone. Anything we
// cannot name is REFUSED BY CODE rather than guessed at — a DEM silently treated
// as the wrong CRS bakes terrain from the wrong place, confidently.
const WGS84_A = 6378137.0, WGS84_F = 1 / 298.257223563
const UTM_K0 = 0.9996, UTM_FE = 500000

/** Forward transverse Mercator for a UTM zone. Lon/lat in degrees → [easting, northing]. */
function utmForward(lon, lat, zone) {
  const e2 = WGS84_F * (2 - WGS84_F), ep2 = e2 / (1 - e2)
  const lon0 = (6 * zone - 183) * Math.PI / 180
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180
  const N = WGS84_A / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
  const T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2
  const A = (l - lon0) * Math.cos(p)
  const M = WGS84_A * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * p))
  return [
    UTM_FE + UTM_K0 * N * (A + (1 - T + C) * A ** 3 / 6
      + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120),
    UTM_K0 * (M + N * Math.tan(p) * (A ** 2 / 2
      + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
      + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720)),
  ]
}

/** How this image's own GeoKeys say to turn lon/lat into its pixel space. */
function projectorFor(image, label) {
  const keys = (typeof image.getGeoKeys === 'function' ? image.getGeoKeys() : image.geoKeys) || {}
  const epsg = keys.ProjectedCSTypeGeoKey
  if (!epsg || keys.GTModelTypeGeoKey === 2) {
    return { kind: 'geographic', epsg: keys.GeographicTypeGeoKey || 4326, to: (lon, lat) => [lon, lat], unit: '°' }
  }
  // NAD83 / UTM north = 269xx · WGS84 / UTM north = 326xx. Both are metres.
  const zone = (epsg >= 26903 && epsg <= 26923) ? epsg - 26900
             : (epsg >= 32601 && epsg <= 32660) ? epsg - 32600
             : null
  if (zone == null) {
    throw new Error(`⛔ ${label}: EPSG:${epsg} is a projected CRS this reader cannot name, so it cannot `
      + `place a sample. Refusing rather than treating its coordinates as degrees — that bakes terrain `
      + `from the wrong place and nothing downstream can tell. Supported: UTM north (EPSG 269xx/326xx) and geographic.`)
  }
  return { kind: `UTM ${zone}N`, epsg, to: (lon, lat) => utmForward(lon, lat, zone), unit: 'm' }
}

/** A range request that the host drops mid-read (S3 answers "other side closed" now and then) is asked AGAIN — the
 *  same window, never a substitute. Only network errors retry; anything else throws at once, and the last network
 *  error throws after the final attempt. ⛔ The attempt count is an operational limit, not a geometric value. */
const NET_ATTEMPTS = 4
const NET_CODES = new Set(['UND_ERR_SOCKET', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT'])
async function withNetRetry(label, read) {
  for (let n = 1; ; n++) {
    try { return await read() } catch (e) {
      const code = e?.cause?.code || e?.code
      if (!(NET_CODES.has(code) || /fetch failed/i.test(e?.message || '')) || n >= NET_ATTEMPTS) throw e
      console.warn(`  ⚠️ ${label}: ${code || e.message} — reading the same window again (attempt ${n + 1} of ${NET_ATTEMPTS})`)
      await new Promise(r => setTimeout(r, 500 * n))
    }
  }
}

/**
 * ⛔ A TILE THE TOWN'S LIST NAMES THAT CANNOT BE OPENED REFUSES BY NAME (2026-10-10). NOAA and USGS re-version their
 * tiles, so a list goes stale: Provincetown's bake stopped on BlueTopo_BF2JL2MC_20260709.tiff (HTTP 404, replaced by
 * _20260930) with geotiff's bare "Error fetching data", naming neither the tile nor the fix.
 * Asks the server for the tile's status (one-byte range request) and throws with the tile, its URL, that status and
 * the command that re-derives the list. ▶ node checks/claims-a-dead-tile-is-named.mjs
 */
export async function deadTile(url, label, cause, refetch) {
  let status = 'no answer'
  try { const r = await fetch(url, { headers: { Range: 'bytes=0-0' } }); status = `HTTP ${r.status}` } catch (e) { status = `unreachable (${e?.cause?.code || e.message})` }
  throw new Error(`⛔ ${label} could not be opened (${status}): ${url}\n   The town's list names a tile that is gone or has moved (sources re-version their tiles). Re-derive the list${refetch ? `: ▶ ${refetch}` : ' with the acquirer that wrote it'}.\n   (underlying: ${cause?.message || cause})`)
}

/** Open every source's headers (no pixels). @returns [{ label, ref, tiff, base, proj, geoKeys }]
 *  @param cacheMB  a URL source keeps this many MB of fetched blocks, so a bake reading many overlapping windows
 *                  fetches each block once. Transport only — the same bytes either way. Off (0) for one-window reads. */
export async function openRasters(specs, { cacheMB = 0, refetch = null } = {}) {
  const out = []
  for (const spec of specs) {
    const label = spec.ref.split('/').pop()
    const BLOCK = 65536
    const tiff = spec.kind === 'url'
      ? await fromUrl(spec.ref, cacheMB > 0 ? { blockSize: BLOCK, cacheSize: Math.ceil(cacheMB * 1048576 / BLOCK) } : {}).catch(e => deadTile(spec.ref, label, e, refetch))
      : await fromFile(spec.ref)
    // ⭐ And the DECODED tiles: a tile shared by overlapping windows is decompressed once (LZW was 90% of the shore
    // median's time). Per image instance, so it covers level 0 — the one image object kept here as `base`.
    if (cacheMB > 0) tiff.cache = true
    const base = await tiff.getImage(0)
    out.push({ label, ref: spec.ref, tiff, base, proj: projectorFor(base, label), geoKeys: base.getGeoKeys?.() || {} })
  }
  return out
}

/**
 * Read one window from each opened raster that overlaps it, at LEVEL 0 — the source's finest. ⛔ There is no overview
 * read: a grid that wants a coarser value takes the MEAN of these pixels (`rasterToGrid`), never a coarser copy.
 * @param opened      openRasters' result
 * @param cornersLL   the window's corners as [lon, lat] — ⛔ all four, not a lon/lat bbox: a projected frame is not
 *                    axis-aligned to a geographic one
 * @param quiet       true silences the per-source lines (a bake reading hundreds of windows says its totals instead)
 * @returns [{ label, band, winW, winH, rx, ry, proj, geoKeys, ref, x0, y0 }]
 */
export async function readWindow(opened, { cornersLL, elevationBandOnly = false, quiet = false }) {
  const PAD = 2
  const sources = []
  for (const { label, ref, base, proj } of opened) {
    const [ox, oy] = base.getOrigin()
    const [rx, ry] = base.getResolution()
    const image = base, w = base.getWidth(), h = base.getHeight()

    // The window's own corners, in THIS tile's coordinates.
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity
    for (const [lon, lat] of cornersLL) {
      const [px, py] = proj.to(lon, lat)
      if (px < sx0) sx0 = px; if (px > sx1) sx1 = px
      if (py < sy0) sy0 = py; if (py > sy1) sy1 = py
    }
    const tx0 = ox, tx1 = ox + w * rx
    const ty1 = oy, ty0 = oy + h * ry          // ry < 0 for a north-up image
    const overlaps = sx1 > Math.min(tx0, tx1) && sx0 < Math.max(tx0, tx1)
                  && sy1 > Math.min(ty0, ty1) && sy0 < Math.max(ty0, ty1)
    if (!quiet) console.log(`  source ${label}  ${w}×${h}  ${proj.kind} (EPSG:${proj.epsg})  res=(${rx}, ${ry}) ${proj.unit}/px  ${overlaps ? 'overlaps' : '⚠️ NO OVERLAP — skipped'}`)
    if (!overlaps) continue

    const px0 = Math.max(0, Math.floor((sx0 - ox) / rx) - PAD)
    const px1 = Math.min(w, Math.ceil((sx1 - ox) / rx) + PAD)
    const py0 = Math.max(0, Math.floor((sy1 - oy) / ry) - PAD)
    const py1 = Math.min(h, Math.ceil((sy0 - oy) / ry) + PAD)
    if (px1 <= px0 || py1 <= py0) { if (!quiet) console.log(`    (empty window — skipped)`); continue }
    const winW = px1 - px0, winH = py1 - py0
    const rasters = await withNetRetry(label, () => image.readRasters(elevationBandOnly ? { window: [px0, py0, px1, py1], samples: [0] } : { window: [px0, py0, px1, py1] }))
    const band = Array.isArray(rasters) ? rasters[0] : rasters
    if (band.length !== winW * winH) throw new Error(`${label}: window read ${band.length}, expected ${winW * winH}`)
    if (!quiet) console.log(`    window px=[${px0},${px1}) py=[${py0},${py1}) = ${winW}×${winH}`)
    sources.push({ label, band, winW, winH, rx, ry, proj, geoKeys: base.getGeoKeys?.() || {}, ref,
                   x0: ox + (px0 + 0.5) * rx, y0: oy + (py0 + 0.5) * ry })
  }
  return sources
}

/** A source's level-0 pixel in METRES, measured at local (x, z) by projecting two points 1 m apart — a pixel may be in
 *  degrees, and comparing it to a grid step in metres directly is the Class D tell (a unit only stable because something
 *  else is fixed: LS once lost 2.9 m of relief to it). */
export function pixelMetres(o, toLL, x, z) {
  const a = o.proj.to(...toLL(x, z)), b = o.proj.to(...toLL(x + 1, z))
  return Math.abs(o.base.getResolution()[0]) / Math.hypot(b[0] - a[0], b[1] - a[1])
}

/**
 * ⭐⭐ THE ONE WAY A RASTER IS PUT ONTO A TERRAIN GRID (2026-10-15). A grid node stands for its own box — one grid step
 * square, centred on it — so its value is the MEAN of the source pixels whose centres fall in that box. It was a bilinear
 * read of the overview nearest the grid step (the 4 m level of a 1 m tile): measured against the true mean, p90 1.00 m
 * off on Provincetown's coast and tens of mm across the land of every town (▶ node
 * checks/claims-the-terrain-is-the-mean-of-its-lidar.mjs). Two regimes, chosen by the SOURCE'S OWN PIXEL, one function:
 *   pixel finer than the grid step → the box mean of level 0
 *   pixel not finer (a coarse bathymetry tile) → bilinear at the node, as before — a box holding one pixel or none has
 *                                                no mean to take
 * PRIORITY ACROSS SOURCES is the list order (the caller sorts it): a pixel counts only where no earlier fine source holds a
 * valid pixel at its centre, so overlapping tiles are never counted twice and a box across a seam is the mean of both. A
 * node with no fine pixel takes the first coarse source holding all four neighbours. A node with neither is NaN — the
 * caller's miss, never filled here.
 * @param opened   openRasters' result, in priority order
 * @param toLL     the town's local (x, z) → [lon, lat]
 * @returns { grid: Float32Array (NaN = no data), sources: [{ label, pixelM, regime, overlapped }], counts }
 */
export async function rasterToGrid(opened, { width, height, bounds, toLL, elevationBandOnly = false, block = 128, quiet = false }) {
  const sx = (bounds.maxX - bounds.minX) / (width - 1), sz = (bounds.maxZ - bounds.minZ) / (height - 1)
  const step = Math.min(sx, sz)
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2
  const info = opened.map(o => { const pixelM = pixelMetres(o, toLL, cx, cz); return { label: o.label, pixelM, regime: pixelM < step ? 'mean' : 'bilinear', overlapped: false } })
  const fineOf = new Map(opened.map((o, s) => [o.ref, info[s].regime === 'mean']))
  const infoOf = new Map(opened.map((o, s) => [o.ref, info[s]]))
  if (!quiet) for (const I of info) console.log(`  source ${I.label}: ${I.pixelM.toFixed(2)} m pixel vs ${step.toFixed(3)} m grid — ${I.regime === 'mean' ? 'the box mean of level 0' : 'bilinear (not finer than the grid)'}`)
  const grid = new Float32Array(width * height).fill(NaN)
  const counts = { whole: 0, partial: 0, joined: 0, bilinear: 0, none: 0 }
  const ok = (v) => Number.isFinite(v) && v >= NODATA_THRESHOLD
  for (let j0 = 0; j0 < height; j0 += block) for (let i0 = 0; i0 < width; i0 += block) {
    const ni = Math.min(block, width - i0), nj = Math.min(block, height - j0)
    const X = (i) => bounds.minX + i * sx, Z = (j) => bounds.minZ + j * sz
    // one step of margin each side: the boxes reach half a step out, a bilinear read one pixel past the node
    const win = await readWindow(opened, { cornersLL: [toLL(X(i0 - 1), Z(j0 - 1)), toLL(X(i0 + ni), Z(j0 - 1)), toLL(X(i0 + ni), Z(j0 + nj)), toLL(X(i0 - 1), Z(j0 + nj))], elevationBandOnly, quiet: true })
    for (const S of win) infoOf.get(S.ref).overlapped = true
    const fine = win.filter(S => fineOf.get(S.ref)), coarse = win.filter(S => !fineOf.get(S.ref))
    // the box corners of this block, in each fine source's PIXEL INDEX space (pixel (a, b)'s centre is (a, b))
    const CW = ni + 1, CH = nj + 1
    const corner = fine.map(S => { const A = new Float64Array(CW * CH), Bq = new Float64Array(CW * CH)
      for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CW; ci++) {
        const [px, py] = S.proj.to(...toLL(X(i0 + ci) - sx / 2, Z(j0 + cj) - sz / 2))
        A[cj * CW + ci] = (px - S.x0) / S.rx; Bq[cj * CW + ci] = (py - S.y0) / S.ry }
      return { A, B: Bq } })
    for (let dj = 0; dj < nj; dj++) for (let di = 0; di < ni; di++) {
      const c00 = dj * CW + di, c10 = c00 + 1, c01 = c00 + CW, c11 = c01 + 1
      let sum = 0, cnt = 0, from = 0, holes = 0
      for (let s = 0; s < fine.length; s++) {
        const S = fine[s], { A, B: Bq } = corner[s]
        // the box as an affine image of the unit square (a 5 m box: the projection's curvature is far below a pixel)
        const qa = A[c00], qb = Bq[c00], e1a = A[c10] - qa, e1b = Bq[c10] - qb, e2a = A[c01] - qa, e2b = Bq[c01] - qb
        const det = e1a * e2b - e1b * e2a
        const a0 = Math.ceil(Math.min(qa, A[c10], A[c01], A[c11])), a1 = Math.floor(Math.max(qa, A[c10], A[c01], A[c11]))
        const b0 = Math.ceil(Math.min(qb, Bq[c10], Bq[c01], Bq[c11])), b1 = Math.floor(Math.max(qb, Bq[c10], Bq[c01], Bq[c11]))
        let got = 0
        for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
          const u = ((a - qa) * e2b - (b - qb) * e2a) / det, v = (e1a * (b - qb) - e1b * (a - qa)) / det
          if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) continue
          let held = false                                 // does an earlier fine source hold a valid pixel here?
          for (let t = 0; t < s && !held; t++) { const T = corner[t], U = fine[t]
            const ta = Math.round(T.A[c00] + u * (T.A[c10] - T.A[c00]) + v * (T.A[c01] - T.A[c00]))
            const tb = Math.round(T.B[c00] + u * (T.B[c10] - T.B[c00]) + v * (T.B[c01] - T.B[c00]))
            held = ta >= 0 && tb >= 0 && ta < U.winW && tb < U.winH && ok(U.band[tb * U.winW + ta]) }
          if (held) continue
          const v0 = (a >= 0 && b >= 0 && a < S.winW && b < S.winH) ? S.band[b * S.winW + a] : NaN
          if (ok(v0)) { sum += v0; cnt++; got++ } else if (s === fine.length - 1) holes++
        }
        if (got) from++
      }
      const k = (j0 + dj) * width + (i0 + di)
      if (cnt) { grid[k] = sum / cnt; from > 1 ? counts.joined++ : holes ? counts.partial++ : counts.whole++; continue }
      const v = coarse.length ? sampleSources(coarse, ...toLL(X(i0 + di), Z(j0 + dj)), { nanIsNodata: true }) : NaN
      if (Number.isFinite(v)) { grid[k] = v; counts.bilinear++ } else counts.none++
    }
  }
  return { grid, sources: info, counts }
}

/** A grid's misses (NaN), each set to its nearest valid node by Chebyshev ring, in place. Returns the count filled.
 *  ⛔ A grid with no valid node REFUSES: the ring search reaches every node, so a miss with no neighbour means there is
 *  nothing anywhere. It used to take 0 m (a flat town at the datum). ▶ node checks/claims-a-missing-height-fails-loudly.mjs */
export function fillMisses(raw, width, height) {
  let filled = 0
  if (!raw.some(v => !Number.isNaN(v))) throw new Error(`⛔ fillMisses: all ${raw.length.toLocaleString()} nodes of the ${width} × ${height} grid are misses — nothing to fill from`)
  for (let idx = 0; idx < raw.length; idx++) {
    if (!Number.isNaN(raw[idx])) continue
    let nearest = NaN
    const j0 = Math.floor(idx / width), i0 = idx % width
    for (let r = 1; r < Math.max(width, height) && !Number.isFinite(nearest); r++) {
      for (let dj = -r; dj <= r && !Number.isFinite(nearest); dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
          const ii = i0 + di, jj = j0 + dj
          if (ii < 0 || ii >= width || jj < 0 || jj >= height) continue
          const v = raw[jj * width + ii]
          if (!Number.isNaN(v)) { nearest = v; break }
        }
      }
    }
    raw[idx] = nearest
    filled++
  }
  return filled
}

/** Bilinear sample of the first source that holds all four neighbours of (lon, lat); NaN if none does. */
export function sampleSources(sources, lon, lat, { nanIsNodata = false } = {}) {
  for (const S of sources) {
    const [px, py] = S.proj.to(lon, lat)
    const fx = (px - S.x0) / S.rx, fy = (py - S.y0) / S.ry
    const ix = Math.floor(fx), iy = Math.floor(fy)
    if (ix < 0 || iy < 0 || ix + 1 >= S.winW || iy + 1 >= S.winH) continue
    const tx = fx - ix, ty = fy - iy
    const v00 = S.band[iy * S.winW + ix],         v10 = S.band[iy * S.winW + ix + 1]
    const v01 = S.band[(iy + 1) * S.winW + ix],   v11 = S.band[(iy + 1) * S.winW + ix + 1]
    if (v00 < NODATA_THRESHOLD || v10 < NODATA_THRESHOLD ||
        v01 < NODATA_THRESHOLD || v11 < NODATA_THRESHOLD) continue
    // BlueTopo marks no-data as NaN, which no threshold catches: the next (coarser) source is asked instead.
    if (nanIsNodata && !(Number.isFinite(v00) && Number.isFinite(v10) && Number.isFinite(v01) && Number.isFinite(v11))) continue
    return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty)
         + v01 * (1 - tx) * ty       + v11 * tx * ty
  }
  return NaN
}
