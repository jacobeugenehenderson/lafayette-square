// residual-by-distance.mjs — BRIEF-the-ground-stays-in-budget §3 step 5a, READ-ONLY (range reads; writes only beside itself).
// Boz's ruling (2026-10-15): no band width goes IN. The 1 m lidar's residual is measured as a function of DISTANCE from
// the nearest line, per edge kind, and the band width comes OUT (the distance where the residual falls to the open level).
// Per 1 m cell of the disc (cell centres on the integer + 0.5 lattice), two residuals:
//   r1 = lidar(1 m, level 0, bilinear) − M(x, z)   the real detail a 5 m record cannot carry
//        M = bilinear over the served grid's NODES of the TRUE mean of the 1 m cells nearest each node (its own s × s box)
//   r2 = M(x, z) − served(x, z)                    the resampling error (the served grid is an overview read, not a mean)
//        ⚠️ on cells the bake EDITS (the bed under mapped water, rockCells, the floor) r2 is the edit, not resampling;
//        those cells sit outside the tiles, so they are their own kind below and never pooled with land.
// Lines, all from the served shape.json (the named polygon; nothing asked of the street graph):
//   ① = every tile run that is not __water__ / __rim__ (streets and __highway__) · coast = __water__ runs
//   LU = the land-evidence ring edges (tile.evidenceByPiece), minus any edge lying on a run or on the rim (≤ 0.05 m:
//        the same line, painted twice). There is no separate lot line in the evidence; lot edges are not established apart.
// Kind of a cell = its NEAREST line (ties → ①, then coast, then LU), split by side: ① block (inside iA) / ① road;
// coast land (inside a tile ring) / coast water. Distance by an exact EDT on the 1 m lattice, refined to the exact
// segment distance under REFINE_M. Cells with no lidar (Provincetown's 7%) are counted as their own class, never filled.
// Usage: node --max-old-space-size=4096 residual-by-distance.mjs <scene>
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { makeElevationSampler } from '../../../src/lib/terrainCommon.js'
import { openRasters, readWindow, sampleSources } from '../../../cartograph/elevationSources.mjs'

const scene = process.argv[2]
if (!scene) throw new Error('usage: residual-by-distance.mjs <scene>')
const root = new URL('../../../', import.meta.url).pathname
const out = new URL('./', import.meta.url).pathname
const data = join(root, 'cartograph/data', scene), slab = join(root, 'public/baked', scene)
const geo = JSON.parse(readFileSync(join(data, 'geography.json')))
const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
// TERRAIN_DIR=<dir> reads that terrain.{json,bin} (a scratch bake) instead of the town's clean/ one; TAG suffixes the outputs.
const TDIR = process.env.TERRAIN_DIR || null, TAG = process.env.TAG || ''
const tj = JSON.parse(readFileSync(join(TDIR || join(data, 'clean'), 'terrain.json')))
const T = TDIR ? (() => { const b = readFileSync(join(TDIR, 'terrain.bin')); const t = { ...tj, data: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) }
  const stepM = Math.min((tj.bounds.maxX - tj.bounds.minX) / (tj.width - 1), (tj.bounds.maxZ - tj.bounds.minZ) / (tj.height - 1))
  return { ...makeElevationSampler(t, 1), stepM } })() : loadSceneTerrain(scene)
if (!T) throw new Error(`no terrain for ${scene}`)
const base = tj.baseElev, B = tj.bounds, s = T.stepM
const NW = tj.width, NH = tj.height, sx = (B.maxX - B.minX) / (NW - 1), sz = (B.maxZ - B.minZ) / (NH - 1)
const bnd = JSON.parse(readFileSync(join(data, 'neighborhood_boundary.json')))
const [CX, CZ] = bnd.center, R = bnd.radius
const urls = readFileSync(join(data, 'raw/elevation-sources.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l.startsWith('http'))
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))

const DMAX = 150, BIN = 0.5, NB = Math.ceil(DMAX / BIN) + 1          // last bin = ≥ DMAX
const CHUNK = 512, MARGIN = DMAX + 10, REFINE_M = 6, ON_LINE = 0.05
const HB = 182                                                      // |r| histogram: 0 · 30/decade from 1e-4 m to 100 m
const hbin = (a) => a < 1e-4 ? 0 : Math.min(HB - 1, 1 + Math.floor((Math.log10(a) + 4) * 30))
const KINDS = ['①-block', '①-road', 'LU', 'coast-land', 'coast-water', '①-water', 'far']   // ①-road = in a tile ring, outside iA · ①-water = outside every tile ring · far = no line within DMAX

