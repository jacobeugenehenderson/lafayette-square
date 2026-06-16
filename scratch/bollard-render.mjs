import { buildTileGround } from '../src/lib/tileGround.js'
import sharp from 'sharp'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1})
const spots=JSON.parse(process.argv[2])
function rd(tag,J,W){
  const minx=J[0]-W/2,miny=J[1]-W/2,px=900,sc=px/W,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
  const path=(rings,fill,op=1)=>{let dd='';for(const rr of(rings||[])){const pts=Array.isArray(rr[0])?rr:rr.map(p=>[p.x,p.z]);if(!pts||pts.length<3)continue;dd+=pts.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" fill-opacity="${op}" stroke="#000" stroke-width="0.3" stroke-opacity="0.5"/>`}
  for(const rings of Object.values(g.luByClass))path(rings,'#33402a')
  for(const rings of Object.values(g.treelawnByLu))path(rings,'#5aa02a');path(g.sidewalk,'#e8e2d4');path(g.curb,'#c08050');path(g.asphalt,'#4a4a4a')
  // centerline
  let cl='';for(const st of R.streets){const p=st.points;if(!p||p.length<2)continue;cl+=p.map((q,i)=>(i?'L':'M')+X(q[0])+' '+Y(q[1])).join(' ')+' '}
  s+=`<path d="${cl}" fill="none" stroke="#f33" stroke-width="0.8" stroke-opacity="0.8"/>`
  // mark junction
  s+=`<circle cx="${X(J[0])}" cy="${Y(J[1])}" r="4" fill="none" stroke="#0ff" stroke-width="1.5"/>`
  s+='</svg>'
  return sharp(Buffer.from(s)).png().toFile('/tmp/jx-'+tag+'.png')
}
for(const sp of spots) await rd(sp.t,[sp.x,sp.y],sp.W||50)
console.log('done')
