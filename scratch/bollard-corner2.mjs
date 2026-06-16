import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx0=bnd.center[0],cz0=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0,cz0+(z-cz0)*sc0])
const turn=(a,b,c)=>{let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)return 0;return Math.acos(Math.max(-1,Math.min(1,(ix*ox+iz*oz)/(li*lo))))*180/Math.PI}
const J=[['#1 Vail',340,-120.6],['#2 Kennett',179.9,115.9],['#3 Mackay',-48,-203.9],['#4 Waverly',-25.3,191.6]]
function worst(g,N,r=22){let w=0;for(const kk of ['curb','sidewalk']){for(const ring of g[kk]){const pts=Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z]);for(let i=0;i<pts.length;i++){if(Math.hypot(pts[i][0]-N[0],pts[i][1]-N[1])>r)continue;const t=turn(pts[(i-1+pts.length)%pts.length],pts[i],pts[(i+1)%pts.length]);if(t>w)w=t}}}return w}
// also global reversal count
function globalRev(g){let c=0;for(const ring of g.sidewalk){const pts=Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z]);for(let i=0;i<pts.length;i++){const t=turn(pts[(i-1+pts.length)%pts.length],pts[i],pts[(i+1)%pts.length]);if(t>120)c++}}return c}
console.log('worst curb/sidewalk turn near junction (r=22m) vs cornerRadiusScale + GLOBAL reversal count:')
console.log('scale  '+J.map(c=>c[0].padEnd(11)).join('')+'  globalRev>120')
for(const scale of [0,0.5,1,2]){
  const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:scale})
  console.log(String(scale).padEnd(7)+J.map(([lab,x,z])=>(worst(g,[x,z]).toFixed(0)+'°').padEnd(11)).join('')+'  '+globalRev(g))
}
