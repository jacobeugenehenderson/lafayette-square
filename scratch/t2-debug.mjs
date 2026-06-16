import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return a/2}
// find a medium rectangular tile
const sorted=tiles.map((t,i)=>({i,a:area(t.ring),n:t.ring.length})).sort((a,b)=>b.a-a.a)
console.log('top tiles by area (area, #edges):')
for(const x of sorted.slice(0,8)) console.log(' tile',x.i,'area',x.a.toFixed(0),'edges',x.n)
// pick a ~rectangular one (4-8 edges, area 3000-10000)
const pick=sorted.find(x=>x.a>3000&&x.a<10000&&x.n<=12) || sorted[5]
const t=tiles[pick.i]
console.log('\nPICKED tile',pick.i,'area',pick.a.toFixed(0),'edges',t.ring.length)
console.log('edge depths (street side → pavementHW):')
for(let i=0;i<t.edges.length;i++){
  const e=t.edges[i]; const st=streets[e.streetIdx]; const m=st?.measure?.[e.side]
  const P=t.ring[i],Q=t.ring[(i+1)%t.ring.length]; const len=Math.hypot(Q[0]-P[0],Q[1]-P[1])
  console.log(`  edge${i} len${len.toFixed(1)} street="${st?.name}" side=${e.side} hw=${m?.pavementHW} tl=${m?.treelawn} sw=${m?.sidewalk}`)
}

// measure insA area vs tile area for the picked tile
import { intersectRings } from '../src/lib/buildBlockGeometryV2.js'
function inset(ring, depths){
  const BIG=1e5; let region=[ring]; const n=ring.length
  for(let i=0;i<n;i++){const d=depths[i]; if(!(d>1e-9))continue
    const P=ring[i],Qp=ring[(i+1)%n]; const tx=Qp[0]-P[0],ty=Qp[1]-P[1]; const len=Math.hypot(tx,ty); if(len<1e-9)continue
    const ux=tx/len,uy=ty/len,nx=-uy,ny=ux,bx=P[0]+nx*d,by=P[1]+ny*d
    const hp=[[bx-ux*BIG,by-uy*BIG],[bx+ux*BIG,by+uy*BIG],[bx+ux*BIG+nx*BIG,by+uy*BIG+ny*BIG],[bx-ux*BIG+nx*BIG,by-uy*BIG+ny*BIG]]
    region=intersectRings(region,[hp]); if(!region.length)break }
  return region
}
const depthsA=t.edges.map(e=>{const m=streets[e.streetIdx]?.measure?.[e.side];return Math.max(0,m?.pavementHW||0)})
const insA=inset(t.ring,depthsA)
const insArea=insA.reduce((s,r)=>s+Math.abs(area(r)),0)
console.log('\ntile area',Math.abs(area(t.ring)).toFixed(0),'insA area',insArea.toFixed(0),'→ asphalt frac',(1-insArea/Math.abs(area(t.ring))).toFixed(2))
// check collinearity: how many DISTINCT edge directions
const dirs=new Set()
for(let i=0;i<t.ring.length;i++){const P=t.ring[i],Q=t.ring[(i+1)%t.ring.length];const a=Math.atan2(Q[1]-P[1],Q[0]-P[0]);dirs.add(Math.round(a*57.3))}
console.log('distinct edge directions (deg):',dirs.size,'of',t.ring.length,'edges')
