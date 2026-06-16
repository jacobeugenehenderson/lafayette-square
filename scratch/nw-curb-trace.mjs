import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR=bnd.streetFade.outer+50,scl=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*scl,cz+(z-cz)*scl])
const pr=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1,cornerRadiusOverrides:d.cornerRadiusOverrides||null,cornerCornerRadiusOverrides:d.cornerCornerRadiusOverrides||null,blockCustoms:d.blockCustoms||null})
const node=[166.5,221.9], c=[150,232], W=80, px=1800, sc=px/W
const minx=c[0]-W/2,maxx=c[0]+W/2,miny=c[1]-W/2,maxy=c[1]+W/2
const X=x=>((maxx-x)*sc).toFixed(1), Y=y=>((maxy-y)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
const fillR=(rings,col)=>{let dd='';for(const rr of (rings||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${col}"/>`}
fillR(pr.asphalt,'#cfcfcf')            // asphalt grey
// block (curb) rings outline bold
for(const rr of (pr.block||[])){ if(!rr||rr.length<3)continue; if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue; s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#e0007f" stroke-width="2.5"/>` }
const chains={'lafayette-avenue-3':'#0a0','lafayette-avenue-5':'#06c','lafayette-avenue-6':'#f80','mississippi-avenue':'#0aa'}
for(const st of r.streets){ if(!(st.skelId in chains))continue; s+=`<path d="${st.points.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="${chains[st.skelId]}" stroke-width="2"/>`; }
s+=`<circle cx="${X(node[0])}" cy="${Y(node[1])}" r="6" fill="#000"/>`
s+=`<text x="${px/2}" y="30" font-size="28" fill="#080" text-anchor="middle">N</text><text x="${px-30}" y="${px/2}" font-size="28" fill="#080">E</text>`
s+=`<text x="40" y="60" font-size="22" fill="#e0007f">pink=block/curb</text><text x="40" y="86" font-size="22" fill="#0a0">green=spine</text><text x="40" y="112" font-size="22" fill="#f80">orange=N carr</text><text x="40" y="138" font-size="22" fill="#06c">blue=S carr</text>`
s+='</svg>'
writeFileSync(new URL('./nw-curb-trace.svg',import.meta.url),s)
await sharp(Buffer.from(s)).png().toFile(new URL('./nw-curb-trace.png',import.meta.url).pathname)
console.log('ok')
