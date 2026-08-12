import { readFileSync } from 'fs'
const SK=JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const RB=JSON.parse(readFileSync('src/data/ribbons.json','utf8'))
const NB=JSON.parse(readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const cx=NB.center[0],cz=NB.center[1],keepR=NB.streetFade.outer+30,R2=keepR*keepR
function clipRun(pts){const inC=(x,z)=>(x-cx)**2+(z-cz)**2<=R2
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
  close();if(!pieces.length)return null
  return pieces.reduce((p,q)=>q.length>p.length?q:p)}

const byId=new Map(RB.streets.map(s=>[s.skelId,s]))
let match=0, ptCountDiff=0, geomDiff=0, maxDev=0, missing=0
const diffs=[]
for(const s of SK.streets){
  const pts=(s.points||[]).map(p=>[p.x,p.z]); if(pts.length<2) continue
  const exp=clipRun(pts); const got=byId.get(s.id)
  if(!got){ if(exp) missing++; continue }
  const gp=got.points||[]
  if(!exp){ continue }
  if(gp.length!==exp.length){ ptCountDiff++; diffs.push([s.id,'ptcount',exp.length,gp.length]); continue }
  let dev=0; for(let i=0;i<gp.length;i++) dev=Math.max(dev,Math.hypot(gp[i][0]-exp[i][0],gp[i][1]-exp[i][1]))
  maxDev=Math.max(maxDev,dev)
  if(dev>0.06) { geomDiff++; diffs.push([s.id,'geom',dev.toFixed(3)]) } else match++
}
console.log('=== DRIFT FLOOR: committed ribbons.json vs (skeleton.json + clipRun) ===')
console.log(`  chains matching within 0.06 m (the 0.1 m serializer rounding): ${match}`)
console.log(`  chains with a DIFFERENT vertex count:                          ${ptCountDiff}`)
console.log(`  chains present but geometrically diverged:                     ${geomDiff}`)
console.log(`  chains the clip keeps but ribbons.json lacks:                  ${missing}`)
console.log(`  max per-vertex deviation across all matched chains:            ${maxDev.toFixed(4)} m`)
for(const d of diffs.slice(0,25)) console.log('   ',d.join(' | '))
console.log(`\n=== junctionMap / node counts (POLYGON-FIRST §2.1's "233 vs 228") ===`)
const jm=RB.junctionMap
console.log('  junctionMap keys:',jm?Object.keys(jm):'ABSENT')
if(jm?.nodes) console.log('  junctionMap.nodes:',jm.nodes.length)
console.log('  ribbons.junctions:',(RB.junctions||[]).length)
console.log('  skeleton.junctions:',(SK.junctions||[]).length)
console.log('  ribbons.intersections:',(RB.intersections||[]).length)
console.log('  ribbons.tiles:',(RB.tiles||[]).length)
