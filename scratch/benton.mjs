import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const pr=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:d.streetSmooth??0.5,blockLandUse:d.blockLandUse})
function render(name,layers,minx,miny,W){const px=1500,sc=px/W,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
  for(const[rings,fill]of layers){let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" stroke="#c00" stroke-width="0.5"/>`}
  s+='</svg>';writeFileSync(new URL('./'+name+'.svg',import.meta.url),s);return sharp(Buffer.from(s)).png().toFile(new URL('./'+name+'.png',import.meta.url).pathname)}
const tl=[];for(const rings of Object.values(pr.treelawnByLu))tl.push(...rings)
await render('benton-all',[[tl,'#5aa02a'],[pr.sidewalk,'#e8e2d4'],[pr.curb,'#888'],[pr.asphalt,'#4a4a4a']],20,-400,180)
await render('benton-asph',[[pr.asphalt,'#4a4a4a']],20,-400,180)
console.log('wrote benton-all.png benton-asph.png')
