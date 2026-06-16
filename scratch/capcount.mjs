import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const cw=d.curbWidth??6
const tg=buildTileGround(r,{stencil:clip,curbWidth:cw,smooth:d.streetSmooth??0.5,blockLandUse:d.blockLandUse,emitArtifact:true})
const a=tg._shapeArtifact||[]
let clamped=0;for(const st of a){const WB=cw+st.tl+st.sw;if(st.cap<WB-1e-6)clamped++}
console.log('tiles',a.length,'clamped (cap<WB → thin features the guard bites)',clamped)
