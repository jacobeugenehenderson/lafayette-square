// Forensic (Sward): fetch USDA NASS Cropland Data Layer (CropScape) for a town's OSM fetch bbox, in CDL's own
// projection (EPSG:5070, USGS Albers / NAD83 — projected here by the standard formulas, no library).
// Usage: node scratch/huron-median-lu/cdl-fetch.mjs <town> <year>  → scratch/huron-median-lu/cdl/<town>-<year>.tif
import fs from 'fs'
const [town, year = '2024'] = process.argv.slice(2)
const bx = JSON.parse(fs.readFileSync(`cartograph/data/${town}/raw/osm.json`)).bbox
// USGS Albers equal-area conic (EPSG:5070): GRS80, lat1 29.5, lat2 45.5, lat0 23, lon0 −96
export function albers(lon, lat) {
  const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, e = Math.sqrt(e2), d = Math.PI / 180
  const m = (p) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
  const q = (p) => { const s = Math.sin(p); return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s))) }
  const p1 = 29.5 * d, p2 = 45.5 * d, p0 = 23 * d, l0 = -96 * d
  const n = (m(p1) ** 2 - m(p2) ** 2) / (q(p2) - q(p1)), C = m(p1) ** 2 + n * q(p1)
  const rho = (p) => a * Math.sqrt(C - n * q(p)) / n, th = n * (lon * d - l0)
  return [rho(lat * d) * Math.sin(th), rho(p0) - rho(lat * d) * Math.cos(th)]
}
if (town) {
  const c = [[bx.minLon, bx.minLat], [bx.minLon, bx.maxLat], [bx.maxLon, bx.minLat], [bx.maxLon, bx.maxLat]].map(([o, a]) => albers(o, a))
  const b = [Math.min(...c.map(p => p[0])), Math.min(...c.map(p => p[1])), Math.max(...c.map(p => p[0])), Math.max(...c.map(p => p[1]))].map(Math.round)
  const q = `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLFile?year=${year}&bbox=${b.join(',')}`
  console.log('request', q)
  const x = await (await fetch(q)).text(); const url = (x.match(/<returnURL>([^<]+)<\/returnURL>/) || [])[1]
  if (!url) { console.log('⛔ no returnURL:', x.slice(0, 300)); process.exit(1) }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const out = `scratch/huron-median-lu/cdl/${town}-${year}.tif`; fs.writeFileSync(out, buf); console.log(out, buf.length, 'bytes')
}
