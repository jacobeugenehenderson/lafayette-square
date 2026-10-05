/**
 * elevationSources.mjs — ONE READER FOR A TOWN'S ELEVATION RASTERS.
 *
 * Moved out of `bake-terrain.js` (2026-10-04, BRIEF-the-shore-is-closed step 1) so a second bake can read the same
 * lidar the same way: `bake-terrain` reads the whole town once at its grid step, `bake-shore-median` reads many small
 * windows along the shore at the source's FINEST level. One copy of the CRS handling, the overview choice and the
 * no-data rule — a second copy is how two bakes come to disagree about where the ground is.
 *
 * Two halves: `openRasters` reads only the headers (once per bake); `readWindow` reads one window from them.
 * `openSources` is the two together, for a bake that reads one window.
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

/** Open every source's headers (no pixels). @returns [{ label, ref, tiff, base, proj, levels }]
 *  @param cacheMB  a URL source keeps this many MB of fetched blocks, so a bake reading many overlapping windows
 *                  fetches each block once. Transport only — the same bytes either way. Off (0) for one-window reads. */
export async function openRasters(specs, { cacheMB = 0 } = {}) {
  const out = []
  for (const spec of specs) {
    const label = spec.ref.split('/').pop()
    const BLOCK = 65536
    const tiff = spec.kind === 'url'
      ? await fromUrl(spec.ref, cacheMB > 0 ? { blockSize: BLOCK, cacheSize: Math.ceil(cacheMB * 1048576 / BLOCK) } : {})
      : await fromFile(spec.ref)
    // ⭐ And the DECODED tiles: a tile shared by overlapping windows is decompressed once (LZW was 90% of the shore
    // median's time). Per image instance, so it covers level 0 — the one image object kept here as `base`.
    if (cacheMB > 0) tiff.cache = true
    const base = await tiff.getImage(0)
    out.push({ label, ref: spec.ref, tiff, base, proj: projectorFor(base, label), levels: await tiff.getImageCount() })
  }
  return out
}

/**
 * Read one window from each opened raster that overlaps it.
 * @param opened      openRasters' result
 * @param cornersLL   the window's corners as [lon, lat] — ⛔ all four, not a lon/lat bbox: a projected frame is not
 *                    axis-aligned to a geographic one
 * @param stepM       the output step in METRES, measured at `atLL` and `toLL` (two points `stepM` apart) — the finest
 *                    overview still at least that fine is read. `null` reads level 0, the source's finest.
 * @param quiet       true silences the per-source lines (a bake reading hundreds of windows says its totals instead)
 * @returns [{ label, band, winW, winH, rx, ry, proj, geoKeys, ref, x0, y0 }]
 */
export async function readWindow(opened, { cornersLL, stepM = null, atLL = null, toLL = null, elevationBandOnly = false, quiet = false }) {
  const PAD = 2
  const sources = []
  for (const { label, ref, tiff, base, proj, levels } of opened) {
    const [bx0, by0] = base.getOrigin()
    const [brx, bry] = base.getResolution()

    // ⭐⭐ READ THE OVERVIEW THAT MATCHES THE OUTPUT GRID, NOT THE FINEST ONE.
    // A COG carries a pyramid, and USGS 1 m tiles carry six levels. Sampling a
    // 1 m level onto a 5 m grid transfers and decodes 25× the bytes to throw 96%
    // of them away — and over a 7 km town that is the difference between a second
    // and a minute. ⛔ Never COARSER than the output step: that would smear the
    // very edge we went to 1 m for. ⇒ the finest level whose pixel is still at
    // least as fine as the grid, which for a 5 m grid off a 1 m tile is the 4 m
    // level. ⚠️ Only level 0 carries a geotransform, so a level's scale is its
    // size ratio to level 0 — geotiff throws on getResolution() for the rest.
    // ⛔ THE GRID STEP IS IN METRES AND A PIXEL MAY BE IN DEGREES. The first cut of
    // this compared the two directly and silently chose the coarsest overview for
    // every geographic tile — LS lost 2.9 m of relief and nothing errored. That is
    // CLAUDE.md's Class D tell exactly: a comparison whose unit is only stable
    // because something else happens to be fixed. ⇒ Measure the grid step IN THE
    // SOURCE'S OWN UNITS by projecting two points one step apart.
    let pick = 0, image = base, w = base.getWidth(), h = base.getHeight(), rx = brx, ry = bry
    if (stepM != null) {
      const _a = proj.to(...atLL), _b = proj.to(...toLL)
      const want = Math.hypot(_b[0] - _a[0], _b[1] - _a[1])
      for (let L = 1; L < levels; L++) {
        const im = await tiff.getImage(L)
        const scale = base.getWidth() / im.getWidth()
        if (Math.abs(brx) * scale > want) break          // this level is coarser than the grid
        pick = L; image = im; w = im.getWidth(); h = im.getHeight()
        rx = brx * scale; ry = bry * scale
      }
      if (pick && !quiet) console.log(`  ${label}: grid step is ${stepM.toFixed(2)} m = ${want.toExponential(3)} ${proj.unit} — reading overview level ${pick}/${levels - 1} (${Math.abs(rx).toExponential(3)} ${proj.unit}/px) instead of level 0`)
    }
    const ox = bx0, oy = by0

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

/** Open and read one window — what a bake reading a single window wants. Same options as `readWindow`. */
export async function openSources(specs, opts) {
  return readWindow(await openRasters(specs), opts)
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
