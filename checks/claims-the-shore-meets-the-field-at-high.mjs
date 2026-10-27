#!/usr/bin/env node
// CLAIM — THE FIELD MEETS ①'s COAST AT HIGH, ON THE LINE (BRIEF-the-shore-is-one-line §3 step 2b; shoreStamp.mjs#stampCoast).
//
// The shore on screen is where the water sheet meets the height field by depth test, so ①'s line is the shore only if the
// field crosses HIGH exactly there. ASSERTS, on a drawn town (a slanted straight coast; a beach above HIGH with one low
// dip; a bed that drops off at the shore), through the real stampCoast and coastFile.mjs#maskOf:
//   1. along ①'s line (away from its ends), the field's bilinear value − HIGH is 0 (to 1e-6 m);
//   2. landward, no node is ever LOWERED (a bluff above HIGH stands);
//   3. on a tidal town, the seaward ramp spans at least two cells between LOW and HIGH;
//   4. a bed that does not fall seaward REFUSES by name;
//   5. per town whose terrain.json carries `stamp`: the field along ①'s coast (from map.json), sampled where the stamp
//      ran, meets HIGH; the largest miss is printed against the field's cell. NOT CHECKED until a terrain carries it.
// MUTANTS (each RED): the stamp dropped · landward min instead of max · the crossed seaward nodes take min(bed, ramp) ·
// the tidal cap dropped.
//
//   node checks/claims-the-shore-meets-the-field-at-high.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { stampCoast } from '../cartograph/shoreStamp.mjs'
import { maskOf, waterFace } from '../cartograph/coastFile.mjs'
import { waterLevels } from '../cartograph/waterLevel.mjs'

const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
const bilinear = (f, W, H, B, x, z) => { const sx = (B.maxX - B.minX) / (W - 1), sz = (B.maxZ - B.minZ) / (H - 1)
  const fx = (x - B.minX) / sx, fz = (z - B.minZ) / sz, i = Math.min(W - 2, Math.floor(fx)), j = Math.min(H - 2, Math.floor(fz)), tx = fx - i, tz = fz - j, at = (a, b) => f[b * W + a]
  return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - tz) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * tz }
const lake = (h) => ({ tidal: false, datums: { grid: { min: [0, 0], step: [0, 0], w: 1, h: 1 }, mean: [h], uncertaintyM: null }, low: 'mean', high: 'mean' })
const tide = (lo, hi) => ({ tidal: true, datums: { grid: { min: [0, 0], step: [0, 0], w: 1, h: 1 }, MLLW: [lo], MHW: [hi], uncertaintyM: null }, low: 'MLLW', high: 'MHW' })

// the drawn town: 200 m square, 5 m cells; ①'s coast from (0, 100) to (200, 80); water south of it (z larger)
const W = 41, H = 41, B = { minX: 0, maxX: 200, minZ: 0, maxZ: 200 }, bb = { x0: 0, x1: 200, z0: 0, z1: 200 }
const A = [0, 100], C = [200, 80]
const face = [[A, C, [200, 200], [0, 200]].map(p => [p[0], p[1]])]
const lineZ = (x) => A[1] + (C[1] - A[1]) * x / 200
// the beach meets HIGH (0) at the line, as a lidar trace's line does; a DIP behind it at x 95…110; a SEAWALL at x 140…160
// (1 m above HIGH at the line); the bed drops off 0.1 m at the shore, then falls
const field = (bedDrop = 0.1, beachSlope = 0.02, bedSlope = 0.03) => { const f = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = i * 5, z = j * 5, d = (lineZ(x) - z) * 200 / Math.hypot(200, 20)   // + landward (north)
    f[j * W + i] = d >= 0 ? (x > 95 && x < 110 && d < 20 ? -0.4 : x >= 140 && x <= 160 ? 1.0 : beachSlope * d) : -bedDrop - bedSlope * -d } return f }
const WALL = (x) => x >= 135 && x <= 165
const mask = maskOf(face, W, H, B)

