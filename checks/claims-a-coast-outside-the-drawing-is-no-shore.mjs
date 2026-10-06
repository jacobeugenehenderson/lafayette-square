#!/usr/bin/env node
/**
 * claims-a-coast-outside-the-drawing-is-no-shore.mjs — a coast ring that never reaches the town's DRAWING (its terrain
 * grid) is no shore for this town; a ring that does reach it and catches nothing is still a loud frame disagreement.
 *
 *   node checks/claims-a-coast-outside-the-drawing-is-no-shore.mjs
 *
 * Jacob, 2026-10-06: Jackson Heights is landlocked — Flushing Bay is in its FETCH envelope only, and `coastRings` closes
 * the coast against that envelope. bake-terrain threw "N water ring(s) and ZERO grid samples", reading a distant bay as
 * a frame error. The later shore steps (revetment, shore-median, ground-shore, coast-distance) read the DRAWN shoreline
 * (`__water__` runs) and the terrain datum, so terrain is the one place the rule lives (cartograph/coast-in-drawing.mjs).
 *  1. EXACT TOUCH — a ring vertex in the grid, a grid corner in the ring, or an edge crossing; never the bbox alone (an
 *     L-shaped ring can wrap the grid's bbox without touching the grid).
 *  2. THE THROW STAYS — bake-terrain still refuses a ring that reaches the grid and catches zero samples.
 *  3. THE SECOND HOME — the shore steps read the slab's `__water__` RUNS (shape.json), which may lie past the drawing
 *     (Jackson Heights' baked shape carried two, 2,009–2,418 m out). ONE verdict, shoreRuns.mjs#coastVerdict, counts
 *     only runs that reach the terrain grid (terrain.json#bounds); revetment, shore-median, coast-distance and ground
 *     all take it. ⭐ A run that reaches the drawing with a non-water datum is STILL 'stale-terrain' (the refusal
 *     claims-a-stale-terrain-is-not-a-town-without-a-coast defends).
 * ⭐ MUTANTS (each RED): touch by bbox · drop every ring · keep every ring · remove the zero-sample throw · count every
 *    run (raw) in the verdict · a run touches only by a vertex (no crossing) · coast-distance ignores the verdict.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ringTouchesRect, ringsInDrawing, polylineTouchesRect } from '../cartograph/coast-in-drawing.mjs'
import { coastVerdict } from '../cartograph/shoreRuns.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const fails = [], ok = []
const check = (name, pass, detail = '') => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)
const R = { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }
const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]

// 1. exact touch
check('a ring with a vertex inside the grid touches it', ringTouchesRect(sq(50, 50, 150, 150), R))
check('a ring that encloses the whole grid touches it', ringTouchesRect(sq(-50, -50, 150, 150), R))
check('a ring that only CROSSES the grid (no vertex inside, no corner inside) touches it', ringTouchesRect([[-10, 40], [110, 40], [110, 60], [-10, 60]], R))
check('a ring wholly outside does not', !ringTouchesRect(sq(200, 200, 300, 300), R))
const L = [[-50, -50], [150, -50], [150, -10], [-10, -10], [-10, 150], [-50, 150]]   // wraps two sides; its bbox covers the grid
check('an L-shaped ring whose BBOX covers the grid but which never touches it does not', !ringTouchesRect(L, R))
{ const { inDrawing, outside } = ringsInDrawing([sq(50, 50, 150, 150), sq(200, 200, 300, 300)], R)
  check('the partition keeps what touches, sets aside what does not', inDrawing.length === 1 && outside.length === 1) }

// 2. the throw stays
const bt = readFileSync(join(ROOT, 'cartograph/bake-terrain.js'), 'utf8')
check('bake-terrain still THROWS on rings in the drawing that catch zero samples', /if \(!wet\) \{(?:(?!return\b)[\s\S]){0,600}throw new Error\('⛔ water datum: '/.test(bt))
check('bake-terrain partitions through ringsInDrawing and names what it sets aside', /ringsInDrawing\(c\.rings \|\| \[\], bounds\)/.test(bt) && /WHOLLY OUTSIDE this town's drawing/.test(bt))

// 3. the second home — runs and the one verdict
check('a run with a vertex in the grid touches it', polylineTouchesRect([[50, 50], [300, 300]], R))
check('a run that only CROSSES the grid touches it', polylineTouchesRect([[-50, 50], [150, 50]], R))
check('a run wholly outside does not', !polylineTouchesRect([[200, -50], [300, -40]], R))
const tile = (poly) => ({ runs: [{ skelId: '__water__', poly }] })
const far = [[0, -400], [80, -420]], near = [[10, 10], [90, 20]]
{ const v = coastVerdict({ datum: 'local minimum', bounds: R }, { tiles: [tile(far)] })
  check('only runs OUTSIDE the drawing + a non-water datum → inland, and SAID', v.agree === 'inland' && v.outside.length === 1 && /WHOLLY OUTSIDE/.test(v.said || ''), JSON.stringify({ agree: v.agree, out: v.outside.length })) }
{ const v = coastVerdict({ datum: 'local minimum', bounds: R }, { tiles: [tile(far), tile(near)] })
  check('a run that REACHES the drawing with a non-water datum is still stale-terrain', v.agree === 'stale-terrain') }
{ const v = coastVerdict({ datum: 'water', bounds: R }, { tiles: [tile(far)] })
  check('a water datum builds whatever lies outside (unchanged for a coastal town)', v.agree === 'build') }
check('a terrain.json with no bounds THROWS — the verdict cannot be asked without the drawing', (() => { try { coastVerdict({ datum: 'water' }, { tiles: [] }); return false } catch (e) { return /no `bounds`/.test(e.message) } })())
const src = (f) => readFileSync(join(ROOT, 'cartograph', f), 'utf8')
for (const f of ['bake-revetment.js', 'bake-shore-median.mjs']) check(`${f} takes the agreement from coastVerdict`, /const cv = coastVerdict\(tm, shape\)[\s\S]{0,200}const agree = cv\.agree/.test(src(f)))
check('bake-coast-distance: an inland town whose runs lie outside its drawing gets a NAMED absence', /cv\.agree === 'inland' && cv\.outside\.length\)[\s\S]{0,120}absent: true/.test(src('bake-coast-distance.js')))
check('bake-ground: no "drawn shoreline but no median" alarm for an inland town', /coastVerdict\([^)]*\)[^.]*\.agree === 'inland'/.test(src('bake-ground.js')))

for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
process.exit(fails.length ? 1 : 0)
