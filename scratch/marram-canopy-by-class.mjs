// marram-canopy-by-class.mjs — HOW MUCH TREE CANOPY LIES UNDER EACH LAND-USE CLASS?
// ▶ node scratch/marram-canopy-by-class.mjs [--look=provincetown] [--scene=provincetown]
// Reads raw/canopy.tif (NLCD Tree Canopy Cover, % per pixel, EPSG:4326), the look's baked
// ground (every group's triangles) and the scene's geography. Per group: its area, the
// area-weighted mean canopy %, and the share of its area with canopy ≥ 25 % / ≥ 50 %.
// Sampled at each triangle's centroid (triangles are small against 30 m pixels except on
// the largest faces — the area-weighting keeps those honest). Writes nothing.
import { readFileSync } from 'node:fs'
import { fromFile } from 'geotiff'

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1]
const look = arg('look', 'provincetown'), scene = arg('scene', look)
const geo = JSON.parse(readFileSync(`cartograph/data/${scene}/geography.json`, 'utf8'))
const tiff = await fromFile(`cartograph/data/${scene}/raw/canopy.tif`)
const img = await tiff.getImage(), [W, H] = [img.getWidth(), img.getHeight()]
const [minLon, minLat, maxLon, maxLat] = img.getBoundingBox()
const [band] = await img.readRasters()
const canopyAt = (x, z) => {
  const lon = geo.lon + x / geo.lonToMeters, lat = geo.lat - z / geo.latToMeters
  const i = Math.floor((lon - minLon) / (maxLon - minLon) * W), j = Math.floor((maxLat - lat) / (maxLat - minLat) * H)
  if (i < 0 || j < 0 || i >= W || j >= H) return NaN
  const v = band[j * W + i]
  return v > 100 ? NaN : v                 // NLCD TCC no-data (254/255) → not a value
}
const gj = JSON.parse(readFileSync(`public/baked/${look}/ground.json`, 'utf8'))
const bin = readFileSync(`public/baked/${look}/${gj.bin}`)
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const rows = []
for (const g of gj.groups) {
  const P = new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(ab, g.indexByteOffset, g.indexCount)
  let A = 0, AC = 0, A25 = 0, A50 = 0, Anod = 0
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3
    const area = Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) / 2
    const v = canopyAt((P[a] + P[b] + P[c]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3)
    A += area
    if (!Number.isFinite(v)) { Anod += area; continue }
    AC += area * v; if (v >= 25) A25 += area; if (v >= 50) A50 += area
  }
  const Av = A - Anod
  rows.push({ id: `${g.kind[0]}:${g.id}`, ha: A / 1e4, mean: Av ? AC / Av : NaN, p25: Av ? A25 / Av : NaN, p50: Av ? A50 / Av : NaN, nod: A ? Anod / A : 0 })
}
rows.sort((a, b) => b.ha - a.ha)
console.log(`${look}: canopy ${W}×${H} px (NLCD TCC) · ${rows.length} ground groups`)
console.log(' group                        area ha   mean canopy %   area ≥25 %   area ≥50 %   no-data')
for (const r of rows) if (r.ha >= 0.5) console.log(` ${r.id.padEnd(28)} ${r.ha.toFixed(1).padStart(8)} ${r.mean.toFixed(1).padStart(12)} ${(100 * r.p25).toFixed(0).padStart(11)}% ${(100 * r.p50).toFixed(0).padStart(11)}% ${(100 * r.nod).toFixed(0).padStart(8)}%`)
