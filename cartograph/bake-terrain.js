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
import { terrainValueReads, TERRAIN_WATER_KEYS, TERRAIN_WATER_NAMES } from './terrainReads.mjs'
import { stoneStructures } from './structures.mjs'
import { waterLevels as levelsOf } from './waterLevel.mjs'
import clipperLib from 'clipper-lib'

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
// --out-dir=<dir>: write the heightfield there instead of the scene's clean/ (a scratch A/B, not the live terrain).
const _outArg = process.argv.slice(2).map(a => a.match(/^--out-dir=(.+)$/)).find(Boolean)?.[1]
const OUT_JSON      = join(_outArg || CLEAN_DIR, 'terrain.json')
const OUT_BIN       = join(_outArg || CLEAN_DIR, 'terrain.bin')

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
  const mask = new Uint8Array(width * height)   // the cells under the mapped water — the bed is written into these
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
        mask[j * width + i] = 1
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
  return { elev, share, wet, rings: rings.length, mask }
}

// ⭐⭐ THE BED — the ground under the water, written INTO the heightfield (Jacob, 2026-09-26/27: "water is
// always flat, and the edge of water is always where the flat plane meets any other plane" · "where we don't
// have [depth data], we gently slope it" · "it takes 8' of water to make the bottom invisible").
// Every cell under the mapped water takes the equilibrium beach profile h = A·y^(2/3) (references
// f-cem-equilibrium-profile) at its distance y from the nearest dry cell, stopping at the depth the bottom
// stops being visible — past that, depth does not show. A is READ from Table III-3-3 at the town's sand size
// (f-cem-dean-a-table); the size is the town's authored `water.sandD50Mm`, else f-cem-nj-beach-d50. Visibility
// is the town's authored `water.secchiM` (its own published clarity), else r-bottom-visibility-default, SAID.
// Everything else drapes over the terrain as before, so the waterline is where the level meets the ground,
// by construction. ⛔ Runs only when waterDatum found a coast: every other town comes out byte-identical.
// The values read — sand size and clarity per look, the three findings — come from terrainReads.mjs, the same call
// serve.js declares as this step's value input.
const READS = terrainValueReads(SCENE)
const finding = (id) => READS.findings[id]
// The town's authored water values. ⛔ Two looks on one scene disagreeing is refused — the terrain is one per scene.
function waterAuthoring() {
  const out = {}
  for (const key of TERRAIN_WATER_KEYS) {
    const set = READS.water.filter(([, w]) => w[key] != null)
    if (new Set(set.map(([, w]) => w[key])).size > 1)
      throw new Error(`⛔ looks on scene '${SCENE}' author different water.${key}: ${set.map(([id, w]) => `${id}=${w[key]}`).join(', ')} — the terrain is one per scene`)
    if (set.length) out[key] = { value: TERRAIN_WATER_NAMES.includes(key) ? String(set[0][1][key]) : +set[0][1][key],
                                 from: `authored (design.json water.${key}, ${set.map(([id]) => id).join(', ')})` }
  }
  return out
}
function deanA(d50) {
  const table = finding('f-cem-dean-a-table').value.A_m13_by_D_mm
  const pts = Object.entries(table).map(([d, a]) => [+d, a]).sort((p, q) => p[0] - q[0])
  if (d50 < pts[0][0] || d50 > pts[pts.length - 1][0])
    throw new Error(`⛔ sand size ${d50} mm is outside Table III-3-3 as recorded (${pts[0][0]}–${pts[pts.length - 1][0]} mm)`)
  for (let i = 1; i < pts.length; i++) if (d50 <= pts[i][0]) {
    const [d0, a0] = pts[i - 1], [d1, a1] = pts[i]
    return a0 + (a1 - a0) * (d50 - d0) / (d1 - d0)
  }
}
// Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher), 1-D pass.
function edt1d(f, n) {
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s
    while ((s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= z[k]) k--
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]] }
  return d
}
// Metres from every wet cell to the shore — half a cell short of the nearest dry cell's centre.
function shoreDistance(mask, width, height, stepX, stepZ) {
  const INF = 1e20, g = new Float64Array(width * height)
  for (let j = 0; j < height; j++) {
    const f = new Float64Array(width)
    for (let i = 0; i < width; i++) f[i] = mask[j * width + i] ? INF : 0
    const d = edt1d(f, width)
    for (let i = 0; i < width; i++) g[j * width + i] = d[i] * stepX * stepX
  }
  const out = new Float32Array(width * height)
  for (let i = 0; i < width; i++) {
    const f = new Float64Array(height)
    for (let j = 0; j < height; j++) f[j] = g[j * width + i] / (stepZ * stepZ)
    const d = edt1d(f, height)
    for (let j = 0; j < height; j++) out[j * width + i] = Math.max(0, Math.sqrt(d[j] * stepZ * stepZ) - Math.min(stepX, stepZ) / 2)
  }
  return out
}
// ⭐ THE ROCK STAYS. A mapped breakwater or groyne is another surface the level meets (Jacob, 2026-09-26: "the edge
// of water is always where the flat plane meets any other plane"), and the lidar SEES its rock. So under its
// footprint — a closed outline's cells, or the cells within half a cell of a mapped line — the bed does not
// overwrite a cell where the lidar stands above the water. The revetment takes the crest from here; the ground
// drapes over the rock. Measured before this: the West End Breakwater read −2.44 m (the bed's floor), not its rock.
function rockCells(normalized, mask, width, height, bounds) {
  const stepX = (bounds.maxX - bounds.minX) / (width - 1), stepZ = (bounds.maxZ - bounds.minZ) / (height - 1)
  const { areas, lines } = stoneStructures(JSON.parse(fs.readFileSync(OSM_PATH, 'utf8')).ground)
  const keep = new Set(), cand = new Set()
  for (const a of areas) {
    const zs = a.ring.map(p => p[1])
    for (let j = Math.max(0, Math.ceil((Math.min(...zs) - bounds.minZ) / stepZ)); j <= Math.min(height - 1, Math.floor((Math.max(...zs) - bounds.minZ) / stepZ)); j++) {
      const z = bounds.minZ + stepZ * j, xs = []
      for (let k = 0, n = a.ring.length; k < n; k++) { const p = a.ring[k], q = a.ring[(k + 1) % n]
        if ((p[1] > z) !== (q[1] > z)) xs.push(p[0] + (z - p[1]) * (q[0] - p[0]) / (q[1] - p[1])) }
      xs.sort((m, n) => m - n)
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let i = Math.max(0, Math.ceil((xs[k] - bounds.minX) / stepX)); i <= Math.min(width - 1, Math.floor((xs[k + 1] - bounds.minX) / stepX)); i++) cand.add(j * width + i)
    }
  }
  const half = Math.min(stepX, stepZ) / 2
  for (const l of lines) for (let s = 1; s < l.line.length; s++) {
    const [ax, az] = l.line[s - 1], [bx, bz] = l.line[s], L = Math.hypot(bx - ax, bz - az)
    for (let u = 0; u <= L; u += half) { const x = ax + (bx - ax) * u / Math.max(L, 1e-9), z = az + (bz - az) * u / Math.max(L, 1e-9)
      const i = Math.round((x - bounds.minX) / stepX), j = Math.round((z - bounds.minZ) / stepZ)
      if (i >= 0 && j >= 0 && i < width && j < height) cand.add(j * width + i) }
  }
  // Above the water = above the datum's own 1 cm bucket (waterDatum): a flattened-water sample reads ±0.005 m.
  for (const k of cand) if (mask[k] && normalized[k] > 0.005) keep.add(k)
  if (areas.length + lines.length) console.log(`  ROCK: ${areas.length + lines.length} mapped breakwater/groyne(s) — ${keep.size.toLocaleString()} cells under the water keep the lidar's rock (of ${[...cand].filter(k => mask[k]).length.toLocaleString()} in their footprints)`)
  return keep
}
// ⭐⭐ WHERE THE WATER STANDS (BRIEF-bathymetry, "The water's LEVEL is a tide"; Jacob, 2026-09-27). y = 0 stays the
// lidar's water — the tide on the day the survey flew, which no one chose — and the floor stays as baked. What this
// adds is the town's NAMED levels, as heights above y = 0: a LOW and a HIGH tide (MLLW and MHW by default, a town may
// name others it has), or a lake's one level. They come from raw/water-datums.json (fetch-water-datums.mjs; the bake
// calls no service). A tidal town's datums vary across it, so they are a GRID, row-major by z then x, rows north →
// south; a point the datum service does not cover (land) takes its nearest covered neighbour, COUNTED.
// ⭐ A level is a value read at a place and a time (the runtime's levelAt): the clock that moves between low and high
// is next, and this record is what it reads. ⛔ A coastal town with no datums, or a lake with no ruled level, REFUSES.
const DATUMS_PATH = join(MAP_DIR, 'raw', 'water-datums.json')
function waterLevels(baseElev, auth) {
  if (!fs.existsSync(DATUMS_PATH))
    throw new Error(`⛔ the water level: '${SCENE}' has a coast and no raw/water-datums.json — its water would stand at the tide the lidar flew at, which no one chose. ▶ node cartograph/fetch-water-datums.mjs --scene=${SCENE}`)
  const D = JSON.parse(fs.readFileSync(DATUMS_PATH, 'utf8'))
  const up = navd => +(navd - baseElev).toFixed(3)         // NAVD88 → metres above y = 0 (baseElev is the lidar's NAVD88 water)
  if (D.kind === 'tidal') {
    const { lons, lats } = D.grid, w = lons.length, h = lats.length
    const [x0, z0] = wgs84ToLocal(lons[0], lats[0]), [x1, z1] = wgs84ToLocal(lons[w - 1], lats[h - 1])
    const have = { [D.high.datum]: D.high.navd88M, [D.low.datum]: D.low.navd88M }
    let filled = 0
    const field = arr => arr.map((v, k) => {
      if (v != null) return up(v)
      let best = null, bd = Infinity                          // nearest covered sample on the grid
      arr.forEach((u, q) => { if (u == null) return; const d = Math.hypot((q % w) - (k % w), Math.floor(q / w) - Math.floor(k / w)); if (d < bd) { bd = d; best = u } })
      filled++
      return up(best)
    })
    const datums = { grid: { min: [+x0.toFixed(2), +z0.toFixed(2)], step: [+((x1 - x0) / (w - 1)).toFixed(3), +((z1 - z0) / (h - 1)).toFixed(3)], w, h },
                     uncertaintyM: D.uncertaintyM }
    for (const [name, arr] of Object.entries(have)) datums[name] = field(arr)
    const pick = (key, dflt) => {
      const name = auth[key]?.value ?? dflt
      if (!datums[name]) throw new Error(`⛔ the water level: design.json water.${key} = '${name}', and '${SCENE}' has only ${Object.keys(have).join(', ')} (raw/water-datums.json) — fetch it, or name one of those`)
      return { name, from: auth[key] ? auth[key].from : 'kit default' }
    }
    const high = pick('high', 'MHW'), low = pick('low', 'MLLW')
    return { tidal: true, navd88OfZero: baseElev, datums, low: low.name, lowFrom: low.from, high: high.name, highFrom: high.from,
             station: D.station, source: `${D.source}, fetched ${D.fetchedOn}`, filledFromNeighbour: filled / Object.keys(have).length }
  }
  if (D.kind === 'lake') {
    const name = auth.lakeLevel?.value
    const opts = Object.entries(D.levels).map(([k, v]) => `${k} = ${v.igld85M} m IGLD85 (${v.what})`).join(' · ')
    if (!name) throw new Error(`⛔ the water level: '${SCENE}' is a lake (${D.station.name}, ${D.station.id}) and no level is ruled. Author design.json water.lakeLevel as one of: ${opts}. The lidar flew at ${baseElev} m NAVD88.`)
    const L = D.levels[name]
    if (!L || !Number.isFinite(L.igld85M)) throw new Error(`⛔ the water level: water.lakeLevel = '${name}' — '${SCENE}' has ${opts}`)
    const v = up(L.igld85M + D.igld85InNavd88M)
    return { tidal: false, navd88OfZero: baseElev, datums: { grid: { min: [0, 0], step: [0, 0], w: 1, h: 1 }, [name]: [v], uncertaintyM: null },
             low: name, lowFrom: auth.lakeLevel.from, high: name, highFrom: auth.lakeLevel.from, station: D.station, source: `${D.source}, fetched ${D.fetchedOn}` }
  }
  throw new Error(`⛔ the water level: raw/water-datums.json for '${SCENE}' names no datum (${D.why || D.kind}) — its water level cannot be named`)
}

