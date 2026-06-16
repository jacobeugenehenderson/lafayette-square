import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json',import.meta.url)))
const pr=buildTileGround(r,{stencil:bnd.boundary,smooth:0.5})
function view(minx,miny,w,h,stroke=0.3){
  const sc=1100/w,Y=y=>(y-miny)*sc,X=x=>(x-minx)*sc
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${(h*sc).toFixed(0)}" viewBox="0 0 1100 ${(h*sc).toFixed(0)}" style="background:#161616">`
  const path=(rings,fill)=>{let d='';for(const rr of rings){if(!rr||rr.length<3)continue;d+=rr.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${fill}" fill-rule="nonzero" stroke="#0a0a0a" stroke-width="${stroke}" stroke-opacity="0.5"/>`}
  for(const rings of Object.values(pr.luByClass)) path(rings,'#cdebb0')
  for(const rings of Object.values(pr.treelawnByLu)) path(rings,'#5aa02a')
  path(pr.sidewalk,'#e8e2d4'); path(pr.curb,'#666'); path(pr.asphalt,'#4a4a4a')
  return s+'</svg>'
}
// STUB-N is at x=25,y=60..90 round; HW1 at y=-120 ends x=±160 blunt
writeFileSync(new URL('./stub2.svg',import.meta.url), view(5,68,40,40,0.3))
console.log('done')
