// Prove the width-aware KEYHOLE curb polygon (#1) standalone: bulb curb circle +
// stem corridor walls + tangent curb-returns, from circle + stem dir + survey widths.
// Render over the original curb to confirm the shape before wiring prebake/consume.
import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const r = JSON.parse(readFileSync(`${ROOT}/src/data/ribbons.json`))
const d = JSON.parse(readFileSync(`${ROOT}/public/looks/lafayette-square/design.json`))
const bnd = JSON.parse(readFileSync(`${ROOT}/cartograph/data/lafayette-square/neighborhood_boundary.json`))
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])

// build the keyhole curb ring. C=bulb centre, Rb=bulb curb radius, sOut=unit stem
// dir (C→junction), WsL/WsR=corridor half-widths (left/right of stem centreline),
// rr=curb-return radius, reach=how far the corridor extends toward the junction.
function keyhole(C, Rb, sOut, WsL, WsR, rr, reach) {
  const perp=[-sOut[1],sOut[0]]
  const ptOnWall=(Ws,sgn,t)=>[C[0]+sOut[0]*t+sgn*Ws*perp[0], C[1]+sOut[1]*t+sgn*Ws*perp[1]]
  // return arc for one wall (sgn=+1 left / -1 right). Internal tangent to circle.
  function ret(Ws,sgn){
    const a=Math.sqrt(Math.max(0,(Rb-rr)**2-(Ws-rr)**2))     // along +sOut (mouth side)
    const O=[C[0]+sOut[0]*a+sgn*(Ws-rr)*perp[0], C[1]+sOut[1]*a+sgn*(Ws-rr)*perp[1]]
    const tWall=ptOnWall(Ws,sgn,a)                            // tangent pt on wall
    const oc=dist(O,C); const tCirc=[C[0]+(O[0]-C[0])/oc*Rb, C[1]+(O[1]-C[1])/oc*Rb]
    let aW=Math.atan2(tWall[1]-O[1],tWall[0]-O[0]), aC=Math.atan2(tCirc[1]-O[1],tCirc[0]-O[0])
    let dlt=aC-aW; while(dlt>Math.PI)dlt-=2*Math.PI; while(dlt<-Math.PI)dlt+=2*Math.PI
    const seg=Math.max(2,Math.round(Math.abs(dlt)/(Math.PI/24))), arc=[]
    for(let k=0;k<=seg;k++){const ang=aW+dlt*(k/seg);arc.push([O[0]+rr*Math.cos(ang),O[1]+rr*Math.sin(ang)])}
    return {tWall,tCirc,arc,thetaCirc:Math.atan2(tCirc[1]-C[1],tCirc[0]-C[0])}
  }
  const L=ret(WsL,+1), R=ret(WsR,-1)
  // major circle arc from L.tCirc around the bulb (away from the mouth) to R.tCirc
  let a0=L.thetaCirc, a1=R.thetaCirc
  // go the LONG way (around the back of the bulb, not across the mouth)
  let dlt=a1-a0; while(dlt<=0)dlt+=2*Math.PI                  // CCW positive
  if(dlt<Math.PI) dlt-=2*Math.PI                              // pick the >180° (long) way
  const seg=Math.max(8,Math.round(Math.abs(dlt)/(Math.PI/32))), bulbArc=[]
  for(let k=0;k<=seg;k++){const ang=a0+dlt*(k/seg);bulbArc.push([C[0]+Rb*Math.cos(ang),C[1]+Rb*Math.sin(ang)])}
  // assemble keyhole boundary (CCW-ish): left wall far→tWall, return arc, bulb major arc,
  // right return reversed, right wall tWall→far, close.
  const farL=ptOnWall(WsL,+1,reach), farR=ptOnWall(WsR,-1,reach)
  return [ farL, L.tWall, ...L.arc, ...bulbArc, ...R.arc.slice().reverse(), R.tWall, farR ]
}

const SV   = { C:[-409.3,-160.2], Rb:12.2, sOut:null, WsL:5.25, WsR:4.60, weld:[-416.4,-164.2] }
const PARK = { C:[772.5,97.3],    Rb:10.7, sOut:null, WsL:2.54, WsR:5.49, weld:[776.2,96.7] }
for(const s of [SV,PARK]){ const v=[s.weld[0]-s.C[0],s.weld[1]-s.C[1]],l=Math.hypot(...v); s.sOut=[v[0]/l,v[1]/l] }

// render orig curb + the constructed keyhole overlay
const tR=bnd.streetFade.outer+50, sc0=tR/bnd.radius
const clip=bnd.boundary.map(([x,z])=>[bnd.center[0]+(x-bnd.center[0])*sc0, bnd.center[1]+(z-bnd.center[1])*sc0])
const out=buildTileGround(r,{stencil:clip,smooth:0,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null})
for(const [name,s] of [['SV',SV],['Park',PARK]]){
  const kh=keyhole(s.C,s.Rb,s.sOut,s.WsL,s.WsR,3.0,18)
  const C=s.C,R=18,W=600,pad=15,sc=(W-2*pad)/(2*R)
  const X=x=>pad+(x-(C[0]-R))*sc,Y=y=>pad+(y-(C[1]-R))*sc
  const near=ring=>ring.some(p=>dist(p,C)<R)
  const path=(ring,st,fi,w,close=true)=>`<path d="M${ring.map(p=>`${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L')}${close?'Z':''}" fill="${fi}" stroke="${st}" stroke-width="${w}"/>`
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#1a2530"/>`
  for(const c of (out.curb||[])) if(near(c)) svg+=path(c,'#456','none',1)        // orig curb, dim
  svg+=path(kh,'#0f8','none',2.5)                                                  // constructed keyhole, green
  svg+=`<circle cx="${X(C[0])}" cy="${Y(C[1])}" r="2" fill="red"/></svg>`
  writeFileSync(`${ROOT}/scratch/khg-${name}.svg`,svg)
}
console.log('wrote scratch/khg-{SV,Park}.svg')
