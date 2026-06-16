import { readFileSync, writeFileSync } from 'fs'
import { extractFaces } from '../cartograph/spike-pure-ribbon.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json', import.meta.url)))
const streets = ribbons.streets.filter(s=>s?.points?.length>=2)
const tiles = extractFaces(streets)
function area(r){let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
console.log('tiles:', tiles.length)
console.log('areas:', tiles.map(t=>Math.round(area(t))).sort((a,b)=>a-b).join(', '))
// render tiles each a random-ish color
const palette=['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e','#d35400','#16a085','#c0392b','#8e44ad','#27ae60','#2980b9','#f1c40f']
const minx=-185,miny=-185,w=370,h=370,sc=1000/w
const X=x=>(x-minx)*sc, Y=y=>(y-miny)*sc
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" style="background:#111">`
tiles.forEach((t,i)=>{const d=t.map((p,j)=>(j?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z';svg+=`<path d="${d}" fill="${palette[i%palette.length]}" fill-opacity="0.55" stroke="#fff" stroke-width="0.8"/>`})
svg+='</svg>'
writeFileSync(new URL('./spike-faces.svg', import.meta.url), svg)
console.log('wrote faces svg')
