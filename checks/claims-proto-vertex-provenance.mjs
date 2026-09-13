#!/usr/bin/env node
// ⛔ HOW MUCH OF ①'s CONTOUR CARRIES A SOURCE, AND HOW MUCH IS MINTED BY THE BOOLEAN?
// Sizes the handles build: a SOURCE vertex can resolve its centreline node by carried identity
// (`owners[label].srcIdx`); a MINTED vertex cannot, and needs the frozen coupler relation
// (`junctionMap.nodes[].cornersAdjacent`) instead. ⛔ Never by proximity (`A15`).
// ⭐ A minted vertex is not a defect — it is where two chains CROSS, which is where a corner is.
// ▶ node checks/claims-proto-vertex-provenance.mjs [scene ...]
import fs from 'fs'
import { mintProtopolygon } from '../src/lib/tileGround.js'
const scenes = process.argv.slice(2); if (!scenes.length) scenes.push('lafayette-square','hipointe-demun')
const RIB = (s) => s === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${s}/clean/ribbons.json`
for (const scene of scenes) {
  const p = RIB(scene); if (!fs.existsSync(p)) { console.log(`⛔ ${scene}: no ribbons — SKIPPED LOUDLY`); continue }
  const rb = JSON.parse(fs.readFileSync(p,'utf8'))
  const streets = (rb.streets||[]).filter(s=>s.points?.length>=2)
  const MP = mintProtopolygon({ streets, gradeSep: [], eps: 0.005 })
  let total=0, sourced=0, minted=0, withSrcIdx=0
  let turnSourced=0, turnMinted=0
  const ang=(a,b,c)=>{const u=[a[0]-b[0],a[1]-b[1]],v=[c[0]-b[0],c[1]-b[1]]
    const d=(u[0]*v[0]+u[1]*v[1])/((Math.hypot(...u)||1)*(Math.hypot(...v)||1))
    return Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI}
  for (let k=0;k<MP.rings.length;k++){
    const rg=MP.rings[k], labs=MP.labels?.[k]
    for(let i=0;i<rg.length;i++){
      total++
      const l = labs?.[i]
      const t = ang(rg[(i-1+rg.length)%rg.length], rg[i], rg[(i+1)%rg.length])
      if (l==null || l<0) { minted++; if (t < 170) turnMinted++ }
      else { sourced++; if (Number.isFinite(MP.owners[l]?.srcIdx)) withSrcIdx++; if (t < 170) turnSourced++ }
    }
  }
  console.log(`\n${scene}: ${MP.rings.length} ring(s), ${total} contour vertices`)
  console.log(`   SOURCED (label -> owner): ${sourced}  (${(100*sourced/total).toFixed(1)}%) — of these ${withSrcIdx} carry srcIdx`)
  console.log(`   MINTED  (boolean crossing): ${minted}  (${(100*minted/total).toFixed(1)}%)`)
  console.log(`   vertices that actually TURN (<170°): sourced ${turnSourced} · minted ${turnMinted}`)
  console.log(`   ⇒ the handles must resolve a node for ${turnSourced+turnMinted} turning vertex/vertices`)
}
console.log('\n⛔ re-run this; do not quote its digits.')
