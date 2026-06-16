import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
function minCornerAngle(ring){const n=ring.length;let mn=Math.PI;for(let i=0;i<n;i++){const a=ring[(i-1+n)%n],b=ring[i],c=ring[(i+1)%n];const v1x=b[0]-a[0],v1y=b[1]-a[1],v2x=c[0]-b[0],v2y=c[1]-b[1];const l1=Math.hypot(v1x,v1y),l2=Math.hypot(v2x,v2y);if(l1<1e-6||l2<1e-6)continue;const turn=Math.acos(Math.max(-1,Math.min(1,(v1x*v2x+v1y*v2y)/(l1*l2))));if(turn<0.5236)continue;if(v1x*v2y-v1y*v2x<=0)continue;mn=Math.min(mn,Math.PI-turn)}return mn}
const K=0.5
function clampR(Rc,d,t){if(t<=0||t>=Math.PI-1e-3)return 0;if(d<=1e-6)return 0;const s=Math.sin(t/2);const dn=1-s;if(dn<1e-6)return Math.min(Rc,d);return Math.max(0,Math.min(Rc,d*(1-K*s)/dn))}
let n=0
for(const t of tiles){const ang=minCornerAngle(t.ring);if(ang<80*Math.PI/180){const Rt=clampR(4.5,3.15,ang);console.log('tile acute angle',(ang*57.3).toFixed(0),'° → Rt',Rt.toFixed(2),'(from 4.5)');n++}}
console.log('acute tiles:',n,'of',tiles.length)
