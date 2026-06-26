import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw = CURB_WIDTH
const mouth=[-177.5,-78.7]

function render(tile, fname){
  const r = sectionPassTile(tile, cw, {outer:'LU',inner:'SW'}, null)
  // focus window around the albion mouth
  const cx=-260, cy=-90, W=260, H=180
  const sx=(x)=>(x-(cx-W/2))*2, sy=(y)=>((cy+H/2)-y)*2  // flip y, 2px/m
  const path=(rings,fill,op=1)=>rings.map(ring=>`<path d="M${ring.map(p=>sx(p[0])+','+sy(p[1])).join('L')}Z" fill="${fill}" fill-opacity="${op}" stroke="none"/>`).join('')
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W*2}" height="${H*2}" style="background:#333">`
  // iA = asphalt area outline
  svg+=path(tile.iA, '#555', 1)
  // LU (parcel) green-ish
  for(const k in r.luByLu) svg+=path(r.luByLu[k], '#3a5', 0.8)
  for(const k in r.tlByLu) svg+=path(r.tlByLu[k], '#5c4', 0.9)
  // sidewalk cream
  svg+=path(r.Wacc, '#eedda0', 1)
  // mark mouth + tip + fillets
  svg+=`<circle cx="${sx(mouth[0])}" cy="${sy(mouth[1])}" r="4" fill="red"/>`
  for(const f of (tile.fillets||[])) svg+=`<circle cx="${sx(f.apex[0])}" cy="${sy(f.apex[1])}" r="3" fill="blue"/>`
  svg+='</svg>'
  fs.writeFileSync(new URL('../scratch/'+fname, import.meta.url), svg)
  console.log(`wrote ${fname}`)
}
render(JSON.parse(JSON.stringify(shape.tiles[53])), 'tile53-baseline.svg')
