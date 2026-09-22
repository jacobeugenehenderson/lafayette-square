/**
 * Cartograph — bake-terrain
 *
 * Reads a per-installation USGS 3DEP GeoTIFF, clips to the scene's boundary
 * stencil, resamples to a uniform 5 m grid, and writes into the installation's
 * own portable folder:
 *
 *   cartograph/data/<scene>/clean/terrain.json — metadata ({width,height,bounds,baseElev})
 *   cartograph/data/<scene>/clean/terrain.bin  — Float32Array(width*height), row-major, raw
 *
 * The `.bin` pattern matches the rest of the kit (ground.bin, buildings.bin).
 * Values are normalized to local-min = 0 so uExag scales pure relief;
 * absolute height is reconstructable from `baseElev` in the metadata.
 *
 * The terrain artifact is the scene's — it travels WITH the installation
 * folder (which may live on another drive), never in a shared/global dir.
 * No installation is privileged: LS bakes through the exact same path as every
 * poured town. The per-Look bake (serve.js) copies clean/terrain.* into the
 * slab (public/baked/<look>/terrain.*); the runtime fetches it by lookId.
 * (feedback_installations_are_independent; multi-instance routing 2026-07-02.)
 *
 * Clipping bbox = axis-aligned bbox of the scene boundary's scaled polygon
 * (fade.outer + 50), rounded outward to whole meters.
 *
 * Per-installation raw input:
 *   cartograph/data/<scene>/raw/elevation.tif
 *
 * ⛔ THE TILE IS PER TOWN AND THIS FILE NO LONGER NAMES ONE. USGS 3DEP 1/3
 * arc-second tiles are 1°×1°, ~10 m source, ~450 MB, .gitignored, and are named
 * for their NORTH-WEST corner — so the tile a scene needs is a function of its
 * own latitude and longitude. Run this script without the .tif and it prints the
 * exact curl for THIS scene.
 * ⚠️ It used to hardcode `n39w091` — Lafayette Square's and HiPointe's tile — in
 * the acquire instruction, so every other town was told, confidently, to download
 * St. Louis's terrain (corrected 2026-09-20, found on Huron, which needs n42w083).
 *
 * Run:  node cartograph/bake-terrain.js --scene=<id>   (or CARTOGRAPH_SCENE=<id>)
 */

import fs from 'fs'
import { join } from 'path'
import { fromFile, fromUrl } from 'geotiff'
import { CARTOGRAPH_DIR, DEFAULT_MAP, requireExplicitMap} from './config.js'
import { writeIfChanged } from './io.js'
import { deriveFade } from './boundaryRecords.mjs'
import { coastRings } from './coastline.mjs'

// ⛔ No silent default on a WRITE path (BRIEF-ls-bleed-excision site 11).
requireExplicitMap('bake-terrain.js (writes terrain into the slab)')

// Scene resolution — the installation whose terrain we bake. Resolve order:
// --scene=<id> flag (how serve.js's bake handler invokes us) > CARTOGRAPH_SCENE
// env (CLI) > the default installation.
const _sceneArg = process.argv.slice(2).map(a => a.match(/^--scene=(.+)$/)).find(Boolean)
const SCENE = _sceneArg?.[1] || process.env.CARTOGRAPH_SCENE || DEFAULT_MAP

const MAP_DIR     = join(CARTOGRAPH_DIR, 'data', SCENE)
const GEO_PATH      = join(MAP_DIR, 'geography.json')
const BOUNDARY_PATH = join(MAP_DIR, 'neighborhood_boundary.json')
const TIF_PATH      = join(MAP_DIR, 'raw', 'elevation.tif')
const OSM_PATH      = join(MAP_DIR, 'raw', 'osm.json')
const CLEAN_DIR     = join(MAP_DIR, 'clean')
const OUT_JSON      = join(CLEAN_DIR, 'terrain.json')
const OUT_BIN       = join(CLEAN_DIR, 'terrain.bin')

