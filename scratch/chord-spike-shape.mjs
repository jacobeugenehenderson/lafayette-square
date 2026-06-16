import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const R = JSON.parse(fs.readFileSync('/Users/jacobhenderson/Desktop/lsq-chord-toomuchline/src/data/ribbons.json','utf8'))
const g = buildTileGround(R,{smooth:0})
const J=[340.0,-120.6]  // Vail Ts into Park Ave (#1)
const near=p=>Math.hypot(p[0]-J[0],p[1]-J[1])<14
const asPts=ring=>Array.isArray(ring)&&ring.length?(Array.isArray(ring[0])?ring:ring.map(p=>[p.x,p.z])):null
// find the sidewalk ring with the spike, dump its vertices near J IN ORDER
for(const [kk,rings] of [['sidewalk',g.sidewalk],['curb',g.curb]]){
  if(!Array.isArray(rings))continue
  rings.forEach((ring,ri)=>{const pts=asPts(ring);if(!pts||!pts.some(near))return
    const seq=[]; for(let i=0;i<pts.length;i++){if(near(pts[i]))seq.push(i)}
    if(seq.length<2)return
    // print contiguous run of near vertices
    console.log(kk+' ring#'+ri+' ('+pts.length+'pts) — vertices near Vail/Park T, in order:')
    let prev=-2
    for(const i of seq){ if(i!==prev+1)console.log('   ...'); console.log('   ['+pts[i][0].toFixed(1)+','+pts[i][1].toFixed(1)+']'); prev=i }
  })
}
