// bake-band.mjs <scene> <terrainDir> <landW> <waterW> — BRIEF-the-shore-keeps-its-lidar Phase A step 3, a SCRATCH
// prototype of the band's bake, written only beside itself (scratch/ground-budget/shore-band/<scene>-<landW>-<waterW>/),
// so its bytes, time and peak memory are measured rather than estimated. Not the Phase B bake.
// The band: every 1 m cell within landW of a coast run on land (inside a tile ring of the served shape.json) or within
// waterW on the water side, in 32 m tiles. A tile's 1 m values come from elevationSources.mjs#rasterToGrid — the one way a
// raster becomes a grid — on a 1 m grid over the tile, and are stored as an int16 mm residual over the coarse grid
// (terrainDir's terrain.bin, bilinear, as terrainCommon#getElevationRaw reads it). A cell with no lidar is the sentinel
// −32768, counted, never filled. Cells of a tile outside the band are stored too (a dense tile) and counted apart.
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { gzipSync } from 'zlib'
import { elevationSpecs, openRasters, rasterToGrid } from '../../../cartograph/elevationSources.mjs'
import { makeElevationSampler } from '../../../src/lib/terrainCommon.js'

const [scene, tdir, LW, WW] = process.argv.slice(2)
if (!scene || !tdir || !(+LW >= 0) || !(+WW >= 0)) throw new Error('usage: bake-band.mjs <scene> <terrainDir> <landW> <waterW>')
const landW = +LW, waterW = +WW, WMAX = Math.max(landW, waterW), TILE = 32, NODATA = -32768
const t0 = Date.now()
const root = new URL('../../../', import.meta.url).pathname
const data = join(root, 'cartograph/data', scene)
const geo = JSON.parse(readFileSync(join(data, 'geography.json')))
const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
const tj = JSON.parse(readFileSync(join(tdir, 'terrain.json'))), tb = readFileSync(join(tdir, 'terrain.bin'))
const T = makeElevationSampler({ ...tj, data: new Float32Array(tb.buffer, tb.byteOffset, tb.byteLength / 4) }, 1)
const base = tj.baseElev
const shape = JSON.parse(readFileSync(join(root, 'public/baked', scene, 'shape.json')))
const ringsOf = (r) => !r?.length ? [] : typeof r[0][0] === 'number' ? [r] : r
const segs = [], landRings = []
for (const t of shape.tiles) {
  for (const r of ringsOf(t.ring)) if (r.length >= 3) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) } landRings.push([a, b, c, d, r]) }
  for (const run of t.runs || []) if (run.skelId === '__water__' && run.poly?.length >= 2) for (let i = 0; i + 1 < run.poly.length; i++) segs.push([...run.poly[i], ...run.poly[i + 1]])
}
const segD2 = (px, pz, [ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
  const u = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0
  const qx = ax + u * dx - px, qz = az + u * dz - pz; return qx * qx + qz * qz }
// tiles whose box comes within WMAX of a coast segment
const tiles = new Map()
for (const g of segs) {
  const i0 = Math.floor((Math.min(g[0], g[2]) - WMAX) / TILE), i1 = Math.floor((Math.max(g[0], g[2]) + WMAX) / TILE)
  const j0 = Math.floor((Math.min(g[1], g[3]) - WMAX) / TILE), j1 = Math.floor((Math.max(g[1], g[3]) + WMAX) / TILE)
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const key = `${i},${j}`; if (!tiles.has(key)) tiles.set(key, []); tiles.get(key).push(g) }
}
const opened = await openRasters(elevationSpecs(data), { cacheMB: 128 })
const keys = [...tiles.keys()].sort()
const out = new Int16Array(keys.length * TILE * TILE)
const index = []
let inBand = 0, inBandLand = 0, inBandWater = 0, noLidarBand = 0, outsideBand = 0, maxQ = 0, clipped = 0
const bandMask = new Uint8Array(keys.length * TILE * TILE)
const regimes = new Map(), tally = {}
for (let n = 0; n < keys.length; n++) {
  const [ti, tj2] = keys[n].split(',').map(Number), x0 = ti * TILE + 0.5, z0 = tj2 * TILE + 0.5
  const near = tiles.get(keys[n])
  const lr = landRings.filter(([a, b, c, d]) => c >= x0 - 1 && a <= x0 + TILE && d >= z0 - 1 && b <= z0 + TILE)
  const { grid, sources, counts } = await rasterToGrid(opened, { width: TILE, height: TILE, bounds: { minX: x0, maxX: x0 + TILE - 1, minZ: z0, maxZ: z0 + TILE - 1 }, toLL, block: TILE, quiet: true })
  for (const S of sources) if (S.overlapped) regimes.set(S.label, `${S.pixelM.toFixed(4)} m → ${S.regime}`)
  for (const k in counts) tally[k] = (tally[k] || 0) + counts[k]
  let any = false
  for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
    const x = x0 + i, z = z0 + j, c = n * TILE * TILE + j * TILE + i
    let d2 = Infinity; for (const g of near) { const v = segD2(x, z, g); if (v < d2) d2 = v }
    let land = false; for (const [, , , , r] of lr) for (let p = 0, q = r.length - 1; p < r.length; q = p++) { const A = r[p], Bq = r[q]
      if ((A[1] > z) !== (Bq[1] > z) && x < (Bq[0] - A[0]) * (z - A[1]) / (Bq[1] - A[1]) + A[0]) land = !land }
    const band = Math.sqrt(d2) <= (land ? landW : waterW)
    const v = grid[j * TILE + i]
    if (!Number.isFinite(v)) { out[c] = NODATA; if (band) noLidarBand++ }
    else { const r = (v - base - T.getElevationRaw(x, z)) * 1000; let q = Math.round(r)
      if (q <= NODATA || q > 32767) { clipped++; q = Math.max(NODATA + 1, Math.min(32767, q)) }
      out[c] = q; maxQ = Math.max(maxQ, Math.abs(q)) }
    if (band) { bandMask[c] = 1; inBand++; land ? inBandLand++ : inBandWater++; any = true } else outsideBand++
  }
  index.push([ti, tj2, any ? 1 : 0])
  if ((n + 1) % 500 === 0) console.log(`  tile ${n + 1}/${keys.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s · rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`)
}
// keep only tiles holding a band cell
const keep = index.map((t, n) => t[2] ? n : -1).filter(n => n >= 0)
const packed = new Int16Array(keep.length * TILE * TILE)
keep.forEach((n, m) => packed.set(out.subarray(n * TILE * TILE, (n + 1) * TILE * TILE), m * TILE * TILE))
const dir = new URL(`./${scene}-${landW}-${waterW}/`, import.meta.url).pathname
mkdirSync(dir, { recursive: true })
const binBuf = Buffer.from(packed.buffer)
const json = JSON.stringify({ scene, cellM: 1, tile: TILE, landW, waterW, residualOf: 'terrain.bin (bilinear)', unit: 'mm', noData: NODATA, tiles: keep.map(n => [index[n][0], index[n][1]]) })
writeFileSync(join(dir, 'band.bin'), binBuf); writeFileSync(join(dir, 'band.json'), json)
let outsideKept = 0; keep.forEach(n => { for (let c = n * TILE * TILE; c < (n + 1) * TILE * TILE; c++) if (!bandMask[c]) outsideKept++ })
const s = (Date.now() - t0) / 1000
console.log(`  regimes: ${[...regimes].map(([l, r]) => `${l} ${r}`).join(' · ')} · cells ${JSON.stringify(tally)}`)
console.log(`${scene} band (land ${landW} m, water ${waterW} m): ${keep.length.toLocaleString()} tiles of ${TILE}×${TILE} m · band cells ${inBand.toLocaleString()} (land ${inBandLand.toLocaleString()}, water ${inBandWater.toLocaleString()}) · no lidar in the band ${noLidarBand.toLocaleString()} · cells kept outside the band ${outsideKept.toLocaleString()}`
  + ` · band.bin ${binBuf.length.toLocaleString()} B (gzip ${gzipSync(binBuf).length.toLocaleString()} B) · band.json ${json.length.toLocaleString()} B (gzip ${gzipSync(Buffer.from(json)).length.toLocaleString()} B) · max |residual| ${(maxQ / 1000).toFixed(3)} m · clipped ${clipped} · ${s.toFixed(1)} s`)
