import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return a/2}
function minCornerAngle(ring){const n=ring.length;let mn=Math.PI,mv=null;for(let i=0;i<n;i++){const a=ring[(i-1+n)%n],b=ring[i],c=ring[(i+1)%n];const v1x=b[0]-a[0],v1y=b[1]-a[1],v2x=c[0]-b[0],v2y=c[1]-b[1];const l1=Math.hypot(v1x,v1y),l2=Math.hypot(v2x,v2y);if(l1<1e-6||l2<1e-6)continue;const turn=Math.acos(Math.max(-1,Math.min(1,(v1x*v2x+v1y*v2y)/(l1*l2))));if(turn<0.5236)continue;if(v1x*v2y-v1y*v2x<=0)continue;const ia=Math.PI-turn;if(ia<mn){mn=ia;mv=b}}return [mn,mv]}
for(const t of tiles){const [ang,v]=minCornerAngle(t.ring);if(ang<60*Math.PI/180){let cx=0,cy=0;for(const p of t.ring){cx+=p[0];cy+=p[1]}console.log('acute',(ang*57.3).toFixed(0),'° at',v.map(x=>x.toFixed(0)).join(','),'centroid',(cx/t.ring.length).toFixed(0),(cy/t.ring.length).toFixed(0),'area',Math.abs(area(t.ring)).toFixed(0))}}
