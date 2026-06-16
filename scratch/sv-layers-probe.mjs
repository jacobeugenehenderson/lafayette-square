// PROBE (read-only): render SV bulb with distinct layer colors to localize
// (a) the faceted outer asphalt edge, (b) the stem-join concave notch,
// (c) the blue ROW boundary, and measure the concavity at the stem node.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,clip=bnd.boundary.map(([x,z])=>[bnd.center[0]+(x-bnd.center[0])*sc0,bnd.center[1]+(z-bnd.center[1])*sc0])
const out=buildTileGround(r,{stencil:clip,smooth:0,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null,emitArtifact:true})
const asph=out.asphalt||[],curb=out.curb||[],med=(out.luByClass?.median)||[],block=out.block||[]
const cx=-405,cy=-162,W=46,H=46,ppx=950,sc=ppx/W,minx=cx-W/2,miny=cy-H/2
const X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
const path=(rr,fill,stroke,sw)=>`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="${fill}" fill-opacity="${fill==='none'?0:1}" stroke="${stroke||'none'}" stroke-width="${sw||0}"/>`
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${(H*sc).toFixed(0)}" style="background:#eef">`
for(const rr of block){if(rr&&rr.length>2)s+=path(rr,'#e8dcc0','#1a3acc',1.5)}  // ROW tan + blue edge
for(const rr of asph){if(rr&&rr.length>2)s+=path(rr,'#888')}                   // asphalt grey
for(const rr of med){if(rr&&rr.length>2)s+=path(rr,'#2a2')}                    // island green
for(const rr of curb){if(rr&&rr.length>2)s+=path(rr,'none','#d22',2)}          // curb red outline
// mark the stem-join node and bulb center
s+=`<circle cx="${X(-416.4)}" cy="${Y(-164.2)}" r="6" fill="magenta"/>`
s+=`<circle cx="${X(-409.3)}" cy="${Y(-160)}" r="4" fill="cyan"/>`
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./sv-layers-probe.png',import.meta.url).pathname)
console.log('wrote sv-layers-probe.png (magenta=stem-join, cyan=bulb center)')
