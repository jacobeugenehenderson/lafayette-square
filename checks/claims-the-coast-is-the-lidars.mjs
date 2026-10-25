#!/usr/bin/env node
// CLAIM — ①'s COAST IS THE LIDAR'S, AND NOTHING FALLS BACK TO OSM (BRIEF-the-shore-is-one-line step 1).
//
// The coast is where the lidar meets high water (bake-coast.mjs → clean/coast.json); the mint reads it through
// coastFile.mjs#readCoast and nothing else. ASSERTS, reading the code and the artifacts — never restating them:
//   A. NO FALLBACK. No file in the pour's import closure (pour-code.mjs#pourCodeClosure) calls `coastRings`, and derive.js
//      reads its coast through `readCoast`. readCoast REFUSES a missing coast.json and one traced on another square.
//   B. THE DECKS ARE NOT GROUND. On a drawn case — a lake, a shore, and a pier whose deck the lidar sees 2 m above high
//      water — bake-coast's own markSheet + floodFromEdge, fed deckFootprints of an OSM-shaped man_made=pier line, put
//      the water UNDER the deck; without the deck it is land. A pier with no width takes structures.mjs's sourced width.
//   C. THE WINDING. bake-coast#wound gives outers positive and holes negative signed area, and in every town's
//      coast.json each outer is positive and each hole negative (a nonzero fill in the mint then reads a hole as a hole).
//   D. PER TOWN WITH A coast.json: the deck footprints hold no land (deck ∖ water ≤ the trace's pixel × the deck's
//      perimeter), and where map.json was poured from this coast, ①'s waterRings ARE coast.json's rings.
//   E. THE DATUM DOES NOT DEPEND ON THE LINE (Boz's ruling (B)): bake-terrain takes y = 0 from coast.json `flattened`,
//      which bake-coast#flattenedWater finds on the flood sheet before any line is traced (decks excluded), and keeps no
//      histogram of its own; so moving the coast by any offset cannot move y = 0.
// A town with no coast.json is NOT CHECKED for D, and says so (exit 2 if no town was checked at all).
//
//   node checks/claims-the-coast-is-the-lidars.mjs [--scene=<id> …]
//
// MUTATIONS (each must go red): derive.js calls coastRings again · readCoast returns { coast: false } when the file is
// absent · markSheet ignores onDeck · bake-terrain takes its datum from its own histogram again · flattenedWater counts decks · wound returns its ring unreversed · a coast.json hole written positive.
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import clipperLib from 'clipper-lib'
import { ROOT } from './_scenes.mjs'
import { pourCodeClosure } from '../cartograph/pour-code.mjs'
import { readCoast, COAST_FILE } from '../cartograph/coastFile.mjs'
import { markSheet, floodFromEdge, deckFootprints, wound, flattenedWater } from '../cartograph/bake-coast.mjs'
import { defaultDeckWidthM } from '../cartograph/structures.mjs'
import { CLIP_SCALE } from '../src/lib/lattice.js'

const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
const signed = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2

