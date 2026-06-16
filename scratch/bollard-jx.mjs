import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1,cornerRadiusOverrides:d.cornerRadiusOverrides||null,cornerCornerRadiusOverrides:d.cornerCornerRadiusOverrides||null,blockCustoms:d.blockCustoms||null})
const turn=(a,b,c)=>{const ax=b[0]-a[0],az=b[1]-a[1],bx=c[0]-b[0],bz=c[1]-b[1];const la=Math.hypot(ax,az),lb=Math.hypot(bx,bz);if(la<1e-6||lb<1e-6)return 0;return Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/(la*lb))))*180/Math.PI}
const asPts=ring=>Array.isArray(ring)&&ring.length?(Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z])):null
const JUNCS=[['#1 Vail→Park',340.0,-120.6],['#2 Kennett→Miss',179.9,115.9],['#3 Mackay→Park',-48.0,-203.9],['#4 Waverly→Laf',-25.3,191.6]]
for(const [lab,jx,jz] of JUNCS){
  const near=p=>Math.hypot(p[0]-jx,p[1]-jz)<18
  console.log('\n===== '+lab+' ['+jx+','+jz+'] =====')
  for(const k of ['curb','sidewalk','block','asphalt']){
    const rings=g[k]; if(!Array.isArray(rings))continue
    rings.forEach((ring,ri)=>{const pts=asPts(ring); if(!pts||pts.length<3||!pts.some(near))return
      let spikes=[]
      for(let i=0;i<pts.length;i++){const a=pts[(i-1+pts.length)%pts.length],b=pts[i],c=pts[(i+1)%pts.length];if(!near(b))continue;const t=turn(a,b,c);if(t>55)spikes.push('['+b[0].toFixed(1)+','+b[1].toFixed(1)+']='+t.toFixed(0)+'°')}
      if(spikes.length)console.log('  '+k+'#'+ri+' ('+pts.length+'pts):',spikes.slice(0,6).join(' '))
    })
  }
}
