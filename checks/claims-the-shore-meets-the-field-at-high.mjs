#!/usr/bin/env node
// CLAIM — THE DRAWN GROUND MEETS ①'s COAST AT HIGH, ON THE LINE, AND THE BED RAMPS TO IT (BRIEF-the-shore-is-one-line §3 step 2b;
// coastPins.mjs#pinTheCoast, shoreStamp.mjs#stampCoast).
//
// The shore on screen is where the water sheet meets the height field by depth test, so ①'s line is the shore only if the
// field crosses HIGH exactly there. ASSERTS, on a drawn town (a slanted straight coast; a beach above HIGH with one low
// dip; a bed that drops off at the shore), through the real stampCoast and coastFile.mjs#maskOf:
//   1. every SEAWARD corner of a cell ①'s line crosses (the cells found by this check's own sampling) is on the ramp
//      HIGH − s·d (to 1e-5 m);
//   2. no LANDWARD node is written at all, raised or lowered (a dip, a bluff and a seawall stand as the lidar has them;
//      the drawn line is the ground's pin, §8);
//   3. on a tidal town, the seaward ramp spans at least two cells between LOW and HIGH;
//   4. a bed that does not fall seaward REFUSES by name;
//   7. ISLANDS (a hole in ①'s water, Jacob 2026-10-26): around an island in open water the bed ramps on the island's
//      own slope and no island node is written; an island in a narrow arm, with no bed of its own two to four cells out, takes the
//      slope of the water holding it, RECORDED (slopeFrom); an island inside no water ring REFUSES; and every ring records
//      the share of its slope samples on a MEASURED floor (slopeFloorShare; null when borrowed);
//   8. THE PIN (coastPins.mjs; Jacob 2026-10-27 "yes pin the coast"): on a drawn lake with an island, in two groups sharing
//      every point, written in bake-ground's section format and read back through drawnGround.js: every point on ①'s rings is
//      pinned and the drawn ground is HIGH all along the line; beside it land ≥ HIGH and water ≤ HIGH; a polder two cells
//      from the line keeps its height (line-adjacent triangles only, never whole faces); one point takes one height in
//      every group; a street deck's edge (by its streetDecks record) is neither pinned nor clamped, but a junction where it
//      meets the real coast is pinned; a coast vertex the
//      mesh lacks, off every deck, and no deck list each REFUSE. `--mutants`: the sides swapped · no clamp · whole faces ·
//      the mesh refusal dropped · the deck exclusion dropped · a deck edge clamped · a junction left at the deck · a coast
//      vertex under a bridge's paint (Jacob 2026-10-27, (b); protopolygon.offGradeSpans) not skipped, each RED;
//   5. per town whose slab ground carries pins (ground.json `drawnRaw`): the DRAWN ground (drawnGround.js) along every edge
//      of ①'s coast is HIGH, and every line-adjacent vertex stands on its own side of HIGH (the residual). A coastal
//      ground baked before the pin is NOT CHECKED, by name. `--mutants`: HIGH read 1 cm high turns the town RED.
// MUTANTS (each RED; `--mutants` runs the marked ones on a copy of shoreStamp.mjs): the stamp dropped* · land written
// (the old landward raise)* · the crossed seaward nodes take max(bed, ramp)* · the tidal cap dropped* · the tide's
// extension takes the pure ramp (a trench)* · the mask filled per ring (an island read as water) · the island's borrowed
// slope dropped (it refuses)* · the nearest search stopping at the first hit in scan order · the floor share never counted*.
//
//   node checks/claims-the-shore-meets-the-field-at-high.mjs [--mutants]   (the mutants are loaded from copies in the OS temp dir)
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'
import { waterWithoutDecks } from '../cartograph/structures.mjs'
import { maskOf, waterFace } from '../cartograph/coastFile.mjs'
import { waterLevels } from '../cartograph/waterLevel.mjs'
import { makeDrawnGround, drawnRawOf, predatesThePin } from '../src/lib/drawnGround.js'
import { makeElevationSampler } from '../src/lib/terrainCommon.js'

