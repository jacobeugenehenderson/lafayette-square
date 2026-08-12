// READ-ONLY. Same as v1 but the PRE-weld set is restricted to the fragments that
// ACTUALLY became streets (osmId ∈ some chain's `sources`) — apples to apples.
import { readFileSync } from 'fs'
const OSM=JSON.parse(readFileSync('cartograph/data/lafayette-square/raw/osm.json','utf8'))
const SK =JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const chains=SK.streets.filter(s=>Array.isArray(s.points)&&s.points.length>=2)
const used=new Set(); for(const s of chains) for(const id of (s.sources||s.osmIds||[])) used.add(id)
const frags=OSM.ground.highway.filter(f=>used.has(f.osmId)&&Array.isArray(f.coords)&&f.coords.length>=2)
console.log(`fragments that became streets: ${frags.length} of ${OSM.ground.highway.length}  →  ${chains.length} chains`)

const EPS=0.5, key=(x,z)=>`${Math.round(x/EPS)}|${Math.round(z/EPS)}`
function graph(items,getPts){
  const deg=new Map(),pos=new Map(),own=new Map()
  for(const it of items){const p=getPts(it),n=p.length
    for(let i=0;i<n;i++){const k=key(p[i][0],p[i][1])
      deg.set(k,(deg.get(k)||0)+((i===0||i===n-1)?1:2))
      if(!pos.has(k))pos.set(k,p[i])
      if(!own.has(k))own.set(k,new Set()); own.get(k).add(it)}}
  return {deg,pos,own}
}
const PRE=graph(frags,f=>f.coords.map(c=>[c.x,c.z]))
const POST=graph(chains,s=>s.points.map(p=>[p.x,p.z]))
const postList=[...POST.pos.entries()].map(([k,p])=>({k,p}))
const nearestPost=(p,R=5)=>{let b=null,bd=R;for(const q of postList){const d=Math.hypot(q.p[0]-p[0],q.p[1]-p[1]);if(d<bd){bd=d;b=q}}return b?{...b,d:bd}:null}

const buckets=new Map()
const B=d=>{const k=d>=5?'5+':String(d);if(!buckets.has(k))buckets.set(k,{s:0,m:0,x:0,md:[]});return buckets.get(k)}
for(const [k,d] of PRE.deg){
  const b=B(d),p=PRE.pos.get(k)
  if(POST.deg.has(k)){b.s++;continue}
  const n=nearestPost(p); if(n){b.m++;b.md.push(n.d)}else b.x++
}
console.log(`\nPRE-weld nodes: ${PRE.deg.size}   POST-weld nodes: ${POST.deg.size}\n`)
console.log('geometric degree | count | SURVIVES | MOVES(<5m) | DISSOLVES | median move')
for(const k of ['1','2','3','4','5+']){const b=buckets.get(k);if(!b)continue
  const n=b.s+b.m+b.x, md=b.md.length?b.md.slice().sort((x,y)=>x-y)[Math.floor(b.md.length/2)].toFixed(2)+' m':'—'
  console.log(`  deg ${k.padEnd(12)} | ${String(n).padStart(5)} | ${String(b.s).padStart(8)} | ${String(b.m).padStart(10)} | ${String(b.x).padStart(9)} | ${md}`)}
const real=['3','4','5+'].reduce((a,k)=>{const b=buckets.get(k);return b?{s:a.s+b.s,m:a.m+b.m,x:a.x+b.x}:a},{s:0,m:0,x:0})
const seam=buckets.get('2')||{s:0,m:0,x:0}
console.log(`\n⭐ deg>=3 (real intersections): ${real.s} survive · ${real.m} move · ${real.x} dissolve  → survival ${(100*real.s/(real.s+real.m+real.x)).toFixed(1)}%`)
console.log(`   deg==2 (seams + bends):      ${seam.s} survive · ${seam.m} move · ${seam.x} dissolve  → dissolution ${(100*seam.x/(seam.s+seam.m+seam.x)).toFixed(1)}%`)
// Where do the deg>=3 dissolvers go? RDP removes interior bends but junctions are PROTECTED.
console.log(`\n── the deg>=3 that did NOT survive: how far is the nearest post node? ──`)
const far=[]
for(const [k,d] of PRE.deg){ if(d<3||POST.deg.has(k)) continue
  const p=PRE.pos.get(k); const n=nearestPost(p,50); far.push({p,d,dist:n?n.d:Infinity}) }
far.sort((a,b)=>a.dist-b.dist)
const within=(t)=>far.filter(f=>f.dist<=t).length
console.log(`   total ${far.length};  <=0.5m: ${within(0.5)}  <=1m: ${within(1)}  <=2m: ${within(2)}  <=5m: ${within(5)}  <=50m: ${within(50)}  none within 50m: ${far.filter(f=>!isFinite(f.dist)).length}`)
