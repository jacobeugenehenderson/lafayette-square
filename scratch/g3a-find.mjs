import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
function inRing(px,py,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>py)!=(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))c=!c}return c}
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return a/2}
// probe several points in the left road near the sliver
for(const [px,py] of [[-390,-260],[-400,-255],[-380,-258],[-410,-250],[-420,-248]]){
  const hit=tiles.find(t=>inRing(px,py,t.ring))
  if(!hit){console.log(`(${px},${py}) — no tile (asphalt/perimeter)`);continue}
  const sIdx=[...new Set(hit.edges.map(e=>e.streetIdx))]
  console.log(`(${px},${py}) tile area ${Math.abs(area(hit.ring)).toFixed(0)} edges ${hit.edges.length}`)
  for(const i of sIdx){const s=streets[i];console.log('   street',JSON.stringify(s.name),'anchor',s.anchor,'innerSign',s.innerSign,'pairId',s.pairId)}
}
