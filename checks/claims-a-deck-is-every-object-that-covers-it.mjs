#!/usr/bin/env node
// claims-a-deck-is-every-object-that-covers-it.mjs — IS EVERY POINT A DECK OBJECT COVERS ON THE DECK?
//
// ⭐ THE INVARIANT (Boz's ruling, 2026-10-27): the deck footprints are ONE nonzero union of their inputs
// (structures.mjs#deckInputs: each area as mapped, each line buffered, each joint's hull). A nonzero union SUMS windings, so
// an area mapped clockwise overlapping a line's offset (counter-clockwise) sums to 0 there and the overlap is NOT deck: deck
// that two OSM objects both cover went missing, and one deck split into two rings touching at a point (PTown, the Coast Guard
// Pier and the USCG pier @(-56.78, 989.78), 0.0077 m²; Huron 3.37 m² in 13 pieces). A way's winding is the mapper's drawing
// order, never a statement about the deck. This check holds, reading deckInputs and deckFootprints themselves:
//   ① A DRAWN CASE: a square area wound CLOCKWISE, first among the inputs, and a pier line leaving it: every input of
//      deckInputs is wound alike, and deckFootprints puts the point both cover ON the deck, as one ring;
//   ② PER TOWN with a raw/osm.json: every input of deckInputs is wound alike, and the area the inputs COVER (each input's
//      own region, so its winding cannot matter) minus their union is 0 m².
//
// ▶ MUTANTS, built in (`--mutants`): each edits structures.mjs (a copy in the OS temp dir) and must turn the check RED —
//     · the winding rule deleted                       → ① ② RED
//     · the winding rule skipping the first input (one area left as mapped) → ① RED
//
//   node checks/claims-a-deck-is-every-object-that-covers-it.mjs [--scene=<id> …] [--mutants]
// Read-only. Exits 1 when a covered point is not on the deck, 2 when no town could be measured.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import clipperLib from 'clipper-lib'
import { ROOT, scenes } from './_scenes.mjs'
import { CLIP_SCALE } from '../src/lib/lattice.js'

