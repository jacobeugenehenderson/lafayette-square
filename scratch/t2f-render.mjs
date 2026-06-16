import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const design=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=(bnd.streetFade.outer+50),sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const pr=buildTileGround(r,{stencil:clip,curbWidth:design.curbWidth,smooth:0.5,blockLandUse:design.blockLandUse})
// LU palette (per-Look or defaults)
const LU = design.luColors || {}
const DEF = { residential:'#d9e6c3', commercial:'#e7c9a0', vacant:'#cfcabe', 'vacant-commercial':'#d8c4a8', parking:'#b9b9b9', institutional:'#c9b6d8', recreation:'#bfe0a8', industrial:'#c7b8a3', park:'#a8d98a', island:'#cfe3b0', unknown:'#cccccc' }
const luCol = lu => LU[lu] || DEF[lu] || '#cccccc'
console.log('LU classes present:', Object.keys(pr.luByClass).join(', '))
function view(minx,miny,w,h,stroke=0.4){
  const sc=1200/w,Y=y=>(y-miny)*sc,X=x=>(x-minx)*sc
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${(h*sc).toFixed(0)}" viewBox="0 0 1200 ${(h*sc).toFixed(0)}" style="background:#222">`
  const path=(rings,fill)=>{let d='';for(const rr of rings){if(!rr||rr.length<3)continue;d+=rr.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${fill}" fill-rule="nonzero" stroke="#111" stroke-width="${stroke}" stroke-opacity="0.4"/>`}
  // LU faces (bottom), treelawn per-LU, sidewalk, curb, asphalt
  for(const [lu,rings] of Object.entries(pr.luByClass)) path(rings, luCol(lu))
  for(const [lu,rings] of Object.entries(pr.treelawnByLu)) path(rings, luCol(lu))
  path(pr.sidewalk,'#d8d2c4'); path(pr.curb,'#666'); path(pr.asphalt,'#4a4a4a')
  return s+'</svg>'
}
let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9; for(const rr of pr.asphalt)for(const p of rr){mnx=Math.min(mnx,p[0]);mny=Math.min(mny,p[1]);mxx=Math.max(mxx,p[0]);mxy=Math.max(mxy,p[1])}
writeFileSync(new URL('./t2f-full.svg',import.meta.url), view(mnx-30,mny-30,(mxx-mnx)+60,(mxy-mny)+60,0.3))
console.log('done')
