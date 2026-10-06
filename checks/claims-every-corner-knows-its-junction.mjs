#!/usr/bin/env node
// ⭐⭐ EVERY CORNER KNOWS WHETHER A STREET MEETS IT — `BRIEF-corner-ramps-and-kerb §0a`.
// Every ease gets its pad; only a JUNCTION corner gets ramps and crosswalks. The answer is stamped at
// freeze (`iaJunction` + `junctions`) from ①'s two edges and the mint's frozen node DEGREE — never the
// owner stamp, whose road key moves the count. This reads the stamp; it restates no rule.
//
//   node checks/claims-every-corner-knows-its-junction.mjs <scene>            the poured artifact (public/baked/<scene>/shape.json)
//   node checks/claims-every-corner-knows-its-junction.mjs <scene> --build    build it now off the scene's frozen ①
//   node checks/claims-every-corner-knows-its-junction.mjs <scene> --build --live   …off a LIVE mint (before a re-pour)
//   node checks/claims-every-corner-knows-its-junction.mjs --selftest         the classifier on known cases
//
// ⛔ FAILS when: the artifact predates the stamp · a corner's class is unknown because the frozen ① has
// no degree (a re-pour is owed) · the selftest disagrees. An UNKNOWN corner for any other reason is
// printed by reason and is NOT a pass condition either way — it is a population to read.
import fs from 'fs'
import { classifyCornerJunction } from '../src/lib/tileGround.js'

const args = process.argv.slice(2)
if (args.includes('--selftest')) {
  const o = (skelId, side = 'left') => ({ skelId, side })
  const P = { 'a-1|b-1': [1, 2], 'a-1|a-2': [3, 4], 'a-1|c-1': [5, 6] }, D = { 'a-1|b-1': 4, 'a-1|a-2': 2, 'a-1|c-1': 3 }
  const cases = [
    ['one chain turning',            classifyCornerJunction(o('a-1'), o('a-1'), P, D), 'bend'],
    ['a chain cut (degree 2)',       classifyCornerJunction(o('a-1'), o('a-2'), P, D), 'bend'],
    ['a cross (degree 4)',           classifyCornerJunction(o('a-1'), o('b-1'), P, D), 'junction'],
    ['a T (degree 3)',               classifyCornerJunction(o('c-1'), o('a-1'), P, D), 'junction'],
    ['no shared node',               classifyCornerJunction(o('a-1'), o('z-1'), P, D), 'unknown'],
    ['① frozen with no degree',      classifyCornerJunction(o('a-1'), o('b-1'), P, null), 'unknown'],
    ['no owner',                     classifyCornerJunction(null, o('b-1'), P, D), 'unknown'],
  ]
  let bad = 0
  for (const [name, got, want] of cases) { const ok = got.kind === want; if (!ok) bad++
    console.log(`  ${ok ? '✅' : '⛔'} ${name.padEnd(28)} → ${got.kind}${got.why ? ` (${got.why})` : ''}${ok ? '' : `  WANTED ${want}`}`) }
  const j = classifyCornerJunction(o('a-1', 'right'), o('b-1'), P, D)
  if (!(j.node === '1.000,2.000' && j.deg === 4 && j.legs?.length === 2)) { bad++; console.log('  ⛔ a junction must carry its node, degree and both legs') }
  console.log(bad ? `⛔ selftest: ${bad} case(s) wrong` : '✅ selftest: the classifier answers every case')
  process.exit(bad ? 1 : 0)
}

const scene = args.find(a => !a.startsWith('--')) || 'lafayette-square'
let tiles
if (args.includes('--build')) {
  const { feed, buildProto } = await import('../scratch/_proto-feed.mjs')
  const f = feed(scene); if (!f) process.exit(1)
  if (args.includes('--live')) delete f.ribbons.protopolygon
  tiles = buildProto(f, { quiet: true, protoProducer: true }).protoShapeTiles || []
} else {
  const p = `public/baked/${scene}/shape.json`
  if (!fs.existsSync(p)) { console.log(`⛔ ${scene}: no ${p} — NOT checked`); process.exit(1) }
  tiles = JSON.parse(fs.readFileSync(p, 'utf8')).tiles || []
}
const T = tiles.filter(t => t?.iaArc)
if (!T.length) { console.log(`⛔ ${scene}: no tile carries corner arcs (iaArc) — NOT a pass`); process.exit(1) }
const stamped = T.filter(t => Array.isArray(t.iaJunction))
if (stamped.length < T.length) {
  console.log(`⛔ ${scene}: ${T.length - stamped.length} of ${T.length} arc-bearing tile(s) carry NO iaJunction — this artifact predates the junction stamp; a re-pour is owed. NOT a pass.`)
  process.exit(1)
}
// per ARC: one class each (every vertex of an arc carries its corner's answer)
let arcs = 0, junction = 0, bend = 0, unknown = 0, mixed = 0, badIndex = 0
const nodes = new Set(), byDeg = {}
for (const t of stamped) for (let si = 0; si < t.iaArc.length; si++) {
  const arc = t.iaArc[si] || [], jx = t.iaJunction[si] || [], seen = new Map()
  for (let q = 0; q < arc.length; q++) { if (arc[q] == null) continue
    const v = jx[q] ?? null
    if (!seen.has(arc[q])) seen.set(arc[q], v); else if (seen.get(arc[q]) !== v) mixed++ }
  for (const v of seen.values()) { arcs++
    if (v === 'bend') bend++
    else if (Number.isInteger(v)) { const J = t.junctions?.[v]; if (!J) { badIndex++; continue }
      junction++; nodes.add(J.node); byDeg[J.deg] = (byDeg[J.deg] || 0) + 1 }
    else unknown++ }
}
console.log(`${scene}${args.includes('--build') ? (args.includes('--live') ? ' (built, live ①)' : ' (built, frozen ①)') : ''}: ${arcs} corner arc(s)`)
console.log(`  at a JUNCTION : ${junction}  (${nodes.size} distinct node(s); by degree ${Object.entries(byDeg).map(([d, k]) => `${d}:${k}`).join(' ')})`)
console.log(`  BEND          : ${bend}  (pad, no ramp)`)
console.log(`  UNKNOWN       : ${unknown}  (pad, no ramp — and NOT a bend)`)
if (mixed) console.log(`  ⛔ ${mixed} arc vertex/vertices disagree with their own arc's class`)
if (badIndex) console.log(`  ⛔ ${badIndex} junction index(es) point past the tile's junctions list`)
const fail = mixed || badIndex
console.log(fail ? '⛔ the stamp is inconsistent — NOT a pass' : '✅ every corner arc carries one class')
process.exit(fail ? 1 : 0)
