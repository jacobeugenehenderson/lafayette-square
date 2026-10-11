// shore-sources.mjs — BRIEF-the-ground-knows-its-height §4.6, READ-ONLY. Tests the thesis, does not hunt holes.
// (1) ONE SHAPE SOURCE OR TWO: the drawn shoreline (shape.json `__water__` runs = the coast stroked in ①) vs the lidar
//     waterline (shore-median.json: every region vertex that is NOT on the drawn shoreline lies on the lidar trace).
//     → the distance of each lidar-trace vertex from the chain; the share of shoreline with any median beside it.
// (2) RESOLUTION: the lidar trace is y = 0 at 1 m. The rendered ground is the 5 m field, per vertex. At each trace vertex,
//     what height does the 5 m field give, and how far (in plan) does that move the rendered y = 0 crossing
//     (|raw| / |∇raw|)? Same at the chain's own vertices.
// Usage: node scratch/ground-height/shore-sources.mjs <scene>
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'
import { waterRuns, shoreFingerprint } from '../../cartograph/shoreRuns.mjs'
const scene = process.argv[2]
const root = new URL('../../', import.meta.url).pathname
const slab = join(root, 'public/baked', scene)
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const med = JSON.parse(readFileSync(join(slab, 'shore-median.json')))
const T = loadSceneTerrain(scene), raw = T.getElevationRaw
const fp = shoreFingerprint(shape)
console.log(`\n=== ${scene}  shoreline fingerprint: slab ${fp} · median traced against ${med.shoreFingerprint} ${fp === med.shoreFingerprint ? '(same)' : '⛔ DIFFERENT'}`)
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
function gradMag(x, z) { const h = 0.25; return Math.hypot((raw(x + h, z) - raw(x - h, z)) / (2 * h), (raw(x, z + h) - raw(x, z - h)) / (2 * h)) }

// (1) lidar-trace vertices
const ON_CHAIN = 0.05
const traceD = [], traceRaw = [], traceShift = []
let onChain = 0
for (const side of ['seaward', 'landward']) for (const poly of med.regions[side] || []) for (const ring of [poly.outer, ...(poly.holes || [])]) for (const [x, z] of ring) {
  const d = dChain(x, z)
  if (d < ON_CHAIN) { onChain++; continue }
  traceD.push(d)
  const r0 = raw(x, z); traceRaw.push(r0)
  const g = gradMag(x, z); traceShift.push(g > 1e-4 ? Math.abs(r0) / g : Infinity)
}
const shoreM = segs.reduce((a, [p, b]) => a + Math.hypot(b[0] - p[0], b[1] - p[1]), 0)
console.log(`  drawn shoreline (① coast stroke): ${runs.length} runs · ${shoreM.toFixed(0)} m`)
console.log(`  median: seaward ${med.totals.seawardM2} m² · landward ${med.totals.landwardM2} m² · mean width ${med.totals.meanWidthM} m · unknown (no lidar) ${med.totals.unknownM2} m²`)
console.log(`  (1) lidar-trace vertices off the chain: ${traceD.length} (on-chain ${onChain})`)
const [d50, d90, d99] = q(traceD, [0.5, 0.9, 0.99])
console.log(`      distance from the ① coast chain  p50 ${f2(d50)} m  p90 ${f2(d90)} m  p99 ${f2(d99)} m  max ${f2(Math.max(...traceD))} m`)
// shoreline share with a median beside it: stations every 1 m, look ±0.5 m along the normal for a region
const regs = [...(med.regions.seaward || []), ...(med.regions.landward || [])]
function pip(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const rb = regs.map(p => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of p.outer) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) } return [a, b, c, d] })
function inMedian(x, z) { for (let i = 0; i < regs.length; i++) { const B = rb[i]; if (x < B[0] || x > B[2] || z < B[1] || z > B[3]) continue; let ins = pip(x, z, regs[i].outer); for (const h of regs[i].holes || []) if (pip(x, z, h)) ins = !ins; if (ins) return true } return false }
let st = 0, withMed = 0
const chainRaw = [], chainShift = []
for (const [a, b] of segs) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue
  const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L
  for (let s = 0; s < L; s += 1) {
    const x = a[0] + tx * s, z = a[1] + tz * s
    st++
    if (inMedian(x - tz * 0.5, z + tx * 0.5) || inMedian(x + tz * 0.5, z - tx * 0.5)) withMed++
    const r0 = raw(x, z); chainRaw.push(r0); const g = gradMag(x, z); chainShift.push(g > 1e-4 ? Math.abs(r0) / g : Infinity)
  }
}
console.log(`      shoreline stations with a median beside them (±0.5 m): ${withMed}/${st} = ${(100 * withMed / st).toFixed(1)}%`)
// (2) resolution
const [r50, r90, r99] = q(traceRaw.map(Math.abs), [0.5, 0.9, 0.99])
const [s50, s90, s99] = q(traceShift.filter(Number.isFinite), [0.5, 0.9, 0.99])
console.log(`  (2) at the lidar trace (y = 0 at 1 m) the 5 m field reads |raw| p50 ${f2(r50)} p90 ${f2(r90)} p99 ${f2(r99)} m → the rendered y = 0 crossing sits |raw|/|∇| away: p50 ${f2(s50)} p90 ${f2(s90)} p99 ${f2(s99)} m`)
const [c50, c90, c99] = q(chainRaw.map(Math.abs), [0.5, 0.9, 0.99])
const [cs50, cs90] = q(chainShift.filter(Number.isFinite), [0.5, 0.9])
const signs = chainRaw.filter(v => v > 0).length / chainRaw.length
console.log(`      at the ① coast chain (1 m stations) the 5 m field reads |raw| p50 ${f2(c50)} p90 ${f2(c90)} p99 ${f2(c99)} m (above 0 on ${(100 * signs).toFixed(0)}%) → y = 0 crossing p50 ${f2(cs50)} p90 ${f2(cs90)} m away`)
if (T.water) console.log(`      town water levels (terrain.json#water): ${JSON.stringify(T.water).slice(0, 200)}`)
