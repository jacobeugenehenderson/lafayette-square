import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw = CURB_WIDTH
const mouth=[-177.5,-78.7]
const f1=[-184.68,-85.45], f2=[-186.47,-74.61]
const dirTo=(f)=>{const dx=f[0]-mouth[0],dy=f[1]-mouth[1];const L=Math.hypot(dx,dy)||1;return [dx/L,dy/L]}
const EPS=0.5, d1=dirTo(f1), d2=dirTo(f2)
const m1=[mouth[0]+d1[0]*EPS,mouth[1]+d1[1]*EPS], m2=[mouth[0]+d2[0]*EPS,mouth[1]+d2[1]*EPS]
const near=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<0.01
const st2=JSON.parse(JSON.stringify(shape.tiles[53]))
for(const r of st2.runs){
  if(r.skelId==='albion-place'){
    const last=r.poly.length-1
    if(near(r.poly[0],mouth)){ r.poly[0]=(r.side==='right'?m2:m1) }
    if(near(r.poly[last],mouth)){ r.poly[last]=(r.side==='left'?m1:m2) }
  }
}
console.log("after split, albion run ends:")
for(const r of st2.runs) if(r.skelId==='albion-place') console.log(`  ${r.side}: ${r.poly[0].map(x=>+x.toFixed(3))} -> ${r.poly[r.poly.length-1].map(x=>+x.toFixed(3))}`)
globalThis.__SPUR_PROBE=(d)=>{ console.log('cornerT keys near mouth:'); for(const c of d.cornerT) if(Math.hypot(c.p[0]-mouth[0],c.p[1]-mouth[1])<3) console.log(`  ${c.k} p=${c.p.map(x=>+x.toFixed(2))} legs=${c.legs} trim=${c.trim?.toFixed(2)}`) }
sectionPassTile(st2, cw, {outer:'LU',inner:'SW'}, null)
