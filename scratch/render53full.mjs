import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw=CURB_WIDTH
const r=sectionPassTile(JSON.parse(JSON.stringify(shape.tiles[53])),cw,{outer:'LU',inner:'SW'},null)
const st=shape.tiles[53]
// bbox of the whole tile
let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9
for(const ring of st.iA) for(const p of ring){minx=Math.min(minx,p[0]);maxx=Math.max(maxx,p[0]);miny=Math.min(miny,p[1]);maxy=Math.max(maxy,p[1])}
const PAD=10; minx-=PAD;miny-=PAD;maxx+=PAD;maxy+=PAD
const W=maxx-minx,H=maxy-miny, SC=1.5
const sx=(x)=>(x-minx)*SC, sy=(y)=>(maxy-y)*SC
const path=(rings,fill,op=1)=>rings.filter(r=>r.length>=3).map(ring=>`<path d="M${ring.map(p=>sx(p[0]).toFixed(1)+','+sy(p[1]).toFixed(1)).join('L')}Z" fill="${fill}" fill-opacity="${op}"/>`).join('')
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${(W*SC).toFixed(0)}" height="${(H*SC).toFixed(0)}" style="background:#444">`
svg+=path(st.iA,'#666',1)         // asphalt
for(const k in r.luByLu) svg+=path(r.luByLu[k],'#2a4',0.7)   // parcel/median
for(const k in r.tlByLu) svg+=path(r.tlByLu[k],'#6b3',0.95)  // treelawn
svg+=path(r.Wacc,'#f0e0a0',1)     // sidewalk cream
// curb outline
for(const ring of st.iA) svg+=`<path d="M${ring.map(p=>sx(p[0]).toFixed(1)+','+sy(p[1]).toFixed(1)).join('L')}Z" fill="none" stroke="#000" stroke-width="0.6"/>`
svg+='</svg>'
fs.writeFileSync(new URL('../scratch/tile53-full.svg',import.meta.url),svg)
console.log('wrote scratch/tile53-full.svg', (W).toFixed(0)+'x'+(H).toFixed(0)+'m')
