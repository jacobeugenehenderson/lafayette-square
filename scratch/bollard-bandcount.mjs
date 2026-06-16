import { buildTileGround } from '../src/lib/tileGround.js'
import { jKey } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
function bandThorns(ribbons,label){
  const g=buildTileGround(ribbons,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1})
  // count sidewalk reversal vertices >120
  let cnt=0;for(const ring of g.sidewalk){const pts=Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z]);for(let i=0;i<pts.length;i++){const a=pts[(i-1+pts.length)%pts.length],b=pts[i],c=pts[(i+1)%pts.length];let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)continue;ix/=li;iz/=li;ox/=lo;oz/=lo;const t=Math.acos(Math.max(-1,Math.min(1,ix*ox+iz*oz)))*180/Math.PI;if(t>120)cnt++}}
  console.log(label.padEnd(28)+' sidewalk reversal verts(>120°): '+cnt)
}
const before=JSON.parse(fs.readFileSync('scratch/vesalius-ribbons-BEFORE.json','utf8'))
const after=JSON.parse(fs.readFileSync('scratch/vesalius-ribbons-AFTER.json','utf8'))
const trunk=JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
console.log('=== end-to-end band thorn count (same opts; widths differ by frame — confounded) ===')
bandThorns(before,'vesalius BEFORE')
bandThorns(after,'vesalius AFTER (enriched)')
bandThorns(trunk,'trunk CURRENT (RDP)')
// Waverly-0: real U-street or artifact?
console.log('\n=== Waverly-place-0 path (real U vs artifact) ===')
for(const s of trunk.streets){if((s.skelId||'')==='waverly-place-0'){console.log('  pts:',s.points.map(p=>'['+p[0].toFixed(0)+','+p[1].toFixed(0)+']').join(' '));let tot=0;for(let i=0;i<s.points.length-1;i++)tot+=dist(s.points[i],s.points[i+1]);console.log('  endpoints '+dist(s.points[0],s.points[s.points.length-1]).toFixed(1)+'m apart, path '+tot.toFixed(0)+'m (ratio '+(tot/dist(s.points[0],s.points[s.points.length-1])).toFixed(1)+'x => U/crescent if >>1)')}}
