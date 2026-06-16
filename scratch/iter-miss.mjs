import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url))),bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url))),d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const marks=JSON.parse(readFileSync(new URL('./correct-target-mississippi-lafayette.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,scl=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1];const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*scl,cz+(z-cz)*scl])
const base={stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:1,cornerCornerRadiusOverrides:d.cornerCornerRadiusOverrides||null,blockCustoms:d.blockCustoms||null}
const off=buildTileGround(r,{...base,dividedClamp:false}),on=buildTileGround(r,{...base,dividedClamp:true})
const c=[195,185],W=120,px=1400,sc=px/W,minx=c[0]-W/2,maxx=c[0]+W/2,miny=c[1]-W/2,maxy=c[1]+W/2
const X=x=>((maxx-x)*sc).toFixed(1),Y=y=>((maxy-y)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
const ring=(rings,col,w)=>{for(const rr of rings||[]){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="${col}" stroke-width="${w}"/>`}}
ring(off.block,'#bbb',3)   // OFF grey (before)
ring(on.block,'#e0007f',1.5) // ON pink (after)
for(const m of marks)s+=`<path d="${m.map((p,i)=>(i?'L':'M')+X(p.x)+' '+Y(p.z)).join(' ')}" fill="none" stroke="#0a0" stroke-width="2" stroke-dasharray="8 5"/>`
const dot=(p,col,l)=>{s+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="7" fill="${col}"/><text x="${X(p[0])+10}" y="${Y(p[1])+4}" font-size="20" fill="${col}">${l}</text>`}
dot([214,216],'#d00','FALSE');dot([174,208],'#06c','TRUE');dot([166.5,221.9],'#f80','node')
s+=`<text x="12" y="28" font-size="20" fill="#bbb">grey=before  </text><text x="180" y="28" font-size="20" fill="#e0007f">pink=after  </text><text x="330" y="28" font-size="20" fill="#0a0">green=correct</text>`
s+=`<text x="${px/2}" y="50" font-size="22" fill="#080" text-anchor="middle">N</text><text x="${px-24}" y="${px/2}" font-size="22" fill="#080">E</text>`
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./iter-miss.png',import.meta.url).pathname);console.log('ok')
