#!/usr/bin/env node
// CLAIM — THE WATER IS ONE POLYGON, ①'s, DRAWN TWICE; NO SECOND WATER (BRIEF-the-shore-is-one-line §3 step 2a/2c).
//
// ①'s coast IS the high-water mark (Jacob, 2026-10-25). The slab draws ①'s water face twice: the SHEET (`water`, its own
// slot) and the BED under it (`bed`, a partitioned face). Nothing else may draw water. ASSERTS per baked look whose town
// has a frozen ①, reading the slab and map.json (never restating them):
//   1. the slab's water groups are exactly `water`: no `water:flood` (the retired high-water flood), no `water:<subtype>`
//      (the retired map.json copy);
//   2. the town's terrain.json carries no `water.flood` (bake-terrain#floodExtent is retired as a decider);
//   3. the water groups' area = the area of ①'s water face inside the slab's disc, within one lattice step × its edge
//      length (the clip's own rounding) plus the disc's polygon chord error;
//   4. the `bed` group's area does not exceed it (it is the same face, cut only by what is painted over it).
// ⭐ ISLANDS (a hole in ①'s water; Jacob 2026-10-26), on drawn inputs through the real functions, before any look:
//   0a. coastFile.mjs#faceAsPolygons groups each hole under the outer holding it, and REFUSES a hole inside none;
//   0b. shore-armour.mjs#drawnWaterTest is even-odd: a point on an island is land;
//   0c. outer-coast.mjs#outerCoast cuts an island out of the water past the disc.
// MUTANTS (each RED): faceAsPolygons drops the holes · drawnWaterTest "inside any ring" · outerCoast fills the hole.
// A look baked before this commit is RED by name: re-bake it. An inland look (no water anywhere) is said and passes.
//
//   node checks/claims-the-water-is-one-polygon.mjs [--look=<id> …]
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import clipperLib from 'clipper-lib'
import { ROOT } from './_scenes.mjs'
import { waterFace, faceAsPolygons } from '../cartograph/coastFile.mjs'
import { drawnWaterTest } from '../cartograph/shore-armour.mjs'
import { outerCoast } from '../cartograph/outer-coast.mjs'
import { isWaterGroupId } from '../src/components/waterMaterial.js'
import { LATTICE_M, CLIP_SCALE } from '../src/lib/lattice.js'

const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
const SEG = 512
const P = (r) => r.map(([x, z]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) }))
const triArea = (P3, I) => { let a = 0; for (let t = 0; t < I.length; t += 3) { const i = I[t] * 3, j = I[t + 1] * 3, k = I[t + 2] * 3
  a += Math.abs((P3[j] - P3[i]) * (P3[k + 2] - P3[i + 2]) - (P3[k] - P3[i]) * (P3[j + 2] - P3[i + 2])) / 2 } return a }
