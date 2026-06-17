import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const design=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const r=buildTileGround(ribbons,{curbWidth:design.curbWidth,smooth:0,blockLandUse:design.blockLandUse,cornerRadiusScale:design.cornerRadiusScale,cornerRadiusOverrides:design.cornerRadiusOverrides,cornerCornerRadiusOverrides:design.cornerCornerRadiusOverrides,blockCustoms:design.blockCustoms,emitArtifact:true})
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
function td(ring,i){const n=ring.length,A=ring[(i-1+n)%n],V=ring[i],B=ring[(i+1)%n];let ix=V[0]-A[0],iy=V[1]-A[1],ox=B[0]-V[0],oy=B[1]-V[1];const li=Math.hypot(ix,iy),lo=Math.hypot(ox,oy);if(li<1e-6||lo<1e-6)return{deg:0,leg:0};ix/=li;iy/=li;ox/=lo;oy/=lo;return{deg:Math.acos(Math.max(-1,Math.min(1,ix*ox+iy*oy)))*180/Math.PI,leg:Math.min(li,lo)}}
const asph=(r.asphalt||[]).filter(x=>x.length>=3)
const out=[]
for(const n of ribbons.junctionMap.nodes){
  let best=null
  for(const ring of asph)for(let i=0;i<ring.length;i++){if(dist(ring[i],n.at)>10)continue;const t=td(ring,i);if(t.leg<1.5&&t.deg>40&&(!best||t.deg>best.deg))best={...t}}
  if(best)out.push(`${n.at.map(v=>Math.round(v)).join(',')}|${[...(n.kinds||[])].sort().join('+')}|${best.deg.toFixed(0)}|${best.leg.toFixed(2)}`)
}
out.sort()
console.log(out.join('\n'))
console.log('TOTAL_TABS='+out.length)