// ⭐ the code under test, through ONE loader: the real module, or a mutant's copy in the OS temp dir (`--mutants`)
const STAMP_HOME = join(ROOT, 'cartograph/shoreStamp.mjs')
const PIN_HOME = join(ROOT, 'cartograph/coastPins.mjs')
const load = async (moduleUrl) => import(moduleUrl)
// each mutation's edit, set before its copy is made (the copy functions take no argument: the loader reads what they return)
const STAMP_EDIT = { a: null, b: null }, PIN_EDIT = { a: null, b: null }
const stampMutant = () => { const stampSrc = readFileSync(STAMP_HOME, 'utf8'), { a, b } = STAMP_EDIT
  if (!stampSrc.includes(a)) throw new Error(`⛔ stamp mutant target gone: ${a}`)
  const stampCopy = join(mkdtempSync(join(tmpdir(), 'stamp-')), 'shoreStamp.mjs')
  writeFileSync(stampCopy, stampSrc.replace(a, b).replace("from './waterLevel.mjs'", `from '${pathToFileURL(join(ROOT, 'cartograph/waterLevel.mjs')).href}'`))
  return pathToFileURL(stampCopy).href }
const pinMutant = () => { const pinSrc = readFileSync(PIN_HOME, 'utf8'), { a, b } = PIN_EDIT
  if (!pinSrc.includes(a)) throw new Error(`⛔ pin mutant target gone: ${a}`)
  const pinCopy = join(mkdtempSync(join(tmpdir(), 'pin-')), 'coastPins.mjs')
  writeFileSync(pinCopy, pinSrc.replace(a, b))
  return pathToFileURL(pinCopy).href }

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