// ⭐⭐ THE REAL FLOOR (BRIEF-bathymetry; Jacob, 2026-09-26/27: "where there is depth data, we only use it out to
// stair's edge. Where we don't have it, we gently slope it"). `fetch-bathymetry.mjs` lists the town's bathymetry
// tiles (raw/bathymetry-sources.txt); they are range-read here through the same reader as the DEM, finest first,
// and sampled under the mapped water. Depth = the water's level (the datum, derived from the flattened DEM FIRST —
// replacing those samples before the datum would break it) minus the floor's elevation, in the DEM's vertical datum.
// ⛔ Two vertical datums are never subtracted: the floor's is read off its tile, the DEM's off its tile or its
// product's specification, and a pair this file cannot reconcile is REFUSED (no conversion is built yet).
const BATHY_LIST = join(MAP_DIR, 'raw', 'bathymetry-sources.txt')
const NAVD88 = 5103   // EPSG vertical datum code
// The DEM's vertical datum. USGS 3DEP 1 m tiles carry no vertical GeoKey; the 3DEP product is NAVD88 over the
// conterminous US (USGS Lidar Base Specification), so that is taken for a 3DEP tile inside CONUS and SAID.
function demVerticalDatum(sources, cornersLL) {
  if (sources.every(S => S.geoKeys?.VerticalDatumGeoKey === NAVD88)) return { datum: 'NAVD88', from: 'the DEM tiles\' own VerticalDatumGeoKey' }
  const conus = cornersLL.every(([lon, lat]) => lon > -125 && lon < -66 && lat > 24 && lat < 50)
  if (conus && sources.every(S => /\/StagedProducts\/Elevation\//.test(S.ref)))
    return { datum: 'NAVD88', from: 'USGS 3DEP product specification (CONUS elevations are NAVD88) — the tiles carry no vertical key' }
  return null
}
async function readFloor({ bounds, width, height, cornersLL, mask, raw, baseElev, demSources }) {
  if (!fs.existsSync(BATHY_LIST)) return { none: `no raw/bathymetry-sources.txt — ▶ node cartograph/fetch-bathymetry.mjs --scene=${SCENE}` }
  const urls = fs.readFileSync(BATHY_LIST, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (!urls.length) return { none: 'fetch-bathymetry found no tiles on its built rungs (raw/bathymetry-sources.txt says which rungs ran) — NOT verified-absent' }
  const src = await openSources(urls.map(ref => ({ kind: 'url', ref })), { bounds, width, height, cornersLL, elevationBandOnly: true })
  if (!src.length) throw new Error(`⛔ the floor: none of the ${urls.length} tile(s) in ${BATHY_LIST} overlap scene '${SCENE}' — the list is for another place`)
  src.sort((a, b) => Math.abs(a.rx) - Math.abs(b.rx))                      // finest first
  const bad = src.filter(S => S.geoKeys?.VerticalDatumGeoKey !== NAVD88 && !/navd\s*88/i.test(S.geoKeys?.VerticalCitationGeoKey || ''))
  if (bad.length) throw new Error(`⛔ the floor: ${bad.map(S => S.label).join(', ')} name no NAVD88 vertical datum — refusing to subtract it from the DEM's`)
  const dem = demVerticalDatum(demSources, cornersLL)
  if (dem?.datum !== 'NAVD88') throw new Error(`⛔ the floor is NAVD88 and the DEM's vertical datum cannot be established — refusing to mix them (no datum conversion is built: BRIEF-bathymetry step 2)`)
  const total = width * height, stepX = (bounds.maxX - bounds.minX) / (width - 1), stepZ = (bounds.maxZ - bounds.minZ) / (height - 1)
  const at = (i, j) => localToWgs84(bounds.minX + stepX * i, bounds.minZ + stepZ * j)
  const depth = new Float32Array(total).fill(NaN)
  let n = 0
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const k = j * width + i
    if (!mask[k]) continue
    const v = sampleSources(src, ...at(i, j), { nanIsNodata: true })
    if (Number.isFinite(v)) { depth[k] = baseElev - v; n++ }
  }
  // The SEAM: on dry ground within two cells of the water, where both rasters stand, how far the floor's
  // elevation sits from the DEM's. A step there is a new bare gap at the shore (BRIEF-bathymetry step 2).
  const diffs = []
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const k = j * width + i
    if (mask[k] || !Number.isFinite(raw[k])) continue
    let near = false
    for (let dj = -2; dj <= 2 && !near; dj++) for (let di = -2; di <= 2; di++) {
      const ii = i + di, jj = j + dj
      if (ii >= 0 && jj >= 0 && ii < width && jj < height && mask[jj * width + ii]) { near = true; break }
    }
    if (!near) continue
    const v = sampleSources(src, ...at(i, j), { nanIsNodata: true })
    if (Number.isFinite(v)) diffs.push(v - raw[k])
  }
  diffs.sort((a, b) => a - b)
  const absd = diffs.map(Math.abs).sort((a, b) => a - b)
  const q = (arr, p) => arr.length ? +arr[Math.min(arr.length - 1, Math.floor(p * arr.length))].toFixed(3) : null
  const cellM = Math.max(...src.map(S => Math.abs(S.rx)))
  return { depth, cells: n, cellM, tiles: src.length, datum: 'NAVD88', demDatumFrom: dem.from,
           seam: { samples: diffs.length, medianM: q(diffs, 0.5), p90AbsM: q(absd, 0.9) } }
}

// ⭐ THE WATER AT HIGH FLOODS UP THE BEACH (Jacob, 2026-09-27). The drawn water's edge sits near the survey day's
// waterline, not at the high level: measured on provincetown, the land just outside it lay BELOW high water along
// 45 of 51 km, so a sheet ending at the drawing would hang in the air over the beach. The water at HIGH is the drawn
// water plus the ground below the high level CONNECTED to it — a 4-way flood fill from the water, so a hollow or a diked
// marsh stays dry — plus one ring of dry cells, so the sheet's own edge lies under the ground and the edge you see is
// where the level meets it. Returned as rings (local metres) MINUS the drawn water (map.json layers.water), so the two
// sheets meet and never overlap. Lower tides need nothing: the ground hides the sheet wherever it stands above the level.
function floodExtent(normalized, mask, width, height, bounds, water) {
  const L = levelsOf(water)
  const sx = (bounds.maxX - bounds.minX) / (width - 1), sz = (bounds.maxZ - bounds.minZ) / (height - 1)
  const X = i => bounds.minX + i * sx, Z = j => bounds.minZ + j * sz
  const state = new Uint8Array(width * height)          // 1 = drawn water, 2 = flooded, 3 = the dry ring, 4 = a held line
  // ⛔ A MAPPED DIKE HOLDS THE WATER. The heightfield is 5 m: a dike narrower than ~2 cells reads as a gap and a
  // 4-way fill walks through it into the marsh it keeps dry (Loam, 2026-09-27). Every mapped line that holds water —
  // man_made=dyke, embankment=yes, waterway=dam — is drawn into the grid (half-cell steps: an 8-connected line, which a
  // 4-way fill cannot cross) as cells the flood may not enter.
  let held = 0
  for (const bucket of Object.values(JSON.parse(fs.readFileSync(OSM_PATH, 'utf8')).ground || {})) {
    if (!Array.isArray(bucket)) continue
    for (const f of bucket) {
      const t = f?.tags || {}
      if (!(t.man_made === 'dyke' || t.embankment === 'yes' || t.waterway === 'dam')) continue
      const c = (f.coords || []).filter(q => Number.isFinite(q.x) && Number.isFinite(q.z))
      for (let n = 1; n < c.length; n++) {
        const L = Math.hypot(c[n].x - c[n - 1].x, c[n].z - c[n - 1].z), steps = Math.max(1, Math.ceil(L / (Math.min(sx, sz) / 2)))
        for (let u = 0; u <= steps; u++) {
          const i = Math.round((c[n - 1].x + (c[n].x - c[n - 1].x) * u / steps - bounds.minX) / sx), j = Math.round((c[n - 1].z + (c[n].z - c[n - 1].z) * u / steps - bounds.minZ) / sz)
          if (i >= 0 && j >= 0 && i < width && j < height && !mask[j * width + i] && state[j * width + i] !== 4) { state[j * width + i] = 4; held++ }
        }
      }
    }
  }
  const queue = new Int32Array(width * height); let qh = 0, qt = 0
  for (let k = 0; k < width * height; k++) if (mask[k]) { state[k] = 1; queue[qt++] = k }
  let flooded = 0
  while (qh < qt) {
    const k = queue[qh++], i = k % width, j = (k - i) / width
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj
      if (ii < 0 || jj < 0 || ii >= width || jj >= height) continue
      const n = jj * width + ii
      if (state[n] || !(normalized[n] < L.highAt(X(ii), Z(jj)))) continue
      state[n] = 2; flooded++; queue[qt++] = n
    }
  }
  // The dry ring goes round ALL the water, drawn and flooded: a cell is judged at its centre, so up to a cell beyond the
  // drawn edge the draped ground can dip below the level while its cell stands above it (measured: 24 km of
  // provincetown's shore with the ring round the flood alone).
  let ring = 0
  for (let k = 0; k < width * height; k++) {
    if (state[k] !== 1 && state[k] !== 2) continue
    const i = k % width, j = (k - i) / width
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj
      if (ii < 0 || jj < 0 || ii >= width || jj >= height) continue
      const n = jj * width + ii
      if (!state[n]) { state[n] = 3; ring++ }
    }
  }
  // Each row's runs of drawn + flooded + ring cells as rectangles (a cell spans ±half a step around its sample), unioned, then
  // the drawn water cut out of them.
  const S = 100, C = clipperLib, P = (x, z) => ({ X: Math.round(x * S), Y: Math.round(z * S) })
  const cells = []
  for (let j = 0; j < height; j++) {
    let i0 = -1
    for (let i = 0; i <= width; i++) {
      const on = i < width && state[j * width + i] >= 1 && state[j * width + i] <= 3
      if (on && i0 < 0) i0 = i
      else if (!on && i0 >= 0) {
        const x0 = X(i0) - sx / 2, x1 = X(i - 1) + sx / 2, z0 = Z(j) - sz / 2, z1 = Z(j) + sz / 2
        cells.push([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)]); i0 = -1
      }
    }
  }
  const mapPath = join(CLEAN_DIR, 'map.json')
  if (!fs.existsSync(mapPath)) throw new Error(`⛔ the high-water flood: ${mapPath} is missing — the drawn water it meets cannot be read. Pour the town first.`)
  const drawn = (JSON.parse(fs.readFileSync(mapPath, 'utf8')).layers?.water || [])
    .filter(w => Array.isArray(w?.ring) && w.ring.length >= 3).map(w => w.ring.map(p => P(p.x ?? p[0], p.z ?? p[1])))
  const cp = new C.Clipper()
  cp.AddPaths(cells, C.PolyType.ptSubject, true)
  const union = new C.Paths(); cp.Execute(C.ClipType.ctUnion, union, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)
  const cd = new C.Clipper()
  cd.AddPaths(union, C.PolyType.ptSubject, true); cd.AddPaths(drawn, C.PolyType.ptClip, true)
  const tree = new C.PolyTree(); cd.Execute(C.ClipType.ctDifference, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)
  const out = [], xy = path => path.map(p => [+(p.X / S).toFixed(2), +(p.Y / S).toFixed(2)])
  const walk = (node) => { for (const ch of node.Childs()) { out.push({ outer: xy(ch.Contour()), holes: ch.Childs().map(h => xy(h.Contour())) }); for (const h of ch.Childs()) walk(h) } }
  walk(tree)
  const ha = sx * sz / 1e4
  return { at: water.high, floodedHa: +(flooded * ha).toFixed(1), ringHa: +(ring * ha).toFixed(1), heldCells: held, polygons: out }
}