// Per-scene projection. bake-terrain maps its local-meter grid back to lon/lat
// to sample the GeoTIFF, so it needs THIS installation's geography — not
// config.js's import-time geography (which resolves from CARTOGRAPH_SCENE only,
// left unset for serve.js's bake children). Read data/<scene>/geography.json
// directly; the formula matches config.localToWgs84 exactly. LS's geography.json
// mirrors instance.js, so LS terrain stays byte-identical to the prior bake.
const _geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'))
function localToWgs84(x, z) {
  return [_geo.lon + x / _geo.lonToMeters, _geo.lat - z / _geo.latToMeters]
}

const STENCIL_BUFFER_M = 50  // kit-shared with LS_STENCIL
const M_PER_SAMPLE     = 5   // see prior commit comment in this file

// USGS 3DEP no-data sentinel. The 1/3 arc-second product uses a large
// negative float; treat anything below -1000 m as missing.
const NODATA_THRESHOLD = -1000

function wgs84ToLocal(lon, lat) {
  return [(lon - _geo.lon) * _geo.lonToMeters, (_geo.lat - lat) * _geo.latToMeters]
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

// ⭐⭐⭐ THE DATUM IS THE WATER, WHEN THERE IS WATER. (2026-09-21)
//
// This file used to normalize to `min(raw)` and `BakedGround.jsx` reasoned that
// "on a lakeshore town the local minimum IS the lake". ⛔ That is an assumption
// about the SOURCE, not a property of it, and huron disproved it: the 10 m 3DEP
// mosaic carries Lake Erie hydro-flattened at more than one elevation, so the
// global minimum landed on a patch over a metre below the real surface and the
// drawn lake sat under its own bed across ~94% of its area. It reads as a bank.
//
// ⛔⛔ WHY THE DATUM AND NOT THE MESH. The exaggeration shader does
// `transformed.y += terrain * uExag` — it pivots about y = 0. The water mesh has
// no patchTerrain, so lifting IT to the lake's height would hold still while the
// terrain scaled away from it at any exag ≠ 1. huron authors exag 1, so that fix
// would have looked perfect here and come apart on the next town: `CLAUDE.md`
// Class D exactly. ⇒ Move the DATUM so water at y ≈ 0 is TRUE, at any exag.
//
// ⭐ A hydro-flattened body is the one thing in a DEM that is genuinely level, so
// its surface is the MODE of the samples beneath it — not the mean (the shore
// drags it) and not the minimum (that is the bug being fixed).
// ⛔ The water polygons come from `coastline.mjs` — the SAME `coastRings` and
// `isWaterFeature` that `derive.js` uses. A second definition of "this is water"
// is how the first vocabulary drifted.
function waterDatum({ raw, width, height, bounds, boundary }) {
  if (!fs.existsSync(OSM_PATH)) {
    console.log('  water datum: no raw/osm.json — cannot ask where the water is')
    return null
  }
  const osm = JSON.parse(fs.readFileSync(OSM_PATH, 'utf8'))
  const ground = osm.ground || {}

  // The coast, closed against the bb, exactly as derive.js closes it.
  const bx = osm.bbox
  const bb = bx ? (() => {
    const a = wgs84ToLocal(bx.minLon, bx.maxLat), b = wgs84ToLocal(bx.maxLon, bx.minLat)
    return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]),
             z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }
  })() : null
  const rings = []
  if (bb) {
    const c = coastRings({ ground, buildings: osm.buildings || [],
                           center: boundary.center, discR: boundary.radius, bb })
    for (const r of (c.rings || [])) rings.push(r)
  }
  // ⛔⛔ ONLY THE COAST, AND A POND MUST NOT BE THE DATUM. Caught 2026-09-21 by
  // running this against Lafayette Square before trusting it on huron.
  // The first version also took every CLOSED water way. LS's park pond is four
  // rings and TWENTY-ONE grid samples, and it sits ~25 m above the valley floor —
  // so it moved the entire town's datum by 25.22 m, for a town that has no
  // `water:*` group in its slab at all. A perched pond is an OBJECT ON the land;
  // a coast is the plane the land sits beside, and only the second can be a datum.
  // ⭐ `coastline.mjs` already draws exactly this distinction and we should use its
  // judgment rather than invent a size threshold: `coastRings` returns rings for a
  // body that CROSSES THE BB, and nothing for an enclosed one. `bake-ground.js`
  // says the same in as many words — coastline "does NOT reach an inland pond".
  // ⚠️ So an inland pond is still drawn at y ≈ 0 and is still wrong for it. That is
  // a REAL and separate defect — every body wants its own mesh Y — and it is not
  // fixed by moving the whole world to meet one pond.
  if (!rings.length) {
    console.log('  water datum: no COAST in this town (an enclosed pond cannot be a datum) — the datum stays the local minimum')
    return null
  }

  // Scanline fill of every ring at once (even-odd), collecting the samples under water.
  const stepX = (bounds.maxX - bounds.minX) / (width - 1)
  const stepZ = (bounds.maxZ - bounds.minZ) / (height - 1)
  const hist = new Map()
  let wet = 0
  for (let j = 0; j < height; j++) {
    const z = bounds.minZ + stepZ * j
    const xs = []
    for (const ring of rings) {
      for (let k = 0, n = ring.length; k < n; k++) {
        const a = ring[k], b = ring[(k + 1) % n]
        if ((a[1] > z) === (b[1] > z)) continue
        xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
      }
    }
    if (xs.length < 2) continue
    xs.sort((m, n) => m - n)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - bounds.minX) / stepX))
      const i1 = Math.min(width - 1, Math.floor((xs[k + 1] - bounds.minX) / stepX))
      for (let i = i0; i <= i1; i++) {
        const v = raw[j * width + i]
        if (!Number.isFinite(v)) continue
        wet++
        const key = Math.round(v * 100)          // 1 cm buckets
        hist.set(key, (hist.get(key) || 0) + 1)
      }
    }
  }
  if (!wet) {
    // ⛔ LOUD. Water rings exist and not one sample fell inside them — the rings
    // and the grid are in different frames, or the stencil excludes the body.
    // Silently keeping the minimum here is the substitution this rewrite exists
    // to end, so refuse instead.
    throw new Error('⛔ water datum: ' + rings.length + ' water ring(s) and ZERO grid samples inside them. ' +
      'The rings and the terrain grid disagree about the frame; a datum derived from nothing would be a plausible-looking lie.')
  }
  let mode = null, best = 0
  for (const [k, c] of hist) if (c > best) { best = c; mode = k }
  const elev = mode / 100
  const share = best / wet
  return { elev, share, wet, rings: rings.length }
}

