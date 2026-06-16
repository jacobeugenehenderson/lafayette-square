// READ-ONLY — does neckMask isolate ONLY throats (never corners)? Render it over
// tile#4 with fillet apexes (the protected corners) marked.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import clipperLib from 'clipper-lib'
import { buildTileGround } from '../src/lib/tileGround.js'
const SCALE=1000, toC=p=>({X:Math.round(p[0]*SCALE),Y:Math.round(p[1]*SCALE)}), fromC=p=>[p.X/SCALE,p.Y/SCALE]
function offsetRings(rings,delta,join='round'){if(!rings.length)return[];if(delta===0)return rings.map(r=>r.slice());const{ClipperOffset,JoinType,EndType}=clipperLib;const co=new ClipperOffset(2,0.05*SCALE);const jt=join==='miter'?JoinType.jtMiter:JoinType.jtRound;for(const r of rings)if(r&&r.length>=3)co.AddPath(r.map(toC),jt,EndType.etClosedPolygon);const out=[];co.Execute(out,delta*SCALE);return out.map(p=>p.map(fromC))}
function diff(s,c){if(!s.length)return[];if(!c.length)return s.map(r=>r.slice());const{Clipper,ClipType,PolyType,PolyFillType}=clipperLib;const cl=new Clipper();for(const r of s)if(r&&r.length>=3)cl.AddPath(r.map(toC),PolyType.ptSubject,true);for(const r of c)if(r&&r.length>=3)cl.AddPath(r.map(toC),PolyType.ptClip,true);const out=[];cl.Execute(ClipType.ctDifference,out,PolyFillType.pftNonZero,PolyFillType.pftNonZero);return out.map(p=>p.map(fromC))}
const opening=(rings,R)=>offsetRings(offsetRings(rings,-R,'round'),+R,'round')
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx0=bnd.center[0],cz0=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0,cz0+(z-cz0)*sc0])
const cw=d.curbWidth
const pr=buildTileGround(r,{stencil:clip,smooth:0,curbWidth:cw,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null,emitArtifact:true})
const T=pr._shapeArtifact[4], join=T.bandJoin, WB=T.tl+T.sw
const iC=offsetRings(T.iA,-cw,join)
const apexes=(T.fillets||[]).map(f=>f.apex)
for(const R of [WB, 1.6]){
  const mask=diff(iC, opening(iC,R))
  // does any fillet apex fall inside the mask? (point-in-rings, even-odd)
  const inMask=(x,y)=>{let c=false;for(const rr of mask){for(let i=0,j=rr.length-1;i<rr.length;j=i++){const xi=rr[i][0],yi=rr[i][1],xj=rr[j][0],yj=rr[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c}}return c}
  let hits=0,minD=1e9
  for(const a of apexes){if(inMask(a[0],a[1]))hits++;}
  // also nearest mask vertex to any apex
  for(const rr of mask)for(const p of rr)for(const a of apexes){const dd=Math.hypot(p[0]-a[0],p[1]-a[1]);if(dd<minD)minD=dd}
  let area=0;for(const rr of mask){let s=0;for(let i=0;i<rr.length;i++){const j=(i+1)%rr.length;s+=rr[i][0]*rr[j][1]-rr[j][0]*rr[i][1]}area+=Math.abs(s/2)}
  console.log(`R=${R.toFixed(2)}: neckMask ${mask.length} rings, area=${area.toFixed(0)}m², corners-inside-mask=${hits}/${apexes.length}, nearest mask vtx to a corner=${minD.toFixed(2)}m`)
}
// render with R=WB over the whole tile
const mask=diff(iC,opening(iC,WB))
let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;for(const rr of T.iA)for(const p of rr){mnx=Math.min(mnx,p[0]);mny=Math.min(mny,p[1]);mxx=Math.max(mxx,p[0]);mxy=Math.max(mxy,p[1])}
const W=Math.max(mxx-mnx,mxy-mny)+20,cx=(mnx+mxx)/2,cy=(mny+mxy)/2,ppx=1200,sc=ppx/W,minx=cx-W/2,miny=cy-W/2,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#fff">`
const fill=(rings,f,op)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${f}" fill-rule="evenodd" fill-opacity="${op}"/>`}
fill(T.iA,'#eee',1); fill(mask,'#d00',0.7)
for(const a of apexes)s+=`<circle cx="${X(a[0])}" cy="${Y(a[1])}" r="4" fill="#08f"/>`
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./w18-neckmask.png',import.meta.url).pathname)
console.log('wrote w18-neckmask.png (grey=tile#4, red=neckMask R=WB, blue dots=corners to protect)')
