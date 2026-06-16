import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const tR=(bnd.streetFade.outer+50),sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const pr=buildTileGround(r,{stencil:clip,smooth:0.5})
// median = where LU should be a thin strip between two carriageways; render median strips distinctly? They're in lu currently.
const COL = { lu:'#cdebb0', sidewalk:'#d8d2c4', treelawn:'#8fcf63', curb:'#666', asphalt:'#4a4a4a' }
function view(minx,miny,w,h,stroke=0.5){
  const order=[['lu',pr.lu],['sidewalk',pr.sidewalk],['treelawn',pr.treelawn],['curb',pr.curb],['asphalt',pr.asphalt]]
  const sc=1100/w,Y=y=>(y-miny)*sc,X=x=>(x-minx)*sc
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${(h*sc).toFixed(0)}" viewBox="0 0 1100 ${(h*sc).toFixed(0)}" style="background:#161616">`
  for(const [k,rings] of order){let d='';for(const rr of rings){if(!rr||rr.length<3)continue;d+=rr.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${COL[k]}" fill-rule="nonzero" stroke="#0a0a0a" stroke-width="${stroke}" stroke-opacity="0.5"/>`}
  return s+'</svg>'
}
// zoom around the divided 18th st mid-section
writeFileSync(new URL('./t2-median.svg',import.meta.url), view(280,-120,260,260,0.5))
console.log('done')
