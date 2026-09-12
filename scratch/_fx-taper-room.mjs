// Can ①'s contour CARRY a corner transition? The proto painter's depth ladder is
// PER CONTOUR EDGE, so a taper needs edges to spend. Count what a frontage owns.
import fs from 'fs'
const s=JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json','utf8'))
const T=s.tiles||[]
const len=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1])
let frontEdges=[], frontLen=[], cornerEdges=0, totEdges=0, oneEdge=0, fronts=0
for(const t of T){
  const rings=t.iaFull||[], stamps=t.iaStamp||[], corner=t.iaCorner||[]
  for(let r=0;r<rings.length;r++){
    const R=rings[r], stp=stamps[r]||[], co=corner[r]||[], n=R.length; if(n<3) continue
    totEdges+=n
    // a FRONTAGE = maximal contiguous stretch of one owner (the painter's own unit)
    const cuts=[]; for(let q=0;q<n;q++){ if(stp[(q-1+n)%n]!==stp[q]) cuts.push(q) }
    const spans = cuts.length ? cuts.map((c,x)=>[c,((cuts[(x+1)%cuts.length]-c+n)%n)||n]) : [[0,n]]
    for(const [s0,L] of spans){ fronts++; frontEdges.push(L)
      let m=0; for(let k=0;k<L;k++){const q=(s0+k)%n; m+=len(R[q],R[(q+1)%n])}
      frontLen.push(m); if(L===1) oneEdge++ }
    for(let q=0;q<n;q++) if(co[q]) cornerEdges++
  }
}
const q=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length*p)]}
console.log(`LS ①-produced contour (iaFull), ${T.length} tiles`)
console.log(`  contour edges total        : ${totEdges}`)
console.log(`  frontages (owner stretches): ${fronts}`)
console.log(`  edges per frontage         : p10 ${q(frontEdges,.1)} · median ${q(frontEdges,.5)} · p90 ${q(frontEdges,.9)}`)
console.log(`  frontages that are ONE EDGE: ${oneEdge} (${(100*oneEdge/fronts).toFixed(1)}%)`)
console.log(`  frontage length (m)        : median ${q(frontLen,.5).toFixed(1)} · p90 ${q(frontLen,.9).toFixed(1)}`)
console.log(`  ⇒ median metres of frontage PER CONTOUR EDGE: ${(q(frontLen,.5)/Math.max(1,q(frontEdges,.5))).toFixed(1)} m`)
console.log(`  stamped corner vertices    : ${cornerEdges}`)

// ⛔ REFINE: an owner stretch includes its EASED ARC edges (short) plus the straight
// frontage (long). A taper must live on the STRAIGHT part. Split by edge length.
const E=[]
for(const t of T){ for(const R of (t.iaFull||[])){ const n=R.length; if(n<3)continue
  for(let q=0;q<n;q++) E.push(len(R[q],R[(q+1)%n])) } }
E.sort((a,b)=>a-b)
const pc=p=>E[Math.floor(E.length*p)]
console.log(`\n  contour EDGE lengths (m): p50 ${pc(.5).toFixed(2)} · p75 ${pc(.75).toFixed(2)} · p90 ${pc(.9).toFixed(2)} · p99 ${pc(.99).toFixed(2)} · max ${E[E.length-1].toFixed(1)}`)
console.log(`  edges < 1 m (eased-arc tessellation): ${E.filter(x=>x<1).length} (${(100*E.filter(x=>x<1).length/E.length).toFixed(1)}%)`)
console.log(`  edges > 5 m (straight frontage)     : ${E.filter(x=>x>5).length} (${(100*E.filter(x=>x>5).length/E.length).toFixed(1)}%)`)
// per frontage: how many LONG edges (the only place a taper can be spent)
let longPer=[]
for(const t of T){ const rings=t.iaFull||[], stamps=t.iaStamp||[]
  for(let r=0;r<rings.length;r++){ const R=rings[r], stp=stamps[r]||[], n=R.length; if(n<3)continue
    const cuts=[]; for(let q=0;q<n;q++) if(stp[(q-1+n)%n]!==stp[q]) cuts.push(q)
    const spans=cuts.length?cuts.map((c,x)=>[c,((cuts[(x+1)%cuts.length]-c+n)%n)||n]):[[0,n]]
    for(const [s0,L] of spans){ let c=0; for(let k=0;k<L;k++){const q=(s0+k)%n; if(len(R[q],R[(q+1)%n])>5)c++ } longPer.push(c) } } }
const qq=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length*p)]}
console.log(`  LONG (>5 m) edges per frontage: p10 ${qq(longPer,.1)} · median ${qq(longPer,.5)} · p90 ${qq(longPer,.9)}`)
console.log(`  frontages with ≤1 long edge   : ${longPer.filter(x=>x<=1).length} / ${longPer.length} (${(100*longPer.filter(x=>x<=1).length/longPer.length).toFixed(1)}%)`)
