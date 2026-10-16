// probe.mjs <scene> <terrainDir> — Boz's overnight job 1, READ-ONLY (writes only beside itself). Where does the bed enter
// the land within a few metres of the coast? Node classes, near the served coast (shape.json __water__ runs):
//   shape-land = the node's position lies inside a tile ring of the served shape.json (the side Phase A called land)
//   bed        = the node lies in bake-terrain#waterDatum's mask (the same scanline over the same coastRings ∩ drawing),
//                minus writeBed's rock cells — the nodes writeBed overwrote. Confirmed by served − mean ≠ 0.
// And per 1 m land cell within DMAX of the coast: which of its four bilinear nodes are bed.
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { coastRings } from '../../../cartograph/coastline.mjs'
import { ringsInDrawing } from '../../../cartograph/coast-in-drawing.mjs'
import { elevationSpecs, openRasters, rasterToGrid } from '../../../cartograph/elevationSources.mjs'

const [scene, tdir] = process.argv.slice(2)
const root = new URL('../../../', import.meta.url).pathname
const data = join(root, 'cartograph/data', scene)
const tj = JSON.parse(readFileSync(join(tdir, 'terrain.json'))), tb = readFileSync(join(tdir, 'terrain.bin'))
const S = new Float32Array(tb.buffer, tb.byteOffset, tb.byteLength / 4)
const { width: W, height: H, bounds: B, baseElev } = tj
const sx = (B.maxX - B.minX) / (W - 1), sz = (B.maxZ - B.minZ) / (H - 1)
const geo = JSON.parse(readFileSync(join(data, 'geography.json')))
const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
const toLocal = (lon, lat) => [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]
const osm = JSON.parse(readFileSync(join(data, 'raw/osm.json')))
const bnd = JSON.parse(readFileSync(join(data, 'neighborhood_boundary.json')))
const a = toLocal(osm.bbox.minLon, osm.bbox.maxLat), b = toLocal(osm.bbox.maxLon, osm.bbox.minLat)
const bb = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }
const rings = ringsInDrawing(coastRings({ ground: osm.ground || {}, buildings: osm.buildings || [], center: bnd.center, discR: bnd.radius, bb }).rings || [], B).inDrawing
// the bake's mask, by its own scanline (waterDatum)
const scan = (rs, x0, z0, dx, dz, w, h) => { const m = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) { const z = z0 + dz * j, xs = []
    for (const r of rs) for (let k = 0, n = r.length; k < n; k++) { const p = r[k], q = r[(k + 1) % n]; if ((p[1] > z) === (q[1] > z)) continue; xs.push(p[0] + (z - p[1]) * (q[0] - p[0]) / (q[1] - p[1])) }
    if (xs.length < 2) continue; xs.sort((u, v) => u - v)
    for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil((xs[k] - x0) / dx)), i1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / dx)); for (let i = i0; i <= i1; i++) m[j * w + i] = 1 } }
  return m }
const mask = scan(rings, B.minX, B.minZ, sx, sz, W, H)
const shape = JSON.parse(readFileSync(join(root, 'public/baked', scene, 'shape.json')))
const ringsOf = (r) => !r?.length ? [] : typeof r[0][0] === 'number' ? [r] : r
const landRings = [], coast = []
for (const t of shape.tiles) { for (const r of ringsOf(t.ring)) if (r.length >= 3) landRings.push(r)
  for (const run of t.runs || []) if (run.skelId === '__water__' && run.poly?.length >= 2) for (let i = 0; i + 1 < run.poly.length; i++) coast.push([...run.poly[i], ...run.poly[i + 1]]) }
