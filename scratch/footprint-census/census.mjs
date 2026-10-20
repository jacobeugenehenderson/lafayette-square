// READ-ONLY census: building footprints vs the SERVED painted ground partition.
// Inputs (per town): public/baked/<town>/ground.json + ground.bin (the triangles the player draws, per group)
//                    public/baked/<town>/buildings.json + buildings.bin (footprint section, v3)
// Area: exact — each footprint clipped (Sutherland–Hodgman) by every candidate ground triangle (convex clip), XZ plane.
// Depth: for every footprint sample point lying in the street realm S = {asphalt, highway, stripe/edgeline/bikelane,
//   curb, curbCut, sidewalk, treelawn:*}, the distance to the nearest NON-S ground triangle (the property-line side).
//   Samples: footprint vertices + edge points every STEP + an interior grid at STEP. Depth resolution ~STEP/√2.
// Usage: node --max-old-space-size=4000 scratch/footprint-census/census.mjs <town>
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const town = process.argv[2]
const ROOT = new URL('../../', import.meta.url).pathname
const dir = join(ROOT, 'public/baked', town)
const STEP = 0.25, CAP = 40, CELL = 6

const gj = JSON.parse(readFileSync(join(dir, 'ground.json')))
const gb = readFileSync(join(dir, 'ground.bin'))
const gbuf = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const bj = JSON.parse(readFileSync(join(dir, 'buildings.json')))
const bb = readFileSync(join(dir, 'buildings.bin'))
const bbuf = bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength)

function classOf(g) {
  const id = g.id
  if (g.kind === 'mat') {
    if (id === 'asphalt' || id === 'stripe' || id === 'edgeline' || id === 'bikelane') return 'asphalt'
    if (id === 'highway') return 'highway'
    if (id === 'curb' || id === 'curbCut') return 'curb'
    if (id === 'sidewalk') return 'sidewalk'
    if (id.startsWith('treelawn')) return 'treelawn'
    if (id === 'alley') return 'alley'
    if (['footway', 'cycleway', 'path', 'steps'].includes(id)) return 'path'
  }
  return 'other'
}
const S_CLASSES = new Set(['asphalt', 'highway', 'curb', 'sidewalk', 'treelawn'])
const CLASSES = ['asphalt', 'highway', 'curb', 'sidewalk', 'treelawn', 'alley', 'path', 'other']
const RANK = { treelawn: 1, sidewalk: 2, curb: 3, asphalt: 4, highway: 4 }

// --- footprints ---
const fpAll = new Float32Array(bbuf, bj.footprintByteOffset, bj.footprintPointCount * 2)
const blds = bj.buildings.map(b => {
  const [s, n] = b.footprintRange
  const pts = []
  for (let i = 0; i < n; i++) pts.push([fpAll[(s + i) * 2], fpAll[(s + i) * 2 + 1]])
  return { id: b.id, src: b.id.split('-')[0], address: b.address, pts }
})
let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity
for (const b of blds) for (const [x, z] of b.pts) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z) }
bx0 -= CAP + 10; bz0 -= CAP + 10; bx1 += CAP + 10; bz1 += CAP + 10

// --- ground triangles (XZ), only those touching the building bbox ---
const tri = [] // flat: x0,z0,x1,z1,x2,z2 ; cls
const triX = [], triCls = []
const partArea = {}; let totalPartArea = 0
for (const g of gj.groups) {
  if (!g.partition) { partArea[g.kind + ':' + g.id] = 'non-partition, excluded'; continue } // overlays (water) double-cover the partition
  const cls = classOf(g)
  const pos = new Float32Array(gbuf, g.vertexByteOffset, g.vertexCount * 3)
  const idx = new Uint32Array(gbuf, g.indexByteOffset, g.indexCount)
  const allPos = pos // indices are GROUP-LOCAL (as BakedGround.jsx consumes them), not absolute as SLAB-CONTRACT §2.3 says
  let a = 0
  for (let t = 0; t < g.indexCount; t += 3) {
    const i0 = idx[t] * 3, i1 = idx[t + 1] * 3, i2 = idx[t + 2] * 3
    let x0 = allPos[i0], z0 = allPos[i0 + 2], x1 = allPos[i1], z1 = allPos[i1 + 2], x2 = allPos[i2], z2 = allPos[i2 + 2]
    const sa = ((x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0)) / 2
    a += Math.abs(sa)
    if (Math.abs(sa) < 1e-9) continue
    if (Math.max(x0, x1, x2) < bx0 || Math.min(x0, x1, x2) > bx1 || Math.max(z0, z1, z2) < bz0 || Math.min(z0, z1, z2) > bz1) continue
    if (sa < 0) { const tx = x1, tz = z1; x1 = x2; z1 = z2; x2 = tx; z2 = tz }
    triX.push(x0, z0, x1, z1, x2, z2); triCls.push(CLASSES.indexOf(cls))
  }
  partArea[g.kind + ':' + g.id] = a
  if (g.partition) totalPartArea += a
}
const T = new Float64Array(triX); const TC = Uint8Array.from(triCls); const NT = TC.length
// CSR grid
const GW = Math.ceil((bx1 - bx0) / CELL), GH = Math.ceil((bz1 - bz0) / CELL)
const cnt = new Int32Array(GW * GH + 1)
const cellRange = (t) => {
  const o = t * 6
  const minx = Math.min(T[o], T[o + 2], T[o + 4]), maxx = Math.max(T[o], T[o + 2], T[o + 4])
  const minz = Math.min(T[o + 1], T[o + 3], T[o + 5]), maxz = Math.max(T[o + 1], T[o + 3], T[o + 5])
  return [Math.max(0, Math.floor((minx - bx0) / CELL)), Math.min(GW - 1, Math.floor((maxx - bx0) / CELL)),
    Math.max(0, Math.floor((minz - bz0) / CELL)), Math.min(GH - 1, Math.floor((maxz - bz0) / CELL))]
}
for (let t = 0; t < NT; t++) { const [a, b, c, d] = cellRange(t); for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) cnt[j * GW + i + 1]++ }
for (let i = 1; i <= GW * GH; i++) cnt[i] += cnt[i - 1]
const fill = cnt.slice(0, GW * GH); const items = new Int32Array(cnt[GW * GH])
for (let t = 0; t < NT; t++) { const [a, b, c, d] = cellRange(t); for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) items[fill[j * GW + i]++] = t }

