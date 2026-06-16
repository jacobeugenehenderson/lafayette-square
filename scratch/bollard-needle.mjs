import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx0=bnd.center[0],cz0=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0,cz0+(z-cz0)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1})
const sa=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
const turn=(a,b,c)=>{let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)return 0;return Math.acos(Math.max(-1,Math.min(1,(ix*ox+iz*oz)/(li*lo))))*180/Math.PI}
const C=[-40.7,175.6]
for(const [kk,rings] of [['curb',g.curb],['sidewalk',g.sidewalk]]){
  rings.forEach((ring,ri)=>{
    const pts=Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z])
    const idxs=[];for(let i=0;i<pts.length;i++)if(Math.hypot(pts[i][0]-C[0],pts[i][1]-C[1])<10)idxs.push(i)
    if(idxs.length<2)return
    const sign=sa(pts)>=0?1:-1
    console.log('\n'+kk+'#'+ri+' ('+pts.length+'pts) — vertices within 10m of circle A, in ring order:')
    let prev=-99
    for(const i of idxs){
      if(i!==prev+1)console.log('   --- (gap in ring index) ---')
      const a=pts[(i-1+pts.length)%pts.length],b=pts[i],c=pts[(i+1)%pts.length]
      const t=turn(a,b,c)
      const seg=Math.min(Math.hypot(b[0]-a[0],b[1]-a[1]),Math.hypot(c[0]-b[0],c[1]-b[1]))
      console.log('   i='+i+' ['+b[0].toFixed(2)+','+b[1].toFixed(2)+'] turn='+t.toFixed(0)+'° minSeg='+seg.toFixed(2)+'m'+(t>60?'  <<< SPIKE':''))
      prev=i
    }
  })
}
