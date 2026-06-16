import { buildTileGround } from '../src/lib/tileGround.js'
import { jKey } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const R = JSON.parse(fs.readFileSync('/Users/jacobhenderson/Desktop/lsq-chord-toomuchline/src/data/ribbons.json','utf8'))
const M = JSON.parse(fs.readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/lafayette-square/clean/marker_strokes.json','utf8')).slice(-4)
const g = buildTileGround(R,{smooth:0})
const turn=(a,b,c)=>{const ax=b[0]-a[0],az=b[1]-a[1],bx=c[0]-b[0],bz=c[1]-b[1];const la=Math.hypot(ax,az),lb=Math.hypot(bx,bz);if(la<1e-6||lb<1e-6)return 0;return Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/(la*lb))))*180/Math.PI}
const asPts=ring=>Array.isArray(ring)&&ring.length?(Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z])):null
const deg={},pt={};for(const s of R.streets){const p=s.points;if(!p)continue;for(let i=0;i<p.length;i++){const k=jKey(p[i][0],p[i][1]);const inc=(i===0||i===p.length-1)?1:2;deg[k]=(deg[k]||0)+inc;pt[k]=[p[i][0],p[i][1]]}}
const labels=['#1 corner-A','#2 corner-B(diag)','#3 park-side-N','#4 park-side-S(mirror)']
M.forEach((stroke,i)=>{
  const sp=stroke.map(p=>[p.x,p.z])
  const mind=(P)=>Math.min(...sp.map(q=>Math.hypot(P[0]-q[0],P[1]-q[1])))
  // nearest junction to the stroke
  let bestK=null,bd=1e9;for(const k in deg){if(deg[k]<3)continue;const d=mind(pt[k]);if(d<bd){bd=d;bestK=k}}
  const J=pt[bestK]
  console.log('\n===== '+labels[i]+' → nearest junction ['+J[0].toFixed(1)+','+J[1].toFixed(1)+'] deg='+deg[bestK]+' ('+bd.toFixed(0)+'m) =====')
  for(const s of R.streets){const idx=s.points.findIndex(p=>jKey(p[0],p[1])===bestK);if(idx<0)continue;const tat=(idx>0&&idx<s.points.length-1)?turn(s.points[idx-1],s.points[idx],s.points[idx+1]).toFixed(0)+'°':'endpoint';console.log('   '+(s.name||'?').padEnd(20)+' @'+tat)}
  // band spikes near the STROKE (within 8m of any stroke pt)
  const nearStroke=p=>mind(p)<8
  for(const kk of ['curb','sidewalk','block']){const rings=g[kk];if(!Array.isArray(rings))continue
    for(const ring of rings){const pts=asPts(ring);if(!pts||pts.length<3||!pts.some(nearStroke))continue
      let sp2=[];for(let j=0;j<pts.length;j++){const a=pts[(j-1+pts.length)%pts.length],b=pts[j],c=pts[(j+1)%pts.length];if(!nearStroke(b))continue;const t=turn(a,b,c);if(t>50)sp2.push('['+b[0].toFixed(1)+','+b[1].toFixed(1)+']='+t.toFixed(0)+'°')}
      if(sp2.length)console.log('   ['+kk+'] spikes:',sp2.slice(0,4).join(' '))}}
})
