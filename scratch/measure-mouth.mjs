import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw = CURB_WIDTH
const mouth=[-177.5,-78.7], tip=[-361.18,-108.99]
// spur axis direction (mouth->tip)
const ax=[tip[0]-mouth[0],tip[1]-mouth[1]]; const aL=Math.hypot(...ax); ax[0]/=aL;ax[1]/=aL
const perp=[-ax[1],ax[0]]
// For a set of rings, sample whether the sidewalk covers points along the two spur walls near the mouth.
// Walls offset from centerline by pavementHW(5.49)+cw to the curb; sidewalk is inward of curb.
function cover(rings, p){ // point-in-any-ring
  let inside=false
  for(const r of rings){ let c=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ if((r[i][1]>p[1])!==(r[j][1]>p[1]) && p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0]) c=!c } if(c){inside=true;break} } return inside
}
function probe(tile, label){
  const r=sectionPassTile(tile,cw,{outer:'LU',inner:'SW'},null)
  console.log(`\n=== ${label} ===`)
  // Sample along the spur from the mouth toward the tip, at the sidewalk band on each wall.
  // curb dist ~ pavementHW (5.49) + cw(0.15). sidewalk sits curb..curb+sw. Sample at curb+0.7m inward on each wall.
  const hw=5.49+cw
  for(let s=0;s<=30;s+=3){ // meters along spur from mouth
    const base=[mouth[0]+ax[0]*s, mouth[1]+ax[1]*s]
    const wallA=[base[0]+perp[0]*(hw-0.7), base[1]+perp[1]*(hw-0.7)]
    const wallB=[base[0]-perp[0]*(hw-0.7), base[1]-perp[1]*(hw-0.7)]
    console.log(`  s=${s}m  wallA SW=${cover(r.Wacc,wallA)?'YES':'no '}  wallB SW=${cover(r.Wacc,wallB)?'YES':'no '}`)
  }
}
probe(JSON.parse(JSON.stringify(shape.tiles[53])),'BASELINE')