function writeBed(normalized, mask, width, height, bounds, floor = null) {
  const stepX = (bounds.maxX - bounds.minX) / (width - 1), stepZ = (bounds.maxZ - bounds.minZ) / (height - 1)
  const auth = waterAuthoring()
  const sand = auth.sandD50Mm ?? { value: finding('f-cem-nj-beach-d50').value.d50_mm, from: 'f-cem-nj-beach-d50 (the kit default — no town value authored)' }
  const vis = auth.secchiM ?? (() => { const r = finding('r-bottom-visibility-default').value
    return { value: r.visibleToM, fade: r.fadeOverM, from: 'r-bottom-visibility-default (Jacob\'s 8 ft) — ⚠️ NO measured clarity for this town (q-water-clarity-per-town)' } })()
  const A = deanA(sand.value)
  const dist = shoreDistance(mask, width, height, stepX, stepZ)
  const rock = rockCells(normalized, mask, width, height, bounds)
  // ⭐ Where the floor is known it REPLACES the profile, down to the visibility depth (deeper does not show); it is
  // feathered into the profile over one of its own cells where its coverage ends inside the water. A floor that
  // stands ABOVE the level inside the mapped water is laid at the level (the water is flat, and the map says water
  // there) and COUNTED, never raised through the sheet.
  const known = floor?.depth ? floor : null
  let wFloor = null
  if (known) {
    const keep = new Uint8Array(mask.length)
    for (let k = 0; k < mask.length; k++) keep[k] = (mask[k] && !Number.isFinite(known.depth[k])) ? 0 : 1
    wFloor = shoreDistance(keep, width, height, stepX, stepZ)             // metres to the nearest wet cell the floor misses
  }
  const fromFloor = new Uint8Array(known ? mask.length : 0)
  let n = 0, capped = 0, maxD = 0, nFloor = 0, above = 0
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k] || rock.has(k)) continue
    let h = Math.min(A * Math.pow(dist[k], 2 / 3), vis.value)
    if (known && Number.isFinite(known.depth[k])) {
      const d = known.depth[k], hp = h
      if (d < 0) above++
      const w = Math.min(1, wFloor[k] / known.cellM)
      h = w * Math.min(Math.max(d, 0), vis.value) + (1 - w) * hp
      // ⛔ THE WATERLINE STAYS THE MAPPED SHORE: within a bilinear reach of it (two cells) the bed is never shallower
      // than the profile, or a flat laid at the level blends with the land beside it and stands proud of the sheet.
      if (dist[k] <= 2 * Math.max(stepX, stepZ)) h = Math.max(h, hp)
      if (w > 0) { fromFloor[k] = 1; nFloor++ }
    }
    if (h >= vis.value) capped++
    normalized[k] = -h; n++; if (dist[k] > maxD) maxD = dist[k]
  }
  // Cells as row runs [row, firstCol, lastCol, …] — the check scopes its rules by them.
  const rowRuns = (on) => {
    const out = []
    for (let j = 0; j < height; j++) {
      let i0 = -1
      for (let i = 0; i <= width; i++) {
        const v = i < width && on(j * width + i)
        if (v && i0 < 0) i0 = i
        else if (!v && i0 >= 0) { out.push(j, i0, i - 1); i0 = -1 }
      }
    }
    return out
  }
  const runs = known ? rowRuns(k => fromFloor[k]) : []   // which cells the floor drew
  const fade = vis.fade ?? finding('r-bottom-visibility-default').value.fadeOverM
  console.log(`  BED: ${n.toLocaleString()} cells under the water · h = ${A.toFixed(3)}·y^(2/3) (sand ${sand.value} mm — ${sand.from})`)
  console.log(`    visible to ${vis.value.toFixed(2)} m, fading over the last ${fade.toFixed(2)} m — ${vis.from}`)
  console.log(`    the profile reaches that depth ${(Math.pow(vis.value / A, 1.5)).toFixed(0)} m from the shore · ${(100 * capped / Math.max(1, n)).toFixed(1)}% of the water is past it`)
  const cellHa = stepX * stepZ / 1e4
  if (known) {
    console.log(`  FLOOR: ${known.tiles} bathymetry tile(s), ${known.datum} (DEM: ${known.demDatumFrom})`)
    console.log(`    draws ${nFloor.toLocaleString()} of ${n.toLocaleString()} bed cells (${(100 * nFloor / Math.max(1, n)).toFixed(1)}%); the rest keep the profile`)
    console.log(`    seam at the shore (floor − DEM on dry ground within 2 cells): median ${known.seam.medianM} m · p90 |Δ| ${known.seam.p90AbsM} m over ${known.seam.samples.toLocaleString()} samples`)
    if (above) console.warn(`    ⚠️ ${above.toLocaleString()} cell(s) (${(above * cellHa).toFixed(1)} ha) of mapped water have a floor ABOVE the level — laid at the level, not raised through it`)
  } else console.log(`  FLOOR: none — ${floor?.none || 'not asked'}. The bed is the profile alone.`)
  return { profile: 'f-cem-equilibrium-profile', A: +A.toFixed(4), sandD50Mm: sand.value, sandFrom: sand.from,
           visibleToM: vis.value, fadeOverM: fade, visibilityFrom: vis.from, cells: n,
           floor: known
             ? { source: 'NOAA OCS BlueTopo (raw/bathymetry-sources.txt)', tiles: known.tiles, datum: known.datum, demDatumFrom: known.demDatumFrom,
                 cellM: known.cellM, cells: nFloor, aboveLevelCells: above, seam: known.seam, runs }
             : { none: floor?.none || 'not asked' },
           // ⭐ The kept rock (rockCells): stands above the level by ruling, so the check names it rather than calling it proud.
           rock: { cells: rock.size, from: 'structures.mjs stoneStructures (mapped breakwaters/groynes) × the lidar above the water', runs: rock.size ? rowRuns(k => rock.has(k)) : [] } }
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

