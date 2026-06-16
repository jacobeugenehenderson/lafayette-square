import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1})
const sa=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
const A=[343,-104]
for(const [kk,rings] of [['sidewalk',g.sidewalk],['curb',g.curb]]){
  rings.forEach((ring,ri)=>{
    const pts=Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z])
    if(!pts.some(p=>Math.hypot(p[0]-A[0],p[1]-A[1])<8))return
    const sign=sa(pts)>=0?1:-1
    console.log('\n'+kk+'#'+ri+' '+pts.length+'pts sign='+(sign>0?'+':'-')+' — near ['+A+']:')
    for(let i=0;i<pts.length;i++){const b=pts[i];if(Math.hypot(b[0]-A[0],b[1]-A[1])>8)continue
      const a=pts[(i-1+pts.length)%pts.length],c=pts[(i+1)%pts.length]
      let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1]
      const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)continue;ix/=li;iz/=li;ox/=lo;oz/=lo
      const cross=ix*oz-iz*ox,turn=Math.acos(Math.max(-1,Math.min(1,ix*ox+iz*oz)))*180/Math.PI
      const cvx=(cross*sign>0)?'CVX':'CNCV'
      console.log('  i='+i+' ['+b[0].toFixed(2)+','+b[1].toFixed(2)+'] turn='+turn.toFixed(0)+'° '+cvx+(turn>40?'  <<<'+(cvx==='CNCV'?'THORN':''):''))
    }
  })
}
