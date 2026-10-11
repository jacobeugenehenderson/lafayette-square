// walk-slope.mjs — BRIEF-the-ground-knows-its-height §4.2/§4.3, READ-ONLY.
// For every triangle of the baked ped bands (sidewalk · curb · treelawn:*), the RENDERED plane's slope at exag = 1:
// per-vertex height = terrain raw (the runtime's patchTerrain perVertex) + the mesh's own y (kerbLift), linear across
// the triangle, exactly as the GPU draws it. Decomposed against the owning curb-ring run (shape.json tile.runs:
// skelId · side · segOrd) into ACROSS (∥ ring normal) and ALONG (∥ ring tangent). Also the same decomposition of the
// terrain FIELD's own gradient at the centroid (bilinear on the 5 m grid), so mesh-coarseness vs terrain can be split.
// Cross-slope scales linearly with the exaggeration (the y part does not); figures are per unit exag.
// Usage: node scratch/ground-height/walk-slope.mjs <scene> [--json=out.json]
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'

const scene = process.argv[2]
const jsonOut = process.argv.find(a => a.startsWith('--json='))?.slice(7)
const root = new URL('../../', import.meta.url).pathname
const slab = join(root, 'public/baked', scene)
const gj = JSON.parse(readFileSync(join(slab, 'ground.json')))
const gb = readFileSync(join(slab, 'ground.bin'))
const AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const T = loadSceneTerrain(scene)
if (!T) throw new Error(`${scene}: no terrain`)
const raw = T.getElevationRaw
const exagAuthored = T.exag

// ── tiles: iA ring point-in-polygon + run segments for the arc label ──
const tiles = shape.tiles.map((t, ti) => {
  const rings = (t.iA || []).filter(r => r && r.length >= 3)
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity
  for (const r of rings) for (const [x, z] of r) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z) }
  const segs = []
  for (const run of t.runs || []) {
    const p = run.poly || []
    for (let i = 0; i + 1 < p.length; i++) segs.push({ a: p[i], b: p[i + 1], run })
  }
  return { ti, rings, segs, bb: [minx, minz, maxx, maxz] }
}).filter(t => t.rings.length)
function pip(x, z, ring) {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c
  }
  return c
}
const CELL = 50
const grid = new Map()
for (const t of tiles) {
  for (let gx = Math.floor(t.bb[0] / CELL); gx <= Math.floor(t.bb[2] / CELL); gx++)
    for (let gz = Math.floor(t.bb[1] / CELL); gz <= Math.floor(t.bb[3] / CELL); gz++) {
      const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t)
    }
}
function ownerOf(x, z) {
  const c = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []
  for (const t of c) {
    if (x < t.bb[0] || x > t.bb[2] || z < t.bb[1] || z > t.bb[3]) continue
    // even-odd over all rings of iA (outer + holes)
    let inside = false
    for (const r of t.rings) if (pip(x, z, r)) inside = !inside
    if (inside) return t
  }
  return null
}
function nearestSeg(t, x, z) {
  let best = null, bd = Infinity
  for (const s of t.segs) {
    const [ax, az] = s.a, [bx, bz] = s.b
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
    if (L2 < 1e-9) continue
    let u = ((x - ax) * dx + (z - az) * dz) / L2; u = Math.max(0, Math.min(1, u))
    const px = ax + u * dx, pz = az + u * dz, d = Math.hypot(x - px, z - pz)
    if (d < bd) { bd = d; best = { s, u, d, tx: dx / Math.sqrt(L2), tz: dz / Math.sqrt(L2) } }
  }
  return best
}

// field gradient (bilinear) by central difference at sub-cell step
function fieldGrad(x, z) {
  const h = 0.25
  return [(raw(x + h, z) - raw(x - h, z)) / (2 * h), (raw(x, z + h) - raw(x, z - h)) / (2 * h)]
}