const land = scan(landRings, B.minX, B.minZ, sx, sz, W, H)          // node on shape-land (tile rings even-odd, as Phase A)
// coast segments binned
const CB = 20, bins = new Map(), key = (i, j) => i * 100000 + j
for (const g of coast) { const i0 = Math.floor((Math.min(g[0], g[2]) - B.minX) / CB), i1 = Math.floor((Math.max(g[0], g[2]) - B.minX) / CB), j0 = Math.floor((Math.min(g[1], g[3]) - B.minZ) / CB), j1 = Math.floor((Math.max(g[1], g[3]) - B.minZ) / CB)
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(g) } }
const sd2 = (px, pz, [ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, u = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0, qx = ax + u * dx - px, qz = az + u * dz - pz; return qx * qx + qz * qz }
const coastD = (x, z, R = 20) => { const bi = Math.floor((x - B.minX) / CB), bj = Math.floor((z - B.minZ) / CB); let d = Infinity
  for (let i = bi - 1; i <= bi + 1; i++) for (let j = bj - 1; j <= bj + 1; j++) for (const g of bins.get(key(i, j)) || []) d = Math.min(d, sd2(x, z, g)); return Math.sqrt(d) }
// the true mean (served's own producer, rasterToGrid) — served − mean is the bake's edit
const t0 = Date.now()
const opened = await openRasters(elevationSpecs(data), { cacheMB: 64 })
const { grid: mean } = await rasterToGrid(opened, { width: W, height: H, bounds: B, toLL, quiet: true })
console.log(`mean grid ${((Date.now() - t0) / 1000).toFixed(0)} s · rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`)
const q = (arr, p) => { if (!arr.length) return NaN; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const f = (v) => Number.isFinite(v) ? (Math.abs(v) < 1 ? (v * 1000).toFixed(0) + ' mm' : v.toFixed(2) + ' m') : '—'
// node classes within 15 m of the served coast
const cls = {}, edit = {}
const DN = 15
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, x = B.minX + sx * i, z = B.minZ + sz * j
  const d = coastD(x, z); if (!(d <= DN)) continue
  const c = `${land[k] ? 'shape-land' : 'shape-water'} · ${mask[k] ? 'in mask' : 'not in mask'}`
  cls[c] = (cls[c] || 0) + 1
  const e = S[k] - (mean[k] - baseElev); if (Number.isFinite(e)) (edit[c] ||= []).push(e) }
console.log(`\n${scene}: nodes within ${DN} m of the served coast, by side (shape.json) × the bake's water mask; edit = served − true mean`)
for (const c of Object.keys(cls).sort()) { const e = edit[c] || [], abs = e.map(Math.abs), nz = abs.filter(v => v > 0.001).length
  console.log(`  ${c.padEnd(28)} ${cls[c].toLocaleString().padStart(8)} nodes · edited (|e| > 1 mm) ${nz.toLocaleString().padStart(7)} · e p10/p50/p90 ${f(q(e, 0.1))} / ${f(q(e, 0.5))} / ${f(q(e, 0.9))}`) }
// 1 m land cells within 0–3.5 m and 3.5–6 m of the coast: their four bilinear nodes
const bands = [[0, 1.5], [1.5, 3.5], [3.5, 6], [6, 10]]
const T = {}; for (const bd of bands) T[bd] = { n: 0, anyBed: 0, bedNodes: [0, 0, 0, 0, 0], r2bed: [], r2none: [], waterNodeNotBed: 0 }
const cx = bnd.center[0], cz = bnd.center[1], R = bnd.radius
for (const g of coast) {}                                     // (cells enumerated per coast bin below)
const seen = new Set()
for (const [kk, segsIn] of bins) { const bi = Math.floor(kk / 100000), bj = kk % 100000
  for (let zz = B.minZ + bj * CB + 0.5; zz < B.minZ + (bj + 1) * CB; zz++) for (let xx = B.minX + bi * CB + 0.5; xx < B.minX + (bi + 1) * CB; xx++) {
    const id = `${xx},${zz}`; if (seen.has(id)) continue; seen.add(id)
    if (Math.hypot(xx - cx, zz - cz) > R) continue
    const d = coastD(xx, zz); const bd = bands.find(([u, v]) => d >= u && d < v); if (!bd) continue
    const fi = (xx - B.minX) / sx, fj = (zz - B.minZ) / sz, i0 = Math.floor(fi), j0 = Math.floor(fj); if (i0 < 0 || j0 < 0 || i0 + 1 >= W || j0 + 1 >= H) continue
    // land cell = inside a tile ring (point test)
    let inL = false; for (const r of landRings) for (let p = 0, o = r.length - 1; p < r.length; o = p++) { const A = r[p], Q = r[o]; if ((A[1] > zz) !== (Q[1] > zz) && xx < (Q[0] - A[0]) * (zz - A[1]) / (Q[1] - A[1]) + A[0]) inL = !inL }
    if (!inL) continue
    const ks = [j0 * W + i0, j0 * W + i0 + 1, (j0 + 1) * W + i0, (j0 + 1) * W + i0 + 1], tx = fi - i0, tz = fj - j0
    const w = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz]
    const t = T[bd]; t.n++
    let nb = 0, served = 0, mm = 0, ok = true
    for (let n = 0; n < 4; n++) { const k = ks[n]; if (mask[k] && Math.abs(S[k] - (mean[k] - baseElev)) > 0.001) nb++; if (!land[k] && !mask[k]) t.waterNodeNotBed++
      served += w[n] * S[k]; if (!Number.isFinite(mean[k])) ok = false; else mm += w[n] * (mean[k] - baseElev) }
    t.bedNodes[nb]++; if (nb) t.anyBed++
    if (ok) (nb ? t.r2bed : t.r2none).push(Math.abs(mm - served))
  } }
console.log(`\n${scene}: 1 m LAND cells (inside a tile ring) by distance to the served coast — how many of their 4 bilinear nodes carry the bed`)
for (const bd of bands) { const t = T[bd]
  console.log(`  ${bd[0]}–${bd[1]} m: ${t.n.toLocaleString()} cells · with a bed node ${t.anyBed.toLocaleString()} (${(100 * t.anyBed / Math.max(1, t.n)).toFixed(1)}%) · by count of bed nodes 0/1/2/3/4: ${t.bedNodes.map(v => v.toLocaleString()).join('/')}`
    + ` · |mean − served| p50/p90 with a bed node ${f(q(t.r2bed, 0.5))}/${f(q(t.r2bed, 0.9))} · without ${f(q(t.r2none, 0.5))}/${f(q(t.r2none, 0.9))}`) }
// how far inside shape-land do bed nodes reach? (shape-land ∧ mask ∧ edited)
const reach = []
for (let k = 0; k < W * H; k++) if (land[k] && mask[k] && Math.abs(S[k] - (mean[k] - baseElev)) > 0.001) reach.push(coastD(B.minX + sx * (k % W), B.minZ + sz * Math.floor(k / W), 60))
console.log(`\n  shape-land nodes the bed overwrote: ${reach.length.toLocaleString()} · their distance inside the served coast p50/p90/p99/max ${[0.5, 0.9, 0.99, 1].map(p => q(reach, p).toFixed(2)).join(' / ')} m`)
// the two coast lines: the bake's coastRings vs the served shape's __water__ runs
const ringD = []
for (const r of rings) for (const [x, z] of r) { if (Math.hypot(x - cx, z - cz) > R - 5) continue; const d = coastD(x, z, 60); ringD.push(d) }
console.log(`  coastRings vertices inside the disc: ${ringD.length.toLocaleString()} · distance to the served __water__ line p50/p90/p99 ${[0.5, 0.9, 0.99].map(p => q(ringD.filter(Number.isFinite), p).toFixed(2)).join(' / ')} m · farther than 20 m (∞) ${ringD.filter(d => !Number.isFinite(d)).length}`)
