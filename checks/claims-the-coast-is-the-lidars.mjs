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
//      moves each vertex through bake-coast#settleInOrder, which clamps a move whose edges sweep over another edge of ANY
//      ring or leaves a corner ① cannot outline (PTown's own v1954–v1968 planted; an edge whose ends are far off; 0.5 mm from an edge; a hole across its outer);
//      no two rings meet (coastFile.mjs#ringsMeet, asked by bake-coast and of every town's coast.json); and
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
// sentinel as −ε again · the deck crossing taken as the deck node · settle's clearance ignored · settleInOrder's sweep test removed · its vertex-only form · inkability left out of admission · its index keyed by vertex · the margin dropped (vertex or edge) · each ring indexed alone · settle applying its targets without settleInOrder · ringsMeet not asked by bake-coast · a deck crossing that
// meets no ring accepted · the pad read as a value.
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import clipperLib from 'clipper-lib'
import { ROOT } from './_scenes.mjs'
import { pourCodeClosure } from '../cartograph/pour-code.mjs'
import { readCoast, COAST_FILE, COAST_VERSION, ringViolations, ringsMeet } from '../cartograph/coastFile.mjs'
import { outlineCorner, INK_EPS } from '../src/lib/tileGround.js'
import { wetLoops, KIND } from '../cartograph/marchingSquares.mjs'
import { terrainLattice } from '../cartograph/elevationSources.mjs'
import { markSheet, floodFromEdge, wound, flattenedWater, clearances, settleInOrder } from '../cartograph/bake-coast.mjs'
import { deckFootprints, streetDecks, waterWithoutDecks } from '../cartograph/structures.mjs'
import { defaultDeckWidthM } from '../cartograph/structures.mjs'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { mintProtopolygon } from '../src/lib/tileGround.js'
import { waterRuns } from '../cartograph/shoreRuns.mjs'

