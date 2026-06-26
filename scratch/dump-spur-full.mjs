import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw=CURB_WIDTH, mouth=[-177.5,-78.7], tip=[-361.18,-108.99]
const ax=[tip[0]-mouth[0],tip[1]-mouth[1]]; const aL=Math.hypot(...ax); ax[0]/=aL;ax[1]/=aL
const r=sectionPassTile(JSON.parse(JSON.stringify(shape.tiles[53])),cw,{outer:'LU',inner:'SW'},null)
// For each SW/TL ring, find its bounding box centroid along the spur axis (s from mouth).
function classify(name,rings){
  rings.forEach((ring,ri)=>{
    // centroid
    const c=ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0])
    const s=(c[0]-mouth[0])*ax[0]+(c[1]-mouth[1])*ax[1]
    // does it straddle the spur (within ~10m of spur axis)?
    const perpd=Math.abs((c[0]-mouth[0])*(-ax[1])+(c[1]-mouth[1])*ax[0])
    if(s>5 && s<185 && perpd<12) console.log(`  ${name}[${ri}] centroid s=${s.toFixed(0)}m perp=${perpd.toFixed(1)} verts=${ring.length}`)
  })
}
console.log('SW rings ALONG the albion spur (s=5..185m):'); classify('SW',r.Wacc)
console.log('TL rings ALONG the spur:'); for(const k in r.tlByLu) classify('TL',r.tlByLu[k])
console.log('\nTip cap region (roundTips reclaim). roundTips:',JSON.stringify(shape.tiles[53].roundTips.map(t=>t.p)))
