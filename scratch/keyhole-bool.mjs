// Jacob's boolean approach: build the cul-de-sac road as union(corridor, bulb-disk)
// — ignore the circle's awkward topology, combine it as a clean DISK, then round.
// The mouth corners fall out of the union; rounding makes the curb-returns tangent.
import { readFileSync, writeFileSync } from 'fs'
import clipperLib from 'clipper-lib'
import { buildTileGround } from '../src/lib/tileGround.js'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const r=JSON.parse(readFileSync(`${ROOT}/src/data/ribbons.json`))
const d=JSON.parse(readFileSync(`${ROOT}/public/looks/lafayette-square/design.json`))
const bnd=JSON.parse(readFileSync(`${ROOT}/cartograph/data/lafayette-square/neighborhood_boundary.json`))
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const { Clipper, ClipperOffset, PolyType, ClipType, PolyFillType, JoinType, EndType } = clipperLib
const SC=1000, toC=p=>({X:Math.round(p[0]*SC),Y:Math.round(p[1]*SC)}), frC=p=>[p.X/SC,p.Y/SC]
function boolOp(subj, clip, type){
  const c=new Clipper(); c.AddPaths(subj.map(r=>r.map(toC)),PolyType.ptSubject,true)
  if(clip&&clip.length) c.AddPaths(clip.map(r=>r.map(toC)),PolyType.ptClip,true)
  const sol=new clipperLib.Paths(); c.Execute(type,sol,PolyFillType.pftNonZero,PolyFillType.pftNonZero)
  return sol.map(p=>p.map(frC))
}
const union=(rings)=>boolOp(rings,[],ClipType.ctUnion)
function offset(rings,delta,join='round'){
  const co=new ClipperOffset(2,0.05*SC), jt={round:JoinType.jtRound,miter:JoinType.jtMiter}[join]
  for(const rr of rings) if(rr&&rr.length>=3) co.AddPath(rr.map(toC),jt,EndType.etClosedPolygon)
  const sol=new clipperLib.Paths(); co.Execute(sol,delta*SC); return sol.map(p=>p.map(frC))
}
const circle=(C,R,seg=64)=>{const a=[];for(let i=0;i<seg;i++){const t=2*Math.PI*i/seg;a.push([C[0]+R*Math.cos(t),C[1]+R*Math.sin(t)])}return a}
// rect corridor along dir from C outward `reach`, half-width hw each side
function corridor(C,dir,hwL,hwR,reach,back){
  const p=[-dir[1],dir[0]]
  const A=[C[0]+dir[0]*back,C[1]+dir[1]*back], B=[C[0]+dir[0]*reach,C[1]+dir[1]*reach]
  return [[A[0]+p[0]*hwL,A[1]+p[1]*hwL],[B[0]+p[0]*hwL,B[1]+p[1]*hwL],[B[0]-p[0]*hwR,B[1]-p[1]*hwR],[A[0]-p[0]*hwR,A[1]-p[1]*hwR]]
}

const SV  ={C:[-409.3,-160.2],Rroad:8.2, hwL:5.25,hwR:4.60,weld:[-416.4,-164.2]}
const PARK={C:[772.5,97.3],   Rroad:8.0, hwL:2.54,hwR:5.49,weld:[776.2,96.7]}
for(const s of [SV,PARK]){const v=[s.weld[0]-s.C[0],s.weld[1]-s.C[1]],l=Math.hypot(...v);s.dir=[v[0]/l,v[1]/l]}

const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius
const clip=bnd.boundary.map(([x,z])=>[bnd.center[0]+(x-bnd.center[0])*sc0,bnd.center[1]+(z-bnd.center[1])*sc0])
const out=buildTileGround(r,{stencil:clip,smooth:0,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null})

for(const [name,s] of [['SV',SV],['Park',PARK]]){
  // road = corridor ∪ bulb disk ; then morphological CLOSE (out r, in r) rounds the
  // reflex mouth corners into tangent curb-returns (the curb-return radius = r).
  const rr=3.5
  const road=union([corridor(s.C,s.dir,s.hwL,s.hwR,30,-2), circle(s.C,s.Rroad)])
  const closed=offset(offset(road,+rr,'round'),-rr,'round')   // close: dilate then erode
  const C=s.C,R=18,W=600,pad=15,scl=(W-2*pad)/(2*R)
  const X=x=>pad+(x-(C[0]-R))*scl,Y=y=>pad+(y-(C[1]-R))*scl
  const near=ring=>ring.some(p=>dist(p,C)<R)
  const path=(ring,st,fi,w)=>`<path d="M${ring.map(p=>`${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L')}Z" fill="${fi}" stroke="${st}" stroke-width="${w}"/>`
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#1a2530"/>`
  for(const c of (out.curb||[])) if(near(c)) svg+=path(c,'#456','none',1)         // orig curb dim
  for(const rg of road)   svg+=path(rg,'#fa0','none',1)                            // raw union, orange
  for(const rg of closed) svg+=path(rg,'#0f8','none',2.5)                          // rounded keyhole, green
  svg+=`<circle cx="${X(C[0])}" cy="${Y(C[1])}" r="2" fill="red"/></svg>`
  writeFileSync(`${ROOT}/scratch/khb-${name}.svg`,svg)
}
console.log('wrote scratch/khb-{SV,Park}.svg')
