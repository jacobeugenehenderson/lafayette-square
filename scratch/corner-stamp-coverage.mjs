// corner-stamp-coverage.mjs — do the CO-CLAIMING corners sit where the node
// stamp ISN'T? junctionMap stamps 233 nodes (kinds/legs/corners); the shape pass
// freezes 568 corners. The skeleton drops degree-2 nodes (`if (d===2) continue`),
// so a BEND makes a corner nobody stamped. This correlates the two.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
let design = {}; try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json','utf8')) } catch {}
const o=console.log; console.log=()=>{}
const g=buildTileGround(ribbons,{smooth:0,emitArtifact:true,blockCustoms:design.blockCustoms||null,curbWidth:design.curbWidth??0.15})
console.log=o
const prep=(rings)=>(rings||[]).map(r=>{let x0=1/0,y0=1/0,x1=-1/0,y1=-1/0;for(const p of r){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]}return{r,x0,y0,x1,y1}})
const inR=(idx,x,y)=>{let ins=false;for(const b of idx){if(x<b.x0||x>b.x1||y<b.y0||y>b.y1)continue;const r=b.r;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins}}return ins}
const TL=prep(Object.values(g.treelawnByLu||{}).flat()), LU=prep(Object.values(g.luByClass||{}).flat()), SW=prep(g.sidewalk)
const nodes=(ribbons.junctionMap?.nodes)||[]
const NEAR=16
const corners=[]
for(const st of (g._shapeArtifact||[])) for(const f of (st.fillets||[])) if(f.apex) corners.push(f.apex)
const STEP=0.2,R=9
let stamped={n:0,co:0}, unstamped={n:0,co:0}
for(const apex of corners){
  let co=0
  for(let dx=-R;dx<=R;dx+=STEP)for(let dy=-R;dy<=R;dy+=STEP){
    if(dx*dx+dy*dy>R*R)continue
    const x=apex[0]+dx,y=apex[1]+dy
    const n=(inR(SW,x,y)?1:0)+(inR(TL,x,y)?1:0)+(inR(LU,x,y)?1:0)
    if(n>=2)co++
  }
  const area=co*STEP*STEP
  const hasStamp=nodes.some(nd=>Math.hypot(nd.at[0]-apex[0],nd.at[1]-apex[1])<NEAR)
  const b=hasStamp?stamped:unstamped
  b.n++; b.co+=area
}
console.log(`corners near a junctionMap stamp (<${NEAR} m): ${stamped.n}`)
console.log(`   co-claim total ${stamped.co.toFixed(1)} m2   mean ${(stamped.co/(stamped.n||1)).toFixed(2)} m2/corner`)
console.log(`corners with NO stamp nearby:                 ${unstamped.n}`)
console.log(`   co-claim total ${unstamped.co.toFixed(1)} m2   mean ${(unstamped.co/(unstamped.n||1)).toFixed(2)} m2/corner`)
