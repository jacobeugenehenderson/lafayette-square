import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json',import.meta.url)))
function render(name, stripMaterials){
  const pr=buildTileGround(r,{stencil:bnd.boundary,smooth:0.5,stripMaterials})
  const minx=-72,miny=-72,w=64,h=64,sc=1200/w,Y=y=>(y-miny)*sc,X=x=>(x-minx)*sc
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" style="background:#161616">`
  const path=(rings,fill)=>{let d='';for(const rr of rings){if(!rr||rr.length<3)continue;d+=rr.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${fill}" fill-rule="nonzero"/>`}
  for(const rings of Object.values(pr.luByClass)) path(rings,'#cdebb0')
  for(const rings of Object.values(pr.treelawnByLu)) path(rings,'#5aa02a')  // 'LU'-routed strip = green
  path(pr.sidewalk,'#e8e2d4')  // 'SW'-routed = tan
  path(pr.curb,'#666'); path(pr.asphalt,'#4a4a4a')
  writeFileSync(new URL('./'+name,import.meta.url), s+'</svg>')
}
render('m3-default.svg', undefined)                       // {outer:LU, inner:SW}
render('m3-swap.svg', {outer:'SW', inner:'LU'})           // swapped
console.log('done')