const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
const signed = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
// the edges of `rings` no arc strokes: an edge is stroked when both ends and its midpoint lie on an arc (at the clip lattice)
// the converse: arc edges lying on no edge of `rings` (off), and ring edges more than one arc edge covers (twice)
const strokedOff = (rings, arcs) => { const tol = 1 / CLIP_SCALE, segD = (v, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((v[0] - a[0]) * dx + (v[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(v[0] - a[0] - u * dx, v[1] - a[1] - u * dz) }
  const E = rings.flatMap(r => r.map((a, i) => [a, r[(i + 1) % r.length]])), hits = new Array(E.length).fill(0)
  let off = 0
  for (const a of arcs) for (let i = 0; i + 1 < a.length; i++) { const p = a[i], q = a[i + 1], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    const k = E.findIndex(([u, v]) => segD(p, u, v) <= tol && segD(q, u, v) <= tol && segD(m, u, v) <= tol)
    if (k < 0) { const any = E.some(([u, v]) => segD(m, u, v) <= tol); if (!any) off++ } else hits[k]++ }
  return { off, twice: hits.filter(h => h > 1).length } }
const bareEdges = (rings, arcs, onFrame) => { const tol = 1 / CLIP_SCALE, segD = (v, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((v[0] - a[0]) * dx + (v[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(v[0] - a[0] - u * dx, v[1] - a[1] - u * dz) }
  const G = 4, cells = new Map(), key = (x, z) => `${Math.floor(x / G)},${Math.floor(z / G)}`
  for (const a of arcs) for (let i = 0; i + 1 < a.length; i++) { const p = a[i], q = a[i + 1], n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / G) || 1
    for (let s = 0; s <= n; s++) for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const k = key(p[0] + (q[0] - p[0]) * s / n + dx * G, p[1] + (q[1] - p[1]) * s / n + dz * G); (cells.get(k) || cells.set(k, new Set()).get(k)).add(a.length * 0 + i + ':' + arcs.indexOf(a)) } }
  const on = (v) => [...(cells.get(key(v[0], v[1])) || [])].some(id => { const [i, ai] = id.split(':').map(Number), a = arcs[ai]; return segD(v, a[i], a[i + 1]) <= tol })
  const out = []
  for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]
    if (onFrame(a, b)) continue
    if (!(on(a) && on(b) && on([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]))) out.push([a, b]) }
  return out }

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
  writeFileSync(join(d, COAST_FILE), JSON.stringify({ version: COAST_VERSION, coast: false, why: 'x', square: { ...bb, x1: 11 } }))
  threw = false
  try { readCoast(d, bb, 'check') } catch { threw = true }
  say(threw, 'readCoast refuses a coast traced on another square')
  writeFileSync(join(d, COAST_FILE), JSON.stringify({ version: COAST_VERSION, coast: false, why: 'inland', square: bb }))
  say(readCoast(d, bb, 'check').coast === false, 'readCoast reads an inland verdict as no coast')
  const O = [[-10, -10], [10, -10], [10, 10], [-10, 10]], Hn = [[-2, -2], [-2, 2], [2, 2], [2, -2]]   // outer +, hole −
  const wrote = (water) => writeFileSync(join(d, COAST_FILE), JSON.stringify({ version: COAST_VERSION, coast: true, square: bb, water, arcs: [] }))
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
  const decks = deckFootprints(pier, 1)
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
  say(Math.abs(Math.min(...cl[3]) - 0.2) < 1e-9 && /lo = -Math\.min\(step, cl\[k\]\[0\] \/ 2, wall\(ring\[k\], nn, -1, step\)\), hi = Math\.min\(step, cl\[k\]\[1\] \/ 2, wall\(ring\[k\], nn, 1, step\)\)/.test(readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8')),
    `settle's reach is half the ring's own clearance: a hairpin leg's vertex sees the other leg ${Math.min(...cl[3]).toFixed(3)} m off (0.200), and settleOnSource brackets by half of it (and by the open/close's walls, claims-settle-never-crosses-the-open-close)`)
  // settle's sweep (Boz's ruling, 2026-10-27): PTown's traced ring at v1954–v1968 and where settle sent each vertex (the
  // 10-27 probe, mm). Applied as given, v1962's edge to v1963 sweeps over v1961 and crosses 1960→1961; in order, clamped.
  const tr = [[-3448.254, -1911.565], [-3445.11, -1912.763], [-3438.06, -1917.558], [-3431.127, -1916.918], [-3428.13, -1918.134], [-3426.03, -1920.554], [-3425.632, -1924.55], [-3418.612, -1928.545], [-3418.068, -1928.66], [-3418.068, -1923.66], [-3413.068, -1923.66], [-3413.068, -1918.66], [-3408.068, -1918.66], [-3408.068, -1916.308], [-3415.146, -1912.702]]
  const sent = [[-3448.281, -1911.606], [-3445.186, -1912.893], [-3438.063, -1917.569], [-3431.141, -1917.155], [-3428.212, -1918.249], [-3425.972, -1920.531], [-3425.765, -1924.673], [-3418.66, -1928.633], [-3418.881, -1928.569], [-3418.068, -1923.66], [-3413.068, -1923.66], [-3413.068, -1918.66], [-3408.068, -1918.66], [-3408.074, -1916.315], [-3415.139, -1912.692]]
  const swept = tr.map(p => p.slice()), sw = settleInOrder([swept], [sent.map(p => p.slice())], 1, acuteAt)
  say(!ringViolations(tr).length && ringViolations(sent).some(v => v.kind === 'cross'), 'control: the traced ring is simple, and the settle targets applied as given cross')
  // the sweep clamp alone left v1960–v1962 here (the 10-27 probe, mm): v1961 at 0.85° on a 9.5 cm leg, which ① cannot outline
  say(!!acuteAt([-3418.66, -1928.633], [-3425.765, -1924.673], [-3418.742, -1928.585]), 'control: the triple the sweep clamp alone left at v1961 is not inkable by the mint\'s outlineCorner')
  const sweptMm = swept.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)])
  say(!ringViolations(swept, acuteAt).length && !ringViolations(sweptMm, acuteAt).length && sw.clamped.length === 1 && sw.clamped[0].at.join() === '-3418.068,-1928.66' && sw.clamped[0].gotM < sw.clamped[0].wantM && sw.clamped[0].gotM > 0,
    `settleInOrder keeps it simple: ${sw.clamped.length} move clamped (want 1, at v1962)${sw.clamped[0] ? `, ${sw.clamped[0].wantM} → ${sw.clamped[0].gotM} m` : ''}, ${ringViolations(swept, acuteAt).length} violation(s), inkability included, and none written at mm`)
  const src = readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8')
  // a move whose new edge would pass 0.5 mm from a vertex: closer than the written lattice can keep apart (√2 / CLIP_SCALE)
  const w = [[0, 0], [10, 0], [10, -5], [5, -0.3], [0, -5]], wm = settleInOrder([w], [[[0, -0.599], null, null, null, null]], 1, acuteAt)
  say(wm.clamped.length === 1 && !ringViolations(w).length, `a move ending 0.5 mm from a vertex is clamped (${wm.clamped.length}, want 1): the margin is the lattice's, ${(Math.SQRT2 / CLIP_SCALE * 1000).toFixed(2)} mm`)
  // a slot under a long top edge (Zob, 10-27): the notch's tip at (0, 0.5) sent to (0, 1.5) goes through the top edge, whose
  // ends lie 50 m off; then sent to 0.5 mm below it. Both must clamp, and the clamp must not land ON the edge.
  const slot = () => [[-50, 1], [-50, -5], [-1, -5], [0, 0.5], [1, -5], [50, -5], [50, 1]]
  const s1 = slot(), c1 = settleInOrder([s1], [[null, null, null, [0, 1.5], null, null, null]], 1, acuteAt)
  say(c1.clamped.length === 1 && !ringViolations(s1).length && 1 - s1[3][1] > Math.SQRT2 / CLIP_SCALE,
    `a move through an edge whose ends are 50 m off is clamped (${c1.clamped.length}, want 1), ${ringViolations(s1).length} violation(s), stopping ${((1 - s1[3][1]) * 1000).toFixed(2)} mm short (> √2 mm)`)
  const s2 = slot(), c2 = settleInOrder([s2], [[null, null, null, [0, 1 - 0.0005], null, null, null]], 1, acuteAt)
  say(c2.clamped.length === 1 && 1 - s2[3][1] > Math.SQRT2 / CLIP_SCALE, `a move ending 0.5 mm from an edge's interior is clamped (${c2.clamped.length}, want 1)`)
  // between rings: a hole's vertex sent across its body's outer
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10]], hole = () => [[1, 1], [1, 9], [9.5, 5]]
  say(ringsMeet([outer, [[1, 1], [1, 9], [10.5, 5]]]).some(v => v.kind === 'cross') && !ringsMeet([outer, hole()]).length, 'ringsMeet finds a hole crossing its outer, and nothing when it lies inside')
  const h3 = hole(), c3 = settleInOrder([outer.map(p => p.slice()), h3], [[null, null, null, null], [null, null, [10.5, 5]]], 1, acuteAt)
  say(c3.clamped.length === 1 && !ringsMeet([outer, h3]).length, `settleInOrder judges every ring's edges: a hole's vertex sent across the outer is clamped (${c3.clamped.length}, want 1)`)
  say(/ringsMeet\(labels\.map\(l => l\.r\), inkW\)/.test(src), 'bake-coast refuses rings that meet each other, or come closer than the ink (2·INK_EPS), before it writes')
  say(/settleInOrder\(rings, rings\.map\(r => targets\.get\(r\)\), step, acuteAt\)/.test(src), 'settleOnSource applies every move through settleInOrder')
  say(/ringViolations\(r, acuteAt, inkW\)/.test(src) && /const inkW = 2 \* INK_EPS/.test(src) && /outlineCorner\(o, \[\{ to: p \}, \{ to: q \}\], INK_EPS\)/.test(src), 'bake-coast asks ringViolations of every ring, with the mint\'s outlineCorner at INK_EPS, before it writes')
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
  const dk = deckFootprints(ground, 1), g = new Float32Array(n * n).fill(1), gk = new Uint8Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (dk.on(i, j)) { g[j * n + i] = NaN; gk[j * n + i] = KIND.DECK }
  const dl = wetLoops(g, n, n, 0, 0, 1, { kind: gk, deckCross: dk.crossing }).flat()
  const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dz) }
  const off = Math.max(...dl.map(p => Math.min(...dk.rings.flatMap(r => r.map((q, m) => segD(p, q, r[(m + 1) % r.length]))))))
  say(gk.some(Boolean) && dl.length > 0 && off <= 1 / CLIP_SCALE, `a deck's crossings lie on the deck's own ring (${dl.length} point(s), furthest ${(1000 * off).toFixed(3)} mm off; the clip grid is ${1000 / CLIP_SCALE} mm)`)
  // a deck whose edge runs ALONG the lattice (a 2 m square deck on nodes 2…4): its boundary nodes lie on the ring, exact
  const sqd = deckFootprints({ man_made: [{ tags: { man_made: 'pier' }, coords: [{ x: 2, z: 2 }, { x: 4, z: 2 }, { x: 4, z: 4 }, { x: 2, z: 4 }, { x: 2, z: 2 }], isClosed: true }] }, 1)
  const g2 = new Float32Array(n * n).fill(1), k2 = new Uint8Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (sqd.on(i, j)) { g2[j * n + i] = NaN; k2[j * n + i] = KIND.DECK }
  const t2 = {}, d2 = wetLoops(g2, n, n, 0, 0, 1, { kind: k2, deckCross: sqd.crossing, tally: t2 }).flat()
  const off2 = Math.max(...d2.map(p => Math.min(...sqd.rings.flatMap(r => r.map((q, m) => segD(p, q, r[(m + 1) % r.length]))))))
  say(off2 <= 1 / CLIP_SCALE, `a deck edge along the lattice: every crossing on the deck's ring (furthest ${(1000 * off2).toFixed(3)} mm; ${t2.deckNodeOnRing ?? 0} at a deck node ON the ring, ${t2.deck ?? 0} between)`)
  let td = false; try { wetLoops(g2, n, n, 0, 0, 1, { kind: k2, deckCross: () => null }) } catch (e) { td = /a deck node outside its own deck/.test(e.message) }
  say(td, 'a deck node whose edge meets no deck ring REFUSES (never the node as a guess)')
  // a deck reaching the window's edge (Huron, 2026-10-26: a deck node on a tile's last row): its edge to the tracer's PAD is
  // the pad's, not the deck's: a midpoint, counted, never a deck-ring lookup that finds nothing. 1.6 m wide: wider than the 1 m trace
  // step, so the open at that step keeps it (it holds the one node (3, 0))
  const edge = deckFootprints({ man_made: [{ tags: { man_made: 'pier' }, coords: [{ x: 2.2, z: -2 }, { x: 3.8, z: -2 }, { x: 3.8, z: 0.5 }, { x: 2.2, z: 0.5 }, { x: 2.2, z: -2 }], isClosed: true }] }, 1)
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
  const sd = streetDecks(ground, streets, 1)
  say(sd.decks.length === 1 && sd.decks[0].streets.join() === 'wharf-st', `by construction, only the deck the street crosses carries it (${sd.decks.length} deck: ${sd.decks.map(d => d.streets).join()})`)
  const w = waterWithoutDecks(water, arcs, sd.rings, 1), area = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
  const A = w.rings.reduce((t, r) => t + area(r), 0)
  say(Math.abs(A - (40000 - 10 * 80)) < 1, `the water loses the street deck's 800 m² and keeps the other pier's (${A.toFixed(0)} m²)`)
  say(w.rings.every(r => area(r) > 0) && w.arcs.filter(a => a.deck == null).length === 2, `no hole is made (the deck touches the shore), and the shoreline arc is cut where it runs under the deck (${w.arcs.filter(a => a.deck == null).length} pieces)`)
  // ⭐ the deck's edge over the water is shore (Boz's ruling, 2026-10-27): emitted as arcs tagged with the deck, so every edge
  // of the returned rings is stroked; the frame (the 200 m square's own sides) excluded
  const dk = w.arcs.filter(a => a.deck === 0), dkM = dk.reduce((t, a) => t + a.slice(1).reduce((u, q, i) => u + Math.hypot(q[0] - a[i][0], q[1] - a[i][1]), 0), 0)
  say(dk.length === 1 && Math.abs(dkM - (80 + 10 + 80)) < 1e-6, `the street deck's outline over the water is ONE arc tagged deck 0, ${dkM.toFixed(3)} m (its in-water perimeter 170)`)
  const frame = (q) => q[0] === 0 || q[0] === 200 || q[1] === 200
  say(!bareEdges(w.rings, w.arcs, (a, b) => frame(a) && frame(b) && (a[0] === b[0] || a[1] === b[1])).length && w.rings.every(r => (r.deck || []).filter(k => k === 0).length === 3),
    `every water-ring edge off the frame lies under an arc, and the ring's 3 deck edges carry deck 0`)
  // ① itself: a lake, a pier deck across its shore, and a street ending ON the deck's water-facing edge (PTown's marina,
  // 10-27): with the deck's outline stroked, every ink cell joins one face and the deck's edge has its own water owner
  const sq = (id, pts) => ({ skelId: id, name: id, points: pts, highway: 'residential', caps: { start: { degree: 1 }, end: { degree: 1 } } })
  const sa2 = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
  const shore = [[-200, -100], [0, -100], [200, -100]], lake = [...shore, [200, -200], [-200, -200]].reverse()
  const pier = [[-10, -140], [10, -140], [10, -90], [-10, -90]], mintSt = [sq('c', [[-150, 0], [150, 0]]), sq('p', [[0, -60], [0, -140]])]
  const disc = Array.from({ length: 48 }, (_, i) => [190 * Math.cos(i / 48 * 2 * Math.PI), 190 * Math.sin(i / 48 * 2 * Math.PI)])
  const sd2 = streetDecks({ man_made: [{ tags: { man_made: 'pier', width: '20' }, coords: [{ x: 0, z: -90 }, { x: 0, z: -140 }], isClosed: false }] }, mintSt, 1)
  const w2 = waterWithoutDecks([sa2(lake) > 0 ? lake : [...lake].reverse()], [shore], sd2.rings, 1)
  const quiet = (f) => { const l = console.log, wn = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } catch (e) { return { refused: String(e.message) } } finally { console.log = l; console.warn = wn } }
  const MP = quiet(() => mintProtopolygon({ streets: mintSt, boundary: disc, bb: { x0: -200, x1: 200, z0: -200, z1: 200 }, coast: w2.rings, coastArcs: w2.arcs }))
  const deckOwners = (MP.owners || []).map((o, i) => [o, i]).filter(([o]) => o.deck === 0 && o.water)
  // both: the stroked deck arc's stamps, and the WATER FACE's own owner for the deck's edges (srcIdx −1), apart from the one water label
  const faceOwner = deckOwners.find(([o]) => o.srcIdx === -1)
  say(!MP.refused && faceOwner && (MP.blockLabels || []).flat().some(l => deckOwners.some(([, i]) => i === l)),
    `① mints a street deck over the water, a street ending on its edge: ${MP.refused ? `REFUSED — ${MP.refused.slice(0, 160)}` : `every ink cell joins one face, and the deck's edge is labelled by ${deckOwners.length} water owner(s) carrying deck 0`}`)
  // ⭐ and conversely, every arc edge IS a returned ring edge, and none is stroked twice (Zob, 10-27). His plant: the water above
  // z = 0 and a 4 × 25 m pier from z = −5 to 20, the coast running round its root: built by clipping
  // open paths, the root (inside the land) came back as a stray deck arc
  const rootW = [[[-50, 0], [-2, 0], [-2, -5], [2, -5], [2, 0], [50, 0], [50, 100], [-50, 100]]]
  const rootA = [[[-50, 0], [-2, 0], [-2, -5], [2, -5], [2, 0], [50, 0]]], rootD = [[-2, -5], [2, -5], [2, 20], [-2, 20]]
  const rw = waterWithoutDecks(rootW, rootA, [rootD], 1), stray = strokedOff(rw.rings, rw.arcs)
  const rdM = rw.arcs.filter(a => a.deck === 0).reduce((t, a) => t + a.slice(1).reduce((u, q, i) => u + Math.hypot(q[0] - a[i][0], q[1] - a[i][1]), 0), 0)
  say(!stray.off && !stray.twice && Math.abs(rdM - 44) < 1e-6 && !bareEdges(rw.rings, rw.arcs, (a, b) => (a[0] === b[0] && Math.abs(a[0]) === 50) || (a[1] === b[1] && a[1] === 100)).length,
    `a pier the coast follows at its root: ${stray.off} arc edge(s) off the returned rings, ${stray.twice} ring edge(s) stroked twice, its deck arc ${rdM.toFixed(3)} m (its in-water outline 44)`)
  // ⛔ the tag is an array property JSON drops silently: rings handed over without it, beside deck arcs, refuse at the mint's door
  const untagged = quiet(() => mintProtopolygon({ streets: mintSt, boundary: disc, bb: { x0: -200, x1: 200, z0: -200, z1: 200 }, coast: w2.rings.map(r => r.map(p => [p[0], p[1]])), coastArcs: w2.arcs }))
  say(/no per-edge deck tag/.test(untagged?.refused || ''), `deck arcs beside water rings with no per-edge tag REFUSE at the mint's door (${untagged?.refused ? 'refused' : 'MINTED'})`)
  // ⭐ the shore's readers leave a deck's edge out (shoreRuns.mjs#waterRuns: the revetment, the coast distance, the shore checks)
  const wr = waterRuns({ tiles: [{ runs: [{ skelId: '__water__', poly: [[0, 0], [1, 0]] }, { skelId: '__water__', deck: 0, poly: [[1, 0], [2, 0]] }] }] })
  say(wr.length === 1 && wr[0][1][0] === 1, `waterRuns keeps the beach and leaves the deck's edge out (${wr.length} run)`)
}