const groups = gj.groups.filter(g => /^(sidewalk|curb|curbCut|treelawn)/.test(g.id))
const recs = []   // per triangle
let unowned = 0, unownedArea = 0
for (const g of groups) {
  const kind = g.id.startsWith('treelawn') ? 'treelawn' : g.id
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3)
  const I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  const vh = new Float64Array(g.vertexCount)
  for (let v = 0; v < g.vertexCount; v++) vh[v] = raw(P[v * 3], P[v * 3 + 2])   // terrain part (× exag)
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i], b = I[i + 1], c = I[i + 2]
    const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2]
    const e1x = bx - ax, e1z = bz - az, e2x = cx - ax, e2z = cz - az
    const det = e1x * e2z - e2x * e1z
    const area = Math.abs(det) / 2
    if (area < 1e-6) continue
    // plane gradient of the terrain part: solve [e1;e2]·g = [dh1;dh2]
    const dh1 = vh[b] - vh[a], dh2 = vh[c] - vh[a]
    const gx = (dh1 * e2z - dh2 * e1z) / det, gz = (e1x * dh2 - e2x * dh1) / det
    // the mesh's own y (kerb), unexaggerated
    const dy1 = P[b * 3 + 1] - P[a * 3 + 1], dy2 = P[c * 3 + 1] - P[a * 3 + 1]
    const yx = (dy1 * e2z - dy2 * e1z) / det, yz = (e1x * dy2 - e2x * dy1) / det
    const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3
    const t = ownerOf(mx, mz)
    if (!t) { unowned++; unownedArea += area; continue }
    const ns = nearestSeg(t, mx, mz)
    if (!ns) { unowned++; unownedArea += area; continue }
    const nx = -ns.tz, nz = ns.tx
    const [fx, fz] = fieldGrad(mx, mz)
    recs.push({
      kind, area, mx, mz, ti: t.ti,
      key: `${ns.s.run.skelId}|${ns.s.run.side}|${ns.s.run.segOrd}`,
      cross: gx * nx + gz * nz, along: gx * ns.tx + gz * ns.tz,          // rendered (terrain part), per unit exag
      ycross: yx * nx + yz * nz,                                          // the kerb y part (unexaggerated)
      fcross: fx * nx + fz * nz, falong: fx * ns.tx + fz * ns.tz,        // the field at the centroid
      dCurb: ns.d, maxEdge: Math.max(Math.hypot(e1x, e1z), Math.hypot(e2x, e2z), Math.hypot(cx - bx, cz - bz)),
    })
  }
}

function wq(arr, val, wt, qs) {   // area-weighted quantiles
  const s = arr.map(r => [Math.abs(val(r)), wt(r)]).sort((p, q) => p[0] - q[0])
  const tot = s.reduce((a, p) => a + p[1], 0)
  const out = {}; let acc = 0, k = 0
  for (const q of qs) { while (k < s.length && acc + s[k][1] < q * tot) { acc += s[k][1]; k++ } out[q] = s[Math.min(k, s.length - 1)]?.[0] ?? 0 }
  out.max = s.length ? s[s.length - 1][0] : 0
  return out
}
const pct = v => (100 * v).toFixed(2) + '%'
const THR = [['1:48 (2.08%)', 1 / 48], ['1:20 (5%)', 0.05], ['1:12 (8.33%)', 1 / 12]]
const out = { scene, exagAuthored, unowned, unownedAreaM2: +unownedArea.toFixed(1), kinds: {} }
console.log(`\n=== ${scene}  (authored exag ${exagAuthored}; figures at exag 1, scale linearly)  unowned tris ${unowned} (${unownedArea.toFixed(0)} m²)`)
for (const kind of ['sidewalk', 'curb', 'curbCut', 'treelawn']) {
  const R = recs.filter(r => r.kind === kind)
  if (!R.length) continue
  const A = R.reduce((a, r) => a + r.area, 0)
  const q = wq(R, r => r.cross, r => r.area, [0.5, 0.9, 0.99])
  const qf = wq(R, r => r.fcross, r => r.area, [0.5, 0.9, 0.99])
  const qa = wq(R, r => r.along, r => r.area, [0.5, 0.9])
  const over = THR.map(([n, v]) => [n, R.filter(r => Math.abs(r.cross) > v).reduce((a, r) => a + r.area, 0) / A])
  const overField = THR.map(([n, v]) => [n, R.filter(r => Math.abs(r.fcross) > v).reduce((a, r) => a + r.area, 0) / A])
  const qe = wq(R, r => r.maxEdge, r => r.area, [0.5, 0.9])
  const longShare = R.filter(r => r.maxEdge > 10).reduce((a, r) => a + r.area, 0) / A
  const overAuth = THR.map(([n, v]) => [n, R.filter(r => Math.abs(r.cross * exagAuthored) > v).reduce((a, r) => a + r.area, 0) / A])
  // coarseness: |rendered cross − field cross|
  const qd = wq(R, r => r.cross - r.fcross, r => r.area, [0.5, 0.9, 0.99])
  out.kinds[kind] = { tris: R.length, areaM2: +A.toFixed(0), cross: q, fieldCross: qf, along: qa, renderMinusField: qd,
    shareOverAtExag1: Object.fromEntries(over), fieldShareOverAtExag1: Object.fromEntries(overField), maxEdgeM: qe, areaShareLongestEdgeOver10m: longShare, shareOverAtAuthored: Object.fromEntries(overAuth) }
  console.log(`  ${kind.padEnd(8)} tris ${R.length}  area ${A.toFixed(0)} m²`)
  console.log(`    cross (rendered)  p50 ${pct(q[0.5])}  p90 ${pct(q[0.9])}  p99 ${pct(q[0.99])}  max ${pct(q.max)}`)
  console.log(`    cross (field)     p50 ${pct(qf[0.5])}  p90 ${pct(qf[0.9])}  p99 ${pct(qf[0.99])}  max ${pct(qf.max)}`)
  console.log(`    |rendered−field|  p50 ${pct(qd[0.5])}  p90 ${pct(qd[0.9])}  p99 ${pct(qd[0.99])}  max ${pct(qd.max)}`)
  console.log(`    along (rendered)  p50 ${pct(qa[0.5])}  p90 ${pct(qa[0.9])}  max ${pct(qa.max)}`)
  console.log(`    area share over, exag 1:        ${over.map(([n, v]) => `${n} ${pct(v)}`).join(' · ')}`)
  console.log(`    FIELD share over, exag 1:       ${overField.map(([n, v]) => `${n} ${pct(v)}`).join(' · ')}`)
  console.log(`    longest edge (area-wtd)  p50 ${qe[0.5].toFixed(1)} m  p90 ${qe[0.9].toFixed(1)} m  max ${qe.max.toFixed(0)} m · area in tris with an edge > 10 m: ${pct(longShare)}`)
  if (exagAuthored !== 1) console.log(`    area share over, exag ${exagAuthored}:      ${overAuth.map(([n, v]) => `${n} ${pct(v)}`).join(' · ')}`)
  const yc = R.filter(r => Math.abs(r.ycross) > 1e-4)
  if (yc.length) console.log(`    kerb-y cross nonzero on ${yc.length} tris`)
}

