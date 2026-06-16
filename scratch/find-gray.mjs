import { readFileSync } from 'fs'
import { buildTileGround, extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return a/2}
function cen(ring){let x=0,y=0;for(const p of ring){x+=p[0];y+=p[1]}return [x/ring.length,y/ring.length]}
// reproduce luForRing hash (need pickLuFromHash/hashKey/blockKeyFromRing from module — re-derive class via the bake)
const pr=buildTileGround(r,{stencil:JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json',import.meta.url))).boundary,smooth:0.5})
// luByClass: which class regions exist and where the gray ones (parking/unknown/island) are
for(const cls of ['parking','unknown','island','vacant-commercial']){
  const rings=pr.luByClass[cls]||[];
  for(const rg of rings){const a=area(rg); if(a>1000){const c=cen(rg);console.log(cls,'centroid',c.map(v=>v.toFixed(0)).join(','),'area',a.toFixed(0))}}
}
