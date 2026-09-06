#!/usr/bin/env node
// ② THE CURB FROM THE PROTOPOLYGON. READ-ONLY. Does offsetting ① per-edge at the authored
// pavementHW reproduce the curb the map ships today (`shape.json`'s frozen `iA`)?
// ⛔ Compare by DISTANCE, and split LEG from CORNER: the frozen curb has the operator's R
// applied and ② does not (R lives in the node's handles, unbuilt), so a corner miss is
// EXPECTED and must be reported apart from a leg miss, which would be a real defect.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const scene = process.argv[2] || 'lafayette-square'
const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
// ⛔ THE BASELINE MUST COME FROM THE SAME RUN. `public/baked/<scene>/shape.json` was frozen
// before today's frame change (the curve fit now reads the raw trace, so every curved chain's
// vertices moved). Measuring ② against it scores the FRAME change as ②'s error — the exact
// shape of "verify the baseline before comparing to it".
const r = buildTileGround(rb, { grout: 'proto', smooth: 0, emitArtifact: true })
console.log(`\n${scene}: proto rings ${r.proto?.length}  identity ${r.protoRefused || 'carried'}  ② curb rings ${r.protoCurb?.length}`)
if (!r.protoCurb?.length) process.exit(0)
const iA = []
for (const t of (r._shapeArtifact || [])) for (const ring of (t.iA || [])) iA.push(ring)
console.log(`   baseline: the curb built by THIS run — ${iA.length} iA ring(s)`)
const nodes = []
for (const s of rb.streets) { if (s.points?.length >= 2) { nodes.push(s.points[0], s.points.at(-1)) } }
const d2seg = (p, a, b) => { const ex = b[0]-a[0], ez = b[1]-a[1], L2 = ex*ex+ez*ez||1
  let t = ((p[0]-a[0])*ex + (p[1]-a[1])*ez)/L2; t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0]-(a[0]+ex*t), p[1]-(a[1]+ez*t)) }
const dTo = (p, rings) => { let b = Infinity; for (const rg of rings) for (let i = 0; i < rg.length; i++) { const d = d2seg(p, rg[i], rg[(i+1)%rg.length]); if (d < b) b = d } return b }
const leg = [], corner = [], gsSkipped = { rings: 0, verts: 0 }
for (let k = 0; k < r.protoCurb.length; k++) {
  const rg = r.protoCurb[k]
  // ⛔ A highway-owned ring has NO baseline — the shipped curb path builds no highway curb.
  if (r.protoCurbGs?.[k]) { gsSkipped.rings++; gsSkipped.verts += rg.length; continue }
  for (const p of rg) {
  let dn = Infinity; for (const n of nodes) { const d = Math.hypot(p[0]-n[0], p[1]-n[1]); if (d < dn) dn = d }
  ;(dn < 12 ? corner : leg).push(dTo(p, iA))
  }
}
const q = (a, f) => { const s = [...a].sort((x,y)=>x-y); return s.length ? s[Math.min(s.length-1, Math.floor(s.length*f))] : NaN }
const rep = (nm, a) => console.log(`   ${nm.padEnd(22)} n=${String(a.length).padStart(6)}  median ${q(a,.5)?.toFixed(3)} m  p90 ${q(a,.9)?.toFixed(3)} m  within 0.10 m ${(100*a.filter(d=>d<0.1).length/(a.length||1)).toFixed(1)}%`)
console.log('   ② curb vertices vs the frozen iA:')
rep('LEG (>12 m from node)', leg)
rep('CORNER zone (<12 m)', corner)
console.log(`   ⛔ ${gsSkipped.rings} grade-separated ring(s) / ${gsSkipped.verts} vertices EXCLUDED from the comparison — the shipped curb builds no highway curb, so there is nothing to compare them to.`)
console.log('   ⭐ the corner row is EXPECTED to miss — the authored R is not applied here.\n')
