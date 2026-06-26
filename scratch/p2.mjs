import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw=CURB_WIDTH, mouth=[-177.5,-78.7], tip=[-361.18,-108.99]
const ax=[tip[0]-mouth[0],tip[1]-mouth[1]]; const aL=Math.hypot(...ax); ax[0]/=aL;ax[1]/=aL
const along=(p)=>(p[0]-mouth[0])*ax[0]+(p[1]-mouth[1])*ax[1]
const perp=(p)=>(p[0]-mouth[0])*(-ax[1])+(p[1]-mouth[1])*ax[0]
globalThis.__P2=(d)=>{
  // does fullBand cover the spur body wall? count fullBand verts at s 20-150, perp 3-8
  let body=0,total=0
  for(const ring of d.fullBand) for(const p of ring){ total++; const s=along(p),pd=Math.abs(perp(p)); if(s>20&&s<150&&pd>3&&pd<7) body++ }
  console.log(`fullBand rings=${d.fullBand.length} totalVerts=${total} spurBodyWallVerts(s20-150,perp3-7)=${body}`)
  console.log(`pieces: ${JSON.stringify(d.pieces)}`)
}
sectionPassTile(JSON.parse(JSON.stringify(shape.tiles[53])),cw,{outer:'LU',inner:'SW'},null)
