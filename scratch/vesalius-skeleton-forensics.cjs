/**
 * Vesalius — skeleton forensics probe (READ-ONLY diagnostic)
 * Characterizes junction/node precision, T-vs-dead-end, same-name topology,
 * divided/median, and the "third category" of paved positive space.
 *
 * Run: node scratch/vesalius-skeleton-forensics.js
 */
const fs = require('fs')
const RAW = 'cartograph/data/lafayette-square/raw/osm.json'
const SKEL = 'cartograph/data/lafayette-square/clean/skeleton.json'
const osm = JSON.parse(fs.readFileSync(RAW, 'utf8'))
const skel = JSON.parse(fs.readFileSync(SKEL, 'utf8'))
const hw = osm.ground.highway || []

const VEHICULAR = new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link',
  'secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','living_street'])
function isVehicular(f){ return f.tags?.name || VEHICULAR.has(f.tags?.highway) }

const dist = (a,b)=>Math.hypot(a.x-b.x, a.z-b.z)
function ptSegDist(p,a,b){
  const dx=b.x-a.x, dz=b.z-a.z, l2=dx*dx+dz*dz
  if(l2<1e-9) return {d:dist(p,a),t:0}
  let t=((p.x-a.x)*dx+(p.z-a.z)*dz)/l2; t=Math.max(0,Math.min(1,t))
  return {d:Math.hypot(a.x+t*dx-p.x, a.z+t*dz-p.z), t}
}

console.log('===================================================================')
console.log('A) RAW-OSM JUNCTION NODE PRECISION  (vehicular+named highways only)')
console.log('===================================================================')
const vh = hw.filter(isVehicular)
console.log(`vehicular/named ways: ${vh.length}`)
// coord -> set of wayIds sharing that EXACT coord (shared OSM node)
const coordWays = new Map()
for(const f of vh){
  for(const c of f.coords){
    const k = `${c.x.toFixed(2)},${c.z.toFixed(2)}`
    if(!coordWays.has(k)) coordWays.set(k, new Set())
    coordWays.get(k).add(f.osmId)
  }
}
// A shared-node junction = a coord touched by >=2 distinct ways
const sharedNodes = [...coordWays.entries()].filter(([k,s])=>s.size>=2)
console.log(`exact shared-node junctions (>=2 ways at one coord): ${sharedNodes.length}`)
// Now cluster shared-node junctions that sit within 6m of each other = "one real junction"
const jpts = sharedNodes.map(([k])=>{ const [x,z]=k.split(',').map(Number); return {x,z} })
const used = new Array(jpts.length).fill(false)
let clusters=0, multiNodeClusters=0, worstSpan=0, worstExample=null
for(let i=0;i<jpts.length;i++){
  if(used[i]) continue
  const cl=[i]; used[i]=true
  for(let j=i+1;j<jpts.length;j++){
    if(used[j]) continue
    if(jpts[cl[0]] && dist(jpts[i],jpts[j])<6){ cl.push(j); used[j]=true }
  }
  clusters++
  if(cl.length>1){
    multiNodeClusters++
    let span=0
    for(const a of cl) for(const b of cl) span=Math.max(span,dist(jpts[a],jpts[b]))
    if(span>worstSpan){ worstSpan=span; worstExample=jpts[i] }
  }
}
console.log(`junction clusters (<=6m merge): ${clusters}`)
console.log(`  of which MULTI-NODE (real junction split across >1 OSM node): ${multiNodeClusters}`)
console.log(`  worst cluster span: ${worstSpan.toFixed(2)}m near (${worstExample?.x.toFixed(1)},${worstExample?.z.toFixed(1)})`)

console.log('\n===================================================================')
console.log('B) T-JUNCTION DETECTION GAP  (frame uses interior-only noding)')
console.log('===================================================================')
// For each SKELETON street endpoint, classify: dead-end vs T-butt vs cross.
// Use skeleton (the frame) streets.
const streets = skel.streets.filter(s=>s.points && s.points.length>=2)
  .map(s=>({name:s.name, id:s.id, pts:s.points.map(p=>({x:p.x,z:p.z}))}))
