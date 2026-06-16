// Render the MEDIAN TILE CURB OUTLINES (what the Survey curb-line view paints) for S-Jeff.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
import { mergeLiveRibbons } from '../src/lib/mergeLiveRibbons.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const skel = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/clean/skeleton.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const ribbonById = new Map((ribbons.streets||[]).map(r => [r.skelId, r]))
const liveStreets = (skel.streets||[]).map(s => { const rb=ribbonById.get(s.id); const rp=rb?.points; const points=(rp&&rp.length>=2)?rp.map(p=>Array.isArray(p)?[p[0],p[1]]:[p.x,p.z]):(s.points||[]).map(p=>[p.x,p.z]); return {id:s.id,name:s.name,type:s.highway||'residential',oneway:!!s.oneway,points,segments:rb?.segments} })
const lr = mergeLiveRibbons(ribbons, liveStreets)
const tR=bnd.streetFade.outer+50, sc0=tR/bnd.radius, cx0=bnd.center[0], cz0=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0,cz0+(z-cz0)*sc0])
const out = buildTileGround(lr, { stencil:clip, smooth:0, curbWidth:d.curbWidth, blockLandUse:d.blockLandUse||null, cornerRadiusScale:d.cornerRadiusScale??1, blockCustoms:d.blockCustoms||null, emitArtifact:true })
const sa = out._shapeArtifact||[]
// isMedian tiles in the S-Jeff region: print their ring + iA bbox/area
const A=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
const med = sa.filter(t=>t.isMedian).filter(t=>{const xs=t.ring.map(p=>p[0]),ys=t.ring.map(p=>p[1]);const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;return cx>-492&&cx<-292&&cy>-290&&cy<170})
console.log('S-Jeff isMedian tiles:',med.length)
for(const t of med){const ta=A(t.ring),ia=(t.iA||[]).reduce((s,r)=>s+A(r),0);const ys=t.ring.map(p=>p[1]);console.log(`  tile: ring=${ta.toFixed(0)}m² iA(curb)=${ia.toFixed(0)}m² yspan=${(Math.max(...ys)-Math.min(...ys)).toFixed(0)}m`)}
// render the median tiles' iA (curb ring) as navy outline on tan, S-Jeff crop
const cx=-392,cy=-60,W=200,H=460,ppx=520,sc=ppx/W,minx=cx-W/2,miny=cy-H/2
const X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${(W*sc).toFixed(0)}" height="${(H*sc).toFixed(0)}" style="background:#d8c9a8">`
for(const rr of (out.asphalt||[])){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="#cdbf9a"/>`}
for(const t of med)for(const rg of (t.iA||[])){s+=`<path d="${rg.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#0a1a4a" stroke-width="2"/>`}
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./median-curb-outline.png',import.meta.url).pathname)
console.log('wrote median-curb-outline.png')
