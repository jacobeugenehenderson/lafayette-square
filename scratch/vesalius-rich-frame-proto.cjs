/**
 * Vesalius — RICH-FRAME PROTOTYPE (READ-ONLY demonstration, NOT production)
 *
 * Thesis: the marrow is already in raw OSM. We prove it is extractable by
 * re-deriving a richer skeleton that the current pipeline throws away:
 *   1. Re-node from raw coords (shared OSM nodes survive as identical coords).
 *   2. Classify every junction node: dead-end / T-butt / cross / Y/complex.
 *   3. Emit the END-CAP DECISION as a frame fact (round @ dead-end, butt @ T).
 *   4. Junction-PROTECTED simplification: collapse only collinear degree-2
 *      runs, never a junction or a curve vertex -> recovers ALL junctions
 *      the production RDP destroyed, at a similar node count.
 *   5. Ingest dropped attributes (lanes/oneway/surface/maxspeed).
 *   6. Standards-seed an ordinary street's full cross-section (north-star).
 *
 * Run: node scratch/vesalius-rich-frame-proto.cjs
 */
const fs = require('fs')
const osm = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/raw/osm.json','utf8'))
const hw = osm.ground.highway || []
const VEH = new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link',
  'secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','living_street'])
const vh = hw.filter(f=>f.tags?.name || VEH.has(f.tags?.highway))
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
const key=c=>`${c.x.toFixed(2)},${c.z.toFixed(2)}`

// ---- 1. Planar graph from raw coords (exact shared nodes) -----------------
// node -> set of incident (wayId, neighborKey) ; we count degree by distinct
// graph edges at the node.
const nodeDeg = new Map()      // key -> degree (number of segment-ends)
const nodeWays = new Map()     // key -> Set(wayId)
const nodePt = new Map()
for(const f of vh){
  for(let i=0;i<f.coords.length;i++){
    const c=f.coords[i], k=key(c)
    nodePt.set(k,{x:c.x,z:c.z})
    if(!nodeWays.has(k)) nodeWays.set(k,new Set())
    nodeWays.get(k).add(f.osmId)
    // degree contribution: each interior vertex has 2 incident segs, endpoints 1
    let inc = (i===0||i===f.coords.length-1)?1:2
    nodeDeg.set(k,(nodeDeg.get(k)||0)+inc)
  }
}
// classify
let dead=0,thru=0,Tjun=0,cross=0,complex=0
const deadNodes=[], Tnodes=[]
for(const [k,deg] of nodeDeg){
  if(deg===1){ dead++; deadNodes.push(k) }
  else if(deg===2){ thru++ }
  else if(deg===3){ Tjun++; Tnodes.push(k) }
  else if(deg===4){ cross++ }
  else { complex++ }
}
console.log('=== 1-3. JUNCTION TYPOLOGY recovered from raw OSM (a frame OUTPUT) ===')
console.log(`  total graph nodes: ${nodeDeg.size}`)
console.log(`  deg1 DEAD-END  -> round cap : ${dead}`)
console.log(`  deg2 thru/bend -> weld/keep : ${thru}`)
console.log(`  deg3 T-JUNCTION-> butt leg, no cap on terminator : ${Tjun}`)
console.log(`  deg4 CROSS                  : ${cross}`)
console.log(`  deg5+ Y/complex             : ${complex}`)
console.log(`  => every endcap & corner decision is now a NODE FACT, not a downstream guess.`)

// ---- 4. Junction-protected simplification ---------------------------------
// Production RDP removed 48% of vertices and destroyed 79 T-nodes. Here we
// protect any vertex that is a junction (deg!=2) and collapse only collinear
// deg-2 runs whose deviation < devTol. Curve vertices (turn>angleTol) are kept.
function simplifyProtected(coords, junctionKeys, devTol, angleTolDeg){
  const angleTol=angleTolDeg*Math.PI/180
  if(coords.length<=2) return coords.slice()
  const out=[coords[0]]
  for(let i=1;i<coords.length-1;i++){
    const prev=out[out.length-1], cur=coords[i], nxt=coords[i+1]
    if(junctionKeys.has(key(cur))){ out.push(cur); continue } // PROTECT junction
    // perp deviation
    const dx=nxt.x-prev.x,dz=nxt.z-prev.z,l2=dx*dx+dz*dz
    let dev; if(l2<1e-9) dev=dist(cur,prev)
    else{let t=((cur.x-prev.x)*dx+(cur.z-prev.z)*dz)/l2;t=Math.max(0,Math.min(1,t));dev=Math.hypot(prev.x+t*dx-cur.x,prev.z+t*dz-cur.z)}
    const a1=Math.atan2(cur.z-prev.z,cur.x-prev.x),a2=Math.atan2(nxt.z-cur.z,nxt.x-cur.x)
    let turn=Math.abs(a2-a1); if(turn>Math.PI)turn=2*Math.PI-turn
    if(dev<devTol && turn<angleTol) continue // collapse noise on straight
    out.push(cur)
  }
  out.push(coords[coords.length-1])
  return out
}
const junctionKeys = new Set([...nodeDeg.entries()].filter(([k,d])=>d!==2).map(([k])=>k))
let rawV=0, protV=0
for(const f of vh){ rawV+=f.coords.length; protV += simplifyProtected(f.coords, junctionKeys, 0.2, 2).length }
console.log('\n=== 4. JUNCTION-PROTECTED simplification (Goldilocks) ===')
console.log(`  raw vehicular vertices:        ${rawV}`)
console.log(`  protected-simplified:          ${protV}  (${Math.round(100*(1-protV/rawV))}% removed)`)
console.log(`  production skeleton (for ref):  1431  (48% removed) -- but it DESTROYED 79 T-nodes`)
console.log(`  protected keeps ALL ${junctionKeys.size} junction nodes -> 0 lost junctions.`)