const looksArg = process.argv.filter(a => a.startsWith('--look=')).map(a => a.slice(7))
const BAKED = join(ROOT, 'public/baked')
const looks = looksArg.length ? looksArg : readdirSync(BAKED).filter(l => existsSync(join(BAKED, l, 'ground.json')))
let bad = 0, checked = 0
{
  console.log('── 0. islands, drawn')
  const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0)
  const wnd = (r, sg) => Math.sign(sa(r)) === sg ? r : [...r].reverse()
  const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
  const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad++ }
  const A = wnd(sq(0, 0, 100, 100), 1), Ah = wnd(sq(40, 40, 60, 60), -1), Bo = wnd(sq(200, 0, 300, 100), 1)
  const P = faceAsPolygons([A, Bo, Ah], 'fixture')
  say(P.length === 2 && P.find(p => p.outer === A)?.holes.length === 1 && P.find(p => p.outer === Bo)?.holes.length === 0, 'faceAsPolygons: the island is a hole of the water holding it, and of no other')
  let t = false; try { faceAsPolygons([A, wnd(sq(500, 500, 510, 510), -1)], 'fixture') } catch (e) { t = /inside no water ring/.test(e.message) }
  say(t, 'faceAsPolygons: a hole inside no water ring REFUSES')
  const inW = drawnWaterTest([A, Ah])
  say(inW(20, 20) && !inW(50, 50) && !inW(150, 50), 'drawnWaterTest: water in the ring, land on its island and outside it')
  // the square 0…400; water to its west edge, an island at x 20…40 that the disc (R 100 about (200, 200)) does not cover
  const bb = { x0: 0, x1: 400, z0: 0, z1: 400 }, W0 = wnd(sq(0, 0, 60, 400), 1), I0 = wnd(sq(20, 180, 40, 220), -1)
  const oc = outerCoast({ rings: [W0, I0], bb, center: [200, 200], R: 100 })
  const inPolys = (x, z) => oc.polygons.some(p => { const inR = (r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
    return inR(p.outer) && !p.holes.some(inR) })
  say(inPolys(10, 100) && !inPolys(30, 200), 'outerCoast: the water past the disc is water, and its island is not')
}
for (const look of looks) {
  const g = JSON.parse(readFileSync(join(BAKED, look, 'ground.json'), 'utf8')), scene = g.scene || g.look || look
  const mp = join(ROOT, 'cartograph/data', scene, 'clean/map.json')
  if (!existsSync(mp)) { console.log(`  ·  ${look}: no cartograph/data/${scene}/clean/map.json — not this check's question`); continue }
  let face
  try { face = waterFace(JSON.parse(readFileSync(mp, 'utf8')), 'claims-the-water-is-one-polygon') } catch (e) { console.log(`  ⚠️ ${look}: NOT CHECKED — ${e.message.split(' — ')[0]}`); continue }
  checked++
  const fails = []
  const water = g.groups.filter(x => x.kind !== 'face' && isWaterGroupId(x.id))
  const odd = water.filter(x => x.id !== 'water').map(x => x.id)
  if (odd.length) fails.push(`water group(s) other than 'water': ${odd.join(', ')}`)
  const tp = join(ROOT, 'cartograph/data', scene, 'clean/terrain.json')
  if (existsSync(tp) && JSON.parse(readFileSync(tp, 'utf8')).water?.flood) fails.push('terrain.json carries water.flood')
  if (!face.length && !water.length) { console.log(`  ✅ ${look}: inland — no water in ① and none drawn`); continue }
  const bin = readFileSync(join(BAKED, look, g.bin || 'ground.bin')), ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  const area = (ids) => g.groups.filter(x => ids(x)).reduce((t, x) => t + triArea(new Float32Array(ab, x.vertexByteOffset, x.vertexCount * 3), new Uint32Array(ab, x.indexByteOffset, x.indexCount)), 0)
  const drawn = area(x => x.kind !== 'face' && isWaterGroupId(x.id)), bed = area(x => x.id === 'bed')
  const [cx, cz] = g.stencil.center, R = g.stencil.radius
  const disc = Array.from({ length: SEG }, (_, k) => [cx + R * Math.cos(2 * Math.PI * k / SEG), cz + R * Math.sin(2 * Math.PI * k / SEG)])
  const c = new Clipper(), out = []
  c.AddPaths(face.map(P), PolyType.ptSubject, true); c.AddPath(P(disc), PolyType.ptClip, true)
  c.Execute(ClipType.ctIntersection, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const faceM2 = out.reduce((t, p) => t + Clipper.Area(p), 0) / CLIP_SCALE ** 2
  const perim = out.reduce((t, p) => t + p.reduce((u, q, i) => { const r = p[(i + 1) % p.length]; return u + Math.hypot(r.X - q.X, r.Y - q.Y) }, 0), 0) / CLIP_SCALE
  const chord = R * (1 - Math.cos(Math.PI / SEG)) * 2 * Math.PI * R                          // the disc polygon's own area error
  const tol = LATTICE_M * perim + chord
  if (Math.abs(drawn - faceM2) > tol) fails.push(`drawn water ${drawn.toFixed(1)} m² vs ①'s face in the disc ${faceM2.toFixed(1)} m² (Δ ${(drawn - faceM2).toFixed(1)}, tolerance ${tol.toFixed(1)})`)
  if (bed > drawn + tol) fails.push(`bed ${bed.toFixed(1)} m² exceeds the water ${drawn.toFixed(1)} m²`)
  if (fails.length) { bad++; console.log(`  ⛔ ${look}: ${fails.join(' · ')} — ▶ re-bake`) }
  else console.log(`  ✅ ${look}: water ${drawn.toFixed(0)} m² = ①'s face in the disc ${faceM2.toFixed(0)} m² (Δ ${(drawn - faceM2).toFixed(2)}) · bed ${bed.toFixed(0)} m²`)
}
if (bad) { console.log(`\n⛔ ${bad} look(s) draw water that is not ①'s one polygon.`); process.exit(1) }
if (!checked) { console.log('\n⚠️ NOT CHECKED: no baked look with a frozen ①.'); process.exit(2) }
console.log(`\n✅ ${checked} look(s): the water is ①'s one polygon, drawn twice.`)
