/**
 * Cartograph — bake-terrain
 *
 * One-shot. Reads a per-instance USGS 3DEP GeoTIFF, clips to LS_STENCIL,
 * resamples to a uniform 5 m grid, and writes:
 *
 *   src/data/terrain.json — metadata only ({width, height, bounds, baseElev})
 *   src/data/terrain.bin  — Float32Array(width*height), row-major, raw
 *
 * The `.bin` pattern matches the rest of the kit (ground.bin, buildings.bin).
 * Values are normalized to local-min = 0 so uExag scales pure relief;
 * absolute height is reconstructable from `baseElev` in the metadata.
 *
 * Clipping bbox = axis-aligned bbox of LS_STENCIL's scaled polygon
 * (streetFade.outer + 50), rounded outward to whole meters. Kit-shared
 * with CartographApp.jsx's LS_STENCIL.
 *
 * Per-instance raw input:
 *   cartograph/data/<scene>/raw/elevation.tif
 *
 * Acquire the LS tile (1°×1° 1/3 arc-second, ~10 m source resolution,
 * 453 MB, .gitignored) via:
 *   curl -O https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n39w091/USGS_13_n39w091.tif
 *
 * Run:  node cartograph/bake-terrain.js
 */

import fs from 'fs'
import { join } from 'path'
import { fromFile } from 'geotiff'
import { CARTOGRAPH_DIR, localToWgs84 } from './config.js'

const SCENE = 'lafayette-square'

const BOUNDARY_PATH = join(CARTOGRAPH_DIR, 'data', SCENE, 'neighborhood_boundary.json')
const TIF_PATH      = join(CARTOGRAPH_DIR, 'data', SCENE, 'raw', 'elevation.tif')
const OUT_JSON      = join(CARTOGRAPH_DIR, '..', 'src/data/terrain.json')
const OUT_BIN       = join(CARTOGRAPH_DIR, '..', 'src/data/terrain.bin')

const STENCIL_BUFFER_M = 50  // kit-shared with LS_STENCIL
const M_PER_SAMPLE     = 5   // see prior commit comment in this file

// USGS 3DEP no-data sentinel. The 1/3 arc-second product uses a large
// negative float; treat anything below -1000 m as missing.
const NODATA_THRESHOLD = -1000

function deriveStencilBbox(boundary) {
  const { boundary: poly, center, radius, streetFade } = boundary
  const targetR = (streetFade?.outer ?? radius) + STENCIL_BUFFER_M
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

  console.log(`Bake terrain  bbox=${JSON.stringify(bounds)}  span=${spanX}×${spanZ}m`)
  console.log(`              grid=${width}×${height} = ${total} samples  (~${(spanX/(width-1)).toFixed(2)} m/x, ${(spanZ/(height-1)).toFixed(2)} m/z)`)

  if (!fs.existsSync(TIF_PATH)) {
    console.error(`Missing input: ${TIF_PATH}`)
    console.error('Acquire via:')
    console.error('  curl -O https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n39w091/USGS_13_n39w091.tif')
    process.exit(1)
  }

  const t0 = Date.now()
  const tiff = await fromFile(TIF_PATH)
  const image = await tiff.getImage()
  const [origLon, origLat] = image.getOrigin()
  const [resLon, resLat]   = image.getResolution()   // resLat is negative for N-up
  const tifW = image.getWidth(), tifH = image.getHeight()
  console.log(`  tif ${tifW}×${tifH}  origin=(${origLon.toFixed(4)}, ${origLat.toFixed(4)})  res=(${resLon.toExponential(3)}, ${resLat.toExponential(3)}) °/px`)

  // Determine the geographic bbox we need (with a small pad so bilinear
  // taps inside the bbox always have all 4 neighbors).
  const corners = [
    localToWgs84(bounds.minX, bounds.minZ),
    localToWgs84(bounds.maxX, bounds.minZ),
    localToWgs84(bounds.minX, bounds.maxZ),
    localToWgs84(bounds.maxX, bounds.maxZ),
  ]
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity
  for (const [lon, lat] of corners) {
    if (lon < lonMin) lonMin = lon; if (lon > lonMax) lonMax = lon
    if (lat < latMin) latMin = lat; if (lat > latMax) latMax = lat
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

  let baseElev = Infinity, mx = -Infinity
  for (const v of raw) { if (v < baseElev) baseElev = v; if (v > mx) mx = v }
  const normalized = new Float32Array(total)
  for (let k = 0; k < total; k++) normalized[k] = raw[k] - baseElev

  const meta = { width, height, bounds, baseElev: Math.round(baseElev * 100) / 100 }
  fs.writeFileSync(OUT_JSON, JSON.stringify(meta))
  fs.writeFileSync(OUT_BIN, Buffer.from(normalized.buffer))

  const jsonKb = (fs.statSync(OUT_JSON).size / 1024).toFixed(1)
  const binKb  = (fs.statSync(OUT_BIN).size  / 1024).toFixed(1)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`Wrote ${OUT_JSON}  (${jsonKb} KB)`)
  console.log(`Wrote ${OUT_BIN}   (${binKb} KB)`)
  console.log(`  elevation range ${baseElev.toFixed(2)}..${mx.toFixed(2)}m  (normalized to 0..${(mx-baseElev).toFixed(2)})`)
  console.log(`  misses filled: ${misses}`)
  console.log(`  done in ${elapsed}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
