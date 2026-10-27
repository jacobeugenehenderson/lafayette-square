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
//   7. ISLANDS (a hole in ①'s water, Jacob 2026-10-26): around an island in open water the field meets HIGH on its shore
//      and no island node is lowered; an island in a narrow arm, with no bed of its own two to four cells out, takes the
//      slope of the water holding it, RECORDED (slopeFrom); an island inside no water ring REFUSES;
//   5. per town whose terrain.json carries `stamp`: the field along ①'s coast (from map.json), sampled where the stamp
//      ran, meets HIGH; the largest miss is printed against the field's cell. NOT CHECKED until a terrain carries it.
// MUTANTS (each RED): the stamp dropped · landward min instead of max · the crossed seaward nodes take min(bed, ramp) ·
// the tidal cap dropped · the wall's reflection dropped · the tide's extension takes the pure ramp (a trench) · the mask
// filled per ring (an island read as water) · the island's borrowed slope dropped (it refuses) · the nearest search
// stopping at the first radius with a hit, or at the first hit in scan order.
//
//   node checks/claims-the-shore-meets-the-field-at-high.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { stampCoast, deckHeights, nearestCrossed } from '../cartograph/shoreStamp.mjs'
import { waterWithoutDecks } from '../cartograph/structures.mjs'
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
const WALL = (x) => x >= 130 && x <= 170                       // the wall's cells and ONE cell either side: its transition
const mask = maskOf(face, W, H, B)

console.log('── 1–2. a lake: the field meets HIGH on the line, and no land is lowered')
{
  const f = field(), before = Float32Array.from(f)
  stampCoast(f, W, H, B, face, bb, mask, lake(0))
  let worst = 0, wallMiss = 0
  for (let x = 20; x <= 180; x += 0.5) { if (WALL(x)) continue; worst = Math.max(worst, Math.abs(bilinear(f, W, H, B, x, lineZ(x)) - 0)) }
  say(worst < 1e-6, `along ①'s line (the seawall apart), |field − HIGH| ≤ ${worst.toExponential(2)} m`)
  for (let x = 145; x <= 155; x += 0.5) { let dz = 0; while (dz < 10 && bilinear(f, W, H, B, x, lineZ(x) + dz) > 0) dz += 0.01; wallMiss = Math.max(wallMiss, dz) }
  say(wallMiss <= 1, `at the seawall the land stands (never lowered) and the HIGH contour sits ${wallMiss.toFixed(2)} m seaward of the line (the wall's rise reflected; ≤ 1 m)`)
  let ends = 0; for (const x of [130, 132.5, 167.5, 170]) ends = Math.max(ends, Math.abs(bilinear(f, W, H, B, x, lineZ(x))))
  console.log(`     (printed, not gated: the wall's END cells, where a lowered water node is shared with the next cell, miss HIGH by ≤ ${ends.toFixed(3)} m)`)
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
console.log('── 3b. tidal flats above the ramp keep their bed: no trench between the beach and the flats')
{
  const f = field(0.1, 0.02, 0.03)                              // the bed, with a shallow BAR (flats) 8–12 m out, above the ramp
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const d = (lineZ(i * 5) - j * 5) * 200 / Math.hypot(200, 20); if (d < -8 && d > -12) f[j * W + i] = -0.05 }
  const before = Float32Array.from(f)
  stampCoast(f, W, H, B, face, bb, mask, tide(-1, 0))
  let dug = 0, n = 0
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, d = (lineZ(i * 5) - j * 5) * 200 / Math.hypot(200, 20)
    if (d < -8 && d > -12) { n++; if (f[k] < before[k] - 1e-9) dug++ } }
  say(n > 0 && dug === 0, `in the tide's extension the higher bed stands (${dug} of ${n} nodes dug below it)`)
}
console.log('── 4. a bed that does not fall seaward refuses')
{
  let threw = false
  try { stampCoast(field(-0.2, 0.02, -0.05), W, H, B, face, bb, mask, lake(0)) } catch (e) { threw = /does not fall seaward/.test(e.message) }
  say(threw, 'a rising bed REFUSES by name')
}

