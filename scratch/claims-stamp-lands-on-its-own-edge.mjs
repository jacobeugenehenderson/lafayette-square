#!/usr/bin/env node
// ⭐⭐⭐ ASK ① AND THE STAMP. NOT THE CHAINS. (Jacob, 2026-09-07: "Check the protopolygon and the
// stamp." · "There are no nodes, nor are there chains.")
// ▶ node scratch/claims-stamp-lands-on-its-own-edge.mjs [scene ...]
//
// ① IS SHARP and each of its EDGES is one frontage's straight run. ② is struck from ① by an offset,
// and every ② contour point carries the LABEL of the ① edge it came from. ⇒ THE ACCEPTANCE: a ②
// point must lie ALONG the ① edge whose label it carries — offset inward from it, but not past its
// ends and not off to one side. A point attributed to an edge it does not front is an ownership
// error, and ownership decides the cross-section, so it draws as a seam.
//
// ⛔ MEASURED AT JACOB'S 18TH STREET SEAM and this is why the check exists: the contour point sat
// 102.5% along a 5.5 m ① edge — PAST ITS END — and 3.25 m off it, while ①'s three consecutive edges
// there carried three different labels.
//
// ⛔⛔ AND THE SECOND ROW IS THE PORTABILITY ONE. A block is a face with a handful of frontages. If
// ① carries far more LABEL RUNS than a block has frontages, ownership can change where ① has no
// corner at all — a seam becomes constructible everywhere. `SKELETON §0.1`: "if a downstream
// construction needs elaborate scaffolding, SUSPECT THE INPUT."
import { feed, buildProto } from './_proto-feed.mjs'
const SA = g => { let a=0; for(let i=0;i<g.length;i++){const j=(i+1)%g.length;a+=g[i][0]*g[j][1]-g[j][0]*g[i][1]} return a/2 }
const inRing=(g,x,y)=>{let c=false;for(let i=0,j=g.length-1;i<g.length;j=i++){const[a,b]=g[i],[e,d]=g[j];if((b>y)!==(d>y)&&x<(e-a)*(y-b)/(d-b)+a)c=!c}return c}
const segInfo=(P,A,B)=>{const dx=B[0]-A[0],dy=B[1]-A[1],L2=dx*dx+dy*dy||1
  const u=((P[0]-A[0])*dx+(P[1]-A[1])*dy)/L2, uc=Math.max(0,Math.min(1,u))
  return { u, d: Math.hypot(P[0]-(A[0]+uc*dx), P[1]-(A[1]+uc*dy)) }}
let bad = 0
for (const scene of (process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square','hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  const r = buildProto(f, { protoArtifact: true })
  // ── ROW 1 · ① itself: is a block cut into frontages, or into fragments?
  let blocks=0, vTot=0, runsTot=0, eLen=0, edges=0, coarse=0
  for (let k=0;k<(r.proto||[]).length;k++){ const g=r.proto[k]
    if(!(g?.length>=3) || SA(g)>=0) continue
    const L=r.protoLabels?.[k]; if(!L) continue
    blocks++; const m=g.length; vTot+=m
    for(let i=0;i<m;i++){ edges++; eLen+=Math.hypot(g[(i+1)%m][0]-g[i][0], g[(i+1)%m][1]-g[i][1]) }
    let runs=0; for(let i=0;i<m;i++) if(L[i]!==L[(i-1+m)%m]) runs++
    runsTot += runs||1
    if ((runs||1) <= 8) coarse++ }
  // ── ROW 2 · the carry: does a ② point lie along the ① edge whose label it carries?
  //    ⛔ We do not have the ① edge index on ② directly, so we ask the honest geometric question:
  //    how far is each ② contour point from the NEAREST ① edge of its own block, and is it within
  //    that edge's extent? A point past an edge's end AND far from it is attributed by reach.
  let pts=0, offEdge=0, pastEnd=0, worst=[]
  const holes=[]
  for (let k=0;k<(r.proto||[]).length;k++){ const g=r.proto[k]; if(g?.length>=3 && SA(g)<0) holes.push(g) }
  for (const t of r.protoShapeTiles||[]) {
    for (const ring of (t.iaFull||[])) {
      const probe = ring[0]; if(!probe) continue
      const blk = holes.find(g=>inRing(g,probe[0],probe[1])); if(!blk) continue
      const m = blk.length
      for (const P of ring) {
        let best=null
        for(let i=0;i<m;i++){ const s=segInfo(P, blk[i], blk[(i+1)%m]); if(!best||s.d<best.d) best={...s,i} }
        pts++
        if (best.d > 1.0) offEdge++
        if (best.u < -0.02 || best.u > 1.02) { pastEnd++; if(worst.length<5) worst.push(`(${P[0].toFixed(0)},${P[1].toFixed(0)}) ${(best.u*100).toFixed(0)}% along, ${best.d.toFixed(2)} m off`) }
      }
    }
  }
  console.log(`\n══ ${scene} ══`)
  console.log(`  ① blocks ${blocks} · mean ${(vTot/blocks).toFixed(1)} vertices · mean ${(runsTot/blocks).toFixed(1)} LABEL RUNS · mean edge ${(eLen/edges).toFixed(1)} m`)
  console.log(`     blocks whose ① is cut into ≤8 frontages (a block's worth): ${coarse}/${blocks}`)
  console.log(`  ② contour points ${pts} · >1 m off their nearest ① edge: ${offEdge} (${(100*offEdge/pts).toFixed(1)}%) · BEYOND its ends: ${pastEnd} (${(100*pastEnd/pts).toFixed(1)}%)`)
  for (const w of worst) console.log(`     ⛔ ${w}`)
  if (coarse < blocks || pastEnd) bad++
}
console.log(bad ? `\n⛔ FAIL — ① is cut finer than a block has frontages, and/or ② points are attributed past an ① edge's ends.`
                : `\n✅ PASS — ① is cut into frontages and every ② point lies along its own.`)
process.exit(bad ? 1 : 0)
