// shoreBand.mjs — the prototype band (overnight job 4): SHORE_BAND_DIR's band.bin (int16 mm residual over the coarse
// terrain.bin, bilinear), band.json (32 m tiles at 1 m) and mask.bin (1 = in the band). SHORE_BAND_TOL_M = the tolerance.
import { readFileSync } from 'fs'
import { join } from 'path'
const dir = process.env.SHORE_BAND_DIR, TOL = +process.env.SHORE_BAND_TOL_M
if (!dir || !(TOL > 0)) throw new Error('⛔ [shore-band proto] SHORE_BAND_DIR and SHORE_BAND_TOL_M are required')
const J = JSON.parse(readFileSync(join(dir, 'band.json'))), T = J.tile
const rb = readFileSync(join(dir, 'band.bin')), R = new Int16Array(rb.buffer, rb.byteOffset, rb.byteLength / 2)
const M = readFileSync(join(dir, 'mask.bin'))
const at = new Map(); J.tiles.forEach(([i, j], n) => at.set(i * 100000 + j, n))
// the residual (m) of the 1 m cell whose centre is (ci + 0.5, cj + 0.5): 0 outside the band or where the lidar held nothing
const cell = (ci, cj) => { const ti = Math.floor(ci / T), tj = Math.floor(cj / T), n = at.get(ti * 100000 + tj); if (n == null) return 0
  const k = n * T * T + (cj - tj * T) * T + (ci - ti * T); return M[k] && R[k] !== J.noData ? R[k] / 1000 : 0 }
export function inside(x, z) { const ci = Math.floor(x), cj = Math.floor(z), ti = Math.floor(ci / T), tj = Math.floor(cj / T), n = at.get(ti * 100000 + tj)
  return n != null && M[n * T * T + (cj - tj * T) * T + (ci - ti * T)] === 1 }
export function residual(x, z) { const gx = x - 0.5, gz = z - 0.5, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j
  return (cell(i, j) * (1 - fx) + cell(i + 1, j) * fx) * (1 - fz) + (cell(i, j + 1) * (1 - fx) + cell(i + 1, j + 1) * fx) * fz }
let wrapped = 0
export function wrapTerrain(t) {
  const raw0 = t.getElevationRaw, exag = t.exag
  const getElevationRaw = (x, z) => raw0(x, z) + residual(x, z)
  if (!wrapped++) console.warn(`  ⚠️ [shore-band proto] the terrain sampler carries the band (${dir}: ${J.tiles.length} tiles, land ${J.landW} m / water ${J.waterW} m, residual over ${J.residualOf})`)
  return { ...t, getElevationRaw, getElevation: (x, z) => getElevationRaw(x, z) * exag, identity: t.identity + '+shoreband' }
}
let said = 0
export function shorePolicy(exag) {
  if (!said++) console.warn(`  ⚠️ [shore-band proto] adaptive groups split inside the band to ${TOL} m (× exag ${exag}), edges ≥ ${J.cellM} m`)
  return { inside, tol: TOL * exag, minEdge: J.cellM }
}
