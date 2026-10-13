// median-vs-coast.mjs — THE SHORE MEDIAN'S LIDAR LINE AGAINST THE ① COAST, and where the median and the gusset disagree.
// READ-ONLY. The ① coast is the lidar at HIGH (bake-coast); the median's other line is the lidar at the flown water,
// y = 0 (bake-shore-median's header). Between them lies the flat.
// Per station (every coast vertex of shape.json, deduped by whole run; the vertices carry the gusset record):
//   · the median's width across the line: walking the gusset's water-side normal from the station, the distance over
//     which the point stays inside the median's 'seaward' region (drawn water the lidar shows dry), in steps of STEP_M;
//     0 where the water side is not seaward at the first step (the lines touch)
//   · the same on the land side, inside 'landward' (drawn land the lidar shows wet)
// Disagreement, named and not judged: the median says the line is DRY above the flown water (seaward width > 0) while
// the gusset's ground at the line stands at or below the flown water (≤ 0), or the median says WET at the line
// (seaward 0, landward > 0) while the gusset's ground stands above it (> ABOVE_WATER_M). The gusset reads the terrain the
// slab draws (here a 5 m raster); the median reads the 1 m lidar.
// Usage: node scratch/coast/median-vs-coast.mjs <scene> <slab dir with shape.json> <shore-median.json> [out.json]
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { drawnWaterTest, drawnWaterItems } from '../../cartograph/shore-armour.mjs'

const [scene, slab, medPath, outPath] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const med = JSON.parse(readFileSync(medPath))
const G = shape.gusset
const STEP_M = 0.5, MAX_M = 400, ABOVE_WATER_M = 0.01
const wetAt = drawnWaterTest(drawnWaterItems(JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'clean/map.json'))).layers?.water))
const sea = drawnWaterTest(med.regions?.seaward || []), land = drawnWaterTest(med.regions?.landward || [])
const seen = new Set(), runs = []
for (const t of shape.tiles) for (const r of t.runs || []) {
  if (r.skelId !== '__water__' || !r.gusset) continue
  const f = JSON.stringify(r.poly), b = JSON.stringify([...r.poly].reverse()), k = f < b ? f : b
  if (!seen.has(k)) { seen.add(k); runs.push(r) }
}
const walk = (inside, x, z, nx, nz) => { let d = 0; while (d < MAX_M && inside(x + nx * (d + STEP_M), z + nz * (d + STEP_M))) d += STEP_M; return d }
const W = [], L = [], dis = []
let n = 0, noSide = 0, capped = 0
for (const r of runs) {
  const p = r.poly
  for (let i = 0; i < p.length; i++) {
    if (r.gusset.ground[i] == null) { noSide++; continue }
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], m = Math.hypot(tx, tz)
    const probe = G.stepM / 2, wl = wetAt(p[i][0] - tz / m * probe, p[i][1] + tx / m * probe)
    const nx = (wl ? -tz : tz) / m, nz = (wl ? tx : -tx) / m
    const w = walk(sea, p[i][0], p[i][1], nx, nz), l = walk(land, p[i][0], p[i][1], -nx, -nz)
    n++; W.push(w); L.push(l); if (w >= MAX_M) capped++
    const g = r.gusset.ground[i]
    if (w > 0 && g <= 0) dis.push({ at: p[i], kind: 'median dry, gusset ground ≤ flown water', seawardM: w, groundM: g })
    else if (w === 0 && l > 0 && g > ABOVE_WATER_M) dis.push({ at: p[i], kind: 'median wet, gusset ground above flown water', landwardM: l, groundM: g })
  }
}
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN }
console.log(`${scene}: ${n} coast stations with a side (${noSide} without), on ${runs.length} distinct runs · walked every ${STEP_M} m up to ${MAX_M} m`)
console.log(`  the median's lidar line (flown water) off the ① coast (HIGH), seaward: p50 ${q(W, .5)} · p90 ${q(W, .9)} · p99 ${q(W, .99)} m · ${W.filter(v => v === 0).length} stations where the lines touch · ${capped} reach ${MAX_M} m`)
console.log(`  landward (drawn land the lidar shows wet): ${L.filter(v => v > 0).length} stations · p90 of those ${q(L.filter(v => v > 0), .9)} m`)
console.log(`  median vs gusset disagree at ${dis.length} station(s):`)
const byKind = {}; for (const d of dis) byKind[d.kind] = (byKind[d.kind] || 0) + 1
for (const [k, v] of Object.entries(byKind)) console.log(`    ${v} · ${k}`)
for (const d of dis.slice(0, 8)) console.log(`    @ ${d.at.map(v => v.toFixed(1)).join(',')}: ${d.kind} (${d.seawardM != null ? 'seaward ' + d.seawardM + ' m' : 'landward ' + d.landwardM + ' m'}, ground ${d.groundM} m)`)
if (outPath) writeFileSync(outPath, JSON.stringify({ n, noSide, W, L, dis }, null, 0))
