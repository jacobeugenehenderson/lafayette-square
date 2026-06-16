// Render Saint Vincent cul-de-sac to localize the outer-boundary notch.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx0=bnd.center[0],cz0=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0,cz0+(z-cz0)*sc0])
const out=buildTileGround(r,{stencil:clip,smooth:0,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null,emitArtifact:true})
const asph=out.asphalt||[],curb=out.curb||[],med=(out.luByClass?.median)||[],block=out.block||[]
// crop around the bulb
const cx=-409,cy=-160,W=44,H=44,ppx=900,sc=ppx/W,minx=cx-W/2,miny=cy-H/2
const X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
const path=(rr,fill,stroke,sw)=>`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="${fill}" stroke="${stroke||'none'}" stroke-width="${sw||0}"/>`
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${(H*sc).toFixed(0)}" style="background:#b9c4d4">`
for(const rr of block){if(rr&&rr.length>2)s+=path(rr,'#d9cdaf','#3a6ad8',2)}   // block/ROW fill+blue outline
for(const rr of asph){if(rr&&rr.length>2)s+=path(rr,'#7d7d7d')}                 // asphalt grey
for(const rr of med){if(rr&&rr.length>2)s+=path(rr,'#3a3')}                     // island green
for(const rr of curb){if(rr&&rr.length>2)s+=path(rr,'#0a1a4a')}                 // curb navy
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./culdesac-saintvincent.png',import.meta.url).pathname)
// numeric: asphalt rings touching the bulb + their outer radius spread
const A=ring=>{let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
const near=rr=>rr.some(p=>Math.hypot(p[0]-cx,p[1]-cy)<14)
console.log('rings near bulb: asphalt',asph.filter(near).length,'curb',curb.filter(near).length,'island',med.filter(near).length,'block',block.filter(near).length)
for(const b of block.filter(near)){const verts=b.filter(p=>Math.hypot(p[0]-cx,p[1]-cy)<12);console.log('  block ring verts',b.length,'area',A(b).toFixed(0),'near-bulb verts',verts.length)}
console.log('wrote culdesac-saintvincent.png')
