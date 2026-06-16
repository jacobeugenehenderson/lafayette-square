import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const R = JSON.parse(fs.readFileSync('/Users/jacobhenderson/Desktop/lsq-chord-toomuchline/src/data/ribbons.json','utf8'))
const turn=(a,b,c)=>{const ax=b[0]-a[0],az=b[1]-a[1],bx=c[0]-b[0],bz=c[1]-b[1];const la=Math.hypot(ax,az),lb=Math.hypot(bx,bz);if(la<1e-6||lb<1e-6)return 0;return Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/(la*lb))))*180/Math.PI}
const asPts = ring => Array.isArray(ring)&&ring.length?(Array.isArray(ring[0])?ring:ring.map(p=>[p.X!==undefined?p.X/1000:p.x,p.Y!==undefined?p.Y/1000:p.z])):null
// scallop signature: count interior vertices in sidewalk/curb rings with a SMALL wiggle (15-75°)
// total across the map — more = more scalloping
function scallops(smooth, label){
  const g=buildTileGround(R,{smooth})
  let total=0, verts=0
  for(const k of ['sidewalk','curb']){const rings=g[k];if(!Array.isArray(rings))continue
    for(const ring of rings){const pts=asPts(ring);if(!pts||pts.length<3)continue;verts+=pts.length
      for(let i=0;i<pts.length;i++){const a=pts[(i-1+pts.length)%pts.length],b=pts[i],c=pts[(i+1)%pts.length];const t=turn(a,b,c);if(t>15&&t<75)total++}}}
  console.log(`  smooth=${label}: band verts=${verts}  small-wiggles(15-75°)=${total}`)
}
console.log('Sidewalk+curb band scallop count by smoothing density (spacingFor: 0.5→1.5m, 0.25→3m, 0.1→7.5m):')
scallops(0.5,'0.5 (1.5m, CURRENT pinned)')
scallops(0.25,'0.25 (3m)')
scallops(0.1,'0.1 (7.5m)')
scallops(0,'0 (raw, no smoothing)')
