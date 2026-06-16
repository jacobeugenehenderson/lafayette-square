import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json',import.meta.url)))
const pr=buildTileGround(r,{stencil:bnd.boundary,smooth:0.5})
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return a/2}
console.log('luByClass classes:', Object.keys(pr.luByClass))
for(const [lu,rings] of Object.entries(pr.luByClass)){
  const pos=rings.filter(r=>area(r)>0).length, neg=rings.filter(r=>area(r)<0).length
  console.log(lu.padEnd(14),'rings',rings.length,'CCW(+)',pos,'CW(-)',neg, 'totArea', rings.reduce((s,r)=>s+area(r),0).toFixed(0))
}
console.log('--- treelawnByLu ---')
for(const [lu,rings] of Object.entries(pr.treelawnByLu)){
  const pos=rings.filter(r=>area(r)>0).length, neg=rings.filter(r=>area(r)<0).length
  console.log(lu.padEnd(14),'rings',rings.length,'CCW(+)',pos,'CW(-)',neg)
}
