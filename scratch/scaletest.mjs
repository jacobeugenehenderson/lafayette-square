import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json',import.meta.url)))
const COL={parking:'#6A6A62',residential:'#5A8A3A','vacant-commercial':'#8A7E5E',commercial:'#A87D3E',institutional:'#7E8AA8',recreation:'#6EA03E',industrial:'#8E7060',island:'#7A7A6E',unknown:'#888',vacant:'#7A8A4E'}
function render(name,scale){const pr=buildTileGround(r,{stencil:bnd.boundary,smooth:0.5,cornerRadiusScale:scale})
  const minx=-30,miny=20,w=90,h=90,sc=900/w,Y=y=>(y-miny)*sc,X=x=>(x-minx)*sc
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900" style="background:#222">`
  const path=(rings,fill)=>{let d='';for(const rr of rings){if(!rr||rr.length<3)continue;d+=rr.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${fill}" fill-rule="nonzero"/>`}
  for(const [lu,rings] of Object.entries(pr.luByClass)) path(rings,COL[lu]||'#888')
  for(const [lu,rings] of Object.entries(pr.treelawnByLu)) path(rings,COL[lu]||'#5a2')
  path(pr.sidewalk,'#d8d2c4'); path(pr.curb,'#A8826A'); path(pr.asphalt,'#4a4a48')
  writeFileSync(new URL('./'+name,import.meta.url),s+'</svg>')}
render('scale1.svg',1); render('scale3.svg',3)
console.log('rendered')
