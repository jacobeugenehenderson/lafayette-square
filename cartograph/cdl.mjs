/**
 * cdl.mjs — USDA NASS's CROPLAND DATA LAYER: where crops actually grow, nationally, at 30 m, every year.
 *
 * ⭐ Ruled by Jacob 2026-10-05 ("go with your leans"): crop rows grow where a field is MAPPED (OSM `landuse=farmland`)
 * and, where OSM maps no field, where the CDL says crop. Measured on huron before building: the CDL reads 96% crop on
 * OSM's mapped fields and 78% on the 724.7 ha of farm parcels OSM leaves unmapped (scratch/huron-median-lu/cdl-measure.mjs).
 *
 * A town DECLARES it in its sources.json, with the same three states as every other well (cartograph/sources.js):
 *   DECLARED       "cropland": [{ "id": "usda-cdl", "year": 2024 }]  → raw/cdl-2024.tif (fetch: node cartograph/cdl.mjs)
 *   DECLARED-NONE  "cropland": [], "cropland_absent_reason": "<why>"  (a town outside the US, say)
 *   UNDECLARED     no key — LOUD at the pour: crop then grows on mapped fields only, and the pour says so.
 *
 * ⭐ Read in its OWN projection (EPSG:5070, USGS Albers / NAD83, by the standard formulas — no library), each crop
 * pixel's corners carried into the kit's local frame by `wgs84ToLocal`, a row's contiguous crop pixels merged into one
 * rectangle. ⛔ No smoothing and no minimum patch: a 30 m pixel is what the source says; anything else is invention.
 * ▶ node checks/claims-every-piece-takes-its-own-land-use.mjs (the crop cases)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fromArrayBuffer } from 'geotiff'

export const CDL = {
  id: 'usda-cdl',
  attribution: 'USDA National Agricultural Statistics Service — Cropland Data Layer (CropScape)',
  service: 'https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLFile',
  // CDL class codes that are CROPS (row crops, small grains, vegetables, orchards' rows, double crops, fallow). ⛔ Not
  // hay/alfalfa (36, 37) and not grass/pasture (176): those are grass, by the same ruling as meadow.
  isCrop: (c) => (c >= 1 && c <= 35) || (c >= 38 && c <= 61) || (c >= 66 && c <= 77) || (c >= 204 && c <= 254),
}
export const cdlFile = (year) => `cdl-${year}.tif`

// ── EPSG:5070 — USGS Albers equal-area conic: GRS80, lat1 29.5, lat2 45.5, lat0 23, lon0 −96 ──
const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, e = Math.sqrt(e2), d = Math.PI / 180
const m = (p) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
const q = (p) => { const s = Math.sin(p); return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s))) }
const p1 = 29.5 * d, p2 = 45.5 * d, p0 = 23 * d, l0 = -96 * d
const n = (m(p1) ** 2 - m(p2) ** 2) / (q(p2) - q(p1)), C = m(p1) ** 2 + n * q(p1), r0 = a * Math.sqrt(C - n * q(p0)) / n
export function toAlbers(lon, lat) {
  const rho = a * Math.sqrt(C - n * q(lat * d)) / n, th = n * (lon * d - l0)
  return [rho * Math.sin(th), r0 - rho * Math.cos(th)]
}
export function fromAlbers(x, y) {
  const rho = Math.hypot(x, r0 - y), th = Math.atan2(x, r0 - y), qq = (C - (rho * n / a) ** 2) / n
  let p = Math.asin(qq / 2)
  for (let i = 0; i < 12; i++) { const s = Math.sin(p); p += ((1 - e2 * s * s) ** 2 / (2 * Math.cos(p))) * (qq / (1 - e2) - s / (1 - e2 * s * s) + (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s))) }
  return [(l0 + th / n) / d, p / d]
}

/** The town's crop region from its declared CDL raster: { year, attribution, rings: [[x,z]...] } in the local frame. */
export async function readCdlCrop(rawDir, year, wgs84ToLocal) {
  const p = join(rawDir, cdlFile(year))
  if (!existsSync(p)) throw new Error(`[cdl] declared usda-cdl ${year} → raw/${cdlFile(year)}, which is not there. Acquire it: CARTOGRAPH_SCENE=<scene> node cartograph/cdl.mjs`)
  const buf = readFileSync(p), tif = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const img = await tif.getImage(), W = img.getWidth(), H = img.getHeight(), [x0, , , y1] = img.getBoundingBox()
  const [rx, ry] = img.getResolution(), px = (await img.readRasters())[0], dy = Math.abs(ry)
  const local = (ax, ay) => { const [lon, lat] = fromAlbers(ax, ay); const [x, z] = wgs84ToLocal(lon, lat); return [x, z] }
  const rings = []
  for (let j = 0; j < H; j++) {
    let i = 0
    while (i < W) {
      if (!CDL.isCrop(px[j * W + i])) { i++; continue }
      let k = i; while (k + 1 < W && CDL.isCrop(px[j * W + k + 1])) k++
      const xa = x0 + i * rx, xb = x0 + (k + 1) * rx, ya = y1 - j * dy, yb = y1 - (j + 1) * dy
      rings.push([local(xa, ya), local(xb, ya), local(xb, yb), local(xa, yb)])
      i = k + 1
    }
  }
  return { year, attribution: CDL.attribution, rings }
}

// ── the button: CARTOGRAPH_SCENE=<scene> node cartograph/cdl.mjs — fetches each declared year for the town's OSM bbox ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const { SCENE, RAW_DIR } = await import('./config.js')
  const { readCroplandSources } = await import('./sources.js')
  const d = readCroplandSources(SCENE)
  if (d.state !== 'declared') { console.log(`[cdl] ${SCENE}: cropland ${d.state}${d.absentReason ? ` — ${d.absentReason}` : ''}; nothing to fetch.`); process.exit(d.state === 'undeclared' ? 2 : 0) }
  const bx = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf8')).bbox
  const c = [[bx.minLon, bx.minLat], [bx.minLon, bx.maxLat], [bx.maxLon, bx.minLat], [bx.maxLon, bx.maxLat]].map(([o, l]) => toAlbers(o, l))
  const bb = [Math.min(...c.map(p => p[0])), Math.min(...c.map(p => p[1])), Math.max(...c.map(p => p[0])), Math.max(...c.map(p => p[1]))].map(Math.round)
  for (const src of d.sources) {
    const url = `${CDL.service}?year=${src.year}&bbox=${bb.join(',')}`
    const xml = await (await fetch(url)).text(), ret = (xml.match(/<returnURL>([^<]+)<\/returnURL>/) || [])[1]
    if (!ret) throw new Error(`[cdl] CropScape returned no file for ${src.year}: ${xml.slice(0, 200)}`)
    const tif = Buffer.from(await (await fetch(ret)).arrayBuffer())
    writeFileSync(join(RAW_DIR, cdlFile(src.year)), tif)
    console.log(`[cdl] ${SCENE}: wrote raw/${cdlFile(src.year)} (${tif.length} bytes) — ${CDL.attribution}, ${src.year}`)
  }
}

/**
 * The pour's read: { state, crop?: { year, attribution, rings }, reason? }. ⛔ A declared raster that is missing throws.
 */
export async function loadCropland(scene, rawDir, wgs84ToLocal) {
  const { readCroplandSources } = await import('./sources.js')
  const d = readCroplandSources(scene)
  if (d.state !== 'declared') return { state: d.state, reason: d.absentReason ?? null }
  return { state: 'declared', crop: await readCdlCrop(rawDir, d.sources[0].year, wgs84ToLocal) }
}
