// sm-window.mjs — overnight job 3, the shore median's 4.49 → 5.85 ha (Huron): every hectare of the shift is ONE landward
// region (near 1010, −116). bake-shore-median's PASS A grid there, before (an overview read bilinearly, the pre-eb5aa261
// readWindow stepM path, from the saved copy) and after (rasterToGrid, the box mean): which nodes read wet (≤ ABOVE_WATER_M)
// and which flip. Read-only; a small window.
import { readFileSync } from 'fs'
import { join } from 'path'
import * as OLD from '../terrain-mean/before/elevationSources.mjs'
import { elevationSpecs, openRasters, rasterToGrid, ABOVE_WATER_M } from '../../../cartograph/elevationSources.mjs'
const root = new URL('../../../', import.meta.url).pathname, data = join(root, 'cartograph/data/huron')
const tj = JSON.parse(readFileSync(join(data, 'clean/terrain.json'))), { width: W, height: H, bounds: B, baseElev } = tj
const sx = (B.maxX - B.minX) / (W - 1), sz = (B.maxZ - B.minZ) / (H - 1), gridM = Math.min(sx, sz)
const geo = JSON.parse(readFileSync(join(data, 'geography.json')))
const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
const [X0, X1, Z0, Z1] = [760, 1240, -380, 120]
const i0 = Math.ceil((X0 - B.minX) / sx), i1 = Math.floor((X1 - B.minX) / sx), j0 = Math.ceil((Z0 - B.minZ) / sz), j1 = Math.floor((Z1 - B.minZ) / sz)
const w = i1 - i0 + 1, h = j1 - j0 + 1
// after: rasterToGrid over exactly these nodes
const opened = await openRasters(elevationSpecs(data), { cacheMB: 64 })
const sub = { minX: B.minX + sx * i0, maxX: B.minX + sx * i1, minZ: B.minZ + sz * j0, maxZ: B.minZ + sz * j1 }
const { grid: mean } = await rasterToGrid(opened, { width: w, height: h, bounds: sub, toLL, quiet: true })
// before: the old PASS A, verbatim in shape — the whole-town overview window, then sampleSources at each node
const o = await OLD.openRasters(elevationSpecs(data), { cacheMB: 64 })
const corners = [toLL(B.minX, B.minZ), toLL(B.maxX, B.minZ), toLL(B.minX, B.maxZ), toLL(B.maxX, B.maxZ)]
const coarse = await OLD.readWindow(o, { cornersLL: corners, stepM: gridM, atLL: toLL(B.minX, B.minZ), toLL: toLL(B.minX + gridM, B.minZ), quiet: true })
let n = 0, wetOld = 0, wetNew = 0, toWet = 0, toDry = 0, nanOld = 0, nanNew = 0
const d = []
for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
  const x = sub.minX + sx * i, z = sub.minZ + sz * j
  const vo = OLD.sampleSources(coarse, ...toLL(x, z)) - baseElev, vn = mean[j * w + i] - baseElev
  n++
  if (!Number.isFinite(vo)) nanOld++; if (!Number.isFinite(vn)) nanNew++
  const wo = Number.isFinite(vo) && vo <= ABOVE_WATER_M, wn = Number.isFinite(vn) && vn <= ABOVE_WATER_M
  wetOld += wo; wetNew += wn; if (!wo && wn) toWet++; if (wo && !wn) toDry++
  if (Number.isFinite(vo) && Number.isFinite(vn)) d.push(vn - vo)
}
d.sort((a, b) => a - b)
const q = (p) => d[Math.floor(p * (d.length - 1))]
console.log(`huron PASS A, window x ${X0}…${X1} z ${Z0}…${Z1}: ${n.toLocaleString()} nodes · wet (≤ ${ABOVE_WATER_M * 1000} mm) before ${wetOld} · after ${wetNew} · dry→wet ${toWet} · wet→dry ${toDry} · NaN before ${nanOld} after ${nanNew}`)
console.log(`  mean − overview p10/p50/p90 ${[0.1, 0.5, 0.9].map(p => (q(p) * 1000).toFixed(0) + ' mm').join(' / ')}`)
// the heights the flips sit at
const near = []
for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x = sub.minX + sx * i, z = sub.minZ + sz * j
  const vo = OLD.sampleSources(coarse, ...toLL(x, z)) - baseElev, vn = mean[j * w + i] - baseElev
  if (Number.isFinite(vo) && Number.isFinite(vn) && (vo <= ABOVE_WATER_M) !== (vn <= ABOVE_WATER_M)) near.push([vo, vn]) }
near.sort((a, b) => a[0] - b[0])
console.log(`  the flipped nodes, overview / mean (mm), first 12: ${near.slice(0, 12).map(([a, b]) => `${(a * 1000).toFixed(0)}/${(b * 1000).toFixed(0)}`).join(' · ')}`)
const lo = near.map(([a]) => a).sort((a, b) => a - b)
console.log(`  overview value at the flips: p10/p50/p90 ${[0.1, 0.5, 0.9].map(p => lo.length ? (lo[Math.floor(p * (lo.length - 1))] * 1000).toFixed(0) + ' mm' : '—').join(' / ')}`)
