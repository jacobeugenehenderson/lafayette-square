#!/usr/bin/env node
// ⭐⭐⭐ THE OPERATOR'S GESTURE, AS A GATE. (Jacob, 2026-09-07: "The swap regime doesn't work on
// adjacent blocks anymore.") ▶ node checks/claims-swap-reaches-the-paint.mjs [scene]
//
// Paint a slot's TWO arrangements and ask the only question that matters: DO THEY DIFFER?
// ⛔ A slot whose two arrangements paint alike cannot express the operator's swap — Layer 0 q3,
// the override IS the product.
//
// ⛔⛔ THIS CHECK WAS BLIND IN THE DIRECTION OF ITS OWN DEFECT AND IS REWRITTEN (2026-09-07).
// It used to write `{outer:'SW', inner:'LU'}` into an unauthored slot and call an unchanged paint a
// dead gesture. But that IS the default on a treelawn-N edge — `stampMeasure`: `matOuter =
// c?.materials?.outer ?? (hasTL ? 'LU' : 'SW')` — and treelawn-Y is a MINORITY on LS. So on most
// edges it wrote the value already in force and scored the no-op as a failure, overstating the
// class ~3× (1088 slots / 75.6% dead, against 1195 / 27.5% measured honestly).
// ⛔ THOSE NUMBERS REACHED THREE COMMIT MESSAGES AND A DOC as "65% / 75.9% / 78.3% of swaps move
// nothing", including a claim that the 65% floor was the `SECTION §7` T3 key mismatch. ⛔ Do not
// quote any of them; the floor was mostly this instrument.
// ⭐ THE METHOD THAT CANNOT LIE THIS WAY: never write a literal. PAINT BOTH ARRANGEMENTS and ask
// whether they DIFFER. That has no notion of "the default", so it cannot mistake one for a no-op.
// ⭐ THE LESSON IS `9f43a99a`'s, for the eighth time today: BEFORE TRUSTING A PROBE, ASK WHAT IT IS
// STRUCTURALLY UNABLE TO SEE. A probe that writes a value cannot see that the value was already there.
import { feed, buildProto } from '../scratch/_proto-feed.mjs'
import { sectionPassProtoTile } from '../src/lib/tileGround.js'
import { differenceRings } from '../src/lib/buildBlockGeometryV2.js'
const SA=r=>{let a=0;for(let i=0;i<r.length;i++){const j=(i+1)%r.length;a+=r[i][0]*r[j][1]-r[j][0]*r[i][1]}return a/2}
const net=rs=>Math.abs((rs||[]).reduce((s,r)=>s+SA(r),0))
const sym=(A,B)=>net(differenceRings(A,B))+net(differenceRings(B,A))
const f=feed('lafayette-square')
const T=buildProto(f,{protoArtifact:true}).protoShapeTiles
const clone=o=>JSON.parse(JSON.stringify(o||{}))
let tested=0, dead=0, live=0
const paint=(t,r,mats)=>{
  const bc=clone(f.blockCustoms); (bc[r.skelId]||={}); (bc[r.skelId][r.side]||={})
  bc[r.skelId][r.side][r.segOrd]={...(bc[r.skelId][r.side][r.segOrd]||{}), materials:mats}
  return sectionPassProtoTile(t,f.curbWidth,{outer:'LU',inner:'SW'},bc)
}
for (const t of T) {
  const slots=new Map(); for(const r of (t.runs||[])) slots.set(`${r.skelId}|${r.side}|${r.segOrd}`, r)
  if(slots.size<2) continue
  for(const [k,r] of slots){
    // the two arrangements the ctrl-click swap toggles between — no default consulted, so a slot
    // that already holds one of them is not mistaken for an unresponsive one
    const A=paint(t,r,{outer:'LU',inner:'SW'}), B=paint(t,r,{outer:'SW',inner:'LU'})
    tested++
    if(sym(A.Wacc,B.Wacc)<1) dead++; else live++
  }
}
console.log(`slots tested ${tested} · \u26d4 the two arrangements paint the SAME walk ${dead} (${(100*dead/tested).toFixed(1)}%) · differ ${live}`)
// \u26d4 A SLOT WHOSE TWO ARRANGEMENTS PAINT ALIKE IS A REAL FINDING AND CAUSE IS NOT ESTABLISHED.
// It is NOT the same claim as "the operator's gesture does nothing" — the gesture is per FRONTAGE
// and the painter resolves one arrangement per contiguous (road, side) stretch, so a slot that
// loses that resolution to an authored neighbour is correct behaviour, not a dead gesture.
