import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json',import.meta.url)))
const pr=buildTileGround(r,{stencil:bnd.boundary,smooth:0.5})
// locate dead-end tips: degree-1 nodes
const deg=new Map(); const k=p=>Math.round(p[0]*100)+','+Math.round(p[1]*100)
for(const s of r.streets){const p=s.points;if(!p||p.length<2)continue;deg.set(k(p[0]),(deg.get(k(p[0]))||0)+1);deg.set(k(p[p.length-1]),(deg.get(k(p[p.length-1]))||0)+1)}
for(const s of r.streets){const p=s.points;if(!p||p.length<2)continue;for(const e of [p[0],p[p.length-1]]){if((deg.get(k(e))||0)===1)console.log('dead-end tip at',e.map(x=>x.toFixed(1)).join(','))}}
const COL={parking:'#6A6A62',residential:'#5A8A3A','vacant-commercial':'#8A7E5E',commercial:'#A87D3E',institutional:'#7E8AA8',recreation:'#6EA03E',industrial:'#8E7060',island:'#7A7A6E',unknown:'#888',vacant:'#7A8A4E'}
function view(name,minx,miny,w,h){const sc=900/w,Y=y=>(y-miny)*sc,X=x=>(x-minx)*sc
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${(h*sc).toFixed(0)}" viewBox="0 0 900 ${(h*sc).toFixed(0)}" style="background:#222">`
  const path=(rings,fill)=>{let d='';for(const rr of rings){if(!rr||rr.length<3)continue;d+=rr.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${fill}" fill-rule="nonzero"/>`}
  for(const [lu,rings] of Object.entries(pr.luByClass)) path(rings,COL[lu]||'#888')
  for(const [lu,rings] of Object.entries(pr.treelawnByLu)) path(rings,COL[lu]||'#5a2')
  path(pr.sidewalk,'#d8d2c4'); path(pr.curb,'#A8826A'); path(pr.asphalt,'#4a4a48')
  writeFileSync(new URL('./'+name,import.meta.url),s+'</svg>')}
globalThis.__v=view
__v('de1.svg',18,-118,46,58)
__v('de2.svg',2,42,46,58)
__v('de3.svg',-18,98,46,46)
__v('detip.svg',30,-98,22,30)
