#!/usr/bin/env node
// ⛔ WHAT DOES MOVING THE FACE WALK ONTO THE SSoT COST, PER BLOCK?
//
// Jacob, 2026-09-06: "All data should skew to SSoT." Three geometries are frozen at prebake from
// one pass: `points` (the densified trace), `strokePoints` (the same, with carriageway tips
// straightened at divided→through nodes), and — since ① moved to the skeleton — the SIMPLIFIED
// SKELETON. The face walk uses `strokePoints || points`; ① uses the skeleton. So the tiles and ①'s
// holes are two independent partitions struck from different geometry and CANNOT agree.
//
// ⭐ Converging the faces onto the skeleton keeps the TOPOLOGY (102 faces either way) and moves
// ~90% of blocks under 1%. The risk is a short tail. THIS NAMES THE TAIL.
// ⛔ `strokePoints` exists to stop a divided→through median face PINCHING; the skeleton does not
// carry that correction. So the hypothesis under test is: the tail IS the divided→through set.
// A hypothesis, not a finding — the probe prints which chains bound each mover so it can be read.
// ▶ node checks/claims-faces-on-the-ssot.mjs [scene]
import fs from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
const scene = process.argv[2] || 'lafayette-square'
const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const SK  = `cartograph/data/${scene}/clean/skeleton.json`
if (!fs.existsSync(RIB) || !fs.existsSync(SK)) { console.log(`⛔ ${scene}: missing artifact — SKIPPED LOUDLY`); process.exit(1) }
const rb = JSON.parse(fs.readFileSync(RIB, 'utf8')), sk = JSON.parse(fs.readFileSync(SK, 'utf8'))
const simp = new Map((sk.streets || []).map(s => [s.id, (s.points || []).map(q => Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])]))
const base = rb.streets.filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const nameOf = (s) => s.skelId ?? s.name
const A = extractFaces(base.map(s => s.strokePoints ? { ...s, points: s.strokePoints } : s))
const B = extractFaces(base.map(s => { const p = simp.get(nameOf(s)); return p?.length >= 2 ? { ...s, points: p } : null }).filter(Boolean))
const SA = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i+1)%r.length; a += r[i][0]*r[j][1] - r[j][0]*r[i][1] } return Math.abs(a/2) }
const cen = (r) => { let a=0,cx=0,cy=0; for (let i=0;i<r.length;i++){const j=(i+1)%r.length;const c=r[i][0]*r[j][1]-r[j][0]*r[i][1];a+=c;cx+=(r[i][0]+r[j][0])*c;cy+=(r[i][1]+r[j][1])*c} a/=2; return a?[cx/(6*a),cy/(6*a)]:r[0] }
// ⛔ Chains named off the FACE's own edges — the polygon is named, ask it (`CLAUDE.md` routing gate)
const chainsOf = (f, streets) => [...new Set((f.edges || []).map(e => streets[e.streetIdx]).filter(Boolean).map(nameOf))]
const hasStroke = new Set(base.filter(s => s.strokePoints).map(nameOf))
const divided  = new Set(base.filter(s => s.phase?.kind === 'divided').map(nameOf))
const pool = B.map(f => ({ c: cen(f.ring), a: SA(f.ring) }))
const rows = []
for (const f of A) {
  const c = cen(f.ring), a = SA(f.ring)
  let best = null, bd = Infinity
  for (const p of pool) { const d = Math.hypot(p.c[0]-c[0], p.c[1]-c[1]); if (d < bd) { bd = d; best = p } }
  if (!best || bd > 25) { rows.push({ a, rel: NaN, unmatched: true, chains: chainsOf(f, base) }); continue }
  rows.push({ a, delta: Math.abs(best.a - a), rel: Math.abs(best.a - a) / Math.max(a, 1), chains: chainsOf(f, base) })
}
rows.sort((x, y) => (y.rel || 0) - (x.rel || 0))
const tail = rows.filter(r => r.unmatched || r.rel > 0.05)
console.log(`\n${scene}: ${A.length} faces on the current input · ${B.length} on the SSoT`)
console.log(`  moving more than 5%: ${tail.length} of ${rows.length}\n`)
console.log(`  ${'area m²'.padStart(10)} ${'Δ%'.padStart(7)}  strokePts?  divided?  bounding chains`)
for (const r of tail.slice(0, 16)) {
  const st = r.chains.some(c => hasStroke.has(c)), dv = r.chains.some(c => divided.has(c))
  console.log(`  ${r.a.toFixed(0).padStart(10)} ${(r.unmatched ? 'UNMATCH' : (100*r.rel).toFixed(1)).padStart(7)}  ${(st?'YES':'no ').padStart(10)}  ${(dv?'YES':'no ').padStart(8)}  ${r.chains.slice(0,3).join(' + ')}`)
}
const withStroke = tail.filter(r => r.chains.some(c => hasStroke.has(c))).length
const withDiv    = tail.filter(r => r.chains.some(c => divided.has(c))).length
console.log(`\n  of the ${tail.length} movers: ${withStroke} touch a chain carrying strokePoints · ${withDiv} touch a divided chain`)
console.log(`  ⛔ correlation is not cause — read the rows. ${hasStroke.size} chain(s) carry strokePoints in all.`)