// ── stretches: sidewalk per (tile, arc) — area-weighted p90 cross, max, and the WARP (range of signed cross along it) ──
const by = new Map()
for (const r of recs.filter(r => r.kind === 'sidewalk')) {
  const k = r.ti + '#' + r.key
  if (!by.has(k)) by.set(k, []); by.get(k).push(r)
}
const stretches = []
for (const [k, R] of by) {
  const A = R.reduce((a, r) => a + r.area, 0)
  if (A < 5) continue
  const q = wq(R, r => r.cross, r => r.area, [0.5, 0.9])
  const signed = R.map(r => [r.cross, r.area]).sort((a, b) => a[0] - b[0])
  const wAt = (q) => { let acc = 0; for (const [v, w] of signed) { acc += w; if (acc >= q * A) return v } return signed[signed.length - 1][0] }
  const lo = wAt(0.05), hi = wAt(0.95)
  const fq = wq(R, r => r.fcross, r => r.area, [0.9])
  const c = R.reduce((a, r) => [a[0] + r.mx * r.area, a[1] + r.mz * r.area], [0, 0]).map(v => v / A)
  const [ti, key] = k.split('#'); const [skelId, side, segOrd] = key.split('|')
  stretches.push({ tile: +ti, skelId, side, segOrd: +segOrd, areaM2: +A.toFixed(1), p50: q[0.5], p90: q[0.9], max: q.max,
    fieldP90: fq[0.9], warp5to95: hi - lo, at: c.map(v => +v.toFixed(1)) })
}
stretches.sort((a, b) => b.p90 - a.p90)
out.stretchCount = stretches.length
out.worst = stretches.slice(0, 10)
console.log(`\n  sidewalk stretches (tile × arc, ≥5 m²): ${stretches.length}; worst ten by p90 cross:`)
for (const s of out.worst) console.log(`    tile ${String(s.tile).padStart(4)}  ${s.skelId} · ${s.side} · ${s.segOrd}  area ${s.areaM2}  p90 ${pct(s.p90)} (field ${pct(s.fieldP90)})  max ${pct(s.max)}  warp ${pct(s.warp5to95)}  at (${s.at})`)
const sq = wq(stretches, s => s.p90, () => 1, [0.5, 0.9])
console.log(`  stretch p90-cross distribution: p50 ${pct(sq[0.5])}  p90 ${pct(sq[0.9])}  max ${pct(sq.max)}`)
const wqq = wq(stretches, s => s.warp5to95, () => 1, [0.5, 0.9])
console.log(`  stretch warp (5–95% range of signed cross): p50 ${pct(wqq[0.5])}  p90 ${pct(wqq[0.9])}  max ${pct(wqq.max)}`)
out.stretchP90 = sq; out.stretchWarp = wqq
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1))
