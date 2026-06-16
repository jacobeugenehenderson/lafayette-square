import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json',import.meta.url)))
const pr=buildTileGround(r,{stencil:bnd.boundary,smooth:0.5})
const minx=-135,miny=25,w=110,h=110,sc=1100/w,Y=y=>(y-miny)*sc,X=x=>(x-minx)*sc
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1100" viewBox="0 0 1100 1100" style="background:#222">`
const path=(rings,fill)=>{let d='';for(const rr of rings){if(!rr||rr.length<3)continue;d+=rr.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${fill}" fill-rule="nonzero"/>`}
for(const rings of Object.values(pr.luByClass)) path(rings,'#888')      // all LU gray
for(const rings of Object.values(pr.treelawnByLu)) path(rings,'#e23bd0')  // treelawn MAGENTA (expose)
path(pr.sidewalk,'#ffffff')   // sidewalk white
path(pr.curb,'#ff3b3b')       // curb RED (expose)
path(pr.asphalt,'#333')
writeFileSync(new URL('./expose.svg',import.meta.url),s+'</svg>')
console.log('done')
