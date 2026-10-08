#!/usr/bin/env node
// ⭐⭐ EVERY CORNER KNOWS WHETHER A STREET MEETS IT — `BRIEF-corner-ramps-and-kerb §0a`. THE LEGS DECIDE (Jacob,
// 2026-10-06): a corner whose two legs are DIFFERENT roads is a junction (curb cuts + crosswalks); the SAME road is a
// bend (pad only); a leg with no run on the frozen stamp is UNKNOWN, by reason. "Same road" = `RIBBONS §3.3`: either
// `roadId` or `throughId` agrees. Stamped at freeze (`iaJunction` + `junctions`); this reads the stamp, restating no rule.
//
//   node checks/claims-every-corner-knows-its-junction.mjs <scene>                 the poured artifact (public/baked/<scene>/shape.json)
//   node checks/claims-every-corner-knows-its-junction.mjs <scene> --build         build it now off the scene's frozen ①
//   node checks/claims-every-corner-knows-its-junction.mjs <scene> --build --live  …off a live mint (before a re-pour)
//   node checks/claims-every-corner-knows-its-junction.mjs --selftest              the leg rule on known cases
//
// ⛔ FAILS when: the artifact predates the stamp · an arc's vertices disagree on its class · a junction index points
// nowhere · the selftest disagrees. UNKNOWN corners are printed by why their leg has no run (`capEdge` = the dead-end
// mouth class, ROADMAP A0/A10 · `rim` · `unlabelled` · `other`) — a population to read, not a pass condition.
import fs from 'fs'
import { classifyCornerLegs } from '../src/lib/tileGround.js'
import { eachTown, eachRibbonsTown } from './_scenes.mjs'

const args = process.argv.slice(2)
if (args.includes('--selftest')) {
  const L = (skelId, roadId, throughId) => ({ skelId, side: 'left', roadId, throughId })
  const cases = [
    ['two different named roads',          classifyCornerLegs(L('dolman-street-1', 'dolman-street-1', 'Dolman Street'), L('carroll-street-1', 'carroll-street-1', 'Carroll Street')), 'junction'],
    ['one road cut into two chains (name)', classifyCornerLegs(L('park-avenue-1', 'park-avenue-1', 'Park Avenue'), L('park-avenue-2', 'park-avenue-2', 'Park Avenue')), 'bend'],
    ['one road joined by roadId',          classifyCornerLegs(L('a-1', 'corridor-a', 'A'), L('a-2', 'corridor-a', 'B')), 'bend'],
    ['⭐ two UNNAMED streets stay distinct', classifyCornerLegs(L('residential-70', 'residential-70', 'residential-70'), L('residential-73', 'residential-73', 'residential-73')), 'junction'],
    ['a leg with no run',                  classifyCornerLegs(null, L('carroll-street-1', 'carroll-street-1', 'Carroll Street')), 'unknown'],
  ]
  let bad = 0
  for (const [name, got, want] of cases) { const ok = got.kind === want; if (!ok) bad++
    console.log(`  ${ok ? '✅' : '⛔'} ${name.padEnd(38)} → ${got.kind}${ok ? '' : `  WANTED ${want}`}`) }
  console.log(bad ? `⛔ selftest: ${bad} case(s) wrong` : '✅ selftest: the legs decide every case')
  process.exit(bad ? 1 : 0)
}

// no town named ⇒ every town, each its own run (`eachTown`): the poured shape, or the ribbons it is built from (--build)
const scene = args.includes('--build') ? eachRibbonsTown() : eachTown('public/baked/<scene>/shape.json')
let tiles, census = null
if (args.includes('--build')) {
  const { feed, buildProto } = await import('../scratch/_proto-feed.mjs')
  const f = feed(scene); if (!f) process.exit(1)
  if (args.includes('--live')) delete f.ribbons.protopolygon
  const built = buildProto(f, { quiet: true, protoProducer: true }); tiles = built.protoShapeTiles || []; census = built.protoJunctionCensus || null
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
const nodes = new Set(); let noNode = 0
for (const t of stamped) for (let si = 0; si < t.iaArc.length; si++) {
  const arc = t.iaArc[si] || [], jx = t.iaJunction[si] || [], seen = new Map()
  for (let q = 0; q < arc.length; q++) { if (arc[q] == null) continue
    const v = jx[q] ?? null
    if (!seen.has(arc[q])) seen.set(arc[q], v); else if (seen.get(arc[q]) !== v) mixed++ }
  for (const v of seen.values()) { arcs++
    if (v === 'bend') bend++
    else if (Number.isInteger(v)) { const J = t.junctions?.[v]; if (!J) { badIndex++; continue }
      junction++; if (J.node == null) noNode++; else nodes.add(J.node) }
    else unknown++ }
}
console.log(`${scene}${args.includes('--build') ? (args.includes('--live') ? ' (built, live ①)' : ' (built, frozen ①)') : ''}: ${arcs} corner arc(s)`)
console.log(`  at a JUNCTION : ${junction}  (${nodes.size} distinct node(s)${noNode ? `; ${noNode} with no frozen node — crosswalks unpaired` : ''})`)
console.log(`  BEND          : ${bend}  (pad, no curb cut)`)
console.log(`  UNKNOWN       : ${unknown}  (pad, no curb cut — and NOT a bend)`)
if (census) console.log(`    why (per leg with no run): ${Object.entries(census.why || {}).map(([w, k]) => `${k} ${w}${w === 'capEdge' ? ' (the dead-end mouth class, ROADMAP A0/A10)' : ''}`).join(' · ') || '—'}`)
else if (unknown) console.log('    why: read with --build (the reason is the pour\'s, not the artifact\'s)')
if (mixed) console.log(`  ⛔ ${mixed} arc vertex/vertices disagree with their own arc's class`)
if (badIndex) console.log(`  ⛔ ${badIndex} junction index(es) point past the tile's junctions list`)
const fail = mixed || badIndex
console.log(fail ? '⛔ the stamp is inconsistent — NOT a pass' : '✅ every corner arc carries one class')
process.exit(fail ? 1 : 0)