async function stampSections({ stampCoast, deckHeights, nearestCrossed }, say) {
console.log('── 1–2. a lake: the bed ramps to ①\'s line, and no land is written')
{
  const f = field(), before = Float32Array.from(f)
  let r = null; try { r = stampCoast(f, W, H, B, face, bb, mask, lake(0)) } catch (e) { say(false, `the drawn lake stamps without refusing — ${e.message.split('\n')[0]}`) }
  // the cells ①'s line crosses, by this check's own sampling of the one shore segment A–C (the bb's edges carry no shore),
  // at half-steps so a node the line passes exactly through does not count the cells it only touches
  const crossed = new Set(); for (let u = 0.5; u < 4000; u++) { const x = A[0] + (C[0] - A[0]) * u / 4000, z = A[1] + (C[1] - A[1]) * u / 4000; crossed.add(`${Math.floor(x / 5)},${Math.floor(z / 5)}`) }
  const corners = new Set(); for (const c of crossed) { const [ci, cj] = c.split(',').map(Number); for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (ci + di < W && cj + dj < H) corners.add((cj + dj) * W + ci + di) }
  const dist = (k) => { const x = (k % W) * 5, z = Math.floor(k / W) * 5, dx = C[0] - A[0], dz = C[1] - A[1], u = Math.max(0, Math.min(1, ((x - A[0]) * dx + (z - A[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - A[0] - u * dx, z - A[1] - u * dz) }
  let off = 0, n = 0; if (r) for (const k of corners) if (mask[k]) { n++; if (Math.abs(f[k] - (0 - r.slopePerRing[0] * dist(k))) > 1e-5) off++ }
  say(r && n > 0 && off === 0, `every seaward corner of a crossed cell is on the ramp HIGH − s·d (${off} of ${n} off it; s ${r?.slopePerRing[0]})`)
  let land = 0; for (let k = 0; k < W * H; k++) if (!mask[k] && f[k] !== before[k]) land++
  say(land === 0, `no landward node written, not raised and not lowered: the dip and the seawall stand as the lidar has them (${land} changed)`)
  say(r?.shapes === 'bed', `the stamp's record says it shapes the bed only (shapes: ${JSON.stringify(r?.shapes)})`)
}
console.log('── 3. a tidal town: the ramp spans two cells between LOW and HIGH')
{
  const f = field(0.1, 0.02, 2.0)                               // a STEEP bed: without the cap the whole tide sits on one cell
  try { stampCoast(f, W, H, B, face, bb, mask, tide(-1, 0)) } catch (e) { say(false, `the drawn tidal town stamps without refusing — ${e.message.split('\n')[0]}`) }
  const x = 100, z0 = lineZ(x), atLow = (() => { for (let dz = 0; dz < 50; dz += 0.05) if (bilinear(f, W, H, B, x, z0 + dz) <= -1) return dz; return Infinity })()
  say(atLow >= 2 * 5 * 0.99, `the field falls from HIGH to LOW over ${atLow.toFixed(2)} m seaward (≥ two 5 m cells)`)
}
console.log('── 3b. tidal flats above the ramp keep their bed: no trench between the beach and the flats')
{
  const f = field(0.1, 0.02, 0.03)                              // the bed, with a shallow BAR (flats) 8–12 m out, above the ramp
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const d = (lineZ(i * 5) - j * 5) * 200 / Math.hypot(200, 20); if (d < -8 && d > -12) f[j * W + i] = -0.05 }
  const before = Float32Array.from(f)
  try { stampCoast(f, W, H, B, face, bb, mask, tide(-1, 0)) } catch (e) { say(false, `the drawn tidal town stamps without refusing — ${e.message.split('\n')[0]}`) }
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
console.log('── 6. a street deck is held at its land root, and the stamp leaves it standing')
{
  // a straight shore at z = 100 (water south), the land rising from 0 at the shore; a 10 m pier from z 90 to z 150 at x 100
  const face0 = [[[0, 100], [200, 100], [200, 200], [0, 200]]], deck = [[95, 90], [105, 90], [105, 150], [95, 150]]
  const { rings: faceD } = waterWithoutDecks(face0, [], [deck])
  const mk = () => { const f = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const z = j * 5; f[j * W + i] = z <= 100 ? 0.02 * (100 - z) : -0.1 - 0.03 * (z - 100) } return f }
  const f = mk(), m = maskOf(faceD, W, H, B)
  const D = deckHeights(f, W, H, B, [{ ring: deck, streets: ['wharf-st'] }], m, lake(0), 0.10)
  const onDeck = []; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = i * 5, z = j * 5; if (x > 95 && x < 105 && z > 90 && z < 150) onDeck.push(f[j * W + i]) }
  say(D.length === 1 && onDeck.length && onDeck.every(v => Math.abs(v - D[0].rootM) < 1e-6) && D[0].rootM >= 0, `the deck is flat at its root, ${D[0]?.rootM} m ≥ HIGH, over ${onDeck.length} node(s)`)
  const held = Float32Array.from(f)
  stampCoast(f, W, H, B, faceD, bb, m, lake(0))
  let moved = 0; for (let k = 0; k < W * H; k++) if (!m[k] && f[k] !== held[k]) moved++
  say(moved === 0 && bilinear(f, W, H, B, 100, 130) >= D[0].rootM - 1e-6, `the stamp leaves the held deck (and all land) as it is (${moved} land node(s) changed; the deck at ${bilinear(f, W, H, B, 100, 130).toFixed(3)} m)`)
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
  let ramp = 0, landW = 0; for (let k = 0; k < W * H; k++) { if (!m[k] && f[k] !== before[k]) landW++
    const x = (k % W) * 5, z = Math.floor(k / W) * 5; if (m[k] && f[k] !== before[k] && x > 70 && x < 131 && z > 100 && z < 161) ramp++ }
  say(r.islands === 1 && r.slopePerRing[1] > 0 && ramp > 0 && landW === 0, `round an island in open water the bed ramps on its own slope (${r.slopePerRing[1]}; ${ramp} water node(s) round it on the ramp) and no land node is written (${landW})`)
  // b: an island in a 20 m arm of the water, its bed all within two cells of a shore: the holder's slope, recorded
  const arm = wnd([[0, 140], [90, 140], [90, 40], [110, 40], [110, 140], [200, 140], [200, 200], [0, 200]], 1), small = wnd([[97.8, 80], [102.8, 80], [102.8, 85], [97.8, 85]], -1)
  const fb = [arm, small], mb = maskOf(fb, W, H, B)
  const g = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, x = i * 5, z = j * 5
    g[k] = mb[k] ? -0.1 - 0.03 * Math.max(0, z - 140) - 0.02 * Math.min(Math.abs(x - 90), Math.abs(x - 110)) : 0.3 }
  let rb = null, why = ''
  try { rb = stampCoast(g, W, H, B, fb, bb, mb, lake(0)) } catch (e) { why = e.message.split('\n')[0] }
  say(rb && rb.slopeFrom[1] === 0 && rb.slopePerRing[1] === rb.slopePerRing[0], `an island with no bed of its own takes its holder's slope, recorded (slopeFrom ${rb ? JSON.stringify(rb.slopeFrom) : why})`)
  // e: each ring says which bed its slope measured: the water east of x = 100 a measured floor, west of it the profile
  const half = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) half[k] = m[k] && (k % W) * 5 >= 100 ? 1 : 0
  const re = stampCoast(Float32Array.from(before), W, H, B, fc, bb, m, lake(0), null, half), rn = stampCoast(Float32Array.from(before), W, H, B, fc, bb, m, lake(0))
  say(re.slopeFloorShare.every(v => v > 0 && v < 1) && rn.slopeFloorShare.every(v => v === 0) && rb.slopeFloorShare[1] === null,
    `each ring records its slope's share on a measured floor (${JSON.stringify(re.slopeFloorShare)}; none given ${JSON.stringify(rn.slopeFloorShare)}; borrowed ${rb.slopeFloorShare[1]})`)
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
}
await stampSections(await load(pathToFileURL(STAMP_HOME).href), say)
console.log('── 8. the pin: the drawn ground carries ①\'s line (coastPins.mjs; Jacob 2026-10-27 "yes pin the coast")')
// a 10 m square of 1 m cells, two triangles each, in two groups that share every point (the lake's bed and the lot round
// it); ①'s water is the square 2…8 with an island 4…6 in it; the field slants through HIGH (0) at x = 5, the island's middle
// stands 1 m below HIGH (land below HIGH beside the line), and a POLDER at (0, 0), two cells from any line, stands 2 m below.
async function pinSection(mod, log) {
  const { pinTheCoast, onLineTolerance } = mod
  let red = 0; const no = (ok, what) => { log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) red++ }
  const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0)
  const wnd = (r, sg) => Math.sign(sa(r)) === sg ? r : [...r].reverse()
  const lakeR = wnd([[2, 2], [8, 2], [8, 8], [2, 8]], 1), islR = wnd([[4, 4], [6, 4], [6, 6], [4, 6]], -1)
  const fieldAt = (x, z) => x === 0 && z === 0 ? -2 : x === 5 && z === 5 ? -1 : 0.4 * (x - 5)
  const inSq = (x, z, a, b) => x > a && x < b && z > a && z < b
  const mk = () => { const g = { bed: { P: [], I: [] }, lot: { P: [], I: [] } }
    for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) for (const tri of [[[i, j], [i + 1, j], [i + 1, j + 1]], [[i, j], [i + 1, j + 1], [i, j + 1]]]) {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cz = (tri[0][1] + tri[1][1] + tri[2][1]) / 3
      const G = inSq(cx, cz, 2, 8) && !inSq(cx, cz, 4, 6) ? g.bed : g.lot
      for (const [x, z] of tri) { G.I.push(G.P.length / 3); G.P.push(x, 0, z) } }
    return Object.entries(g).map(([id, { P, I }]) => ({ id, positions: Float32Array.from(P), indices: Uint32Array.from(I) })) }
  const groups = mk(), tol = onLineTolerance(0.001, 10), inDrawing = (x, z) => x > 0 && x < 10 && z > 0 && z < 10
  const run = (o = {}) => pinTheCoast({ groups, rings: [lakeR, islR], inDrawing, rawAt: fieldAt, highAt: () => 0, tol, decks: [], spans: [], ...o })
  let R = null, why = ''
  try { R = run() } catch (e) { why = e.message }
  no(R !== null, `the drawn lake pins without refusing${why ? ` — ${why}` : ''}`)
  if (!R) return red
  // write the sections as bake-ground does and read them back through the drawn ground
  const parts = [], meta = []; let off = 0
  for (const g of groups) { parts.push(g.positions); meta.push({ g, vo: off }); off += g.positions.byteLength }
  for (const m of meta) { parts.push(m.g.indices); m.io = off; off += m.g.indices.byteLength }
  for (const m of meta) { const sec = R.sectionFor(m.g.positions); if (sec) { parts.push(sec); m.po = off; m.pc = sec.length / 4; off += sec.byteLength } }
  const bin = new ArrayBuffer(off), u8 = new Uint8Array(bin); let o2 = 0; for (const a of parts) { u8.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o2); o2 += a.byteLength }
  const manifest = { bbox: { min: [0, 0, 0], max: [10, 0, 10] }, drawnRaw: R.stats, groundShape: { terrain: true },
    groups: meta.map((m, gi) => ({ id: m.g.id, renderOrder: gi, vertexCount: m.g.positions.length / 3, vertexByteOffset: m.vo, indexCount: m.g.indices.length, indexByteOffset: m.io, ...(m.po != null ? { drawnRawByteOffset: m.po, drawnRawCount: m.pc } : {}) })) }
  const D = makeDrawnGround(manifest, bin, { rawAt: fieldAt })
  no(R.stats.pinned === 32, `every grid point on ①'s two rings is pinned (${R.stats.pinned} of 32)`)
  let onLine = 0; for (const r of [lakeR, islR]) for (let m = 0; m < 4; m++) { const a = r[m], b = r[(m + 1) % 4]
    for (let u = 0.05; u < 1; u += 0.1) onLine = Math.max(onLine, Math.abs(D.partsAt(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u).raw)) }
  no(onLine < 1e-6, `along ①'s line, between its vertices too, the drawn ground − HIGH is ${onLine.toExponential(2)} m`)
  // on the line: on an edge of either square · line-adjacent: a corner of a triangle with a corner on the line (read here
  // from the fixture's own geometry, not from the pin)
  const wet = (x, z) => inSq(x, z, 2, 8) && !inSq(x, z, 4, 6)
  const onL = (x, z) => [[2, 8], [4, 6]].some(([a, b]) => ((x === a || x === b) && z >= a && z <= b) || ((z === a || z === b) && x >= a && x <= b))
  const adj = new Set(); for (const g of groups) for (let t = 0; t < g.indices.length; t += 3) { const c = [0, 1, 2].map(q => [g.positions[g.indices[t + q] * 3], g.positions[g.indices[t + q] * 3 + 2]])
    if (c.some(([x, z]) => onL(x, z))) for (const [x, z] of c) if (!onL(x, z)) adj.add(`${x},${z}`) }
  let side = 0, n = 0, polder = null, offLine = 0
  manifest.groups.forEach((g, gi) => { const raw = drawnRawOf(manifest, g, bin, fieldAt), P = groups[gi].positions
    for (let v = 0; v < raw.length; v++) { const x = P[v * 3], z = P[v * 3 + 2]
      if (x === 0 && z === 0) polder = raw[v]
      if (onL(x, z)) continue
      if (!adj.has(`${x},${z}`)) { if (raw[v] !== fieldAt(x, z)) offLine++; continue }
      n++; if (wet(x, z) ? raw[v] > 1e-9 : raw[v] < -1e-9) side++ } })
  no(side === 0 && R.stats.clampedLand > 0 && R.stats.clampedWater > 0, `beside the line, land ≥ HIGH and water ≤ HIGH (${side} of ${n} on the wrong side; ${R.stats.clampedLand} land raised, ${R.stats.clampedWater} water lowered)`)
  no(polder === -2 && offLine === 0, `land below HIGH away from the line keeps its height (the polder ${polder} m; ${offLine} vertex(es) off the line-adjacent ring changed)`)
  // §5's own judge of a slab, on this one: it must pass the pin, and fail it wherever the pin is wrong (the mutants)
  const J = judgeDrawn(manifest, bin, [lakeR, islR], fieldAt, () => 0)
  no(J.n > 0 && J.worst <= 1e-5 && J.wrong === 0, `§5's slab judge on this ground: ${J.n} samples on the line, |drawn − HIGH| ≤ ${J.worst.toExponential(2)} m, ${J.wrong} of ${J.adj} line-adjacent vertices on the wrong side`)
  const [sb, sl] = groups.map(g => R.sectionFor(g.positions)), key = (g, sec) => new Map(Array.from({ length: sec.length / 4 }, (_, r) => { const v = new Uint32Array(sec.buffer)[r * 4]; return [`${g.positions[v * 3]},${g.positions[v * 3 + 2]}`, sec[r * 4 + 1]] }))
  const kb = key(groups[0], sb), kl = key(groups[1], sl); let differ = 0, shared = 0; for (const [k, v] of kb) if (kl.has(k)) { shared++; if (kl.get(k) !== v) differ++ }
  no(shared > 0 && differ === 0, `one point, one height in every group (${shared} shared, ${differ} differ)`)
  let t = ''; try { run({ rings: [wnd([[2, 2], [5.5, 2], [8, 2], [8, 8], [2, 8]], 1), islR] }) } catch (e) { t = e.message }
  no(/not in the mesh/.test(t), 'a coast vertex with no ground vertex on it REFUSES (the line is not in the mesh)')
  // a street deck whose edge is the lake's south shore (Boz, 2026-10-27: a deck's edge is not the high-water line)
  { let K = null, w = ''; try { K = run({ decks: [[[2, 2], [8, 2], [8, 1], [2, 1]]] }) } catch (e) { w = e.message }
    // the five points strictly inside the deck's edge are the deck's; its two ends, (2, 2) and (8, 2), also end the lake's
    // real west and east shores, so they are JUNCTIONS and pinned (Zob's read, 2026-10-27)
    const inner = K ? Array.from({ length: 5 }, (_, i) => `${3 + i},2`) : [], ends = ['2,2', '8,2']
    const ok = K && inner.every(k => !K.pins.has(k)) && ends.every(k => K.pins.has(k)) && K.stats.deckEdgeVerts === 5 && K.stats.deckJunctions === 2 && K.stats.pinned === 27
    no(ok, `a street deck's edge is neither pinned nor clamped, and where it meets the real coast the junction is pinned (${K ? `${K.stats.deckEdgeVerts} deck-edge point(s), ${K.stats.deckJunctions} junction(s), ${K.stats.pinned} pinned` : w})`) }
  t = ''; try { run({ decks: [[[2, 2], [8, 2], [8, 1], [2, 1]]], rings: [wnd([[2, 2], [8, 2], [8, 5.5], [8, 8], [2, 8]], 1), islR] }) } catch (e) { t = e.message }
  no(/not in the mesh/.test(t), 'with a deck present, a coast vertex OFF its edge that the mesh lacks still REFUSES')
  t = ''; try { run({ decks: undefined }) } catch (e) { t = e.message }
  no(/no street-deck list/.test(t), 'no deck list REFUSES (never read as none)')
  // a bridge painted across the water (Jacob, 2026-10-27, (b)): the coast vertex at (5.5, 2) is under its paint and is NOT in
  // the mesh; it is skipped and named, by the span's record. The same vertex with no span over it still refuses (above)
  { const sixRing = wnd([[2, 2], [5.5, 2], [8, 2], [8, 8], [2, 8]], 1), span = { street: 'bridge-1', ring: [[5.2, 1.5], [5.8, 1.5], [5.8, 2.5], [5.2, 2.5]] }
    let K = null, w = ''; try { K = run({ rings: [sixRing, islR], spans: [span] }) } catch (e) { w = e.message }
    no(K && K.stats.underSpan === 1 && K.stats.underSpanByStreet['bridge-1'] === 1 && K.stats.pinned === 32,
      `a coast vertex under a bridge's paint is skipped and named, by the span's record (${K ? `${K.stats.underSpan} under ${JSON.stringify(K.stats.underSpanByStreet)}, ${K.stats.pinned} pinned` : w})`)
    t = ''; try { run({ spans: undefined }) } catch (e) { t = e.message }
    no(/no off-grade span list/.test(t), 'no span list REFUSES (never read as none)') }
  return red
}
{
  const r = await pinSection(await load(pathToFileURL(PIN_HOME).href), console.log)
  if (r) bad.push(`§8 the pin: ${r} claim(s)`)
  if (process.argv.includes('--mutants')) {
    const M = [
      ['the sides swapped', 'if (wet) { if (f > H)', 'if (!wet) { if (f > H)'],
      ['no clamp beside the line', 'if (wet) { if (f > H) { raw.set(k, H); stats.clampedWater++ } else stats.keptWater++ }\n      else if (f < H) { raw.set(k, H); stats.clampedLand++ } else stats.keptLand++',
        'if (wet) { if (f > H) { stats.clampedWater++ } else stats.keptWater++ }\n      else if (f < H) { stats.clampedLand++ } else stats.keptLand++'],
      ['whole faces, not line-adjacent triangles', '    if (!isPin[gi][I[t]] && !isPin[gi][I[t + 1]] && !isPin[gi][I[t + 2]]) continue\n', ''],
      ['the line-in-the-mesh refusal dropped', '    if (missing.length) {\n      // measured', '    if (false) {\n      // measured'],
      ['the deck exclusion dropped', '      if (decks.length && onDeckEdge(x, z)) { if (deckOnly(x, z)) { deckKeys.add(keyOf(x, z)); continue } junctions.add(keyOf(x, z)) }\n', ''],
      ['a deck edge clamped', '      if (sideOf.has(k) || deckKeys.has(k)) continue', '      if (sideOf.has(k)) continue'],
      ['a junction left at the deck', 'if (deckOnly(x, z)) { deckKeys.add(keyOf(x, z)); continue }', '{ deckKeys.add(keyOf(x, z)); continue }'],
      ['a coast vertex under a span not skipped', '      if (sp) { stats.underSpan++;', '      if (false) { stats.underSpan++;'],
    ]
    let alive = 0
    for (const [name, a, b] of M) { Object.assign(PIN_EDIT, { a, b }); const q = await pinSection(await load(pinMutant()), () => {}).catch(() => 1)
      console.log(`  mutant: ${name} → ${q ? 'RED ✓' : 'GREEN ✗'}`); if (!q) alive++ }
    if (alive) bad.push(`§8: ${alive} mutant(s) survived`)
  }
}
console.log('── 5. each town\'s DRAWN ground meets ①\'s coast at HIGH (the slab, public/baked/<town>/ground.*)')
// ⭐ What the operator sees is the drawn mesh, not the field: the slab's ground read through drawnGround.js (a vertex's pin,
// else the field), sampled along every edge of ①'s waterRings inside the drawing, must be HIGH; and the side condition is
// the residual: every vertex of a triangle with a corner on the line stands on its own side of HIGH (land ≥, water ≤), so no
// line-adjacent triangle crosses HIGH except at the line. The "on the line" and "which side" here are this check's own
// geometry, not the pin's. Mutant, built in: HIGH read 1 cm high must turn the town RED.
function judgeDrawn(gj, AB, rings, rawAt, highAt) {
  const D = makeDrawnGround(gj, AB, { groups: g => !/^water(:|$)/.test(g.id) && g.partition !== false, rawAt })
  const tol = gj.drawnRaw.tolM
  const segs = []; for (const r of rings) for (let m = 0; m < r.length; m++) segs.push([r[m], r[(m + 1) % r.length]])
  const C = 16, grid = new Map(); segs.forEach(([a, b], q) => { for (let x = Math.floor((Math.min(a[0], b[0]) - tol) / C); x <= Math.floor((Math.max(a[0], b[0]) + tol) / C); x++) for (let z = Math.floor((Math.min(a[1], b[1]) - tol) / C); z <= Math.floor((Math.max(a[1], b[1]) + tol) / C); z++) { const k = x * 1048576 + z; (grid.get(k) || grid.set(k, []).get(k)).push(q) } })
  const onLine = (x, z) => (grid.get(Math.floor(x / C) * 1048576 + Math.floor(z / C)) || []).some(q => { const [a, b] = segs[q], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) <= tol })
  const inWater = (x, z) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  // exact on the line: every coast edge, sampled at its own vertices and between them, wherever the drawn ground is
  let worst = 0, worstAt = null, n = 0
  for (const [a, b] of segs) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L))
    for (let u = 0; u <= k; u++) { const x = a[0] + (b[0] - a[0]) * u / k, z = a[1] + (b[1] - a[1]) * u / k, p = D.partsAt(x, z)
      if (!p) continue
      n++; const e = Math.abs(p.raw - highAt(x, z)); if (e > worst) { worst = e; worstAt = [x, z] } } }
  // the residual: the side condition at every line-adjacent vertex
  let adj = 0, wrong = 0, wrongWorst = 0, wrongAt = null; const seen = new Set()
  for (const g of gj.groups) { if (/^water(:|$)/.test(g.id)) continue
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = drawnRawOf(gj, g, AB, rawAt)
    const on = new Uint8Array(g.vertexCount); for (let v = 0; v < g.vertexCount; v++) on[v] = onLine(P[v * 3], P[v * 3 + 2]) ? 1 : 0
    for (let t = 0; t < I.length; t += 3) { if (!on[I[t]] && !on[I[t + 1]] && !on[I[t + 2]]) continue
      for (let c = 0; c < 3; c++) { const v = I[t + c]; if (on[v]) continue
        const x = P[v * 3], z = P[v * 3 + 2], k = `${g.id}|${v}`; if (seen.has(k)) continue; seen.add(k); adj++
        const H = highAt(x, z), miss = inWater(x, z) ? R[v] - H : H - R[v]
        if (miss > 1e-6) { wrong++; if (miss > wrongWorst) { wrongWorst = miss; wrongAt = [x, z] } } } } }
  return { n, worst, worstAt, adj, wrong, wrongWorst, wrongAt }
}
let towns = 0
for (const t of readdirSync(join(ROOT, 'public/baked'))) {
  const gp = join(ROOT, 'public/baked', t, 'ground.json'), bp = join(ROOT, 'public/baked', t, 'ground.bin'), mp = join(ROOT, 'cartograph/data', t, 'clean/map.json')
  if (!existsSync(gp) || !existsSync(bp) || !existsSync(mp)) continue
  const gj = JSON.parse(readFileSync(gp, 'utf8'))
  if (predatesThePin(gj)) { const coastal = waterFace(JSON.parse(readFileSync(mp, 'utf8')), 'claims-the-shore-meets-the-field-at-high').length
    if (coastal) console.log(`  ⚠️ ${t}: NOT CHECKED — its ground predates the pin (no drawnRaw record; ▶ re-bake the ground)`); continue }
  if (!gj.drawnRaw?.pinned) continue                      // no terrain, or no coast: nothing to pin
  towns++
  const tj = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', t, 'clean/terrain.json'), 'utf8')), tb = readFileSync(join(ROOT, 'cartograph/data', t, 'clean/terrain.bin'))
  const T = makeElevationSampler({ ...tj, data: new Float32Array(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength)) }, 1), L = waterLevels(tj.water)
  const gb = readFileSync(bp), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
  const rings = waterFace(JSON.parse(readFileSync(mp, 'utf8')), 'claims-the-shore-meets-the-field-at-high')
  const r = judgeDrawn(gj, AB, rings, T.getElevationRaw, L.highAt)
  say(r.n > 0 && r.worst <= 1e-5, `${t}: along ①'s coast (${r.n.toLocaleString()} samples on the drawn ground) |drawn − HIGH| ≤ ${r.worst.toExponential(2)} m${r.worstAt ? ` (at ${r.worstAt.map(v => v.toFixed(2)).join(', ')})` : ''}`)
  say(r.wrong === 0, `${t}: beside the line, ${r.wrong.toLocaleString()} of ${r.adj.toLocaleString()} line-adjacent vertices on the wrong side of HIGH${r.wrong ? ` (worst ${r.wrongWorst.toFixed(3)} m at ${r.wrongAt.map(v => v.toFixed(2)).join(', ')})` : ''}`)
  if (process.argv.includes('--mutants')) { const m = judgeDrawn(gj, AB, rings, T.getElevationRaw, (x, z) => L.highAt(x, z) + 0.01)
    const caught = !(m.worst <= 1e-5) || m.wrong > 0; console.log(`  mutant: ${t}'s HIGH read 1 cm high → ${caught ? 'RED ✓' : 'GREEN ✗'}`); if (!caught) bad.push(`§5 mutant survived on ${t}`) }
}
if (!towns) console.log('  (no town carries a pinned ground yet)')
if (process.argv.includes('--mutants')) {
  const M = [
    ['the stamp dropped', '    if (!mask[k]) continue                                   // land', '    continue                                   // land'],
    ['land written (the old landward raise)', '    if (!mask[k]) continue                                   // land', '    // land'],
    ['the crossed seaward nodes take max(bed, ramp)', 'if (b.crossed) { normalized[k] = ramp;', 'if (b.crossed) { normalized[k] = Math.max(normalized[k], ramp);'],
    ['the tidal cap dropped', 'if (s > cap) s = cap', ''],
    ['the tide\'s extension takes the pure ramp (a trench)', 'else if (ramp > normalized[k]) { normalized[k] = ramp; ramped++; stamped[k] = 1 } else bedWon++', 'else { normalized[k] = ramp; ramped++; stamped[k] = 1 }'],
    ['the island\'s borrowed slope dropped', 'for (let ri = 0; ri < face.length; ri++) if (slopeFrom[ri] !== null) sOf[ri] = sOf[slopeFrom[ri]]', ''],
    ['the floor share never counted', 'if (floor && floor[k]) onFloor[near.ri]++', ''],
  ]
  let alive = 0
  for (const [name, a, b] of M) { Object.assign(STAMP_EDIT, { a, b }); const mod = await load(stampMutant()); let red = 0
    const out = console.log, warn = console.warn; console.log = console.warn = () => {}
    try { await stampSections(mod, (ok) => { if (!ok) red++ }) } catch { red++ } finally { console.log = out; console.warn = warn }
    console.log(`  stamp mutant: ${name} → ${red ? 'RED ✓' : 'GREEN ✗'}`); if (!red) alive++ }
  if (alive) bad.push(`the stamp: ${alive} mutant(s) survived`)
  // the deepest-bed INVARIANT cannot fire on a real stamp (shoreStamp.mjs says why), so it is shown to fire on one that
  // breaks it: the ramp sunk a hundredfold must REFUSE, by the invariant's own name
  Object.assign(STAMP_EDIT, { a: 'ramp = L.highAt(X(i), Z(j)) + sOf[b.ri] * b.d', b: 'ramp = L.highAt(X(i), Z(j)) + 100 * sOf[b.ri] * b.d' })
  const sunkMod = await load(stampMutant()), warn = console.warn, out = console.log; let refused = null
  console.log = console.warn = () => {}
  try { sunkMod.stampCoast(field(), W, H, B, face, bb, mask, lake(0)) } catch (e) { refused = e.message } finally { console.log = out; console.warn = warn }
  say(/deeper than the deepest bed/.test(refused ?? ''), `the deepest-bed invariant: a ramp sunk a hundredfold REFUSES by name (${refused ? refused.split(' — ')[0].slice(0, 90) : 'no refusal'})`)
}
if (bad.length) { console.log(`\n⛔ ${bad.length} claim(s) fail.`); process.exit(1) }
console.log('\n✅ The drawn ground meets ①\'s coast at HIGH, on the line, and the bed ramps to it.')
