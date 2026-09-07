#!/usr/bin/env node
// ⭐⭐⭐ THE OPERATOR'S GESTURE, AS A GATE. (Jacob, 2026-09-07: "The swap regime doesn't work on
// adjacent blocks anymore.") ▶ node scratch/claims-swap-reaches-the-paint.mjs [scene]
//
// Flip ONE authored slot's two strips and ask the only question that matters: DID THE PAINT MOVE?
// ⛔ A slot whose swap moves 0 m² is the operator's gesture doing nothing — Layer 0 q3, the override
// IS the product. This is the check that would have caught every corner regression today in one run,
// and it did not exist.
//
// ⚠️ THE FLOOR IS OLDER THAN THE CORNER. Bisected 2026-09-07: 65.1% dead at `162b8645`, before any
// of the day's corner work. That residue is the authoring-key mismatch (`SECTION §7` T3 — one
// frontage can own several `segOrd`s and the paint resolves one), NOT the corner construction.
// ⛔ So do not read this number as a corner metric; read the DELTA when you touch the corner.
import { feed, buildProto } from './_proto-feed.mjs'
import { sectionPassProtoTile } from '../src/lib/tileGround.js'
import { differenceRings } from '../src/lib/buildBlockGeometryV2.js'
const SA=r=>{let a=0;for(let i=0;i<r.length;i++){const j=(i+1)%r.length;a+=r[i][0]*r[j][1]-r[j][0]*r[i][1]}return a/2}
const net=rs=>Math.abs((rs||[]).reduce((s,r)=>s+SA(r),0))
const sym=(A,B)=>net(differenceRings(A,B))+net(differenceRings(B,A))
const f=feed('lafayette-square')
const T=buildProto(f,{protoArtifact:true}).protoShapeTiles
const clone=o=>JSON.parse(JSON.stringify(o||{}))
let tested=0, dead=0, live=0
for (const t of T) {
  const slots=new Map(); for(const r of (t.runs||[])) slots.set(`${r.skelId}|${r.side}|${r.segOrd}`, r)
  if(slots.size<2) continue
  const base=sectionPassProtoTile(t,f.curbWidth,{outer:'LU',inner:'SW'},f.blockCustoms)
  for(const [k,r] of slots){
    const bc=clone(f.blockCustoms); (bc[r.skelId]||={}); (bc[r.skelId][r.side]||={})
    const cur=bc[r.skelId][r.side][r.segOrd]||{}
    const m=cur.materials||{}
    // flip the RESOLVED arrangement, not a blind literal
    const o=m.outer ?? null, i=m.inner ?? null
    bc[r.skelId][r.side][r.segOrd]={...cur, materials:{outer: o==='SW'?'LU':(o==='LU'?'SW':'SW'), inner: i==='SW'?'LU':(i==='LU'?'SW':'LU')}}
    const alt=sectionPassProtoTile(t,f.curbWidth,{outer:'LU',inner:'SW'},bc)
    tested++
    if(sym(base.Wacc,alt.Wacc)<1) dead++; else live++
  }
}
console.log(`slots tested ${tested} · ⛔ swap moves NOTHING ${dead} (${(100*dead/tested).toFixed(1)}%) · moves the walk ${live}`)