console.log('── 1–2. a lake: the field meets HIGH on the line, and no land is lowered')
{
  const f = field(), before = Float32Array.from(f)
  stampCoast(f, W, H, B, face, bb, mask, lake(0))
  let worst = 0, wallMiss = 0
  for (let x = 20; x <= 180; x += 0.5) { if (WALL(x)) continue; worst = Math.max(worst, Math.abs(bilinear(f, W, H, B, x, lineZ(x)) - 0)) }
  say(worst < 1e-6, `along ①'s line (the seawall apart), |field − HIGH| ≤ ${worst.toExponential(2)} m`)
  for (let x = 145; x <= 155; x += 0.5) { let dz = 0; while (dz < 10 && bilinear(f, W, H, B, x, lineZ(x) + dz) > 0) dz += 0.01; wallMiss = Math.max(wallMiss, dz) }
  say(wallMiss <= 5 * Math.SQRT2, `at the seawall the land stands (never lowered) and the HIGH contour sits ${wallMiss.toFixed(2)} m seaward of the line (≤ one cell)`)
  let lowered = 0; for (let k = 0; k < W * H; k++) if (!mask[k] && f[k] < before[k] - 1e-9) lowered++
  say(lowered === 0, `no landward node lowered (${lowered})`)
}
console.log('── 3. a tidal town: the ramp spans two cells between LOW and HIGH')
{
  const f = field(0.1, 0.02, 2.0)                               // a STEEP bed: without the cap the whole tide sits on one cell
  stampCoast(f, W, H, B, face, bb, mask, tide(-1, 0))
  const x = 100, z0 = lineZ(x), atLow = (() => { for (let dz = 0; dz < 50; dz += 0.05) if (bilinear(f, W, H, B, x, z0 + dz) <= -1) return dz; return Infinity })()
  say(atLow >= 2 * 5 * 0.99, `the field falls from HIGH to LOW over ${atLow.toFixed(2)} m seaward (≥ two 5 m cells)`)
}
console.log('── 4. a bed that does not fall seaward refuses')
{
  let threw = false
  try { stampCoast(field(-0.2, 0.02, -0.05), W, H, B, face, bb, mask, lake(0)) } catch (e) { threw = /does not fall seaward/.test(e.message) }
  say(threw, 'a rising bed REFUSES by name')
}

console.log('── 5. each town whose terrain carries the stamp')
let towns = 0
for (const t of readdirSync(join(ROOT, 'cartograph/data'))) {
  const tp = join(ROOT, 'cartograph/data', t, 'clean/terrain.json'), bp = join(ROOT, 'cartograph/data', t, 'clean/terrain.bin'), mp = join(ROOT, 'cartograph/data', t, 'clean/map.json')
  if (!existsSync(tp) || !existsSync(bp) || !existsSync(mp)) continue
  const tj = JSON.parse(readFileSync(tp, 'utf8'))
  if (!tj.water) continue
  if (!tj.stamp) { console.log(`  ⚠️ ${t}: NOT CHECKED — terrain.json has no stamp (baked before it; ▶ re-bake the terrain)`); continue }
  towns++
  const tb = readFileSync(bp), f = new Float32Array(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength)), L = waterLevels(tj.water)
  const st = new Uint8Array(tj.width * tj.height); for (let q = 0; q < tj.stamp.runs.length; q += 3) for (let i = tj.stamp.runs[q + 1]; i <= tj.stamp.runs[q + 2]; i++) st[tj.stamp.runs[q] * tj.width + i] = 1
  const sx = (tj.bounds.maxX - tj.bounds.minX) / (tj.width - 1), sz = (tj.bounds.maxZ - tj.bounds.minZ) / (tj.height - 1)
  let worst = 0, n = 0
  for (const ring of waterFace(JSON.parse(readFileSync(mp, 'utf8')), 'claims-the-shore-meets-the-field-at-high')) for (let m = 0; m < ring.length; m++) {
    const a = ring[m], b = ring[(m + 1) % ring.length], segs = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / sx))
    for (let u = 1; u < segs; u++) { const x = a[0] + (b[0] - a[0]) * u / segs, z = a[1] + (b[1] - a[1]) * u / segs
      const i = Math.floor((x - tj.bounds.minX) / sx), j = Math.floor((z - tj.bounds.minZ) / sz)
      if (i < 0 || j < 0 || i + 1 >= tj.width || j + 1 >= tj.height) continue
      if (![[0, 0], [1, 0], [0, 1], [1, 1]].every(([di, dj]) => st[(j + dj) * tj.width + i + di])) continue
      worst = Math.max(worst, Math.abs(bilinear(f, tj.width, tj.height, tj.bounds, x, z) - L.highAt(x, z))); n++ }
  }
  say(n > 0 && worst <= Math.min(sx, sz) * (tj.stamp.slopePerRing.reduce((m, v) => Math.max(m, v ?? 0), 0)),
    `${t}: along ①'s coast (${n.toLocaleString()} samples in stamped cells) |field − HIGH| ≤ ${worst.toFixed(4)} m (a vertex's bound: one cell × the slope)`)
}
if (!towns) console.log('  (no town carries a stamped terrain yet)')
if (bad.length) { console.log(`\n⛔ ${bad.length} claim(s) fail.`); process.exit(1) }
console.log('\n✅ The field meets ①\'s coast at HIGH, on the line.')
