import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const tag=process.argv[2]||'x', cxw=+process.argv[3], cyw=+process.argv[4]
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const pr=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:d.streetSmooth??0.5,blockLandUse:d.blockLandUse})
const W=50,minx=cxw-W/2,miny=cyw-W/2,px=1400,sc=px/W,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
const path=(rings,fill)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.3" stroke-opacity="0.5"/>`}
for(const rings of Object.values(pr.treelawnByLu))path(rings,'#5aa02a');path(pr.sidewalk,'#e8e2d4');path(pr.curb,'#888');path(pr.asphalt,'#4a4a4a');s+='</svg>'
writeFileSync(new URL(`./ab-cap-${tag}.svg`,import.meta.url),s)
await sharp(Buffer.from(s)).png().toFile(new URL(`./ab-cap-${tag}.png`,import.meta.url).pathname)
console.log('wrote ab-cap-'+tag)