// ⭐ One reader for every raster the terrain reads — the DEM tiles and the bathymetry tiles — so both are placed
// by the same projector, the same overview choice and the same window. Returns the windows that overlap the scene.
// `elevationBandOnly`: read band 1 alone (a BlueTopo tile carries elevation, uncertainty and contributor).
async function openSources(specs, { bounds, width, height, cornersLL: _cornersLL, elevationBandOnly = false }) {
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
  const rasters = await image.readRasters(elevationBandOnly ? { window: [px0, py0, px1, py1], samples: [0] } : { window: [px0, py0, px1, py1] })
  const band = Array.isArray(rasters) ? rasters[0] : rasters
  if (band.length !== winW * winH) throw new Error(`${label}: window read ${band.length}, expected ${winW * winH}`)
  console.log(`    window px=[${px0},${px1}) py=[${py0},${py1}) = ${winW}×${winH}`)
  sources.push({ label, band, winW, winH, rx, ry, proj, geoKeys: base.getGeoKeys?.() || {}, ref: spec.ref,
                 x0: ox + (px0 + 0.5) * rx, y0: oy + (py0 + 0.5) * ry })
}
  return sources
}

/** Bilinear sample of the first source that holds all four neighbours of (lon, lat); NaN if none does. */
function sampleSources(sources, lon, lat, { nanIsNodata = false } = {}) {
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
  const sources = await openSources(specs, { bounds, width, height, cornersLL: _cornersLL })

  // ⛔⛔ DOES THE UNION ACTUALLY COVER THE SCENE? REFUSE IF NOT.
  // The window clamps are Math.max(0,…)/Math.min(w,…), so a tile from the wrong
  // region does not error — it clamps to the tile's edge and bakes whatever is
  // there. Terrain, confidently, from the wrong place: CLAUDE.md Layer 0 q2.
  if (!sources.length) {
    console.error(`\n⛔ NONE of the ${specs.length} elevation source(s) overlap scene '${SCENE}'.`)
    console.error(`   scene needs lat ${latMin.toFixed(4)}..${latMax.toFixed(4)} lon ${lonMin.toFixed(4)}..${lonMax.toFixed(4)} — it needs: ${neededTiles.join(', ')}`)
    process.exit(1)
  }

  const sample = (lon, lat) => sampleSources(sources, lon, lat)

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
  const floor = wd ? await readFloor({ bounds, width, height, cornersLL: _cornersLL, mask: wd.mask, raw, baseElev, demSources: sources }) : null
  const bed = wd ? writeBed(normalized, wd.mask, width, height, bounds, floor) : null

  const water = wd ? waterLevels(baseElev, waterAuthoring()) : null
  if (water) water.flood = floodExtent(normalized, wd.mask, width, height, bounds, water)
  const meta = { width, height, bounds, baseElev: Math.round(baseElev * 100) / 100,
                 datum: datumKind, datumShare: wd ? Math.round(wd.share * 1000) / 1000 : null, ...(bed ? { bed } : {}), ...(water ? { water } : {}) }
  fs.mkdirSync(_outArg || CLEAN_DIR, { recursive: true })
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
    const rng = n => { const a = water.datums[n]; return `${Math.min(...a).toFixed(2)}…${Math.max(...a).toFixed(2)}` }
    console.log(`  LEVELS (m above y = 0): ${water.tidal ? 'tidal' : 'lake'} · low ${water.low} ${rng(water.low)} (${water.lowFrom}) · high ${water.high} ${rng(water.high)} (${water.highFrom})`)
    console.log(`    FLOOD at ${water.flood.at}: ${water.flood.floodedHa} ha of ground below it joins the drawn water (+ a ${water.flood.ringHa} ha dry ring, under the ground) · ${water.flood.polygons.length} polygon(s) beyond the drawing's water · ${water.flood.heldCells} cell(s) held by mapped dikes`)
    console.log(`    ${water.source}${water.filledFromNeighbour ? ` · ${water.filledFromNeighbour} grid point(s) off the datum model took their nearest neighbour` : ''}`)
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
