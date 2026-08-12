import { readFileSync } from 'fs'
const SK=JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const NB=JSON.parse(readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const cx=NB.center[0],cz=NB.center[1],keepR=NB.streetFade.outer+30,R2=keepR*keepR
function clipPieces(pts){const inC=(x,z)=>(x-cx)**2+(z-cz)**2<=R2
  const pieces=[];let cur=null
  const close=()=>{if(cur&&cur.length>=2)pieces.push(cur);cur=null}
  const push=(p)=>{if(!cur){cur=[p];return}const l=cur[cur.length-1];if(l[0]!==p[0]||l[1]!==p[1])cur.push(p)}
  for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],A=dx*dx+dz*dz;const ts=[]
    if(A>1e-12){const fx=a[0]-cx,fz=a[1]-cz,B=2*(fx*dx+fz*dz),C=fx*fx+fz*fz-R2,disc=B*B-4*A*C
      if(disc>0){const sq=Math.sqrt(disc);for(const t of[(-B-sq)/(2*A),(-B+sq)/(2*A)])if(t>1e-9&&t<1-1e-9)ts.push(t)}}
    ts.sort((x,y)=>x-y);const stops=[0,...ts,1]
    for(let s=0;s<stops.length-1;s++){const t0=stops[s],t1=stops[s+1];if(t1-t0<1e-9)continue
      const mt=(t0+t1)/2
      if(inC(a[0]+dx*mt,a[1]+dz*mt)){push([a[0]+dx*t0,a[1]+dz*t0]);push([a[0]+dx*t1,a[1]+dz*t1])}else close()}}
  close();return pieces}
const rIn=(p)=>Math.hypot(p[0]-cx,p[1]-cz)<=keepR
let fullyInside=0, gainedVerts=0, totalDup=0, maxDupDist=0, exactDup=0
const rows=[]
for(const s of SK.streets){
  const pts=(s.points||[]).map(p=>[p.x,p.z]); if(pts.length<2) continue
  if(!pts.every(rIn)) continue           // ← genuinely fully inside: the clip must be a NO-OP
  fullyInside++
  const pieces=clipPieces(pts); const best=pieces.reduce((a,b)=>b.length>a.length?b:a)
  if(best.length===pts.length) continue
  gainedVerts++
  // locate the inserted vertices
  const dups=[]
  for(let i=1;i<best.length;i++){const d=Math.hypot(best[i][0]-best[i-1][0],best[i][1]-best[i-1][1]); if(d<1e-6){dups.push({i,d});totalDup++;maxDupDist=Math.max(maxDupDist,d);if(d===0)exactDup++}}
  rows.push([s.id,pts.length,best.length,dups.map(d=>`@${d.i} gap=${d.d.toExponential(2)}`).join(' ')])
}
console.log(`chains FULLY INSIDE keepR (clip must be a no-op): ${fullyInside}`)
console.log(`  of those, chains where clipRun CHANGED the vertex count: ${gainedVerts}`)
console.log(`  inserted near-duplicate vertices: ${totalDup} (exact-zero gap: ${exactDup}, max gap: ${maxDupDist.toExponential(2)} m)`)
console.log(`\n  id | pts before | pts after | inserted`)
for(const r of rows) console.log('  '+r.join(' | '))
