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
import { fromFile } from 'geotiff'
import { CARTOGRAPH_DIR, DEFAULT_MAP, requireExplicitMap} from './config.js'
import { writeIfChanged } from './io.js'
import { deriveFade } from './boundaryRecords.mjs'
import { coastRings, isWaterFeature } from './coastline.mjs'

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
  // ⭐ And the bodies the coast machinery deliberately does NOT reach — every
  // CLOSED water way (an inland pond, a reservoir). `bake-ground.js` says so in
  // as many words: coastline.mjs "applies only water" at the coast.
  for (const bucket of Object.values(ground)) {
    if (!Array.isArray(bucket)) continue
    for (const f of bucket) {
      if (!f?.isClosed || !isWaterFeature(f) || !Array.isArray(f.coords)) continue
      if (f.coords.length >= 4) rings.push(f.coords.map(p => [p.x, p.z]))
    }
  }
  if (!rings.length) {
    console.log('  water datum: this town has no water — the datum stays the local minimum')
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

  if (!fs.existsSync(TIF_PATH)) {
    console.error(`Missing input: ${TIF_PATH}`)
    console.error(`  scene spans lat ${latMin.toFixed(4)}..${latMax.toFixed(4)}, lon ${lonMin.toFixed(4)}..${lonMax.toFixed(4)}`)
    console.error(`Acquire the tile THIS scene needs:`)
    for (const t of neededTiles) {
      console.error(`  curl -o ${TIF_PATH} https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/${t}/USGS_13_${t}.tif`)
    }
    if (neededTiles.length > 1) {
      console.error(`  ⚠️ This scene STRADDLES ${neededTiles.length} tiles. One file cannot cover it —`)
      console.error(`     they must be mosaicked before this script can read them. Not handled here.`)
    }
    process.exit(1)
  }

  const t0 = Date.now()
  const tiff = await fromFile(TIF_PATH)
  const image = await tiff.getImage()
  const [origLon, origLat] = image.getOrigin()
  const [resLon, resLat]   = image.getResolution()   // resLat is negative for N-up
  const tifW = image.getWidth(), tifH = image.getHeight()
  console.log(`  tif ${tifW}×${tifH}  origin=(${origLon.toFixed(4)}, ${origLat.toFixed(4)})  res=(${resLon.toExponential(3)}, ${resLat.toExponential(3)}) °/px`)

  // (the scene's geographic bbox — lonMin/lonMax/latMin/latMax — was computed
  // above the acquire gate so the missing-file message can name the right tile.)

  // ⛔⛔ DOES THIS DEM ACTUALLY COVER THIS SCENE? REFUSE IF NOT.
  // The window clamp below is `Math.max(0, …)` / `Math.min(tifW, …)`, so a tile
  // from the wrong region does NOT error — it silently clamps to the tile's edge
  // and bakes whatever pixels happen to be there. Terrain, confidently, from the
  // wrong place. That is `CLAUDE.md` Layer 0 q2, and it is exactly what the old
  // hardcoded `n39w091` instruction would have produced on any town but two.
  const tifLonMin = origLon, tifLonMax = origLon + tifW * resLon
  const tifLatMax = origLat, tifLatMin = origLat + tifH * resLat   // resLat < 0
  if (lonMin < tifLonMin || lonMax > tifLonMax || latMin < tifLatMin || latMax > tifLatMax) {
    console.error(`\n⛔ THIS DEM DOES NOT COVER THIS SCENE — refusing to bake clamped terrain.`)
    console.error(`   scene needs  lat ${latMin.toFixed(4)}..${latMax.toFixed(4)}  lon ${lonMin.toFixed(4)}..${lonMax.toFixed(4)}`)
    console.error(`   tif provides lat ${tifLatMin.toFixed(4)}..${tifLatMax.toFixed(4)}  lon ${tifLonMin.toFixed(4)}..${tifLonMax.toFixed(4)}`)
    console.error(`   ⇒ ${TIF_PATH} is the wrong tile for scene '${SCENE}'. It needs: ${neededTiles.join(', ')}`)
    console.error(`   Delete it and re-acquire:`)
    for (const t of neededTiles) {
      console.error(`     curl -o ${TIF_PATH} https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/${t}/USGS_13_${t}.tif`)
    }
    process.exit(1)
  }

  // Pixel window in the tile (geotiff window is [left, top, right, bottom]
  // in pixel coords; top-left origin). resLat < 0, so the bigger lat is
  // closer to origin row.
  const PAD = 2
  const px0 = Math.max(0,     Math.floor((lonMin - origLon) / resLon) - PAD)
  const px1 = Math.min(tifW,  Math.ceil ((lonMax - origLon) / resLon) + PAD)
  const py0 = Math.max(0,     Math.floor((latMax - origLat) / resLat) - PAD)
  const py1 = Math.min(tifH,  Math.ceil ((latMin - origLat) / resLat) + PAD)
  const winW = px1 - px0, winH = py1 - py0
  console.log(`  reading window  px=[${px0},${px1})  py=[${py0},${py1})  = ${winW}×${winH}`)

  const rasters = await image.readRasters({ window: [px0, py0, px1, py1] })
  const band = Array.isArray(rasters) ? rasters[0] : rasters
  if (band.length !== winW * winH) {
    throw new Error(`Window read size mismatch: got ${band.length}, expected ${winW * winH}`)
  }

  // Geographic coords of the window's top-left pixel center. (GeoTIFF
  // convention: origin is the top-left corner of the top-left pixel, so
  // the *center* of pixel (px0, py0) is at origin + (px0+0.5, py0+0.5)
  // times resolution.)
  const winLon0 = origLon + (px0 + 0.5) * resLon
  const winLat0 = origLat + (py0 + 0.5) * resLat

  function sample(lon, lat) {
    const fx = (lon - winLon0) / resLon
    const fy = (lat - winLat0) / resLat
    const ix = Math.floor(fx), iy = Math.floor(fy)
    if (ix < 0 || iy < 0 || ix + 1 >= winW || iy + 1 >= winH) return NaN
    const tx = fx - ix, ty = fy - iy
    const v00 = band[iy * winW + ix],         v10 = band[iy * winW + ix + 1]
    const v01 = band[(iy + 1) * winW + ix],   v11 = band[(iy + 1) * winW + ix + 1]
    if (v00 < NODATA_THRESHOLD || v10 < NODATA_THRESHOLD ||
        v01 < NODATA_THRESHOLD || v11 < NODATA_THRESHOLD) return NaN
    return v00 * (1 - tx) * (1 - ty)
         + v10 * tx       * (1 - ty)
         + v01 * (1 - tx) * ty
         + v11 * tx       * ty
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
    console.log(`  DATUM = the local minimum: ${baseElev.toFixed(2)} m (this town has no water)`)
  }
  console.log(`  misses filled: ${misses}`)
  console.log(`  done in ${elapsed}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
