import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR=bnd.streetFade.outer+50,scl=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*scl,cz+(z-cz)*scl])
const pr=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1,cornerRadiusOverrides:d.cornerRadiusOverrides||null,cornerCornerRadiusOverrides:d.cornerCornerRadiusOverrides||null,blockCustoms:d.blockCustoms||null})
const node=[424.4,-88.7], c=[440,-70], W=90, px=1800, sc=px/W
const minx=c[0]-W/2,maxx=c[0]+W/2,miny=c[1]-W/2,maxy=c[1]+W/2
const X=x=>((maxx-x)*sc).toFixed(1), Y=y=>((maxy-y)*sc).toFixed(1) // +x=W east-right, +z=N north-up
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
// asphalt faint
const fill=(rings,col)=>{let dd='';for(const rr of (rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${col}"/>`}
fill(pr.asphalt,'#dddddd')
// tile #10 ring (NE block) bold + vertex indices
const t10=pr._tiles[10].ring
s+=`<path d="${t10.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#e0007f" stroke-width="2.5"/>`
t10.forEach((p,i)=>{ if(Math.abs(p[0]-c[0])<W/2&&Math.abs(p[1]-c[1])<W/2){ s+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="4" fill="#e0007f"/><text x="${X(p[0])-12}" y="${Y(p[1])-6}" font-size="18" fill="#b0005f">${i}</text>` } })
// Park Ave chains
const chains={'park-avenue-1':'#0a0','park-avenue-0':'#06c','park-avenue-3':'#f80'}
for(const st of r.streets){ if(!(st.skelId in chains))continue; const pts=st.points; s+=`<path d="${pts.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="${chains[st.skelId]}" stroke-width="2"/>`; }
s+=`<circle cx="${X(node[0])}" cy="${Y(node[1])}" r="6" fill="#000"/>`
s+=`<text x="${px/2}" y="30" font-size="28" fill="#080" text-anchor="middle">N</text><text x="${px-30}" y="${px/2}" font-size="28" fill="#080">E</text>`
s+=`<text x="40" y="60" font-size="22" fill="#0a0">green=spine(av-1)</text><text x="40" y="86" font-size="22" fill="#06c">blue=carr-0</text><text x="40" y="112" font-size="22" fill="#f80">orange=carr-3</text><text x="40" y="138" font-size="22" fill="#e0007f">pink=NE block tile#10</text>`
s+='</svg>'
writeFileSync(new URL('./ne-tile-trace.svg',import.meta.url),s)
await sharp(Buffer.from(s)).png().toFile(new URL('./ne-tile-trace.png',import.meta.url).pathname)
console.log('wrote ne-tile-trace.png')
