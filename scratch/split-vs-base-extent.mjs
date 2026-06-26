import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw=CURB_WIDTH, mouth=[-177.5,-78.7], tip=[-361.18,-108.99]
const f1=[-184.68,-85.45], f2=[-186.47,-74.61]
const area=(rings)=>rings.reduce((s,r)=>{let a=0;for(let i=0;i<r.length;i++){const j=(i+1)%r.length;a+=r[i][0]*r[j][1]-r[j][0]*r[i][1]}return s+Math.abs(a)/2},0)
const SWarea=(r)=>area(r.Wacc), TLarea=(r)=>Object.values(r.tlByLu).reduce((s,x)=>s+area(x),0)
function mkSplit(EPS){
  const dirTo=(f)=>{const dx=f[0]-mouth[0],dy=f[1]-mouth[1];const L=Math.hypot(dx,dy)||1;return [dx/L,dy/L]}
  const d1=dirTo(f1),d2=dirTo(f2)
  const m1=[mouth[0]+d1[0]*EPS,mouth[1]+d1[1]*EPS], m2=[mouth[0]+d2[0]*EPS,mouth[1]+d2[1]*EPS]
  const near=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<0.01
  const st=JSON.parse(JSON.stringify(shape.tiles[53]))
  for(const r of st.runs) if(r.skelId==='albion-place'){
    const last=r.poly.length-1
    if(near(r.poly[0],mouth)) r.poly[0]=(r.side==='right'?m2:m1)
    if(near(r.poly[last],mouth)) r.poly[last]=(r.side==='left'?m1:m2)
  }
  return st
}
const base=sectionPassTile(JSON.parse(JSON.stringify(shape.tiles[53])),cw,{outer:'LU',inner:'SW'},null)
console.log(`BASELINE  SW=${SWarea(base).toFixed(2)}  TL=${TLarea(base).toFixed(2)}`)
for(const EPS of [0.5, 2, 4, 8]){
  const r=sectionPassTile(mkSplit(EPS),cw,{outer:'LU',inner:'SW'},null)
  console.log(`EPS=${EPS}   SW=${SWarea(r).toFixed(2)}  TL=${TLarea(r).toFixed(2)}  dSW=${(SWarea(r)-SWarea(base)).toFixed(2)} dTL=${(TLarea(r)-TLarea(base)).toFixed(2)}`)
}
