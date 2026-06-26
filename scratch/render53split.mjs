import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw=CURB_WIDTH, mouth=[-177.5,-78.7]
const f1=[-184.68,-85.45], f2=[-186.47,-74.61]
function mkSplit(EPS){
  const dirTo=(f)=>{const dx=f[0]-mouth[0],dy=f[1]-mouth[1];const L=Math.hypot(dx,dy)||1;return [dx/L,dy/L]}
  const d1=dirTo(f1),d2=dirTo(f2), m1=[mouth[0]+d1[0]*EPS,mouth[1]+d1[1]*EPS], m2=[mouth[0]+d2[0]*EPS,mouth[1]+d2[1]*EPS]
  const near=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<0.01
  const st=JSON.parse(JSON.stringify(shape.tiles[53]))
  for(const r of st.runs) if(r.skelId==='albion-place'){
    const last=r.poly.length-1
    if(near(r.poly[0],mouth)) r.poly[0]=(r.side==='right'?m2:m1)
    if(near(r.poly[last],mouth)) r.poly[last]=(r.side==='left'?m1:m2)
  }
  return st
}
function render(st,r,fname){
  const cx=-180,cy=-78,span=55,SC=900/span
  const sx=(x)=>(x-(cx-span/2))*SC, sy=(y)=>((cy+span/2)-y)*SC
  const path=(rings,fill,op=1)=>rings.filter(g=>g.length>=3).map(ring=>`<path d="M${ring.map(p=>sx(p[0]).toFixed(1)+','+sy(p[1]).toFixed(1)).join('L')}Z" fill="${fill}" fill-opacity="${op}"/>`).join('')
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" style="background:#444">`
  svg+=path(st.iA,'#666',1)
  for(const k in r.luByLu) svg+=path(r.luByLu[k],'#2a4',0.7)
  for(const k in r.tlByLu) svg+=path(r.tlByLu[k],'#6b3',0.95)
  svg+=path(r.Wacc,'#f0e0a0',1)
  for(const ring of st.iA) svg+=`<path d="M${ring.map(p=>sx(p[0]).toFixed(1)+','+sy(p[1]).toFixed(1)).join('L')}Z" fill="none" stroke="#000" stroke-width="0.8"/>`
  svg+='</svg>'; fs.writeFileSync(new URL('../scratch/'+fname,import.meta.url),svg)
}
const stS=mkSplit(4)
render(stS, sectionPassTile(stS,cw,{outer:'LU',inner:'SW'},null),'tile53-mouth-split4.svg')
console.log('done')
