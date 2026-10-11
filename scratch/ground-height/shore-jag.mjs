// shore-jag.mjs — §4.6 (2), READ-ONLY: do the shore's jags sit where the 2D edges place vertices on the 5 m terrain?
// Along the drawn shoreline (the ① coast stroke, shape.json `__water__`), every 1 m, take the DRAWN ground 0.3 m to the
// land side (barycentric over the drawn triangle, per-vertex terrain raw + mesh y — what the GPU draws at exag 1) and the
// FIELD there, against the town's HIGH and LOW (waterLevel.mjs). Reports: the drawn−field chord error vs the triangle's
// longest edge; and how often the drawn land crosses the level along the line (each crossing is the rendered waterline
// stepping over the drawn shoreline), against the same count for the field.
// Usage: node scratch/ground-height/shore-jag.mjs <scene>
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'
import { waterRuns } from '../../cartograph/shoreRuns.mjs'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
const scene = process.argv[2]
const root = new URL('../../', import.meta.url).pathname
const slab = join(root, 'public/baked', scene)
const gj = JSON.parse(readFileSync(join(slab, 'ground.json')))
const gb = readFileSync(join(slab, 'ground.bin')); const AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const T = loadSceneTerrain(scene), raw = T.getElevationRaw
const W = waterLevels(T.water)
const runs = waterRuns(shape)
// index only triangles near the shoreline
const CELL = 10, near = new Set()
for (const r of runs) for (let i = 0; i + 1 < r.length; i++) {
  const [a, b] = [r[i], r[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1])
  for (let s = 0; s <= L; s += CELL / 2) { const x = a[0] + (b[0] - a[0]) * s / Math.max(L, 1e-9), z = a[1] + (b[1] - a[1]) * s / Math.max(L, 1e-9); near.add(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) }
}
const grid = new Map()
for (const g of gj.groups) {
  if (g.partition === false && g.id !== 'water') continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) {
    const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]])
    const x0 = Math.floor(Math.min(v[0][0], v[1][0], v[2][0]) / CELL), x1 = Math.floor(Math.max(v[0][0], v[1][0], v[2][0]) / CELL)
    const z0 = Math.floor(Math.min(v[0][2], v[1][2], v[2][2]) / CELL), z1 = Math.floor(Math.max(v[0][2], v[1][2], v[2][2]) / CELL)
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 40000) {   // a huge triangle: walk only its cells that are near the shore
      for (const k of near) { const [cx, cz] = k.split(',').map(Number); if (cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push({ g: g.id, v }) } }
      continue
    }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x + ',' + z; if (!near.has(k)) continue; if (!grid.has(k)) grid.set(k, []); grid.get(k).push({ g: g.id, v }) }
  }
}
function drawnAt(x, z) {
  let hit = null
  for (const t of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
    const [a, b, c] = t.v
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2
    if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) continue
    const h = l1 * (raw(a[0], a[2]) + a[1]) + l2 * (raw(b[0], b[2]) + b[1]) + l3 * (raw(c[0], c[2]) + c[1])
    const e = Math.max(Math.hypot(a[0] - b[0], a[2] - b[2]), Math.hypot(b[0] - c[0], b[2] - c[2]), Math.hypot(c[0] - a[0], c[2] - a[2]))
    if (t.g === 'water') { hit = hit || { g: 'water', h, e }; continue }   // prefer the land group under the point
    return { g: t.g, h, e }
  }
  return hit
}
const q = (arr, ps) => { const s = [...arr].sort((a, b) => a - b); return ps.map(p => s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN) }
const f2 = v => Number.isFinite(v) ? v.toFixed(2) : String(v)
const rows = []
let noLand = 0
for (const r of runs) {
  let prev = null
  for (let i = 0; i + 1 < r.length; i++) {
    const [a, b] = [r[i], r[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue
    const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L
    for (let s = 0; s < L; s += 1) {
      const x = a[0] + tx * s, z = a[1] + tz * s
      const L1 = drawnAt(x - tz * 0.3, z + tx * 0.3), L2 = drawnAt(x + tz * 0.3, z - tx * 0.3)
      const land = [[L1, -tz, tx], [L2, tz, -tx]].find(([p]) => p && p.g !== 'water')
      if (!land) { noLand++; prev = null; continue }
      const px = x + land[1] * 0.3, pz = z + land[2] * 0.3
      const fld = raw(px, pz), hi = W.highAt(px, pz), lo = W.lowAt(px, pz)
      const row = { x, z, g: land[0].g, drawn: land[0].h, fld, e: land[0].e, hi, lo, run: prev }
      rows.push(row); prev = row
    }
  }
}
console.log(`\n=== ${scene}  stations ${rows.length} (no land beside the line: ${noLand})  levels: ${W.lowName} ${f2(W.range.low[0])}…${f2(W.range.low[1])} · ${W.highName} ${f2(W.range.high[0])}…${f2(W.range.high[1])}`)
const err = rows.map(r => Math.abs(r.drawn - r.fld))
const [e50, e90, e99] = q(err, [0.5, 0.9, 0.99])
console.log(`  drawn − field at the shore (chord error): p50 ${f2(e50)} p90 ${f2(e90)} p99 ${f2(e99)} m`)
for (const [lo, hi] of [[0, 5], [5, 10], [10, 25], [25, 100], [100, Infinity]]) {
  const R = rows.filter(r => r.e >= lo && r.e < hi); if (!R.length) continue
  const [m50, m90] = q(R.map(r => Math.abs(r.drawn - r.fld)), [0.5, 0.9])
  console.log(`    longest tri edge ${String(lo).padStart(3)}–${hi === Infinity ? '∞' : hi} m: ${String(R.length).padStart(6)} stations · |drawn−field| p50 ${f2(m50)} p90 ${f2(m90)} m`)
}
const byG = {}; for (const r of rows) byG[r.g] = (byG[r.g] || 0) + 1
console.log(`  land group at the line: ${Object.entries(byG).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
for (const [name, lvl] of [['HIGH', r => r.hi], ['LOW', r => r.lo]]) {
  const below = rows.filter(r => r.drawn < lvl(r)).length
  let flipD = 0, flipF = 0
  for (const r of rows) if (r.run) { if ((r.drawn < lvl(r)) !== (r.run.drawn < lvl(r.run))) flipD++; if ((r.fld < lvl(r)) !== (r.run.fld < lvl(r.run))) flipF++ }
  const km = rows.length / 1000
  console.log(`  at ${name}: drawn land below the water on ${(100 * below / rows.length).toFixed(1)}% of the line · the drawn land crosses the level ${(flipD / km).toFixed(1)}/km (field ${(flipF / km).toFixed(1)}/km)`)
}
