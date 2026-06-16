import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
import { mergeLiveRibbons } from '../src/lib/mergeLiveRibbons.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const skel = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/clean/skeleton.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const ribbonById = new Map((ribbons.streets||[]).map(r => [r.skelId, r]))
const liveStreets = (skel.streets||[]).map(s => { const rb=ribbonById.get(s.id); const rp=rb?.points; const points=(rp&&rp.length>=2)?rp.map(p=>Array.isArray(p)?[p[0],p[1]]:[p.x,p.z]):(s.points||[]).map(p=>[p.x,p.z]); return {id:s.id,name:s.name,type:s.highway||'residential',oneway:!!s.oneway,points,segments:rb?.segments} })
const lr = mergeLiveRibbons(ribbons, liveStreets)
const tR=bnd.streetFade.outer+50, sc0=tR/bnd.radius, cx0=bnd.center[0], cz0=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0,cz0+(z-cz0)*sc0])
const out = buildTileGround(lr, { stencil:clip, smooth:0, curbWidth:d.curbWidth, blockLandUse:d.blockLandUse||null, cornerRadiusScale:d.cornerRadiusScale??1, cornerRadiusOverrides:d.cornerRadiusOverrides||null, cornerCornerRadiusOverrides:d.cornerCornerRadiusOverrides||null, blockCustoms:d.blockCustoms||null, emitArtifact:true })
const med=(out.luByClass?.median)||[], asph=out.asphalt||[], curb=out.curb||[]
const A=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
const sj=med.filter(r=>{const cx=r.reduce((s,p)=>s+p[0],0)/r.length,cy=r.reduce((s,p)=>s+p[1],0)/r.length;return cx>-492&&cx<-292&&cy>-290&&cy<170})
console.log('S-Jeff median rings:',sj.length,'areas:',sj.map(r=>A(r).toFixed(0)).join(','))
// render Survey-style: tan asphalt, blue curb, green median (on top)
const layers=[['#cdbf9a',asph],['#3a5a8a',curb],['#2bda4b',med]]
const cx=-392,cy=-60,W=200,H=460,ppx=520,sc=ppx/W,minx=cx-W/2,miny=cy-H/2
const X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${(W*sc).toFixed(0)}" height="${(H*sc).toFixed(0)}" style="background:#9fb0c8">`
for(const[col,rings] of layers)for(const rr of rings){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="${col}"/>`}
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./browser-median-sjeff.png',import.meta.url).pathname)
console.log('wrote browser-median-sjeff.png')
