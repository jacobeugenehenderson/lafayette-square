import { buildTileGround } from '../src/lib/tileGround.js'
import { jKey } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1})
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
// node degree + incident edges (with lengths)
const deg={},pt={},minEdge={}
for(const s of R.streets){const p=s.points;if(!p)continue;for(let i=0;i<p.length;i++){const k=jKey(p[i][0],p[i][1]);const dd=(i===0||i===p.length-1)?1:2;deg[k]=(deg[k]||0)+dd;pt[k]=[p[i][0],p[i][1]]
  // incident edge lengths
  if(i>0){const e=dist(p[i-1],p[i]);minEdge[k]=Math.min(minEdge[k]??1e9,e)}
  if(i<p.length-1){const e=dist(p[i],p[i+1]);minEdge[k]=Math.min(minEdge[k]??1e9,e)}}}
const juncs=Object.keys(deg).filter(k=>deg[k]>=3).map(k=>({k,p:pt[k],deg:deg[k],minE:minEdge[k]}))
// worst sidewalk reversal near each
function worstSW(N){let w=0;for(const ring of g.sidewalk){const pts=Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z]);for(let i=0;i<pts.length;i++){const b=pts[i];if(dist(b,N)>22)continue;const a=pts[(i-1+pts.length)%pts.length],c=pts[(i+1)%pts.length];let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)continue;ix/=li;iz/=li;ox/=lo;oz/=lo;const t=Math.acos(Math.max(-1,Math.min(1,ix*ox+iz*oz)))*180/Math.PI;if(t>w)w=t}}return w}
// classify each reversal junction
const STAG=20, SHORT=12
let clean=0,stag=0,shortEdge=0,both=0
const rev=juncs.map(j=>({...j,w:worstSW(j.p)})).filter(j=>j.w>120)
for(const j of rev){
  const others=juncs.filter(o=>o.k!==j.k&&o.deg>=3&&dist(o.p,j.p)<STAG).length
  const hasStag=others>0, hasShort=j.minE<SHORT
  if(hasStag&&hasShort)both++; else if(hasStag)stag++; else if(hasShort)shortEdge++; else clean++
}
console.log('Reversal junctions (>120° sidewalk): '+rev.length)
console.log('  CLEAN single deg-3 node, no short edge (=> band-capacity G12): '+clean)
console.log('  STAGGERED (another deg>=3 within '+STAG+'m) only: '+stag)
console.log('  SHORT-EDGE (<'+SHORT+'m incident, dog-leg) only: '+shortEdge)
console.log('  BOTH stagger+short: '+both)
console.log('  => SKELETON-implicated (stag/short/both): '+(stag+shortEdge+both)+' / '+rev.length)
// the 4 marked
console.log('\nThe 4 marked junctions:')
for(const [lab,x,z] of [['#1Vail',340,-120.6],['#2Kennett',179.9,115.9],['#3Mackay',-48,-203.9],['#4Waverly',-25.3,191.6]]){
  const k=jKey(x,z);const others=juncs.filter(o=>o.k!==k&&dist(o.p,[x,z])<STAG).length
  console.log('  '+lab+': minEdge='+(minEdge[k]?.toFixed(1))+'m  otherDeg3within20m='+others+'  => '+((others>0||minEdge[k]<SHORT)?'SKELETON':'clean-T/band'))
}
