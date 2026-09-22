// Does the SHIPPED 5 m bake really contain no step at the shore?
// The brief says: "waterline samples with a >1 m rise adjacent: 0 / steepest
// single-step rise from water: 0.0 m". Re-derive it from the artifact.
import { baked, osm, resample, M_TO_FT, ROOT } from './common.mjs'
import fs from 'fs'
const { width, height, bounds, baseElev } = baked.meta
const buf = fs.readFileSync(`${ROOT}/cartograph/data/huron/clean/terrain.bin`)
const h = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
let mx = 0, over1 = 0, n = 0, mxAt = null
for (let r = 0; r < height; r++) for (let c = 0; c < width - 1; c++) {
  const a = h[r * width + c], b = h[r * width + c + 1]
  if (!Number.isFinite(a) || !Number.isFinite(b)) continue
  n++; const d = Math.abs(a - b)
  if (d > 1) over1++
  if (d > mx) { mx = d; mxAt = [bounds.minX + c * baked.stepX, bounds.minZ + r * baked.stepZ] }
}
console.log(`SHIPPED 5 m BAKE, all ${n.toLocaleString()} horizontal adjacencies:`)
console.log(`  steepest 5 m step anywhere : ${mx.toFixed(2)} m (${(mx*M_TO_FT).toFixed(1)} ft) at local x${mxAt[0].toFixed(0)} z${mxAt[1].toFixed(0)}`)
console.log(`  adjacencies with >1 m step : ${over1.toLocaleString()} (${(100*over1/n).toFixed(2)}%)`)

// and specifically within 30 m of the Lake Erie way
const lake = osm.ground.natural.find(f => f.tags.natural === 'water' && f.tags.name === 'Lake Erie')
const st = resample(lake.coords, 10).filter(s => baked.inside(s.x, s.z))
let sMax = 0, sOver = 0, sN = 0
for (const s of st) {
  for (let d = 0; d <= 40; d += 5) {
    for (const sign of [1, -1]) {
      const x = s.x + (-s.tz) * sign * d, z = s.z + s.tx * sign * d
      const a = baked.get(x, z), b = baked.get(x + 5 * (-s.tz) * sign, z + 5 * s.tx * sign)
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      sN++; const g = Math.abs(a - b)
      if (g > 1) sOver++
      if (g > sMax) sMax = g
    }
  }
}
console.log(`\nwithin 40 m of the Lake Erie way (${st.length} stations, ${sN.toLocaleString()} steps):`)
console.log(`  steepest 5 m step : ${sMax.toFixed(2)} m (${(sMax*M_TO_FT).toFixed(1)} ft)`)
console.log(`  steps over 1 m    : ${sOver.toLocaleString()} (${(100*sOver/sN).toFixed(2)}%)`)
