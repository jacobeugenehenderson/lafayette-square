import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const design=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=(bnd.streetFade.outer+50),sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const pr=buildTileGround(r,{stencil:clip,curbWidth:design.curbWidth,smooth:0.5,blockLandUse:design.blockLandUse})
function view(minx,miny,w,h,stroke=0.4){
  const sc=1200/w,Y=y=>(y-miny)*sc,X=x=>(x-minx)*sc
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${(h*sc).toFixed(0)}" viewBox="0 0 1200 ${(h*sc).toFixed(0)}" style="background:#161616">`
  const path=(rings,fill)=>{let d='';for(const rr of rings){if(!rr||rr.length<3)continue;d+=rr.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${fill}" fill-rule="nonzero" stroke="#0a0a0a" stroke-width="${stroke}" stroke-opacity="0.4"/>`}
  for(const rings of Object.values(pr.luByClass)) path(rings,'#cdebb0')
  for(const rings of Object.values(pr.treelawnByLu)) path(rings,'#4f9e28')
  path(pr.sidewalk,'#e8e2d4'); path(pr.curb,'#666'); path(pr.asphalt,'#4a4a4a')
  return s+'</svg>'
}
// a residential grid corner — pick around (-350,-250) ~ one intersection
writeFileSync(new URL('./t2f-corner.svg',import.meta.url), view(-180,-420,130,130,0.5))
console.log('done')
