import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url))),bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url))),d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,scl=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1];const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*scl,cz+(z-cz)*scl])
// cornerRadiusScale:0 → vertR=0 → filletRing is a no-op → RAW SHARP corners
const pr=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:0,cornerCornerRadiusOverrides:null,blockCustoms:d.blockCustoms||null})
const c=[200,180],W=130,px=1500,sc=px/W,minx=c[0]-W/2,maxx=c[0]+W/2,miny=c[1]-W/2,maxy=c[1]+W/2
const X=x=>((maxx-x)*sc).toFixed(1),Y=y=>((maxy-y)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
const fill=(rings,col)=>{let dd='';for(const rr of rings||[]){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${col}"/>`}
fill(pr.asphalt,'#cfcfcf')                 // the asphalt UNION blob (grey)
for(const rr of pr.block||[]){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#e0007f" stroke-width="2"/>`}  // block (sharp) pink
// centerlines (cyan) — the clean straight lines we THINK we offset
for(const st of r.streets){if(!st.points||st.points.length<2)continue;if(!st.points.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;s+=`<path d="${st.points.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="#09c" stroke-width="1.5"/>`}
s+=`<circle cx="${X(166.5)}" cy="${Y(221.9)}" r="6" fill="#f80"/>`
s+=`<text x="12" y="28" font-size="20" fill="#cfcfcf">grey=asphalt UNION</text><text x="270" y="28" font-size="20" fill="#e0007f">pink=block (rounding OFF)</text><text x="640" y="28" font-size="20" fill="#09c">cyan=centerlines</text>`
s+=`<text x="${px/2}" y="52" font-size="22" fill="#080" text-anchor="middle">N</text><text x="${px-24}" y="${px/2}" font-size="22" fill="#080">E</text>`
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./why-raw.png',import.meta.url).pathname);console.log('rounding OFF render written')
