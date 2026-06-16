import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
function inRing(px,py,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>py)!=(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))c=!c}return c}
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return a/2}
const t=tiles.find(t=>inRing(-80,80,t.ring))
if(!t){console.log('NO TILE at (-80,80) — it is perimeter!');process.exit()}
console.log('tile at (-80,80): area',Math.abs(area(t.ring)).toFixed(0),'edges',t.edges.length)
console.log('ring bbox:', Math.min(...t.ring.map(p=>p[0])).toFixed(0),Math.min(...t.ring.map(p=>p[1])).toFixed(0),Math.max(...t.ring.map(p=>p[0])).toFixed(0),Math.max(...t.ring.map(p=>p[1])).toFixed(0))
const sIdx=[...new Set(t.edges.map(e=>e.streetIdx))]
for(const i of sIdx)console.log('  street',JSON.stringify(streets[i].name),'measure.left.tl/sw',streets[i].measure?.left?.treelawn,streets[i].measure?.left?.sidewalk)
