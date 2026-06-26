import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw = CURB_WIDTH
const mouth=[-177.5,-78.7]
const r = sectionPassTile(JSON.parse(JSON.stringify(shape.tiles[53])), cw, {outer:'LU',inner:'SW'}, null)
const inWin=(p)=>Math.hypot(p[0]-mouth[0],p[1]-mouth[1])<60
function dump(name, rings){
  let n=0
  rings.forEach((ring,ri)=>{
    const pts=ring.filter(inWin)
    if(pts.length){ n++; console.log(`  ${name}[${ri}] ${ring.length}v, ${pts.length} in-window: ${pts.slice(0,8).map(p=>p.map(x=>+x.toFixed(1))).map(p=>`(${p})`).join(' ')}${pts.length>8?'...':''}`) }
  })
  if(!n) console.log(`  ${name}: none in window`)
}
console.log('=== Wacc (sidewalk) ==='); dump('SW', r.Wacc)
console.log('=== tlByLu (treelawn) ==='); for(const k in r.tlByLu) dump('TL.'+k, r.tlByLu[k])
