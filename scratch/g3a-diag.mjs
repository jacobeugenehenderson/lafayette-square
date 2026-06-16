import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return a/2}
// find thin tiles (median candidates): area small but elongated. Look for tiles bounded by inner-edge streets.
let found=0
for(const t of tiles){
  const sIdx=new Set(t.edges.map(e=>e.streetIdx))
  const innerEdge=[...sIdx].filter(i=>streets[i]?.anchor==='inner-edge')
  if(!innerEdge.length) continue
  const a=Math.abs(area(t.ring))
  // count median-facing edges
  const pairIds=[...sIdx].map(i=>streets[i]?.pairId).filter(Boolean)
  if(a<3000 && innerEdge.length){
    console.log('tile area',a.toFixed(0),'edges',t.edges.length,'innerEdge streets',innerEdge.length,'pairIds',JSON.stringify([...new Set(pairIds)]))
    found++; if(found>8)break
  }
}
console.log('--- total inner-edge streets:', streets.filter(s=>s.anchor==='inner-edge').length)