function inTri(t, x, z) {
  const o = t * 6
  const c1 = (T[o + 2] - T[o]) * (z - T[o + 1]) - (T[o + 3] - T[o + 1]) * (x - T[o])
  const c2 = (T[o + 4] - T[o + 2]) * (z - T[o + 3]) - (T[o + 5] - T[o + 3]) * (x - T[o + 2])
  const c3 = (T[o] - T[o + 4]) * (z - T[o + 5]) - (T[o + 1] - T[o + 5]) * (x - T[o + 4])
  return c1 >= -1e-9 && c2 >= -1e-9 && c3 >= -1e-9
}
function segD2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz
  let u = L > 0 ? ((px - ax) * dx + (pz - az) * dz) / L : 0; u = u < 0 ? 0 : u > 1 ? 1 : u
  const qx = ax + u * dx - px, qz = az + u * dz - pz; return qx * qx + qz * qz
}
function triDist(t, x, z) {
  if (inTri(t, x, z)) return 0
  const o = t * 6
  return Math.sqrt(Math.min(segD2(x, z, T[o], T[o + 1], T[o + 2], T[o + 3]), segD2(x, z, T[o + 2], T[o + 3], T[o + 4], T[o + 5]), segD2(x, z, T[o + 4], T[o + 5], T[o], T[o + 1])))
}
function locate(x, z) { // class index of containing triangle, -1 none
  const i = Math.floor((x - bx0) / CELL), j = Math.floor((z - bz0) / CELL)
  if (i < 0 || j < 0 || i >= GW || j >= GH) return -1
  const c = j * GW + i
  for (let k = cnt[c]; k < cnt[c + 1]; k++) { const t = items[k]; if (inTri(t, x, z)) return TC[t] }
  return -1
}
const isS = new Uint8Array(CLASSES.length); CLASSES.forEach((c, i) => { isS[i] = S_CLASSES.has(c) ? 1 : 0 })
function distNonS(x, z) {
  const ci = Math.floor((x - bx0) / CELL), cj = Math.floor((z - bz0) / CELL)
  let best = Infinity
  const R = Math.ceil(CAP / CELL) + 1
  for (let r = 0; r <= R; r++) {
    if (best <= (r - 1) * CELL) break
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue
      if (i < 0 || j < 0 || i >= GW || j >= GH) continue
      const c = j * GW + i
      for (let k = cnt[c]; k < cnt[c + 1]; k++) { const t = items[k]; if (isS[TC[t]]) continue; const d = triDist(t, x, z); if (d < best) best = d }
    }
  }
  return best > CAP ? Infinity : best
}
function clipArea(poly, t) { // S-H: subject poly clipped by CCW triangle t
  const o = t * 6
  let out = poly
  for (let e = 0; e < 3; e++) {
    const ax = T[o + e * 2], az = T[o + e * 2 + 1], bx = T[o + ((e + 1) % 3) * 2], bz = T[o + ((e + 1) % 3) * 2 + 1]
    const inp = out; out = []
    if (!inp.length) break
    const side = (p) => (bx - ax) * (p[1] - az) - (bz - az) * (p[0] - ax)
    for (let i = 0; i < inp.length; i++) {
      const P = inp[i], Q = inp[(i + 1) % inp.length], sp = side(P), sq = side(Q)
      if (sp >= 0) out.push(P)
      if ((sp >= 0) !== (sq >= 0)) { const u = sp / (sp - sq); out.push([P[0] + u * (Q[0] - P[0]), P[1] + u * (Q[1] - P[1])]) }
    }
  }
  let a = 0; for (let i = 0; i < out.length; i++) { const P = out[i], Q = out[(i + 1) % out.length]; a += P[0] * Q[1] - Q[0] * P[1] }
  return Math.abs(a) / 2
}
function pip(pts, x, z) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }

// --- assessor parcels (cartograph/data/<town>/raw/*_parcels.json) as an independent property line ---
import { readdirSync } from 'node:fs'
const rawDir = join(ROOT, 'cartograph/data', town, 'raw')
const parcelFiles = readdirSync(rawDir).filter(f => /_parcels\.json$/.test(f))
const PSEG = [], PRINGS = []
for (const f of parcelFiles) for (const p of JSON.parse(readFileSync(join(rawDir, f))).parcels || []) for (const r of p.rings || []) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  if (x1 < bx0 || x0 > bx1 || z1 < bz0 || z0 > bz1) continue
  PRINGS.push({ r, x0, z0, x1, z1 }); for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; PSEG.push(a[0], a[1], b[0], b[1]) }
}
const pGridR = new Map(), pGridS = new Map(), PC = 8
const pk = (i, j) => j * 100000 + i
PRINGS.forEach((q, k) => { for (let j = Math.floor(q.z0 / PC); j <= Math.floor(q.z1 / PC); j++) for (let i = Math.floor(q.x0 / PC); i <= Math.floor(q.x1 / PC); i++) { const key = pk(i, j); let l = pGridR.get(key); if (!l) pGridR.set(key, l = []); l.push(k) } })
for (let k = 0; k < PSEG.length / 4; k++) { const [ax, az, bx, bz] = PSEG.slice(k * 4, k * 4 + 4); for (let j = Math.floor(Math.min(az, bz) / PC); j <= Math.floor(Math.max(az, bz) / PC); j++) for (let i = Math.floor(Math.min(ax, bx) / PC); i <= Math.floor(Math.max(ax, bx) / PC); i++) { const key = pk(i, j); let l = pGridS.get(key); if (!l) pGridS.set(key, l = []); l.push(k) } }
function inParcel(x, z) { const l = pGridR.get(pk(Math.floor(x / PC), Math.floor(z / PC))) || []; for (const k of l) { const q = PRINGS[k]; if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && pip(q.r, x, z)) return true } return false }
function distParcelEdge(x, z) { const ci = Math.floor(x / PC), cj = Math.floor(z / PC); let best = Infinity; for (let r = 0; r <= Math.ceil(CAP / PC) + 1; r++) { if (best <= (r - 1) * PC) break; for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) { if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue; for (const k of pGridS.get(pk(i, j)) || []) { const d = Math.sqrt(segD2(x, z, PSEG[k * 4], PSEG[k * 4 + 1], PSEG[k * 4 + 2], PSEG[k * 4 + 3])); if (d < best) best = d } } } return best > CAP ? Infinity : best }
function measure(pts) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const seen = new Set(); const area = Object.fromEntries(CLASSES.map(c => [c, 0]))
  const i0 = Math.max(0, Math.floor((x0 - bx0) / CELL)), i1 = Math.min(GW - 1, Math.floor((x1 - bx0) / CELL))
  const j0 = Math.max(0, Math.floor((z0 - bz0) / CELL)), j1 = Math.min(GH - 1, Math.floor((z1 - bz0) / CELL))
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = j * GW + i
    for (let k = cnt[c]; k < cnt[c + 1]; k++) {
      const t = items[k]; if (seen.has(t)) continue; seen.add(t)
      const o = t * 6
      if (Math.max(T[o], T[o + 2], T[o + 4]) < x0 || Math.min(T[o], T[o + 2], T[o + 4]) > x1 || Math.max(T[o + 1], T[o + 3], T[o + 5]) < z0 || Math.min(T[o + 1], T[o + 3], T[o + 5]) > z1) continue
      const a = clipArea(pts, t); if (a > 0) area[CLASSES[TC[t]]] += a
    }
  }
  let fa = 0; for (let i = 0; i < pts.length; i++) { const P = pts[i], Q = pts[(i + 1) % pts.length]; fa += P[0] * Q[1] - Q[0] * P[1] }
  fa = Math.abs(fa) / 2
  const sArea = area.asphalt + area.highway + area.curb + area.sidewalk + area.treelawn
  let depth = 0, depthAt = null, depthCls = null, maxRank = 0, nSamp = 0, uncovered = 0, sIn = 0, sOut = 0, beyondParcel = 0
  if (sArea > 1e-4) {
    const samples = []
    for (let i = 0; i < pts.length; i++) {
      const P = pts[i], Q = pts[(i + 1) % pts.length], L = Math.hypot(Q[0] - P[0], Q[1] - P[1]), n = Math.max(1, Math.ceil(L / STEP))
      for (let s = 0; s < n; s++) samples.push([P[0] + (Q[0] - P[0]) * s / n, P[1] + (Q[1] - P[1]) * s / n])
    }
    let st = STEP; while (((x1 - x0) / st) * ((z1 - z0) / st) > 40000) st *= 1.5
    for (let x = x0 + st / 2; x < x1; x += st) for (let z = z0 + st / 2; z < z1; z += st) if (pip(pts, x, z)) samples.push([x, z])
    for (const [x, z] of samples) {
      const c = locate(x, z); nSamp++
      if (c < 0) { uncovered++; continue }
      if (!isS[c]) continue
      maxRank = Math.max(maxRank, RANK[CLASSES[c]])
      if (PRINGS.length) { if (inParcel(x, z)) sIn++; else { sOut++; const e = distParcelEdge(x, z); if (e > beyondParcel) beyondParcel = e } }
      const d = distNonS(x, z)
      if (d > depth) { depth = d; depthAt = [+x.toFixed(2), +z.toFixed(2)]; depthCls = CLASSES[c] }
    }
  }
  return ({ fpArea: +fa.toFixed(2), area: Object.fromEntries(Object.entries(area).map(([k, v]) => [k, +v.toFixed(3)])), sArea: +sArea.toFixed(3), depth: depth === Infinity ? 'gt' + CAP : +depth.toFixed(2), depthAt, depthCls, deepestClass: ['none', 'treelawn', 'sidewalk', 'curb', 'road'][maxRank], centroid: [+(pts.reduce((s, p) => s + p[0], 0) / pts.length).toFixed(1), +(pts.reduce((s, p) => s + p[1], 0) / pts.length).toFixed(1)], uncoveredSamples: uncovered, streetSamplesInParcel: sIn, streetSamplesOutsideParcel: sOut, beyondParcel: beyondParcel === Infinity ? 'gt' + CAP : +beyondParcel.toFixed(2) })
}
const results = []
for (const b of blds) { if (b.pts.length < 3) continue; results.push({ id: b.id, src: b.src, address: b.address, ...measure(b.pts) }) }
// OSM twins of each MSBF footprint (clean/map.json buildings[].joinRings — the OSM rings the prebake joined to it), measured
// against the SAME painted ground: does the hand-traced OSM outline of the same building intrude too?
const mapPath = join(ROOT, 'cartograph/data', town, 'clean/map.json')
let twinsMeasured = 0
try {
  const mb = JSON.parse(readFileSync(mapPath)).buildings || []
  const byId = new Map(results.map(r => [r.id, r]))
  for (const b of mb) {
    if (b.msbfId == null || !b.joinRings?.length) continue
    const r = byId.get('msbf-' + b.msbfId); if (!r) continue
    r.twins = b.joinRings.map((ring, k) => {
      let pts = ring.map(p => [p.x, p.z]); const a = pts[0], z = pts[pts.length - 1]
      if (pts.length > 3 && a[0] === z[0] && a[1] === z[1]) pts = pts.slice(0, -1)
      const m = measure(pts); twinsMeasured++
      return { osmId: b.twinOsmIds?.[k] ?? null, fpArea: m.fpArea, sArea: m.sArea, depth: m.depth, deepestClass: m.deepestClass, area: m.area }
    })
  }
} catch (e) { if (e.code !== 'ENOENT') throw e }
const meta = {
  town, ground: { file: `public/baked/${town}/ground.json`, version: gj.version, groundKey: gj.groundKey, mtime: statSync(join(dir, 'ground.json')).mtime.toISOString(), binBytes: gb.byteLength, groups: gj.groups.length },
  buildings: { file: `public/baked/${town}/buildings.json`, version: bj.version, count: bj.buildings.length, mtime: statSync(join(dir, 'buildings.json')).mtime.toISOString() },
  partitionAreaM2: +totalPartArea.toFixed(0), stencil: gj.stencil ? { radius: gj.stencil.radius, discArea: +(Math.PI * gj.stencil.radius ** 2).toFixed(0) } : null,
  trianglesIndexed: NT, STEP, CAP, parcelFiles, parcelRings: PRINGS.length, twinsMeasured, twinSource: twinsMeasured ? `cartograph/data/${town}/clean/map.json buildings[].joinRings` : null,
}
writeFileSync(join(ROOT, 'scratch/footprint-census', `${town}.json`), JSON.stringify({ meta, results }))
console.log(JSON.stringify(meta))
