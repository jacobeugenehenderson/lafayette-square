import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const marks = JSON.parse(readFileSync(new URL('./correct-target-mississippi-lafayette.json', import.meta.url)))
const tR=bnd.streetFade.outer+50,scl=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*scl,cz+(z-cz)*scl])
const pr=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:1,cornerCornerRadiusOverrides:d.cornerCornerRadiusOverrides||null,blockCustoms:d.blockCustoms||null})
const c=[200,180], W=130, px=1500, sc=px/W
const minx=c[0]-W/2,maxx=c[0]+W/2,miny=c[1]-W/2,maxy=c[1]+W/2
const X=x=>((maxx-x)*sc).toFixed(1), Y=y=>((maxy-y)*sc).toFixed(1)  // +x=W east-right, +z=N north-up
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
const fill=(rings,col)=>{let dd='';for(const rr of (rings||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${col}"/>`}
fill(pr.asphalt,'#e6e6e6')
// all block rings faint, ring#20 bold
;(pr.block||[]).forEach((rr,i)=>{if(!rr||rr.length<3)return;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))return;s+=`<path d="${rr.map((p,k)=>(k?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="${i===20?'#e0007f':'#bbb'}" stroke-width="${i===20?3:1}"/>`})
// correct strokes
for(const m of marks){s+=`<path d="${m.map((p,i)=>(i?'L':'M')+X(p.x)+' '+Y(p.z)).join(' ')}" fill="none" stroke="#0a0" stroke-width="2.5" stroke-dasharray="9 5"/>`}
// markers
const dot=(p,col,lab)=>{s+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="8" fill="${col}"/><text x="${X(p[0])+11}" y="${Y(p[1])+5}" font-size="22" fill="${col}">${lab}</text>`}
dot([214,216],'#d00','FALSE (214,216)')
dot([174,208],'#06c','TRUE (174,208)')
dot([166.5,221.9],'#f80','node')
s+=`<text x="14" y="30" font-size="22" fill="#e0007f">pink=block ring#20</text><text x="14" y="56" font-size="22" fill="#0a0">green dashed=your correct strokes</text>`
s+=`<text x="${px/2}" y="26" font-size="24" fill="#080" text-anchor="middle">N</text><text x="${px-26}" y="${px/2}" font-size="24" fill="#080">E</text>`
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./confirm-target.png',import.meta.url).pathname)
console.log('ok')
