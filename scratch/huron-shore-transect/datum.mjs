// IS THE BAKE'S ZERO ACTUALLY THE LAKE? BakedGround assumes it is:
// "bake-terrain normalizes to local-min = 0 and ON A LAKESHORE TOWN THE LOCAL
// MINIMUM IS THE LAKE." Test it against the lidar's own hydro-flattened surface.
import fs from 'fs'
import { baked, ROOT, M_TO_FT } from './common.mjs'
const buf = fs.readFileSync(`${ROOT}/cartograph/data/huron/clean/terrain.bin`)
const h = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
const { width, bounds, baseElev } = baked.meta
let mn = Infinity, mnAt = null, zeros = 0
for (let i = 0; i < h.length; i++) {
  if (!Number.isFinite(h[i])) continue
  if (h[i] < 0.001) zeros++
  if (h[i] < mn) { mn = h[i]; mnAt = [bounds.minX + (i % width) * baked.stepX, bounds.minZ + Math.floor(i / width) * baked.stepZ] }
}
const LIDAR_LAKE = 174.44          // measured: the hydro-flattened plane in the 1 m DEM
console.log(`terrain.bin  baseElev ${baseElev} m   min ${mn.toFixed(3)} (normalized)  at local x${mnAt[0].toFixed(0)} z${mnAt[1].toFixed(0)}`)
console.log(`             samples at the floor: ${zeros}`)
console.log(`\nabsolute elevation of the bake's ZERO : ${baseElev.toFixed(2)} m`)
console.log(`absolute elevation of LAKE ERIE       : ${LIDAR_LAKE.toFixed(2)} m  (1 m lidar, hydro-flattened)`)
console.log(`⇒ the bake's datum sits ${(LIDAR_LAKE - baseElev).toFixed(2)} m (${((LIDAR_LAKE-baseElev)*M_TO_FT).toFixed(1)} ft) BELOW the lake surface`)
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const gb = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const wg = gj.groups.find(g => g.id === 'water:lake')
const WY = new Float32Array(gb.buffer, gb.byteOffset + wg.vertexByteOffset, 3)[1]
console.log(`\nthe water mesh is drawn at Y = ${WY.toFixed(4)} m`)
console.log(`it SHOULD be at Y = ${(LIDAR_LAKE - baseElev).toFixed(2)} m to sit on its own surface`)
console.log(`⇒ the lake is rendered ${((LIDAR_LAKE - baseElev) - WY).toFixed(2)} m TOO LOW`)
console.log(`\nand the seam I measured was a median 1.76 m, min 1.13 m:`)
console.log(`  datum error        ${(LIDAR_LAKE - baseElev - WY).toFixed(2)} m  ← the FLOOR of that distribution`)
console.log(`  genuine relief     median ${(1.76 - (LIDAR_LAKE - baseElev - WY)).toFixed(2)} m,  max ${(4.77 - (LIDAR_LAKE - baseElev - WY)).toFixed(2)} m`)
