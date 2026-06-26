import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw=CURB_WIDTH
function render(st, r, fname, center, span){
  const [cx,cy]=center, W=span,H=span, SC=900/span
  const sx=(x)=>(x-(cx-W/2))*SC, sy=(y)=>((cy+H/2)-y)*SC
  const path=(rings,fill,op=1)=>rings.filter(g=>g.length>=3).map(ring=>`<path d="M${ring.map(p=>sx(p[0]).toFixed(1)+','+sy(p[1]).toFixed(1)).join('L')}Z" fill="${fill}" fill-opacity="${op}"/>`).join('')
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" style="background:#444">`
  svg+=path(st.iA,'#666',1)
  for(const k in r.luByLu) svg+=path(r.luByLu[k],'#2a4',0.7)
  for(const k in r.tlByLu) svg+=path(r.tlByLu[k],'#6b3',0.95)
  svg+=path(r.Wacc,'#f0e0a0',1)
  for(const ring of st.iA) svg+=`<path d="M${ring.map(p=>sx(p[0]).toFixed(1)+','+sy(p[1]).toFixed(1)).join('L')}Z" fill="none" stroke="#000" stroke-width="0.8"/>`
  svg+='</svg>'
  fs.writeFileSync(new URL('../scratch/'+fname,import.meta.url),svg)
}
const st=shape.tiles[53]
const r=sectionPassTile(JSON.parse(JSON.stringify(st)),cw,{outer:'LU',inner:'SW'},null)
render(st,r,'tile53-mouth.svg',[-180,-78],55)  // albion mouth at -177.5,-78.7
render(st,r,'tile53-tip.svg',[-361,-109],45)   // albion tip
console.log('done')
