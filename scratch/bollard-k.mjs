import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1,emitArtifact:true})
const sa=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
function analyze(lab,N){
  console.log('\n========== '+lab+' N=['+N+'] ==========')
  // which tiles touch N
  g._shapeArtifact.forEach((st,ti)=>{
    if(!st.ring.some(p=>Math.hypot(p[0]-N[0],p[1]-N[1])<20))return
    console.log(' tile#'+ti+' bandJoin='+st.bandJoin+' tl='+st.tl.toFixed(2)+' sw='+st.sw.toFixed(2)+' cap='+st.cap.toFixed(2)+' WB='+(d.curbWidth+st.tl+st.sw).toFixed(2)+' clamped='+(st.cap<d.curbWidth+st.tl+st.sw-1e-3))
  })
  // iA vs sidewalk thorn presence near N
  for(const [kk,rings] of [['iA(curb-src)',g._shapeArtifact.flatMap(s=>s.iA||[])],['sidewalk',g.sidewalk],['asphalt',g.asphalt]]){
    let worst={t:0};for(const ring of rings){const pts=Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z]);const sign=sa(pts)>=0?1:-1
      for(let i=0;i<pts.length;i++){const b=pts[i];if(Math.hypot(b[0]-N[0],b[1]-N[1])>20)continue;const a=pts[(i-1+pts.length)%pts.length],c=pts[(i+1)%pts.length];let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)continue;ix/=li;iz/=li;ox/=lo;oz/=lo;const cross=ix*oz-iz*ox,t=Math.acos(Math.max(-1,Math.min(1,ix*ox+iz*oz)))*180/Math.PI;if(t>worst.t)worst={t,p:b,cvx:cross*sign>0?'CVX':'CNCV'}}}
    if(worst.t>30)console.log('  '+kk+' worst: '+worst.t.toFixed(0)+'° '+worst.cvx+' @['+worst.p[0].toFixed(1)+','+worst.p[1].toFixed(1)+'] d='+Math.hypot(worst.p[0]-N[0],worst.p[1]-N[1]).toFixed(1)+'m')
    else console.log('  '+kk+' clean near N (<30°)')
  }
}
analyze('#1 Vail/Park',[340,-120.6])
analyze('#2 Kennett/Miss',[179.9,115.9])
analyze('#3 Mackay/Park',[-48,-203.9])
analyze('#4 Waverly/Laf',[-25.3,191.6])
