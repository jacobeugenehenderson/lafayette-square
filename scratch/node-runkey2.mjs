import { readFileSync } from 'fs'
import { resolveChainSegmentation } from '../src/lib/buildBlockGeometryV2.js'
const SK=JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const RB=JSON.parse(readFileSync('src/data/ribbons.json','utf8'))
const D =JSON.parse(readFileSync('public/looks/lafayette-square/design.json','utf8'))
const EPS=0.5,key=(x,z)=>`${Math.round(x/EPS)}|${Math.round(z/EPS)}`
const chains=SK.streets.filter(s=>s.points?.length>=2)
const deg=new Map()
for(const s of chains){const p=s.points,n=p.length
  for(let i=0;i<n;i++){const k=key(p[i].x,p[i].z);deg.set(k,(deg.get(k)||0)+((i===0||i===n-1)?1:2))}}
// MEASURED stable set: deg>=3 (229/229 survive) OR deg==1 (100/100 survive). deg==2 dissolves 74%.
const stable=d=>d>=3||d===1
const streets=RB.streets.filter(s=>Array.isArray(s.points)&&s.points.length>=2)
const ix=resolveChainSegmentation(streets)
const segsOf=new Map()
for(const s of streets){const n=s.points.length,set=ix.get(s)
  const ixs=set?[...set].filter(i=>Number.isInteger(i)&&i>0&&i<n-1).sort((a,b)=>a-b):[]
  const out=[];let prev=0
  if(!ixs.length)out.push({start:0,end:n-1})
  else{for(const i of ixs){if(i>prev)out.push({start:prev,end:i});prev=i}if(prev<n-1)out.push({start:prev,end:n-1})}
  segsOf.set(s.skelId,out.map(g=>({...g,a:s.points[g.start],b:s.points[g.end]})))}
const degAt=p=>deg.get(key(p[0],p[1]))??0
const bc=D.blockCustoms||{}
let good=0,absent=0,unstable=0,caps=0
const rows=[]
for(const skel of Object.keys(bc))for(const side of Object.keys(bc[skel]))for(const so of Object.keys(bc[skel][side])){
  const n=Number(so),tag=`${skel}|${side}|${so}`
  if(n<0){caps++;continue}
  const S=segsOf.get(skel); if(!S||!S[n]){absent++;rows.push([tag,'—','unresolved']);continue}
  const da=degAt(S[n].a),db=degAt(S[n].b)
  if(da===0||db===0){absent++;rows.push([tag,`${da},${db}`,'⛔ endpoint ABSENT from skeleton (derive drift, not a node problem)'])}
  else if(stable(da)&&stable(db))good++
  else {unstable++;rows.push([tag,`${da},${db}`,'⛔ deg-2 endpoint — genuinely unstable'])}
}
console.log('=== (nodeA,nodeB) WITH THE MEASURED STABLE SET (deg>=3 or deg==1) ===')
console.log(`  ✅ keyable:                                        ${good} of 28 segOrd slots`)
console.log(`  ⛔ endpoint absent from skeleton (derive drift):    ${absent}`)
console.log(`  ⛔ endpoint is a deg-2 seam (genuinely unstable):   ${unstable}`)
console.log(`  caps — need ONE node id (the deg-1 tip, 100% stable): ${caps}`)
console.log('\n  the failures:')
for(const r of rows) console.log(`    ${r[0].padEnd(34)} deg ${String(r[1]).padEnd(6)} ${r[2]}`)
