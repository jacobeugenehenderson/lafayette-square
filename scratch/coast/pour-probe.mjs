// After a scratch pour: do the islands mint as blocks, and does ①'s coast stand at high water? (Tern, read-only)
// node scratch/coast/pour-probe.mjs <scene>
import fs from 'fs'
import { join } from 'path'
import { elevationSpecs, openRasters, readWindow, sampleSources } from '../../cartograph/elevationSources.mjs'
import { authoredWater, waterRecord } from '../../cartograph/waterDatums.mjs'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
const scene = process.argv[2], mapDir = join('cartograph/data', scene), rd = f => JSON.parse(fs.readFileSync(join(mapDir, f), 'utf8'))
const P = rd('clean/map.json').layers.ribbons.protopolygon, K = rd('clean/coast.json'), geo = rd('geography.json'), bnd = rd('neighborhood_boundary.json')
const isW = (li) => P.owners[li]?.skelId === '__water__'
const area = r => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
// 1. blocks bounded only by the shore
const coastOnly = []
P.blocks.forEach((b, k) => { const L = P.blockLabels?.[k] || []; if (L.length && L.every(isW) && !(P.blockHoles?.[k] || []).length) coastOnly.push(area(b)) })
const isl = K.islands.map(i => i.m2).sort((a, b) => a - b)
coastOnly.sort((a, b) => a - b)
console.log(`${scene}: ${P.blocks.length} blocks · ${coastOnly.length} bounded only by the shore (no hole), area ${(coastOnly.reduce((t, a) => t + a, 0) / 1e4).toFixed(2)} ha · coast.json islands ${isl.length}, ${(isl.reduce((t, a) => t + a, 0) / 1e4).toFixed(2)} ha`)
console.log(`  smallest coast-only blocks ${coastOnly.slice(0, 5).map(a => a.toFixed(1)).join(' · ')} m² · smallest islands ${isl.slice(0, 5).join(' · ')} m²`)
// 2. ①'s water-owned contour vertices, inside the disc, against the lidar
const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
const toLocal = (lon, lat) => [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]
const Lv = waterLevels(waterRecord({ mapDir, scene, auth: authoredWater(scene), wgs84ToLocal: toLocal, zero: 0 }))
const pts = []
P.rings.forEach((r, k) => r.forEach((p, i) => { if (isW(P.labels[k][i]) && Math.hypot(p[0] - bnd.center[0], p[1] - bnd.center[1]) <= bnd.radius) pts.push(p) }))
const opened = await openRasters(elevationSpecs(mapDir), { cacheMB: 128 })
const T = 256, groups = new Map()
for (const p of pts) { const key = `${Math.floor(p[0] / T)},${Math.floor(p[1] / T)}`; (groups.get(key) || groups.set(key, []).get(key)).push(p) }
const d = []; let nv = 0
for (const [key, ps] of groups) { const [i, j] = key.split(',').map(Number), m = 4
  const win = await readWindow(opened, { cornersLL: [toLL(i * T - m, j * T - m), toLL(i * T + T + m, j * T - m), toLL(i * T - m, j * T + T + m), toLL(i * T + T + m, j * T + T + m)], stepM: null, quiet: true })
  for (const p of ps) { const v = sampleSources(win, ...toLL(p[0], p[1])); if (Number.isFinite(v)) d.push(Math.abs(v - Lv.highAt(p[0], p[1]))); else nv++ }
  win.length = 0 }
d.sort((a, b) => a - b); const q = f => d[Math.min(d.length - 1, Math.floor(f * d.length))]
console.log(`  ①'s coast contour (ε off the line), ${d.length} vertices in the disc: |lidar − ${Lv.highName}| p50 ${q(.5).toFixed(3)} · p90 ${q(.9).toFixed(3)} · p99 ${q(.99).toFixed(3)} m · ${nv} no value`)
