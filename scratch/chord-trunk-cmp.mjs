import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const turn=(a,b,c)=>{const ax=b[0]-a[0],az=b[1]-a[1],bx=c[0]-b[0],bz=c[1]-b[1];const la=Math.hypot(ax,az),lb=Math.hypot(bx,bz);if(la<1e-6||lb<1e-6)return 0;return Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/(la*lb))))*180/Math.PI}
const asPts = ring => Array.isArray(ring) ? (Array.isArray(ring[0]) ? ring : ring.map(p=>[p.X!==undefined?p.X/1000:p.x, p.Y!==undefined?p.Y/1000:p.z])) : null
const JUNCS=[['#1',29.3,-434.9],['#2',18.4,-402.0],['#3',-48.0,-203.9],['#4',340.0,-120.6]]
function countSpikes(R, tag){
  const g=buildTileGround(R,{smooth:0.5})
  console.log('\n--- '+tag+' ---')
  for(const [lab,jx,jz] of JUNCS){
    const near=p=>Math.hypot(p[0]-jx,p[1]-jz)<20
    let cnt=0,worst=0
    for(const k of ['curb','sidewalk','block']){const rings=g[k];if(!Array.isArray(rings))continue
      for(const ring of rings){const pts=asPts(ring);if(!pts||pts.length<3||!pts.some(near))continue
        for(let i=0;i<pts.length;i++){const a=pts[(i-1+pts.length)%pts.length],b=pts[i],c=pts[(i+1)%pts.length];if(!near(b))continue;const t=turn(a,b,c);if(t>110){cnt++;worst=Math.max(worst,t)}}}}
    console.log('  '+lab+' near-J reversals(>110°): '+cnt+' worst '+worst.toFixed(0)+'°')
  }
}
countSpikes(JSON.parse(fs.readFileSync('/Users/jacobhenderson/Desktop/lsq-chord-toomuchline/src/data/ribbons.json','utf8')), 'WORKTREE frame (RDP+fixes)')
countSpikes(JSON.parse(fs.readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/src/data/ribbons.json','utf8')), 'TRUNK frame (original)')
