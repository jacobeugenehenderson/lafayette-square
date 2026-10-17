// claims-the-shore-is-one-line.mjs — THE LAND'S EDGE ALONG THE WATER IS THE WATER'S EDGE: ONE LINE, NOT A LINE AND ITS COPY.
//
// ⭐ ONE GRID (Jacob, 2026-10-17): the kit cuts on lattice.js's grid everywhere. A shoreline drawn twice — the water ring
// and, a few millimetres off it, the land's block edge — is two lines the ground then has to weld, and it does not: Huron's
// ground refuses at a shore vertex on a face edge 4.5 mm away (2 T-junctions, mat:shore → face:underived). The copy is
// born in the POUR (`clean/map.json#layers.ribbons.protopolygon`: `waterRings` against `blocks`) and the shore median
// copies it (`shore-median.json`, which bake-ground paints as sand), so this reads both, where they are written.
//
// A TWIN is a vertex of a water ring (or a vertex of the median ON a water ring: its copy of the shoreline, never its own
// traced waterline) that lies OFF every block edge, by more than one lattice step,
// but closer than the town's lidar can tell two lines apart (the median's own `stationM`, the source's pixel). ON a block
// edge (≤ one step) is one line; farther than a pixel is a different line. Each twin is printed with its site and distance.
// Reads: lattice.js (LATTICE_M), each town's clean/map.json and its shore-median.json — never a copy of either.
//
//   node checks/claims-the-shore-is-one-line.mjs [--scene=<id> …] [--median-dir=<dir>] [--root=<checkout>]   (<dir>/<scene>/shore-median.json)
// It first judges three drawn cases (the shore ON the land's edge, 2 mm beside it, a pixel and more away) and stops RED if
// it misjudges any: no town can be GREEN until the pour draws the shore once, so the cases are its only proof it can be.
//
// ⭐ MUTATION TEST — each must turn this RED: `d > LATTICE_M` → `d > 1` (the 2 mm case passes) · `d < med.stationM` → `d < 0`
// (likewise) · `d > LATTICE_M` → `d >= 0` (the shore ON its edge fails).
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LATTICE_M } from '../src/lib/lattice.js'

const args = process.argv.slice(2)
// --root=<checkout>: the towns' data lives in the checkout that poured them (it is not in git), e.g. from a worktree
const ROOT = (args.find(a => a.startsWith('--root=')) || '').slice(7) || join(dirname(fileURLToPath(import.meta.url)), '..')
const medDir = (args.find(a => a.startsWith('--median-dir=')) || '').slice(13) || null
let scenes = args.filter(a => a.startsWith('--scene=')).map(a => a.slice(8))
if (!scenes.length) scenes = readdirSync(join(ROOT, 'cartograph', 'data')).filter(s => existsSync(join(ROOT, 'cartograph', 'data', s, 'clean', 'map.json')))

const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
function edgeIndex(rings, C) {
  const g = new Map(), key = (i, j) => i * 1000003 + j
  for (const r of rings) for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]
    for (let i = Math.floor(Math.min(a[0], b[0]) / C); i <= Math.floor(Math.max(a[0], b[0]) / C); i++)
      for (let j = Math.floor(Math.min(a[1], b[1]) / C); j <= Math.floor(Math.max(a[1], b[1]) / C); j++) { const q = key(i, j); (g.get(q) || g.set(q, []).get(q)).push([a, b]) } }
  return (p) => { let d = Infinity; const i0 = Math.floor(p[0] / C), j0 = Math.floor(p[1] / C)
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const [a, b] of g.get(key(i, j)) || []) d = Math.min(d, segD(p, a, b))
    return d }
}

const twinsOf = (rings, dist, med, onShore = () => true) => { const out = []
  for (const r of rings) for (const v of r) { if (!onShore(v)) continue; const d = dist(v); if (d > LATTICE_M && d < med.stationM) out.push({ v, d }) }
  return out }
