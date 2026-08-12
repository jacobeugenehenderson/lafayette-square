// READ-ONLY. Classify every PRE-weld node against the POST-weld skeleton.
// Pre-weld  = raw OSM highway fragments (cartograph/data/<scene>/raw/osm.json)
// Post-weld = clean/skeleton.json chains (the real weld skeleton.js performs)
import { readFileSync } from 'fs'
const OSM=JSON.parse(readFileSync('cartograph/data/lafayette-square/raw/osm.json','utf8'))
const SK =JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))

// skeleton.js excludes some names from streets; mirror the vehicular filter loosely
// by using ALL highway fragments — over-inclusive is safe, it only adds pre-weld nodes.
const frags = OSM.ground.highway.filter(f=>Array.isArray(f.coords)&&f.coords.length>=2)
const chains= SK.streets.filter(s=>Array.isArray(s.points)&&s.points.length>=2)

const EPS=0.5, key=(x,z)=>`${Math.round(x/EPS)}|${Math.round(z/EPS)}`
// geometric degree: endpoint contributes 1 arm, interior contributes 2 (tileGround nodeDeg)
function graph(items, getPts){
  const deg=new Map(), pos=new Map(), owners=new Map()
  for(const it of items){
    const p=getPts(it); const n=p.length
    for(let i=0;i<n;i++){
      const k=key(p[i][0],p[i][1])
      const arms=(i===0||i===n-1)?1:2
      deg.set(k,(deg.get(k)||0)+arms)
      if(!pos.has(k)) pos.set(k,p[i])
      if(!owners.has(k)) owners.set(k,new Set())
      owners.get(k).add(it)
    }
  }
  return {deg,pos,owners}
}
const PRE = graph(frags, f=>f.coords.map(c=>[c.x,c.z]))
const POST= graph(chains,s=>s.points.map(p=>[p.x,p.z]))

// nearest post-weld node within R, for MOVES detection
const postList=[...POST.pos.entries()].map(([k,p])=>({k,p}))
function nearestPost(p,R=5){
  let best=null,bd=R
  for(const q of postList){const d=Math.hypot(q.p[0]-p[0],q.p[1]-p[1]); if(d<bd){bd=d;best=q}}
  return best?{...best,d:bd}:null
}

const buckets=new Map() // degree -> {survives,dissolves,moves,moveDists[]}
function B(d){const k=d>=5?'5+':String(d); if(!buckets.has(k))buckets.set(k,{survives:0,dissolves:0,moves:0,md:[]}); return buckets.get(k)}
let total=0
for(const [k,d] of PRE.deg){
  total++
  const b=B(d), p=PRE.pos.get(k)
  if(POST.deg.has(k)){ b.survives++; continue }
  const near=nearestPost(p)
  if(near){ b.moves++; b.md.push(near.d) } else b.dissolves++
}
console.log(`PRE-weld nodes (raw OSM highway fragments): ${total}`)
console.log(`POST-weld nodes (skeleton chains):          ${POST.deg.size}\n`)
console.log('geometric degree | count | SURVIVES (same 0.5m cell) | MOVES (<5m) | DISSOLVES | median move')
const order=['1','2','3','4','5+']
for(const k of order){
  const b=buckets.get(k); if(!b) continue
  const n=b.survives+b.moves+b.dissolves
  const md=b.md.length?b.md.slice().sort((x,y)=>x-y)[Math.floor(b.md.length/2)].toFixed(2)+' m':'—'
  console.log(`  deg ${k.padEnd(12)} | ${String(n).padStart(5)} | ${String(b.survives).padStart(24)} | ${String(b.moves).padStart(11)} | ${String(b.dissolves).padStart(9)} | ${md}`)
}
// The hypothesis, stated as a number
const real=['3','4','5+'].reduce((a,k)=>{const b=buckets.get(k);return b?{s:a.s+b.survives,m:a.m+b.moves,x:a.x+b.dissolves}:a},{s:0,m:0,x:0})
const seam=buckets.get('2')||{survives:0,moves:0,dissolves:0}
console.log(`\n⭐ THE HYPOTHESIS — "a real intersection (deg>=3) does not move when fragments weld"`)
console.log(`   deg>=3 nodes: ${real.s} survive in the SAME 0.5 m cell, ${real.m} move, ${real.x} dissolve`)
console.log(`   → survival rate: ${(100*real.s/(real.s+real.m+real.x)).toFixed(1)}%`)
console.log(`   deg==2 (fragment seams + bends): ${seam.survives} survive, ${seam.moves} move, ${seam.dissolves} dissolve`)
console.log(`   → dissolution rate: ${(100*seam.dissolves/(seam.survives+seam.moves+seam.dissolves)).toFixed(1)}%`)
