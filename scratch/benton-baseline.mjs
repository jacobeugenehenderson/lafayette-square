// Benton teardrop baseline — snapshot the loop health metrics so any cul-de-sac/
// E3 change can be regression-checked against it (Jacob: "don't kill Benton").
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,clip=bnd.boundary.map(([x,z])=>[bnd.center[0]+(x-bnd.center[0])*sc0,bnd.center[1]+(z-bnd.center[1])*sc0])
const out=buildTileGround(r,{stencil:clip,smooth:0,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null,emitArtifact:true})
const A=ring=>{let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
const near=(rr,cx,cy,rad)=>rr.some(p=>Math.hypot(p[0]-cx,p[1]-cy)<rad)
// Benton ~[87,-316], cul-de-sac ~[-409,-160]
for(const [nm,cx,cy,rad] of [['BENTON',87,-316,60],['ST-VINCENT-culdesac',-409,-160,18]]){
  const asph=(out.asphalt||[]).filter(rr=>near(rr,cx,cy,rad))
  const med=((out.luByClass?.median)||[]).filter(rr=>near(rr,cx,cy,rad))
  const curb=(out.curb||[]).filter(rr=>near(rr,cx,cy,rad))
  console.log(nm,'asphalt-rings',asph.length,'median-rings',med.length,'(area '+med.map(m=>A(m).toFixed(0)).join('/')+')','curb-rings',curb.length, 'asph-area',asph.reduce((s,a)=>s+A(a),0).toFixed(0))
}