// ── lines ────────────────────────────────────────────────────────────────────
const ringsOf = (r) => !r?.length ? [] : typeof r[0][0] === 'number' ? [r] : r
const segs = { one: [], lu: [], coast: [] }
const blockRings = [], landRings = []
let luDropped = 0, luKept = 0
const segDist2 = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
  const u = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0
  const qx = ax + u * dx - px, qz = az + u * dz - pz; return qx * qx + qz * qz }
for (const t of shape.tiles) {
  for (const r of ringsOf(t.iA)) if (r.length >= 3) blockRings.push(r)
  for (const r of ringsOf(t.ring)) if (r.length >= 3) landRings.push(r)
  const runSegs = []
  for (const run of t.runs || []) {
    const p = run.poly; if (!(p?.length >= 2)) continue
    const k = run.skelId === '__water__' ? 'coast' : run.skelId === '__rim__' ? null : 'one'
    for (let i = 0; i + 1 < p.length; i++) { const sg = [p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]]; runSegs.push(sg); if (k) segs[k].push(sg) }
  }
  const onRun = (x, z) => Math.abs(Math.hypot(x - CX, z - CZ) - R) <= ON_LINE || runSegs.some(g => segDist2(x, z, ...g) <= ON_LINE * ON_LINE)
  for (const piece of t.evidenceByPiece || []) for (const ev of piece || []) for (const r of ev.rings || []) {
    for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]
      if (a[0] === b[0] && a[1] === b[1]) continue
      if (onRun(a[0], a[1]) && onRun(b[0], b[1]) && onRun((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) { luDropped++; continue }
      segs.lu.push([a[0], a[1], b[0], b[1]]); luKept++ }
  }
}
// bucket index (32 m) per kind
const BK = 32, bkey = (i, j) => i * 100003 + j
const index = {}
for (const k of Object.keys(segs)) { const m = new Map()
  segs[k].forEach((g, n) => { const i0 = Math.floor(Math.min(g[0], g[2]) / BK), i1 = Math.floor(Math.max(g[0], g[2]) / BK), j0 = Math.floor(Math.min(g[1], g[3]) / BK), j1 = Math.floor(Math.max(g[1], g[3]) / BK)
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const q = bkey(i, j); if (!m.has(q)) m.set(q, []); m.get(q).push(n) } })
  index[k] = m }
const segsIn = (k, x0, z0, x1, z1) => { const set = new Set()
  for (let i = Math.floor(x0 / BK); i <= Math.floor(x1 / BK); i++) for (let j = Math.floor(z0 / BK); j <= Math.floor(z1 / BK); j++) for (const n of index[k].get(bkey(i, j)) || []) set.add(n)
  return [...set].map(n => segs[k][n]) }
const ringBox = (rs) => rs.map(r => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) } return [a, b, c, d, r] })
const blockBox = ringBox(blockRings), landBox = ringBox(landRings)
console.log(`${scene}: R ${R} m · grid step ${s.toFixed(4)} m · ${urls.length} lidar URL(s) · ① ${segs.one.length} segs · coast ${segs.coast.length} · LU ${luKept} kept (${luDropped} on a run or the rim, dropped)`)

// ── per-cell accumulators ───────────────────────────────────────────────────
const N = new Float64Array(KINDS.length * NB), H1 = new Float64Array(KINDS.length * NB * HB), H2 = new Float64Array(KINDS.length * NB * HB), H3 = new Float64Array(KINDS.length * NB * HB)   // H3: |lidar − served| = |r1 + r2|
// H4/N4: H3 over only the cells whose four served nodes all stand on land (a 1 m cell at the node inside a tile ring): the cells whose served value no bed node enters
const H4 = new Float64Array(KINDS.length * NB * HB), N4 = new Float64Array(KINDS.length * NB)
const S1 = new Float64Array(KINDS.length * NB)                       // Σ|r1| (m), for the share of the detail by distance
const nodeMin = [new Float32Array(NW * NH).fill(Infinity), new Float32Array(NW * NH).fill(Infinity), new Float32Array(NW * NH).fill(Infinity)] // ① · LU · coast
const SELF = +(process.env.SELF || 0), LIMIT = +(process.env.LIMIT_CHUNKS || 0); let selfN = 0, selfMax = 0, selfBadNear = 0
let cellsDisc = 0, noLidar = 0, noLidarLand = 0, noMean = 0, landCells = 0
const nodeLand = new Uint8Array(NW * NH)
const t0 = Date.now()