// ⚠️ A THIRD derivation of the same polygon (sceneStencil.js + CartographApp.jsx
// are the other two). sceneStencil.js's header claimed it was the only bake-side
// one; that was false and is now corrected there. All three apply the same rule via
// `deriveFade`, but they remain three call sites — collapsing them is open work.
function deriveStencilBbox(boundary) {
  const { boundary: poly, center, radius, fadeBand } = boundary
  const fade = Number.isFinite(fadeBand) ? deriveFade(radius, fadeBand) : null
  const targetR = fade ? fade.outer + STENCIL_BUFFER_M : radius
  const scale = targetR / radius
  const [cx, cz] = center
  let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity
  for (const [x, z] of poly) {
    const sx = cx + (x - cx) * scale
    const sz = cz + (z - cz) * scale
    if (sx < mnx) mnx = sx
    if (sx > mxx) mxx = sx
    if (sz < mnz) mnz = sz
    if (sz > mxz) mxz = sz
  }
  return {
    minX: Math.floor(mnx), maxX: Math.ceil(mxx),
    minZ: Math.floor(mnz), maxZ: Math.ceil(mxz),
  }
}

async function main() {
  const boundary = JSON.parse(fs.readFileSync(BOUNDARY_PATH, 'utf8'))
  const bounds = deriveStencilBbox(boundary)
  const spanX = bounds.maxX - bounds.minX
  const spanZ = bounds.maxZ - bounds.minZ
  const width  = Math.ceil(spanX / M_PER_SAMPLE) + 1
  const height = Math.ceil(spanZ / M_PER_SAMPLE) + 1
  const total = width * height

  console.log(`Bake terrain  scene=${SCENE}  bbox=${JSON.stringify(bounds)}  span=${spanX}×${spanZ}m`)
  console.log(`              grid=${width}×${height} = ${total} samples  (~${(spanX/(width-1)).toFixed(2)} m/x, ${(spanZ/(height-1)).toFixed(2)} m/z)`)

  // ── Which 1°×1° USGS tile(s) does THIS scene sit on? ─────────────────────
  // Computed here rather than printed as a constant: the tile is a function of
  // the scene's own coordinates, and a hardcoded one sent every town but two to
  // download St. Louis. A scene near a whole-degree line straddles two or four.
  const _cornersLL = [
    localToWgs84(bounds.minX, bounds.minZ), localToWgs84(bounds.maxX, bounds.minZ),
    localToWgs84(bounds.minX, bounds.maxZ), localToWgs84(bounds.maxX, bounds.maxZ),
  ]
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity
  for (const [lon, lat] of _cornersLL) {
    if (lon < lonMin) lonMin = lon; if (lon > lonMax) lonMax = lon
    if (lat < latMin) latMin = lat; if (lat > latMax) latMax = lat
  }
  // USGS 3DEP names a tile for its NW corner: nDDwDDD.
  const tileName = (lat, lon) =>
    `n${String(Math.ceil(lat)).padStart(2, '0')}w${String(Math.ceil(Math.abs(lon))).padStart(3, '0')}`
  const neededTiles = [...new Set([
    tileName(latMax, lonMin), tileName(latMax, lonMax),
    tileName(latMin, lonMin), tileName(latMin, lonMax),
  ])]

  // ⭐⭐ THE SOURCES. One tile in degrees was the only thing this reader ever
  // accepted; a town can straddle several, and the good data is in metres.
  //   raw/elevation.tif           — a single tile (what every town has today)
  //   raw/elevation/*.tif         — a directory of tiles, mosaicked here
  //   raw/elevation-sources.txt   — one URL per line, read by HTTP RANGE REQUEST
  // ⭐ The third is not a convenience: USGS 1 m covers a town in ~940 MB across
  // four tiles, and geotiff pulls only the window actually needed (~1 s). Making
  // that the acquisition step would put a gigabyte on disk per town for bytes we
  // read once. ⛔ A town with no source at all is told exactly what to fetch.
  const TIF_DIR = join(MAP_DIR, 'raw', 'elevation')
  const URL_LIST = join(MAP_DIR, 'raw', 'elevation-sources.txt')
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

  if (!specs.length) {
    console.error(`Missing elevation input for scene '${SCENE}'. Looked in:`)
    console.error(`  ${TIF_PATH}\n  ${TIF_DIR}/*.tif\n  ${URL_LIST}`)
    console.error(`  scene spans lat ${latMin.toFixed(4)}..${latMax.toFixed(4)}, lon ${lonMin.toFixed(4)}..${lonMax.toFixed(4)}`)
    console.error(`\nAcquire the 1/3 arc-second (~10 m) tile(s) this scene needs:`)
    for (const t of neededTiles) {
      console.error(`  curl -o ${TIF_PATH} https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/${t}/USGS_13_${t}.tif`)
    }
    if (neededTiles.length > 1) console.error(`  ⚠️ ${neededTiles.length} tiles — put them in ${TIF_DIR}/ instead; they are mosaicked here.`)
    console.error(`\n⭐ Or ask for the 1 m lidar, which is ~100× denser and needs no download:`)
    console.error(`  curl "https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=${lonMin.toFixed(5)},${latMin.toFixed(5)},${lonMax.toFixed(5)},${latMax.toFixed(5)}&max=50"`)
    console.error(`  then put each result's downloadURL on its own line in ${URL_LIST}`)
    process.exit(1)
  }

  const t0 = Date.now()
  const PAD = 2
  const sources = []
  for (const spec of specs) {
    const label = spec.ref.split('/').pop()
    const tiff = spec.kind === 'url' ? await fromUrl(spec.ref) : await fromFile(spec.ref)
    const base = await tiff.getImage(0)
    const [bx0, by0] = base.getOrigin()
    const [brx, bry] = base.getResolution()
    const proj = projectorFor(base, label)

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
    const stepM = Math.min(Math.abs((bounds.maxX - bounds.minX) / (width - 1)),
                           Math.abs((bounds.maxZ - bounds.minZ) / (height - 1)))
    const _a = proj.to(...localToWgs84(bounds.minX, bounds.minZ))
    const _b = proj.to(...localToWgs84(bounds.minX + stepM, bounds.minZ))
    const want = Math.hypot(_b[0] - _a[0], _b[1] - _a[1])
    const levels = await tiff.getImageCount()
    let pick = 0, image = base, w = base.getWidth(), h = base.getHeight(), rx = brx, ry = bry
    for (let L = 1; L < levels; L++) {
      const im = await tiff.getImage(L)
      const scale = base.getWidth() / im.getWidth()
      if (Math.abs(brx) * scale > want) break          // this level is coarser than the grid
      pick = L; image = im; w = im.getWidth(); h = im.getHeight()
      rx = brx * scale; ry = bry * scale
    }
    const ox = bx0, oy = by0
    if (pick) console.log(`  ${label}: grid step is ${stepM.toFixed(2)} m = ${want.toExponential(3)} ${proj.unit} — reading overview level ${pick}/${levels - 1} (${Math.abs(rx).toExponential(3)} ${proj.unit}/px) instead of level 0`)

    // The scene's own corners, in THIS tile's coordinates. ⛔ All four, not a
    // bbox of lon/lat: a projected frame is not axis-aligned to a geographic one.
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity
    for (const [lon, lat] of _cornersLL) {
      const [px, py] = proj.to(lon, lat)
      if (px < sx0) sx0 = px; if (px > sx1) sx1 = px
      if (py < sy0) sy0 = py; if (py > sy1) sy1 = py
    }
    const tx0 = ox, tx1 = ox + w * rx
    const ty1 = oy, ty0 = oy + h * ry          // ry < 0 for a north-up image
    const overlaps = sx1 > Math.min(tx0, tx1) && sx0 < Math.max(tx0, tx1)
                  && sy1 > Math.min(ty0, ty1) && sy0 < Math.max(ty0, ty1)
    console.log(`  source ${label}  ${w}×${h}  ${proj.kind} (EPSG:${proj.epsg})  res=(${rx}, ${ry}) ${proj.unit}/px  ${overlaps ? 'overlaps' : '⚠️ NO OVERLAP — skipped'}`)
    if (!overlaps) continue

    const px0 = Math.max(0, Math.floor((sx0 - ox) / rx) - PAD)
    const px1 = Math.min(w, Math.ceil((sx1 - ox) / rx) + PAD)
    const py0 = Math.max(0, Math.floor((sy1 - oy) / ry) - PAD)
    const py1 = Math.min(h, Math.ceil((sy0 - oy) / ry) + PAD)
    if (px1 <= px0 || py1 <= py0) { console.log(`    (empty window — skipped)`); continue }
    const winW = px1 - px0, winH = py1 - py0
    const rasters = await image.readRasters({ window: [px0, py0, px1, py1] })
    const band = Array.isArray(rasters) ? rasters[0] : rasters
    if (band.length !== winW * winH) throw new Error(`${label}: window read ${band.length}, expected ${winW * winH}`)
    console.log(`    window px=[${px0},${px1}) py=[${py0},${py1}) = ${winW}×${winH}`)
    sources.push({ label, band, winW, winH, rx, ry, proj,
                   x0: ox + (px0 + 0.5) * rx, y0: oy + (py0 + 0.5) * ry })
  }

  // ⛔⛔ DOES THE UNION ACTUALLY COVER THE SCENE? REFUSE IF NOT.
  // The window clamps are Math.max(0,…)/Math.min(w,…), so a tile from the wrong
  // region does not error — it clamps to the tile's edge and bakes whatever is
  // there. Terrain, confidently, from the wrong place: CLAUDE.md Layer 0 q2.
  if (!sources.length) {
    console.error(`\n⛔ NONE of the ${specs.length} elevation source(s) overlap scene '${SCENE}'.`)
    console.error(`   scene needs lat ${latMin.toFixed(4)}..${latMax.toFixed(4)} lon ${lonMin.toFixed(4)}..${lonMax.toFixed(4)} — it needs: ${neededTiles.join(', ')}`)
    process.exit(1)
  }

  function sample(lon, lat) {
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
      return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty)
           + v01 * (1 - tx) * ty       + v11 * tx * ty
    }
    return NaN
  }

  const raw = new Float32Array(total)
  let misses = 0
  for (let j = 0; j < height; j++) {
    const z = bounds.minZ + (spanZ * j) / (height - 1)
    for (let i = 0; i < width; i++) {
      const x = bounds.minX + (spanX * i) / (width - 1)
      const [lon, lat] = localToWgs84(x, z)
      const v = sample(lon, lat)
      if (Number.isNaN(v)) { misses++; raw[j * width + i] = NaN }
      else raw[j * width + i] = v
    }
  }

  if (misses) {
    // Nearest grid-neighbor fill (rare; should never happen for LS).
    for (let idx = 0; idx < total; idx++) {
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
      raw[idx] = Number.isFinite(nearest) ? nearest : 0
    }
  }

  let mn = Infinity, mx = -Infinity
  for (const v of raw) { if (v < mn) mn = v; if (v > mx) mx = v }

  // ⭐⭐ THE DATUM. Water when there is water, the local minimum when there is not —
  // and which one was used is PRINTED, because a datum chosen silently is exactly
  // how the previous one survived. ▶ checks/claims-a-level-body-has-one-surface.mjs
  const wd = waterDatum({ raw, width, height, bounds, boundary })
  const baseElev = wd ? wd.elev : mn
  const datumKind = wd ? 'water' : 'local minimum'

  const normalized = new Float32Array(total)
  for (let k = 0; k < total; k++) normalized[k] = raw[k] - baseElev

  const meta = { width, height, bounds, baseElev: Math.round(baseElev * 100) / 100,
                 datum: datumKind, datumShare: wd ? Math.round(wd.share * 1000) / 1000 : null }
  fs.mkdirSync(CLEAN_DIR, { recursive: true })
  writeIfChanged(OUT_JSON, JSON.stringify(meta))
  writeIfChanged(OUT_BIN, Buffer.from(normalized.buffer))

  const jsonKb = (fs.statSync(OUT_JSON).size / 1024).toFixed(1)
  const binKb  = (fs.statSync(OUT_BIN).size  / 1024).toFixed(1)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`Wrote ${OUT_JSON}  (${jsonKb} KB)`)
  console.log(`Wrote ${OUT_BIN}   (${binKb} KB)`)
  console.log(`  elevation range ${mn.toFixed(2)}..${mx.toFixed(2)}m  (normalized to ${(mn-baseElev).toFixed(2)}..${(mx-baseElev).toFixed(2)})`)
  if (wd) {
    console.log(`  DATUM = the water: ${baseElev.toFixed(2)} m, from ${wd.wet.toLocaleString()} samples under ${wd.rings} ring(s)`)
    console.log(`    the datum bucket holds ${(wd.share * 100).toFixed(1)}% of them — a hydro-flattened body should be most of its own area`)
    if (wd.share < 0.5) {
      // ⛔ NOT a fallback and not a silent pass: the datum is still the mode, but
      // the body is NOT one surface and anything seated on it will be wrong
      // somewhere. Name the instrument rather than pick a nicer number.
      console.warn(`    ⚠️ UNDER HALF. This body is not one surface in the source — the mesh will sit on the`)
      console.warn(`       dominant patch and stand off the others. ▶ node checks/claims-a-level-body-has-one-surface.mjs`)
    }
    console.log(`    ⛔ y = 0 is now the WATER, not the lowest ground: ground below it is NEGATIVE, by design.`)
  } else {
    console.log(`  DATUM = the local minimum: ${baseElev.toFixed(2)} m (no coast — see waterDatum for why a pond does not qualify)`)
  }
  const missShare = misses / total
  console.log(`  misses filled: ${misses.toLocaleString()} (${(100 * missShare).toFixed(1)}% of the grid)`)
  if (missShare > 0.05) {
    // ⛔ SAY IT RATHER THAN BURY IT IN A COUNT. Lidar does not return off open
    // water, so a lakeshore town reads a fifth of its grid as nodata and gets it
    // nearest-neighbour filled — which is CORRECT here (the nearest valid value
    // is the flattened water surface, and it is under the water mesh anyway), but
    // the same number on a DRY town would mean the source does not cover it.
    console.log(`    ⚠️ over 5%. On a town with open water this is expected — lidar returns nothing off water,`)
    console.log(`       and the fill takes the nearest valid sample, which there is the water surface itself.`)
    console.log(`       ⛔ On a town WITHOUT water, a share this high means the source does not cover the scene.`)
  }
  console.log(`  done in ${elapsed}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
