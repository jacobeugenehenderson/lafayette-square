import { readFileSync } from 'fs'
import { resolveChainSegmentation } from '../src/lib/buildBlockGeometryV2.js'
const SK=JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const RB=JSON.parse(readFileSync('src/data/ribbons.json','utf8'))
const D =JSON.parse(readFileSync('public/looks/lafayette-square/design.json','utf8'))
const EPS=0.5,key=(x,z)=>`${Math.round(x/EPS)}|${Math.round(z/EPS)}`
const chains=SK.streets.filter(s=>s.points?.length>=2)
const deg=new Map(),pos=new Map()
for(const s of chains){const p=s.points,n=p.length
  for(let i=0;i<n;i++){const k=key(p[i].x,p[i].z)
    deg.set(k,(deg.get(k)||0)+((i===0||i===n-1)?1:2)); if(!pos.has(k))pos.set(k,[p[i].x,p[i].z])}}

// ── the safe tolerance ceiling: nearest-neighbour distance among deg>=3 nodes ──
const real=[...deg.keys()].filter(k=>deg.get(k)>=3).map(k=>pos.get(k))
let mind=Infinity, hist={}
const dists=[]
for(let i=0;i<real.length;i++){let best=Infinity
  for(let j=0;j<real.length;j++){if(i===j)continue
    const d=Math.hypot(real[i][0]-real[j][0],real[i][1]-real[j][1]); if(d<best)best=d}
  dists.push(best); mind=Math.min(mind,best)}
dists.sort((a,b)=>a-b)
console.log('=== THE POSITION-CONSULT TOLERANCE CEILING ===')
console.log(`  deg>=3 nodes: ${real.length}`)
console.log(`  nearest-neighbour distance — min ${dists[0].toFixed(2)} m · p05 ${dists[Math.floor(dists.length*.05)].toFixed(2)} m · median ${dists[Math.floor(dists.length/2)].toFixed(2)} m`)
console.log(`  ⇒ a position consult is unambiguous for any tolerance < ${dists[0].toFixed(2)} m`)
console.log(`  nodes closer than 2 m to another node: ${dists.filter(d=>d<2).length}`)
console.log(`  nodes closer than 5 m to another node: ${dists.filter(d=>d<5).length}`)

// ── does (nodeA,nodeB) carry the 30 authored slots? ──
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
console.log('\n=== DOES (nodeA,nodeB) REPLACE segOrd FOR THE 30 AUTHORED SLOTS? ===')
console.log('slot                                 | endpoint degrees | verdict')
const bc=D.blockCustoms||{}
let good=0,bad=0,caps=0
const badRows=[]
for(const skel of Object.keys(bc))for(const side of Object.keys(bc[skel]))for(const so of Object.keys(bc[skel][side])){
  const n=Number(so), tag=`${skel}|${side}|${so}`.padEnd(36)
  if(n<0){caps++;console.log(`${tag} | —                | CAP: keyed chain+end, needs ONE node id (the tip)`);continue}
  const S=segsOf.get(skel); if(!S||!S[n]){bad++;console.log(`${tag} | ?                | ⛔ unresolved today`);continue}
  const da=degAt(S[n].a), db=degAt(S[n].b)
  const ok=da>=3&&db>=3
  if(ok)good++; else {bad++; badRows.push([tag.trim(),da,db])}
  console.log(`${tag} | ${String(da).padStart(2)} , ${String(db).padStart(2)}           | ${ok?'✅ both ends are stable deg>=3 nodes':'⛔ an endpoint is deg<3 — NOT stably keyable'}`)
}
console.log(`\n  ✅ keyable by (nodeA,nodeB): ${good}`)
console.log(`  ⛔ not keyable:              ${bad}`)
console.log(`  caps (single node id):       ${caps}`)
if(badRows.length){console.log('\n  the unkeyable ones:'); for(const r of badRows) console.log(`    ${r[0]}  degrees ${r[1]},${r[2]}`)}