// Felzenszwalb 1D squared EDT in place
function edt1(f, n, d, v, z) { let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity
  const sep = (q, p) => ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p)
  for (let q = 1; q < n; q++) { let sc = sep(q, v[k]); while (sc <= z[k]) { k--; sc = sep(q, v[k]) } k++; v[k] = q; z[k] = sc; z[k + 1] = Infinity }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]] } }
function edt2(seed, W, H) { const INF = 1e12, g = new Float64Array(W * H), n = Math.max(W, H)
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  for (let i = 0; i < W; i++) { for (let j = 0; j < H; j++) f[j] = seed[j * W + i] ? 0 : INF; edt1(f, H, d, v, z); for (let j = 0; j < H; j++) g[j * W + i] = d[j] }
  for (let j = 0; j < H; j++) { for (let i = 0; i < W; i++) f[i] = g[j * W + i]; edt1(f, W, d, v, z); for (let i = 0; i < W; i++) g[j * W + i] = Math.sqrt(d[i]) }
  return g }
function fillRings(boxes, mask, X0, Z0, W, H) {  // even-odd per ring, OR across rings (cell centres)
  for (const [a, b, c, d, r] of boxes) { if (c < X0 || a > X0 + W || d < Z0 || b > Z0 + H) continue
    const tmp = new Uint8Array(W * H)
    for (let j = Math.max(0, Math.floor(b - Z0)); j <= Math.min(H - 1, Math.ceil(d - Z0)); j++) { const zc = Z0 + j + 0.5, xs = []
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [xi, zi] = r[i], [xk, zk] = r[k]; if ((zi > zc) !== (zk > zc)) xs.push(xi + (zc - zi) * (xk - xi) / (zk - zi)) }
      xs.sort((p, q) => p - q)
      for (let m = 0; m + 1 < xs.length; m += 2) for (let i = Math.max(0, Math.ceil(xs[m] - X0 - 0.5)); i <= Math.min(W - 1, Math.floor(xs[m + 1] - X0 - 0.5)); i++) tmp[j * W + i] ^= 1 }
    for (let q = 0; q < W * H; q++) if (tmp[q]) mask[q] = 1 } }

const opened = await openRasters(urls.map(u => ({ kind: 'url', ref: u })), { cacheMB: 256 })
const G0x = Math.floor(CX - R), G0z = Math.floor(CZ - R), G1x = Math.ceil(CX + R), G1z = Math.ceil(CZ + R)
const chunks = []
for (let cx = G0x; cx < G1x; cx += CHUNK) for (let cz = G0z; cz < G1z; cz += CHUNK) {
  const nx = Math.max(cx, Math.min(CX, cx + CHUNK)), nz = Math.max(cz, Math.min(CZ, cz + CHUNK))
  if (Math.hypot(nx - CX, nz - CZ) <= R) chunks.push([cx, cz]) }
