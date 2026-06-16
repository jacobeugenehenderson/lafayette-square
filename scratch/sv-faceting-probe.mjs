// PROBE (read-only): does the SV bulb's faceted outer edge dissolve with smoothing?
// Renders bulb at smooth=0 vs smooth=1.2, measures outer-asphalt facet count + worst turn,
// and checks the stem-notch. Also reports Benton metrics at each smooth to gauge blast radius.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,clip=bnd.boundary.map(([x,z])=>[bnd.center[0]+(x-bnd.center[0])*sc0,bnd.center[1]+(z-bnd.center[1])*sc0])
const A=ring=>{let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
const near=(rr,cx,cy,rad)=>rr.some(p=>Math.hypot(p[0]-cx,p[1]-cy)<rad)
// turn-angle stats on the part of an outer ring within rad of the bulb
function facetStats(ring,cx,cy,rad){
  let n=0,worst=0,turns=[]
  for(let i=0;i<ring.length;i++){
    const a=ring[(i-1+ring.length)%ring.length],b=ring[i],c=ring[(i+1)%ring.length]
    if(Math.hypot(b[0]-cx,b[1]-cy)>rad) continue
    const v1=[b[0]-a[0],b[1]-a[1]],v2=[c[0]-b[0],c[1]-b[1]]
    const m1=Math.hypot(...v1),m2=Math.hypot(...v2); if(m1<1e-6||m2<1e-6)continue
    let ang=Math.acos(Math.max(-1,Math.min(1,(v1[0]*v2[0]+v1[1]*v2[1])/(m1*m2))))*180/Math.PI
    n++; if(ang>worst)worst=ang; if(ang>3)turns.push(+ang.toFixed(0))
  }
  return {verts:n,worstTurn:+worst.toFixed(1),bends:turns.length,turns}
}
const SV=[-409,-160],BEN=[87,-316]
for(const smooth of [0,0.8,1.2]){
  const out=buildTileGround(r,{stencil:clip,smooth,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null,emitArtifact:true})
  const asph=out.asphalt||[],med=(out.luByClass?.median)||[],curb=out.curb||[]
  // SV bulb: find the asphalt ring(s) whose outer hull encloses the island center
  const svAsph=asph.filter(rr=>near(rr,SV[0],SV[1],16))
  let stats=svAsph.map(rr=>facetStats(rr,SV[0],SV[1],14))
  const svMed=med.filter(rr=>near(rr,SV[0],SV[1],10))
  const benAsph=asph.filter(rr=>near(rr,BEN[0],BEN[1],60))
  const benMed=med.filter(rr=>near(rr,BEN[0],BEN[1],60))
  const benCurb=curb.filter(rr=>near(rr,BEN[0],BEN[1],60))
  console.log(`smooth=${smooth}`)
  console.log(`  SV   asph-rings ${svAsph.length} island-area ${svMed.map(m=>A(m).toFixed(0)).join('/')} facet-stats ${JSON.stringify(stats)}`)
  console.log(`  BEN  asph-rings ${benAsph.length} median-rings ${benMed.length} (area ${benMed.map(m=>A(m).toFixed(0)).join('/')}) curb-rings ${benCurb.length}`)
}
