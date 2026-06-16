import { buildTileGround } from '../src/lib/tileGround.js'
import clipperLib from 'clipper-lib'
import sharp from 'sharp'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx0=bnd.center[0],cz0=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0,cz0+(z-cz0)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1})
const SC=1000,{Clipper}=clipperLib
const turn=(a,b,c)=>{let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)return 0;return Math.acos(Math.max(-1,Math.min(1,(ix*ox+iz*oz)/(li*lo))))*180/Math.PI}
// candidate fix: Clipper CleanPolygon (removes vertices within `dist` — collapses sub-segment folds)
function clean(ring,distM){const path=ring.map(p=>({X:Math.round(p[0]*SC),Y:Math.round(p[1]*SC)}));const c=Clipper.CleanPolygon(path,distM*SC);return c.map(p=>[p.X/SC,p.Y/SC])}
const C=[-40.7,175.6]
function worstNear(rings,r=12){let w=0;for(const ring of rings){const pts=Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z]);for(let i=0;i<pts.length;i++){if(Math.hypot(pts[i][0]-C[0],pts[i][1]-C[1])>r)continue;const t=turn(pts[(i-1+pts.length)%pts.length],pts[i],pts[(i+1)%pts.length]);if(t>w)w=t}}return w}
const sw=g.sidewalk.map(ring=>Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z]))
console.log('sidewalk worst turn near A, raw:', worstNear(sw).toFixed(0)+'°')
for(const dd of [0.3,0.5,0.8,1.2]){const cleaned=sw.map(r=>clean(r,dd));console.log('  CleanPolygon('+dd+'m): worst='+worstNear(cleaned).toFixed(0)+'°')}
// also test on curb
const cu=g.curb.map(ring=>Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z]))
console.log('curb worst turn near A, raw:', worstNear(cu).toFixed(0)+'°')
for(const dd of [0.5,1.0]){const cleaned=cu.map(r=>clean(r,dd));console.log('  CleanPolygon('+dd+'m): worst='+worstNear(cleaned).toFixed(0)+'°')}