// ---- 4b. Goldilocks lower bound: widest-ribbon offset safety -------------
// A wide ribbon offset of a polyline opens gaps/kinks if the chord error of a
// curve exceeds a fraction of W. Max chord sagitta s = R(1-cos(L/2R)). For
// offset safety we want s small vs W. Demonstrate on Dolman U-bend radius.
console.log('\n=== 4b. Arc-density target is set by the WIDEST ribbon ===')
function densityNeeded(radius, W, maxKinkFrac){
  // allow sagitta <= maxKinkFrac*W ; sagitta ~ R*(1-cos(theta/2)), theta=arc/seg
  // solve for max theta per segment
  const s = maxKinkFrac*W
  const cosHalf = 1 - s/radius
  if(cosHalf<=-1||cosHalf>=1) return 2
  const theta = 2*Math.acos(Math.max(-1,Math.min(1,cosHalf)))
  return theta // radians per segment max
}
for(const W of [12, 24]){ // narrow residential ribbon vs wide arterial ribbon
  const R=30 // approx U-bend radius (m)
  const maxTheta=densityNeeded(R,W,0.1)
  const segLen=R*maxTheta
  console.log(`  W=${W}m ribbon on R=${R}m bend: max seg length ${segLen.toFixed(1)}m (>=${Math.ceil((Math.PI/2)/maxTheta)} segs per 90deg) to keep kink < 10% of W`)
}

// ---- 5. Attribute ingest (currently dropped at P1) -----------------------
console.log('\n=== 5. ATTRIBUTE INGEST: marrow present in OSM, dropped today ===')
function cov(tag){ return vh.filter(f=>f.tags?.[tag]!=null).length }
for(const t of ['lanes','oneway','surface','maxspeed','lanes:forward','lanes:backward','sidewalk','width']){
  console.log(`  ${t.padEnd(16)} present on ${cov(t)}/${vh.length} vehicular ways  ${t==='width'?'(NONE -> standards residual)':t==='sidewalk'?'(sparse -> standards seed)':'(KEPT in rich frame)'}`)
}

// ---- 6. North-star: standards-seeded cross-section, zero authoring -------
// Part-4 seeds (NACTO/AASHTO/PROWAG): residential 10ft lane, 8ft parking,
// 6in curb, 5ft sidewalk, ~5ft treelawn. Build an ordinary residential
// street's full half-section from lanes tag + standards, no operator input.
const FT=0.3048
const STD = {
  residential:{lane:10*FT, parking:8*FT, sidewalk:5*FT, treelawn:5*FT, curb:0.15},
  secondary:  {lane:11*FT, parking:8*FT, sidewalk:6*FT, treelawn:4*FT, curb:0.15},
  primary:    {lane:11*FT, parking:0,    sidewalk:8*FT, treelawn:4*FT, curb:0.15},
}
function seedSection(f){
  const cls = STD[f.tags.highway] ? f.tags.highway : 'residential'
  const s=STD[cls]
  const lanes = parseInt(f.tags.lanes)|| (f.tags.oneway==='yes'?1:2)
  const carriage = lanes*s.lane + (cls==='residential'? 2*s.parking : 0)
  const pavementHW = carriage/2                    // curb-to-curb half width
  return {cls, lanes, pavementHW:+pavementHW.toFixed(2),
          curb:s.curb, treelawn:s.treelawn, sidewalk:s.sidewalk,
          rowHW:+(pavementHW+s.curb+s.treelawn+s.sidewalk).toFixed(2)}
}
console.log('\n=== 6. NORTH-STAR: ordinary streets get correct cross-section by DEFAULT ===')
const sample = vh.filter(f=>f.tags.name && STD[f.tags.highway]).slice(0,6)
for(const f of sample){
  const sec=seedSection(f)
  console.log(`  "${f.tags.name}" (${sec.cls}, ${sec.lanes} lanes): pavementHW ${sec.pavementHW}m | curb ${sec.curb} | treelawn ${sec.treelawn.toFixed(2)} | sidewalk ${sec.sidewalk.toFixed(2)} | ROW half ${sec.rowHW}m`)
}
console.log('  ^ treelawn+sidewalk land in the right spot from (lanes tag + standards) with ZERO operator authoring.')
