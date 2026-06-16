/**
 * Vesalius — raw-vs-us probe + Dolman/18th trace (READ-ONLY)
 * 1. For each frame-invisible interior-T, was there a coincident SHARED NODE
 *    in raw OSM that we simplified/welded away?  -> diagnoses US vs OSM.
 * 2. Trace the Dolman -> 18th U-street end to end.
 */
const fs = require('fs')
const osm = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/raw/osm.json','utf8'))
const skel = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const hw = osm.ground.highway || []
const VEH = new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link',
  'secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','living_street'])
const vh = hw.filter(f=>f.tags?.name || VEH.has(f.tags?.highway))
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
function ptSeg(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;if(l2<1e-9)return{d:dist(p,a),t:0};let t=((p.x-a.x)*dx+(p.z-a.z)*dz)/l2;t=Math.max(0,Math.min(1,t));return{d:Math.hypot(a.x+t*dx-p.x,a.z+t*dz-p.z),t}}

// raw OSM vertex set (vehicular) -> coord -> count of ways
const rawVerts = []
for(const f of vh) for(const c of f.coords) rawVerts.push({x:c.x,z:c.z})

const streets = skel.streets.filter(s=>s.points&&s.points.length>=2).map(s=>({name:s.name,pts:s.points.map(p=>({x:p.x,z:p.z}))}))
function endpoints(s){return[s.pts[0],s.pts[s.pts.length-1]]}

// recompute the 79 interior-Ts, then ask: raw shared node within 0.5m?
let usCreated=0, genuineOsmGap=0
const examples=[]
for(const s of streets){
  for(const ep of endpoints(s)){
    let bestVertex=Infinity,bestSeg=Infinity,bestOther=null
    for(const o of streets){ if(o===s)continue
      for(const p of o.pts){const d=dist(ep,p);if(d<bestVertex)bestVertex=d}
      for(let i=0;i<o.pts.length-1;i++){const{d}=ptSeg(ep,o.pts[i],o.pts[i+1]);if(d<bestSeg){bestSeg=d;bestOther=o.name}}
    }
    if(bestVertex>=0.5 && bestSeg<0.5){ // interior-T
      // was there a raw OSM vertex (shared node) within 0.5m of ep?
      let rawNear=Infinity
      for(const rv of rawVerts){const d=dist(ep,rv);if(d<rawNear)rawNear=d}
      if(rawNear<0.5){ usCreated++; if(examples.length<10) examples.push({s:s.name,on:bestOther,ep,rawNear:rawNear.toFixed(2)}) }
      else genuineOsmGap++
    }
  }
}
console.log('=== Were the 79 frame-invisible Ts created by US (simplification) or genuine OSM gaps? ===')
console.log(`  raw OSM HAD a shared node there (WE removed it via RDP/weld): ${usCreated}`)
console.log(`  genuine OSM gap (no raw node, terminating way ends mid-segment): ${genuineOsmGap}`)
console.log('  examples of US-created interior-Ts (raw node existed, distance to nearest raw vertex):')
for(const e of examples) console.log(`    "${e.s}" -> "${e.on}" at (${e.ep.x.toFixed(1)},${e.ep.z.toFixed(1)}) rawNode ${e.rawNear}m away`)

console.log('\n=== Simplification aggressiveness: how many raw vertices survive into skeleton? ===')
let rawCount=0; for(const f of vh) rawCount+=f.coords.length
let skelCount=0; for(const s of streets) skelCount+=s.pts.length
console.log(`  raw vehicular vertices: ${rawCount}  ->  skeleton vertices: ${skelCount}  (${Math.round(100*(1-skelCount/rawCount))}% removed)`)

console.log('\n=== DOLMAN -> 18th U-STREET TRACE ===')
// gather raw fragments named Dolman or *18th*
const uFrags = hw.filter(f=>{const n=f.tags?.name||'';return /Dolman|18th/.test(n)})
console.log(`raw OSM fragments matching Dolman|18th: ${uFrags.length}`)
for(const f of uFrags){
  const a=f.coords[0], b=f.coords[f.coords.length-1]
  console.log(`  osm${f.osmId} "${f.tags.name}" hw=${f.tags.highway} oneway=${f.tags.oneway||'-'} lanes=${f.tags.lanes||'-'} ${f.coords.length}pt  [${a.x.toFixed(0)},${a.z.toFixed(0)}]->[${b.x.toFixed(0)},${b.z.toFixed(0)}]`)
}
// Do Dolman and 18th share an endpoint (the name-transition point)?
const dolman = uFrags.filter(f=>/Dolman/.test(f.tags.name))
const eighteen = uFrags.filter(f=>/18th/.test(f.tags.name))
console.log('\n  name-transition search (Dolman endpoint vs 18th endpoint within 2m):')
for(const d of dolman){
  for(const e of [d.coords[0], d.coords[d.coords.length-1]]){
    for(const x of eighteen){
      for(const xe of [x.coords[0], x.coords[x.coords.length-1]]){
        const dd=dist(e,xe)
        if(dd<2) console.log(`    Dolman osm${d.osmId} endpoint (${e.x.toFixed(1)},${e.z.toFixed(1)}) == 18th osm${x.osmId} endpoint  gap ${dd.toFixed(2)}m  <-- NAME TRANSITION POINT`)
      }
    }
  }
}
