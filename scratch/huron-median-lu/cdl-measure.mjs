// Forensic (Sward): what USDA's Cropland Data Layer says about a town's ground, by the land evidence it falls on.
// Reads scratch/huron-median-lu/cdl/<town>-<year>.tif (cdl-fetch.mjs). Each 30 m pixel → inverse Albers (EPSG:5070)
// → lon/lat → the kit's own local frame (`wgs84ToLocal`), kept if it lies in a piece of the baked shape; then
// tallied by the evidence under it (the pour's `layerLandEvidence`, built in memory by evidence-smoke.mjs).
// Usage: CARTOGRAPH_SCENE=<town> node scratch/huron-median-lu/cdl-measure.mjs <town> <year>
import fs from 'fs'
import { fromArrayBuffer } from 'geotiff'
import { wgs84ToLocal } from '../../cartograph/config.js'
import { evidenceFor } from './evidence-smoke.mjs'
const [town, year = '2024'] = process.argv.slice(2)
const tif = await fromArrayBuffer(fs.readFileSync(`scratch/huron-median-lu/cdl/${town}-${year}.tif`).buffer.slice(0))
const img = await tif.getImage(), [W, H] = [img.getWidth(), img.getHeight()], [x0, , , y0] = img.getBoundingBox(), [rx, ry] = img.getResolution()
const px = (await img.readRasters())[0]
function inverseAlbers(x, y) {        // EPSG:5070 → lon/lat (GRS80; lat1 29.5, lat2 45.5, lat0 23, lon0 −96)
  const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, e = Math.sqrt(e2), d = Math.PI / 180
  const m = (p) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
  const q = (p) => { const s = Math.sin(p); return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s))) }
  const p1 = 29.5 * d, p2 = 45.5 * d, p0 = 23 * d, l0 = -96 * d
  const n = (m(p1) ** 2 - m(p2) ** 2) / (q(p2) - q(p1)), C = m(p1) ** 2 + n * q(p1), r0 = a * Math.sqrt(C - n * q(p0)) / n
  const rho = Math.hypot(x, r0 - y), th = Math.atan2(x, r0 - y), qq = (C - (rho * n / a) ** 2) / n
  let p = Math.asin(qq / 2)
  for (let i = 0; i < 12; i++) { const s = Math.sin(p); p += ((1 - e2 * s * s) ** 2 / (2 * Math.cos(p))) * (qq / (1 - e2) - s / (1 - e2 * s * s) + (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s))) }
  return [(l0 + th / n) / d, p / d]
}
const group = (c) => (c >= 1 && c <= 35) || (c >= 38 && c <= 61) || (c >= 66 && c <= 77) || (c >= 204 && c <= 254) ? 'crop'
  : c === 36 || c === 37 ? 'hay' : c === 176 ? 'grass/pasture' : c >= 121 && c <= 124 ? 'developed' : c >= 141 && c <= 143 ? 'forest'
  : c === 190 || c === 195 ? 'wetland' : c === 111 ? 'water' : c === 0 ? 'no data' : 'other'
const S = JSON.parse(fs.readFileSync(`public/baked/${town}/shape.json`)), E = evidenceFor(town).evidence
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const bbx = r => { let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]; return b }
const inside = (x, z, rings) => rings.filter(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && pip(x, z, o.r)).length % 2 === 1
const pieces = S.tiles.flatMap(t => t.iA).map(r => ({ r, bb: bbx(r) }))
const ev = E.map(e => ({ cat: e.src === 'osm' && e.lu === 'agricultural' ? 'mapped field (OSM)' : e.src === 'parcel' && e.lu === 'agricultural' ? 'farm parcel, no field' : `other evidence`, rings: e.rings.map(r => ({ r, bb: bbx(r) })) }))
const T = {}
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const [lon, lat] = inverseAlbers(x0 + (i + 0.5) * rx, y0 - (j + 0.5) * Math.abs(ry)), [x, z] = wgs84ToLocal(lon, lat)
  if (!inside(x, z, pieces)) continue
  const e = ev.find(q => inside(x, z, q.rings)), cat = e ? e.cat : 'no evidence (grass)'
  const g = group(px[j * W + i]); (T[cat] ||= {}); T[cat][g] = (T[cat][g] || 0) + 1
}
for (const [cat, g] of Object.entries(T)) { const n = Object.values(g).reduce((a, b) => a + b, 0)
  console.log(`${cat.padEnd(24)} ${(n * rx * Math.abs(ry) / 1e4).toFixed(1).padStart(7)} ha · ${Object.entries(g).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(100 * v / n)}%`).join(' · ')}`) }
