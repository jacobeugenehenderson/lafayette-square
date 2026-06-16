import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const tg=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:d.streetSmooth??0.5,blockLandUse:d.blockLandUse,emitArtifact:true})
const arts=tg._shapeArtifact||[]
let round=0,miter=0;for(const st of arts){if(st.bandJoin==='round')round++;else miter++}
console.log('tiles:',arts.length,' round:',round,' miter:',miter)
// tiles overlapping the lollipop window [0..120, -380..-260]
let inWin=0,inWinRound=0
for(const st of arts){const rg=st.ring;let hit=false;for(const p of rg){if(p[0]>0&&p[0]<120&&p[1]>-380&&p[1]<-260){hit=true;break}}if(hit){inWin++;if(st.bandJoin==='round')inWinRound++}}
console.log('lollipop-window tiles:',inWin,' of which round:',inWinRound)