// ── F2. a deck's footprint is its ways, joined, at the trace's own scale ──
console.log('── F2. a deck is its ways joined, opened and closed at the trace step')
{
  // two pier ways ENDING on one node, widths 3 and 2, turning 0.35° there: PTown's marina, OSM ways 769135305 and 769135308 as
  // mapped (10-27), whose unfilled butt ends left a 1.5 m hairpin. The joint is filled, no acute vertex
  const jg = { man_made: [{ tags: { man_made: 'pier', width: '3' }, coords: [{ x: 347.6, z: 399.18 }, { x: 283.24, z: 344.44 }], isClosed: false },
    { tags: { man_made: 'pier', width: '2' }, coords: [{ x: 283.24, z: 344.44 }, { x: 277.84, z: 339.79 }, { x: 281.69, z: 335.34 }], isClosed: false }] }
  const jf = deckFootprints(jg, 1), jv = jf.rings.flatMap(r => ringViolations(r, acuteAt))
  say(jf.count.joints === 1 && jf.rings.length === 1 && !jv.length, `a joint of two pier ways (3 m, 2 m, 0.35°) is filled: ${jf.count.joints} joint, ${jf.rings.length} ring, ${jv.length} violation(s) (${jv.map(v => v.kind).join(', ')})`)
  // ⭐ EACH DECK IS CLOSED AT THE TRACE'S STEP (Boz's ruling (b), 2026-10-27): Huron's pier as mapped, OSM area 1353092362 and
  // lines 1353092363/4 (no width: the typical 1.8 m), left a notch 5 m deep and under a cell wide between the line's buffer
  // and the area. Closed at the trace's 0.999 m it is filled, counted, and the deck stays one ring
  const pt = (xz) => xz.map(([x, z]) => ({ x, z }))
  const huron = { man_made: [{ tags: { area: 'yes', man_made: 'pier' }, isClosed: true, coords: pt([[707.9, 353.78], [711.24, 353.48], [714.44, 353.19], [717.68, 386.02], [716.67, 385.71], [711.05, 383.94], [707.9, 353.78]]) },
    { tags: { man_made: 'pier' }, isClosed: false, coords: pt([[716.67, 385.71], [716.77, 387.46], [717.17, 394.99]]) },
    { tags: { man_made: 'pier' }, isClosed: false, coords: pt([[690.37, 379.7], [716.77, 387.46]]) }] }
  const hf = deckFootprints(huron, 0.999)
  say(hf.rings.length === 1 && hf.on(714, 385.29) && hf.closedM2 > 0 && hf.closed.length === 1, `Huron's pier closed at its trace step: the notch at (714, 385.29) is deck, ${hf.closedM2} m² added and named, ${hf.rings.length} ring`)
  // ⭐ …and OPENED at it first (Boz's ruling, 2026-10-27): a needle narrower than a cell goes, so no footprint corner is too sharp
  // for the ink (Huron's sharpest was 0.20°, PTown's 1.13°). A 10 × 4 m deck with a 0.3 m needle 5 m long, at a 1 m step
  const needle = deckFootprints({ man_made: [{ tags: { man_made: 'pier' }, isClosed: true, coords: pt([[0, 0], [10, 0], [10, 4], [5.15, 4], [5, 9], [4.85, 4], [0, 4], [0, 0]]) }] }, 1)
  const nv = needle.rings.flatMap(r => ringViolations(r, acuteAt))
  say(needle.rings.length === 1 && !nv.length && needle.opened.length === 1 && Math.abs(needle.openedM2 - 0.75) < 0.05 && !needle.on(5, 7),
    `a 0.3 m needle on a deck is opened away: ${needle.openedM2} m² removed and named (want 0.75), ${nv.length} corner(s) the ink cannot outline`)
  // a deck narrower than a cell everywhere is LISTED, never silently lost; one a street rides REFUSES by name
  const narrow = { man_made: [{ tags: { man_made: 'pier' }, isClosed: true, coords: pt([[0, 0], [0.8, 0], [0.8, 20], [0, 20], [0, 0]]) }] }
  const nf = deckFootprints(narrow, 1)
  say(!nf.rings.length && nf.belowResolution.length === 1 && Math.abs(nf.belowResolution[0].m2 - 16) < 1e-6, `a 0.8 m pier at a 1 m step is below resolution: ${nf.belowResolution.length} listed (${nf.belowResolution[0]?.m2} m²), ${nf.rings.length} footprint(s)`)
  let nr = null; try { streetDecks(narrow, [{ skelId: 'catwalk', points: [[0.4, -5], [0.4, 15]] }], 1) } catch (e) { nr = String(e.message) }
  say(/catwalk rides a deck/.test(nr || ''), `a street riding a deck below the trace's resolution REFUSES by name (${nr ? 'refused' : 'ACCEPTED'})`)
  // ⛔ per deck, never across two: two piers 0.8 m apart, under one cell, stay two
  const two = deckFootprints({ man_made: [{ tags: { man_made: 'pier' }, isClosed: true, coords: pt([[0, 0], [5, 0], [5, 10], [0, 10], [0, 0]]) },
    { tags: { man_made: 'pier' }, isClosed: true, coords: pt([[5.8, 0], [10, 0], [10, 10], [5.8, 10], [5.8, 0]]) }] }, 1)
  say(two.rings.length === 2 && two.closedM2 === 0, `two piers 0.8 m apart, closed at 1 m, stay ${two.rings.length} (want 2), ${two.closedM2} m² added`)
  // ⭐ WATER BESIDE A STREET DECK NARROWER THAN ONE TRACE CELL IS THE DECK'S (Boz's ruling (B), 2026-10-27): MacMillan's own water
  // and street deck (fixture, from PTown's trace), where the deck taken out as is left the 4–73 cm wedge ① could not ink. After
  // waterWithoutDecks, what an open at half a cell still removes beside the deck is no more than one lattice step along its edge
  const mx = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures/ptown-macmillan-sliver-2026-10-27.json'), 'utf8'))
  // ⛔ THE KNOWN REFUSALS (Boz, 2026-10-29; BACKLOG "the open/close refuses at a source staircase"): two crops whose deck ring
  // carries a millimetre staircase at a cut, which the cut-once open/close cannot read. Each asserted BY NAME AND SITE on a
  // ratchet: RED if its message or site changes, and RED when it starts BUILDING (then KNOWN_REFUSALS drops by one in that commit,
  // its KNOWN text goes, and its rows below run again)
  const KNOWN_REFUSALS = 2, KNOWN = "a STAIRCASE in its SOURCE at a cut. Ring 0's edge(s) 533 (211.139, 71.050) → (211.138, 71.050), 1.0 mm; 534 (211.138, 71.050) → (211.136, 71.048), 2.8 mm lie within the lattice's rounding of edge 532's line"
  let mw = null, mwWhy = null; try { mw = waterWithoutDecks(mx.water.map(r => signed(r) > 0 ? r : [...r].reverse()), [], [mx.deck], mx.stepM) } catch (e) { mwWhy = String(e.message) }
  say(!!mwWhy && mwWhy.includes(KNOWN), mwWhy ? (mwWhy.includes(KNOWN) ? `the known refusal (1 of ${KNOWN_REFUSALS}): MacMillan's older crop refuses by name at its source staircase (edges 533, 534 at (211.139, 71.050))` : `MacMillan's older crop refuses, NOT as the known refusal: ${mwWhy.slice(0, 220)}`) : `MacMillan's older crop now BUILDS: lower KNOWN_REFUSALS by one in this commit, drop its KNOWN, and its sliver row runs`)
  if (mw) {
  const CP = (r) => r.map(([x, z]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) })), cu = mx.stepM * CLIP_SCALE
  const grow = (src, d) => { const co = new clipperLib.ClipperOffset(), o = new clipperLib.Paths(); co.AddPaths(src, clipperLib.JoinType.jtMiter, clipperLib.EndType.etClosedPolygon); co.Execute(o, d); return o }
  const cop = (t, a, b) => { const k = new Clipper(), o = new clipperLib.Paths(); k.AddPaths(a, PolyType.ptSubject, true); k.AddPaths(b, PolyType.ptClip, true); k.Execute(t, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
  const mloc = cop(ClipType.ctIntersection, mw.rings.map(CP), grow([CP(mx.deck)], 2 * cu)), mopen = cop(ClipType.ctIntersection, grow(grow(mloc, -cu / 2), cu / 2), mloc)
  const mthin = cop(ClipType.ctIntersection, cop(ClipType.ctDifference, mloc, mopen), grow([CP(mx.deck)], cu)).reduce((t, p) => t + Math.abs(Clipper.Area(p)), 0) / CLIP_SCALE ** 2
  const mper = mx.deck.reduce((t, p, i) => { const q = mx.deck[(i + 1) % mx.deck.length]; return t + Math.hypot(q[0] - p[0], q[1] - p[1]) }, 0)
  say(mw.slivers.length > 0 && mthin <= mper / CLIP_SCALE, `MacMillan's water beside its deck narrower than a cell is the deck's: ${mw.slivers.length} sliver(s), ${mw.slivers.reduce((t, x) => t + x.m2, 0).toFixed(2)} m², named; ${mthin.toFixed(3)} m² thin water left (at most a lattice step along its ${mper.toFixed(0)} m edge, ${(mper / CLIP_SCALE).toFixed(3)} m²)`) }
  // …and what the subtraction itself leaves: PTown's wharf, marina and memorial-park decks with their water (fixture), where a
  // pocket bounded by one deck on every side, narrower than a cell, was left as water (FMP's 1.2 cm², and its like)
  const wx = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures/ptown-wharf-sliver-2026-10-27.json'), 'utf8'))
  let ww = null, wr = null; try { ww = waterWithoutDecks(wx.water.map(r => signed(r) > 0 ? r : [...r].reverse()), [], wx.decks, wx.stepM) } catch (e) { wr = String(e.message) }
  // the known refusal 2 of KNOWN_REFUSALS: deck 2's close, the same class
  const KNOWN_WHARF = "[deck 2 close] ⛔ the open/close cannot read this ring: a STAIRCASE in its SOURCE at a cut. Ring 0's edge(s) 0 (148.485, 132.351) → (148.486, 132.352), 1.4 mm lie within the lattice's rounding of edge 13's line"
  say(!!wr && wr.includes(KNOWN_WHARF), wr ? (wr.includes(KNOWN_WHARF) ? `the known refusal (2 of ${KNOWN_REFUSALS}): the wharf crop refuses by name at deck 2's close, its source staircase (edge 0 at (148.485, 132.351))` : `the wharf crop refuses, NOT as the known refusal: ${wr.slice(0, 220)}`) : `the wharf crop now BUILDS: lower KNOWN_REFUSALS by one in this commit, drop KNOWN_WHARF, and its rows run`)
  if (ww) {
  const wper = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + Math.hypot(q[0] - p[0], q[1] - p[1]) }, 0)
  const pockets = ww ? ww.rings.filter(r => r.deck.every(x => x != null && x === r.deck[0]) && 2 * Math.abs(signed(r)) / wper(r) < wx.stepM) : []
  say(ww && !pockets.length, `PTown's wharf and memorial-park decks: ${ww ? `${ww.slivers.length} sliver(s) taken, ${pockets.length} pocket(s) narrower than a cell bounded by one deck left as water (want 0)` : `REFUSED — ${wr}`}`)
  // …and what ① is given is SIMPLE: every water ring and every deck as taken out, none crossing itself or another (PTown, 10-27:
  // the noding left off, a point-touch left unjoined, or the subtraction left self-touching each put a crossing here)
  const wv = ww ? [...ww.rings.flatMap(r => ringViolations(r)), ...ww.decks.flatMap(r => ringViolations(r)), ...ringsMeet(ww.rings)] : [null]
  say(ww && !wv.length, `PTown's wharf decks and water as ① is given them are simple: ${ww ? `${wv.length} violation(s)${wv.length ? ` (${wv.slice(0, 3).map(v => `${v.kind} @(${v.at.map(c => c.toFixed(2)).join(', ')})`).join(' · ')})` : ''}` : 'REFUSED'}`) }
  // ⛔ a HOLE is not a pocket (Zob, 10-27): a 1.1 × 6 m street deck standing clear of every shore in a 100 m lake survives the
  // open (wider than the 1 m cell) and must stay a hole, so mintInputs' "clear of every shore" refusal can fire
  const lake100 = [[0, 0], [100, 0], [100, 100], [0, 100]], clear = waterWithoutDecks([lake100], [], [[[50, 50], [51.1, 50], [51.1, 56], [50, 56]]], 1)
  say(clear.rings.filter(r => signed(r) < 0).length === 1 && !clear.slivers.length, `a street deck clear of the shore stays a hole: ${clear.rings.filter(r => signed(r) < 0).length} hole (want 1), ${clear.slivers.length} sliver(s)`)
  // and nothing narrow, nothing taken (Zob's (c)): a deck crossing a straight shore square-on takes nothing; crossing it at 45° the
  // acute water wedge's tip narrower than a cell is the deck's, at most a cell's square
  const sq = waterWithoutDecks([[[0, 0], [100, 0], [100, 100], [0, 100]]], [[[0, 0], [100, 0]]], [[[45, -10], [55, -10], [55, 20], [45, 20]]], 1)
  const diag = waterWithoutDecks([[[0, 0], [100, 0], [100, 100], [0, 100]]], [[[0, 0], [100, 0]]], [[[50, -10], [60, 0], [40, 20], [30, 10]]], 1)
  const dM = diag.slivers.reduce((t, x) => t + x.m2, 0)
  say(!sq.slivers.length && sq.rings.length === 1 && dM <= 1 && diag.rings.length === 1, `a deck across a wide shore takes no sliver square-on (${sq.slivers.length}), and at 45° only the acute wedge's tip (${dM.toFixed(3)} m², at most the 1 m cell's square)`)
  // ⛔ a coast.json of an older version refuses by name (Zob, 10-27): a trace under the old deck rules must not pair with this mint
  { const d = mkdtempSync(join(tmpdir(), 'coastv-')); try { writeFileSync(join(d, COAST_FILE), JSON.stringify({ version: 1, coast: true, square: { x0: 0, x1: 1, z0: 0, z1: 1 } }))
    let r = null; try { readCoast(d, { x0: 0, x1: 1, z0: 0, z1: 1 }, 'check') } catch (e) { r = String(e.message) }
    say(/coast version 1/.test(r || ''), `a coast.json of version 1 REFUSES by name (${r ? 'refused' : 'READ'})`) } finally { rmSync(d, { recursive: true, force: true }) } }
  const bc = readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8')
  // ⛔ v7 MEANS THE TOPOLOGY RECORD IS PRESENT (Zob's ruling, 2026-10-29: the version is the one format gate). The writer writes both
  // fields on BOTH of its record paths, empty included, and a coast.json at this version without either is MALFORMED: every one in the
  // tree (the towns' clean/ and the fixtures) is read here, and a planted one without them is seen to fail
  { const isRes = (r) => r && typeof r === 'object' && Number.isFinite(r.n) && Number.isFinite(r.m2)
    const topoOk = (doc) => doc.version !== COAST_VERSION || (Array.isArray(doc.waterTopology) && Array.isArray(doc.decksTopology) && isRes(doc.waterResidual) && isRes(doc.decksResidual))
    const writes = /waterTopology: \[\], decksTopology: \[\], waterResidual: \{ n: 0, m2: 0, largest: null, judgedS: 0 \}, decksResidual: \{ n: 0, m2: 0, largest: null, judgedS: 0 \} \}\)/.test(bc) && /waterTopology: oc\.topology, decksTopology: decks\.topology/.test(bc) && /waterResidual: recordOf\(waterNet\), decksResidual: recordOf\(decksNet\)/.test(bc)
    const files = [...readdirSync(join(ROOT, 'cartograph/data')).map(t => join(ROOT, 'cartograph/data', t, 'clean', COAST_FILE)), ...readdirSync(join(ROOT, 'checks/fixtures')).filter(f => /^coast-.*\.json$/.test(f)).map(f => join(ROOT, 'checks/fixtures', f))].filter(f => existsSync(f))
    const bad = files.filter(f => { try { return !topoOk(JSON.parse(readFileSync(f, 'utf8'))) } catch { return true } }).map(f => relative(ROOT, f)), atV = files.filter(f => { try { return JSON.parse(readFileSync(f, 'utf8')).version === COAST_VERSION } catch { return false } }).length
    say(writes && !bad.length, `coast v${COAST_VERSION} carries its topology and residual records: bake-coast writes waterTopology, decksTopology, waterResidual and decksResidual on both record paths (${writes}); ${atV} of ${files.length} coast.json in the tree at v${COAST_VERSION}, ${bad.length ? `MALFORMED: ${bad.join(', ')}` : 'none without them'}`)
    say(!topoOk({ version: COAST_VERSION, coast: true, waterTopology: [] }), `mutant: a v${COAST_VERSION} coast.json without decksTopology reads MALFORMED, RED`) }
  say(/deckFootprints\(osm\.ground, fine\)/.test(bc) && !/followDecks/.test(bc), 'bake-coast closes its decks at the trace step, and the trace stays the trace (no deck is followed)')
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
  say(doc.version === COAST_VERSION, `${scene}: coast.json is version ${doc.version ?? 'none'} (this kit reads ${COAST_VERSION}${doc.version === COAST_VERSION ? '' : '; readCoast refuses it until the coast is re-baked'})`)
  if (!doc.coast) continue
  const outersOk = doc.water.every(b => signed(b.outer) > 0), holesOk = doc.water.every(b => b.holes.every(h => signed(h) < 0))
  say(outersOk && holesOk, `${scene}: every water outer is positive and every hole negative`)
  const viol = doc.water.flatMap((b, bi) => [b.outer, ...b.holes].flatMap(r => ringViolations(r, acuteAt, 2 * INK_EPS).map(v => ({ ...v, bi }))))
  say(!viol.length, `${scene}: every coast ring is simple and ① can outline every vertex${viol.length ? ` — ${[...new Set(viol.map(v => v.kind))].map(k => `${viol.filter(v => v.kind === k).length} ${k}`).join(' · ')}, first @(${viol[0].at.map(Math.round).join(', ')})` : ''}`)
  const meet = ringsMeet(doc.water.flatMap(b => [b.outer, ...b.holes]))
  say(!meet.length, `${scene}: no two coast rings meet${meet.length ? ` — ${meet.length}, first @(${meet[0].at.map(Math.round).join(', ')})` : ''}`)
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
  const decks = deckFootprints(osm.ground, doc.fineM)
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
    // ⛔ A POUR FROM ANOTHER COAST IS NOT AN INPUT TO THIS CODE (Zob's ruling, 2026-10-29: PTown's take-out was fed its own 10-26 deck rings,
    // whose 1 mm back-step the old integer take-out made). map.json records the coast.json it read (dataRead, pour-code.mjs's sha1);
    // when that is not today's, the take-out rows REFUSE to run, naming the stale pour and the re-pour that fixes it: never a red
    // measurement of the port, and never only a warning beside one
    else if ((map.dataRead || {})[`cartograph/data/${scene}/clean/${COAST_FILE}`] !== createHash('sha1').update(readFileSync(join(dir, 'clean', COAST_FILE))).digest('hex'))
      say(false, `${scene}: map.json was poured from a different coast.json than today's (recorded ${String((map.dataRead || {})[`cartograph/data/${scene}/clean/${COAST_FILE}`] ?? 'none').slice(0, 8)}, today ${createHash('sha1').update(readFileSync(join(dir, 'clean', COAST_FILE))).digest('hex').slice(0, 8)}): its streetDecks are not inputs to this code, so the take-out is NOT measured. ▶ re-pour (the Bake's pipeline step)`)
    else {
      let W = null; try { W = waterWithoutDecks(doc.water.flatMap(b => [b.outer, ...b.holes]), doc.arcs || [], sd.map(d => d.ring), doc.fineM) } catch (e) { say(false, `${scene}: the water the mint is given REFUSES — ${String(e.message).slice(0, 240)}`) }
      if (W) { const given = W.rings
      // ⭐ every water-ring edge the mint is given lies under a stroked arc, the fetched square's own sides excluded (Boz, 10-27)
      const Q = doc.square, side = (a, b) => [['x0', 0], ['x1', 0], ['z0', 1], ['z1', 1]].some(([k, c]) => Math.abs(a[c] - Q[k]) < 1 / CLIP_SCALE && Math.abs(b[c] - Q[k]) < 1 / CLIP_SCALE)
      const bare = bareEdges(given, W.arcs, side), bareM = bare.reduce((t, [a, b]) => t + Math.hypot(b[0] - a[0], b[1] - a[1]), 0), so = strokedOff(given, W.arcs)
      say(!so.off && !so.twice, `${scene}: no arc edge lies off the mint's water rings (${so.off}) and none of their edges is stroked twice (${so.twice})`)
      const gv = [...given.flatMap(r => ringViolations(r)), ...ringsMeet(given)]
      say(!gv.length, `${scene}: the water rings the mint is given are simple and meet none other (${gv.length}${gv.length ? `, first ${gv[0].kind} @(${gv[0].at.map(Math.round).join(', ')})` : ''})`)
      say(!bare.length, `${scene}: every water-ring edge the mint is given lies under a stroked arc (${W.arcs.filter(a => a.deck != null).length} of ${W.arcs.length} arc(s) a deck's edge)${bare.length ? ` — ${bare.length} edge(s), ${bareM.toFixed(1)} m bare, first @(${bare[0][0].map(Math.round).join(', ')})` : ''}`)
      const same = wr.length === given.length && wr.every((r, k) => r.length === given[k].length && r.every((p, i) => Math.abs(p[0] - given[k][i][0]) < 1e-5 && Math.abs(p[1] - given[k][i][1]) < 1e-5))
      if (same) say(true, `${scene}: ①'s ${wr.length} water ring(s) are what the mint was given (coast.json less ${sd.length} street deck(s))`)
      else console.log(`  ⚠️ ${scene}: ①'s ${wr.length} water ring(s) are not the ${given.length} the mint would be given now — the town has not been re-poured from this coast (▶ the Bake)`) }
    }
  }
}
if (bad.length) { console.log(`\n⛔ ${bad.length} claim(s) fail.`); process.exit(1) }
if (!checked) { console.log('\n✅ A–C hold. ⚠️ D NOT CHECKED: no town has a coast.json yet.'); process.exit(2) }
console.log(`\n✅ The coast is the lidar's: ${checked} town(s) checked.`)
