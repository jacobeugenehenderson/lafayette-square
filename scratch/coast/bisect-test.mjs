// Offline: does bisecting each kept vertex on the real sampler bring |lidar − high| under 5 mm? (Boz (a), 2026-10-13)
// node scratch/coast/bisect-test.mjs <scene> <coast.json>
import fs from 'fs'
import { join } from 'path'
import { elevationSpecs, openRasters, readWindow, sampleSources } from '../../cartograph/elevationSources.mjs'
import { authoredWater, waterRecord } from '../../cartograph/waterDatums.mjs'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
const [scene, kpath] = process.argv.slice(2)
const mapDir = join('cartograph/data', scene), rd = f => JSON.parse(fs.readFileSync(join(mapDir, f), 'utf8'))
const K = JSON.parse(fs.readFileSync(kpath, 'utf8')), geo = rd('geography.json'), bnd = rd('neighborhood_boundary.json')
const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
const toLocal = (lon, lat) => [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]
const L = waterLevels(waterRecord({ mapDir, scene, auth: authoredWater(scene), wgs84ToLocal: toLocal, zero: 0 }))
const opened = await openRasters(elevationSpecs(mapDir), { cacheMB: 128 })
const T = 256, groups = new Map()
for (const a of K.arcs) for (let k = 1; k < a.length - 1; k++) {
  const p = a[k]; if (Math.hypot(p[0] - bnd.center[0], p[1] - bnd.center[1]) > bnd.radius) continue
  const key = `${Math.floor(p[0] / T)},${Math.floor(p[1] / T)}`
  ;(groups.get(key) || groups.set(key, []).get(key)).push([p, a[k - 1], a[k + 1]])
}
const before = [], after = [], moved = []
let unbracketed = 0, unknown = 0
for (const [key, items] of groups) {
  const [i, j] = key.split(',').map(Number), m = 4
  const win = await readWindow(opened, { cornersLL: [toLL(i * T - m, j * T - m), toLL(i * T + T + m, j * T - m), toLL(i * T - m, j * T + T + m), toLL(i * T + T + m, j * T + T + m)], stepM: null, quiet: true })
  const f = (x, z) => sampleSources(win, ...toLL(x, z)) - L.highAt(x, z)
  for (const [p, a, b] of items) {
    const f0 = f(p[0], p[1]); if (!Number.isFinite(f0)) { unknown++; continue }
    before.push(Math.abs(f0))
    let nx = -(b[1] - a[1]), nz = b[0] - a[0]; const n = Math.hypot(nx, nz) || 1; nx /= n; nz /= n
    let lo = -K.fineM, hi = K.fineM, flo = f(p[0] + nx * lo, p[1] + nz * lo), fhi = f(p[0] + nx * hi, p[1] + nz * hi)
    if (!(flo * fhi < 0)) { unbracketed++; after.push(Math.abs(f0)); continue }
    for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2, fm = f(p[0] + nx * mid, p[1] + nz * mid); if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm } else hi = mid }
    const t = (lo + hi) / 2; after.push(Math.abs(f(p[0] + nx * t, p[1] + nz * t))); moved.push(Math.abs(t))
  }
  win.length = 0
}
const q = (arr, f) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))] }
console.log(`${scene}: ${before.length} vertices (${unknown} no value)`)
console.log(`  before |lidar − high| p50 ${q(before, .5).toFixed(4)} p90 ${q(before, .9).toFixed(4)} p99 ${q(before, .99).toFixed(4)} m`)
console.log(`  after  |lidar − high| p50 ${q(after, .5).toFixed(4)} p90 ${q(after, .9).toFixed(4)} p99 ${q(after, .99).toFixed(4)} m · ${unbracketed} not bracketed within ±${K.fineM} m`)
console.log(`  moved p50 ${q(moved, .5).toFixed(3)} p90 ${q(moved, .9).toFixed(3)} max ${Math.max(...moved).toFixed(3)} m`)
