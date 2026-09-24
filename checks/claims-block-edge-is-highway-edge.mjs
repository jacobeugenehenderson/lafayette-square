#!/usr/bin/env node
// CLAIM — A BLOCK AND THE HIGHWAY SHARE ONE EDGE (H-3 check 3, ruling b).
//
// A block beside a highway is its ② ring MINUS H (`tileGround.js`, "ONE EDGE"), so every curb vertex the
// highway owns lies ON H's boundary — no gap, no overlap, no second offset of the centreline, no max().
// Reads the FROZEN shape (`public/baked/<t>/shape.json`: `iaFull` + `iaStamp` + `runs` + the frozen
// `highway`, which is stencil-clipped exactly as the tiles are), so it judges what Measure/Section and
// the slab actually hold.
// ASSERTS
//   · every contour vertex stamped with a highway run (`run.hwy`) lies within TOL of H's boundary;
//   · the source sweeps the highway on the points ① consumes — no `WIDE_SPACING` and no `smoothChain`
//     resample of grade-separated chains survives in `tileGround.js` (`r-ssot-skeleton-geometry`).
// TOL is the Clipper grid the shape is built on (SCALE, read from tileGround.js) — two grid steps.
// Baseline, before H-3 step 3 (brief, `scratch/h3-one-edge-gap.mjs`): huron 294/1306, LS 634/1836 > 0.5 m.
//
//   node checks/claims-block-edge-is-highway-edge.mjs [scene…] [--shape=path]
//
// MUTATIONS (must go red): offset the frozen `highway` by 0.1 m in a temp shape (--shape) · restore a
// `smoothChain(s.points, …, WIDE_SPACING …)` in the grade-separated loop.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { loadSceneStencil } from '../cartograph/sceneStencil.js'

const shapeOverride = process.argv.find(a => a.startsWith('--shape='))?.slice('--shape='.length)
const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
const SCALE = +src.match(/^const SCALE = (\d+)/m)?.[1]
if (!SCALE) { console.error('⛔ NOT CHECKED — SCALE not found in tileGround.js'); process.exit(2) }
const TOL = 2 / SCALE
let red = false

// ── the source: one geometry ──
const loop = src.slice(src.indexOf('for (const s of gradeSep) {'), src.indexOf('// ── [GROUT]'))
const resample = /WIDE_SPACING|smoothChain\(/.test(loop)
console.log(`source: grade-separated chains ${resample ? '⛔ are RESAMPLED (WIDE_SPACING / smoothChain) — a second geometry' : '✅ are swept on the points ① consumes'}`)
if (resample) red = true

const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }

for (const scene of scenes('public/baked/<scene>/shape.json')) {
  const p = shapeOverride || join(ROOT, 'public/baked', scene, 'shape.json')
  if (!existsSync(p)) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — no ${p}`); red = true; continue }
  const shape = JSON.parse(readFileSync(p, 'utf8'))
  const H = (shape.highway || []).filter(r => r?.length >= 3)
  const tiles = shape.tiles || []
  const stamped = tiles.some(t => (t.runs || []).some(r => r.hwy))
  if (!H.length) { console.log(`\n── ${scene}   no highway in this town`); continue }
  if (!stamped) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — highways but no \`hwy\` stamp: frozen before H-3 step 3. Re-bake.`); red = true; continue }
  // a coarse grid over H's edges so each vertex tests only nearby segments
  const G = 20, grid = new Map(), cell = (x, y) => `${Math.floor(x / G)},${Math.floor(y / G)}`
  for (const r of H) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]
    for (let x = Math.floor(Math.min(a[0], b[0]) / G); x <= Math.floor(Math.max(a[0], b[0]) / G); x++)
      for (let y = Math.floor(Math.min(a[1], b[1]) / G); y <= Math.floor(Math.max(a[1], b[1]) / G); y++) {
        const k = `${x},${y}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([a, b]) }
  }
  const dist = (q) => { let d = Infinity
    const cx = Math.floor(q[0] / G), cy = Math.floor(q[1] / G)
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const [a, b] of grid.get(`${x},${y}`) || []) d = Math.min(d, segDist(q, a, b))
    return d }
  // ⭐ INSIDE THE STENCIL ONLY: the frozen `highway` is stencil-clipped and the tiles are not, so a vertex
  // beyond the circle has no H to lie on. The stencil is read from the scene, never restated.
  const C = loadSceneStencil(ROOT, scene)?.clipPolygon
  if (!(C?.length >= 3)) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — no stencil to judge inside`); red = true; continue }
  const inside = (q) => { let c = false; for (let i = 0, j = C.length - 1; i < C.length; j = i++) { const [xi, yi] = C[i], [xj, yj] = C[j]
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) c = !c } return c }
  let n = 0, off = 0, worst = 0
  for (const t of tiles) {
    const runs = t.runs || []
    ;(t.iaFull || []).forEach((ring, ri) => ring.forEach((q, i) => {
      const r = t.iaStamp?.[ri]?.[i]
      if (r == null || !runs[r]?.hwy || !inside(q)) return
      n++; const d = dist(q); if (d > TOL) { off++; worst = Math.max(worst, d) }
    }))
  }
  console.log(`\n── ${scene} ── ${n} highway-owned curb vertices · ${off} further than ${TOL} m from H's edge${off ? ` (worst ${worst.toFixed(2)} m)` : ''} ${off ? '⛔' : '✅'}`)
  if (off) red = true
  if (!n) { console.log(`   ⛔ a highway exists but no curb vertex is highway-owned — nothing was judged`); red = true }
}
console.log(red ? '\n⛔ A block and the highway do not share one edge — or a shape could not be judged.' : '\n✅ Every block beside a highway ends exactly on H.')
process.exit(red ? 1 : 0)
