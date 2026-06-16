import { buildTileGround } from '../src/lib/tileGround.js'
import sharp from 'sharp'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const M=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/clean/marker_strokes.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx0=bnd.center[0],cz0=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0,cz0+(z-cz0)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1})
const CIRCLES=[['A',-40.7,175.6,M[2]],['B',-49.8,-188.7,M[1]],['C',-168.3,-78.0,M[0]]]
for(const [tag,cx,cz,stroke] of CIRCLES){
  const W=40,minx=cx-W/2,miny=cz-W/2,px=900,sc=px/W,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
  const path=(rings,fill)=>{let dd='';for(const rr of(rings||[])){const pts=Array.isArray(rr[0])?rr:rr.map(p=>[p.x,p.z]);if(!pts||pts.length<3)continue;dd+=pts.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.3" stroke-opacity="0.4"/>`}
  for(const rings of Object.values(g.luByClass))path(rings,'#33402a')
  for(const rings of Object.values(g.treelawnByLu))path(rings,'#5aa02a');path(g.sidewalk,'#e8e2d4');path(g.curb,'#c08050');path(g.asphalt,'#4a4a4a')
  // centerlines with vertices as dots
  for(const st of R.streets){const p=st.points;if(!p||p.length<2)continue;let cl=p.map((q,i)=>(i?'L':'M')+X(q[0])+' '+Y(q[1])).join(' ');s+=`<path d="${cl}" fill="none" stroke="#f33" stroke-width="0.7"/>`;for(const q of p){if(Math.abs(q[0]-cx)<W&&Math.abs(q[1]-cz)<W)s+=`<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="3" fill="#ff0"/>`}}
  // marker stroke (cyan)
  if(stroke){let mk=stroke.map((p,i)=>(i?'L':'M')+X(p.x)+' '+Y(p.z)).join(' ');s+=`<path d="${mk}" fill="none" stroke="#0ff" stroke-width="2"/>`}
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile('/tmp/circle-'+tag+'.png')
}
console.log('done A,B,C')
