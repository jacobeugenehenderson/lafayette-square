import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw=CURB_WIDTH, mouth=[-177.5,-78.7], tip=[-361.18,-108.99]
const ax=[tip[0]-mouth[0],tip[1]-mouth[1]]; const aL=Math.hypot(...ax); ax[0]/=aL;ax[1]/=aL
const r=sectionPassTile(JSON.parse(JSON.stringify(shape.tiles[53])),cw,{outer:'LU',inner:'SW'},null)
// SW[2] and TL[3] extents
const along=(p)=>(p[0]-mouth[0])*ax[0]+(p[1]-mouth[1])*ax[1]
const perp=(p)=>(p[0]-mouth[0])*(-ax[1])+(p[1]-mouth[1])*ax[0]
function ext(name,ring){
  let smin=1e9,smax=-1e9
  for(const p of ring){ const s=along(p); if(s<smin)smin=s; if(s>smax)smax=s }
  console.log(`  ${name}: along-spur s=[${smin.toFixed(0)}..${smax.toFixed(0)}]m, verts=${ring.length}`)
}
console.log('SW rings:'); r.Wacc.forEach((ring,i)=>{ if(ring.length>20) ext('SW['+i+']',ring) })
console.log('TL rings:'); for(const k in r.tlByLu) r.tlByLu[k].forEach((ring,i)=>{ if(ring.length>20) ext('TL['+i+']',ring) })
// Now: is there ANY sidewalk between s=20 and s=150 along the spur walls (perp ~ +-6m)?
let bodyHits=0
for(const ring of r.Wacc) for(const p of ring){ const s=along(p),pd=Math.abs(perp(p)); if(s>20&&s<150&&pd>3&&pd<8) bodyHits++ }
console.log(`\nSW vertices on the spur BODY walls (s 20-150, perp 3-8m): ${bodyHits}`)