let failed = 0, towns = 0
{ // the three drawn cases: a block [0,10]², the water's edge along x = 10 at three offsets, a 1 m pixel
  const block = [[0, 0], [10, 0], [10, 10], [0, 10]], dist = edgeIndex([block], 1), med = { stationM: 1 }
  const at = (o) => [[10 + o, 0], [20, 0], [20, 10], [10 + o, 10], [10 + o, 5]]
  for (const [o, want, what] of [[0, 0, 'the shore ON the land\'s edge'], [0.002, 3, 'the shore 2 mm beside it (its three vertices on x = 10.002)'], [1.5, 0, 'a line 1.5 m away']]) {
    const n = twinsOf([at(o)], dist, med).length
    if (n !== want) { console.log(`⛔ the check misjudges ${what}: ${n} twin vertices, expected ${want}`); failed++ } }
  if (failed) { console.log('\n⛔ RED — the check itself is wrong'); process.exit(1) }
}
for (const scene of scenes) {
  const map = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', scene, 'clean', 'map.json'), 'utf8'))
  const P = map.layers?.ribbons?.protopolygon
  const water = (P?.waterRings || []).map(r => r.map(p => [p[0], p[1]]))
  if (!water.length) continue
  const medPath = medDir ? join(medDir, scene, 'shore-median.json') : join(ROOT, 'public', 'baked', scene, 'shore-median.json')
  const med = existsSync(medPath) ? JSON.parse(readFileSync(medPath, 'utf8')) : null
  if (!med) { console.log(`⛔ ${scene}: draws water but has no shore median at ${medPath}: the source's pixel, which bounds a twin, is not on disk, so its water is NOT JUDGED`); failed++; continue }
  if (!(med.stationM > 0)) { console.log(`⛔ ${scene}: ${medPath} names no stationM (the source's pixel)`); failed++; continue }
  towns++
  const blocks = (P.blocks || []).filter(r => Array.isArray(r) && r.length >= 3)
  const dist = edgeIndex(blocks, Math.max(med.stationM, 1))
  const toWater = edgeIndex(water, Math.max(med.stationM, 1)), onWater = (v) => toWater(v) <= LATTICE_M
  const medRings = ['seaward', 'landward'].flatMap(k => (med.regions?.[k] || []).flatMap(it => [it.outer, ...(it.holes || [])]))
  for (const [name, rings, on] of [['map.json protopolygon.waterRings', water, undefined], [`${medPath.replace(ROOT + '/', '')} (its vertices on a water ring)`, medRings, onWater]]) {
    const t = twinsOf(rings, dist, med, on), n = on ? rings.reduce((u, r) => u + r.filter(on).length, 0) : rings.reduce((u, r) => u + r.length, 0)
    if (t.length) { failed++
      const h = {}; for (const { d } of t) { const b = d < 0.01 ? '≤1 cm' : d < 0.1 ? '≤10 cm' : `< ${med.stationM} m`; h[b] = (h[b] || 0) + 1 }
      console.log(`⛔ ${scene} · ${name}: ${t.length} of ${n} vertices lie a few mm–${med.stationM} m OFF the land's edge — a second line beside it (${JSON.stringify(h)})`)
      for (const { v, d } of t.sort((a, b) => a.d - b.d).slice(0, 4)) console.log(`     (${v[0]}, ${v[1]}) ${(d * 1000).toFixed(3)} mm off the nearest block edge`)
    } else console.log(`✅ ${scene} · ${name}: ${n} vertices, none beside the land's edge (on it ≤ ${LATTICE_M} m, or farther than ${med.stationM} m)`)
  }
}
if (!towns) { console.log('⛔ no town with drawn water was read — nothing was checked'); failed++ }
console.log(`\n${failed ? '⛔ RED — a shoreline is drawn twice' : '✅ GREEN — every shoreline is one line'}`)
process.exit(failed ? 1 : 0)
