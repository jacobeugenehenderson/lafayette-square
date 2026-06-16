import { readFileSync, writeFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const streets = r.streets.filter(s=>s?.points?.length>=2)
const tiles = extractFaces(streets)
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return a/2}
// bounds
let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9
for(const t of tiles)for(const p of t){minx=Math.min(minx,p[0]);miny=Math.min(miny,p[1]);maxx=Math.max(maxx,p[0]);maxy=Math.max(maxy,p[1])}
console.log('bounds',minx.toFixed(0),miny.toFixed(0),maxx.toFixed(0),maxy.toFixed(0))
const pal=['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#16a085','#c0392b','#8e44ad','#27ae60','#2980b9','#d35400','#7f8c8d','#f1c40f']
function render(name, minx,miny,w,h){
  const sc=1100/w, X=x=>(x-minx)*sc, Y=y=>(y-miny)*sc
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${(h*sc).toFixed(0)}" viewBox="0 0 1100 ${(h*sc).toFixed(0)}" style="background:#111">`
  tiles.forEach((t,i)=>{const d=t.map((p,j)=>(j?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z';svg+=`<path d="${d}" fill="${pal[i%pal.length]}" fill-opacity="0.5" stroke="#fff" stroke-width="0.5"/>`})
  svg+='</svg>'; writeFileSync(new URL('./'+name,import.meta.url),svg)
}
render('t2-ls-faces.svg', minx-20,miny-20,(maxx-minx)+40,(maxy-miny)+40)
// zoom on center
render('t2-ls-faces-zoom.svg', -160,-160,320,320)
console.log('rendered, tiles',tiles.length)
