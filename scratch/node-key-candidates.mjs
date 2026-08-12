import { readFileSync } from 'fs'
const OSM=JSON.parse(readFileSync('cartograph/data/lafayette-square/raw/osm.json','utf8'))
const SK =JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const chains=SK.streets.filter(s=>Array.isArray(s.points)&&s.points.length>=2)
const EPS=0.5,key=(x,z)=>`${Math.round(x/EPS)}|${Math.round(z/EPS)}`

// POST-weld node graph with owners (chain objects)
const deg=new Map(),pos=new Map(),own=new Map()
for(const s of chains){const p=s.points,n=p.length
  for(let i=0;i<n;i++){const k=key(p[i].x,p[i].z)
    deg.set(k,(deg.get(k)||0)+((i===0||i===n-1)?1:2))
    if(!pos.has(k))pos.set(k,[p[i].x,p[i].z])
    if(!own.has(k))own.set(k,new Set()); own.get(k).add(s)}}

const slug=n=>n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
const nameSet=k=>[...own.get(k)].map(s=>slug(s.name)).filter((v,i,a)=>a.indexOf(v)===i).sort()
const idSet  =k=>[...own.get(k)].map(s=>s.id).sort()

const real=[...deg.keys()].filter(k=>deg.get(k)>=3)
console.log(`=== CANDIDATE 2 — the unordered set of STREET NAMES ===`)
console.log(`real intersections (deg>=3): ${real.length}`)
const byNameSet=new Map()
for(const k of real){const ns=nameSet(k).join('+'); if(!byNameSet.has(ns))byNameSet.set(ns,[]); byNameSet.get(ns).push(k)}
const collide=[...byNameSet.entries()].filter(([,v])=>v.length>1)
console.log(`  distinct name-sets: ${byNameSet.size}`)
console.log(`  ⛔ name-sets shared by >1 node (need a disambiguator): ${collide.length}`)
let collidingNodes=0; for(const [,v] of collide) collidingNodes+=v.length
console.log(`  ⛔ nodes affected: ${collidingNodes} of ${real.length} (${(100*collidingNodes/real.length).toFixed(1)}%)`)
console.log(`\n  the colliding sets:`)
for(const [ns,v] of collide.sort((a,b)=>b[1].length-a[1].length)){
  console.log(`    {${ns}} × ${v.length}  at ${v.map(k=>`[${pos.get(k).map(n=>n.toFixed(0))}]`).join(' ')}`)}
// single-name sets = a street meeting ITSELF (loop/self-touch) or a deg>=3 with one name
const singles=[...byNameSet.keys()].filter(ns=>ns.split('+').length===1)
console.log(`\n  ⚠️ name-sets with only ONE street (self-touch / fragment of same street): ${singles.length}`)

console.log(`\n=== THE DISAMBIGUATOR — how often do the same streets meet twice? ===`)
console.log(`  street-name PAIRS meeting at more than one node: ${collide.length}`)
console.log(`  → a name-set key needs a tiebreak on ${(100*collide.length/byNameSet.size).toFixed(1)}% of sets`)

console.log(`\n=== nameTransitions (continuesAs) — does a name-set survive a rename? ===`)
const nt=SK.nameTransitions||[]
console.log(`  nameTransitions on LS: ${nt.length}`)
if(nt.length) console.log(`  sample: ${JSON.stringify(nt[0]).slice(0,200)}`)
const cont=chains.filter(s=>s.continuesAs)
console.log(`  chains carrying continuesAs: ${cont.length}`)

console.log(`\n=== CANDIDATE 3 — POSITION, measured across the real weld ===`)
// re-run the pre/post comparison but report displacement for deg>=3
const used=new Set(); for(const s of chains) for(const id of (s.sources||[])) used.add(id)
const frags=OSM.ground.highway.filter(f=>used.has(f.osmId)&&f.coords?.length>=2)
const pdeg=new Map(),ppos=new Map()
for(const f of frags){const p=f.coords,n=p.length
  for(let i=0;i<n;i++){const k=key(p[i].x,p[i].z)
    pdeg.set(k,(pdeg.get(k)||0)+((i===0||i===n-1)?1:2)); if(!ppos.has(k))ppos.set(k,[p[i].x,p[i].z])}}
let exact=0,sub=0,maxd=0
for(const [k,d] of pdeg){ if(d<3) continue
  const q=pos.get(k); if(!q){continue}
  const p=ppos.get(k); const dd=Math.hypot(p[0]-q[0],p[1]-q[1])
  if(dd===0)exact++; else sub++
  maxd=Math.max(maxd,dd) }
console.log(`  deg>=3 nodes present in both: exact-coordinate match ${exact}, sub-cell drift ${sub}, MAX displacement ${maxd.toFixed(4)} m`)
