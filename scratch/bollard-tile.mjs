import { buildTileGround, sectionPass } from '../src/lib/tileGround.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1,emitArtifact:true})
const turn=(a,b,c)=>{const ax=b[0]-a[0],az=b[1]-a[1],bx=c[0]-b[0],bz=c[1]-b[1];const la=Math.hypot(ax,az),lb=Math.hypot(bx,bz);if(la<1e-6||lb<1e-6)return 0;return Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/(la*lb))))*180/Math.PI}
const J=[340.0,-120.6]
const near=(p,r=18)=>Math.hypot(p[0]-J[0],p[1]-J[1])<r
const art=g._shapeArtifact
// find tiles whose ring touches J
art.forEach((st,ti)=>{
  if(!st.ring.some(p=>near(p,16)))return
  console.log('\n=== TILE #'+ti+' ring('+st.ring.length+'pts) bandJoin='+st.bandJoin+' tl='+st.tl.toFixed(2)+' sw='+st.sw.toFixed(2)+' cap='+(st.cap||0).toFixed?.(2))
  // runs
  console.log('  runs:',st.runs.map(r=>`${r.skelId||'?'}/${r.side}(${r.poly.length}pt)`).join('  '))
  // ring spikes near J
  const rp=st.ring
  let rs=[];for(let i=0;i<rp.length;i++){if(!near(rp[i]))continue;const t=turn(rp[(i-1+rp.length)%rp.length],rp[i],rp[(i+1)%rp.length]);if(t>40)rs.push('['+rp[i][0].toFixed(1)+','+rp[i][1].toFixed(1)+']='+t.toFixed(0)+'°')}
  console.log('  RING spikes>40°:',rs.join(' ')||'(none)')
  // iA spikes near J
  for(const ia of (st.iA||[])){let is=[];for(let i=0;i<ia.length;i++){if(!near(ia[i]))continue;const t=turn(ia[(i-1+ia.length)%ia.length],ia[i],ia[(i+1)%ia.length]);if(t>40)is.push('['+ia[i][0].toFixed(1)+','+ia[i][1].toFixed(1)+']='+t.toFixed(0)+'°')}
    if(is.length)console.log('  iA spikes>40°:',is.join(' '))}
})