let ci = 0
if (LIMIT) chunks.splice(LIMIT)
for (const [cx, cz] of chunks) {
  ci++
  const cw = Math.min(CHUNK, G1x - cx), ch = Math.min(CHUNK, G1z - cz)
  // distance window
  const X0 = cx - MARGIN, Z0 = cz - MARGIN, W = cw + 2 * MARGIN, H = ch + 2 * MARGIN
  const dist = {}, near = {}
  for (const k of ['one', 'lu', 'coast']) {
    const seed = new Uint8Array(W * H), S = segsIn(k, X0, Z0, X0 + W, Z0 + H)
    for (const g of S) { const L = Math.hypot(g[2] - g[0], g[3] - g[1]), n = Math.max(1, Math.ceil(L / 0.25))
      for (let u = 0; u <= n; u++) { const i = Math.floor(g[0] + (g[2] - g[0]) * u / n - X0), j = Math.floor(g[1] + (g[3] - g[1]) * u / n - Z0); if (i >= 0 && j >= 0 && i < W && j < H) seed[j * W + i] = 1 } }
    dist[k] = S.length ? edt2(seed, W, H) : null
    const nb = new Map()                                  // 8 m buckets over the chunk; a segment sits in every bucket its box ± REFINE_M touches
    for (const g of S) { const i0 = Math.floor((Math.min(g[0], g[2]) - REFINE_M - 1 - cx) / 8), i1 = Math.floor((Math.max(g[0], g[2]) + REFINE_M + 1 - cx) / 8), j0 = Math.floor((Math.min(g[1], g[3]) - REFINE_M - 1 - cz) / 8), j1 = Math.floor((Math.max(g[1], g[3]) + REFINE_M + 1 - cz) / 8)
      for (let i = Math.max(-1, i0); i <= Math.min(CHUNK / 8, i1); i++) for (let j = Math.max(-1, j0); j <= Math.min(CHUNK / 8, j1); j++) { const key = i * 1000 + j; if (!nb.has(key)) nb.set(key, []); nb.get(key).push(g) } }
    near[k] = nb }
  const blk = new Uint8Array(W * H), land = new Uint8Array(W * H)
  fillRings(blockBox, blk, X0, Z0, W, H); fillRings(landBox, land, X0, Z0, W, H)
  // lidar over the chunk + 1.5 grid steps + 2 m, at level 0, sampled on the 1 m lattice
  const LM = Math.ceil(1.5 * Math.max(sx, sz)) + 2, LX0 = cx - LM, LZ0 = cz - LM, LW = cw + 2 * LM, LH = ch + 2 * LM
  const Wn = await readWindow(opened, { cornersLL: [toLL(LX0, LZ0), toLL(LX0 + LW, LZ0), toLL(LX0 + LW, LZ0 + LH), toLL(LX0, LZ0 + LH)], stepM: null, quiet: true })
  const lid = new Float32Array(LW * LH)
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) { const [lo, la] = toLL(LX0 + i + 0.5, LZ0 + j + 0.5); lid[j * LW + i] = sampleSources(Wn, lo, la) - base }
  // the TRUE mean per served node: every 1 m cell to its nearest node (the node's own sx × sz box)
  const ni0 = Math.max(0, Math.floor((LX0 - B.minX) / sx)), ni1 = Math.min(NW - 1, Math.ceil((LX0 + LW - B.minX) / sx))
  const nj0 = Math.max(0, Math.floor((LZ0 - B.minZ) / sz)), nj1 = Math.min(NH - 1, Math.ceil((LZ0 + LH - B.minZ) / sz))
  const nW = ni1 - ni0 + 1, nH = nj1 - nj0 + 1, sum = new Float64Array(nW * nH), cnt = new Int32Array(nW * nH), bad = new Uint8Array(nW * nH)
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
    const x = LX0 + i + 0.5, z = LZ0 + j + 0.5, a = Math.round((x - B.minX) / sx) - ni0, b = Math.round((z - B.minZ) / sz) - nj0
    if (a < 0 || b < 0 || a >= nW || b >= nH) continue
    const v = lid[j * LW + i], q = b * nW + a; if (!Number.isFinite(v)) bad[q] = 1; else { sum[q] += v; cnt[q]++ } }
  // a node's box is whole only if it lies inside the lidar window
  const nodeWhole = (a, b) => { const x = B.minX + (a + ni0) * sx, z = B.minZ + (b + nj0) * sz
    return x - sx / 2 >= LX0 && x + sx / 2 <= LX0 + LW && z - sz / 2 >= LZ0 && z + sz / 2 <= LZ0 + LH }
  const M = (x, z) => { const gx = (x - B.minX) / sx, gz = (z - B.minZ) / sz, a = Math.floor(gx), b = Math.floor(gz), fx = gx - a, fz = gz - b
    let acc = 0; for (const [da, db, w] of [[0, 0, (1 - fx) * (1 - fz)], [1, 0, fx * (1 - fz)], [0, 1, (1 - fx) * fz], [1, 1, fx * fz]]) {
      const A = a + da - ni0, Bq = b + db - nj0; if (A < 0 || Bq < 0 || A >= nW || Bq >= nH) return NaN
      const q = Bq * nW + A; if (bad[q] || !cnt[q] || !nodeWhole(A, Bq)) return NaN; acc += w * sum[q] / cnt[q] }
    return acc }
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = cx + i + 0.5, z = cz + j + 0.5
    if (Math.hypot(x - CX, z - CZ) > R) continue
    cellsDisc++
    const L = lid[(j + LM) * LW + (i + LM)]
    const q = (j + MARGIN) * W + (i + MARGIN)
    if (land[q]) landCells++
    if (!Number.isFinite(L)) { noLidar++; if (land[q]) noLidarLand++; continue }
    const m = M(x, z); if (!Number.isFinite(m)) { noMean++; continue }
    const r1 = L - m, r2 = m - T.getElevationRaw(x, z)
    const d = {}
    for (const k of ['one', 'lu', 'coast']) { let v = dist[k] ? dist[k][q] : Infinity
      if (v < REFINE_M) { let best = Infinity; for (const g of near[k].get(Math.floor((x - cx) / 8) * 1000 + Math.floor((z - cz) / 8)) || []) best = Math.min(best, segDist2(x, z, ...g))
        if (!Number.isFinite(best)) throw new Error(`refine: no segment near (${x}, ${z}) though the EDT reads ${v.toFixed(2)} m`); v = Math.sqrt(best) }
      d[k] = v }
    if (SELF && Math.random() < SELF) for (const k of ['one', 'lu', 'coast']) { let best = Infinity; for (const g of segs[k]) best = Math.min(best, segDist2(x, z, ...g)); best = Math.sqrt(best)
      if (best < DMAX) { selfN++; const e = Math.abs(best - d[k]); if (e > selfMax) selfMax = e; if (best < REFINE_M - 1 && e > 1e-6) selfBadNear++ } }
    const node = Math.round((z - B.minZ) / sz) * NW + Math.round((x - B.minX) / sx)
    if (land[q]) nodeLand[node] = 1
    if (d.one < nodeMin[0][node]) nodeMin[0][node] = d.one; if (d.lu < nodeMin[1][node]) nodeMin[1][node] = d.lu; if (d.coast < nodeMin[2][node]) nodeMin[2][node] = d.coast
    let kind, dd
    if (!(Math.min(d.one, d.lu, d.coast) < DMAX)) { kind = 6; dd = DMAX }
    else if (d.one <= d.coast && d.one <= d.lu) { kind = blk[q] ? 0 : land[q] ? 1 : 5; dd = d.one }
    else if (d.coast <= d.lu) { kind = land[q] ? 3 : 4; dd = d.coast }
    else { kind = 2; dd = d.lu }
    const b = Math.min(NB - 1, Math.floor(dd / BIN)), kb = kind * NB + b
    N[kb]++; S1[kb] += Math.abs(r1); H1[kb * HB + hbin(Math.abs(r1))]++; H2[kb * HB + hbin(Math.abs(r2))]++; H3[kb * HB + hbin(Math.abs(r1 + r2))]++
    { const gx = Math.floor((x - B.minX) / sx), gz = Math.floor((z - B.minZ) / sz); let allLand = true
      for (const [da, db] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const nx = B.minX + (gx + da) * sx, nz = B.minZ + (gz + db) * sz
        const qi = Math.floor(nx - X0), qj = Math.floor(nz - Z0); if (qi < 0 || qj < 0 || qi >= W || qj >= H || !land[qj * W + qi]) { allLand = false; break } }
      if (allLand) { N4[kb]++; H4[kb * HB + hbin(Math.abs(r1 + r2))]++ } }
  }
  if (ci % 10 === 0 || ci === chunks.length) console.log(`  chunk ${ci}/${chunks.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s · rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`)
}
writeFileSync(join(out, `${scene}${TAG}.json`), JSON.stringify({ scene, R, step: s, DMAX, BIN, NB, HB, KINDS, cellsDisc, noLidar, noLidarLand, landCells, nodeLandCount: nodeLand.reduce((a, b) => a + b, 0), noMean, luKept, luDropped,
  N: [...N], S1: [...S1], H1: [...H1], H2: [...H2], H3: [...H3], H4: [...H4], N4: [...N4], terrainDir: TDIR, secs: (Date.now() - t0) / 1000 }))
// per-node min distance (① · LU · coast), Float32 NW×NH each, for the map's byte count at the widths (a) produces
writeFileSync(join(out, `${scene}${TAG}.nodemin.bin`), Buffer.concat([...nodeMin.map(a => Buffer.from(a.buffer)), Buffer.from(nodeLand.buffer)]))
if (SELF) console.log(`  self-check: ${selfN} brute distances · max |EDT − brute| ${selfMax.toFixed(3)} m (EDT on 1 m cell centres) · ${selfBadNear} wrong inside the exact zone (must be 0)`)
console.log(`done ${scene}: ${cellsDisc.toLocaleString()} cells in the disc · no lidar ${noLidar.toLocaleString()} · no whole mean ${noMean.toLocaleString()} · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
