// shore-sources.mjs — READ-ONLY. ONE SHAPE SOURCE OR TWO (BRIEF-the-shore-is-one-line §4, "the coast is on the lidar").
// (1) The drawn shoreline (shape.json `__water__` runs = the coast stroked in ①) vs the LIDAR'S TRACE (clean/coast.json,
//     bake-coast.mjs: where the lidar meets high water): the distance of each trace vertex inside the terrain grid from the
//     chain. A town poured from that coast reads ~0; a slab poured before it reads how far the old coast was off.
// (2) RESOLUTION: at each trace vertex and at 1 m stations along the chain, what the rendered 5 m field reads against the
//     town's HIGH level (terrain.json#water), and how far in plan that moves the crossing (|raw − high| / |∇raw|).
// (Until 2026-10-25 the trace was shore-median.json's lidar waterline at y = 0; the median is retired.)
// Usage: node scratch/ground-height/shore-sources.mjs <scene>
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'
import { waterRuns } from '../../cartograph/shoreRuns.mjs'
import { readCoast } from '../../cartograph/coastFile.mjs'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
import { localBB, projectorOf, geographyFor } from '../../cartograph/geography.mjs'
const scene = process.argv[2]
const root = new URL('../../', import.meta.url).pathname
const slab = join(root, 'public/baked', scene)
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const osm = JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'raw/osm.json')))
const coast = readCoast(join(root, 'cartograph/data', scene, 'clean'), localBB(osm, projectorOf(geographyFor(scene))), 'shore-sources')
if (!coast.coast) { console.log(`${scene}: inland — ${coast.why}`); process.exit(0) }
const T = loadSceneTerrain(scene), raw = T.getElevationRaw
const L = waterLevels(T.water), hi = (x, z) => raw(x, z) - L.highAt(x, z)
const B = T.bounds || JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'clean/terrain.json'))).bounds
const inGrid = (x, z) => x >= B.minX && x <= B.maxX && z >= B.minZ && z <= B.maxZ
console.log(`\n=== ${scene}  the trace: ${coast.doc.from}`)
const runs = waterRuns(shape)
const segs = []
for (const r of runs) for (let i = 0; i + 1 < r.length; i++) segs.push([r[i], r[i + 1]])
const CELL = 20, grid = new Map()
for (const s of segs) {
  const [a, b] = s
  for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++)
    for (let z = Math.floor(Math.min(a[1], b[1]) / CELL); z <= Math.floor(Math.max(a[1], b[1]) / CELL); z++) {
      const k = x + ',' + z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s)
    }
}
function dChain(x, z, reach = 400) {
  let best = Infinity
  for (let r = 0; r * CELL <= reach; r++) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL)
    for (let gx = cx - r; gx <= cx + r; gx++) for (let gz = cz - r; gz <= cz + r; gz++) {
      if (Math.max(Math.abs(gx - cx), Math.abs(gz - cz)) !== r) continue
      for (const [a, b] of grid.get(gx + ',' + gz) || []) {
        const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
        const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0
        best = Math.min(best, Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz))
      }
    }
    if (best < (r) * CELL) break
  }
  return best
}
const q = (arr, ps) => { const s = [...arr].sort((a, b) => a - b); return ps.map(p => s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN) }
const f2 = v => Number.isFinite(v) ? v.toFixed(2) : String(v)
function gradMag(x, z) { const h = 0.25; return Math.hypot((raw(x + h, z) - raw(x - h, z)) / (2 * h), (raw(x, z + h) - raw(x, z - h)) / (2 * h)) }   // the level is flat over ±0.25 m

// (1) lidar-trace vertices
const ON_CHAIN = 0.05
const traceD = [], traceRaw = [], traceShift = []
let onChain = 0
for (const ring of coast.rings) for (const [x, z] of ring) {
  if (!inGrid(x, z)) continue
  const d = dChain(x, z)
  if (d < ON_CHAIN) onChain++
  traceD.push(d)
  const r0 = hi(x, z); traceRaw.push(r0)
  const g = gradMag(x, z); traceShift.push(g > 1e-4 ? Math.abs(r0) / g : Infinity)
}
const shoreM = segs.reduce((a, [p, b]) => a + Math.hypot(b[0] - p[0], b[1] - p[1]), 0)
console.log(`  drawn shoreline (① coast stroke): ${runs.length} runs · ${shoreM.toFixed(0)} m`)
console.log(`  (1) lidar-trace vertices in the grid: ${traceD.length} (${onChain} within ${ON_CHAIN} m of the chain)`)
const [d50, d90, d99] = q(traceD, [0.5, 0.9, 0.99])
console.log(`      distance from the ① coast chain  p50 ${f2(d50)} m  p90 ${f2(d90)} m  p99 ${f2(d99)} m  max ${f2(Math.max(...traceD))} m`)
const chainRaw = [], chainShift = []
for (const [a, b] of segs) {
  const Lg = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Lg < 1e-6) continue
  const tx = (b[0] - a[0]) / Lg, tz = (b[1] - a[1]) / Lg
  for (let s = 0; s < Lg; s += 1) {
    const x = a[0] + tx * s, z = a[1] + tz * s
    if (!inGrid(x, z)) continue
    const r0 = hi(x, z); chainRaw.push(r0); const g = gradMag(x, z); chainShift.push(g > 1e-4 ? Math.abs(r0) / g : Infinity)
  }
}
// (2) resolution
const [r50, r90, r99] = q(traceRaw.map(Math.abs), [0.5, 0.9, 0.99])
const [s50, s90, s99] = q(traceShift.filter(Number.isFinite), [0.5, 0.9, 0.99])
console.log(`  (2) at the lidar trace the 5 m field reads |raw − high| p50 ${f2(r50)} p90 ${f2(r90)} p99 ${f2(r99)} m → the rendered high-water crossing sits |raw − high|/|∇| away: p50 ${f2(s50)} p90 ${f2(s90)} p99 ${f2(s99)} m`)
const [c50, c90, c99] = q(chainRaw.map(Math.abs), [0.5, 0.9, 0.99])
const [cs50, cs90] = q(chainShift.filter(Number.isFinite), [0.5, 0.9])
const signs = chainRaw.filter(v => v > 0).length / chainRaw.length
console.log(`      at the ① coast chain (1 m stations) the 5 m field reads |raw − high| p50 ${f2(c50)} p90 ${f2(c90)} p99 ${f2(c99)} m (above high on ${(100 * signs).toFixed(0)}%) → the crossing p50 ${f2(cs50)} p90 ${f2(cs90)} m away`)
if (T.water) console.log(`      town water levels (terrain.json#water): ${JSON.stringify(T.water).slice(0, 200)}`)