const { Clipper, Paths, PolyType, ClipType, PolyFillType } = clipperLib
const HOME = join(ROOT, 'cartograph/structures.mjs')
const mutants = process.argv.includes('--mutants')
// the module under test, through ONE loader: the real structures.mjs, or a mutant's copy in the OS temp dir (`--mutants`)
const load = async (moduleUrl) => import(moduleUrl)
const towns = scenes('cartograph/data/<scene>/raw/osm.json', { argv: process.argv.slice(2).filter(a => a !== '--mutants') })
const m2 = (ps) => ps.reduce((t, p) => t + Clipper.Area(p), 0) / CLIP_SCALE / CLIP_SCALE
const run = (type, a, b) => { const c = new Clipper(), o = new Paths(); c.AddPaths(a, PolyType.ptSubject, true); if (b) c.AddPaths(b, PolyType.ptClip, true)
  if (!c.Execute(type, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error('⛔ clipper failed'); return o }
const osmOf = (s) => JSON.parse(readFileSync(join(ROOT, `cartograph/data/${s}/raw/osm.json`), 'utf8')).ground

// ⓘ one drawn case, OSM-shaped: a 10 m square pier area wound clockwise, and a pier line from its middle out to the east
const SQUARE = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]
const DRAWN = { a: [
  { osmId: 1, isClosed: true, tags: { man_made: 'pier' }, coords: SQUARE.map(([x, z]) => ({ x, z })) },
  { osmId: 2, isClosed: false, tags: { man_made: 'pier', width: '2' }, coords: [{ x: 8, z: 5 }, { x: 30, z: 5 }] }] }

// every finding of one module: [] is a pass
async function findings(S, out = () => {}) {
  const bad = []
  const wound = (paths) => { const o = paths.map(p => Clipper.Orientation(p)); return { cw: o.filter(x => !x).length, ccw: o.filter(Boolean).length } }
  // ① the drawn case
  const di = S.deckInputs(DRAWN), w1 = wound(di.paths)
  if (di.paths.length < 2) throw new Error(`⛔ ① the drawn case gave ${di.paths.length} input(s): deckStructures no longer reads it. NOT CHECKED.`)
  if (w1.cw && w1.ccw) bad.push(`① the drawn case's inputs are wound both ways (${w1.cw} clockwise · ${w1.ccw} counter-clockwise)`)
  const fp = S.deckFootprints(DRAWN, 1)
  if (!fp.on(9, 5)) bad.push('① the point (9, 5), covered by the area AND the line, is NOT on the deck')
  if (fp.rings.length !== 1) bad.push(`① the area and the line it leaves are ${fp.rings.length} rings, not one deck`)
  out(`① drawn: ${di.paths.length} inputs (${w1.cw} cw · ${w1.ccw} ccw) · (9, 5) on the deck: ${fp.on(9, 5)} · ${fp.rings.length} ring(s)`)
  // ② per town
  for (const s of towns) {
    const { paths, count } = S.deckInputs(osmOf(s)), w = wound(paths)
    if (!paths.length) { out(`② ${s}: no deck objects (${count.areas} areas · ${count.lines} lines)`); continue }
    const covered = run(ClipType.ctUnion, paths.flatMap(p => run(ClipType.ctUnion, [p]))), lost = run(ClipType.ctDifference, covered, run(ClipType.ctUnion, paths))
    const lostM2 = m2(lost)
    if (w.cw && w.ccw) bad.push(`② ${s}: inputs wound both ways (${w.cw} clockwise · ${w.ccw} counter-clockwise)`)
    if (lost.length) bad.push(`② ${s}: ${lost.length} covered piece(s), ${lostM2.toFixed(4)} m², not in the union: ${lost.slice(0, 4).map(p => `@(${(p[0].X / CLIP_SCALE).toFixed(2)}, ${(p[0].Y / CLIP_SCALE).toFixed(2)})`).join(' ')}`)
    out(`② ${s}: ${paths.length} inputs (${count.areas} areas · ${count.lines} lines · ${count.joints} joints; ${w.cw} cw · ${w.ccw} ccw) · covered ${m2(covered).toFixed(3)} m² · not in the union ${lostM2.toFixed(4)} m² in ${lost.length} piece(s)`)
  }
  return bad
}

// a mutant: structures.mjs with one edit, in the OS temp dir, its imports pointed back at the tree
const MUTANTS = [
  { what: 'the winding rule deleted', a: '  for (const p of paths) if (!Clipper.Orientation(p)) p.reverse()\n', b: '' },
  { what: 'the winding rule skipping the first input', a: 'for (const p of paths) if (!Clipper.Orientation(p))', b: 'for (const p of paths.slice(1)) if (!Clipper.Orientation(p))' },
]
const EDIT = { a: null, b: null }   // the mutation's edit, set before its copy is made
const mutantUrl = () => { const src = readFileSync(HOME, 'utf8'), { a, b } = EDIT
  if (!src.includes(a)) throw new Error(`⛔ mutant target gone: ${JSON.stringify(a)}`)
  const abs = (spec) => spec.startsWith('.') ? pathToFileURL(join(dirname(HOME), spec)).href : spec.includes(':') ? spec : import.meta.resolve(spec)
  const out = join(mkdtempSync(join(tmpdir(), 'deck-winding-')), 'structures.mjs')
  writeFileSync(out, src.replace(a, b).replace(/from '([^']+)'/g, (_, spec) => `from '${abs(spec)}'`))
  return pathToFileURL(out).href }

console.log('claims-a-deck-is-every-object-that-covers-it')
const bad = await findings(await load(pathToFileURL(HOME).href), (l) => console.log('  ' + l))
for (const b of bad) console.log(`  ⛔ ${b}`)
let mutantMiss = 0
if (mutants) for (const m of MUTANTS) {
  const r = (Object.assign(EDIT, { a: m.a, b: m.b }), await findings(await load(mutantUrl())))
  console.log(`  mutant · ${m.what}: ${r.length ? `RED ✅ (${r.length})${r.map(x => '\n      ' + x).join('')}` : '⛔ STAYED GREEN'}`)
  if (!r.length) mutantMiss++ }
console.log(bad.length || mutantMiss ? `⛔ ${bad.length} finding(s)${mutants ? `, ${mutantMiss} mutant(s) not caught` : ''}` : `✅ every point a deck object covers is on the deck${mutants ? ', and every mutant is RED' : ''}`)
process.exit(bad.length || mutantMiss ? 1 : 0)
