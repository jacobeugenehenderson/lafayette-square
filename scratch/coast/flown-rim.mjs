// flown-rim.mjs — HOW LEVEL IS THE WATER AS FLOWN? READ-ONLY. Rebuilds bake-coast's coarse sheet (same helpers, same
// rules) and prints the rim — the finite lidar cells bordering the no-return water the flood entered — as a histogram
// of (lidar − high) at the mm, plus the cells AT the rim's mode that are connected to it (the flattened band).
// Usage: node scratch/coast/flown-rim.mjs <scene>
import fs from 'fs'
import { join } from 'path'
import { CARTOGRAPH_DIR } from '../../cartograph/config.js'
import { elevationSpecs, openRasters, readWindow, sampleSources, TERRAIN_STEP_M } from '../../cartograph/elevationSources.mjs'
import { authoredWater, waterRecord } from '../../cartograph/waterDatums.mjs'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
import { floodFromEdge, inRaster, heldCells } from '../../cartograph/bake-coast.mjs'

const scene = process.argv[2]
const mapDir = join(CARTOGRAPH_DIR, 'data', scene)
const read = (f) => JSON.parse(fs.readFileSync(join(mapDir, f), 'utf8'))
const geo = read('geography.json'), osm = read('raw/osm.json')
const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
const toLocal = (lon, lat) => [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]
const bx = osm.bbox, a = toLocal(bx.minLon, bx.maxLat), b = toLocal(bx.maxLon, bx.minLat)
const R = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }
const levels = waterLevels(waterRecord({ mapDir, scene, auth: authoredWater(scene), wgs84ToLocal: toLocal, zero: 0 }))
const opened = await openRasters(elevationSpecs(mapDir), { cacheMB: 128 })
const G = TERRAIN_STEP_M, W = Math.ceil((R.x1 - R.x0) / G) + 1, H = Math.ceil((R.z1 - R.z0) / G) + 1
const corners = [toLL(R.x0, R.z0), toLL(R.x1, R.z0), toLL(R.x0, R.z1), toLL(R.x1, R.z1)]
const coarse = await readWindow(opened, { cornersLL: corners, stepM: G, atLL: toLL(R.x0, R.z0), toLL: toLL(R.x0 + G, R.z0), quiet: true })
const w = new Float32Array(W * H), nr = new Uint8Array(W * H)
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = R.x0 + i * G, z = R.z0 + j * G, ll = toLL(x, z), v = sampleSources(coarse, ...ll), k = j * W + i
  w[k] = levels.highAt(x, z) - v
  if (!Number.isFinite(v) && inRaster(coarse, ...ll)) nr[k] = 1
}
const { held } = heldCells(osm.ground, { W, H, x0: R.x0, z0: R.z0, step: G })
const wet = floodFromEdge(w, W, H, held, nr)
const rim = []
for (let k = 0; k < W * H; k++) {
  if (!Number.isFinite(w[k])) continue
  const i = k % W, j = (k - i) / W
  const nb = [i > 0 && k - 1, i + 1 < W && k + 1, j > 0 && k - W, j + 1 < H && k + W]
  if (nb.some(q => q !== false && wet[q] && nr[q])) rim.push(k)
}
const hist = new Map()
for (const k of rim) { const m = Math.round(-w[k] * 1000); hist.set(m, (hist.get(m) || 0) + 1) }
const top = [...hist].sort((p, q) => q[1] - p[1]).slice(0, 12)
console.log(`${scene}: high ${levels.highName} (${levels.tidal ? 'tidal' : 'lake'}) · ${rim.length} rim cells · lidar − high at the rim, by mm (count):`)
console.log('  ' + top.map(([m, c]) => `${(m / 1000).toFixed(3)} m ×${c}`).join(' · '))
const s = rim.map(k => -w[k]).sort((p, q) => p - q), q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))]
console.log(`  p01 ${q(0.01).toFixed(3)} · p10 ${q(0.1).toFixed(3)} · p50 ${q(0.5).toFixed(3)} · p90 ${q(0.9).toFixed(3)} · p99 ${q(0.99).toFixed(3)} m`)
// the flattened band: finite cells EXACTLY at the rim's mode (at the source's mm), connected 4-way to the rim
const modeMm = top[0][0], at = (k) => Number.isFinite(w[k]) && Math.round(-w[k] * 1000) === modeMm
const band = new Uint8Array(W * H), queue = []
for (const k of rim) if (at(k)) { band[k] = 1; queue.push(k) }
for (let h = 0; h < queue.length; h++) { const k = queue[h], i = k % W, j = (k - i) / W
  for (const n of [i > 0 && k - 1, i + 1 < W && k + 1, j > 0 && k - W, j + 1 < H && k + W]) if (n !== false && !band[n] && !wet[n] && at(n)) { band[n] = 1; queue.push(n) } }
console.log(`  cells at the mode ${(modeMm / 1000).toFixed(3)} m connected to the rim: ${queue.length.toLocaleString()} (${(queue.length * G * G / 1e4).toFixed(1)} ha); of them on the rim ${rim.filter(k => band[k]).length}`)
// what borders that band on its land side: the step up from it
const up = []
for (const k of queue) { const i = k % W, j = (k - i) / W
  for (const n of [i > 0 && k - 1, i + 1 < W && k + 1, j > 0 && k - W, j + 1 < H && k + W]) if (n !== false && !band[n] && !wet[n] && Number.isFinite(w[n])) up.push(-w[n] - modeMm / 1000) }
up.sort((p, q) => p - q)
const u = (f) => up[Math.min(up.length - 1, Math.floor(f * up.length))]
console.log(`  the band's land neighbours (${up.length}): above the band by p01 ${u(0.01).toFixed(3)} · p10 ${u(0.1).toFixed(3)} · p50 ${u(0.5).toFixed(3)} · p90 ${u(0.9).toFixed(3)} m · ${up.filter(v => v < 0).length} BELOW it`)