{
  let threw = false
  try { waterFace({ layers: { ribbons: { protopolygon: {} } } }, 'fixture') } catch (e) { threw = /predates/.test(e.message) }
  say(threw, 'a frozen ① with no waterRings field REFUSES (never reads as no coast)')
}
console.log('── 6. a street deck is held at its land root, and the stamp meets its water edges at HIGH')
{
  // a straight shore at z = 100 (water south), the land rising from 0 at the shore; a 10 m pier from z 90 to z 150 at x 100
  const face0 = [[[0, 100], [200, 100], [200, 200], [0, 200]]], deck = [[95, 90], [105, 90], [105, 150], [95, 150]]
  const { rings: faceD } = waterWithoutDecks(face0, [], [deck])
  const mk = () => { const f = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const z = j * 5; f[j * W + i] = z <= 100 ? 0.02 * (100 - z) : -0.1 - 0.03 * (z - 100) } return f }
  const f = mk(), m = maskOf(faceD, W, H, B)
  const D = deckHeights(f, W, H, B, [{ ring: deck, streets: ['wharf-st'] }], m, lake(0), 0.10)
  const onDeck = []; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = i * 5, z = j * 5; if (x > 95 && x < 105 && z > 90 && z < 150) onDeck.push(f[j * W + i]) }
  say(D.length === 1 && onDeck.length && onDeck.every(v => Math.abs(v - D[0].rootM) < 1e-6) && D[0].rootM >= 0, `the deck is flat at its root, ${D[0]?.rootM} m ≥ HIGH, over ${onDeck.length} node(s)`)
  stampCoast(f, W, H, B, faceD, bb, m, lake(0))
  const side = Math.abs(bilinear(f, W, H, B, 105, 130) - 0), deckStands = bilinear(f, W, H, B, 100, 130)
  say(side < 0.02 && deckStands >= D[0].rootM - 1e-6, `the stamp meets the deck's water edge at HIGH (|Δ| ${side.toFixed(3)} m at its side) and the deck stands (${deckStands.toFixed(3)} m)`)
  let t = false
  try { deckHeights(mk(), W, H, B, [{ ring: [[95, 160], [105, 160], [105, 190], [95, 190]], streets: ['clear'] }], maskOf(face0, W, H, B), lake(0), 0.10) } catch (e) { t = /no land root/.test(e.message) }
  say(t, 'a deck clear of the land REFUSES (an island)')
  t = false
  { // water everywhere but two islands of land, west at 0.5 m and east at 3.0 m; a deck spans the water between them
    const westL = [[0, 20], [60, 20], [60, 80], [0, 80]], eastL = [[140, 20], [200, 20], [200, 80], [140, 80]]
    const sea = [[[0, 0], [200, 0], [200, 200], [0, 200]], [...westL].reverse(), [...eastL].reverse()]
    const g = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = i * 5, z = j * 5
      g[j * W + i] = (z >= 20 && z <= 80 && x <= 60) ? 0.5 : (z >= 20 && z <= 80 && x >= 140) ? 3.0 : -1 }
    const bridge = [[55, 45], [145, 45], [145, 55], [55, 55]]
    try { deckHeights(g, W, H, B, [{ ring: bridge, streets: ['two-roots'] }], maskOf(waterWithoutDecks(sea, [], [bridge]).rings, W, H, B), lake(0), 0.10) } catch (e) { t = /land roots at different heights/.test(e.message) } }
  say(t, 'a deck with two roots at different heights REFUSES (never interpolated)')
  t = false
  try { deckHeights(mk(), W, H, B, [{ ring: deck, streets: ['low'] }], m, lake(1), 0.10) } catch (e) { t = /below HIGH/.test(e.message) }
  say(t, 'a deck whose root stands below HIGH REFUSES')
}
console.log('── 7. islands: the stamp runs round each one')
{
  const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0)
  const wnd = (r, sg) => Math.sign(sa(r)) === sg ? r : [...r].reverse()
  // a: open water south of z = 60, an island 40 m square at x 80.3…120.3, z 110.3…150.3; its beach meets HIGH at its line
  // (as a lidar trace's does) and rises inland
  const outer = wnd([[0, 60], [200, 60], [200, 200], [0, 200]], 1), isl = wnd([[80.3, 110.3], [120.3, 110.3], [120.3, 150.3], [80.3, 150.3]], -1)
  const fc = [outer, isl], m = maskOf(fc, W, H, B)
  const f = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, x = i * 5, z = j * 5
    f[k] = m[k] ? -0.1 - 0.03 * (z - 60) : z < 60 ? 0.02 * (60 - z) : 0.02 * Math.min(x - 80.3, 120.3 - x, z - 110.3, 150.3 - z) }
  const before = Float32Array.from(f), r = stampCoast(f, W, H, B, fc, bb, m, lake(0))
  let worst = 0
  for (let u = 10; u <= 30; u += 0.5) for (const [x, z] of [[80.3 + u, 110.3], [80.3 + u, 150.3], [80.3, 110.3 + u], [120.3, 110.3 + u]]) worst = Math.max(worst, Math.abs(bilinear(f, W, H, B, x, z)))
  let lowered = 0; for (let k = 0; k < W * H; k++) if (!m[k] && f[k] < before[k] - 1e-9) lowered++
  say(r.islands === 1 && worst < 1e-6 && lowered === 0, `round an island in open water |field − HIGH| ≤ ${worst.toExponential(2)} m on its shore (two cells clear of its corners), ${lowered} island node(s) lowered (slope ${r.slopePerRing[1]}, its own)`)
  // b: an island in a 20 m arm of the water, its bed all within two cells of a shore: the holder's slope, recorded
  const arm = wnd([[0, 140], [90, 140], [90, 40], [110, 40], [110, 140], [200, 140], [200, 200], [0, 200]], 1), small = wnd([[97.8, 80], [102.8, 80], [102.8, 85], [97.8, 85]], -1)
  const fb = [arm, small], mb = maskOf(fb, W, H, B)
  const g = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, x = i * 5, z = j * 5
    g[k] = mb[k] ? -0.1 - 0.03 * Math.max(0, z - 140) - 0.02 * Math.min(Math.abs(x - 90), Math.abs(x - 110)) : 0.3 }
  let rb = null, why = ''
  try { rb = stampCoast(g, W, H, B, fb, bb, mb, lake(0)) } catch (e) { why = e.message.split('\n')[0] }
  say(rb && rb.slopeFrom[1] === 0 && rb.slopePerRing[1] === rb.slopePerRing[0], `an island with no bed of its own takes its holder's slope, recorded (slopeFrom ${rb ? JSON.stringify(rb.slopeFrom) : why})`)
  // c: an island inside no water ring refuses
  let t = false
  try { stampCoast(field(), W, H, B, [...face, wnd([[10, 10], [20, 10], [20, 20], [10, 20]], -1)], bb, mask, lake(0)) } catch (e) { t = /inside no water ring/.test(e.message) }
  say(t, 'an island inside no water ring REFUSES')
  // d: a bed node's sample goes to the NEAREST crossed node: ring 0 on the diagonal three cells out (4.24 cells), ring 1
  // straight four cells out (4.00), and ring 0 also first in scan order
  const bst = new Map([[(10 - 3) * 21 + (10 - 3), { ri: 0, crossed: true }], [10 * 21 + 14, { ri: 1, crossed: true }]])
  const nc = nearestCrossed(bst, 10, 10, 21, 21, 5, 5)
  say(nc?.ri === 1 && Math.abs(nc.dist - 20) < 1e-9, `the slope sample goes to the Euclidean nearest crossed node (ring ${nc?.ri} at ${nc?.dist?.toFixed(2)} m, not ring 0 at 21.21 m)`)
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
