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
const sa=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
// all junctions deg>=3
const deg={},pt={};for(const s of R.streets){const p=s.points;if(!p)continue;for(let i=0;i<p.length;i++){const k=jKey(p[i][0],p[i][1]);const inc=(i===0||i===p.length-1)?1:2;deg[k]=(deg[k]||0)+inc;pt[k]=[p[i][0],p[i][1]]}}
const juncs=Object.keys(deg).filter(k=>deg[k]>=3).map(k=>({k,p:pt[k],deg:deg[k]}))
// for each junction, worst sidewalk reversal (turn>110) within 22m
function worstSW(N){let w=0,wp=null;for(const ring of g.sidewalk){const pts=Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z]);for(let i=0;i<pts.length;i++){const b=pts[i];if(Math.hypot(b[0]-N[0],b[1]-N[1])>22)continue;const a=pts[(i-1+pts.length)%pts.length],c=pts[(i+1)%pts.length];let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)continue;ix/=li;iz/=li;ox/=lo;oz/=lo;const t=Math.acos(Math.max(-1,Math.min(1,ix*ox+iz*oz)))*180/Math.PI;if(t>w){w=t;wp=b}}}return {w,wp}}
const ranked=juncs.map(j=>({...j,...worstSW(j.p)})).sort((a,b)=>b.w-a.w)
console.log('Junctions ranked by worst nearby sidewalk reversal (deg>=3, '+juncs.length+' total):')
for(const j of ranked.slice(0,16))console.log('  '+j.w.toFixed(0).padStart(3)+'°  deg'+j.deg+'  J=['+j.p[0].toFixed(1)+','+j.p[1].toFixed(1)+']  spike@['+(j.wp?j.wp[0].toFixed(1)+','+j.wp[1].toFixed(1):'')+']')
const bad=ranked.filter(j=>j.w>120).length, ok=ranked.filter(j=>j.w<60).length
console.log('\njunctions with reversal>120°:',bad,' | clean(<60°):',ok,' | total deg>=3:',juncs.length)