function endpoints(s){ return [s.pts[0], s.pts[s.pts.length-1]] }
let trueDead=0, tButtShared=0, tButtInterior=0, nearMiss=0
const interiorTs=[], deadEnds=[]
for(const s of streets){
  for(const ep of endpoints(s)){
    // nearest other street feature
    let bestVertex=Infinity, bestSeg=Infinity, bestOther=null, bestT=0
    for(const o of streets){
      if(o===s) continue
      for(const p of o.pts){ const d=dist(ep,p); if(d<bestVertex) bestVertex=d }
      for(let i=0;i<o.pts.length-1;i++){
        const {d,t}=ptSegDist(ep,o.pts[i],o.pts[i+1])
        if(d<bestSeg){ bestSeg=d; bestOther=o.name; bestT=t }
      }
    }
    if(bestVertex<0.5){ tButtShared++ }            // lands on another street's vertex -> detectable
    else if(bestSeg<0.5){ tButtInterior++; interiorTs.push({s:s.name, on:bestOther, at:ep, t:bestT.toFixed(2)}) } // interior hit -> frame-invisible T
    else if(bestSeg<3){ nearMiss++ }               // close but gap -> ambiguous
    else { trueDead++; deadEnds.push({s:s.name, at:ep}) }  // isolated -> true dead-end
  }
}
console.log(`skeleton endpoints classified (${streets.length} streets, ${streets.length*2} endpoints):`)
console.log(`  T-butt on shared vertex (frame can detect):       ${tButtShared}`)
console.log(`  T-butt on segment INTERIOR (FRAME-INVISIBLE):     ${tButtInterior}`)
console.log(`  near-miss 0.5-3m (ambiguous gap):                 ${nearMiss}`)
console.log(`  true dead-end (isolated >3m):                     ${trueDead}`)
console.log(`  --- frame-invisible T examples (street ends mid-interior of another): ---`)
for(const t of interiorTs.slice(0,12)) console.log(`    "${t.s}" butts onto "${t.on}" at t=${t.t}  (${t.at.x.toFixed(1)},${t.at.z.toFixed(1)})`)
console.log(`  --- candidate true dead-ends (sample, need cap decision): ---`)
for(const d of deadEnds.slice(0,12)) console.log(`    "${d.s}" at (${d.at.x.toFixed(1)},${d.at.z.toFixed(1)})`)

console.log('\n===================================================================')
console.log('C) SAME-NAME DISCONTINUOUS TOPOLOGY  (cul-de-sac <-> through candidates)')
console.log('===================================================================')
const byName = new Map()
for(const s of streets){ if(!s.name) continue; if(!byName.has(s.name)) byName.set(s.name,[]); byName.get(s.name).push(s) }
const multi = [...byName.entries()].filter(([n,a])=>a.length>1)
console.log(`names emitted as >1 skeleton chain: ${multi.length}`)
for(const [n,a] of multi){
  // measure min gap between the chains' endpoints
  let minGap=Infinity
  for(let i=0;i<a.length;i++) for(let j=i+1;j<a.length;j++){
    for(const e1 of endpoints(a[i])) for(const e2 of endpoints(a[j])) minGap=Math.min(minGap,dist(e1,e2))
  }
  console.log(`  "${n}": ${a.length} chains, min endpoint gap ${minGap.toFixed(1)}m  [${a.map(c=>c.pts.length+'pt').join(', ')}]`)
}

console.log('\n===================================================================')
console.log('D) NAME-CHANGE CANONICAL CASE  (Dolman / 18th U-street)')
console.log('===================================================================')
for(const needle of ['Dolman','18th','Dillon','Mississippi','Ann','Park']){
  const hits = streets.filter(s=>s.name && s.name.includes(needle))
  if(hits.length) console.log(`  "${needle}": ${hits.map(h=>`${h.name}[${h.pts.length}pt]`).join(', ')}`)
}

console.log('\n===================================================================')
console.log('E) THIRD CATEGORY  (paved positive space that is neither street nor block)')
console.log('===================================================================')
// area:highway, man_made, traffic islands, plazas, medians
const areaHw = hw.filter(f=>f.tags?.area==='yes')
console.log(`highway ways tagged area=yes (plazas/aprons): ${areaHw.length}`)
for(const f of areaHw.slice(0,12)) console.log(`    osm${f.osmId} highway=${f.tags.highway} name=${f.tags.name||'-'} ${f.coords.length}pt`)
const crossingIsland = hw.filter(f=>f.tags?.['crossing:island']==='yes')
console.log(`ways tagged crossing:island=yes (refuge islands): ${crossingIsland.length}`)
const ground = osm.ground
console.log(`man_made ways: ${(ground.man_made||[]).length}`)
for(const f of (ground.man_made||[]).slice(0,10)) console.log(`    man_made=${f.tags.man_made} name=${f.tags.name||'-'}`)
// landuse that might be median/traffic
const luTypes = {}
for(const f of (ground.landuse||[])){ const t=f.tags.landuse; luTypes[t]=(luTypes[t]||0)+1 }
console.log('landuse types present:', JSON.stringify(luTypes))

console.log('\n===================================================================')
console.log('F) DIVIDED / MEDIAN  (oneway antiparallel pairs)')
console.log('===================================================================')
const oneway = vh.filter(f=>f.tags?.oneway==='yes')
console.log(`oneway vehicular/named ways: ${oneway.length}`)
const onewayNames = {}
for(const f of oneway){ const n=f.tags.name||'(unnamed '+f.tags.highway+')'; onewayNames[n]=(onewayNames[n]||0)+1 }
console.log('oneway by name:')
for(const [n,c] of Object.entries(onewayNames).sort((a,b)=>b[1]-a[1])) console.log(`    ${n}: ${c}`)
