#!/usr/bin/env node
// CLAIM — ①'s COAST IS THE LIDAR'S, AND NOTHING FALLS BACK TO OSM (BRIEF-the-shore-is-one-line step 1).
//
// The coast is where the lidar meets high water (bake-coast.mjs → clean/coast.json); the mint reads it through
// coastFile.mjs#readCoast and nothing else. ASSERTS, reading the code and the artifacts — never restating them:
//   A. NO FALLBACK. No file in the pour's import closure (pour-code.mjs#pourCodeClosure) calls `coastRings`, and derive.js
//      reads its coast through `readCoast`, by way of the mint's one input builder (cartograph/mintInputs.mjs). readCoast REFUSES a missing coast.json and one traced on another square.
//   B. THE DECKS ARE NOT GROUND. On a drawn case — a lake, a shore, and a pier whose deck the lidar sees 2 m above high
//      water — bake-coast's own markSheet + floodFromEdge, fed deckFootprints of an OSM-shaped man_made=pier line, put
//      the water UNDER the deck; without the deck it is land. A pier with no width takes structures.mjs's sourced width.
//   C. THE WINDING. bake-coast#wound gives outers positive and holes negative signed area, and in every town's
//      coast.json each outer is positive and each hole negative (a nonzero fill in the mint then reads a hole as a hole).
//   D. PER TOWN WITH A coast.json: the deck footprints hold no land (deck ∖ water ≤ the trace's pixel × the deck's
//      perimeter); where map.json was poured from this coast, ①'s waterRings ARE what the mint was given:
//      structures.mjs#waterWithoutDecks(coast.json's rings and arcs, map.json's streetDecks), recomputed here (Zob); and
//      THE ISLAND FLOOR (Boz's ruling 2026-10-26): every hole kept holds a node of the terrain's own lattice
//      (elevationSources.mjs#terrainLattice), and each one dropped is recorded by size and place.
//   G. EVERY RING IS SIMPLE AND ① CAN OUTLINE EVERY VERTEX (Boz's rulings, 2026-10-26): coastFile.mjs#ringViolations
//      finds a bow-tie's crossing, a fold, and a hairpin through the mint's own tileGround.js#outlineCorner at INK_EPS (simple,
//      yet acute), and nothing on a square; bake-coast asks it of every ring with that predicate before it writes; settle
//      moves each vertex through bake-coast#settleInOrder, which clamps a move whose edges sweep over another edge (PTown's
//      own v1954–v1968, planted); and
//      every town's coast.json rings have none (read in D).
//   H. A SENTINEL IS NOT A VALUE: marchingSquares.mjs#wetLoops puts a no-return crossing at the edge midpoint (a diagonal
//      neck gives distinct points, no touch), a deck crossing ON the deck's own ring (structures.mjs#deckFootprints
//      .crossing), and REFUSES a NaN with no kind.
//   E. THE DATUM DOES NOT DEPEND ON THE LINE (Boz's ruling (B)): bake-terrain takes y = 0 from coast.json `flattened`,
//      which bake-coast#flattenedWater finds on the flood sheet before any line is traced (decks excluded), and keeps no
//      histogram of its own; so moving the coast by any offset cannot move y = 0.
// A town with no coast.json is NOT CHECKED for D, and says so (exit 2 if no town was checked at all).
//
//   node checks/claims-the-coast-is-the-lidars.mjs [--scene=<id> …]
//
// MUTATIONS (each must go red): derive.js calls coastRings again · readCoast returns { coast: false } when the file is
// absent · markSheet ignores onDeck · bake-terrain takes its datum from its own histogram again · flattenedWater counts decks · wound returns its ring unreversed · a coast.json hole written positive · the island floor not applied · readCoast takes a hole wound positive · ringViolations misses a crossing · the acute predicate dropped from bake-coast · wetLoops interpolates against a
// sentinel as −ε again · the deck crossing taken as the deck node · settle's clearance ignored · settleInOrder's sweep test removed · settle applying its targets without settleInOrder · a deck crossing that
// meets no ring accepted · the pad read as a value.
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import clipperLib from 'clipper-lib'
import { ROOT } from './_scenes.mjs'
import { pourCodeClosure } from '../cartograph/pour-code.mjs'
import { readCoast, COAST_FILE, ringViolations } from '../cartograph/coastFile.mjs'
import { outlineCorner, INK_EPS } from '../src/lib/tileGround.js'
import { wetLoops, KIND } from '../cartograph/marchingSquares.mjs'
import { terrainLattice } from '../cartograph/elevationSources.mjs'
import { markSheet, floodFromEdge, wound, flattenedWater, clearances, settleInOrder } from '../cartograph/bake-coast.mjs'
import { deckFootprints, streetDecks, waterWithoutDecks } from '../cartograph/structures.mjs'
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
// the pour's coast comes through the ONE builder of the mint's inputs: derive.js hands mintInputs its bb and clean dir, and
// mintInputs.mjs reads the coast from readCoast (it moved there from derive.js with the builder; claims-proto-frozen-matches-live
// calls the same builder)
{ const D = readFileSync(join(ROOT, 'cartograph/derive.js'), 'utf8'), MI = readFileSync(join(ROOT, 'cartograph/mintInputs.mjs'), 'utf8')
  say(/mintInputs\(\{[^}]*bb: _bb[^}]*cleanDir: CLEAN_DIR/.test(D) && /readCoast\(cleanDir, bb,/.test(MI), 'derive.js takes its coast through mintInputs({ bb: _bb, cleanDir: CLEAN_DIR }), which reads it from readCoast(cleanDir, bb, …)') }
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
  const O = [[-10, -10], [10, -10], [10, 10], [-10, 10]], Hn = [[-2, -2], [-2, 2], [2, 2], [2, -2]]   // outer +, hole −
  const wrote = (water) => writeFileSync(join(d, COAST_FILE), JSON.stringify({ coast: true, square: bb, water, arcs: [] }))
  wrote([{ outer: O, holes: [Hn] }])
  say(readCoast(d, bb, 'check').holes === 1, 'readCoast takes an outer wound positive with its island wound negative')
  for (const [why, water] of [['a hole wound positive', [{ outer: O, holes: [[...Hn].reverse()] }]], ['an outer wound negative', [{ outer: [...O].reverse(), holes: [] }]]]) {
    wrote(water); threw = false
    try { readCoast(d, bb, 'check') } catch (e) { threw = /not wound/.test(e.message) }
    say(threw, `readCoast REFUSES ${why} (①'s nonzero fill reads the sign)`)
  }
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

// ── G. simple rings, and no vertex the ink cannot outline ──
const acuteAt = (o, p, q) => outlineCorner(o, [{ to: p }, { to: q }], INK_EPS).bad
console.log('── G. every ring is simple, and ① can outline every vertex')
{
  const kinds = (r) => ringViolations(r, acuteAt).map(v => v.kind)
  say(kinds([[0, 0], [10, 0], [10, 10], [0, 10]]).length === 0, 'a square: no violation')
  say(kinds([[0, 0], [10, 10], [10, 0], [0, 10]]).includes('cross'), 'a bow-tie: its crossing is found')
  say(kinds([[0, 0], [10, 0], [5, 5], [10, 10], [0, 10], [5, 5]]).includes('touch') && !kinds([[0, 0], [10, 0], [5, 5], [10, 10], [0, 10], [5, 5]]).includes('cross'), 'a ring meeting itself at one point is a TOUCH, not a crossing')
  say(kinds([[0, 0], [10, 0], [5, 0], [5, 10]]).includes('fold'), 'an edge folding back along itself is found')
  // a hairpin: simple, but its tip turns 0.3° over a 0.72 m leg (Huron's lake arc, 2026-10-26)
  const th = 0.3 * Math.PI / 180, hair = [[0, 0], [4, 0], [4 - 0.72 * Math.cos(th), 0.72 * Math.sin(th)], [0, 10]]
  say(ringViolations(hair).length === 0 && kinds(hair).includes('acute'), 'a hairpin is simple, and still acute by the mint\'s own outlineCorner')
  // settle's bound: on a 0.2 m-wide hairpin the leg's vertex sees the other leg 0.2 m off along its normal
  const pin = [[0, 0], [10, 0], [10, 0.2], [5, 0.2], [0, 0.2], [-5, 5]], cl = clearances(pin, 1)
  say(Math.abs(Math.min(...cl[3]) - 0.2) < 1e-9 && /lo = -Math\.min\(step, cl\[k\]\[0\] \/ 2\), hi = Math\.min\(step, cl\[k\]\[1\] \/ 2\)/.test(readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8')),
    `settle's reach is half the ring's own clearance: a hairpin leg's vertex sees the other leg ${Math.min(...cl[3]).toFixed(3)} m off (0.200), and settleOnSource brackets by half of it`)
  // settle's sweep (Boz's ruling, 2026-10-27): PTown's traced ring at v1954–v1968 and where settle sent each vertex (the
  // 10-27 probe, mm). Applied as given, v1962's edge to v1963 sweeps over v1961 and crosses 1960→1961; in order, clamped.
  const tr = [[-3448.254, -1911.565], [-3445.11, -1912.763], [-3438.06, -1917.558], [-3431.127, -1916.918], [-3428.13, -1918.134], [-3426.03, -1920.554], [-3425.632, -1924.55], [-3418.612, -1928.545], [-3418.068, -1928.66], [-3418.068, -1923.66], [-3413.068, -1923.66], [-3413.068, -1918.66], [-3408.068, -1918.66], [-3408.068, -1916.308], [-3415.146, -1912.702]]
  const sent = [[-3448.281, -1911.606], [-3445.186, -1912.893], [-3438.063, -1917.569], [-3431.141, -1917.155], [-3428.212, -1918.249], [-3425.972, -1920.531], [-3425.765, -1924.673], [-3418.66, -1928.633], [-3418.881, -1928.569], [-3418.068, -1923.66], [-3413.068, -1923.66], [-3413.068, -1918.66], [-3408.068, -1918.66], [-3408.074, -1916.315], [-3415.139, -1912.692]]
  const swept = tr.map(p => p.slice()), sw = settleInOrder(swept, sent.map(p => p.slice()))
  say(!ringViolations(tr).length && ringViolations(sent).some(v => v.kind === 'cross'), 'control: the traced ring is simple, and the settle targets applied as given cross')
  say(!ringViolations(swept).length && sw.clamped.length === 1 && sw.clamped[0].at.join() === '-3418.068,-1928.66' && sw.clamped[0].gotM < sw.clamped[0].wantM,
    `settleInOrder keeps it simple: ${sw.clamped.length} move clamped (want 1, at v1962)${sw.clamped[0] ? `, ${sw.clamped[0].wantM} → ${sw.clamped[0].gotM} m` : ''}, ${ringViolations(swept).length} violation(s)`)
  const src = readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8')
  // a move whose new edge would pass 0.5 mm from a vertex: closer than the written lattice can keep apart (√2 / CLIP_SCALE)
  const w = [[0, 0], [10, 0], [10, -5], [5, -0.3], [0, -5]], wm = settleInOrder(w, [[0, -0.599], null, null, null, null])
  say(wm.clamped.length === 1 && !ringViolations(w).length, `a move ending 0.5 mm from a vertex is clamped (${wm.clamped.length}, want 1): the margin is the lattice's, ${(Math.SQRT2 / CLIP_SCALE * 1000).toFixed(2)} mm`)
  say(/settleInOrder\(ring, targets\.get\(ring\)\)/.test(src), 'settleOnSource applies every move through settleInOrder')
  say(/ringViolations\(r, acuteAt\)/.test(src) && /outlineCorner\(o, \[\{ to: p \}, \{ to: q \}\], INK_EPS\)/.test(src), 'bake-coast asks ringViolations of every ring, with the mint\'s outlineCorner at INK_EPS, before it writes')
}

// ── H. a sentinel is not a value: the tracer never interpolates against one (Zob, 2026-10-26) ──
console.log('── H. the tracer never reads a sentinel as a height')
{
  // 7 × 7 at 1 m, dry (+1) but a wet diagonal neck: a NO_RETURN node at (2, 2) and a valued wet node at (3, 3)
  const n = 7, f = new Float32Array(n * n).fill(1), kind = new Uint8Array(n * n)
  f[2 * n + 2] = NaN; kind[2 * n + 2] = KIND.NO_RETURN; f[3 * n + 3] = -0.5
  const tally = {}, loops = wetLoops(f, n, n, 0, 0, 1, { kind, tally })
  const pts = loops.flat(), keys = new Set(pts.map(p => p.map(v => v.toFixed(6)).join(',')))
  say(keys.size === pts.length && loops.every(l => !ringViolations(l).length) && tally.noReturn === 4,
    `a no-return node at a diagonal neck: ${keys.size} distinct of ${pts.length} crossing points, ${loops.filter(l => ringViolations(l).length).length} loop(s) touching, ${tally.noReturn ?? 0} no-return crossing(s) at edge midpoints (want all distinct, none, 4)`)
  // a deck: a 1.4 m square pier deck over the node at (3, 3); the line must lie ON the deck's own ring
  const ground = { man_made: [{ tags: { man_made: 'pier' }, coords: [{ x: 2.3, z: 2.3 }, { x: 3.7, z: 2.3 }, { x: 3.7, z: 3.7 }, { x: 2.3, z: 3.7 }, { x: 2.3, z: 2.3 }], isClosed: true }] }
  const dk = deckFootprints(ground), g = new Float32Array(n * n).fill(1), gk = new Uint8Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (dk.on(i, j)) { g[j * n + i] = NaN; gk[j * n + i] = KIND.DECK }
  const dl = wetLoops(g, n, n, 0, 0, 1, { kind: gk, deckCross: dk.crossing }).flat()
  const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dz) }
  const off = Math.max(...dl.map(p => Math.min(...dk.rings.flatMap(r => r.map((q, m) => segD(p, q, r[(m + 1) % r.length]))))))
  say(gk.some(Boolean) && dl.length > 0 && off <= 1 / CLIP_SCALE, `a deck's crossings lie on the deck's own ring (${dl.length} point(s), furthest ${(1000 * off).toFixed(3)} mm off; the clip grid is ${1000 / CLIP_SCALE} mm)`)
  // a deck whose edge runs ALONG the lattice (a 2 m square deck on nodes 2…4): its boundary nodes lie on the ring, exact
  const sqd = deckFootprints({ man_made: [{ tags: { man_made: 'pier' }, coords: [{ x: 2, z: 2 }, { x: 4, z: 2 }, { x: 4, z: 4 }, { x: 2, z: 4 }, { x: 2, z: 2 }], isClosed: true }] })
  const g2 = new Float32Array(n * n).fill(1), k2 = new Uint8Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (sqd.on(i, j)) { g2[j * n + i] = NaN; k2[j * n + i] = KIND.DECK }
  const t2 = {}, d2 = wetLoops(g2, n, n, 0, 0, 1, { kind: k2, deckCross: sqd.crossing, tally: t2 }).flat()
  const off2 = Math.max(...d2.map(p => Math.min(...sqd.rings.flatMap(r => r.map((q, m) => segD(p, q, r[(m + 1) % r.length]))))))
  say(off2 <= 1 / CLIP_SCALE, `a deck edge along the lattice: every crossing on the deck's ring (furthest ${(1000 * off2).toFixed(3)} mm; ${t2.deckNodeOnRing ?? 0} at a deck node ON the ring, ${t2.deck ?? 0} between)`)
  let td = false; try { wetLoops(g2, n, n, 0, 0, 1, { kind: k2, deckCross: () => null }) } catch (e) { td = /a deck node outside its own deck/.test(e.message) }
  say(td, 'a deck node whose edge meets no deck ring REFUSES (never the node as a guess)')
  // a deck reaching the window's edge (Huron, 2026-10-26: a deck node on a tile's last row): its edge to the tracer's PAD is
  // the pad's, not the deck's: a midpoint, counted, never a deck-ring lookup that finds nothing
  const edge = deckFootprints({ man_made: [{ tags: { man_made: 'pier' }, coords: [{ x: 2.5, z: -2 }, { x: 3.5, z: -2 }, { x: 3.5, z: 0.5 }, { x: 2.5, z: 0.5 }, { x: 2.5, z: -2 }], isClosed: true }] })
  const g3 = new Float32Array(n * n).fill(1), k3 = new Uint8Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (edge.on(i, j)) { g3[j * n + i] = NaN; k3[j * n + i] = KIND.DECK }
  const t3 = {}; let ok3 = true; try { wetLoops(g3, n, n, 0, 0, 1, { kind: k3, deckCross: edge.crossing, tally: t3 }) } catch { ok3 = false }
  say(ok3 && t3.pad === 1, `a deck node on the window's edge: its edge to the pad crosses at the midpoint (${t3.pad ?? 0} pad crossing), no deck lookup`)
  let t = false; try { wetLoops(Float32Array.from([NaN, 1, 1, 1]), 2, 2, 0, 0, 1) } catch (e) { t = /no value and no kind/.test(e.message) }
  say(t, 'a NaN with no kind REFUSES (a sentinel must be named, never stored)')
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
  say(/const elev = F\.navd88\b/.test(wd) && /\.doc\.flattened\b/.test(wd) && !/hist\.set\(/.test(wd), 'bake-terrain#waterDatum takes y = 0 from coast.json `flattened` and keeps no histogram of its own')
  // a flood sheet of 10 cells at 174.44 m and a deck at 176.00 m on 3 more: the deck must not vote
  const wet = new Uint8Array(13).fill(1), deck = new Uint8Array(13), ground = new Float32Array(13).fill(174.44)
  for (const k of [10, 11, 12]) { deck[k] = 1; ground[k] = 176 }
  for (const k of [3, 4]) ground[k] = 174.9
  const F = flattenedWater(wet, deck, ground)
  say(F && Math.abs(F.navd88 - 174.44) < 1e-9 && F.cells === 10 && F.share === 0.8, `flattenedWater is the mode of the wet cells, decks excluded (${JSON.stringify(F)})`)
}

// ── F. the street rides the deck ──
console.log('── F. a deck that carries a street leaves the water; one that carries none stays')
{
  // water south of z = 0 (a 200 m square); two 10 m wide piers out from the shore: one carries a street, one does not
  const water = [[[0, 0], [200, 0], [200, 200], [0, 200]]], arcs = [[[0, 0], [200, 0]]]
  const ground = { man_made: [
    { tags: { man_made: 'pier', width: '10' }, coords: [{ x: 50, z: -20 }, { x: 50, z: 80 }], isClosed: false },
    { tags: { man_made: 'pier', width: '10' }, coords: [{ x: 150, z: -20 }, { x: 150, z: 80 }], isClosed: false }] }
  const streets = [{ skelId: 'wharf-st', points: [[50, -40], [50, 70]] }]
  const sd = streetDecks(ground, streets)
  say(sd.decks.length === 1 && sd.decks[0].streets.join() === 'wharf-st', `by construction, only the deck the street crosses carries it (${sd.decks.length} deck: ${sd.decks.map(d => d.streets).join()})`)
  const w = waterWithoutDecks(water, arcs, sd.rings), area = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
  const A = w.rings.reduce((t, r) => t + area(r), 0)
  say(Math.abs(A - (40000 - 10 * 80)) < 1, `the water loses the street deck's 800 m² and keeps the other pier's (${A.toFixed(0)} m²)`)
  say(w.rings.every(r => area(r) > 0) && w.arcs.length === 2, `no hole is made (the deck touches the shore), and the shoreline arc is cut where it runs under the deck (${w.arcs.length} pieces)`)
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
  const viol = doc.water.flatMap((b, bi) => [b.outer, ...b.holes].flatMap(r => ringViolations(r, acuteAt).map(v => ({ ...v, bi }))))
  say(!viol.length, `${scene}: every coast ring is simple and ① can outline every vertex${viol.length ? ` — ${[...new Set(viol.map(v => v.kind))].map(k => `${viol.filter(v => v.kind === k).length} ${k}`).join(' · ')}, first @(${viol[0].at.map(Math.round).join(', ')})` : ''}`)
  const lat = terrainLattice(JSON.parse(readFileSync(join(dir, 'neighborhood_boundary.json'), 'utf8')))
  const inR = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const holdsNode = (h) => { const xs = h.map(p => p[0]), zs = h.map(p => p[1])
    for (let j = Math.max(0, Math.ceil((Math.min(...zs) - lat.bounds.minZ) / lat.sz)); j < lat.height && lat.Z(j) <= Math.max(...zs); j++)
      for (let i = Math.max(0, Math.ceil((Math.min(...xs) - lat.bounds.minX) / lat.sx)); i < lat.width && lat.X(i) <= Math.max(...xs); i++) if (inR(lat.X(i), lat.Z(j), h)) return true
    return false }
  const holes = doc.water.flatMap(b => b.holes), empty = holes.filter(h => !holdsNode(h))
  say(doc.islandFloor?.rule === 'holds a terrain node' && Array.isArray(doc.islandsDropped) && !empty.length,
    `${scene}: every island kept holds a terrain node — ${holes.length} kept, ${empty.length} holding none${empty.length ? ` (first at ${empty[0][0].map(Math.round).join(', ')})` : ''}; ${doc.islandsDropped?.length ?? 'NOT RECORDED'} dropped, each named`)
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
    const sd = map.layers?.ribbons?.streetDecks
    if (!wr) console.log(`  (map.json carries no protopolygon waterRings — poured before this coast; ①'s rings not compared)`)
    else if (!Array.isArray(sd)) console.log(`  ⚠️ ${scene}: map.json carries no streetDecks — poured before the decks; ①'s rings not compared (▶ the Bake)`)
    else {
      const given = waterWithoutDecks(doc.water.flatMap(b => [b.outer, ...b.holes]), doc.arcs || [], sd.map(d => d.ring)).rings
      const same = wr.length === given.length && wr.every((r, k) => r.length === given[k].length && r.every((p, i) => Math.abs(p[0] - given[k][i][0]) < 1e-5 && Math.abs(p[1] - given[k][i][1]) < 1e-5))
      if (same) say(true, `${scene}: ①'s ${wr.length} water ring(s) are what the mint was given (coast.json less ${sd.length} street deck(s))`)
      else console.log(`  ⚠️ ${scene}: ①'s ${wr.length} water ring(s) are not the ${given.length} the mint would be given now — the town has not been re-poured from this coast (▶ the Bake)`)
    }
  }
}
if (bad.length) { console.log(`\n⛔ ${bad.length} claim(s) fail.`); process.exit(1) }
if (!checked) { console.log('\n✅ A–C hold. ⚠️ D NOT CHECKED: no town has a coast.json yet.'); process.exit(2) }
console.log(`\n✅ The coast is the lidar's: ${checked} town(s) checked.`)