// ── A. no fallback ──
console.log('── A. the pour reads the lidar coast, and only it')
const closure = pourCodeClosure()
const callers = closure.filter(f => /\bcoastRings\s*\(/.test(readFileSync(f, 'utf8')))
say(!callers.length, `no pour file calls coastRings${callers.length ? `: ${callers.map(f => relative(ROOT, f)).join(', ')}` : ''}`)
say(/readCoast\(CLEAN_DIR, _bb,/.test(readFileSync(join(ROOT, 'cartograph/derive.js'), 'utf8')), 'derive.js takes its coast from readCoast(CLEAN_DIR, _bb, …)')
{
  const d = mkdtempSync(join(tmpdir(), 'coast-')), bb = { x0: -10, x1: 10, z0: -10, z1: 10 }
  let threw = false
  try { readCoast(d, bb, 'check') } catch { threw = true }
  say(threw, 'readCoast refuses a town with no coast.json')
  writeFileSync(join(d, COAST_FILE), JSON.stringify({ coast: false, why: 'x', square: { ...bb, x1: 11 } }))
  threw = false
  try { readCoast(d, bb, 'check') } catch { threw = true }
  say(threw, 'readCoast refuses a coast traced on another square')
  writeFileSync(join(d, COAST_FILE), JSON.stringify({ coast: false, why: 'inland', square: bb }))
  say(readCoast(d, bb, 'check').coast === false, 'readCoast reads an inland verdict as no coast')
  rmSync(d, { recursive: true, force: true })
}

// ── B. the decks ──
console.log('── B. a deck is not ground: the water runs under it')
{
  // 100 × 60 m at 1 m: lake (ground −1) for z < 30, land (+2) beyond; a pier from (50, 35) to (50, 5), its deck +2 m.
  const W = 101, H = 61, X = (i) => i, Z = (j) => j, high = 0
  const pier = { man_made: [{ tags: { man_made: 'pier' }, coords: [{ x: 50, z: 35 }, { x: 50, z: 5 }], isClosed: false }] }
  const decks = deckFootprints(pier)
  say(decks.count.lines === 1 && decks.count.typicalWidthM === defaultDeckWidthM(), `an unmapped pier line takes the sourced width (${decks.count.typicalWidthM} m)`)
  const field = () => { const g = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) g[j * W + i] = (j < 30 ? -1 : 2); for (let j = 5; j <= 35; j++) g[j * W + 50] = 2; return g }
  const run = (onDeck) => { const s = markSheet({ ground: field(), W, H, X, Z, highAt: () => high, onDeck, covered: () => true }); return floodFromEdge(s.w, W, H, null, s.nr) }
  const under = (wet) => { let n = 0, t = 0; for (let j = 6; j < 30; j++) { t++; if (wet[j * W + 50]) n++ } return n / t }
  const masked = under(run(decks.on)), bare = under(run(() => false))
  say(masked === 1, `with the deck masked, the water under the pier's over-water span is wet (${(100 * masked).toFixed(0)}%)`)
  say(bare === 0, `control: with no mask the lidar's deck reads as land (${(100 * bare).toFixed(0)}% wet)`)
}

// ── C. the winding ──
console.log('── C. the winding: outers positive, holes negative')
{
  const cw = [[0, 0], [0, 1], [1, 1], [1, 0]], ccw = [...cw].reverse()
  say(signed(wound(cw, 1)) > 0 && signed(wound(ccw, 1)) > 0 && signed(wound(ccw, -1)) < 0 && signed(wound(cw, -1)) < 0, 'wound(r, ±1) sets the sign either way round')
}

// ── E. the datum ──
console.log('── E. the datum is the flattened water, found before any line')
{
  const t = readFileSync(join(ROOT, 'cartograph/bake-terrain.js'), 'utf8')
  const wd = t.slice(t.indexOf('function waterDatum('), t.indexOf('\n}\n', t.indexOf('function waterDatum(')))
  say(/const elev = F\.navd88\b/.test(wd) && /coast\.doc\.flattened/.test(wd) && !/hist\.set\(/.test(wd), 'bake-terrain#waterDatum takes y = 0 from coast.json `flattened` and keeps no histogram of its own')
  // a flood sheet of 10 cells at 174.44 m and a deck at 176.00 m on 3 more: the deck must not vote
  const wet = new Uint8Array(13).fill(1), deck = new Uint8Array(13), ground = new Float32Array(13).fill(174.44)
  for (const k of [10, 11, 12]) { deck[k] = 1; ground[k] = 176 }
  for (const k of [3, 4]) ground[k] = 174.9
  const F = flattenedWater(wet, deck, ground)
  say(F && Math.abs(F.navd88 - 174.44) < 1e-9 && F.cells === 10 && F.share === 0.8, `flattenedWater is the mode of the wet cells, decks excluded (${JSON.stringify(F)})`)
}

// ── D. per town ──
const args = process.argv.slice(2).filter(a => a.startsWith('--scene=')).map(a => a.slice(8))
const scenes = args.length ? args : readdirSync(join(ROOT, 'cartograph/data')).filter(s => existsSync(join(ROOT, 'cartograph/data', s, 'clean', COAST_FILE)))
const P = (r) => r.map(([x, z]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) }))
const m2 = (paths) => paths.reduce((t, p) => t + Math.abs(Clipper.Area(p)), 0) / CLIP_SCALE ** 2
let checked = 0
for (const scene of scenes) {
  const dir = join(ROOT, 'cartograph/data', scene)
  const cp = join(dir, 'clean', COAST_FILE)
  if (!existsSync(cp)) { console.log(`── D. ${scene}: NOT CHECKED — no clean/${COAST_FILE} (▶ node cartograph/bake-coast.mjs --scene=${scene})`); continue }
  const doc = JSON.parse(readFileSync(cp, 'utf8'))
  console.log(`── D. ${scene}: ${doc.coast ? doc.from : `inland — ${doc.why}`}`)
  checked++
  if (!doc.coast) continue
  const outersOk = doc.water.every(b => signed(b.outer) > 0), holesOk = doc.water.every(b => b.holes.every(h => signed(h) < 0))
  say(outersOk && holesOk, `${scene}: every water outer is positive and every hole negative`)
  const osm = JSON.parse(readFileSync(join(dir, 'raw/osm.json'), 'utf8'))
  const decks = deckFootprints(osm.ground)
  if (decks.paths.length) {
    const water = doc.water.flatMap(b => [P(b.outer), ...b.holes.map(P)])
    const c = new Clipper(), out = []
    c.AddPaths(decks.paths, PolyType.ptSubject, true); c.AddPaths(water, PolyType.ptClip, true)
    c.Execute(ClipType.ctDifference, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    const per = decks.paths.reduce((t, p) => t + p.reduce((u, q, i) => { const r = p[(i + 1) % p.length]; return u + Math.hypot(r.X - q.X, r.Y - q.Y) }, 0), 0) / CLIP_SCALE
    const landM2 = m2(out), tol = doc.fineM * per
    say(landM2 <= tol, `${scene}: the deck footprints hold no land — ${landM2.toFixed(1)} m² of ${(decks.m2).toFixed(0)} m² off the water (tolerance one source pixel × the decks' ${per.toFixed(0)} m of edge = ${tol.toFixed(1)} m²)`)
  }
  const mp = join(dir, 'clean/map.json')
  if (existsSync(mp)) {
    const map = JSON.parse(readFileSync(mp, 'utf8'))
    const proto = map.layers?.ribbons?.protopolygon || null   // derive.js freezes ① here
    const wr = proto?.waterRings
    const rings = doc.water.flatMap(b => [b.outer, ...b.holes])
    if (!wr) console.log(`  (map.json carries no protopolygon waterRings — poured before this coast; ①'s rings not compared)`)
    else {
      const same = wr.length === rings.length && wr.every((r, k) => r.length === rings[k].length && r.every((p, i) => Math.abs(p[0] - rings[k][i][0]) < 1e-5 && Math.abs(p[1] - rings[k][i][1]) < 1e-5))
      if (same) say(true, `${scene}: ①'s ${wr.length} water ring(s) are coast.json's`)
      else console.log(`  ⚠️ ${scene}: ①'s ${wr.length} water ring(s) are not coast.json's ${rings.length} — the town has not been re-poured from this coast (▶ the Bake)`)
    }
  }
}
if (bad.length) { console.log(`\n⛔ ${bad.length} claim(s) fail.`); process.exit(1) }
if (!checked) { console.log('\n✅ A–C hold. ⚠️ D NOT CHECKED: no town has a coast.json yet.'); process.exit(2) }
console.log(`\n✅ The coast is the lidar's: ${checked} town(s) checked.`)
